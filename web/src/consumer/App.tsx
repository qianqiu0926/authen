import SmartIntake from "./SmartIntake";
import {
  lazy,
  Suspense,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent,
} from "react";
import {
  BatteryCharging,
  Check,
  LoaderCircle,
  Signal,
  Wifi,
  X,
} from "lucide-react";
import { Provider, useApp } from "./store";
import { Feed, Profile, Toolbox } from "./pages";
import { Games, Wallet } from "./Games";
import {
  Compose,
  Helper,
  Intake,
  PostDetail,
  Result,
  Samples,
  SettingsSheet,
} from "./sheets";
import { art, Icon, Sheet } from "./ui";
import { scenarios } from "./scenarios";
import { viewport, type Tab } from "./model";
import { normalize } from "../media";
import type { Kind } from "../types";
import "./app.css";
const Garden = lazy(() => import("./Garden"));
const Room = lazy(() => import("./Room"));
function FloatingPet() {
  const { open, start, setNotice, sheet, tab } = useApp(),
    [position, setPosition] = useState({ left: false, y: 0 }),
    [drag, setDrag] = useState({ x: 0, y: 0 }),
    [menu, setMenu] = useState(false),
    begin = useRef<{ x: number; y: number; ratio: number } | null>(null),
    moved = useRef(false);
  const down = (e: PointerEvent<HTMLButtonElement>) => {
    const phone = e.currentTarget.closest(".phone")!;
    begin.current = {
      x: e.clientX,
      y: e.clientY,
      ratio:
        (phone as HTMLElement).clientWidth /
        phone.getBoundingClientRect().width,
    };
    moved.current = false;
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const move = (e: PointerEvent<HTMLButtonElement>) => {
    if (!begin.current) return;
    const x = (e.clientX - begin.current.x) * begin.current.ratio,
      y = (e.clientY - begin.current.y) * begin.current.ratio;
    if (Math.abs(x) + Math.abs(y) > 8) {
      moved.current = true;
      if (menu) setMenu(false);
    }
    setDrag({ x, y });
  };
  const up = (e: PointerEvent<HTMLButtonElement>) => {
    if (!begin.current) return;
    const phone = e.currentTarget.closest(".phone")!,
      rect = phone.getBoundingClientRect();
    if (moved.current)
      setPosition((p) => ({
        left: e.clientX < rect.left + rect.width / 2,
        y: Math.min(
          0,
          Math.max(-(phone as HTMLElement).clientHeight + 240, p.y + drag.y),
        ),
      }));
    begin.current = null;
    setDrag({ x: 0, y: 0 });
  };
  useEffect(() => {
    if (sheet) setMenu(false);
  }, [sheet]);
  useEffect(() => {
    setMenu(false);
  }, [tab]);
  useEffect(() => {
    if (!menu) return;
    const close = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenu(false);
    };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [menu]);
  const pick = (scenario: (typeof scenarios)[number]) => {
    setMenu(false);
    open("smart", undefined, { scenario: scenario.id, focus: scenario.focus });
  };
  return (
    <>
      <button
        className={"floating-pet " + (position.left ? "left" : "") + (menu ? " is-open" : "")}
        aria-label={menu ? "收起场景" : "打开场景"}
        aria-haspopup="dialog"
        aria-expanded={menu}
        style={{ transform: `translate(${drag.x}px,${position.y + drag.y}px)` }}
        onClick={() => {
          if (!moved.current) setMenu((m) => !m);
        }}
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onPointerCancel={() => {
          begin.current = null;
          setDrag({ x: 0, y: 0 });
        }}
        onDragOver={(e) => e.preventDefault()}
        onDrop={async (e) => {
          e.preventDefault();
          const files = Array.from(e.dataTransfer.files);
          try {
            if (files[0]?.type.startsWith("image/"))
              await start({
                kind: "image",
                images: await Promise.all(files.slice(0, 5).map(normalize)),
                text: "",
              });
            else if (files[0]?.type.startsWith("video/"))
              await start({
                kind: "video",
                images: [],
                text: "",
                video: files[0],
              });
            else if (files[0]?.type.startsWith("audio/"))
              await start({
                kind: "audio",
                images: [],
                text: "",
                audio: files[0],
              });
            else {
              const text = e.dataTransfer.getData("text/plain");
              if (text.trim())
                await start({
                  kind: /^https?:\/\//.test(text) ? "link" : "text",
                  images: [],
                  text,
                  url: /^https?:\/\//.test(text) ? text : undefined,
                });
            }
          } catch {
            setNotice("这份素材没读到，再试一次");
          }
        }}
      >
        <img src={art("character-curious-bust")} alt="" draggable={false} />
      </button>
      {menu && (
        <>
          <div className="pet-menu-backdrop" aria-hidden="true" onClick={() => setMenu(false)} />
          <div
            className={"pet-menu " + (position.left ? "left" : "right")}
            role="dialog"
            aria-label="选择要查的场景"
          >
            <header>
              <div>
                <b>想查哪一类？</b>
                <small>点一下，直接进对应入口</small>
              </div>
              <button className="pet-menu-close" aria-label="收起" onClick={() => setMenu(false)}>
                ×
              </button>
            </header>
            <div className="pet-menu-grid">
              {scenarios.map((s) => (
                <button key={s.id} className="pet-scene" onClick={() => pick(s)}>
                  <Icon name={s.icon} size={30} />
                  <span>
                    <b>{s.name}</b>
                    <small>{s.short}</small>
                  </span>
                  <em>{s.group}</em>
                </button>
              ))}
            </div>
            <button
              className="pet-menu-more"
              onClick={() => {
                setMenu(false);
                open("helper");
              }}
            >
              不知道选哪个？让助手看一眼
            </button>
          </div>
        </>
      )}
    </>
  );
}
function AppShell() {
  const app = useApp(),
    [size, setSize] = useState(() =>
      viewport(window.innerWidth, window.innerHeight),
    ),
    [clock, setClock] = useState(new Date()),
    scroller = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const update = () =>
      setSize(
        viewport(
          window.innerWidth,
          window.visualViewport?.height || window.innerHeight,
        ),
      );
    window.addEventListener("resize", update);
    window.visualViewport?.addEventListener("resize", update);
    const tick = setInterval(() => setClock(new Date()), 60000);
    return () => {
      window.removeEventListener("resize", update);
      window.visualViewport?.removeEventListener("resize", update);
      clearInterval(tick);
    };
  }, []);
  useEffect(() => {
    scroller.current?.scrollTo(0, 0);
  }, [app.tab]);
  const input =
    app.sheet &&
    ["image", "video", "text", "link", "audio", "comments"].includes(
      app.sheet.type,
    )
      ? (app.sheet.type as Kind)
      : null;
  return (
    <div
      className={"app-stage " + (size.mobile ? "on-mobile" : "on-desktop")}
      style={
        {
          "--device-scale": size.scale,
          "--mobile-height": size.height + "px",
        } as CSSProperties
      }
    >
      <div
        className={
          "device-frame " + (!app.state.settings.motion ? "reduce-motion" : "")
        }
      >
        <div className="phone">
          <div className="phone-status" aria-hidden="true">
            <b>
              {clock.toLocaleTimeString("en-GB", {
                hour: "2-digit",
                minute: "2-digit",
              })}
            </b>
            <i className="dynamic-island" />
            <span>
              <Signal size={16} />
              <Wifi size={17} />
              <BatteryCharging size={24} />
            </span>
          </div>
          <div className="app-body" inert={!!app.sheet}>
            <div className="main-scroll" ref={scroller}>
              {app.tab === "百宝箱" ? (
                <Toolbox />
              ) : app.tab === "动态" ? (
                <Feed />
              ) : app.tab === "我的" ? (
                <Profile />
              ) : null}
              <div hidden={app.tab !== "游乐场"}><Games /></div>
            </div>
            {(app.busy || app.unread || app.error) && (
              <div className="activity-bar" role="status">
                {app.busy ? (
                  <>
                    <LoaderCircle className="spin" size={17} />
                    <span>{app.stage}</span>
                    <button onClick={app.cancel}>取消</button>
                  </>
                ) : app.error ? (
                  <>
                    <span>{app.error}</span>
                    <button onClick={app.retry}>重试</button>
                    <button
                      onClick={() => {
                        app.setDraft(
                          app.incoming.current?.text ||
                            app.incoming.current?.url ||
                            "",
                        );
                        app.setError("");
                        app.open("smart");
                      }}
                    >
                      补充内容
                    </button>
                    <button
                      aria-label="关闭提示"
                      onClick={() => app.setError("")}
                    >
                      <X size={16} />
                    </button>
                  </>
                ) : (
                  <>
                    <Check size={16} />
                    <span>资料卡好了</span>
                    <button onClick={() => app.open("card", app.unread!)}>
                      打开
                    </button>
                  </>
                )}
              </div>
            )}
            <nav className="bottom-nav" aria-label="APP 导航">
              {(["百宝箱", "动态", "游乐场", "我的"] as Tab[]).map((tab, i) => (
                <button
                  key={tab}
                  aria-label={"导航-" + tab}
                  aria-current={app.tab === tab ? "page" : undefined}
                  className={app.tab === tab ? "selected" : ""}
                  onClick={() => {
                    app.setTab(tab);
                    app.feedback();
                  }}
                >
                  <Icon
                    name={["box", "social", "game", "notebook"][i]}
                    size={34}
                  />
                  <span>{tab}</span>
                </button>
              ))}
            </nav>
            <div className="home-indicator">
              <i />
            </div>
            <FloatingPet />
          </div>
          {app.sheet &&
            (input || app.sheet.type === "smart" ? (
              <SmartIntake />
            ) : app.sheet.type === "samples" ? (
              <Samples />
            ) : app.sheet.type === "settings" ? (
              <SettingsSheet />
            ) : app.sheet.type === "helper" ? (
              <Helper />
            ) : app.sheet.type === "card" ? (
              <Result id={app.sheet.id!} />
            ) : app.sheet.type === "post" ? (
              <PostDetail id={app.sheet.id!} />
            ) : app.sheet.type === "compose" ? (
              <Compose />
            ) : app.sheet.type === "wallet" ? (
              <Wallet />
            ) : app.sheet.type === "farm" ? (
              <Suspense fallback={<Sheet title="我的美妆花园"><div className="garden-loading">花园正在苏醒…</div></Sheet>}><Garden /></Suspense>
            ) : app.sheet.type === "room" ? (
              <Suspense
                fallback={
                  <Sheet title="美妆小屋">
                    <div className="room-loading">
                      <LoaderCircle className="spin" />
                      正在打开小屋
                    </div>
                  </Sheet>
                }
              >
                <Room />
              </Suspense>
            ) : null)}
          {app.notice && (
            <div className="app-toast" role="status">
              {app.notice}
            </div>
          )}
          {!app.ready && (
            <div className="app-loading">
              <img src={art("character-curious-bust")} alt="" />
              <b>AUTHEN</b>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
export default function ConsumerApp() {
  return (
    <Provider>
      <AppShell />
    </Provider>
  );
}
