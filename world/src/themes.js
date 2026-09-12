// Seven themes, one per section. Each theme owns three things: the approach
// path in the white hub, the door itself, and the room behind it with the
// objects the visitor picks up. Everything here is built from scanned Poly
// Haven materials and models plus the procedural props in props.js.
//
// Frames: a path group has its origin at the hub centre with +z toward the
// door. A door group has its origin on the threshold, local -z the approach
// side. A room group has the visitor entering at the origin facing +z, the
// return door at z = -3.5.

import * as THREE from 'three';
import { pbr, model, scatter, instances } from './assets.js';
import { createGrass } from './grass.js';
import * as P from './props.js';

export const DOOR_R = 11.5;      // radius of the door circle
export const PATH_FROM = 3.4;    // paths begin here, leaving the centre clear

const V = THREE.Vector3;
function seeded(seed) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }
function mesh(geo, mat, x = 0, y = 0, z = 0, shadow = true) { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = shadow; m.receiveShadow = true; return m; }
const box = (w, h, d, mat, x, y, z) => mesh(new THREE.BoxGeometry(w, h, d), mat, x, y, z);
function tile(geo, su, sv) { const uv = geo.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * su, uv.getY(i) * sv); return geo; }
function solidBox(list, obj, shrink = 0) { obj.updateMatrixWorld(true); const b = new THREE.Box3().setFromObject(obj); b.expandByScalar(-shrink); list.push(b); return b; }
function place(g, m, x, z, yaw = 0, s = 1) { m.position.set(x, 0, z); m.rotation.y = yaw; m.scale.setScalar(s); g.add(m); return m; }
async function put(g, name, x, z, yaw = 0, s = 1, solids = null, shrink = 0.08) {
  const src = await model(name); if (!src) return null;
  const m = src.clone(); place(g, m, x, z, yaw, s);
  if (solids) solidBox(solids, m, shrink);
  return m;
}
// Some Poly Haven models are two variants side by side; keep only meshes whose
// name or material passes the test and recentre what is left.
async function putPart(g, name, keep, x, z, yaw = 0, s = 1, solids = null) {
  const src = await model(name); if (!src) return null;
  const m = src.clone();
  m.traverse((o) => { if (o.isMesh && !keep(o)) o.visible = false; });
  m.updateMatrixWorld(true);
  const b = new THREE.Box3(); m.traverse((o) => { if (o.isMesh && o.visible) b.expandByObject(o); });
  const c = b.getCenter(new V()); m.children.forEach((ch) => ch.position.sub(new V(c.x, b.min.y, c.z)));
  place(g, m, x, z, yaw, s);
  if (solids) solidBox(solids, m, 0.05);
  return m;
}
const warm = (x, y, z, intensity = 1.2, color = 0xffd9a8, dist = 9) => { const l = new THREE.PointLight(color, intensity, dist, 1.6); l.position.set(x, y, z); return l; };

// ---- Path strips: a themed floor laid on the white ground, edges softened ----
// Every ground texture tiles at its real size, so planks and setts are the
// same scale on the path and on the apron, and the two meet without a seam.
const TILE = { wood_floor_deck: 1.6, concrete_floor_worn_001: 2.0, wood_planks_grey: 1.6, marble_01: 1.3, aerial_grass_rock: 3.0, laminate_floor_02: 1.5, cobblestone_floor_08: 1.3 };
const APRON_D = 3.7, APRON_W = 5.2;
function ground(name, w, d, opts = {}) {
  const t = TILE[name] || 1.5;
  return pbr(name, { repeat: [w / t, d / t], roughness: 1, ...opts });
}
function strip(name, width, from, to, opts = {}) {
  // The strip runs 0.8 m on into the apron, so the apron's near edge is under it rather than a seam beside it.
  to += 0.8;
  const len = to - from;
  const mat = ground(name, width, len, { ...opts, extra: { transparent: true, alphaMap: fadeAlpha(), depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1 } });
  // The texture starts at the far end so its tiling continues straight into the apron.
  const m = new THREE.Mesh(new THREE.PlaneGeometry(width, len, 1, 8), mat);
  m.rotation.x = -Math.PI / 2; m.position.set(0, 0.016, from + len / 2); m.receiveShadow = true;
  return m;
}
// A ground patch fades out along its two long edges and at its near end, so
// it lies on the white floor like a runner rather than a cut rectangle; the
// far end stays flush, where a strip runs on into its apron and the apron
// meets the façade. `side` is the width of the edge fade as a fraction of the
// patch's half width, `near` the length of the near fade as a fraction.
function fadeAlpha({ side = 0.3, near = 0.14 } = {}) {
  return P.canvasTexture(64, 256, (g, W, H) => {
    const img = g.createImageData(W, H);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const u = Math.abs(x / (W - 1) - 0.5) * 2, v = 1 - y / (H - 1);   // canvas top is the near end
      const s = Math.min(1, (1 - u) / side), n = near > 0 ? Math.min(1, v / near) : 1;
      const e = s * s * (3 - 2 * s) * n * n * (3 - 2 * n);
      const i = (y * W + x) * 4; img.data[i] = img.data[i + 1] = img.data[i + 2] = 255; img.data[i + 3] = Math.max(0, Math.min(1, e)) * 255;
    }
    g.putImageData(img, 0, 0);
  });
}
function pathMaterial(name, repeat, opts = {}) { return ground(name, 2.4, 7, opts); }


// The path widens into an apron in front of the door, where the theme's
// objects stand in an arrangement that makes sense: nothing floats in the void.
function apron(g, matName, opts = {}) {
  const m = ground(matName, APRON_W, APRON_D, { ...opts, extra: { transparent: true, alphaMap: fadeAlpha({ side: 0.16, near: 0.2 }), depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1 } });
  const a = new THREE.Mesh(new THREE.PlaneGeometry(APRON_W, APRON_D - 0.1), m); a.rotation.x = -Math.PI / 2; a.position.set(0, 0.012, DOOR_R - APRON_D + (APRON_D - 0.1) / 2); a.receiveShadow = true; g.add(a);
  return a;
}
// A façade around the door: the door belongs to a wall of its theme's material,
// so it reads as the entrance to a place rather than a frame standing in a void.
function facade(g, { w = 5.2, h = 3.6, doorW, doorH, jamb = 0.12, lintel = 0.16, mat, depth = 0.4, z = 0.15, top = null }) {
  const side = (w - doorW) / 2 - jamb;
  const piece = (ww, hh, x, y) => { const m = box(ww, hh, depth, mat, x, y, z); tile(m.geometry, ww / 2.5, hh / 2.5); g.add(m); return m; };
  piece(side, h, -(doorW / 2 + jamb + side / 2), h / 2);
  piece(side, h, (doorW / 2 + jamb + side / 2), h / 2);
  piece(doorW + jamb * 2, h - doorH - lintel, 0, doorH + lintel + (h - doorH - lintel) / 2);
  if (top) { const c = box(w + 0.5, 0.22, depth + 0.5, top, 0, h + 0.11, z); g.add(c); }
}

// ---- Door frames and leaves ----
// A rectangular frame set into a shallow vestibule, so an open door shows an
// interior instead of the white void behind.
function threshold(g, { w, h, frameMat, depth = 1.6, inner = 0x1a1612, jamb = 0.12, lintel = 0.16, sill = true, glow = null, shell = null, inRoom = false }) {
  const dark = new THREE.MeshStandardMaterial({ color: inner, roughness: 1 });
  if (inRoom) {
    // Inside a room the frame sits flush in the wall: jambs and lintel only.
    depth = 0.34; const zc = 0.0;   // the wall is 0.3 thick and centred on the door; the frame stands 2 cm proud each side
    g.add(box(jamb, h + lintel, depth, frameMat, -(w / 2 + jamb / 2), (h + lintel) / 2, zc));
    g.add(box(jamb, h + lintel, depth, frameMat, (w / 2 + jamb / 2), (h + lintel) / 2, zc));
    g.add(box(w + jamb * 2, lintel, depth, frameMat, 0, h + lintel / 2, zc));
    if (sill) g.add(box(w + jamb * 2, 0.02, 0.5, frameMat, 0, 0.01, 0));
    const cav = 1.4;
    g.add(box(w + 0.4, 0.02, cav, dark, 0, 0.02, 0.3 + cav / 2));
    g.add(box(0.1, h + 0.4, cav, dark, -(w / 2 + 0.15), (h + 0.4) / 2, 0.3 + cav / 2));
    g.add(box(0.1, h + 0.4, cav, dark, (w / 2 + 0.15), (h + 0.4) / 2, 0.3 + cav / 2));
    g.add(box(w + 0.4, 0.1, cav, dark, 0, h + 0.35, 0.3 + cav / 2));
    g.add(box(w + 0.4, h + 0.4, 0.1, dark, 0, (h + 0.4) / 2, 0.3 + cav));
    const pl = new THREE.PointLight(0xffe2c0, 0.5, 3, 1.6); pl.position.set(0, h * 0.6, 0.9); g.add(pl);
    return;
  }
  // Vestibule: floor, two sides, back, top.
  g.add(box(w + jamb * 2, 0.04, depth, dark, 0, 0.03, depth / 2));
  // Seen from outside the ring, the vestibule is a small built thing in the theme's wall material.
  const skin = shell || frameMat;
  g.add(box(0.12, h + lintel + 0.12, depth + 0.1, skin, -(w / 2 + jamb + 0.06), (h + lintel + 0.12) / 2, depth / 2 + 0.05));
  g.add(box(0.12, h + lintel + 0.12, depth + 0.1, skin, (w / 2 + jamb + 0.06), (h + lintel + 0.12) / 2, depth / 2 + 0.05));
  g.add(box(w + jamb * 2 + 0.24, 0.12, depth + 0.1, skin, 0, h + lintel + 0.06, depth / 2 + 0.05));
  g.add(box(w + jamb * 2 + 0.24, h + lintel + 0.12, 0.12, skin, 0, (h + lintel + 0.12) / 2, depth + 0.13));
  // The room's own light leaks through the opening, so its mood reads from across the hub.
  if (glow !== null) { const l = new THREE.PointLight(glow, 1.4, 5, 1.8); l.position.set(0, h * 0.55, depth * 0.55); g.add(l); const p = box(w * 0.9, h * 0.9, 0.01, new THREE.MeshStandardMaterial({ color: inner, emissive: glow, emissiveIntensity: 0.12, roughness: 1 }), 0, h / 2, depth - 0.02); p.castShadow = false; g.add(p); }
  g.add(box(jamb, h + lintel, depth, frameMat, -(w / 2 + jamb / 2), (h + lintel) / 2, depth / 2));
  g.add(box(jamb, h + lintel, depth, frameMat, (w / 2 + jamb / 2), (h + lintel) / 2, depth / 2));
  g.add(box(w + jamb * 2, lintel, depth, frameMat, 0, h + lintel / 2, depth / 2));
  g.add(box(w + jamb * 2, h + lintel, 0.06, dark, 0, (h + lintel) / 2, depth + 0.03));
  if (sill) g.add(box(w + jamb * 2, 0.06, 0.5, frameMat, 0, 0.03, -0.15));
}
const HINGE = new THREE.MeshStandardMaterial({ color: 0x2a2a2a, metalness: 0.8, roughness: 0.45 });
function hinged(g, leaf, side, w, h = 2.2) {
  // A pivot at the hinge edge; the leaf hangs from it so rotation opens it.
  const pivot = new THREE.Group(); pivot.position.set(side * (w / 2 - 0.02), 0, -0.04); leaf.position.x = -side * (w / 2 - 0.02); pivot.add(leaf); g.add(pivot);
  for (const y of [0.25, h / 2, h - 0.25]) g.add(mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.1, 10), HINGE, side * (w / 2 - 0.005), y, -0.075));
  return pivot;
}
function handle(mat, x, y, z, { long = false } = {}) {
  const g = new THREE.Group();
  if (long) { g.add(mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.42, 12), mat, x, y, z)); for (const dy of [-0.16, 0.16]) g.add(mesh(new THREE.CylinderGeometry(0.01, 0.01, 0.06, 8), mat, x, y + dy, z - 0.03).rotateX(Math.PI / 2)); }
  else { g.add(mesh(new THREE.SphereGeometry(0.03, 16, 12), mat, x, y, z)); g.add(mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.05, 8), mat, x, y, z - 0.03).rotateX(Math.PI / 2)); }
  return g;
}
function panelledLeaf(w, h, t, mat, { rows = 3, cols = 2, inset = 0.012 } = {}) {
  const g = new THREE.Group();
  g.add(box(w, h, t, mat, 0, h / 2, 0));
  const pw = (w - 0.1 * (cols + 1)) / cols, ph = (h - 0.12 * (rows + 1)) / rows;
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    const x = -w / 2 + 0.1 + pw / 2 + c * (pw + 0.1), y = 0.12 + ph / 2 + r * (ph + 0.12);
    g.add(box(pw, ph, t + inset * 2, mat, x, y, 0));
    const raised = box(pw - 0.08, ph - 0.08, t + inset * 3, mat, x, y, 0); g.add(raised);
  }
  return g;
}

// ---- Rooms: floor, walls, ceiling; the entry wall carries the return door ----
function shell(g, { w, d, h, floor, wall, ceiling = null, doorW = 1.4, doorH = 2.5, jamb = 0.12, lintel = 0.16, z0 = -3.5, solids }) {
  const f = mesh(tile(new THREE.PlaneGeometry(w, d), w / 2, d / 2), floor, 0, 0, z0 + d / 2, false); f.rotation.x = -Math.PI / 2; g.add(f);
  const wallBox = (ww, hh, dd, x, y, z) => { const m = box(ww, hh + 0.1, dd, wall, x, y + 0.05, z); tile(m.geometry, ww / 2.5, hh / 2.5); g.add(m); solidBox(solids, m); };
  wallBox(0.3, h, d, -w / 2 - 0.15, h / 2, z0 + d / 2);
  wallBox(0.3, h, d, w / 2 + 0.15, h / 2, z0 + d / 2);
  wallBox(w + 0.6, h, 0.3, 0, h / 2, z0 + d + 0.15);
  // Entry wall in three pieces around the door.
  const side = (w - doorW) / 2 - jamb;
  wallBox(side, h, 0.3, -(doorW / 2 + jamb + side / 2), h / 2, z0 - 0.15);
  wallBox(side, h, 0.3, (doorW / 2 + jamb + side / 2), h / 2, z0 - 0.15);
  wallBox(doorW + jamb * 2, h - doorH - lintel, 0.3, 0, doorH + lintel + (h - doorH - lintel) / 2, z0 - 0.15);
  if (ceiling) { const c = mesh(tile(new THREE.PlaneGeometry(w + 0.6, d + 0.6), w / 2, d / 2), ceiling, 0, h - 0.005, z0 + d / 2, true); c.rotation.x = Math.PI / 2; g.add(c); }
  // Where the camera may go: inside the walls, under the ceiling.
  g.userData.bounds = new THREE.Box3(new THREE.Vector3(-w / 2 + 0.4, 0.4, z0 + 0.3), new THREE.Vector3(w / 2 - 0.4, h - 0.25, z0 + d - 0.4));
}
// Skirting along the floor and a rail near the ceiling: the trim that makes a box read as a room.
function trim(g, { w, d, h, z0 = -3.5, color = 0x3a342e, rail = true, skirt = 0.12 }) {
  const m = new THREE.MeshStandardMaterial({ color, roughness: 0.7 });
  const runs = [[0.05, skirt, d, -w / 2 + 0.025, skirt / 2, z0 + d / 2], [0.05, skirt, d, w / 2 - 0.025, skirt / 2, z0 + d / 2], [w, skirt, 0.05, 0, skirt / 2, z0 + d - 0.025]];
  for (const [ww, hh, dd, x, y, z] of runs) g.add(box(ww, hh, dd, m, x, y, z));
  if (rail) for (const [ww, hh, dd, x, y, z] of [[0.04, 0.06, d, -w / 2 + 0.02, h - 0.35, z0 + d / 2], [0.04, 0.06, d, w / 2 - 0.02, h - 0.35, z0 + d / 2], [w, 0.06, 0.04, 0, h - 0.35, z0 + d - 0.02]]) g.add(box(ww, hh, dd, m, x, y, z));
}
// A pin board, a wall of cork, for notes and photographs.
function corkBoard(w, h) {
  const g = new THREE.Group();
  g.add(box(w, h, 0.03, new THREE.MeshStandardMaterial({ color: 0xb98d5a, roughness: 1 }), 0, 0, 0));
  g.add(box(w + 0.08, 0.04, 0.05, new THREE.MeshStandardMaterial({ color: 0x3a2e24, roughness: 0.7 }), 0, h / 2 + 0.02, 0.01));
  g.add(box(w + 0.08, 0.04, 0.05, new THREE.MeshStandardMaterial({ color: 0x3a2e24, roughness: 0.7 }), 0, -h / 2 - 0.02, 0.01));
  g.add(box(0.04, h, 0.05, new THREE.MeshStandardMaterial({ color: 0x3a2e24, roughness: 0.7 }), -w / 2 - 0.02, 0, 0.01));
  g.add(box(0.04, h, 0.05, new THREE.MeshStandardMaterial({ color: 0x3a2e24, roughness: 0.7 }), w / 2 + 0.02, 0, 0.01));
  return g;
}
// Rows of plain books on a shelf: colour varied, one draw call.
function shelfBooks(count, width, y, z, rnd) {
  const geo = new THREE.BoxGeometry(0.035, 0.22, 0.15);
  const im = new THREE.InstancedMesh(geo, new THREE.MeshStandardMaterial({ roughness: 0.8 }), count);
  const m4 = new THREE.Matrix4(), col = new THREE.Color(); let x = -width / 2; let n = 0;
  for (let i = 0; i < count && x < width / 2; i++) {
    const t = 0.028 + rnd() * 0.03, h = 0.18 + rnd() * 0.08;
    m4.makeScale(t / 0.035, h / 0.22, 1); m4.setPosition(x + t / 2, y + h / 2, z + (rnd() - 0.5) * 0.02); im.setMatrixAt(n, m4);
    // Cloth and leather: reds, browns, greens, blues, all dark.
    const hue = rnd() < 0.6 ? rnd() * 0.12 : 0.5 + rnd() * 0.2;
    col.setHSL(hue, 0.25 + rnd() * 0.25, 0.14 + rnd() * 0.2); im.setColorAt(n, col); n++; x += t + 0.004;
  }
  im.count = n; im.castShadow = true; im.receiveShadow = true; return im;
}
function pickable(obj, item, g, x, y, z, ry = 0, rx = 0, rz = 0, pullDir = null, pullAmount = 0.09) {
  obj.position.set(x, y, z); obj.rotation.set(rx, ry, rz); g.add(obj);
  obj.userData.item = item; obj.userData.home = { p: obj.position.clone(), q: obj.quaternion.clone() };
  if (pullDir) obj.userData.pullDir = pullDir; obj.userData.pullAmount = pullAmount;
  return obj;
}

// =====================================================================
// WORK: the library
// =====================================================================
const work = {
  slug: 'work', name: 'Work', hint: 'Every tool is a book. Take one.',
  async path(g, { rnd }) {
    g.add(strip('wood_floor_deck', 2.4, PATH_FROM + 0.3, DOOR_R - APRON_D));
    apron(g, 'wood_floor_deck');
    // A bench against the library wall, a stack of returned books beside it.
    await put(g, 'painted_wooden_bench', -1.9, DOOR_R - 0.55, 0, 1, this.solids);
    for (let i = 0; i < 6; i++) { const b = P.book(['Method', 'Tables', 'Notes', 'Index', 'Atlas', 'Ledger'][i], i + 9); b.rotation.set(Math.PI / 2, 0, (rnd() - 0.5) * 0.25); b.position.set(1.7 + (rnd() - 0.5) * 0.04, 0.02 + i * 0.034, DOOR_R - 0.6); g.add(b); }
  },
  door(g, opts = {}) {
    const wood = pbr('dark_wood', { repeat: [1, 2], roughness: 0.55 });
    const brass = new THREE.MeshStandardMaterial({ color: 0xb08d57, metalness: 0.9, roughness: 0.3 });
    const W = 1.7, H = 2.8;
    threshold(g, { w: W, h: H, frameMat: wood, inner: 0x2a1c12, glow: 0xffb060, inRoom: opts.inRoom });
    if (!opts.inRoom) facade(g, { doorW: W, doorH: H, mat: pbr('plastered_wall_04', { repeat: 1, roughness: 1, color: 0xd8c9ad }), top: wood });
    const leaves = [-1, 1].map((side) => {
      const leaf = panelledLeaf(W / 2 - 0.01, H, 0.06, wood, { rows: 3, cols: 1 });
      leaf.add(handle(brass, -side * 0.12, 1.05, -0.05, { long: true }));
      return hinged(g, leaf, side, W);
    });
    if (!opts.inRoom) {
      // Transom: a small window over the door, and the sign on brass rods.
      g.add(box(W, 0.35, 0.04, new THREE.MeshPhysicalMaterial({ color: 0xdfe8ee, transparent: true, opacity: 0.35, roughness: 0.1 }), 0, H + 0.34, 0.02));
      g.add(box(W + 0.24, 0.16, 0.2, wood, 0, H + 0.6, 0.02));
      const sign = P.signboard('Work', 'The library', 'brass', { w: 2.0, h: 0.5 }); sign.position.set(0, H + 1.0, -0.14); g.add(sign);
      for (const s of [-1, 1]) g.add(mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.32, 8), brass, s * 0.85, H + 0.9, -0.14));
    }
    return { width: W, set(o) { leaves[0].rotation.y = -o * 1.5; leaves[1].rotation.y = o * 1.5; } };
  },
  async room(g, ctx, items) {
    const rnd = seeded(41), solids = ctx.solids, pick = [];
    const floor = pbr('herringbone_parquet', { repeat: 1, roughness: 0.6 });
    const wall = pbr('plastered_wall_04', { repeat: 1, roughness: 1, color: 0xa08a6a });
    const ceil = pbr('dark_wood', { repeat: 1, roughness: 0.8, color: 0x5a483a });
    shell(g, { w: 11, d: 12, h: 3.6, floor, wall, ceiling: ceil, doorW: 1.7, doorH: 2.8, solids });
    // Dark wainscot around the room, and a rug under the reading table.
    const wains = pbr('dark_wood', { repeat: [6, 1], roughness: 0.6, color: 0x7a6250 });
    for (const [w_, h_, d_, x, y, z] of [[0.06, 1.05, 12, -5.47, 0.525, 2.5], [0.06, 1.05, 12, 5.47, 0.525, 2.5], [11, 1.05, 0.06, 0, 0.525, 8.47]]) g.add(box(w_, h_, d_, wains, x, y, z));
    const rugTex = P.canvasTexture(1024, 1024, (c, W, H) => { c.fillStyle = '#5a1f1f'; c.fillRect(0, 0, W, H); c.strokeStyle = '#c9a86a'; c.lineWidth = 14; c.strokeRect(60, 60, W - 120, H - 120); c.lineWidth = 4; c.strokeRect(110, 110, W - 220, H - 220); let s_ = 3; const r = () => { s_ = (s_ * 1664525 + 1013904223) >>> 0; return s_ / 4294967296; }; for (let i = 0; i < 4000; i++) { c.fillStyle = `rgba(0,0,0,${r() * 0.18})`; c.fillRect(r() * W, r() * H, 3, 3); } });
    const rug = mesh(new THREE.PlaneGeometry(4.6, 3.2), new THREE.MeshStandardMaterial({ map: rugTex, roughness: 1 }), 0, 0.006, 3.4, false); rug.rotation.x = -Math.PI / 2; g.add(rug);
    for (const z of [-1.5, 0.5, 2.5, 4.5, 6.5]) g.add(box(11, 0.22, 0.18, wains, 0, 3.49, z));
    // A tall window on the right, daylight falling across the room.
    const winMat = new THREE.MeshStandardMaterial({ color: 0xdfe6ea, emissive: 0xf6f3ea, emissiveIntensity: 0.9 });
    g.add(box(0.04, 2.2, 1.3, winMat, 5.47, 1.9, 6.6));
    for (const dz of [-0.43, 0, 0.43]) g.add(box(0.06, 2.24, 0.06, wains, 5.46, 1.9, 6.6 + dz));
    for (const dy of [-0.7, 0, 0.7]) g.add(box(0.06, 0.06, 1.34, wains, 5.46, 1.9 + dy, 6.6));
    const day = new THREE.PointLight(0xfff6e6, 1.8, 9, 1.4); day.position.set(4.4, 2.2, 6.6); g.add(day);
    // Five bays along the back wall, one per category, the tools standing on
    // the eye level shelf with the category on a brass plate above. The other
    // shelves and the side walls hold plain books.
    const cats = []; for (const it of items) { const k = it.cat || 'Tools'; if (!cats.includes(k)) cats.push(k); }
    const SHELF = [0.38, 0.82, 1.26, 1.70], EYE = 1.26;
    const bayX = (i, n) => (i - (n - 1) / 2) * 1.42;
    const nBays = Math.max(cats.length, 1);
    for (let i = 0; i < nBays; i++) {
      const x = bayX(i, nBays), z = 8.05;
      const shelf = await put(g, 'wooden_bookshelf_worn', x, z, 0, 1, solids);
      for (const y of SHELF) { if (y === EYE && cats[i]) continue; const row = shelfBooks(40, 1.18, y, 0, rnd); row.position.set(x, 0, z + 0.04); g.add(row); }
      if (cats[i]) { const pl = P.plate(cats[i].toUpperCase(), { w: 1.2, h: 0.15, size: 58 }); pl.position.set(x, 2.3, z - 0.32); g.add(pl); }
    }
    for (const [x, z, yaw] of [[-5.2, 1.4, Math.PI / 2], [-5.2, 2.85, Math.PI / 2], [-5.2, 4.3, Math.PI / 2], [5.2, 1.4, -Math.PI / 2], [5.2, 2.85, -Math.PI / 2], [5.2, 4.3, -Math.PI / 2]]) {
      await put(g, 'wooden_bookshelf_worn', x, z, yaw, 1, solids);
      for (const y of SHELF) { const row = shelfBooks(40, 1.18, y, 0, rnd); row.position.set(x - Math.sin(yaw) * 0.04 * -1, 0, z); row.rotation.y = yaw; row.position.x += (x < 0 ? 0.04 : -0.04); g.add(row); }
    }
    // The tools: spines out, a hand's width apart, in category order.
    const OUT = new V(0, 0, -1);
    cats.forEach((cat, i) => {
      const mine = items.filter((it) => (it.cat || 'Tools') === cat);
      const x0 = bayX(i, nBays), z = 8.05 - 0.02;
      const step = Math.min(0.062, 1.1 / Math.max(mine.length, 1));
      mine.forEach((it, k) => {
        const idx = items.indexOf(it);
        const b = P.book(it.title, idx, { w: 0.15, h: 0.225, d: 0.036 });
        // Standing on the shelf, spine toward the room.
        const x = x0 + (k - (mine.length - 1) / 2) * step;
        pickable(b, it, g, x, EYE + 0.1125 + 0.004, z, -Math.PI / 2, 0, 0, OUT, 0.06);
        pick.push(b);
      });
    });
    // The long reading table in the middle, with a few volumes left open.
    const table = await put(g, 'painted_wooden_table', 0, 3.4, Math.PI / 2, 0.85, solids);
    const tb = table ? new THREE.Box3().setFromObject(table) : null; const top = tb ? tb.max.y : 0.75;
    for (let i = 0; i < 3; i++) { const b = P.book(['Ledger', 'Atlas', 'Index'][i], i + 20); b.rotation.set(Math.PI / 2, 0, (rnd() - 0.5) * 0.5); b.position.set(-0.6 + i * 0.6, top + 0.02, 3.4 + (rnd() - 0.5) * 0.4); g.add(b); }
    await put(g, 'vintage_oil_lamp', -1.9, 3.4, 0, 1); g.children[g.children.length - 1].position.y = top;
    await put(g, 'vintage_oil_lamp', 1.9, 3.4, 0, 1); g.children[g.children.length - 1].position.y = top;
    g.add(warm(-1.9, top + 0.5, 3.4, 1.4, 0xffc67a, 7), warm(1.9, top + 0.5, 3.4, 1.4, 0xffc67a, 7));
    await put(g, 'lantern_chandelier_01', 0, 3.4, 0, 1); g.children[g.children.length - 1].position.y = 2.7;
    g.add(mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.5, 8), new THREE.MeshStandardMaterial({ color: 0x3a2a1a, metalness: 0.7, roughness: 0.5 }), 0, 3.35, 3.4));
    g.add(warm(0, 2.5, 3.4, 1.2, 0xffd9a8, 10));
    // A little of the lamplight reaches the beams, so the ceiling reads as dark wood rather than as nothing.
    g.add(warm(0, 3.3, 3.4, 1.0, 0xffe6c0, 14));
    await put(g, 'ArmChair_01', -3.6, 0.6, 0.7, 1, solids);
    await put(g, 'side_table_01', -2.6, 0.2, 0, 1, solids);
    const ladder = await put(g, 'wooden_ladder', 4.55, 2.1, Math.PI / 2, 1, solids); if (ladder) ladder.rotation.z = 0.0;
    await put(g, 'vintage_grandfather_clock_01', 4.7, 0.2, -Math.PI / 2, 1, solids);
    await put(g, 'painted_wooden_chair_01', 0, 1.6, Math.PI, 1, solids);
    await put(g, 'painted_wooden_chair_01', -1.2, 5.2, 0, 1, solids);
    g.add(warm(0, 2.6, 6.8, 0.6, 0xffe2c0, 9));
    return { pickables: pick, ambient: 0x3a2e24, env: 0.3 };
  },
};

// =====================================================================
// CASES: the archive
// =====================================================================
const cases = {
  slug: 'cases', name: 'Cases', hint: 'Eight case files on the desks. Open one.',
  async path(g, { rnd }) {
    g.add(strip('concrete_floor_worn_001', 2.4, PATH_FROM + 0.3, DOOR_R - APRON_D, { color: 0xc8c8c4 }));
    apron(g, 'concrete_floor_worn_001', { color: 0xc8c8c4 });
    // A filing cabinet against the concrete, archive boxes stacked beside the door.
    await put(g, 'drawer_cabinet', -1.75, DOOR_R - 0.5, 0, 1, this.solids);
    const card = new THREE.MeshStandardMaterial({ color: 0xb59a6a, roughness: 1 });
    for (let i = 0; i < 3; i++) g.add(box(0.42, 0.26, 0.34, card, 1.7 + (rnd() - 0.5) * 0.04, 0.13 + i * 0.27, DOOR_R - 0.5 + (rnd() - 0.5) * 0.04));
  },
  door(g, opts = {}) {
    const steel = pbr('painted_metal_shutter', { repeat: [1, 2], roughness: 0.6, color: 0x9aa39c });
    const dark = new THREE.MeshStandardMaterial({ color: 0x2d3135, metalness: 0.7, roughness: 0.5 });
    const W = 1.2, H = 2.4;
    threshold(g, { w: W, h: H, frameMat: dark, inner: 0x15171a, glow: 0x9fb4c8, shell: pbr('concrete_floor_worn_001', { repeat: [1, 2], roughness: 0.9, color: 0xb9bcb6 }), inRoom: opts.inRoom });
    if (!opts.inRoom) facade(g, { doorW: W, doorH: H, mat: pbr('concrete_wall_007', { repeat: 1, roughness: 0.95 }), top: dark });
    const leaf = new THREE.Group();
    leaf.add(box(W - 0.02, H, 0.06, steel, 0, H / 2, 0));
    for (let i = 0; i < 14; i++) for (const sx of [-1, 1]) leaf.add(mesh(new THREE.SphereGeometry(0.012, 8, 6), dark, sx * (W / 2 - 0.06), 0.1 + i * 0.165, -0.032));
    leaf.add(box(0.36, 0.5, 0.02, new THREE.MeshPhysicalMaterial({ color: 0xbfd0d8, transparent: true, opacity: 0.4, roughness: 0.2 }), 0, 1.7, -0.035));
    leaf.add(box(0.4, 0.54, 0.02, dark, 0, 1.7, -0.03).translateZ(0.005));
    const bar = box(0.7, 0.05, 0.05, dark, -0.15, 1.05, -0.07); leaf.add(bar);
    const st = P.stencil('ARCHIVE 02', 0.9, 0.22, { color: '#e8e2d2', size: 150, worn: 0.8 }); st.position.set(0, 0.7, -0.031); st.rotation.y = Math.PI; leaf.add(st);
    if (!opts.inRoom) {
      const sign = P.signboard('Cases', 'The archive', 'stencil', { w: 1.9, h: 0.5 }); sign.position.set(0, H + 0.62, -0.14); g.add(sign);
      const lamp = box(0.5, 0.05, 0.25, dark, 0, H + 0.98, -0.2); g.add(lamp); g.add(warm(0, H + 0.9, -0.3, 0.9, 0xfff0c8, 4));
    }
    const pivot = hinged(g, leaf, -1, W);
    return { width: W, set(o) { pivot.rotation.y = -o * 1.6; } };
  },
  async room(g, ctx, items) {
    const rnd = seeded(43), solids = ctx.solids, pick = [];
    const floor = pbr('concrete_floor_worn_001', { repeat: 1, roughness: 0.9 });
    const wall = pbr('grey_plaster', { repeat: 1, roughness: 1, color: 0xb9bcb6 });
    shell(g, { w: 9, d: 9, h: 3.4, floor, wall, ceiling: new THREE.MeshStandardMaterial({ color: 0x8a8d90, roughness: 1 }), doorW: 1.2, doorH: 2.4, solids });
    trim(g, { w: 9, d: 9, h: 3.4, color: 0x2a2c2e });
    // Two steel desks pushed together, the case files laid out on them.
    const d1 = await put(g, 'metal_office_desk', -0.8, 3.2, 0, 1, solids), d2 = await put(g, 'metal_office_desk', 0.8, 3.2, 0, 1, solids);
    const top = d1 ? new THREE.Box3().setFromObject(d1).max.y : 0.76;
    items.forEach((it, i) => {
      const f = P.folder(it.title, it.line, i);
      const x = -1.3 + (i % 4) * 0.87, z = 3.0 + Math.floor(i / 4) * 0.3 + (rnd() - 0.5) * 0.06;
      pickable(f, it, g, x, top + 0.012 + (i % 4) * 0.004, z, (rnd() - 0.5) * 0.25);
      pick.push(f);
    });
    const lamp = await put(g, 'desk_lamp_arm_01', -1.3, 3.3, 0.6, 1); if (lamp) lamp.position.y = top;
    g.add(warm(-1.6, top + 0.6, 3.3, 1.3, 0xffe0b0, 6));
    const nb = await put(g, 'binder_notebook', 1.9, 3.6, -0.3, 1); if (nb) nb.position.y = top;
    const cb = await put(g, 'clipboard', 2.1, 2.9, 0.2, 1); if (cb) cb.position.y = top;
    // The investigation wall: every case pinned up with its picture, red thread between them.
    const board = corkBoard(6.4, 2.4); board.position.set(0, 1.9, 5.47); board.rotation.y = Math.PI; g.add(board);
    const thread = new THREE.MeshStandardMaterial({ color: 0xb3261e, roughness: 0.7 });
    const pins = [];
    items.forEach((it, i) => {
      const fr = P.frame(it.image || 'og/cases.png', it.title, i, { w: 0.62, h: 0.33, border: 0.012, color: 0xf2efe8 });
      const px = -2.3 + (i % 4) * 1.53 + (rnd() - 0.5) * 0.3, py = 0.62 - Math.floor(i / 4) * 1.15 + (rnd() - 0.5) * 0.25;
      fr.position.set(px, 1.9 + py, 5.42); fr.rotation.y = Math.PI; fr.rotation.z = (rnd() - 0.5) * 0.14; fr.scale.setScalar(0.9 + rnd() * 0.25); g.add(fr); pins.push(fr.position.clone());
    });
    for (let i = 1; i < pins.length; i++) { const a = pins[i - 1], b = pins[i]; const len = a.distanceTo(b); const t = mesh(new THREE.CylinderGeometry(0.003, 0.003, len, 6), thread, 0, 0, 0); t.position.lerpVectors(a, b, 0.5); t.position.z -= 0.03; t.lookAt(b); t.rotateX(Math.PI / 2); g.add(t); }
    for (const x of [-2.2, 2.2]) g.add(warm(x, 3.0, 4.4, 1.0, 0xfff4e0, 6));
    // Archive shelves down both sides with boxes; the projector on the left.
    const card = new THREE.MeshStandardMaterial({ color: 0xb59a6a, roughness: 1 });
    for (const [x, z, yaw] of [[-4.0, 1.0, Math.PI / 2], [-4.0, 3.4, Math.PI / 2], [4.0, 1.0, -Math.PI / 2], [4.0, 3.4, -Math.PI / 2]]) await put(g, 'steel_frame_shelves_03', x, z, yaw, 1, solids);
    // Archive boxes stacked on the floor beside the shelves, where they cannot cut through a plank.
    for (const [x, z] of [[-3.2, -0.6], [3.2, -0.6], [-3.2, 4.7], [3.2, 4.7]]) for (let i = 0; i < 3; i++) g.add(box(0.42, 0.26, 0.34, card, x + (rnd() - 0.5) * 0.06, 0.13 + i * 0.27, z + (rnd() - 0.5) * 0.06));
    const scr = await put(g, 'projector_screen', -3.95, 4.7, Math.PI / 2, 1, solids);
    await put(g, 'side_table_01', -2.3, 4.7, 0, 1, solids);
    const pj = await put(g, 'filmstrip_projector_8mm', -2.3, 4.7, Math.PI / 2, 1); if (pj) pj.position.y = 0.58;
    // Cold tubes overhead.
    for (const z of [0.6, 2.4, 4.2]) { g.add(box(1.4, 0.06, 0.24, new THREE.MeshStandardMaterial({ color: 0xd8dadd, metalness: 0.5, roughness: 0.5 }), 0, 3.37, z)); const tube = box(1.2, 0.03, 0.07, new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xe8f0ff, emissiveIntensity: 1.5 }), 0, 3.33, z); g.add(tube); g.add(warm(0, 3.1, z, 1.5, 0xdfe9ff, 14)); }
    return { pickables: pick, ambient: 0x2b2e31, env: 0.25 };
  },
};

// =====================================================================
// NOTES: the writer's cabin
// =====================================================================
const notes = {
  slug: 'notes', name: 'Notes', hint: 'Notes pinned to the board. Take one down.',
  async path(g, { rnd }) {
    g.add(strip('wood_planks_grey', 2.2, PATH_FROM + 0.3, DOOR_R - APRON_D));
    apron(g, 'wood_planks_grey');
    // A chair and a basket on the porch, against the cabin wall.
    await put(g, 'painted_wooden_chair_01', -1.7, DOOR_R - 0.6, 0.25, 1, this.solids);
    await put(g, 'wicker_basket_01', 1.6, DOOR_R - 0.6, 0.5, 1, this.solids);
  },
  door(g, opts = {}) {
    const planks = pbr('wood_planks_grey', { repeat: [1, 2], roughness: 0.9 });
    const iron = new THREE.MeshStandardMaterial({ color: 0x1e1e1e, metalness: 0.6, roughness: 0.6 });
    const W = 1.2, H = 2.2;
    threshold(g, { w: W, h: H, frameMat: planks, inner: 0x2b241c, glow: 0xfff0d8, inRoom: opts.inRoom });
    if (!opts.inRoom) facade(g, { doorW: W, doorH: H, h: 3.2, mat: planks, top: planks });
    const leaf = new THREE.Group();
    for (let i = 0; i < 5; i++) leaf.add(box(W / 5 - 0.006, H, 0.05, planks, -W / 2 + W / 10 + i * (W / 5), H / 2, 0));
    for (const y of [0.35, 1.85]) leaf.add(box(W - 0.06, 0.12, 0.03, planks, 0, y, -0.04));
    leaf.add(box(0.45, 0.4, 0.02, new THREE.MeshPhysicalMaterial({ color: 0xcfe0e8, transparent: true, opacity: 0.35, roughness: 0.1 }), 0, 1.75, -0.03));
    for (const dx of [-0.11, 0.11]) leaf.add(box(0.02, 0.4, 0.03, iron, dx * 2, 1.75, -0.035));
    leaf.add(box(0.02, 0.4, 0.03, iron, 0, 1.75, -0.035)); leaf.add(box(0.45, 0.02, 0.03, iron, 0, 1.75, -0.035));
    leaf.add(box(0.2, 0.04, 0.03, iron, 0.3, 1.02, -0.04)); leaf.add(mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.12, 8), iron, 0.36, 1.02, -0.06));
    if (!opts.inRoom) {
      // A painted board under a little shingle roof.
      const sign = P.signboard('Notes', 'The cabin', 'painted', { w: 1.7, h: 0.48 }); sign.position.set(0, H + 0.62, -0.16); g.add(sign);
      const roof = box(5.5, 0.06, 0.9, planks, 0, H + 1.0, -0.3); roof.rotation.x = 0.35; g.add(roof);
      for (const dx of [-0.7, 0.7]) g.add(box(0.06, 0.5, 0.06, planks, dx, H + 0.62, -0.38));
    }
    const pivot = hinged(g, leaf, -1, W);
    return { width: W, set(o) { pivot.rotation.y = -o * 1.5; } };
  },
  async room(g, ctx, items) {
    const rnd = seeded(47), solids = ctx.solids, pick = [];
    const floor = pbr('wood_planks_grey', { repeat: 1, roughness: 0.9, color: 0xcfc4b4 });
    const wall = pbr('wood_planks_grey', { repeat: 1, roughness: 0.95, color: 0xd9cdb8 });
    shell(g, { w: 7.5, d: 7.5, h: 2.9, floor, wall, ceiling: pbr('wood_planks_grey', { repeat: 1, roughness: 0.9, color: 0x8f8478 }), doorW: 1.2, doorH: 2.2, solids });
    for (const z of [-1.5, 0.4, 2.3]) g.add(box(7.5, 0.16, 0.14, new THREE.MeshStandardMaterial({ color: 0x5a4c3e, roughness: 0.9 }), 0, 2.8, z));
    // A window on the right wall with the day coming through, the desk under it.
    const win = box(0.04, 1.2, 1.5, new THREE.MeshStandardMaterial({ color: 0xdfe6ea, emissive: 0xf4f6ff, emissiveIntensity: 0.9 }), 3.72, 1.6, 2.4); g.add(win);
    const sash = new THREE.MeshStandardMaterial({ color: 0xf1ece0, roughness: 0.8 });
    for (const dz of [-0.75, 0, 0.75]) g.add(box(0.06, 1.24, 0.05, sash, 3.71, 1.6, 2.4 + dz));
    g.add(box(0.06, 0.05, 1.54, sash, 3.71, 1.6, 2.4)); g.add(box(0.08, 0.06, 1.7, sash, 3.7, 0.98, 2.4));
    const day = new THREE.PointLight(0xeef2ff, 1.5, 9, 1.4); day.position.set(3.0, 1.9, 2.4); g.add(day);
    const desk = await put(g, 'WoodenTable_01', 2.75, 2.4, Math.PI / 2, 1, solids);
    const top = desk ? new THREE.Box3().setFromObject(desk).max.y : 0.75;
    const lamp = await put(g, 'desk_lamp_arm_01', 2.95, 3.1, -2.2, 1); if (lamp) lamp.position.y = top;
    g.add(warm(2.7, top + 0.55, 2.9, 0.9, 0xffe0b0, 5));
    const np = await put(g, 'office_notepads', 2.55, 2.0, 0.3, 1); if (np) np.position.y = top;
    const st = await put(g, 'stationery_supplies', 3.0, 1.7, 0.2, 1); if (st) st.position.y = top;
    const ck = await put(g, 'alarm_clock_01', 3.15, 3.0, -1.2, 1); if (ck) ck.position.y = top;
    const pc = await put(g, 'postcard_set_01', 2.4, 2.75, 0.4, 1); if (pc) pc.position.y = top;
    await put(g, 'painted_wooden_chair_01', 2.0, 2.4, -Math.PI / 2, 1, solids);
    // The board on the back wall: the notes, the section cards, a few pictures.
    const board = corkBoard(4.0, 1.7); board.position.set(-0.4, 1.6, 3.83); board.rotation.y = Math.PI; g.add(board);
    items.forEach((it, i) => {
      const nt = P.note(it.title, it.date, it.line, i, { w: 0.5, h: 0.36 });
      pickable(nt, it, g, -1.3 + i * 1.1, 1.85, 3.8, Math.PI, 0, (rnd() - 0.5) * 0.08); pick.push(nt);
    });
    const cards = [['Work', 'Thirty seven tools, each one open in a browser.'], ['Cases', 'Eight case studies: the question each tool answers.'], ['Life', 'What happens outside the work.'], ['CV', 'One page: education, work, tools.'], ['Contact', 'Write to Kerem.']];
    cards.forEach(([t, l], i) => { const c = P.note(t, '', l, 40 + i, { w: 0.3, h: 0.2 }); c.position.set(-1.9 + i * 0.78, 1.05, 3.8); c.rotation.y = Math.PI; c.rotation.z = (rnd() - 0.5) * 0.16; g.add(c); });
    [['og/about.png', 0.95, 1.9], ['og/cases.png', 1.45, 1.35]].forEach(([img, x, y], k) => { const fr = P.frame(img, null, 30 + k, { w: 0.34, h: 0.19, border: 0.008, color: 0xf6f3ee }); fr.position.set(x, y, 3.8); fr.rotation.y = Math.PI; fr.rotation.z = (rnd() - 0.5) * 0.2; g.add(fr); });
    g.add(warm(0, 2.6, 2.4, 0.5, 0xfff1dc, 8));
    // The rest of the cabin: a bed in the corner, a rocking chair, the clock, a rug.
    const bed = await put(g, 'old_bed_frame', -2.4, 2.6, Math.PI / 2, 1, solids);
    if (bed) { const bb = new THREE.Box3().setFromObject(bed); const blanket = box(Math.max(0.9, bb.max.x - bb.min.x - 0.2), 0.14, Math.max(1.6, bb.max.z - bb.min.z - 0.3), new THREE.MeshStandardMaterial({ color: 0x6b3f3a, roughness: 1 }), -2.4, Math.min(bb.max.y * 0.55, 0.46), 2.6); g.add(blanket); const pillow = box(0.5, 0.12, 0.35, new THREE.MeshStandardMaterial({ color: 0xefe9dc, roughness: 1 }), -2.4, Math.min(bb.max.y * 0.55, 0.46) + 0.1, 3.3); g.add(pillow); }
    await put(g, 'Rockingchair_01', -2.4, -0.8, 0.8, 1, solids);
    await put(g, 'wall_clock', -3.72, 2.0, Math.PI / 2, 1); g.children[g.children.length - 1].position.y = 2.0;
    await put(g, 'potted_plant_02', 3.0, -0.6, 0, 0.6, solids);
    await put(g, 'wicker_basket_01', 0.9, 3.3, 0.4, 1, solids);
    const rugTex = P.canvasTexture(512, 768, (c, W, H) => { c.fillStyle = '#7a5c48'; c.fillRect(0, 0, W, H); c.strokeStyle = '#d9c9a8'; c.lineWidth = 10; c.strokeRect(30, 30, W - 60, H - 60); for (let y = 90; y < H - 60; y += 60) { c.fillStyle = y % 120 ? '#8f6e56' : '#6b4f3e'; c.fillRect(60, y, W - 120, 22); } });
    const rug = mesh(new THREE.PlaneGeometry(1.6, 2.4), new THREE.MeshStandardMaterial({ map: rugTex, roughness: 1 }), 0.2, 0.006, 1.2, false); rug.rotation.x = -Math.PI / 2; g.add(rug);
    return { pickables: pick, ambient: 0x8d8478, env: 0.6 };
  },
};

// =====================================================================
// ABOUT: the gallery
// =====================================================================
const about = {
  slug: 'about', name: 'About', hint: 'One portrait, one page. Take it off the wall.',
  async path(g) {
    g.add(strip('marble_01', 2.6, PATH_FROM + 0.3, DOOR_R - APRON_D, { roughness: 0.35 }));
    apron(g, 'marble_01', { roughness: 0.35 });
    // Two plinths against the marble wall, a bust and a bronze on them.
    const plinthMat = new THREE.MeshStandardMaterial({ color: 0xe6e3dc, roughness: 0.6 });
    for (const [x, name, yaw] of [[-1.85, 'marble_bust_01', 0.35], [1.85, 'horse_statue_01', -0.35]]) {
      const pl = box(0.6, 1.1, 0.6, plinthMat, x, 0.55, DOOR_R - 0.55); g.add(pl); solidBox(this.solids, pl);
      const m = await put(g, name, x, DOOR_R - 0.55, yaw, name === 'marble_bust_01' ? 1.5 : 2.1); if (m) m.position.y = 1.1;
    }
  },
  door(g, opts = {}) {
    const white = new THREE.MeshStandardMaterial({ color: 0xf1efe9, roughness: 0.5 });
    const brass = new THREE.MeshStandardMaterial({ color: 0xb08d57, metalness: 0.9, roughness: 0.3 });
    const W = 1.8, H = 3.0;
    const marble = pbr('marble_01', { repeat: [1, 2], roughness: 0.35, color: 0xd6d1c6 });
    threshold(g, { w: W, h: H, frameMat: marble, inner: 0x2c2a27, depth: 1.8, jamb: 0.3, lintel: 0.4, glow: 0xf4f2ee, inRoom: opts.inRoom });
    if (!opts.inRoom) facade(g, { doorW: W, doorH: H, h: 4.0, jamb: 0.3, lintel: 0.4, mat: marble, top: marble });
    if (!opts.inRoom) {
      // A stepped architrave and a cornice, the way a gallery marks its door.
      const pilaster = marble.clone(); pilaster.color.set(0xc9c3b6);
      for (const s of [-1, 1]) g.add(box(0.18, H + 0.4, 0.34, pilaster, s * (W / 2 + 0.38), (H + 0.4) / 2, -0.02));
      g.add(box(W + 1.1, 0.22, 0.3, marble, 0, H + 0.51, -0.1));
    }
    const leaves = [-1, 1].map((side) => {
      const leaf = panelledLeaf(W / 2 - 0.01, H, 0.06, white, { rows: 2, cols: 1, inset: 0.008 });
      leaf.add(handle(brass, -side * 0.1, 1.1, -0.06, { long: true }));
      return hinged(g, leaf, side, W);
    });
    if (!opts.inRoom) { const sign = P.signboard('About', 'The gallery', 'engraved', { w: 2.2, h: 0.5 }); sign.position.set(0, H + 0.2, -0.29); g.add(sign); }
    return { width: W, set(o) { leaves[0].rotation.y = -o * 1.55; leaves[1].rotation.y = o * 1.55; } };
  },
  async room(g, ctx, items) {
    const solids = ctx.solids, pick = [];
    const floor = pbr('marble_01', { repeat: 1, roughness: 0.3 });
    const wall = new THREE.MeshStandardMaterial({ color: 0xf2f0ea, roughness: 0.9 });
    shell(g, { w: 9, d: 8.5, h: 3.8, floor, wall, ceiling: new THREE.MeshStandardMaterial({ color: 0xf4f2ec, roughness: 1 }), doorW: 1.8, doorH: 3.0, jamb: 0.3, lintel: 0.4, solids });
    trim(g, { w: 9, d: 8.5, h: 3.8, color: 0xd9d5cc });
    const it = items[0] || { title: 'About', url: 'https://keremozdemir.de/about/', image: 'og/about.png' };
    // The portrait on the far wall under its own light, the name cut into the wall above it.
    const fr = P.frame(it.image, 'ABOUT', 0, { w: 2.6, h: 1.37, border: 0.07, color: 0x1f1c19 });
    pickable(fr, it, g, 0, 1.75, 4.92, Math.PI); pick.push(fr);
    const name = P.stencil('KEREM ÖZDEMİR', 3.2, 0.42, { color: '#8a857c', size: 150, worn: 0, weight: 500 }); name.position.set(0, 3.05, 4.93); name.rotation.y = Math.PI; g.add(name);
    const spot = new THREE.SpotLight(0xfff4e6, 40, 8, 0.55, 0.5, 1.4); spot.position.set(0, 3.7, 2.6); spot.target.position.set(0, 1.7, 4.9); g.add(spot, spot.target);
    // Two side walls of smaller works: the site's other pages, each on its own light.
    const sides = [['og/work.png', 'WORK', -4.47, 1.2, Math.PI / 2], ['og/cases.png', 'CASES', -4.47, 3.4, Math.PI / 2], ['og/life.png', 'LIFE', 4.47, 1.2, -Math.PI / 2], ['og/notes.png', 'NOTES', 4.47, 3.4, -Math.PI / 2]];
    sides.forEach(([img, label, x, z, ry], i) => { const f = P.frame(img, label, 2 + i, { w: 1.5, h: 0.79, border: 0.045, color: 0xf2efe8 }); f.position.set(x, 1.75, z); f.rotation.y = ry; g.add(f); const sp = new THREE.SpotLight(0xffffff, 14, 6, 0.6, 0.6, 1.4); sp.position.set(x * 0.55, 3.7, z); sp.target.position.set(x, 1.7, z); g.add(sp, sp.target); });
    // A bust on a plinth to one side of the axis, a bench to sit on, a bronze in the corner.
    const plinthMat = new THREE.MeshStandardMaterial({ color: 0xe8e5de, roughness: 0.6 });
    const pl = box(0.6, 1.15, 0.6, plinthMat, 2.2, 0.575, 2.2); g.add(pl); solidBox(solids, pl);
    const bust = await put(g, 'marble_bust_01', 2.2, 2.2, Math.PI + 0.4, 1); if (bust) bust.position.y = 1.15;
    const plate = P.plate('KEREM ÖZDEMİR  ·  ESG AND CLIMATE FINANCE', { w: 0.56, h: 0.07, size: 40 }); plate.position.set(2.2, 0.95, 1.88); g.add(plate);
    await put(g, 'mid_century_lounge_chair', -2.6, 0.6, 0.9, 1, solids);
    await put(g, 'gothic_statue', -3.6, 4.2, 0.6, 0.85, solids);
    g.add(warm(0, 3.5, 1.0, 1.4, 0xffffff, 10), warm(0, 3.5, 3.8, 1.0, 0xffffff, 10));
    return { pickables: pick, ambient: 0xdad6ce, env: 0.55 };
  },
};

// =====================================================================
// LIFE: the garden
// =====================================================================
const life = {
  slug: 'life', name: 'Life', hint: 'Photographs on the line. Unpeg one.',
  async path(g, { rnd, time }) {
    g.add(strip('aerial_grass_rock', 3.2, PATH_FROM + 0.3, DOOR_R - APRON_D, { color: 0xd8dccc }));
    apron(g, 'aerial_grass_rock', { color: 0xd8dccc });
    createGrass(g, { count: 1100, rnd, time, place: (i) => (i < 400 ? { x: (rnd() - 0.5) * 3.0, z: PATH_FROM + 0.6 + rnd() * (DOOR_R - PATH_FROM - 4.2) } : { x: (rnd() - 0.5) * 5.0, z: DOOR_R - 3.6 + rnd() * 3.3 }) });
    // Along the garden wall: a planter, ferns, a few mossy stones.
    await put(g, 'planter_box_01', -1.9, DOOR_R - 0.6, 0.15, 1, this.solids);
    await instances(g, 'fern_02', 10, () => ({ x: (rnd() < 0.5 ? -1 : 1) * (1.5 + rnd() * 0.9), z: DOOR_R - 1.4 + rnd() * 0.9 }), { scale: [0.8, 1.3], rnd, wind: 0.03 });
    await instances(g, 'rock_moss_set_01', 5, () => ({ x: 1.6 + (rnd() - 0.5) * 0.9, z: DOOR_R - 0.9 + (rnd() - 0.5) * 0.5 }), { scale: [0.25, 0.45], rnd, sink: 0.2, shadow: true });
  },
  door(g, opts = {}) {
    const iron = new THREE.MeshStandardMaterial({ color: 0x1c1d1f, metalness: 0.7, roughness: 0.55 });
    const W = 1.5, H = 2.1;
    // Stone piers, and behind the gate a hedge: dense ferns and nettles in a dark bed.
    const rock = pbr('mossy_rock', { repeat: [1, 2], roughness: 1 });
    for (const s of [-1, 1]) { const p = box(0.55, 2.5, 0.55, rock, s * (W / 2 + 0.28), 1.25, 0); g.add(p); g.add(box(0.68, 0.14, 0.68, rock, s * (W / 2 + 0.28), 2.57, 0)); }
    if (!opts.inRoom) {
      for (const sd of [-1, 1]) { const wall = box(1.75, 1.7, 0.45, pbr('cobblestone_large_01', { repeat: [1.4, 1.2], roughness: 1 }), sd * (W / 2 + 0.56 + 0.875), 0.85, 0.15); g.add(wall); g.add(box(1.85, 0.1, 0.55, rock, sd * (W / 2 + 0.56 + 0.875), 1.75, 0.15)); }
      g.add(box(W + 1.2, 0.02, 1.6, new THREE.MeshStandardMaterial({ color: 0x1c2a1a, roughness: 1 }), 0, 0.02, 0.8));
      g.add(box(W + 1.2, 2.9, 0.12, new THREE.MeshStandardMaterial({ color: 0x0f1a12, roughness: 1 }), 0, 1.45, 1.66));
      const gl = new THREE.PointLight(0xd9e8a0, 1.2, 5, 1.8); gl.position.set(0, 1.4, 0.8); g.add(gl);
      const hedgeRnd = seeded(77);
      instances(g, 'fern_02', 26, () => ({ x: (hedgeRnd() - 0.5) * (W + 1.0), z: 0.7 + hedgeRnd() * 0.9 }), { scale: [1.4, 2.2], rnd: hedgeRnd, wind: 0.02, shadow: false });
      instances(g, 'nettle_plant', 16, () => ({ x: (hedgeRnd() - 0.5) * (W + 1.0), z: 0.6 + hedgeRnd() * 1.0 }), { scale: [1.3, 2.0], rnd: hedgeRnd, wind: 0.02, shadow: false });
    }
    const arch = mesh(new THREE.TorusGeometry(W / 2 + 0.5, 0.03, 8, 32, Math.PI), iron, 0, 2.5, 0); g.add(arch);
    if (!opts.inRoom) { const sign = P.signboard('Life', 'The garden', 'painted', { w: 1.7, h: 0.42 }); sign.position.set(0, 2.62, -0.05); g.add(sign); }
    const leaves = [-1, 1].map((side) => {
      const leaf = new THREE.Group(); const lw = W / 2 - 0.02;
      for (let i = 0; i <= 6; i++) { const x = -lw / 2 + (lw / 6) * i; const h = H - 0.15 * Math.abs(i - 3); leaf.add(mesh(new THREE.CylinderGeometry(0.014, 0.014, h, 8), iron, x, h / 2, 0)); leaf.add(mesh(new THREE.ConeGeometry(0.03, 0.09, 8), iron, x, h + 0.04, 0)); }
      for (const y of [0.25, 1.1, 1.75]) leaf.add(box(lw, 0.035, 0.035, iron, 0, y, 0));
      leaf.add(box(lw, 0.05, 0.05, iron, 0, 0.06, 0));
      return hinged(g, leaf, side, W);
    });
    return { width: W, set(o) { leaves[0].rotation.y = -o * 1.5; leaves[1].rotation.y = o * 1.5; } };
  },
  async room(g, ctx, items) {
    const rnd = seeded(53), solids = ctx.solids, pick = [], time = ctx.time;
    // Outdoors: a lawn open to the white sky, hedged by rocks and ferns.
    const lawn = mesh(new THREE.CircleGeometry(11, 48), pbr('aerial_grass_rock', { repeat: 8, roughness: 1, color: 0xd8dccc }), 0, 0.0, 3.5, false); lawn.rotation.x = -Math.PI / 2; g.add(lawn);
    g.userData.bounds = new THREE.Box3(new THREE.Vector3(-9, 0.4, -3.2), new THREE.Vector3(9, 8, 12));
    createGrass(g, { count: 3000, rnd, time, height: 0.34, place: () => { const a = rnd() * Math.PI * 2, r = 0.6 + Math.sqrt(rnd()) * 9.6; const x = r * Math.sin(a), z = 3.5 + r * Math.cos(a); if (Math.abs(x) < 0.9 && z < 5.6) return null; return { x, z }; } });
    // A gravel path from the gate to the table, and two trees for shade.
    const path = mesh(new THREE.PlaneGeometry(1.6, 6.2), pbr('cobblestone_large_01', { repeat: [1.2, 4.5], roughness: 1, color: 0xd6d2c8 }), 0, 0.004, 0.6, false); path.rotation.x = -Math.PI / 2; g.add(path);
    // The plant set holds four variants side by side; one variant each, grown to tree size.
    for (const [x, z, yaw, v] of [[-5.6, 8.4, 0.4, 'a'], [5.8, 8.0, 2.1, 'c'], [-6.5, 1.5, 1.2, 'b']]) {
      const tree = await putPart(g, 'pachira_aquatica_01', (o) => new RegExp(`_${v}$`).test(o.name), x, z, yaw, 2.2);
      if (tree) solids.push(new THREE.Box3(new V(x - 0.3, 0, z - 0.3), new V(x + 0.3, 3, z + 0.3)));
    }
    await instances(g, 'rock_moss_set_01', 18, () => { const a = rnd() * Math.PI * 2; return { x: 9.5 * Math.sin(a), z: 3.5 + 9.5 * Math.cos(a) }; }, { scale: [0.5, 1.0], rnd, sink: 0.2, shadow: true }).then((l) => l.forEach((p) => { const r = p.radius * 0.7; solids.push(new THREE.Box3(new V(p.x - r, 0, p.z - r), new V(p.x + r, 2, p.z + r))); }));
    await instances(g, 'fern_02', 40, () => { const a = rnd() * Math.PI * 2, r = 7.5 + rnd() * 2.5; return { x: r * Math.sin(a), z: 3.5 + r * Math.cos(a) }; }, { scale: [0.9, 1.5], rnd, wind: 0.03, shadow: true });
    await instances(g, 'nettle_plant', 20, () => { const a = rnd() * Math.PI * 2, r = 7 + rnd() * 3; return { x: r * Math.sin(a), z: 3.5 + r * Math.cos(a) }; }, { scale: [0.9, 1.3], rnd, wind: 0.03 });
    await put(g, 'wooden_picnic_table', 2.6, 4.2, 0.3, 1, solids);
    await put(g, 'stone_fire_pit', -3.0, 4.0, 0, 1, solids); g.add(warm(-3.0, 0.5, 4.0, 1.4, 0xff9a3c, 6));
    await put(g, 'painted_wooden_bench', -3.0, 6.2, Math.PI + 0.2, 1, solids);
    await put(g, 'tree_stump_01', -5.5, 2.0, 0, 1, solids);
    await put(g, 'dead_tree_trunk', 5.5, 9.0, 0.8, 1.1, solids);
    await put(g, 'street_lamp_02', 5.0, 1.0, 0, 1, solids); g.add(warm(5.0, 3.4, 1.0, 0.7, 0xfff0d0, 7));
    await put(g, 'planter_box_01', -6.0, 8.0, 0.4, 1, solids);
    // The washing line: two posts, a rope, photographs pegged along it.
    const post = new THREE.MeshStandardMaterial({ color: 0x5a4a3a, roughness: 0.9 });
    for (const x of [-3.5, 3.5]) { g.add(box(0.09, 2.1, 0.09, post, x, 1.05, 6.9)); solids.push(new THREE.Box3(new V(x - 0.2, 0, 6.7), new V(x + 0.2, 2.1, 7.1))); }
    { const curve = new THREE.QuadraticBezierCurve3(new V(-3.5, 2.0, 6.9), new V(0, 1.72, 6.9), new V(3.5, 2.0, 6.9)); g.add(mesh(new THREE.TubeGeometry(curve, 24, 0.006, 6, false), new THREE.MeshStandardMaterial({ color: 0xd9cfb0, roughness: 1 }), 0, 0, 0)); }
    const it = items[0] || { title: 'Life', url: 'https://keremozdemir.de/life/', image: 'og/life.png' };
    const prints = [
      { ...it }, { title: 'About', url: 'https://keremozdemir.de/about/', image: 'og/about.png' }, { title: 'Notes', url: 'https://keremozdemir.de/notes/', image: 'og/notes.png' },
      { title: 'Cases', url: 'https://keremozdemir.de/cases/', image: 'og/cases.png' }, { title: 'Contact', url: 'https://keremozdemir.de/contact/', image: 'og/contact.png' },
    ];
    prints.forEach((pr, i) => {
      const fr = P.frame(pr.image, pr.title, 10 + i, { w: 0.7, h: 0.44, border: 0.025, color: 0xf6f3ee });
      { const u = (-2.6 + i * 1.3) / 3.5; const y = 2.0 - 0.28 * (1 - u * u); pickable(fr, pr, g, -2.6 + i * 1.3, y - 0.3, 6.9, Math.PI, 0, (rnd() - 0.5) * 0.08); }
      for (const dx of [-0.18, 0.18]) fr.add(box(0.02, 0.06, 0.03, post, dx, 0.2, 0));
      pick.push(fr);
    });
    await instances(g, 'shrub_02', 10, () => { const a = rnd() * Math.PI * 2, r = 8.5 + rnd() * 2; return { x: r * Math.sin(a), z: 3.5 + r * Math.cos(a) }; }, { scale: [0.9, 1.4], rnd, wind: 0.015, shadow: true });
    await instances(g, 'shrub_03', 8, () => { const a = rnd() * Math.PI * 2, r = 8 + rnd() * 2.5; return { x: r * Math.sin(a), z: 3.5 + r * Math.cos(a) }; }, { scale: [0.9, 1.3], rnd, wind: 0.015, shadow: true });
    g.add(warm(0, 3.5, 5, 0.6, 0xffffff, 14));
    return { pickables: pick, ambient: 0xe4e6dc, outdoors: true };
  },
};

// =====================================================================
// CV: the office
// =====================================================================
const cv = {
  slug: 'cv', name: 'CV', hint: 'The CV on the desk. Pick it up.',
  async path(g) {
    g.add(strip('laminate_floor_02', 2.4, PATH_FROM + 0.3, DOOR_R - APRON_D, { roughness: 0.5 }));
    apron(g, 'laminate_floor_02', { roughness: 0.5 });
    // A waiting chair and a plant against the glass.
    await put(g, 'modern_arm_chair_01', -1.8, DOOR_R - 0.75, 0.35, 1, this.solids);
    await put(g, 'potted_plant_04', 1.9, DOOR_R - 0.6, 0, 1, this.solids);
  },
  door(g, opts = {}) {
    const alu = new THREE.MeshStandardMaterial({ color: 0x3a3d42, metalness: 0.7, roughness: 0.4 });
    const glass = new THREE.MeshPhysicalMaterial({ color: 0xdfe8ee, transparent: true, opacity: 0.32, roughness: 0.05, metalness: 0, transmission: 0 });
    const frost = new THREE.MeshPhysicalMaterial({ color: 0xd3d9dc, transparent: true, opacity: 0.9, roughness: 0.35, metalness: 0.05 });
    const W = 1.2, H = 2.3;
    threshold(g, { w: W, h: H, frameMat: alu, inner: 0xe9eaec, jamb: 0.06, lintel: 0.08, glow: 0xffffff, shell: new THREE.MeshStandardMaterial({ color: 0x3a3d42, metalness: 0.6, roughness: 0.5 }), inRoom: opts.inRoom });
    if (!opts.inRoom) { facade(g, { doorW: W, doorH: H, h: 3.2, jamb: 0.06, lintel: 0.08, mat: frost, depth: 0.22, z: 0.0 }); for (const x of [-2.6, -0.66, 0.66, 2.6]) g.add(box(0.08, 3.3, 0.12, alu, x, 1.65, 0)); g.add(box(5.3, 0.1, 0.5, alu, 0, 3.25, 0.1)); }
    const leaf = new THREE.Group();
    leaf.add(box(W - 0.02, H, 0.012, glass, 0, H / 2, 0));
    leaf.add(box(W - 0.02, 0.5, 0.014, frost, 0, 1.25, 0));
    for (const y of [0.02, H - 0.02]) leaf.add(box(W - 0.02, 0.04, 0.05, alu, 0, y, 0));
    for (const x of [-(W / 2 - 0.02), W / 2 - 0.02]) leaf.add(box(0.04, H, 0.05, alu, x, H / 2, 0));
    leaf.add(handle(alu, 0.35, 1.05, -0.05, { long: true }));
    const st = P.stencil('K. ÖZDEMİR', 0.5, 0.08, { color: '#2a2c30', size: 110, worn: 0, weight: 500 }); st.position.set(0, 1.35, -0.012); st.rotation.y = Math.PI; leaf.add(st);
    if (!opts.inRoom) {
      const sign = P.signboard('CV', 'The office', 'backlit', { w: 1.6, h: 0.42 }); sign.position.set(0, H + 0.42, -0.1); g.add(sign);
      g.add(box(W + 1.0, 0.08, 0.9, alu, 0, H + 0.72, -0.4));
    }
    const pivot = hinged(g, leaf, -1, W);
    return { width: W, set(o) { pivot.rotation.y = -o * 1.5; } };
  },
  async room(g, ctx, items) {
    const solids = ctx.solids, pick = [];
    const floor = pbr('laminate_floor_02', { repeat: 1, roughness: 0.5 });
    const wall = pbr('plastered_wall_04', { repeat: 1, roughness: 1, color: 0xf0efea });
    const W = 8, D = 7.5, H = 3.1;
    shell(g, { w: W, d: D, h: H, floor, wall, ceiling: new THREE.MeshStandardMaterial({ color: 0xf2f2f0, roughness: 1 }), doorW: 1.2, doorH: 2.3, jamb: 0.06, lintel: 0.08, solids });
    trim(g, { w: W, d: D, h: H, color: 0xc4c6ca, rail: false });
    // The desk faces the door; the CV lies on it, the laptop and lamp beside.
    const desk = await put(g, 'metal_office_desk', 0, 2.4, 0, 1.1, solids);
    const top = desk ? new THREE.Box3().setFromObject(desk).max.y : 0.76;
    const it = items[0] || { title: 'CV', url: 'https://keremozdemir.de/cv/', image: 'og/cv.png' };
    const sh = P.sheet([['KEREM ÖZDEMİR', 46, 700], ['ESG and climate finance analyst, Germany', 24, 400], ['Education, work, tools: one page.', 24, 400], ['Pick up to read the full CV.', 22, 300]], 0);
    pickable(sh, it, g, -0.25, top + 0.006, 2.15, -0.15); pick.push(sh);
    const lp = await put(g, 'classic_laptop', 0.55, 2.55, Math.PI, 1); if (lp) lp.position.y = top;
    const lamp = await put(g, 'desk_lamp_arm_01', -0.95, 2.7, 0.8, 1); if (lamp) lamp.position.y = top;
    g.add(warm(-0.7, top + 0.6, 2.5, 1.1, 0xffe8cc, 6));
    const stp = await put(g, 'vintage_stapler', 0.95, 2.1, 0.5, 1); if (stp) stp.position.y = top;
    await put(g, 'modern_arm_chair_01', 0, 3.4, Math.PI, 1, solids);
    await put(g, 'wall_clock', 0, D - 3.5 - 0.16, Math.PI, 1); g.children[g.children.length - 1].position.y = 2.35;
    // The timeline on a chalkboard against the right wall, the diploma framed on the left.
    const cb = await put(g, 'standing_chalkboard_01', 2.9, 3.0, -Math.PI / 2 + 0.25, 1, solids);
    const tl = P.canvasTexture(1024, 768, (c, W_, H_) => {
      c.clearRect(0, 0, W_, H_); c.strokeStyle = '#e8e4d8'; c.fillStyle = '#e8e4d8'; c.lineWidth = 4;
      c.beginPath(); c.moveTo(90, 120); c.lineTo(90, 660); c.stroke();
      c.font = `500 34px ${P.FONT}`; c.textAlign = 'left'; c.textBaseline = 'middle';
      [['Education', 160], ['Analysis and tools', 300], ['Case studies', 440], ['Now: open to ESG roles', 580]].forEach(([t, y]) => { c.beginPath(); c.arc(90, y, 9, 0, Math.PI * 2); c.fill(); c.fillText(t, 130, y); });
    });
    if (cb) { const b = new THREE.Box3().setFromObject(cb); const tlm = new THREE.Mesh(new THREE.PlaneGeometry(1.0, 0.75), new THREE.MeshStandardMaterial({ map: tl, transparent: true, roughness: 1 })); const off = (b.max.x - b.min.x) * 0.5 - 0.02; tlm.position.set(2.9 - Math.cos(0.25) * off, (b.min.y + b.max.y) / 2 + 0.12, 3.0 + Math.sin(0.25) * off); tlm.rotation.set(0, -Math.PI / 2 + 0.25, 0); tlm.rotateX(-0.14); g.add(tlm); }
    const dip = P.frame(it.image, 'CV', 5, { w: 0.9, h: 0.47, border: 0.03, color: 0x2b2622 }); dip.position.set(-W / 2 + 0.03, 1.8, 0.4); dip.rotation.y = Math.PI / 2; g.add(dip);
    await put(g, 'steel_frame_shelves_03', -2.8, D - 3.5 - 0.45, 0, 1, solids);
    const card = new THREE.MeshStandardMaterial({ color: 0xd9d4c8, roughness: 1 });
    for (let i = 0; i < 6; i++) g.add(box(0.08, 0.3, 0.26, card, -3.6 + i * 0.13, 0.19, D - 3.5 - 0.45));
    await put(g, 'potted_plant_04', 3.4, 0.4, 0, 1, solids);
    // The waiting corner by the door, so the run of floor from the door to the desk has something in it.
    await put(g, 'ArmChair_01', 3.0, -2.0, -Math.PI / 2 - 0.35, 1, solids);
    await put(g, 'side_table_01', 3.1, -0.9, 0, 1, solids);
    for (const z of [0.8, 3.2]) { g.add(box(1.5, 0.06, 0.26, new THREE.MeshStandardMaterial({ color: 0xe3e5e8, metalness: 0.4, roughness: 0.5 }), 0, H - 0.03, z)); const tube = box(1.3, 0.03, 0.09, new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xffffff, emissiveIntensity: 1.2 }), 0, H - 0.07, z); g.add(tube); g.add(warm(0, H - 0.3, z, 0.9, 0xffffff, 9)); }
    // A window with blinds on the left wall, daylight in stripes.
    const blind = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xf2f5fa, emissiveIntensity: 0.8 });
    for (let i = 0; i < 14; i++) g.add(box(0.03, 0.07, 2.0, blind, -W / 2 + 0.04, 1.05 + i * 0.13, 2.0));
    for (const dz of [-1.05, 1.05]) g.add(box(0.06, 2.0, 0.06, new THREE.MeshStandardMaterial({ color: 0xd8d9db, roughness: 0.6 }), -W / 2 + 0.05, 1.95, 2.0 + dz));
    const dayL = new THREE.PointLight(0xeef3ff, 1.4, 8, 1.4); dayL.position.set(-3.0, 2.0, 2.0); g.add(dayL);
    return { pickables: pick, ambient: 0xc9cbc8, env: 0.55 };
  },
};

// =====================================================================
// CONTACT: the front door
// =====================================================================
const contact = {
  slug: 'contact', name: 'Contact', hint: 'Letters on the hall table. Take one.',
  async path(g) {
    g.add(strip('cobblestone_floor_08', 2.4, PATH_FROM + 0.3, DOOR_R - APRON_D));
    apron(g, 'cobblestone_floor_08');
    // Street furniture at the house front: a lamp post at the corner, the bin by the door.
    await put(g, 'street_lamp_02', 2.35, DOOR_R - 1.1, 0, 1, this.solids); g.add(warm(2.35, 3.3, DOOR_R - 1.1, 0.8, 0xfff0d0, 7));
    await putPart(g, 'metal_trash_can', (o) => /rust/i.test(o.name), -1.8, DOOR_R - 0.6, 0.3, 1, this.solids);
  },
  door(g, opts = {}) {
    const paint = new THREE.MeshStandardMaterial({ color: 0x7a1f1f, roughness: 0.45 });
    const brass = new THREE.MeshStandardMaterial({ color: 0xb08d57, metalness: 0.9, roughness: 0.3 });
    const brick = pbr('red_brick_03', { repeat: [1, 2], roughness: 1 });
    const W = 1.2, H = 2.2;
    threshold(g, { w: W, h: H, frameMat: new THREE.MeshStandardMaterial({ color: 0xf1efe9, roughness: 0.6 }), inner: 0x2a2320, glow: 0xffc27a, shell: brick, inRoom: opts.inRoom });
    if (!opts.inRoom) facade(g, { doorW: W, doorH: H, h: 3.6, mat: brick, top: new THREE.MeshStandardMaterial({ color: 0xb7ada0, roughness: 0.8 }) });
    // Brick reveals either side and a fanlight above.
    g.add(box(W + 0.24, 0.42, 0.04, new THREE.MeshPhysicalMaterial({ color: 0xe6eef2, transparent: true, opacity: 0.35, roughness: 0.1 }), 0, H + 0.38, 0.02));
    const leaf = panelledLeaf(W - 0.02, H, 0.06, paint, { rows: 3, cols: 2 });
    leaf.add(handle(brass, 0.32, 1.05, -0.06));
    leaf.add(box(0.26, 0.05, 0.02, brass, 0, 1.0, -0.04));     // letter slot
    leaf.add(mesh(new THREE.TorusGeometry(0.05, 0.01, 8, 24), brass, 0, 1.55, -0.05)); // knocker
    const num = P.plate('7', { w: 0.1, h: 0.13, bg: '#b08d57', fg: '#2a2115', size: 90 }); num.position.set(0.28, 1.85, -0.04); num.rotation.y = Math.PI; leaf.add(num);
    if (!opts.inRoom) {
      const bell = P.plate('ÖZDEMİR', { w: 0.14, h: 0.05, bg: '#d9dadb', fg: '#2a2c30', size: 36 }); bell.position.set(W / 2 + 0.3, 1.35, -0.02); g.add(bell);
      g.add(mesh(new THREE.SphereGeometry(0.014, 12, 8), brass, W / 2 + 0.3, 1.28, -0.02));
      const lamp = mesh(new THREE.SphereGeometry(0.08, 16, 12), new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xffe0b0, emissiveIntensity: 1.6 }), 0, H + 0.75, -0.12); g.add(lamp); g.add(warm(0, H + 0.6, -0.4, 0.9, 0xffd9a0, 5));
      const sign = P.signboard('Contact', 'The front door', 'enamel', { w: 1.6, h: 0.42 }); sign.position.set(0, H + 1.15, -0.28); g.add(sign);
    }
    const pivot = hinged(g, leaf, -1, W);
    return { width: W, set(o) { pivot.rotation.y = -o * 1.6; } };
  },
  async room(g, ctx, items) {
    const rnd = seeded(59), solids = ctx.solids, pick = [];
    const floor = pbr('herringbone_parquet', { repeat: 1, roughness: 0.6 });
    const wall = pbr('plastered_wall_04', { repeat: 1, roughness: 1, color: 0xe2d9c8 });
    shell(g, { w: 7, d: 8, h: 3.2, floor, wall, ceiling: new THREE.MeshStandardMaterial({ color: 0xf1efe9, roughness: 1 }), doorW: 1.2, doorH: 2.2, solids });
    const brick = box(0.1, 3.2, 8, pbr('red_brick_03', { repeat: [4, 1.6], roughness: 1 }), 3.44, 1.6, 0.5); g.add(brick);
    const table = await put(g, 'ClassicConsole_01', 0, 4.25, Math.PI, 1, solids);
    const top = table ? new THREE.Box3().setFromObject(table).max.y : 0.8;
    const it = items[0] || { title: 'Contact', url: 'https://keremozdemir.de/contact/', image: 'og/contact.png' };
    [['Write to Kerem', 'kozdemir3523@gmail.com'], ['Say hello', 'from anywhere'], ['A question about a tool', 'or a case']].forEach(([to, from], i) => {
      const e = P.envelope(to, from, i);
      pickable(e, { ...it, title: to }, g, -0.5 + i * 0.5, top + 0.004 + i * 0.005, 4.2 + (rnd() - 0.5) * 0.1, (rnd() - 0.5) * 0.5);
      pick.push(e);
    });
    await put(g, 'ornate_mirror_01', 0, 4.47, Math.PI, 1); g.children[g.children.length - 1].position.y = 1.9;
    const lamp = await put(g, 'vintage_oil_lamp', 1.0, 4.3, 0, 1); if (lamp) lamp.position.y = top;
    g.add(warm(1.0, top + 0.5, 4.2, 1.1, 0xffc67a, 6));
    await put(g, 'vintage_telephone_wall_clock', -3.44, 2.4, Math.PI / 2, 1); g.children[g.children.length - 1].position.y = 1.7;
    await putPart(g, 'vintage_suitcase', (o) => /_01_/.test(o.name), -2.6, 1.2, 0.6, 1, solids);
    await put(g, 'wicker_basket_01', 2.6, 1.0, 0, 1, solids);
    await put(g, 'painted_wooden_chair_01', -2.5, 3.6, 1.2, 1, solids);
    await put(g, 'potted_plant_02', 2.6, 3.6, 0, 1, solids);
    const vr = await put(g, 'vintage_radio_transceiver', 2.6, 1.0, -0.6, 1); if (vr) vr.position.y = 0.5;
    g.add(warm(0, 2.9, 2.0, 1.0, 0xffe6cc, 9));
    const mail = P.plate('kozdemir3523@gmail.com', { w: 0.5, h: 0.07, bg: '#f4f0e6', fg: '#2a2c30', metal: false, size: 44 }); mail.position.set(0, 0.95, 4.02); mail.rotation.x = -0.3; g.add(mail);
    trim(g, { w: 7, d: 8, h: 3.2, color: 0x4a3f36 });
    const matTex = P.canvasTexture(512, 320, (c, W, H) => { c.fillStyle = '#6b5a45'; c.fillRect(0, 0, W, H); c.strokeStyle = '#3f3428'; c.lineWidth = 12; c.strokeRect(14, 14, W - 28, H - 28); c.fillStyle = '#e9dfc8'; c.font = `700 90px ${P.FONT}`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('WELCOME', W / 2, H / 2); });
    const doormat = mesh(new THREE.PlaneGeometry(0.9, 0.56), new THREE.MeshStandardMaterial({ map: matTex, roughness: 1 }), 0, 0.007, -2.6, false); doormat.rotation.x = -Math.PI / 2; doormat.rotation.z = Math.PI; g.add(doormat);
    const runTex = P.canvasTexture(256, 1024, (c, W, H) => { c.fillStyle = '#7a2a2a'; c.fillRect(0, 0, W, H); c.strokeStyle = '#d9c9a8'; c.lineWidth = 8; c.strokeRect(18, 18, W - 36, H - 36); });
    const runner = mesh(new THREE.PlaneGeometry(1.0, 6.4), new THREE.MeshStandardMaterial({ map: runTex, roughness: 1 }), 0, 0.006, 0.4, false); runner.rotation.x = -Math.PI / 2; g.add(runner);
    return { pickables: pick, ambient: 0x8a7e70, env: 0.5 };
  },
};

export const THEMES = { work, cases, notes, about, life, cv, contact };
// Around the circle: About ahead, Work to the left, Contact to the right, the rest behind.
export const ORDER = ['about', 'work', 'contact', 'cases', 'cv', 'notes', 'life'];
export function angleOf(slug) {
  const k = ORDER.indexOf(slug);
  // Looking out from the centre, positive x is on the left of the screen.
  const idx = [0, 1, -1, 2, -2, 3, -3][k];
  return idx * (Math.PI * 2 / 7);
}
