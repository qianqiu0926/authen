import { routeMaterial, readSharedPage, sharePreview } from "./intake";
import { createWorker } from "tesseract.js";
import type { Material, Line, Report, Verdict } from "./types";
import { review } from "./review";
const check = (signal: AbortSignal) => {
  if (signal.aborted) throw new DOMException("已取消", "AbortError");
};
export function dataURL(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(Error("文件没能打开。"));
    r.readAsDataURL(file);
  });
}
export function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const im = new Image();
    im.onload = () => resolve(im);
    im.onerror = () => reject(Error("图片格式暂时读不了。"));
    im.src = src;
  });
}
export async function normalize(file: File) {
  if (file.size > 10_000_000) throw Error("每张图片需要小于10MB。");
  const im = await loadImage(await dataURL(file));
  const scale = Math.min(1, 1800 / Math.max(im.width, im.height));
  const canvas = document.createElement("canvas");
  canvas.width = im.width * scale;
  canvas.height = im.height * scale;
  canvas.getContext("2d")!.drawImage(im, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", 0.85);
}
async function frames(
  blob: Blob,
  signal: AbortSignal,
): Promise<{ src: string; seconds: number }[]> {
  const v = document.createElement("video"),
    url = URL.createObjectURL(blob);
  v.preload = "auto";
  v.muted = true;
  v.src = url;
  const wait = (event: string) =>
    new Promise<void>((resolve, reject) => {
      const finish = (error?: Error) => {
        clearTimeout(timer);
        v.removeEventListener(event, ok);
        v.removeEventListener("error", bad);
        signal.removeEventListener("abort", abort);
        error ? reject(error) : resolve();
      };
      const ok = () => finish(),
        bad = () => finish(Error("这段视频暂时读不了，换成MP4试试。")),
        abort = () => finish(new DOMException("已取消", "AbortError"));
      const timer = setTimeout(
        () => finish(Error("视频读取超时，换一小段试试。")),
        12000,
      );
      v.addEventListener(event, ok, { once: true });
      v.addEventListener("error", bad, { once: true });
      signal.addEventListener("abort", abort, { once: true });
    });
  try {
    if (v.readyState < 1) await wait("loadedmetadata");
    check(signal);
    if (!Number.isFinite(v.duration) || v.duration > 60 || v.duration <= 0)
      throw Error("先截取60秒以内的片段。");
    const count = Math.min(8, Math.max(2, Math.floor(v.duration / 5) + 1));
    const result = [];
    const canvas = document.createElement("canvas"),
      scale = Math.min(1, 1200 / Math.max(v.videoWidth, v.videoHeight));
    canvas.width = v.videoWidth * scale;
    canvas.height = v.videoHeight * scale;
    for (let i = 0; i < count; i++) {
      check(signal);
      const sec = Math.min(
        v.duration - 0.05,
        Math.max(0.01, (i * v.duration) / count),
      );
      const ready = wait("seeked");
      v.currentTime = sec;
      await ready;
      canvas.getContext("2d")!.drawImage(v, 0, 0, canvas.width, canvas.height);
      result.push({ src: canvas.toDataURL("image/jpeg", 0.82), seconds: sec });
    }
    return result;
  } finally {
    v.removeAttribute("src");
    v.load();
    URL.revokeObjectURL(url);
  }
}
export async function analyze(
  m: Material,
  signal: AbortSignal,
  stage: (s: string) => void,
  options: { aiEnabled?: boolean; videoSpeech?: boolean } = {},
): Promise<Report> {
  m = routeMaterial(m);
  stage("看看内容");
  let text = m.text,
    lines: Line[] = [],
    images = [...m.images],
    seconds: (number | undefined)[] = images.map(() => undefined),
    scope = "已检查提交的文字；还需要商品资料才能核对具体功效。";
  check(signal);
  if (m.sample) return review(m, text, [], scope, images);
  if (m.skipLink && m.shareOnly) {
    const preview = sharePreview(m.text);
    if (!preview) throw Error("补上正文或截图，再继续看吧。");
    text = "用户粘贴的分享文案（不是读取的商品详情或原帖）：" + preview.text;
    const limitations = ["只分析你粘贴的分享文案，商品详情或原帖没有读到。", "没有读取原链接的图片、评论、视频或声音。"];
    m = {...m,page:{url:preview.url,title:preview.title,platform:preview.platform,author:preview.author,contentType:preview.contentType,coverage:{text:false,reviews:0,images:0,shareOnly:true},limitations}};
    scope = "仅有用户粘贴的分享文案，原网页未读取。不能判断商品真伪、店铺身份、真实成交价、评价或视频内容；可说明文案中的承诺还要看什么。";
  }
  if (m.url) {
    stage("读正文、配图，也看看评论区");
    const data = await readSharedPage(m.url, signal);
    const question = m.text.replace(/https?:\/\/[^\s<>]+/gi, "").trim().slice(0,500);
    text = [question ? "用户补充：" + question : "", data.text]
      .filter(Boolean)
      .join("\n")
      .slice(0, 14500);
    const source = {
      url: data.url,
      title: data.title,
      platform: data.platform,
      author: data.author,
      contentType: data.contentType,
      coverage: data.coverage,
      limitations: data.limitations,
      reviews: data.reviews || [],
      commentAnalysis: data.commentAnalysis,
    };
    m = { ...m, page: source, url: data.url };
    for (const image of data.images || []) {
      if (images.length >= 5) break;
      try {
        const response = await fetch(image.dataURL);
        images.push(
          await normalize(
            new File([await response.blob()], "link-image", {
              type: response.headers.get("content-type") || "image/jpeg",
            }),
          ),
        );
      } catch {
        source.limitations.push("有配图无法打开，可以再补一张截图。");
      }
    }
    source.coverage.images = images.length - m.images.length;
    seconds = images.map(() => undefined);
    scope = `读取了${data.platform}页面的${data.coverage.excerptOnly ? "公开简介" : data.coverage.text ? "正文" : "标题"}、${data.coverage.reviews}条公开评价和${source.coverage.images}张配图。${source.limitations.join(" ")}`;
  }
  if (m.video) {
    const read = await frames(m.video, signal);
    const kept = images.slice(0, 3);
    images = [...kept, ...read.slice(0, 8 - kept.length).map((f) => f.src)];
    seconds = [
      ...kept.map(() => undefined),
      ...read.slice(0, 8 - kept.length).map((f) => f.seconds),
    ];
    scope = `${m.page ? scope + " " : ""}已查看${read.slice(0, 8 - kept.length).length}个关键画面和可读字幕；未读取声音，也未检查每一帧。`;
  }
  if (m.audio) {
    stage("正在听这段声音");
    if (m.audio.size > 12_000_000) throw Error("音频请控制在12MB以内。");
    const response = await fetch("/authen/api/transcribe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        audioBase64: (await dataURL(m.audio)).split(",")[1],
      }),
      signal,
    });
    const result = await response.json();
    if (!response.ok) throw Error(result.error || "音频暂时读不了。");
    text += "\n" + result.text;
    lines.push(
      ...result.segments.map((s: { text: string; start: number }) => ({
        text: s.text,
        seconds: s.start,
      })),
    );
    scope =
      (m.page ? scope + " " : "") +
      "已把音频转成文字，核对其中的说法；尚未判断声音是否合成。";
  }
  if (m.video && options.videoSpeech) {
    try {
      stage("听听视频里的话");
      const audio = await videoAudio(m.video);
      check(signal);
      const response = await fetch("/authen/api/transcribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          audioBase64: (await dataURL(audio)).split(",")[1],
        }),
        signal,
      });
      const result = await response.json();
      if (!response.ok) throw Error();
      text += "\n" + result.text;
      lines.push(
        ...result.segments.map((s: { text: string; start: number }) => ({
          text: s.text,
          seconds: s.start,
        })),
      );
      scope += " 已额外转写视频口播，转写可能有错字。";
    } catch {
      check(signal);
      scope += " 这次没能读到口播，可单独上传音频。";
    }
  }
  if (m.images.length && !m.url && !m.video && !m.audio)
    scope =
      "已读取图片文字并检查其中的说法；是否经过AI修改，还需要进一步证据。";
  if (images.length) {
    stage("读读文字");
    const worker = await createWorker("chi_sim+eng", 1, {
      workerPath: "/authen/ocr/worker.min.js",
      corePath: "/authen/ocr",
      langPath: "/authen/ocr",
      gzip: true,
      logger: () => {},
    });
    const abort = () => {
      void worker.terminate();
    };
    signal.addEventListener("abort", abort, { once: true });
    try {
      check(signal);
      for (let i = 0; i < images.length; i++) {
        check(signal);
        stage(`看看第${i + 1}张`);
        const { data } = await worker.recognize(
          images[i],
          {},
          { text: true, blocks: true },
        );
        check(signal);
        text += "\n" + data.text;
        const im = await loadImage(images[i]);
        for (const block of data.blocks || [])
          for (const p of block.paragraphs)
            for (const l of p.lines)
              lines.push({
                text: l.text,
                box: [
                  l.bbox.x0 / im.width,
                  l.bbox.y0 / im.height,
                  (l.bbox.x1 - l.bbox.x0) / im.width,
                  (l.bbox.y1 - l.bbox.y0) / im.height,
                ],
                imageIndex: i,
                seconds: seconds[i],
              });
      }
    } finally {
      signal.removeEventListener("abort", abort);
      await worker.terminate().catch(() => {});
    }
  }
  check(signal);
  stage("识别内容类型，看看哪里对不上");
  text = text.trim().slice(0, 16000);
  lines = lines
    .filter((l) => l.text.length <= 2000 && text.includes(l.text.trim()))
    .slice(0, 300);
  if (m.skipLink && m.linkUnavailable) scope = "原链接未能读取；本次仅检查用户补充的文字或附件，不代表原帖全文。 " + scope;
  scope = scope.slice(0, 990);
  const local = {
    ...review(m, text, lines, scope, images),
    page: m.page,
    contentType: m.page?.contentType,
    linkUnavailable: m.skipLink ? m.linkUnavailable : undefined,
    sourceURL: m.url || m.linkUnavailable?.url,
  };
  if (
    options.aiEnabled === false ||
    (options.aiEnabled === undefined &&
      localStorage.getItem("authen-ai") === "off")
  )
    return { ...local, analysisLabel: "未使用 AI，只找了常见夸大说法" };
  try {
    const response = await fetch("/authen/api/review", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        audience: m.audience,
        kind: m.kind,
        text: text.trim(),
        lines: lines.slice(0, 300),
        scope,
        shareOnly: m.page?.coverage.shareOnly === true,
        comments: m.page?.coverage.shareOnly ? [] : m.page?.reviews || [],
        images: images.slice(0, 8),
      }),
      signal,
    });
    const result = await response.json();
    check(signal);
    if (!response.ok)
      throw Error(
        typeof result.error === "string" ? result.error : "AI分析暂不可用。",
      );
    if (
      !["flagged", "supported", "unclear"].includes(result.verdict) ||
      !Array.isArray(result.evidence) ||
      typeof result.summary !== "string" ||
      typeof result.scope !== "string"
    )
      throw Error("AI返回内容不完整。");
    return {
      ...local,
      verdict: result.verdict,
      summary: result.summary,
      next: result.next,
      evidence: result.evidence,
      scope: result.scope,
      references: result.references,
      numbers: result.numbers,
      tips: result.tips,
      answerKind: result.answerKind,
      contentType: result.contentType,
      presentation: result.presentation,
      analysisLabel: result.analysisLabel || "多个角度核对过",
    };
  } catch (error) {
    check(signal);
    return {
      ...local,
      analysisLabel: "只做了本机初查",
      scope:
        local.scope +
        " 在线分析这次没完成：" +
        (error instanceof Error ? error.message : "服务暂时不可用。"),
    };
  }
}
export async function sample(verdict: Verdict): Promise<Material> {
  const canvas = document.createElement("canvas");
  canvas.width = 680;
  canvas.height = 880;
  const c = canvas.getContext("2d")!;
  c.fillStyle = "#fffcf7";
  c.fillRect(0, 0, 680, 880);
  c.fillStyle = "#8b8179";
  c.font = "22px sans-serif";
  c.fillText("AUTHEN · 示例笔记", 48, 62);
  c.fillStyle = "#191817";
  c.font = "48px sans-serif";
  const text =
    verdict === "flagged"
      ? "这款保湿乳，7天变白！100%无刺激。"
      : verdict === "supported"
        ? "这瓶保湿乳含甘油，帮助保湿。"
        : "这个真的好用吗？";
  c.fillText(
    verdict === "flagged"
      ? "7天变白！"
      : verdict === "supported"
        ? "含甘油，"
        : "这个真的好用吗？",
    48,
    210,
  );
  if (verdict !== "unclear")
    c.fillText(verdict === "flagged" ? "100%无刺激。" : "帮助保湿。", 48, 302);
  c.fillStyle = "#eedfd6";
  c.fillRect(42, 356, 596, 420);
  c.font = "18px sans-serif";
  c.fillStyle = "#8b8179";
  c.fillText("演示素材", 526, 388);
  const im = await loadImage(
    `/authen/art/${verdict === "unclear" ? "perfume" : "compact"}.png`,
  );
  const ratio = Math.min(410 / im.width, 340 / im.height);
  if (verdict === "unclear") c.filter = "blur(18px)";
  c.drawImage(
    im,
    340 - (im.width * ratio) / 2,
    393,
    im.width * ratio,
    im.height * ratio,
  );
  c.filter = "none";
  c.font = "22px sans-serif";
  c.fillStyle = "#8b8179";
  c.fillText("♡ 23                                       ↗", 48, 834);
  return {
    kind: "image",
    text,
    images: [canvas.toDataURL("image/jpeg", 0.85)],
    sample: verdict,
  };
}

async function videoAudio(blob: Blob): Promise<Blob> {
  const context = new AudioContext();
  let decoded: AudioBuffer;
  try {
    decoded = await context.decodeAudioData(await blob.arrayBuffer());
  } finally {
    await context.close();
  }
  if (decoded.duration > 61) throw Error("先截取60秒以内的视频。");
  const render = new OfflineAudioContext(
      1,
      Math.ceil(decoded.duration * 16000),
      16000,
    ),
    source = render.createBufferSource();
  source.buffer = decoded;
  source.connect(render.destination);
  source.start();
  const mono = (await render.startRendering()).getChannelData(0);
  const bytes = new ArrayBuffer(44 + mono.length * 2),
    view = new DataView(bytes);
  const word = (offset: number, s: string) => {
    for (let i = 0; i < s.length; i++)
      view.setUint8(offset + i, s.charCodeAt(i));
  };
  word(0, "RIFF");
  view.setUint32(4, 36 + mono.length * 2, true);
  word(8, "WAVE");
  word(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, 16000, true);
  view.setUint32(28, 32000, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  word(36, "data");
  view.setUint32(40, mono.length * 2, true);
  for (let i = 0; i < mono.length; i++)
    view.setInt16(44 + i * 2, Math.max(-1, Math.min(1, mono[i])) * 32767, true);
  return new Blob([bytes], { type: "audio/wav" });
}
