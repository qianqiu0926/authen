import { useEffect, useRef, useState } from "react";
import {
  ArrowUpRight,
  Check,
  Link2,
  Mic,
  Paperclip,
  Square,
  X,
  Sparkles,
  ChevronDown,
} from "lucide-react";
import { normalize } from "../media";
import { platformName, sharedLink, routeMaterial, sharePreview } from "../intake";
import { useApp } from "./store";
import { Icon, Primary, Sheet } from "./ui";

export default function SmartIntake() {
  const app = useApp(),
    [text, setText] = useState(app.intakeRecovery?.material.text || app.draft),
    [images, setImages] = useState<string[]>(app.intakeRecovery?.material.images || []),
    [media, setMedia] = useState<Blob | null>(app.intakeRecovery?.material.video || app.intakeRecovery?.material.audio || null),
    [reading, setReading] = useState(false),
    [error, setError] = useState(""),
    [recording, setRecording] = useState(false),
    [seconds, setSeconds] = useState(0),
    [mediaURL, setMediaURL] = useState("");
  const picker = useRef<HTMLInputElement>(null),
    textarea = useRef<HTMLTextAreaElement>(null),
    recorder = useRef<MediaRecorder | null>(null),
    stream = useRef<MediaStream | null>(null),
    alive = useRef(true),
    draftRef = useRef(text);
  draftRef.current = text;
  const [readLink, setReadLink] = useState(!app.intakeRecovery?.issue), [focus, setFocus] = useState("");
  const pasteLink = async () => {
    try {
      const value = await navigator.clipboard.readText();
      if (!value.trim()) throw Error();
      setText(value); setError(""); textarea.current?.focus();
    } catch { setError("长按输入区，选择粘贴就好。"); textarea.current?.focus(); }
  };
  const url = sharedLink(text),
    hasInput = !!(text.trim() || images.length || media);
  const recovery = app.intakeRecovery;
  const linkIssue = recovery?.issue && recovery.issue.url === url ? recovery.issue : undefined;
  const preview = sharePreview(text);
  const shareOnly = !!(url && !readLink && preview && !images.length && !media && (!linkIssue || text.trim() === recovery?.material.text.trim()));
  useEffect(() => {setReadLink(!linkIssue);}, [url,linkIssue?.url]);
  useEffect(() => {
    app.setDraft(text);
  }, [text]);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      recorder.current?.state === "recording" && recorder.current.stop();
      stream.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);
  useEffect(() => {
    if (!media) {
      setMediaURL("");
      return;
    }
    const u = URL.createObjectURL(media);
    setMediaURL(u);
    return () => URL.revokeObjectURL(u);
  }, [media]);
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
  const choose = async (files: File[]) => {
    if (reading || recording) return;
    setError("");
    setReading(true);
    try {
      const pictures = files.filter((f) => f.type.startsWith("image/")),
        clips = files.filter((f) => /^(video|audio)\//.test(f.type));
      if (pictures.length + clips.length !== files.length)
        throw Error("可以发图片、视频或音频，文字直接粘贴就好。");
      if (images.length + pictures.length > 5)
        throw Error("一次最多放 5 张图片。");
      if (clips.length + (media ? 1 : 0) > 1)
        throw Error("一次看一段视频或音频，先移除上一段吧。");
      if (
        clips[0]?.size >
        (clips[0]?.type.startsWith("audio/") ? 12_000_000 : 50_000_000)
      )
        throw Error("音频不超过12MB，视频不超过50MB。");
      const loaded = await Promise.all(pictures.map(normalize));
      if (!alive.current) return;
      setImages((old) => [...old, ...loaded]);
      if (clips[0]) setMedia(clips[0]);
    } catch (e) {
      if (alive.current) setError((e as Error).message);
    } finally {
      if (alive.current) setReading(false);
    }
  };
  const record = async () => {
    setError("");
    if (recording) {
      recorder.current?.stop();
      return;
    }
    if (media) {
      setError("先移除已有的音视频，再录一段吧。");
      return;
    }
    try {
      if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder)
        throw Error("这个浏览器暂时无法录音，可以上传音频。");
      const s = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (!alive.current) {
        s.getTracks().forEach((t) => t.stop());
        return;
      }
      stream.current = s;
      const mime = ["audio/webm;codecs=opus", "audio/mp4"].find((m) =>
          MediaRecorder.isTypeSupported(m),
        ),
        r = new MediaRecorder(s, mime ? { mimeType: mime } : undefined),
        chunks: Blob[] = [];
      recorder.current = r;
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
      setRecording(true);
      setSeconds(0);
    } catch {
      setError("没能打开麦克风，可以上传一段录音。");
    }
  };
  const submit = () => {
    if (!hasInput) return;
    if (linkIssue && !readLink && !preview && !images.length && !media && text.trim() === app.intakeRecovery?.material.text.trim()) {
      setError("补上正文或截图再继续，也可以勾选读取链接重试。"); return;
    }
    if (
      url &&
      !readLink &&
      !images.length &&
      !media &&
      text.replace(/https?:\/\/[^\s<>]+/gi, "").trim().length < 10
    ) {
      setError("不读取链接时，补点正文或截图再继续吧。");
      return;
    }
    app.setDraft("");
    void app.start(
      routeMaterial({
        kind: "text",
        text: [text.trim(), focus ? "我想知道：" + focus : ""].filter(Boolean).join("\n"),
        images,
        audience: "consumer",
        skipLink: !readLink,
        shareOnly,
        linkUnavailable: !readLink ? linkIssue : undefined,
        ...(media
          ? media.type.startsWith("video/")
            ? { video: media }
            : { audio: media }
          : {}),
      }),
    );
  };
  return (
    <Sheet title="发来看看">
      <div className="sheet-content smart-intake">
        <div className="intake-editorial">
          <span>THE BEAUTY EDIT</span>
          <h2>心动的种草，<br/>帮你多看一眼。</h2>
          <p>好评、功效、妆效，查完再决定</p>
          <img src="/authen/app/character-reading-bust.png" alt=""/>
        </div>
        <div className="intake-sources">
          <button onClick={()=>void pasteLink()}><Link2 size={22}/><b>粘贴链接</b><small>正文 + 评论一起看</small></button>
          <button disabled={reading||recording} onClick={()=>picker.current?.click()}><Icon name="image" size={32}/><b>放入素材</b><small>图片 / 音视频</small></button>
          <button disabled={reading} onClick={()=>void record()}>{recording?<Square size={21}/>:<Mic size={21}/>}<b>{recording?`${seconds}s · 结束`:"录一段"}</b><small>口播 / 语音</small></button>
        </div>
        {linkIssue && <div className="link-recovery" role="status"><b>{preview ? "链接认出来了，还没读到详情" : "这条链接还没读到"}</b>{preview && <p className="share-preview-title">{preview.title}</p>}<p>{linkIssue.message}</p><div><button onClick={()=>picker.current?.click()}>{preview?.contentType === "video" ? "补视频 / 截图" : "补张截图"}</button><button onClick={()=>textarea.current?.focus()}>粘贴正文</button><a href={linkIssue.url} target="_blank" rel="noreferrer">{preview?.contentType === "product" ? "打开商品" : "打开原帖"} ↗</a></div><small>{shareOnly ? "也可以先看分享文案，详情和评价需要另外补充" : "已保留刚才的内容和附件，补好就能接着查"}</small></div>}
        {app.supplement && (
          <p className="supplement-note">
            会和上一份内容一起看{" "}
            <button onClick={() => app.setSupplement(null)}>取消补充</button>
          </p>
        )}
        <div
          className="smart-editor"
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            if (e.dataTransfer.files.length)
              void choose(Array.from(e.dataTransfer.files));
            else setText(e.dataTransfer.getData("text/plain"));
          }}
        >
          <div className="intake-note-label"><span>{url?"链接已放好":"我的种草便签"}</span><small>自动识别内容</small></div>
          <textarea
            ref={textarea}
            aria-label="内容或分享链接"
            value={text}
            maxLength={10000}
            rows={3}
            onChange={(e) => setText(e.target.value)}
            placeholder={"贴一条笔记或商品链接，\n正文和评论一起看…"}
            onPaste={(e) => {
              const files = Array.from(e.clipboardData.files);
              if (files.length) {
                e.preventDefault();
                void choose(files);
              }
            }}
          />
          {url && (
            <div className="link-options">
              <div className="detected-link" role="status">
                <Link2 size={16} />
                <div>
                  <b>{platformName(url)} · {preview?.contentType === "product" ? "商品分享" : preview?.contentType === "video" ? "视频分享" : "待查内容"}</b>
                  <small>
                    {readLink
                      ? "正文、配图和公开评论，一起读"
                      : shareOnly ? "先看分享文案，未读取原链接内容" : "这次只看你发来的文字和附件"}
                  </small>
                </div>
                <Check size={16} />
              </div>
              <label>
                <input
                  type="checkbox"
                  checked={readLink}
                  onChange={(e) => setReadLink(e.target.checked)}
                />
                读取正文和评论
              </label>
              <small>评论读不到时会告诉你，也可补张截图</small>
            </div>
          )}
          {url && readLink && <div className="link-comment-preview"><Icon name="social" size={30}/><div><b>好评有没有“一键复制”？</b><p>看看重复话术和使用细节，不用逐条复制评论。</p></div></div>}
          {images.length > 0 && (
            <div className="image-previews">
              {images.map((src, i) => (
                <div key={i}>
                  <img src={src} alt={`待查图片 ${i + 1}`} />
                  <button
                    aria-label={"移除图片" + (i + 1)}
                    onClick={() => setImages(images.filter((_, n) => n !== i))}
                  >
                    <X size={14} />
                  </button>
                </div>
              ))}
            </div>
          )}
          {media && (
            <div className="smart-media">
              <header>
                <span>
                  {media.type.startsWith("video/") ? "视频" : "音频"} ·{" "}
                  {media instanceof File ? media.name : "上次添加的素材"}
                </span>
                <button aria-label="移除音视频" onClick={() => setMedia(null)}>
                  <X size={16} />
                </button>
              </header>
              {mediaURL &&
                (media.type.startsWith("video/") ? (
                  <video controls playsInline src={mediaURL} />
                ) : (
                  <audio controls src={mediaURL} />
                ))}
            </div>
          )}
          <div className="smart-tools">
            <button
              disabled={reading || recording}
              onClick={() => picker.current?.click()}
            >
              <Paperclip size={19} />
              {reading ? "正在读取" : "加图片 / 文件"}
            </button>
            <button disabled={reading} onClick={() => void record()}>
              {recording ? <Square size={18} /> : <Mic size={18} />}{" "}
              {recording ? `${seconds}s · 结束` : "录音"}
            </button>
          </div>
          <input
            hidden
            ref={picker}
            type="file"
            accept="image/*,video/*,audio/*"
            multiple
            onChange={(e) => {
              void choose(Array.from(e.target.files || []));
              e.target.value = "";
            }}
          />
        </div>
        <div className="intake-focus"><div><Sparkles size={14}/><span>想重点看看</span><small>可不选</small></div><div>{["好评真实吗？","功效靠谱吗？","妆效有修饰吗？"].map(q=><button key={q} aria-pressed={focus===q} onClick={()=>setFocus(focus===q?"":q)}>{q}</button>)}</div></div>
        {!hasInput && (
          <details className="smart-examples"><summary>没有素材？试试一条种草 <ChevronDown size={13}/></summary>
            <button
              onClick={() => {
                setText(
                  "这款精华说三天变白，敏感肌都能放心用，靠谱吗？",
                );
                textarea.current?.focus();
              }}
            >
              三天变白，真有这么快？ ↗
            </button>
            <button
              onClick={() => {
                setText("这条笔记说烟酰胺10%，同款瓶身写2%，哪个数字对？");
                textarea.current?.focus();
              }}
            >
              笔记和瓶身，数字对不上 ↗
            </button>
          </details>
        )}
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <Primary
          disabled={!hasInput || reading || recording || app.busy}
          onClick={submit}
        >
          {url && readLink ? "看看这份种草" : shareOnly ? "先看分享文案" : linkIssue ? "只查我补充的内容" : "帮我看看"}
          <ArrowUpRight size={18} />
        </Primary>
        <p className="footnote intake-footnote">
          {app.state.settings.ai?"查完生成资料卡，喜欢就收进知识库":"AI 已关闭，仅检查常见夸大说法"}
        </p>
        <details className="intake-help"><summary>支持哪些内容？</summary><p>淘宝、小红书、抖音等分享链接，整段复制就好。自动检查页面能公开读取的评论，展示可疑话术占比和具体原话。评论不是全量，不能据此认定水军；读不到时可补评论截图或文字。视频链接先看文案与封面，画面和口播请上传片段。最多 5 张图片，视频或音频限 60 秒。</p></details>
      </div>
    </Sheet>
  );
}
