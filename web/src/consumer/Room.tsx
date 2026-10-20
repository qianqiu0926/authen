import { useEffect, useRef, useState } from "react";
import * as T from "three";
import {
  Archive,
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  Armchair,
  Check,
  Circle,
  LampFloor,
  Leaf,
  RotateCcw,
  RotateCw,
  Sofa,
  Sparkles,
  Square,
  Undo2,
  View,
  Columns3,
} from "lucide-react";
import { useApp } from "./store";
import { Sheet } from "./ui";
import {
  bounded,
  buy,
  catalog,
  initialRoom,
  movePiece,
  placePiece,
  type Layout,
} from "./model";
import { createScene, disposeScene, furniture } from "./roomScene";
const furnitureIcons = [
  Square,
  Columns3,
  Sofa,
  Armchair,
  Circle,
  Circle,
  Leaf,
  LampFloor,
  Sparkles,
];
function RoomCanvas({
  layout,
  editing,
  selected,
  reset,
  onSelect,
  onStart,
  onDrag,
  onEnd,
}: {
  layout: Layout;
  editing: boolean;
  selected: string;
  reset: number;
  onSelect: (id: string) => void;
  onStart: () => void;
  onDrag: (id: string, x: number, z: number) => void;
  onEnd: () => void;
}) {
  const host = useRef<HTMLDivElement>(null),
    current = useRef({
      layout,
      editing,
      selected,
      onSelect,
      onStart,
      onDrag,
      onEnd,
    }),
    render = useRef<() => void>(() => {}),
    sync = useRef<() => void>(() => {}),
    resetCamera = useRef<() => void>(() => {}),
    [error, setError] = useState("");
  current.current = {
    layout,
    editing,
    selected,
    onSelect,
    onStart,
    onDrag,
    onEnd,
  };
  useEffect(() => {
    const el = host.current!;
    let renderer: T.WebGLRenderer;
    try {
      renderer = new T.WebGLRenderer({ antialias: true, alpha: false });
    } catch {
      setError("这个浏览器暂时不能显示 3D，换用 Safari 或 Chrome 试试。");
      return;
    }
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = T.PCFSoftShadowMap;
    renderer.outputColorSpace = T.SRGBColorSpace;
    renderer.toneMapping = T.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.15;
    el.appendChild(renderer.domElement);
    const canvas = renderer.domElement;
    canvas.setAttribute("aria-label", "可旋转、缩放和摆放家具的3D小屋");
    let scene = createScene(current.current.layout),
      lastStyle = layout.style,
      selection: T.LineLoop | undefined;
    const camera = new T.OrthographicCamera(-4, 4, 4, -4, 0.1, 60);
    let yaw = 0.64,
      elevation = 0.6,
      zoom = 4.35,
      frame = 0;
    const ray = new T.Raycaster(),
      pointer = new T.Vector2(),
      plane = new T.Plane(new T.Vector3(0, 1, 0), 0);
    const pointers = new Map<number, { x: number; y: number }>();
    let dragID: string | null = null,
      offset = new T.Vector3(),
      pinch = 0;
    const draw = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => renderer.render(scene, camera));
    };
    render.current = draw;
    const setCamera = () => {
      const w = el.clientWidth,
        h = el.clientHeight,
        aspect = w / h;
      camera.left = -zoom * aspect;
      camera.right = zoom * aspect;
      camera.top = zoom;
      camera.bottom = -zoom;
      camera.position.set(
        Math.sin(yaw) * Math.cos(elevation) * 13,
        1.15 + Math.sin(elevation) * 13,
        Math.cos(yaw) * Math.cos(elevation) * 13,
      );
      camera.lookAt(0, 1.15, 0);
      camera.updateProjectionMatrix();
      draw();
    };
    resetCamera.current = () => {
      yaw = 0.64;
      elevation = 0.6;
      zoom = 4.35;
      setCamera();
    };
    const update = () => {
      const { layout, editing, selected } = current.current;
      if (lastStyle !== layout.style) {
        disposeScene(scene);
        scene = createScene(layout);
        selection = undefined;
        lastStyle = layout.style;
      } else {
        for (const child of scene.children) {
          if (
            child.userData.piece &&
            !layout.pieces.some((p) => p.id === child.userData.piece)
          )
            child.visible = false;
        }
        for (const p of layout.pieces) {
          let n = scene.getObjectByName("piece:" + p.id);
          if (!n) {
            n = furniture(p, layout.style);
            scene.add(n);
          }
          n.position.set(p.x, 0, p.z);
          n.rotation.y = (p.angle * Math.PI) / 180;
          n.visible = p.visible;
        }
      }
      if (selection) {
        scene.remove(selection);
        selection.geometry.dispose();
        (selection.material as T.Material).dispose();
        selection = undefined;
      }
      const piece = layout.pieces.find((p) => p.id === selected && p.visible);
      if (editing && piece) {
        const spec = catalog.find((c) => c.id === piece.kind)!,
          w = spec.width / 2 + 0.05,
          d = spec.depth / 2 + 0.05;
        selection = new T.LineLoop(
          new T.BufferGeometry().setFromPoints([
            new T.Vector3(-w, 0.1, -d),
            new T.Vector3(w, 0.1, -d),
            new T.Vector3(w, 0.1, d),
            new T.Vector3(-w, 0.1, d),
          ]),
          new T.LineBasicMaterial({ color: 0xb52b32, depthTest: false }),
        );
        selection.position.set(piece.x, 0, piece.z);
        selection.rotation.y = (piece.angle * Math.PI) / 180;
        selection.renderOrder = 10;
        scene.add(selection);
      }
      draw();
    };
    sync.current = update;
    const cast = (x: number, y: number) => {
      const r = canvas.getBoundingClientRect();
      pointer.set(
        ((x - r.left) / r.width) * 2 - 1,
        (-(y - r.top) / r.height) * 2 + 1,
      );
      camera.updateMatrixWorld();
      ray.setFromCamera(pointer, camera);
    };
    const floor = (x: number, y: number) => {
      cast(x, y);
      return ray.ray.intersectPlane(plane, new T.Vector3());
    };
    const hit = (x: number, y: number) => {
      cast(x, y);
      for (const found of ray.intersectObjects(scene.children, true)) {
        let n: T.Object3D | null = found.object;
        while (n) {
          if (n.userData.piece && n.visible) return String(n.userData.piece);
          n = n.parent;
        }
      }
      return null;
    };
    const distance = () => {
      const [a, b] = Array.from(pointers.values());
      return Math.hypot(a.x - b.x, a.y - b.y);
    };
    const down = (e: PointerEvent) => {
      canvas.setPointerCapture(e.pointerId);
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pointers.size === 2) {
        pinch = distance();
        if (dragID) {
          current.current.onEnd();
          dragID = null;
        }
        return;
      }
      if (current.current.editing) {
        const id = hit(e.clientX, e.clientY),
          pos = floor(e.clientX, e.clientY);
        if (id && pos) {
          const p = current.current.layout.pieces.find((p) => p.id === id)!;
          current.current.onSelect(id);
          current.current.onStart();
          dragID = id;
          offset.set(p.x - pos.x, 0, p.z - pos.z);
        }
      }
    };
    const move = (e: PointerEvent) => {
      const old = pointers.get(e.pointerId);
      if (!old) return;
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pointers.size === 2) {
        const d = distance();
        zoom = Math.max(2.8, Math.min(6.4, (zoom * pinch) / d));
        pinch = d;
        setCamera();
        return;
      }
      if (dragID) {
        const pos = floor(e.clientX, e.clientY);
        if (pos)
          current.current.onDrag(dragID, pos.x + offset.x, pos.z + offset.z);
      } else {
        const scale = el.clientWidth / canvas.getBoundingClientRect().width;
        yaw = Math.max(
          0.12,
          Math.min(1.35, yaw - (e.clientX - old.x) * 0.006 * scale),
        );
        elevation = Math.max(
          0.32,
          Math.min(1.05, elevation + (e.clientY - old.y) * 0.004 * scale),
        );
        setCamera();
      }
    };
    const up = (e: PointerEvent) => {
      pointers.delete(e.pointerId);
      if (dragID) {
        current.current.onEnd();
        dragID = null;
      }
    };
    const wheel = (e: WheelEvent) => {
      e.preventDefault();
      zoom = Math.max(2.8, Math.min(6.4, zoom + e.deltaY * 0.004));
      setCamera();
    };
    canvas.addEventListener("pointerdown", down);
    canvas.addEventListener("pointermove", move);
    canvas.addEventListener("pointerup", up);
    canvas.addEventListener("pointercancel", up);
    canvas.addEventListener("wheel", wheel, { passive: false });
    const resize = new ResizeObserver(() => {
      renderer.setSize(el.clientWidth, el.clientHeight);
      setCamera();
    });
    resize.observe(el);
    renderer.setSize(el.clientWidth, el.clientHeight);
    setCamera();
    update();
    return () => {
      resize.disconnect();
      canvas.removeEventListener("pointerdown", down);
      canvas.removeEventListener("pointermove", move);
      canvas.removeEventListener("pointerup", up);
      canvas.removeEventListener("pointercancel", up);
      canvas.removeEventListener("wheel", wheel);
      cancelAnimationFrame(frame);
      disposeScene(scene);
      renderer.dispose();
      canvas.remove();
      sync.current = () => {};
      resetCamera.current = () => {};
    };
  }, []);
  useEffect(() => sync.current(), [layout, editing, selected]);
  useEffect(() => resetCamera.current(), [reset]);
  return (
    <div className="room-canvas" ref={host}>
      {error && (
        <p role="alert" className="room-error">
          {error}
        </p>
      )}
    </div>
  );
}
export default function Room() {
  const { state, setState, setSheet, setNotice } = useApp(),
    [layout, setLayout] = useState<Layout>(() =>
      structuredClone(state.social.room),
    ),
    [selected, setSelected] = useState("vanity"),
    [editing, setEditing] = useState(false),
    [section, setSection] = useState("家具"),
    [history, setHistory] = useState<Layout[]>([]),
    [message, setMessage] = useState("轻扫转动视角，双指缩放"),
    [reset, setReset] = useState(0),
    [confirm, setConfirm] = useState<"reset" | "leave" | null>(null),
    dragStart = useRef<Layout | null>(null),
    layoutRef = useRef(layout);
  layoutRef.current = layout;
  const piece = layout.pieces.find((p) => p.id === selected && p.visible),
    dirty = JSON.stringify(layout) !== JSON.stringify(state.social.room);
  const commit = (next: Layout) => {
    if (next === layout) {
      setMessage("这里有家具，换个位置试试");
      return;
    }
    setHistory((h) => [...h, layout].slice(-40));
    setLayout(next);
    setMessage("摆好后，记得保存布置");
  };
  const move = (change: { x?: number; z?: number; angle?: number }) => {
    if (piece) commit(movePiece(layout, piece.id, change));
  };
  const save = () => {
    setState((s) => ({ ...s, social: { ...s.social, room: layout } }));
    setMessage("布置已保存，下次回家还是这样");
    setNotice("小屋已保存");
  };
  const choose = (id: string) => {
    const locked =
      id === "lipstick" && !state.social.roomItems.includes("口红展台");
    if (locked && state.social.leaves < 10) {
      setMessage("游乐场完成一关，得 10 片小叶子");
      return;
    }
    const next = placePiece(layout, id);
    if (!next.pieces.find((p) => p.id === id && p.visible)) {
      setMessage("先收起一件家具，腾点位置吧");
      return;
    }
    if (locked)
      setState((s) => ({ ...s, social: buy(s.social, "口红展台", 10) }));
    if (next !== layout) commit(next);
    setSelected(id);
    setEditing(true);
    setMessage("拖动家具，或用下方按钮微调");
  };
  const controls = piece
    ? [
        {
          label: "左转",
          Icon: RotateCcw,
          run: () => move({ angle: piece.angle - 45 }),
        },
        {
          label: "右转",
          Icon: RotateCw,
          run: () => move({ angle: piece.angle + 45 }),
        },
        {
          label: "向左移动",
          Icon: ArrowLeft,
          run: () => move({ x: piece.x - 0.2 }),
        },
        {
          label: "向右移动",
          Icon: ArrowRight,
          run: () => move({ x: piece.x + 0.2 }),
        },
        {
          label: "向后移动",
          Icon: ArrowUp,
          run: () => move({ z: piece.z - 0.2 }),
        },
        {
          label: "向前移动",
          Icon: ArrowDown,
          run: () => move({ z: piece.z + 0.2 }),
        },
        {
          label: "收起家具",
          Icon: Archive,
          run: () =>
            commit({
              ...layout,
              pieces: layout.pieces.map((p) =>
                p.id === piece.id ? { ...p, visible: false } : p,
              ),
            }),
        },
      ]
    : [];
  return (
    <Sheet
      title="美妆小屋"
      room
      onClose={() => (dirty ? setConfirm("leave") : setSheet(null))}
      footer={
        <button disabled={!dirty} onClick={save}>
          {dirty ? "保存布置" : "已保存"}
        </button>
      }
    >
      <div className="room-scene-wrap">
        <RoomCanvas
          layout={layout}
          editing={editing}
          selected={selected}
          reset={reset}
          onSelect={setSelected}
          onStart={() => {
            dragStart.current = structuredClone(layoutRef.current);
          }}
          onDrag={(id, x, z) => {
            setLayout((l) => movePiece(l, id, { x, z }));
            setMessage("松手放下，保存后下次还在");
          }}
          onEnd={() => {
            const old = dragStart.current;
            if (
              old &&
              JSON.stringify(old) !== JSON.stringify(layoutRef.current)
            )
              setHistory((h) => [...h, old].slice(-40));
            dragStart.current = null;
          }}
        />
        <div className="room-scene-toolbar">
          <span>{layout.style} · 私人梳妆间</span>
          <button aria-label="回到正面" onClick={() => setReset(reset + 1)}>
            <View size={20} />
          </button>
        </div>
      </div>
      <div className="room-editor">
        <header>
          <div>
            <h2>{editing ? "让喜欢，各就各位" : "我的美妆小屋"}</h2>
            <p role="status">{message}</p>
          </div>
          <button
            className="small-red"
            onClick={() => {
              setEditing(!editing);
              setMessage(
                editing ? "轻扫转动视角，双指缩放" : "点选家具，再拖动或旋转",
              );
            }}
          >
            {editing ? "看全景" : "布置小屋"}
          </button>
        </header>
        {editing ? (
          <div className="furniture-controls card">
            {piece ? (
              <>
                <header>
                  <b>{catalog.find((c) => c.id === piece.kind)?.title}</b>
                  <span aria-label="家具角度">{Math.round(piece.angle)}°</span>
                  <small aria-label="家具位置">
                    X {piece.x.toFixed(1)} · Y {piece.z.toFixed(1)}
                  </small>
                </header>
                <div>
                  {controls.map((c) => (
                    <button aria-label={c.label} key={c.label} onClick={c.run}>
                      <c.Icon size={17} />
                    </button>
                  ))}
                </div>
              </>
            ) : (
              <p>从下面选一件家具，开始布置</p>
            )}
          </div>
        ) : (
          <div className="room-stats">
            {[
              ["8+", "家具装饰"],
              ["3", "房间配色"],
              ["360°", "自由摆放"],
            ].map(([n, t]) => (
              <div className="card" key={t}>
                <b>{n}</b>
                <small>{t}</small>
              </div>
            ))}
          </div>
        )}
        <div className="room-section">
          <button
            className={section === "家具" ? "selected" : ""}
            onClick={() => setSection("家具")}
          >
            家具
          </button>
          <button
            className={section === "配色" ? "selected" : ""}
            onClick={() => setSection("配色")}
          >
            配色
          </button>
          <span />
          <button
            disabled={!history.length}
            onClick={() => {
              setLayout(history[history.length - 1]);
              setHistory((h) => h.slice(0, -1));
              setMessage("已撤销上一步");
            }}
          >
            <Undo2 size={16} />
            撤销
          </button>
          <button aria-label="重置小屋" onClick={() => setConfirm("reset")}>
            <RotateCcw size={19} />
          </button>
        </div>
        {section === "家具" ? (
          <div className="furniture-tray">
            {catalog.map((c, i) => {
              const I = furnitureIcons[i],
                placed = layout.pieces.find((p) => p.id === c.id && p.visible),
                locked =
                  c.id === "lipstick" &&
                  !state.social.roomItems.includes("口红展台");
              return (
                <button
                  aria-label={"家具-" + c.id}
                  className={
                    "card " + (selected === c.id && editing ? "selected" : "")
                  }
                  key={c.id}
                  onClick={() => choose(c.id)}
                >
                  <I size={25} />
                  <b>{c.title}</b>
                  <small>
                    {locked ? "10 片叶子" : placed ? "已摆放" : "放进小屋"}
                  </small>
                </button>
              );
            })}
          </div>
        ) : (
          <div className="room-palettes">
            {["樱桃红", "奶油白", "玫瑰粉"].map((name, i) => (
              <button
                className="card"
                key={name}
                onClick={() => {
                  if (name !== layout.style) commit({ ...layout, style: name });
                }}
              >
                <span
                  style={{ background: ["#b52b32", "#d3b996", "#d18c9e"][i] }}
                >
                  {layout.style === name && <Check size={20} />}
                </span>
                {name}
              </button>
            ))}
          </div>
        )}
      </div>
      {confirm && (
        <div
          className="room-confirm"
          role="alertdialog"
          aria-label={
            confirm === "reset" ? "恢复最初的家具摆放？" : "这次布置还没保存"
          }
        >
          <div className="card">
            <h3>
              {confirm === "reset"
                ? "恢复最初的家具摆放？"
                : "这次布置还没保存"}
            </h3>
            {confirm === "reset" ? (
              <button
                onClick={() => {
                  commit(initialRoom());
                  setReset(reset + 1);
                  setConfirm(null);
                }}
              >
                恢复初始布置
              </button>
            ) : (
              <>
                <button
                  onClick={() => {
                    save();
                    setSheet(null);
                  }}
                >
                  保存并离开
                </button>
                <button onClick={() => setSheet(null)}>放弃这次修改</button>
              </>
            )}
            <button onClick={() => setConfirm(null)}>
              {confirm === "reset" ? "取消" : "继续布置"}
            </button>
          </div>
        </div>
      )}
    </Sheet>
  );
}
