#!/usr/bin/env python3
"""AUTHEN 图像取证服务。

做的是真算法，不是规则表：
- ELA       错误级别分析，找局部重新压缩差异
- spectral  频域分析，找生成模型上采样留下的周期峰
- npr       邻域像素关系，看固定节距的相邻像素结构（只作辅助信号）
- noise     噪声与纹理的一致性回归，找局部磨皮或拼接
- copy_move ORB + RANSAC，找同图复制粘贴
- metadata  EXIF / 编辑软件 / C2PA 来源记录

原则：
1. 只输出 strong / medium / weak / none 和坐标，不输出概率。
2. 对纯色、插画、截图先做适用性判定，照片类检测不适用就不硬算。
3. 所有信号都允许被普通原因解释；单一信号不足以定性。
4. 未安装的模型明确报 not_installed，不假装跑过。

用法：python forensics.py --json /path/to/image.jpg
      python forensics.py --self-test
"""

import argparse
import io
import json
import math
import os
import sys
import time

import numpy as np

try:
    from PIL import Image, ExifTags
    PIL_OK = True
except Exception:
    PIL_OK = False

try:
    import cv2
    CV2_OK = True
except Exception:
    CV2_OK = False

MAX_SIDE = 1400


def load_image(path):
    img = Image.open(path)
    img.load()
    fmt = (img.format or "").upper()
    raw = open(path, "rb").read()
    rgb = img.convert("RGB")
    w, h = rgb.size
    scale = 1.0
    if max(w, h) > MAX_SIDE:
        scale = MAX_SIDE / max(w, h)
        rgb = rgb.resize((int(w * scale), int(h * scale)), Image.LANCZOS)
    return rgb, np.asarray(rgb), fmt, (w, h), scale, raw, img


def norm_box(box, size):
    x, y, w, h = box
    W, H = size
    return [round(x / W, 4), round(y / H, 4), round(w / W, 4), round(h / H, 4)]


def largest_cluster(mask, size, min_area=0.004):
    """返回最大连通块与面积占比；用来排除零星噪点。"""
    if not CV2_OK:
        return None, 0.0
    n, labels, stats, _ = cv2.connectedComponentsWithStats(mask.astype(np.uint8), 8)
    H, W = size
    best, best_area = None, 0
    for i in range(1, n):
        x, y, w, h, area = stats[i]
        if area > best_area:
            best, best_area = [x, y, w, h], area
    ratio = best_area / float(H * W)
    if ratio < min_area:
        return None, ratio
    return norm_box(best, (W, H)), ratio


def photo_gate(rgb):
    """判断这张图适不适合用照片类算法。纯色插画、纯截图不该被当成照片判。"""
    if not CV2_OK:
        return {"photo_like": True, "reason": "no_open_cv"}
    small = cv2.resize(rgb, (160, 160), interpolation=cv2.INTER_AREA)
    uniq = len(np.unique(small.reshape(-1, 3), axis=0))
    g = cv2.cvtColor(small, cv2.COLOR_RGB2GRAY)
    gx = cv2.Sobel(g, cv2.CV_32F, 1, 0, ksize=3)
    gy = cv2.Sobel(g, cv2.CV_32F, 0, 1, ksize=3)
    mag = np.hypot(gx, gy)
    edge = float(np.mean(mag > 24))
    flat = float(np.mean(mag < 1.5))
    sat = float(np.mean((small.max(axis=2).astype(int) - small.min(axis=2).astype(int)) > 12))
    photo = uniq > 4000 and edge > 0.02 and flat < 0.72
    reason = "ok" if photo else ("flat_or_illustration" if uniq <= 4000 else "low_detail")
    return {"photo_like": bool(photo), "unique_colors": uniq, "edge_density": round(edge, 3),
            "flat_ratio": round(flat, 3), "color_ratio": round(sat, 3), "reason": reason}


def det_ela(rgb):
    if not PIL_OK:
        return {"status": "unavailable", "level": "none", "note": "缺少 Pillow"}
    try:
        buf = io.BytesIO()
        rgb.save(buf, format="JPEG", quality=90)
        buf.seek(0)
        re = np.asarray(Image.open(buf).convert("RGB"), dtype=np.float32)
        cur = np.asarray(rgb, dtype=np.float32)
        diff = np.abs(cur - re).mean(axis=2)
        if CV2_OK:
            diff = cv2.GaussianBlur(diff, (7, 7), 0)
        H, W = diff.shape
        # 去掉边框，JPEG 边界本身就会偏高
        m = int(min(H, W) * 0.06)
        core = diff[m:H - m, m:W - m]
        med = float(np.median(core))
        p995 = float(np.percentile(core, 99.5))
        ratio = p995 / (med + 0.35)
        thr = max(med * 3.2, p995 * 0.65)
        mask = np.zeros_like(diff, dtype=np.uint8)
        mask[m:H - m, m:W - m] = (core > thr).astype(np.uint8) * 255
        box, area = largest_cluster(mask, (H, W), min_area=0.006)
        if box is None:
            level = "weak" if ratio > 3.0 else "none"
        elif ratio > 6.0 and area > 0.02:
            level = "strong"
        elif ratio > 3.6 and area > 0.008:
            level = "medium"
        else:
            level = "weak" if ratio > 2.4 else "none"
        return {
            "status": "ok", "level": level,
            "regions": [box] if box and level in ("medium", "strong") else [],
            "ratio": round(ratio, 2), "area": round(area, 4),
            "note": "局部误差明显高于整图基线，可能是粘贴、修补或二次保存造成的差异",
        }
    except Exception as e:
        return {"status": "error", "level": "none", "note": f"ELA 失败：{e}"}


def det_spectral(gray):
    """频域周期峰。只看中频段，并要求成对出现，降低纹理误报。"""
    try:
        h, w = gray.shape
        g = gray.astype(np.float32) - float(gray.mean())
        win = np.outer(np.hanning(h), np.hanning(w)).astype(np.float32)
        f = np.abs(np.fft.fftshift(np.fft.fft2(g * win)))
        f = np.log1p(f)
        cy, cx = h // 2, w // 2
        yy, xx = np.mgrid[0:h, 0:w]
        ry = (yy - cy) / h
        rx = (xx - cx) / w
        r = np.sqrt(rx ** 2 + ry ** 2)
        band = (r > 0.06) & (r < 0.42)
        axis = (np.abs(ry) < 0.015) | (np.abs(rx) < 0.015)
        score = np.where(band & ~axis, f, 0.0)
        if not score.any():
            return {"status": "ok", "level": "none", "peaks": [], "note": "没有可用的中频分量"}
        vals = score[band & ~axis]
        base = float(np.median(vals))
        mad = float(np.median(np.abs(vals - base))) + 1e-6
        z = (score - base) / (1.4826 * mad)
        thr = max(8.0, float(np.percentile(z[band & ~axis], 99.7)))
        peaks = z > thr
        if CV2_OK:
            peaks = cv2.dilate(peaks.astype(np.uint8), np.ones((3, 3), np.uint8)).astype(bool)
            n, labels, stats, cents = cv2.connectedComponentsWithStats(peaks.astype(np.uint8), 8)
        else:
            n = 0
        found = []
        if n:
            for i in range(1, n):
                area = stats[i, cv2.CC_STAT_AREA]
                if area < 2 or area > 300:
                    continue
                py, px = cents[i][1], cents[i][0]
                oy, ox = int(round(cy - (py - cy))), int(round(cx - (px - cx)))
                if not (0 <= oy < h and 0 <= ox < w):
                    continue
                if z[oy, ox] > thr * 0.7:
                    found.append({"fx": round(float(rx[int(py), int(px)]), 4),
                                  "fy": round(float(ry[int(py), int(px)]), 4),
                                  "score": round(float(z[int(py), int(px)]), 2)})
            found.sort(key=lambda d: -d["score"])
            found = found[:6]
        pairs = len(found)
        level = "strong" if pairs >= 5 else "medium" if pairs >= 3 else "weak" if pairs >= 1 else "none"
        return {
            "status": "ok", "level": level, "peaks": found, "pair_count": pairs,
            "note": "频域中段出现成对周期峰；生成模型上采样会留下这类痕迹，强压缩和织物纹理也可能",
        }
    except Exception as e:
        return {"status": "error", "level": "none", "note": f"频域分析失败：{e}"}


def det_npr(gray):
    """邻域像素关系，只作辅助：看相邻像素差的固定节距。最多给 weak。"""
    try:
        g = gray.astype(np.float32)
        dx = np.abs(np.diff(g, axis=1))
        dy = np.abs(np.diff(g, axis=0))
        d = dx[:-1, :] + dy[:, :-1]
        d = d - d.mean()
        F = np.fft.fft2(d)
        ac = np.fft.ifft2(F * np.conj(F)).real
        ac = ac / (abs(ac[0, 0]) + 1e-6)
        lags = [(2, 0), (0, 2), (4, 0), (0, 4), (2, 2), (3, 0), (0, 3)]
        hits = [(a, b, float(ac[a, b])) for a, b in lags if ac[a, b] > 0.22]
        level = "weak" if hits else "none"
        return {
            "status": "ok", "level": level,
            "lags": [{"dx": a, "dy": b, "v": round(v, 3)} for a, b, v in hits],
            "note": "相邻像素差出现固定节距，可能是重采样；单凭这个不说明问题",
        }
    except Exception as e:
        return {"status": "error", "level": "none", "note": f"NPR 失败：{e}"}


def det_noise(gray):
    """噪声与纹理的回归残差：正常照片两者同步，磨皮或拼接会让某块明显偏离。"""
    try:
        if not CV2_OK:
            return {"status": "unavailable", "level": "none", "note": "缺少 OpenCV"}
        med = cv2.medianBlur(gray, 5)
        res = gray.astype(np.float32) - med.astype(np.float32)
        gx = cv2.Sobel(gray, cv2.CV_32F, 1, 0, ksize=3)
        gy = cv2.Sobel(gray, cv2.CV_32F, 0, 1, ksize=3)
        grad = np.hypot(gx, gy)
        h, w = gray.shape
        bs = 24
        blocks = []
        for y in range(0, h - bs + 1, bs):
            for x in range(0, w - bs + 1, bs):
                n = float(res[y:y + bs, x:x + bs].std())
                gg = float(grad[y:y + bs, x:x + bs].mean())
                blocks.append((n, gg, x, y))
        if len(blocks) < 30:
            return {"status": "ok", "level": "none", "note": "画面太小，区块不够"}
        arr = np.array([[b[0], b[1]] for b in blocks])
        # 只用有明显纹理的块拟合斜率，纯色块没有参考意义
        mask_g = arr[:, 1] > 6
        if mask_g.sum() < 20:
            return {"status": "ok", "level": "none", "note": "画面细节太少，噪声无法比较"}
        slope = float(np.median(arr[mask_g, 0] / (arr[mask_g, 1] + 1e-3)))
        pred = slope * arr[:, 1] + 0.4
        ratio = arr[:, 0] / (pred + 1e-3)
        flags = np.zeros((h, w), dtype=np.uint8)
        hot = 0
        for (n, gg, x, y), rr in zip(blocks, ratio):
            if gg < 6:
                continue
            if rr < 0.45 or rr > 2.8:
                flags[y:y + bs, x:x + bs] = 255
                hot += 1
        box, area = largest_cluster(flags, (h, w), min_area=0.005)
        if box is None:
            level = "weak" if hot / max(1, len(blocks)) > 0.03 else "none"
            area = 0.0
        else:
            level = "strong" if area > 0.06 else "medium" if area > 0.015 else "weak"
        return {
            "status": "ok", "level": level,
            "regions": [box] if box and level in ("medium", "strong") else [],
            "area": round(area, 4), "hot_ratio": round(hot / max(1, len(blocks)), 4),
            "note": "某块噪声与它的纹理程度不匹配，可能是局部磨皮或拼接；重压缩也会干扰",
        }
    except Exception as e:
        return {"status": "error", "level": "none", "note": f"噪声分析失败：{e}"}


def det_copy_move(gray):
    """同图复制粘贴：ORB 关键点 + 比值检验 + RANSAC。"""
    try:
        if not CV2_OK:
            return {"status": "unavailable", "level": "none", "note": "缺少 OpenCV"}
        h, w = gray.shape
        orb = cv2.ORB_create(nfeatures=4000, fastThreshold=10)
        kp, des = orb.detectAndCompute(gray, None)
        if des is None or len(kp) < 30:
            return {"status": "ok", "level": "none", "pairs": [], "note": "可匹配的特征点太少"}
        bf = cv2.BFMatcher(cv2.NORM_HAMMING, crossCheck=False)
        # 自匹配时最近的永远是它自己，必须先剔掉，再找「另一处」的对应点。
        knn = bf.knnMatch(des, des, k=8)
        min_dist = max(16, int(min(h, w) * 0.05))
        pts = []
        for group in knn:
            cands = [m for m in group if m.trainIdx != m.queryIdx]
            if len(cands) < 2:
                continue
            best, second = cands[0], cands[1]
            if best.distance > 42:
                continue
            if best.distance > 0.82 * second.distance:
                continue
            p1, p2 = kp[best.queryIdx].pt, kp[best.trainIdx].pt
            if math.hypot(p1[0] - p2[0], p1[1] - p2[1]) < min_dist:
                continue
            pts.append((p1, p2))
        if len(pts) < 10:
            return {"status": "ok", "level": "none", "pairs": [], "note": "没有发现远距离的成对特征点"}
        src = np.float32([p[0] for p in pts]).reshape(-1, 1, 2)
        dst = np.float32([p[1] for p in pts]).reshape(-1, 1, 2)
        M, inliers = cv2.estimateAffinePartial2D(src, dst, method=cv2.RANSAC, ransacReprojThreshold=2.5)
        if M is None or inliers is None:
            return {"status": "ok", "level": "none", "pairs": [], "note": "匹配点没有形成一致位移"}
        inl = int(inliers.sum())
        if inl < 10:
            return {"status": "ok", "level": "none", "pairs": [], "note": f"一致位移的证据不足（内点 {inl}）"}
        dx, dy = float(M[0, 2]), float(M[1, 2])
        scale = math.hypot(M[0, 0], M[1, 0])
        if math.hypot(dx, dy) < min(h, w) * 0.04:
            return {"status": "ok", "level": "none", "pairs": [], "note": "位移太近，更像纹理重复"}
        if abs(scale - 1.0) > 0.15:
            return {"status": "ok", "level": "none", "pairs": [], "note": "位移伴随明显缩放，可能是透视或重复图案"}
        good = [pts[i] for i in np.where(inliers.ravel() > 0)[0]]

        def bbox(ps):
            xs = [p[0] for p in ps]; ys = [p[1] for p in ps]
            return [min(xs), min(ys), max(xs) - min(xs) + 1, max(ys) - min(ys) + 1]

        a, b = bbox([p[0] for p in good]), bbox([p[1] for p in good])
        if min(a[2], a[3], b[2], b[3]) < 14:
            return {"status": "ok", "level": "none", "pairs": [], "note": "匹配区域太小"}
        level = "strong" if inl >= 22 else "medium" if inl >= 14 else "weak"
        return {
            "status": "ok", "level": level,
            "pairs": [{"a": norm_box(a, (w, h)), "b": norm_box(b, (w, h)),
                       "shift": [round(dx / w, 4), round(dy / h, 4)], "inliers": inl}],
            "note": "同图两块内容高度吻合，可能是复制粘贴；重复纹理或平铺图案也可能造成",
        }
    except Exception as e:
        return {"status": "error", "level": "none", "note": f"复制粘贴检测失败：{e}"}


def det_metadata(img, raw, fmt):
    try:
        info = {}
        if PIL_OK:
            ex = img.getexif()
            tags = {ExifTags.TAGS.get(k, str(k)): v for k, v in ex.items()}
            for key in ("Make", "Model", "Software", "DateTime", "Artist"):
                if key in tags and isinstance(tags[key], (str, int)):
                    info[key] = str(tags[key])[:120]
        low = raw[:2_000_000]
        c2pa = any(sig in low for sig in (b"c2pa", b"jumbf", b"ContentCredentials", b"contentauth"))
        software = info.get("Software", "")
        edit_hint = bool(software and any(k in software.lower() for k in (
            "photoshop", "lightroom", "meitu", "美图", "snapseed", "picsart", "facetune",
            "snow", "轻颜", "剪映", "canva", "affinity", "pixelmator", "gimp", "vsco")))
        camera = bool(info.get("Make") or info.get("Model"))
        level = "weak" if edit_hint else "none"
        return {
            "status": "ok", "level": level, "exif": info, "software": software or None,
            "camera": camera, "c2pa": c2pa, "format": fmt,
            "note": ("有编辑软件记录：" + software) if edit_hint
            else ("有相机信息，来源相对完整" if camera
                  else "没有相机或来源记录；截图、转发、二次保存都会丢元数据，不能据此判假"),
        }
    except Exception as e:
        return {"status": "error", "level": "none", "note": f"元数据读取失败：{e}"}


def optional_ufd(path):
    """UniversalFakeDetect（OpenAI CLIP ViT-L/14 + 线性头）可选适配器。"""
    repo = os.environ.get("AUTHEN_UFD_DIR", "")
    if not repo:
        return {"status": "not_installed", "level": "none", "note": "未配置 AUTHEN_UFD_DIR，AI 生图专用检测器未启用"}
    weight = os.path.join(repo, os.environ.get("AUTHEN_UFD_WEIGHT", "weights/ufd_vitl14.pth"))
    if not os.path.exists(weight):
        return {"status": "not_installed", "level": "none", "note": "缺少 UniversalFakeDetect 权重"}
    try:
        import torch
        import open_clip
    except Exception:
        return {"status": "not_installed", "level": "none", "note": "缺少 torch / open_clip"}
    try:
        device = "mps" if getattr(torch.backends, "mps", None) and torch.backends.mps.is_available() else "cpu"
        model, _, preprocess = open_clip.create_model_and_transforms("ViT-L-14", pretrained="openai")
        model = model.to(device).eval()
        head = torch.load(weight, map_location=device)
        img = preprocess(Image.open(path).convert("RGB")).unsqueeze(0).to(device)
        with torch.no_grad():
            feat = model.encode_image(img).float()
            feat = feat / feat.norm(dim=-1, keepdim=True)
            out = head(feat)
            val = float(out.sigmoid().max() if out.numel() == 1 else out.softmax(-1)[0, 1])
        level = "strong" if val > 0.9 else "medium" if val > 0.7 else "weak" if val > 0.5 else "none"
        return {"status": "ok", "level": level,
                "note": "生成图专用检测器给出了生成痕迹" if level != "none" else "生成图专用检测器没有给出明显痕迹"}
    except Exception as e:
        return {"status": "error", "level": "none", "note": f"UFD 运行失败：{e}"}


def analyze(path, limit_seconds=25.0):
    t0 = time.time()
    if not PIL_OK:
        return {"ok": False, "error": "缺少 Pillow"}
    try:
        rgb, arr, fmt, size, scale, raw, img = load_image(path)
    except Exception as e:
        return {"ok": False, "error": f"图片无法读取：{e}"}
    gray = np.asarray(rgb.convert("L"), dtype=np.uint8)
    gate = photo_gate(np.ascontiguousarray(arr))
    W, H = size
    det = {}
    # 复制粘贴与元数据在任何画面上都成立；ELA/频域/噪声只对照片可靠。
    for name, fn in (
        ("ela", lambda: det_ela(rgb)),
        ("spectral", lambda: det_spectral(gray)),
        ("npr", lambda: det_npr(gray)),
        ("noise", lambda: det_noise(gray)),
        ("copy_move", lambda: det_copy_move(gray)),
    ):
        if time.time() - t0 > limit_seconds:
            det[name] = {"status": "skipped", "level": "none", "note": "超出时间预算"}
            continue
        if name in ("ela", "spectral", "npr", "noise") and not gate["photo_like"]:
            det[name] = {"status": "not_applicable", "level": "none",
                         "note": "照片类检测不适用：画面更像纯色、线条或界面"}
            continue
        det[name] = fn()
    det["metadata"] = det_metadata(img, raw, fmt)
    det["ufd"] = optional_ufd(path)

    # 分级：只有复制粘贴和专用生成图模型算硬信号，可以单独成立；
    # ELA/频域/噪声是软信号，必须两项以上互相支持才算 medium。
    hard = [k for k in ("copy_move", "ufd") if det[k].get("level") in ("strong", "medium")]
    soft = [k for k in ("ela", "spectral", "noise") if det[k].get("level") in ("strong", "medium")]
    weak = [k for k, v in det.items() if v.get("level") == "weak"]
    if hard:
        overall = "strong" if any(det[k].get("level") == "strong" for k in hard) else "medium"
    elif len(soft) >= 2:
        overall = "medium"
    elif len(soft) == 1:
        overall = "weak"
    else:
        overall = "none"
    primary = hard + soft
    provenance = bool(det["metadata"].get("c2pa") or det["metadata"].get("camera")) and not det["metadata"].get("software")

    return {
        "ok": True, "width": W, "height": H, "format": fmt,
        "scale": round(scale, 4), "elapsed_ms": int((time.time() - t0) * 1000),
        "photo_like": gate["photo_like"], "gate": gate,
        "overall": overall, "primary_signals": primary,
        "strong": [k for k in primary if det[k].get("level") == "strong"],
        "weak": weak, "provenance": provenance, "detectors": det,
    }


def self_test():
    def has(name):
        try:
            __import__(name)
            return True
        except Exception:
            return False
    return {"pillow": PIL_OK, "opencv": CV2_OK, "torch": has("torch"),
            "open_clip": has("open_clip"), "ufd_dir": os.environ.get("AUTHEN_UFD_DIR", "")}


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--json", dest="path")
    ap.add_argument("--self-test", action="store_true")
    ap.add_argument("--limit", type=float, default=25.0)
    a = ap.parse_args()
    if a.self_test:
        print(json.dumps(self_test(), ensure_ascii=False))
        sys.exit(0)
    if not a.path:
        print(json.dumps({"ok": False, "error": "缺少 --json 图片路径"}, ensure_ascii=False))
        sys.exit(2)
    print(json.dumps(analyze(a.path, a.limit), ensure_ascii=False))
