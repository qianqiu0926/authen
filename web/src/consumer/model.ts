import type { Farm } from "./farm";
import type { Report } from "../types";
export type Tab = "百宝箱" | "动态" | "游乐场" | "我的";
export interface Comment {
  id: string;
  text: string;
  date: string;
  author: string;
}
export interface Post {
  id: string;
  title: string;
  text: string;
  category: string;
  author: string;
  image?: string;
  sourceURL?: string;
  sourceTitle?: string;
  publishedAt?: string;
  duration?: string;
  learningFocus?: string;
  watchPoints?: string[];
  isMine?: boolean;
  liked?: boolean;
  bookmarked?: boolean;
  comments: Comment[];
  date: string;
}
export interface Piece {
  id: string;
  kind: string;
  x: number;
  z: number;
  angle: number;
  visible: boolean;
}
export interface Layout {
  style: string;
  pieces: Piece[];
}
export interface Ledger {
  id: string;
  title: string;
  amount: number;
  date: string;
}
export interface Social {
  posts: Post[];
  leaves: number;
  ledger: Ledger[];
  rewards: string[];
  roomItems: string[];
  room: Layout;
}
export interface AppState {
  slicerBest?: number;
  farm?: Farm;
  growth?: string[];
  social: Social;
  reports: (Report & { saved?: boolean })[];
  settings: {
    ai: boolean;
    motion: boolean;
    haptics: boolean;
    sound: boolean;
    speech: boolean;
  };
}
export function growthProgress(state: AppState) {
  const completed = new Set(state.growth || []);
  if (
    state.reports.some(
      (r) => !r.sample && r.analysisLabel?.startsWith("DeepSeek"),
    )
  )
    completed.add("check");
  if (state.reports.some((r) => !r.sample && r.saved)) completed.add("save");
  if (
    state.social.rewards.some((r) => ["matching-v1", "origin-v1", "slicer-v1"].includes(r))
  )
    completed.add("learn");
  return ["check", "save", "learn"].filter((k) => completed.has(k));
}
export const uid = () =>
  typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : Array.from(crypto.getRandomValues(new Uint8Array(16)), (n) =>
        n.toString(16).padStart(2, "0"),
      ).join("");
export const catalog = [
  { id: "vanity", title: "梳妆台", width: 2.15, depth: 0.84 },
  { id: "shelf", title: "香氛架", width: 1.22, depth: 0.72 },
  { id: "sofa", title: "小沙发", width: 1.8, depth: 0.95 },
  { id: "stool", title: "绒面凳", width: 0.7, depth: 0.7 },
  { id: "rug", title: "花瓣地毯", width: 3.6, depth: 2.7 },
  { id: "table", title: "小圆桌", width: 1, depth: 1 },
  { id: "plant", title: "绿植", width: 0.65, depth: 0.65 },
  { id: "lamp", title: "落地灯", width: 0.62, depth: 0.62 },
  { id: "lipstick", title: "口红展台", width: 0.55, depth: 0.55 },
];
export const initialRoom = (): Layout => ({
  style: "樱桃红",
  pieces: [
    ["vanity", -0.7, -2.08, 0],
    ["shelf", 2.12, -2.11, 0],
    ["sofa", -2.55, 0.25, 90],
    ["stool", -0.7, -0.94, 0],
    ["rug", 0, 0.65, 0],
    ["table", 0.32, 0.9, 0],
    ["plant", 2.5, 1.65, 0],
    ["lamp", -2.5, 1.94, 0],
  ].map(([id, x, z, angle]) => ({
    id: String(id),
    kind: String(id),
    x: Number(x),
    z: Number(z),
    angle: Number(angle),
    visible: true,
  })),
});
export function extents(p: Piece) {
  const spec = catalog.find((s) => s.id === p.kind)!;
  const a = (p.angle * Math.PI) / 180;
  return {
    x:
      (Math.abs(Math.cos(a)) * spec.width +
        Math.abs(Math.sin(a)) * spec.depth) /
      2,
    z:
      (Math.abs(Math.sin(a)) * spec.width +
        Math.abs(Math.cos(a)) * spec.depth) /
      2,
  };
}
export function bounded(piece: Piece) {
  const p = { ...piece, angle: ((piece.angle % 360) + 360) % 360 },
    e = extents(p);
  p.x = Math.min(3.13 - e.x, Math.max(-3.13 + e.x, p.x));
  p.z = Math.min(2.53 - e.z, Math.max(-2.53 + e.z, p.z));
  return p;
}
export function overlaps(layout: Layout, p: Piece) {
  if (p.kind === "rug" || !p.visible) return false;
  const a = extents(p);
  return layout.pieces.some((q) => {
    if (q.id === p.id || !q.visible || q.kind === "rug") return false;
    const b = extents(q);
    return (
      Math.abs(p.x - q.x) < a.x + b.x - 0.06 &&
      Math.abs(p.z - q.z) < a.z + b.z - 0.06
    );
  });
}
export function movePiece(
  layout: Layout,
  id: string,
  change: Partial<Piece>,
): Layout {
  const piece = layout.pieces.find((p) => p.id === id);
  if (!piece) return layout;
  const next = bounded({ ...piece, ...change });
  if (overlaps(layout, next)) return layout;
  return {
    ...layout,
    pieces: layout.pieces.map((p) => (p.id === id ? next : p)),
  };
}
export function placePiece(layout: Layout, kind: string): Layout {
  const old = layout.pieces.find((p) => p.kind === kind);
  if (old?.visible) return layout;
  const base = old || { id: kind, kind, x: 0, z: 0, angle: 0, visible: true };
  for (let z = 1.8; z >= -1.8; z -= 0.4)
    for (let x = 2.6; x >= -2.6; x -= 0.4) {
      const p = bounded({ ...base, x, z, visible: true });
      if (!overlaps(layout, p))
        return {
          ...layout,
          pieces: old
            ? layout.pieces.map((q) => (q.id === p.id ? p : q))
            : [...layout.pieces, p],
        };
    }
  return layout;
}
export function earn(
  s: Social,
  key: string,
  title: string,
  amount = 10,
): Social {
  if (s.rewards.includes(key)) return s;
  return {
    ...s,
    rewards: [...s.rewards, key],
    leaves: s.leaves + amount,
    ledger: [
      { id: uid(), title, amount, date: new Date().toISOString() },
      ...s.ledger,
    ],
  };
}
export function buy(s: Social, name: string, cost: number): Social {
  if (s.roomItems.includes(name) || s.leaves < cost) return s;
  return {
    ...s,
    leaves: s.leaves - cost,
    roomItems: [...s.roomItems, name],
    ledger: [
      { id: uid(), title: name, amount: -cost, date: new Date().toISOString() },
      ...s.ledger,
    ],
  };
}
export function viewport(w: number, h: number) {
  const mobile = w <= 600;
  if (mobile) return { mobile, width: w, height: h, scale: 1 };
  return {
    mobile,
    width: 402,
    height: 874,
    scale: Math.min(1, (w - 44) / 414, (h - 44) / 886),
  };
}
