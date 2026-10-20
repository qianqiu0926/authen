import { syncFarm, nourish, contentKey } from "./farm";
import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { openDB } from "idb";
import { LinkReadError } from "../intake";
import { analyze } from "../media";
import type { Kind, Material, Report } from "../types";
import type { ScenarioId } from "./scenarios";
import {
  initialRoom,
  uid,
  type AppState,
  type Post,
  type Tab,
} from "./model";
import sources from "./sources.json";
const seeds: Post[] = sources.map((s) => ({
  id: s.id,
  title: s.title,
  text: s.summary,
  category: s.category,
  author: s.author,
  image: s.image,
  sourceURL: s.sourceURL,
  sourceTitle: s.sourceTitle,
  publishedAt: s.publishedAt,
  duration: s.duration,
  learningFocus: "learningFocus" in s ? s.learningFocus : undefined,
  watchPoints: "watchPoints" in s ? s.watchPoints : undefined,
  comments: [],
  date: s.publishedAt + "T00:00:00Z",
}));
const initial: AppState = {
  social: {
    posts: seeds,
    leaves: 0,
    ledger: [],
    rewards: [],
    roomItems: [],
    room: initialRoom(),
  },
  reports: [],
  settings: {
    ai: true,
    motion: true,
    haptics: true,
    sound: false,
    speech: true,
  },
};
export type Sheet = {
  type:
    | Kind
    | "samples"
    | "settings"
    | "card"
    | "compose"
    | "room"
    | "wallet"
    | "helper"
    | "post"
    | "smart"
    | "farm";
  id?: string;
};
const db = openDB("authen-consumer", 1, {
  upgrade(d) {
    d.createObjectStore("state");
  },
});
function useStore() {
  const [draft, setDraft] = useState("");
  const [intakeRecovery, setIntakeRecovery] = useState<{material:Material;issue?:{url:string;message:string;code:string}} | null>(null);
  const [state, setState] = useState<AppState>(initial),
    [ready, setReady] = useState(false),
    [tab, setTab] = useState<Tab>("百宝箱"),
    [sheet, setSheet] = useState<Sheet | null>(null),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false),
    [stage, setStage] = useState(""),
    [error, setError] = useState(""),
    [unread, setUnread] = useState<string | null>(null),
    [supplement, setSupplement] = useState<Report | null>(null);
  const [intakePreset, setIntakePreset] = useState<{
    scenario: ScenarioId;
    focus?: string;
  } | null>(null);
  const abort = useRef<AbortController | null>(null),
    incoming = useRef<Material | null>(null),
    latest = useRef({ tab, sheet, state });
  latest.current = { tab, sheet, state };
  useEffect(() => {
    let alive = true;
    db.then((d) => d.get("state", "main"))
      .then((saved) => {
        if (!alive) return;
        if (saved) {
          const old = saved as AppState;
          const posts = seeds.map((p) => ({
            ...p,
            ...old.social.posts.find((q) => q.id === p.id),
            image: p.image,
          }));
          setState({
            ...initial,
            ...old,
            farm: syncFarm(old.farm),
            social: {
              ...initial.social,
              ...old.social,
              posts: [...old.social.posts.filter((p) => p.isMine), ...posts],
            },
          });
        }
        if (!saved) setState(s => ({...s, farm: syncFarm(s.farm)}));
        setReady(true);
      })
      .catch(() => {
        setNotice("浏览器暂时无法保存记录");
        setReady(true);
      });
    return () => {
      alive = false;
    };
  }, []);
  useEffect(() => {
    if (ready)
      void db
        .then((d) => d.put("state", state, "main"))
        .catch(() => setNotice("浏览器存储已满，这次修改没能保存"));
  }, [state, ready]);
  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(""), 3500);
    return () => clearTimeout(t);
  }, [notice]);
  useEffect(() => () => abort.current?.abort(), []);
  useEffect(() => {
    if (!ready) return;
    const params = new URLSearchParams(location.search);
    const url = params.get("url");
    if (url && /^https?:\/\//.test(url)) {
      incoming.current = { kind: "link", url, text: "", images: [] };
      setDraft(url);
      setSheet({ type: "smart" });
      setNotice("分享链接已准备好，确认后开始");
    }
  }, [ready]);
  const feedback = () => {
    if (state.settings.haptics) navigator.vibrate?.(12);
    if (state.settings.sound) {
      try {
        const ctx = new AudioContext();
        const osc = ctx.createOscillator(),
          gain = ctx.createGain();
        gain.gain.value = 0.025;
        osc.frequency.value = 660;
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start();
        osc.stop(ctx.currentTime + 0.07);
        osc.onended = () => void ctx.close();
      } catch {}
    }
  };
  const open = (
    type: Sheet["type"],
    id?: string,
    preset?: { scenario: ScenarioId; focus?: string } | null,
  ) => {
    const smart = ["image", "video", "text", "link", "audio", "comments"].includes(type);
    // 从首页或浮窗进入时带上场景；从其它地方进入则清空，避免沿用上一次的选择。
    if (type === "smart" || smart) setIntakePreset(preset ?? null);
    setSheet({ type: smart ? "smart" : type, id });
    if (type === "card") setUnread(null);
  };
  const start = async (m: Material) => {
    if (abort.current) {
      setNotice("上一份还在查，稍等一下");
      return;
    }
    if (supplement && !m.sample) {
      m = {
        ...m,
        text: [m.text, supplement.original]
          .filter(Boolean)
          .join("\n")
          .slice(0, 15000),
        images: [...supplement.images, ...m.images].slice(0, 5),
      };
    }
    setSupplement(null);
    incoming.current = m;
    setIntakeRecovery(null);
    const control = new AbortController();
    abort.current = control;
    setBusy(true);
    setSheet(null);
    latest.current.sheet = null;
    setUnread(null);
    setError("");
    setStage("正在读内容");
    try {
      const result = await analyze(m, control.signal, setStage, {
        aiEnabled: latest.current.state.settings.ai,
        videoSpeech: latest.current.state.settings.speech,
      });
      if (control.signal.aborted) return;
      result.title =
        result.page?.title ||
        (m.sample
          ? "美妆笔记 · 示例"
          : m.kind === "link"
            ? "分享的内容"
            : m.text.slice(0, 35) ||
              "我的" +
                {
                  image: "图片",
                  video: "视频",
                  audio: "音频",
                  comments: "评论",
                  text: "笔记",
                  link: "链接",
                }[m.kind]);
      setState((s) => {
        const next = { ...s, reports: [result, ...s.reports].slice(0, 50) };
        return !result.sample && (result.presentation || result.analysisLabel?.startsWith("DeepSeek"))
          ? nourish(next, "check", contentKey([m.url,m.text,...m.images].join("|"))) : next;
      });
      setUnread(result.id);
      if (latest.current.tab === "百宝箱" && !latest.current.sheet) {
        setSheet({ type: "card", id: result.id });
        setUnread(null);
      }
      feedback();
    } catch (e) {
      if (!control.signal.aborted) {
        const message = (e as Error).message;
        setError(message);
        const issue = e instanceof LinkReadError ? {url:e.url,message:e.message,code:e.code} : undefined;
        setIntakeRecovery({material:m,issue});
        setDraft(m.text || m.url || "");
        if (issue && latest.current.tab === "百宝箱" && !latest.current.sheet) {
          setSheet({type:"smart"}); setError("");
        }
      }
    } finally {
      if (abort.current === control) {
        abort.current = null;
        setBusy(false);
      }
    }
  };
  const updatePost = (id: string, change: Partial<Post>) =>
    setState((s) => ({
      ...s,
      social: {
        ...s.social,
        posts: s.social.posts.map((p) =>
          p.id === id ? { ...p, ...change } : p,
        ),
      },
    }));
  return {
    draft,
    setDraft,
    intakeRecovery,
    setIntakeRecovery,
    state,
    setState,
    ready,
    tab,
    setTab,
    sheet,
    setSheet,
    open,
    notice,
    setNotice,
    busy,
    stage,
    error,
    setError,
    unread,
    start,
    feedback,
    updatePost,
    supplement,
    setSupplement,
    intakePreset,
    setIntakePreset,
    incoming,
    cancel: () => {
      abort.current?.abort();
      setNotice("已取消");
    },
    retry: () => incoming.current && void start(incoming.current),
    uid,
  };
}
const Context = createContext<ReturnType<typeof useStore> | null>(null);
export function Provider({ children }: { children: ReactNode }) {
  const value = useStore();
  return <Context.Provider value={value}>{children}</Context.Provider>;
}
export function useApp() {
  const c = useContext(Context);
  if (!c) throw Error("App provider missing");
  return c;
}
