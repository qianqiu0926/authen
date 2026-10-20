import ProductCard from "./ProductCard";
import {reportProducts} from "../../products.mjs";
import { useEffect, useRef, useState } from "react";
import {
  ArrowUpRight,
  Bookmark,
  Camera,
  Check,
  ChevronRight,
  Download,
  Heart,
  ImagePlus,
  Link,
  Mic,
  Plus,
  Share2,
  Square,
  Trash2,
  X,
} from "lucide-react";
import { normalize, sample } from "../media";
import { reportFile } from "../storage";
import type { Kind, Material, Report, Verdict } from "../types";
import { useApp } from "./store";
import { art, Empty, Icon, Pill, Primary, Sheet } from "./ui";
import { entries, PostArt } from "./pages";
import type { Post } from "./model";
import { contentLabels, contentFocus } from "../intake";
import CommentCard from "./CommentCard";
const safeURL = (s?: string) => (s && /^https?:\/\//i.test(s) ? s : undefined);
function useMediaURL(blob?: Blob) {
  const [url, setURL] = useState("");
  useEffect(() => {
    if (!blob) {
      setURL("");
      return;
    }
    const u = URL.createObjectURL(blob);
    setURL(u);
    return () => URL.revokeObjectURL(u);
  }, [blob]);
  return url;
}
export function Intake({ kind }: { kind: Kind }) {
  const app = useApp(),
    [text, setText] = useState(
      kind === "link" ? app.incoming.current?.url || "" : "",
    ),
    [images, setImages] = useState<string[]>([]),
    [media, setMedia] = useState<File | null>(null),
    [error, setError] = useState(""),
    [reading, setReading] = useState(false),
    [recording, setRecording] = useState(false),
    [seconds, setSeconds] = useState(0);
  const input = useRef<HTMLInputElement>(null),
    camera = useRef<HTMLInputElement>(null),
    recorder = useRef<MediaRecorder | null>(null),
    stream = useRef<MediaStream | null>(null),
    alive = useRef(true);
  const mediaURL = useMediaURL(media || undefined),
    entry = entries.find((e) => e.kind === (kind === 'comments' ? 'link' : kind))!;
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      if (recorder.current?.state === "recording") recorder.current.stop();
      stream.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);
  useEffect(() => {
    if (!recording) return;
    const timer = setInterval(
      () =>
        setSeconds((s) => {
          if (s >= 59) recorder.current?.stop();
          return s + 1;
        }),
      1000,
    );
    return () => clearInterval(timer);
  }, [recording]);
  const choose = async (files: FileList | null) => {
    if (!files?.length) return;
    setReading(true);
    setError("");
    try {
      if (kind === "image") {
        if (images.length + files.length > 5)
          throw Error("一次最多选5张图片。");
        setImages([
          ...images,
          ...(await Promise.all(Array.from(files).map(normalize))),
        ]);
      } else {
        const f = files[0];
        if (f.size > (kind === "audio" ? 12_000_000 : 50_000_000))
          throw Error(
            kind === "audio"
              ? "音频请控制在12MB以内。"
              : "视频请控制在50MB以内。",
          );
        setMedia(f);
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setReading(false);
    }
  };
  const record = async () => {
    setError("");
    if (recording) {
      recorder.current?.stop();
      return;
    }
    try {
      if (!navigator.mediaDevices?.getUserMedia)
        throw Error("请通过 HTTPS 打开页面后录音，也可以上传音频。");
      const s = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (!alive.current) {
        s.getTracks().forEach((t) => t.stop());
        return;
      }
      stream.current = s;
      const mime = ["audio/webm;codecs=opus", "audio/mp4"].find((m) =>
        MediaRecorder.isTypeSupported(m),
      );
      const r = new MediaRecorder(s, mime ? { mimeType: mime } : undefined);
      recorder.current = r;
      const chunks: Blob[] = [];
      r.ondataavailable = (e) => {
        if (e.data.size) chunks.push(e.data);
      };
      r.onstop = () => {
        s.getTracks().forEach((t) => t.stop());
        if (alive.current) {
          setRecording(false);
          setMedia(
            new File(
              chunks,
              "我的录音." + (r.mimeType.includes("mp4") ? "m4a" : "webm"),
              { type: r.mimeType },
            ),
          );
        }
      };
      r.start();
      setSeconds(0);
      setRecording(true);
    } catch (e) {
      setError(
        (e as Error).message.includes("Permission")
          ? "还没有麦克风权限，可以上传一段录音。"
          : (e as Error).message,
      );
    }
  };
  const accept = () => {
    setError("");
    try {
      let m: Material = {
        kind,
        text: text.trim(),
        images,
        audience: "consumer",
      };
      if (kind === "link") {
        const found = text
          .match(/https?:\/\/[^\s<>]+/i)?.[0]
          ?.replace(/[，。；）】]+$/g, "");
        if (!found) throw Error("还没找到完整网址，重新粘贴一下。");
        m.url = new URL(found).href;
        m.text = "";
      }
      if (kind === "video" || kind === "audio") {
        if (!media)
          throw Error(
            "先选择一段" + (kind === "audio" ? "音频" : "视频") + "。",
          );
        if (kind === "video") m.video = media;
        else m.audio = media;
      }
      if (kind === "image" && !images.length) throw Error("先放一张图片。");
      if ((kind === "text" || kind === "comments") && !text.trim())
        throw Error("先写下想查的内容。");
      void app.start(m);
    } catch (e) {
      setError((e as Error).message);
    }
  };
  return (
    <Sheet
      title={
        kind === "link"
          ? "把链接给我"
          : kind === "text"
            ? "想查哪句话？"
            : kind === "comments"
              ? "看看评论区"
              : "选一份" +
                (kind === "audio" ? "音频" : kind === "video" ? "视频" : "图片")
      }
    >
      <div className="sheet-content intake">
        <div className="intake-heading">
          <div>
            <h2>{entry.name}</h2>
            <p>
              {kind === "image"
                ? "截图、长图都可以 · 最多5张"
                : kind === "video"
                  ? "60秒以内 · 不超过50MB"
                  : kind === "audio"
                    ? "录一段，或选一份音频 · 60秒以内"
                    : kind === "comments"
                      ? "每条评论换一行，方便一起看"
                      : kind === "link"
                        ? "粘贴分享内容里的完整链接"
                        : "笔记、商品说法，都可以发来"}
            </p>
          </div>
          <Icon name={entry.icon} size={66} />
        </div>
        {app.supplement && (
          <p className="supplement-note">
            会和上一份内容一起看{" "}
            <button onClick={() => app.setSupplement(null)}>取消补充</button>
          </p>
        )}
        {["image", "video", "audio"].includes(kind) && (
          <>
            <button
              className="upload-area"
              disabled={reading || recording}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                void choose(e.dataTransfer.files);
              }}
              onClick={() => input.current?.click()}
            >
              <ImagePlus size={30} />
              <b>
                {reading
                  ? "正在读取…"
                  : media
                    ? media.name
                    : images.length
                      ? "再加一张"
                      : "点一下，选择" +
                        (kind === "audio"
                          ? "音频"
                          : kind === "video"
                            ? "视频"
                            : "图片")}
              </b>
              <small>也可以把文件拖到这里</small>
            </button>
            <input
              hidden
              ref={input}
              type="file"
              accept={`${kind}/*`}
              multiple={kind === "image"}
              onChange={(e) => {
                void choose(e.target.files);
                e.target.value = "";
              }}
            />
            {kind === "image" && (
              <>
                <button
                  className="text-button"
                  onClick={() => camera.current?.click()}
                >
                  <Camera size={17} />
                  拍一张
                </button>
                <input
                  hidden
                  ref={camera}
                  type="file"
                  accept="image/*"
                  capture="environment"
                  onChange={(e) => void choose(e.target.files)}
                />
                <div className="image-previews">
                  {images.map((src, i) => (
                    <div key={i}>
                      <img src={src} alt={`素材 ${i + 1}`} />
                      <button
                        aria-label={"移除图片" + (i + 1)}
                        onClick={() =>
                          setImages(images.filter((_, n) => n !== i))
                        }
                      >
                        <X size={13} />
                      </button>
                    </div>
                  ))}
                </div>
              </>
            )}
            {kind === "audio" && (
              <button
                className={"record-button " + (recording ? "recording" : "")}
                onClick={() => void record()}
              >
                {recording ? <Square size={17} /> : <Mic size={18} />}{" "}
                {recording ? `结束录音 · ${seconds} 秒` : "直接录一段"}
              </button>
            )}
            {mediaURL &&
              (kind === "audio" ? (
                <audio src={mediaURL} controls />
              ) : (
                <video src={mediaURL} controls playsInline />
              ))}
          </>
        )}
        <label className="field-label" htmlFor="intake-text">
          {["image", "video", "audio"].includes(kind)
            ? "还想说点什么？（选填）"
            : kind === "link"
              ? "分享链接"
              : "想查的内容"}
        </label>
        <textarea
          id="intake-text"
          aria-label="素材输入框"
          rows={["image", "video", "audio"].includes(kind) ? 3 : 8}
          value={text}
          maxLength={kind === "link" ? 2000 : 10000}
          onChange={(e) => setText(e.target.value)}
          placeholder={
            kind === "link"
              ? "粘贴完整网址或分享文字…"
              : kind === "comments"
                ? "粘贴评论，每条换一行…"
                : "把想核实的说法放在这里…"
          }
        />
        {(kind === "link" || kind === "text" || kind === "comments") && (
          <button
            className="text-button"
            onClick={async () => {
              try {
                setText((await navigator.clipboard.readText()).slice(0, 10000));
              } catch {
                setError("可以长按输入框，选择粘贴。");
              }
            }}
          >
            从剪贴板粘贴 <Plus size={15} />
          </button>
        )}
        {error && (
          <p role="alert" className="error">
            {error}
          </p>
        )}
        <Primary disabled={reading || recording || app.busy} onClick={accept}>
          帮我查查 <ArrowUpRight size={17} />
        </Primary>
        <p className="footnote">
          {app.state.settings.ai
            ? "AI 会读取你提交的内容。音频会先转成文字。"
            : "已关闭 AI 分析；链接和音频仍需服务器读取。"}
          资料卡保存在当前浏览器。
        </p>
      </div>
    </Sheet>
  );
}
export function Samples() {
  const { start } = useApp(),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  return (
    <Sheet title="先试一份">
      <div className="sheet-content">
        <p className="muted">下面是我们编写的示例，可以点开试试</p>
        {(["flagged", "supported", "unclear"] as Verdict[]).map((v, i) => (
          <button
            key={v}
            disabled={busy}
            className="sample-choice card"
            onClick={async () => {
              setBusy(true);
              try {
                await start(await sample(v));
              } catch {
                setError("示例暂时没能打开");
                setBusy(false);
              }
            }}
          >
            <Icon name={["image", "notebook", "video"][i]} size={60} />
            <div>
              <b>
                {
                  [
                    "7天变白、100%无刺激？",
                    "甘油能帮助保湿吗？",
                    "图片太糊，还能判断吗？",
                  ][i]
                }
              </b>
              <small>
                {
                  [
                    "说得这么好，靠谱吗？",
                    "看看成分表怎么写",
                    "看不清，就先不下结论",
                  ][i]
                }
              </small>
            </div>
            <ArrowUpRight size={17} />
          </button>
        ))}
        {error && <p className="error">{error}</p>}
      </div>
    </Sheet>
  );
}
export function Result({ id }: { id: string }) {
  const { state, setState, open, setSupplement, setSheet } = useApp(),
    r = state.reports.find((r) => r.id === id),
    mediaURL = useMediaURL(r?.audio || r?.video);
  if (!r)
    return (
      <Sheet title="美妆资料卡">
        <Empty title="这张卡片已经移除" detail="可以回百宝箱再查一份" />
      </Sheet>
    );
  const download = () => {
    const u = URL.createObjectURL(reportFile(r)),
      a = document.createElement("a");
    a.href = u;
    a.download = "AUTHEN-美妆资料卡.html";
    a.click();
    setTimeout(() => URL.revokeObjectURL(u), 1000);
  };
  const p = r.presentation,
    tone =
      p?.presentation_state === "P-01"
        ? "alert"
        : p?.presentation_state === "P-02"
          ? "clue"
          : p?.presentation_state === "P-03"
            ? "ok"
            : "thin";
  return (
    <Sheet title={r.answerKind === "advice" ? "美妆小功课" : "美妆资料卡"}>
      <div className="sheet-content result">
        <div className="result-label">
          <Pill>
            {r.sample
              ? "演示素材"
              : r.answerKind === "advice"
                ? "涂妆小技巧"
                : p
                  ? p.presentation_state === "P-01"
                    ? "发现要关注的问题"
                    : p.presentation_state === "P-02"
                      ? "有线索待核实"
                      : p.presentation_state === "P-03"
                        ? "没发现明显异常"
                        : p.presentation_state === "P-04"
                          ? "材料不足"
                          : "检查没做完"
                  : r.verdict === "flagged"
                    ? "这几处要留意"
                    : r.references?.length
                      ? "找到相关资料"
                      : "帮你看了看"}
          </Pill>
          <Icon name="notebook" size={40} />
        </div>
        {r.contentType && r.contentType !== "other" && (
          <div className="content-kind">
            <b>{r.page?.coverage.shareOnly ? "分享文案" : contentLabels[r.contentType] || "美妆内容"}</b>
            {!r.page?.coverage.shareOnly && <span>{r.page?.contentType === "video" && !r.video ? "先看配文，画面和口播可补发视频" : contentFocus[r.contentType]}</span>}
          </div>
        )}
        {p ? (
          <div className={"verdict " + tone} role="status" aria-label={p.a11y_label}>
            <span className="verdict-tier">
              {p.confidence_tier !== "—" ? p.confidence_tier : p.presentation_family}
            </span>
            <h2 className="verdict-title">{p.state_subtitle}</h2>
            <p className="verdict-reason">{p.state_reason}</p>
          </div>
        ) : (
          <h2 className="card-answer">{r.summary}</h2>
        )}
        {p && p.dimension_summary?.length ? (
          <div className="dim-table card">
            <div className="dim-table-head">
              <b>从六个方面看，分别看到什么</b>
              <small>没看到就说没看到</small>
            </div>
            {p.dimension_summary.map((d) => (
              <div
                className={
                  "dim-row " +
                  (/可直接对照|对不上|重复|说满/.test(d.result)
                    ? "bad"
                    : /不足|看不出|没认出|缺/.test(d.result)
                      ? "thin"
                      : /没发现|对得上|比较全|没涉及/.test(d.result)
                        ? "ok"
                        : "")
                }
                key={d.dim}
              >
                <b>{d.dim}</b>
                <span>{d.result}</span>
                <small>{d.note}</small>
              </div>
            ))}
          </div>
        ) : null}
        {!!reportProducts(r).length && <button className="product-jump" onClick={()=>document.getElementById('products-'+r.id)?.scrollIntoView({block:'start',behavior:state.settings.motion?'smooth':'instant'})}>{reportProducts(r).map(p=>p.product?.name||p.brand.name).join(' / ')} · 产品与选购 ↘</button>}
        {r.page && <CommentCard page={r.page} onSupplement={()=>{setSupplement(r);open('smart');}}/>}
        {r.linkUnavailable && <p className="link-scope-note">{r.page?.coverage.shareOnly ? "这次只看了分享文案，详情、评价和视频都没有读到。" : "这次只查了你补充的内容，原帖没有读到。"}</p>}
        {r.page && (
          <details className="source-read card">
            <summary>
              <Link size={14} />
              {r.page.platform} ·{" "}
              {r.page.coverage.shareOnly
                ? "仅分享文案"
                : r.page.coverage.excerptOnly
                ? "公开简介"
                : r.page.coverage.text
                  ? "正文已读"
                  : "公开评价"}{" "}
              {!r.page.coverage.shareOnly && <>· {r.page.coverage.images}张图 / {r.page.coverage.reviews}条评价</>}
            </summary>
            <b>{r.page.title}</b>
            {r.page.author && <small>{r.page.author}</small>}
            {r.page.limitations.map((l, i) => (
              <p key={i}>{l}</p>
            ))}
            <a href={r.page.url} target="_blank" rel="noreferrer">
              打开原帖 ↗
            </a>
          </details>
        )}
        {r.analysisLabel?.includes("初查") && (
          <p className="error">这次没连上在线分析，只做了本机初查</p>
        )}
        {r.analysisLabel?.includes("未使用") && (
          <p className="muted">{r.analysisLabel}</p>
        )}
        {!!r.numbers?.length && (
          <div className="result-numbers">
            {r.numbers.map((n, i) => (
              <div className="card" key={i}>
                <strong>{n.value}</strong>
                <span>{n.label}</span>
              </div>
            ))}
          </div>
        )}
        {r.tips?.length ? (
          <div className="card tips">
            {r.tips.map((t, i) => (
              <div key={i}>
                <b>0{i + 1}</b>
                <p>{t}</p>
              </div>
            ))}
          </div>
        ) : (
          r.next && <div className="next-advice">♡ {r.next}</div>
        )}
        {p?.reason_steps?.length ? (
          <details className="card reason-card" open>
            <summary>这个结论怎么来的</summary>
            <ol>
              {p.reason_steps.map((s, i) => (
                <li key={i}>{s}</li>
              ))}
            </ol>
          </details>
        ) : null}
        {p?.limitations?.length ? (
          <details className="card limit-card">
            <summary>这次没看到什么</summary>
            {p.limitations.map((l, i) => (
              <p key={i}>{l}</p>
            ))}
          </details>
        ) : null}
        <ProductCard key={r.id} report={r}/>
        {!!r.evidence.length && (
          <details className="card detail-card">
            <summary>展开看看 · {r.evidence.length} 处</summary>
            {r.evidence.map((e, i) => (
              <article className="evidence-item" key={i}>
                <h3>
                  {["文字依据", "画面真实性", "图文一致性", "评论区真实性", "上下文完整性", "商品真实性"].includes(e.source) && (
                    <em className="dim-tag">{e.source}</em>
                  )}
                  {e.finding}
                </h3>
                <blockquote>“{e.text}”</blockquote>
                <p>{e.why}</p>
                {e.seconds !== undefined && (
                  <small>
                    {r.kind === "audio" ? "音频" : "视频"}{" "}
                    {e.seconds.toFixed(1)} 秒
                  </small>
                )}
                {e.imageIndex !== undefined && r.images[e.imageIndex] && (
                  <details>
                    <summary>看看这张图</summary>
                    <div className="annotated">
                      <img src={r.images[e.imageIndex]} alt="相关原图" />
                      {e.box && (
                        <i
                          style={{
                            left: `${e.box[0] * 100}%`,
                            top: `${e.box[1] * 100}%`,
                            width: `${e.box[2] * 100}%`,
                            height: `${e.box[3] * 100}%`,
                          }}
                        />
                      )}
                    </div>
                  </details>
                )}
              </article>
            ))}
          </details>
        )}
        {r.references?.map((ref) => (
          <details key={ref.id} className="card detail-card reference">
            <summary>
              <Link size={14} />
              {ref.title}
            </summary>
            <p>{ref.excerpt}</p>
            {safeURL(ref.url) && (
              <a href={ref.url} target="_blank" rel="noreferrer">
                看看原文 ↗
              </a>
            )}
          </details>
        ))}
        <div className="card-actions">
          <button
            className="card"
            onClick={() => {
              setSupplement(r);
              open("image");
            }}
          >
            再补张图
          </button>
          <Primary
            onClick={() =>
              setState((s) => ({
                ...s,
                reports: s.reports.map((q) =>
                  q.id === id ? { ...q, saved: !q.saved } : q,
                ),
              }))
            }
          >
            {r.saved ? "已收藏" : "收藏资料卡"}
            <Bookmark size={17} fill={r.saved ? "currentColor" : "none"} />
          </Primary>
        </div>
        <details className="original-material">
          <summary>我发来的内容</summary>
          {mediaURL &&
            (r.audio ? (
              <audio controls src={mediaURL} />
            ) : (
              <video controls playsInline src={mediaURL} />
            ))}
          <p>{r.original}</p>
          {r.images.map((src, i) => (
            <img key={i} src={src} alt={`原图 ${i + 1}`} />
          ))}
          <p className="muted">{r.scope}</p>
          {safeURL(r.sourceURL) && (
            <a href={r.sourceURL} target="_blank" rel="noreferrer">
              打开原链接 ↗
            </a>
          )}
        </details>
        <div className="result-foot">
          <button onClick={download}>
            <Download size={15} />
            下载卡片
          </button>
          <button
            onClick={() => {
              setState((s) => ({
                ...s,
                reports: s.reports.filter((q) => q.id !== id),
              }));
              setSheet(null);
            }}
          >
            <Trash2 size={15} />
            删除这张卡
          </button>
        </div>
      </div>
    </Sheet>
  );
}
export function PostDetail({ id }: { id: string }) {
  const { state, updatePost, start, setState, setSheet, setNotice, uid, busy } =
      useApp(),
    p = state.social.posts.find((p) => p.id === id),
    [comment, setComment] = useState("");
  if (!p)
    return (
      <Sheet title="美妆动态">
        <Empty title="这条动态已移除" detail="去看看其他美妆灵感" />
      </Sheet>
    );
  const share = async () => {
    try {
      if (navigator.share)
        await navigator.share({
          title: p.title,
          text: p.text,
          url: safeURL(p.sourceURL),
        });
      else {
        await navigator.clipboard.writeText(
          p.sourceURL || p.title + "\n" + p.text,
        );
        setNotice("已复制，可以分享给朋友");
      }
    } catch {
      setNotice("可以复制原帖链接分享");
    }
  };
  return (
    <Sheet title="美妆动态">
      <div className="sheet-content post-detail">
        <header>
          <span className="author-avatar">{p.author.slice(0, 1)}</span>
          <div>
            <b>{p.author}</b>
            <small>
              {p.publishedAt
                ? "YouTube · " + p.publishedAt
                : new Date(p.date).toLocaleDateString("zh-CN")}
            </small>
          </div>
          <Pill>{p.category}</Pill>
        </header>
        <div className="post-cover">
          <PostArt post={p} />
        </div>
        <h2>{p.title}</h2>
        {p.sourceURL && !p.isMine && (
          <small className="muted">根据视频简介整理</small>
        )}
        <p className="post-body">{p.text}</p>
        {p.watchPoints && (
          <div className="watch-points">
            <b>种草前，看看这几点</b>
            <h3>{p.learningFocus}</h3>
            {p.watchPoints.map((point, i) => (
              <div key={i}>
                <b>0{i + 1}</b>
                <p>{point}</p>
              </div>
            ))}
          </div>
        )}
        {safeURL(p.sourceURL) && (
          <div className="source-credit">
            <a href={p.sourceURL} target="_blank" rel="noreferrer">
              {p.isMine ? "查看原帖" : "看原视频 · " + p.duration} ↗
            </a>
            <small>原作者：{p.author}</small>
          </div>
        )}
        <div className="post-actions">
          <button onClick={() => updatePost(id, { liked: !p.liked })}>
            <Heart size={18} fill={p.liked ? "currentColor" : "none"} />
            {p.liked ? "已喜欢" : "喜欢"}
          </button>
          <button onClick={() => updatePost(id, { bookmarked: !p.bookmarked })}>
            <Bookmark size={18} fill={p.bookmarked ? "currentColor" : "none"} />
            {p.bookmarked ? "已收藏" : "收藏"}
          </button>
          <button aria-label="分享动态" onClick={() => void share()}>
            <Share2 size={18} />
          </button>
        </div>
        <Primary
          disabled={busy}
          onClick={() =>
            void start({
              kind: "text",
              audience: "consumer",
              text:
                (!p.isMine
                  ? "下面整理自视频简介，这次只看这些文字，还没看完整视频：\n"
                  : "") +
                p.title +
                "\n" +
                p.text,
              images: p.isMine && p.image ? [p.image] : [],
              url: undefined,
            })
          }
        >
          {p.isMine ? "查查这篇内容" : "这段话靠谱吗？"}
        </Primary>
        <h3>一起聊聊 · {p.comments.length}</h3>
        {p.comments.map((c) => (
          <div key={c.id} className="comment card">
            <b>{c.author}</b>
            <p>{c.text}</p>
          </div>
        ))}
        <div className="comment-input card">
          <input
            maxLength={500}
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="分享你的看法"
          />
          <button
            disabled={!comment.trim()}
            onClick={() => {
              updatePost(id, {
                comments: [
                  ...p.comments,
                  {
                    id: uid(),
                    text: comment.trim(),
                    author: "我",
                    date: new Date().toISOString(),
                  },
                ],
              });
              setComment("");
            }}
          >
            发送
          </button>
        </div>
        {p.isMine && (
          <button
            className="text-button"
            onClick={() => {
              setState((s) => ({
                ...s,
                social: {
                  ...s.social,
                  posts: s.social.posts.filter((q) => q.id !== id),
                },
              }));
              setSheet(null);
            }}
          >
            删除这条动态
          </button>
        )}
      </div>
    </Sheet>
  );
}
export function Compose() {
  const { setState, setSheet, setTab, setNotice, uid } = useApp(),
    [title, setTitle] = useState(""),
    [body, setBody] = useState(""),
    [category, setCategory] = useState("美妆日常"),
    [image, setImage] = useState(""),
    [source, setSource] = useState(""),
    [sourceTitle, setSourceTitle] = useState(""),
    [reading, setReading] = useState(false),
    [error, setError] = useState("");
  const input = useRef<HTMLInputElement>(null);
  const read = async () => {
    setReading(true);
    setError("");
    try {
      const r = await fetch("/authen/api/page", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: source }),
      });
      const d = await r.json();
      if (!r.ok)
        throw Error(d.error || "这篇暂时读不到，可以自己写下帖子讲了什么。");
      setTitle(d.title.slice(0, 60));
      setBody(d.text.slice(0, 5000));
      setSourceTitle(d.title);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setReading(false);
    }
  };
  const publish = () => {
    if (!title.trim() || !body.trim()) {
      setError("写上标题和正文再发布吧。");
      return;
    }
    const post: Post = {
      id: uid(),
      title: title.trim(),
      text: body.trim(),
      category,
      image: image || undefined,
      sourceURL: safeURL(source),
      sourceTitle,
      author: "我",
      isMine: true,
      comments: [],
      date: new Date().toISOString(),
    };
    setState((s) => ({
      ...s,
      social: { ...s.social, posts: [post, ...s.social.posts] },
    }));
    setSheet(null);
    setTab("动态");
    setNotice("已发布到本机动态");
  };
  return (
    <Sheet title="分享一点美">
      <div className="sheet-content compose">
        <input
          className="compose-title card"
          aria-label="动态标题"
          maxLength={60}
          placeholder="给这篇动态起个标题"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
        <textarea
          className="card"
          aria-label="动态正文"
          maxLength={5000}
          rows={8}
          placeholder="今天的妆容、成分功课，或种草踩坑经历…"
          value={body}
          onChange={(e) => setBody(e.target.value)}
        />
        <button
          className="add-photo card"
          onClick={() => input.current?.click()}
        >
          <ImagePlus size={20} />
          {image ? "更换图片" : "加一张图片"}
          {image && <img src={image} alt="动态配图" />}
        </button>
        <input
          hidden
          ref={input}
          type="file"
          accept="image/*"
          onChange={async (e) => {
            const f = e.target.files?.[0];
            if (f)
              try {
                setImage(await normalize(f));
              } catch (e) {
                setError((e as Error).message);
              }
          }}
        />
        <div className="segmented">
          {["美妆日常", "成分功课", "鉴真心得"].map((c) => (
            <button
              key={c}
              className={category === c ? "selected" : ""}
              onClick={() => setCategory(c)}
            >
              {c}
            </button>
          ))}
        </div>
        <details>
          <summary>粘贴帖子链接</summary>
          <input
            type="url"
            aria-label="帖子链接"
            placeholder="https://…"
            value={source}
            onChange={(e) => setSource(e.target.value)}
          />
          <button
            className="text-button"
            disabled={!source || reading}
            onClick={() => void read()}
          >
            {reading ? "正在读取…" : "读取原文"}
          </button>
          <p className="footnote">
            原帖链接会一起保留。读不到时，可以自己写下帖子讲了什么。
          </p>
        </details>
        {sourceTitle && <small className="muted">{sourceTitle}</small>}
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <Primary disabled={reading} onClick={publish}>
          发布动态 <ArrowUpRight size={17} />
        </Primary>
        <p className="footnote">试用版动态只有你能看到，暂时不会发给其他人。</p>
      </div>
    </Sheet>
  );
}
export function SettingsSheet() {
  const { state, setState } = useApp(),
    [confirm, setConfirm] = useState(false);
  return (
    <Sheet title="设置">
      <div className="sheet-content settings">
        <header>
          <img src={art("character-curious-bust")} alt="" />
          <div>
            <h2>AUTHEN</h2>
            <small>美妆内容，查个明白</small>
          </div>
        </header>
        <h3>体验</h3>
        <div className="card">
          {(
            [
              ["motion", "角色与纸张动效"],
              ["haptics", "轻触反馈"],
              ["sound", "轻声提示"],
              ["ai", "用 AI 帮我看内容"],
              ["speech", "读取视频口播"],
            ] as const
          ).map(([key, label]) => (
            <label className="setting-row" key={key}>
              <span>{label}</span>
              <input
                type="checkbox"
                role="switch"
                checked={state.settings[key]}
                onChange={(e) =>
                  setState((s) => ({
                    ...s,
                    settings: { ...s.settings, [key]: e.target.checked },
                  }))
                }
              />
            </label>
          ))}
        </div>
        <p className="footnote">
          开启 AI 后，文字、图片和视频中的部分画面会发给
          DeepSeek。音频由服务器先转成文字，可能有听错的地方。轻触反馈需要浏览器支持。
        </p>
        <div className="card setting-row">
          <span>本机资料卡</span>
          <b>{state.reports.length} 份</b>
        </div>
        <details className="card detail-card">
          <summary>能帮我看什么</summary>
          <p>
            找出笔记里对不上的数字、说得太满的功效，也会参考部分公开护肤资料。暂时不能鉴别商品真假、图片修没修或声音是不是合成的，也没有品牌内部资料。
          </p>
        </details>
        {confirm ? (
          <div className="confirm-delete card">
            <p>删除当前浏览器里的所有资料卡和保存的素材？</p>
            <button
              onClick={() => {
                setState((s) => ({ ...s, reports: [] }));
                setConfirm(false);
              }}
            >
              全部删除
            </button>
            <button onClick={() => setConfirm(false)}>保留</button>
          </div>
        ) : (
          <button className="text-button" onClick={() => setConfirm(true)}>
            删除所有资料卡和保存的文件
          </button>
        )}
        <p className="footnote">
          资料卡、动态、小叶子与小屋保存在当前浏览器。暂未开启跨设备同步。
        </p>
      </div>
    </Sheet>
  );
}
export function Helper() {
  const { open } = useApp();
  return (
    <Sheet title="红眼镜在这里">
      <div className="sheet-content helper">
        <img src={art("character-curious-bust")} alt="红眼镜助手" />
        <h2>
          给我文字、截图或链接
          <br />
          一起看看哪里值得留意
        </h2>
        <Primary onClick={() => open("smart")}>
          发来看看 <ArrowUpRight size={17} />
        </Primary>
        <button className="text-button" onClick={() => open("samples")}>
          先试一份示例
        </button>
        <p className="muted">可以把我拖到屏幕另一边</p>
      </div>
    </Sheet>
  );
}
