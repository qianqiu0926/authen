import * as T from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import type { Layout, Piece } from "./model";
const ivory = 0xf5e9d8,
  gold = 0xbda486,
  wood = 0xc3a184;
function texture(kind: string, color = "#f5e9d8") {
  const c = document.createElement("canvas");
  c.width = 512;
  c.height = 512;
  const x = c.getContext("2d")!;
  x.fillStyle = color;
  x.fillRect(0, 0, 512, 512);
  if (kind === "wood") {
    for (let i = 0; i < 220; i++) {
      const y = (i * 173) % 512;
      x.strokeStyle = `rgba(88,59,38,${0.02 + (i % 5) * 0.008})`;
      x.lineWidth = (i % 3) + 0.4;
      x.beginPath();
      x.moveTo(0, y);
      x.bezierCurveTo(130, y - 6, 310, y + 4, 512, y + (i % 13) - 6);
      x.stroke();
    }
  } else if (kind === "fabric") {
    for (let i = 0; i < 512; i += 3) {
      x.strokeStyle = i % 2 ? "#ffffff10" : "#0000000b";
      x.lineWidth = 1;
      x.beginPath();
      x.moveTo(i, 0);
      x.lineTo(i, 512);
      x.moveTo(0, i);
      x.lineTo(512, i);
      x.stroke();
    }
  } else if (kind === "marble") {
    for (let i = 0; i < 12; i++) {
      x.strokeStyle = "#b8a69c24";
      x.lineWidth = (i % 3) + 0.3;
      x.beginPath();
      x.moveTo(i * 72 - 200, 0);
      x.bezierCurveTo(i * 60 + 60, 160, i * 70 - 100, 300, i * 72 + 100, 512);
      x.stroke();
    }
  } else if (kind === "mirror" || kind === "window") {
    const gr = x.createLinearGradient(0, 0, 512, 512);
    gr.addColorStop(0, kind === "mirror" ? "#8ca4ab" : "#bdd9dd");
    gr.addColorStop(1, "#f7ecdd");
    x.fillStyle = gr;
    x.fillRect(0, 0, 512, 512);
    if (kind === "window") {
      for (let i = 0; i < 20; i++) {
        x.fillStyle = i % 2 ? "#94b39b" : "#b5c6ad";
        x.beginPath();
        x.ellipse(i * 35 - 20, 430 + (i % 4) * 28, 65, 100, 0, 0, Math.PI * 2);
        x.fill();
      }
    } else {
      x.fillStyle = "#ffffff40";
      x.beginPath();
      x.moveTo(0, 70);
      x.lineTo(512, 390);
      x.lineTo(512, 430);
      x.lineTo(0, 110);
      x.fill();
    }
  } else if (kind === "art") {
    x.fillStyle = "#a44a54";
    x.beginPath();
    x.arc(256, 260, 160, 0, Math.PI * 2);
    x.fill();
    x.fillStyle = color;
    x.beginPath();
    x.arc(256, 260, 65, 0, Math.PI * 2);
    x.fill();
    x.fillStyle = "#7d4c40";
    x.textAlign = "center";
    x.font = "30px Georgia";
    x.fillText("BEAUTY", 256, 63);
    x.font = "italic 20px Georgia";
    x.fillText("little rituals, every day", 256, 475);
  }
  const tex = new T.CanvasTexture(c);
  tex.colorSpace = T.SRGBColorSpace;
  return tex;
}
const mat = (
  color: T.ColorRepresentation,
  metalness = 0,
  roughness = 0.7,
  map?: T.Texture,
) =>
  new T.MeshStandardMaterial({ color, metalness, roughness, map: map ?? null });
function mesh(
  g: T.BufferGeometry,
  m: T.Material,
  p: T.Object3D,
  x = 0,
  y = 0,
  z = 0,
) {
  const n = new T.Mesh(g, m);
  n.position.set(x, y, z);
  n.castShadow = true;
  n.receiveShadow = true;
  p.add(n);
  return n;
}
function box(
  w: number,
  h: number,
  d: number,
  m: T.Material,
  p: T.Object3D,
  x = 0,
  y = 0,
  z = 0,
  r = 0.025,
) {
  return mesh(
    new RoundedBoxGeometry(w, h, d, 2, Math.min(r, w / 2, h / 2, d / 2)),
    m,
    p,
    x,
    y,
    z,
  );
}
function cyl(
  r: number,
  h: number,
  m: T.Material,
  p: T.Object3D,
  x = 0,
  y = 0,
  z = 0,
) {
  return mesh(new T.CylinderGeometry(r, r, h, 32), m, p, x, y, z);
}
function sphere(
  r: number,
  m: T.Material,
  p: T.Object3D,
  x = 0,
  y = 0,
  z = 0,
  scale = [1, 1, 1],
) {
  const n = mesh(new T.SphereGeometry(r, 16, 12), m, p, x, y, z);
  n.scale.set(...(scale as [number, number, number]));
  return n;
}
function rod(
  a: number[],
  b: number[],
  r: number,
  m: T.Material,
  p: T.Object3D,
) {
  const from = new T.Vector3(...(a as [number, number, number])),
    to = new T.Vector3(...(b as [number, number, number])),
    dir = to.clone().sub(from);
  const n = cyl(r, dir.length(), m, p);
  n.position.copy(from.add(to).multiplyScalar(0.5));
  n.quaternion.setFromUnitVectors(new T.Vector3(0, 1, 0), dir.normalize());
  return n;
}
function ring(
  r: number,
  tube: number,
  m: T.Material,
  p: T.Object3D,
  x = 0,
  y = 0,
  z = 0,
) {
  const n = mesh(new T.TorusGeometry(r, tube, 6, 48), m, p, x, y, z);
  n.rotation.x = Math.PI / 2;
  return n;
}
function perfume(
  p: T.Object3D,
  x: number,
  y: number,
  z: number,
  color: number,
) {
  box(0.16, 0.21, 0.105, mat(color, 0.1, 0.18), p, x, y + 0.105, z);
  box(0.1, 0.055, 0.075, mat(gold, 0.5, 0.28), p, x, y + 0.24, z, 0.009);
  box(0.09, 0.07, 0.006, mat(ivory), p, x, y + 0.11, z + 0.055, 0.005);
}
function lipstick(
  p: T.Object3D,
  x: number,
  y: number,
  z: number,
  red: T.Material,
) {
  box(0.065, 0.12, 0.065, mat(0x342d2a, 0, 0.3), p, x, y + 0.06, z, 0.008);
  cyl(0.022, 0.1, mat(gold, 0.6, 0.25), p, x, y + 0.16, z);
  cyl(0.02, 0.075, red, p, x, y + 0.23, z).rotation.z = 0.07;
}
export function furniture(piece: Piece, style: string) {
  const p = new T.Group();
  p.userData.piece = piece.id;
  p.name = "piece:" + piece.id;
  const accent =
    style === "奶油白" ? 0xcdb69d : style === "玫瑰粉" ? 0xce8d9e : 0xa63d4f;
  const cream = mat(ivory),
    brass = mat(gold, 0.55, 0.3),
    oak = mat(wood),
    red = mat(accent, 0, 0.5),
    soft = mat(accent, 0, 0.95, texture("fabric", "#ffffff")),
    pale = mat(0xead5c1, 0, 1, texture("fabric", "#ffffff"));
  switch (piece.kind) {
    case "vanity":
      for (const x of [-0.88, 0.88])
        for (const z of [-0.28, 0.28]) cyl(0.035, 0.83, brass, p, x, 0.44, z);
      box(2.1, 0.3, 0.76, cream, p, 0, 0.9, 0, 0.06);
      box(
        2.18,
        0.075,
        0.84,
        mat(0xfff7ec, 0, 0.24, texture("marble")),
        p,
        0,
        1.08,
        0,
        0.035,
      );
      for (const x of [-0.69, 0, 0.69]) {
        box(0.65, 0.23, 0.035, cream, p, x, 0.9, 0.39);
        cyl(0.025, 0.13, brass, p, x, 0.91, 0.426).rotation.z = Math.PI / 2;
      }
      const arch = new T.Shape();
      arch.moveTo(-0.52, 0);
      arch.lineTo(-0.52, 0.78);
      arch.absarc(0, 0.78, 0.52, Math.PI, 0, true);
      arch.lineTo(0.52, 0);
      arch.closePath();
      mesh(
        new T.ExtrudeGeometry(arch, {
          depth: 0.06,
          bevelEnabled: true,
          bevelSize: 0.012,
          bevelThickness: 0.012,
          bevelSegments: 2,
          steps: 1,
          curveSegments: 32,
        }),
        brass,
        p,
        0,
        1.12,
        -0.3,
      );
      const mirror = mesh(
        new T.ShapeGeometry(arch, 32),
        mat(0xffffff, 0.22, 0.12, texture("mirror")),
        p,
        0,
        1.16,
        -0.22,
      );
      mirror.scale.set(0.91, 0.94, 1);
      for (const x of [-0.58, 0.58])
        for (const y of [1.35, 1.7, 2.05]) {
          const m = mat(0xfff2ce);
          m.emissive.setHex(0x66513b);
          sphere(0.052, m, p, x, y, -0.2);
        }
      perfume(p, -0.82, 1.14, -0.08, 0xd69d94);
      perfume(p, -0.66, 1.14, 0.1, 0xc4ab73);
      cyl(0.16, 0.025, brass, p, 0.73, 1.13, 0.03);
      for (let i = 0; i < 3; i++) lipstick(p, i * 0.1 + 0.6, 1.15, 0.03, red);
      break;
    case "shelf":
      box(1.18, 2.35, 0.64, cream, p, 0, 1.27, 0, 0.06);
      box(1.02, 1.55, 0.05, red, p, 0, 1.6, 0.35, 0.02);
      for (const y of [0.8, 1.35, 1.91, 2.4])
        box(1.15, 0.055, 0.72, cream, p, 0, y, 0.1);
      for (const x of [-0.56, 0.56])
        box(0.07, 1.63, 0.72, cream, p, x, 1.61, 0.1);
      box(1.03, 0.53, 0.075, pale, p, 0, 0.47, 0.365);
      for (const x of [-0.26, 0.26]) sphere(0.035, brass, p, x, 0.48, 0.42);
      for (const x of [-0.45, 0.45]) {
        cyl(0.035, 0.19, brass, p, x, 0.1, 0.2);
        cyl(0.035, 0.19, brass, p, x, 0.1, -0.2);
      }
      perfume(p, -0.3, 1.95, 0.41, 0xd6b282);
      perfume(p, 0.18, 1.95, 0.4, 0xc18b9a);
      perfume(p, 0.36, 1.95, 0.4, 0xabbcae);
      for (let i = 0; i < 4; i++)
        box(
          0.075,
          0.32 + (i % 2) * 0.07,
          0.26,
          i % 2 === 0 ? cream : pale,
          p,
          -0.34 + i * 0.09,
          1.55,
          0.4,
        ).rotation.z = i === 0 ? 0.12 : 0;
      cyl(0.12, 0.18, red, p, 0.3, 1.47, 0.4);
      box(0.65, 0.2, 0.38, pale, p, 0, 0.93, 0.32, 0.03);
      box(0.17, 0.04, 0.02, brass, p, 0, 0.95, 0.52);
      break;
    case "sofa":
      for (const x of [-0.65, 0.65])
        for (const z of [-0.28, 0.28]) cyl(0.04, 0.23, oak, p, x, 0.14, z);
      box(1.75, 0.3, 0.83, soft, p, 0, 0.4, 0, 0.13);
      box(1.6, 0.65, 0.24, soft, p, 0, 0.79, -0.33, 0.12);
      for (const x of [-0.77, 0.77])
        box(0.23, 0.52, 0.83, soft, p, x, 0.66, 0, 0.115);
      for (const x of [-0.36, 0.36])
        box(0.68, 0.17, 0.65, soft, p, x, 0.59, 0.04, 0.075);
      for (const x of [-0.4, 0.4]) {
        const n = box(0.43, 0.44, 0.15, pale, p, x, 0.88, -0.16, 0.07);
        n.rotation.z = x < 0 ? 0.18 : -0.18;
        n.rotation.x = -0.18;
        sphere(0.025, cream, p, x, 0.88, -0.065);
      }
      break;
    case "stool":
      cyl(0.24, 0.09, brass, p, 0, 0.1);
      cyl(0.255, 0.43, soft, p, 0, 0.32);
      cyl(0.32, 0.16, soft, p, 0, 0.6);
      ring(0.3, 0.012, pale, p, 0, 0.65);
      for (let i = 0; i < 16; i++) {
        const a = (i * Math.PI) / 8;
        cyl(
          0.011,
          0.35,
          red,
          p,
          Math.sin(a) * 0.256,
          0.32,
          Math.cos(a) * 0.256,
        );
      }
      break;
    case "rug": {
      const rug = mat(0xdabaa7, 0, 1, texture("fabric", "#fff8ef"));
      cyl(1.58, 0.035, rug, p, 0, 0.066).scale.z = 0.73;
      for (let i = 0; i < 30; i++) {
        const a = (i * 2 * Math.PI) / 30;
        cyl(
          0.22,
          0.034,
          rug,
          p,
          Math.cos(a) * 1.55,
          0.065,
          Math.sin(a) * 1.1,
        ).scale.z = 0.76;
      }
      cyl(
        1.43,
        0.01,
        mat(ivory, 0, 1, texture("fabric")),
        p,
        0,
        0.089,
      ).scale.z = 0.73;
      for (const rad of [1.34, 1.38]) {
        const n = ring(rad, 0.009, pale, p, 0, 0.098);
        n.scale.y = 0.73;
      }
      break;
    }
    case "table":
      for (let i = 0; i < 3; i++) {
        const a = (i * 2 * Math.PI) / 3;
        rod(
          [Math.cos(a) * 0.33, 0.06, Math.sin(a) * 0.33],
          [Math.cos(a) * 0.22, 0.56, Math.sin(a) * 0.22],
          0.035,
          oak,
          p,
        );
      }
      cyl(0.49, 0.07, mat(ivory, 0, 0.27, texture("marble")), p, 0, 0.59);
      box(0.31, 0.035, 0.23, red, p, -0.08, 0.65, 0.03);
      box(0.28, 0.025, 0.21, cream, p, -0.05, 0.68, 0.02);
      cyl(0.06, 0.09, cream, p, 0.22, 0.68, 0.05);
      const handle = ring(0.035, 0.012, cream, p, 0.28, 0.69, 0.05);
      handle.rotation.x = 0;
      cyl(0.051, 0.005, mat(0x795142), p, 0.22, 0.727, 0.05);
      break;
    case "plant":
      mesh(new T.CylinderGeometry(0.22, 0.16, 0.4, 32), cream, p, 0, 0.23);
      cyl(0.195, 0.015, mat(0x685044), p, 0, 0.431);
      const stem = mat(0x647150),
        leaf = mat(0x7e926a, 0, 0.65);
      for (let i = 0; i < 9; i++) {
        const a = i * 2.4,
          h = 0.72 + (i % 4) * 0.22,
          x = Math.sin(a) * 0.26,
          z = Math.cos(a) * 0.26;
        rod([0, 0.4, 0], [x, h, z], 0.012, stem, p);
        const n = sphere(0.2, leaf, p, x, h, z, [0.5, 1.4, 0.12]);
        n.rotation.set(Math.cos(a) * 0.5, a, Math.sin(a) * 0.6);
      }
      break;
    case "lamp":
      cyl(0.27, 0.055, brass, p, 0, 0.07);
      cyl(0.023, 1.85, brass, p, 0, 1.02);
      mesh(new T.CylinderGeometry(0.18, 0.32, 0.4, 48), pale, p, 0, 1.91);
      for (let i = 0; i < 36; i++) {
        const a = (i * 2 * Math.PI) / 36;
        rod(
          [Math.cos(a) * 0.18, 2.11, Math.sin(a) * 0.18],
          [Math.cos(a) * 0.32, 1.71, Math.sin(a) * 0.32],
          0.005,
          cream,
          p,
        );
      }
      ring(0.32, 0.012, brass, p, 0, 1.71);
      break;
    case "lipstick":
      cyl(0.25, 0.65, cream, p, 0, 0.38);
      cyl(0.27, 0.035, brass, p, 0, 0.72);
      for (let i = 0; i < 3; i++) lipstick(p, (i - 1) * 0.12, 0.75, 0, red);
      break;
  }
  p.position.set(piece.x, 0, piece.z);
  p.rotation.y = (piece.angle * Math.PI) / 180;
  p.visible = piece.visible;
  return p;
}
export function createScene(layout: Layout) {
  const scene = new T.Scene();
  scene.background = new T.Color(0xe4d5ca);
  const cream = mat(ivory),
    trim = mat(0xfff6e9),
    blush = mat(0xebd7cd),
    brass = mat(gold, 0.5, 0.3),
    floor = mat(0xffffff, 0, 0.8, texture("wood", "#c3a184"));
  box(6.72, 0.25, 5.52, mat(0xd0bca9), scene, 0, -0.2, 0, 0.08);
  box(6.6, 0.1, 5.4, floor, scene, 0, -0.035);
  for (let row = 0; row < 14; row++)
    for (let col = 0; col < 5; col++)
      box(
        1.307,
        0.028,
        0.375,
        floor,
        scene,
        -2.64 + col * 1.32,
        0.027,
        -2.5 + row * 0.385,
        0.006,
      );
  box(6.68, 3.65, 0.16, blush, scene, 0, 1.81, -2.74);
  box(0.16, 3.65, 5.5, cream, scene, -3.34, 1.81, 0);
  for (const y of [0.12, 1.02, 3.57]) {
    box(6.6, 0.1, 0.1, trim, scene, 0, y, -2.63, 0.012);
    box(0.1, 0.1, 5.4, trim, scene, -3.23, y, 0, 0.012);
  }
  const panel = (
    p: T.Object3D,
    x: number,
    y: number,
    z: number,
    w: number,
    h: number,
  ) => {
    for (const s of [-1, 1]) {
      box(w, 0.022, 0.024, trim, p, x, y + (s * h) / 2, z);
      box(0.022, h, 0.024, trim, p, x + (s * w) / 2, y, z);
    }
  };
  for (const x of [-2.7, -1.8, -0.9, 0, 0.9, 1.8, 2.7])
    panel(scene, x, 0.56, -2.64, 0.7, 0.65);
  for (const z of [-2.1, -1.05, 0, 1.05, 2.1]) {
    const n = new T.Group();
    scene.add(n);
    n.position.set(-3.24, 0.56, z);
    n.rotation.y = Math.PI / 2;
    panel(n, 0, 0, 0, 0.82, 0.65);
  }
  const win = new T.Group();
  scene.add(win);
  win.position.set(-3.22, 2.22, -0.55);
  win.rotation.y = Math.PI / 2;
  box(
    1.85,
    1.9,
    0.025,
    mat(0xffffff, 0, 1, texture("window")),
    win,
    0,
    0,
    -0.025,
  );
  for (const x of [-0.96, 0, 0.96]) box(0.075, 2, 0.1, trim, win, x, 0, 0.05);
  for (const y of [-0.98, 0, 0.98]) box(2, 0.075, 0.1, trim, win, 0, y, 0.05);
  box(2.18, 0.1, 0.32, trim, win, 0, -1.02, 0.07);
  rod([-1.28, 1.15, 0.2], [1.28, 1.15, 0.2], 0.025, brass, win);
  const curtain = mat(0xf4ded5, 0, 1, texture("fabric"));
  for (const side of [-1, 1]) {
    for (let i = 0; i < 5; i++)
      cyl(
        0.083,
        2.18,
        curtain,
        win,
        side * (0.77 + i * 0.105),
        -0.05,
        0.15 + (i % 2) * 0.03,
      ).scale.z = 0.6;
    box(0.5, 0.05, 0.13, brass, win, side * 0.98, -0.25, 0.21);
  }
  box(0.86, 1.05, 0.07, brass, scene, -2.45, 2.18, -2.62);
  box(
    0.75,
    0.94,
    0.025,
    mat(0xffffff, 0, 0.8, texture("art")),
    scene,
    -2.45,
    2.18,
    -2.57,
  );
  for (const piece of layout.pieces) scene.add(furniture(piece, layout.style));
  scene.add(new T.HemisphereLight(0xfff5e8, 0x9d8373, 2.1));
  const light = new T.DirectionalLight(0xffefd7, 3.2);
  light.position.set(-3, 8, 5);
  light.castShadow = true;
  light.shadow.mapSize.set(2048, 2048);
  Object.assign(light.shadow.camera, {
    left: -7,
    right: 7,
    top: 7,
    bottom: -7,
    near: 0.1,
    far: 30,
  });
  light.shadow.bias = -0.0003;
  light.shadow.normalBias = 0.025;
  light.shadow.radius = 4;
  scene.add(light);
  const fill = new T.DirectionalLight(0xe6f0ff, 0.7);
  fill.position.set(5, 4, 0);
  scene.add(fill);
  return scene;
}
export function disposeScene(scene: T.Scene) {
  const geometries = new Set<T.BufferGeometry>(),
    materials = new Set<T.Material>(),
    textures = new Set<T.Texture>();
  scene.traverse((o) => {
    if (o instanceof T.Mesh || o instanceof T.Line) {
      geometries.add(o.geometry);
      for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
        materials.add(m);
        const map = (m as T.MeshStandardMaterial).map;
        if (map) textures.add(map);
      }
    }
  });
  geometries.forEach((g) => g.dispose());
  materials.forEach((m) => m.dispose());
  textures.forEach((t) => t.dispose());
}
