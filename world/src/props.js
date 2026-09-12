// Procedural objects that carry text: a book with its title on the spine, a
// case folder with a tab, a pinned note, a framed picture, a typed sheet, an
// envelope. Scanned models furnish the rooms; these are the things you pick up.

import * as THREE from 'three';

export const FONT = '"Instrument Sans", system-ui, sans-serif';

export function canvasTexture(w, h, draw) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d'); draw(g, w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  return t;
}

// Fine paper grain and a little dirt so nothing looks printed by a computer.
function grain(g, w, h, amount = 0.06, seed = 1) {
  let s = seed >>> 0; const rnd = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
  for (let i = 0; i < (w * h) / 40; i++) {
    g.fillStyle = `rgba(0,0,0,${rnd() * amount})`; g.fillRect(rnd() * w, rnd() * h, 1 + rnd() * 2, 1 + rnd() * 2);
  }
}

function wrap(g, text, maxWidth) {
  const words = text.split(' '), lines = []; let line = '';
  for (const w of words) { const t = line ? `${line} ${w}` : w; if (g.measureText(t).width > maxWidth && line) { lines.push(line); line = w; } else line = t; }
  if (line) lines.push(line);
  return lines;
}

const PALETTE = ['#5a2a2a', '#25324a', '#2f4a36', '#8a6a2a', '#3c3c44', '#6b3d2e', '#1f3d4a', '#7a5a4a', '#4a4a2a', '#2c2c2c'];
const PAPER = '#efe9da';

// ---- Book: a hard cover, cream page block, title on spine and cover ----
export function book(title, i = 0, { w = 0.16, h = 0.235, d = 0.032 } = {}) {
  const color = PALETTE[i % PALETTE.length];
  const num = String(i + 1).padStart(2, '0');
  const cover = canvasTexture(512, 768, (g, W, H) => {
    g.fillStyle = color; g.fillRect(0, 0, W, H);
    grain(g, W, H, 0.12, i + 3);
    g.strokeStyle = 'rgba(235,225,200,0.55)'; g.lineWidth = 3; g.strokeRect(36, 36, W - 72, H - 72);
    g.fillStyle = '#eadfc4'; g.textAlign = 'center'; g.textBaseline = 'top';
    g.font = `300 44px ${FONT}`; g.fillText(num, W / 2, 70);
    g.font = `700 54px ${FONT}`;
    const lines = wrap(g, title.toUpperCase(), W - 120); let y = 170;
    for (const l of lines.slice(0, 5)) { g.fillText(l, W / 2, y); y += 66; }
    g.font = `400 26px ${FONT}`; g.fillText('KEREM ÖZDEMİR', W / 2, H - 100);
  });
  const spine = canvasTexture(128, 768, (g, W, H) => {
    g.fillStyle = color; g.fillRect(0, 0, W, H); grain(g, W, H, 0.12, i + 7);
    g.save(); g.translate(W / 2, H / 2); g.rotate(-Math.PI / 2);
    g.fillStyle = '#eadfc4'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.font = `700 40px ${FONT}`; let t = title.toUpperCase(); while (g.measureText(t).width > H - 160 && t.length > 4) t = t.slice(0, -2);
    g.fillText(t, 0, 0); g.restore();
    g.font = `300 34px ${FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(num, W / 2, H - 60);
  });
  const pages = new THREE.MeshStandardMaterial({ color: PAPER, roughness: 0.95 });
  const mats = [
    new THREE.MeshStandardMaterial({ color: PAPER, roughness: 0.95 }),  // +x fore edge (pages)
    new THREE.MeshStandardMaterial({ map: spine, roughness: 0.75 }),    // -x spine
    pages, pages,                                                      // top, bottom
    new THREE.MeshStandardMaterial({ map: cover, roughness: 0.75 }),    // +z front cover
    new THREE.MeshStandardMaterial({ color, roughness: 0.75 }),         // -z back cover
  ];
  const g = new THREE.Group();
  const block = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mats); block.castShadow = block.receiveShadow = true; g.add(block);
  // Covers stand a millimetre proud of the page block.
  const lip = new THREE.Mesh(new THREE.BoxGeometry(w + 0.006, h + 0.008, 0.003), mats[4]); lip.position.z = d / 2 + 0.0015; g.add(lip);
  const lipB = new THREE.Mesh(new THREE.BoxGeometry(w + 0.006, h + 0.008, 0.003), mats[5]); lipB.position.z = -d / 2 - 0.0015; g.add(lipB);
  g.userData.kind = 'book';
  return g;
}

// ---- Folder: manila card, tab with the case name, a typed label ----
export function folder(title, line, i = 0, { w = 0.31, h = 0.24 } = {}) {
  const tex = canvasTexture(1024, 768, (g, W, H) => {
    g.fillStyle = '#d8c48f'; g.fillRect(0, 0, W, H); grain(g, W, H, 0.1, i + 11);
    g.fillStyle = '#f4efe2'; g.fillRect(70, 90, 560, 150);
    g.fillStyle = '#2a2a2a'; g.textAlign = 'left'; g.textBaseline = 'top';
    g.font = `700 40px ${FONT}`; g.fillText(`CASE ${String(i + 1).padStart(2, '0')}`, 90, 105);
    g.font = `500 44px ${FONT}`; let t = title; while (g.measureText(t).width > 520 && t.length > 4) t = t.slice(0, -2); g.fillText(t, 90, 160);
    if (line) { g.font = `400 26px ${FONT}`; g.fillStyle = '#4a4a4a'; wrap(g, line, 800).slice(0, 3).forEach((l, k) => g.fillText(l, 70, 300 + k * 36)); }
    g.strokeStyle = 'rgba(80,60,20,0.35)'; g.lineWidth = 2; g.strokeRect(0, 0, W, H);
  });
  const card = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.9 });
  const plain = new THREE.MeshStandardMaterial({ color: '#d8c48f', roughness: 0.9 });
  const g = new THREE.Group();
  const back = new THREE.Mesh(new THREE.BoxGeometry(w, 0.004, h), plain); back.castShadow = back.receiveShadow = true; g.add(back);
  const sheets = new THREE.Mesh(new THREE.BoxGeometry(w - 0.02, 0.01, h - 0.02), new THREE.MeshStandardMaterial({ color: PAPER, roughness: 1 })); sheets.position.y = 0.007; g.add(sheets);
  const front = new THREE.Mesh(new THREE.BoxGeometry(w, 0.004, h), [plain, plain, card, plain, plain, plain]); front.position.y = 0.014; front.castShadow = true; g.add(front);
  const tab = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.004, 0.03), plain); tab.position.set(w / 2 - 0.09, 0.014, -h / 2 - 0.012); g.add(tab);
  g.userData.kind = 'folder'; g.userData.flap = front;
  return g;
}

// ---- Note: a sheet of paper, typed, with its date, a pin at the top ----
export function note(title, date, line, i = 0, { w = 0.21, h = 0.15 } = {}) {
  const tex = canvasTexture(768, 548, (g, W, H) => {
    g.fillStyle = '#f4f0e6'; g.fillRect(0, 0, W, H); grain(g, W, H, 0.08, i + 19);
    g.strokeStyle = 'rgba(60,80,120,0.18)'; g.lineWidth = 2; for (let y = 120; y < H; y += 46) { g.beginPath(); g.moveTo(40, y); g.lineTo(W - 40, y); g.stroke(); }
    g.fillStyle = '#7a1f1f'; g.font = `500 28px ${FONT}`; g.textAlign = 'left'; g.textBaseline = 'top'; g.fillText(date || '', 50, 40);
    g.fillStyle = '#1e1e1e'; g.font = `700 40px ${FONT}`; wrap(g, title, W - 100).slice(0, 2).forEach((l, k) => g.fillText(l, 50, 86 + k * 50));
    if (line) { g.font = `400 26px ${FONT}`; g.fillStyle = '#3a3a3a'; wrap(g, line, W - 100).slice(0, 4).forEach((l, k) => g.fillText(l, 50, 210 + k * 46)); }
  });
  const g = new THREE.Group();
  const sheet = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.95, side: THREE.DoubleSide })); sheet.castShadow = true; g.add(sheet);
  const pin = new THREE.Mesh(new THREE.SphereGeometry(0.008, 12, 8), new THREE.MeshStandardMaterial({ color: 0xc0392b, roughness: 0.4, metalness: 0.1 })); pin.position.set(0, h / 2 - 0.012, 0.006); g.add(pin);
  g.userData.kind = 'note';
  return g;
}

// ---- Frame: a wooden picture frame around a page preview ----
export function frame(imageUrl, title, i = 0, { w = 0.6, h = 0.32, border = 0.035, color = 0x2b2622 } = {}) {
  const g = new THREE.Group();
  const wood = new THREE.MeshStandardMaterial({ color, roughness: 0.55, metalness: 0.05 });
  const outer = new THREE.Mesh(new THREE.BoxGeometry(w + border * 2, h + border * 2, 0.035), wood); outer.castShadow = outer.receiveShadow = true; g.add(outer);
  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.6 });
  if (imageUrl) new THREE.TextureLoader().load(imageUrl, (t) => { t.colorSpace = THREE.SRGBColorSpace; mat.map = t; mat.color.set(0xffffff); mat.needsUpdate = true; });
  const pic = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat); pic.position.z = 0.019; g.add(pic);
  const glass = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshPhysicalMaterial({ color: 0xffffff, transparent: true, opacity: 0.08, roughness: 0.05, metalness: 0, clearcoat: 1 })); glass.position.z = 0.021; g.add(glass);
  if (title) {
    const label = new THREE.Mesh(new THREE.PlaneGeometry(0.16, 0.04), new THREE.MeshStandardMaterial({ map: canvasTexture(512, 128, (c, W, H) => { c.fillStyle = '#f4f0e6'; c.fillRect(0, 0, W, H); c.fillStyle = '#222'; c.font = `500 44px ${FONT}`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(title, W / 2, H / 2); }), roughness: 0.9 }));
    label.position.set(0, -(h / 2 + border + 0.035), 0.02); g.add(label);
  }
  g.userData.kind = 'frame';
  return g;
}

// ---- Sheet: one typed page lying flat ----
export function sheet(lines, i = 0, { w = 0.21, h = 0.297 } = {}) {
  const tex = canvasTexture(768, 1086, (g, W, H) => {
    g.fillStyle = '#f7f4ec'; g.fillRect(0, 0, W, H); grain(g, W, H, 0.06, i + 23);
    g.fillStyle = '#1a1a1a'; g.textAlign = 'left'; g.textBaseline = 'top';
    let y = 70;
    for (const [text, size, weight] of lines) { g.font = `${weight || 400} ${size || 26}px ${FONT}`; for (const l of wrap(g, text, W - 140)) { g.fillText(l, 70, y); y += (size || 26) * 1.35; } y += 10; }
  });
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.95, side: THREE.DoubleSide }));
  m.rotation.x = -Math.PI / 2; m.castShadow = true;
  const g = new THREE.Group(); g.add(m); g.userData.kind = 'sheet';
  return g;
}

// ---- Envelope: cream, handwritten address, a stamp ----
export function envelope(to, from, i = 0, { w = 0.22, h = 0.11 } = {}) {
  const tex = canvasTexture(1024, 512, (g, W, H) => {
    g.fillStyle = '#f1ead8'; g.fillRect(0, 0, W, H); grain(g, W, H, 0.08, i + 29);
    g.strokeStyle = 'rgba(0,0,0,0.25)'; g.lineWidth = 3; g.strokeRect(2, 2, W - 4, H - 4);
    g.fillStyle = '#1e2a3a'; g.textAlign = 'left'; g.textBaseline = 'top';
    g.font = `italic 500 52px ${FONT}`; g.fillText(to, 300, 200);
    g.font = `400 30px ${FONT}`; g.fillText(from || '', 60, 40);
    g.fillStyle = '#9b2c2c'; g.fillRect(W - 170, 40, 120, 140); g.fillStyle = '#f1ead8'; g.font = `700 60px ${FONT}`; g.textAlign = 'center'; g.fillText('K', W - 110, 80);
  });
  const g = new THREE.Group();
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, 0.004, h), [null, null, new THREE.MeshStandardMaterial({ map: tex, roughness: 0.95 }), null, null, null].map((x) => x || new THREE.MeshStandardMaterial({ color: 0xf1ead8, roughness: 0.95 })));
  m.castShadow = m.receiveShadow = true; g.add(m); g.userData.kind = 'envelope';
  return g;
}

// ---- Sign: a painted board or a brass plate with text ----
export function plate(text, { w = 0.5, h = 0.12, bg = '#b9975b', fg = '#2a2115', metal = true, size = 72 } = {}) {
  const tex = canvasTexture(1024, Math.round(1024 * h / w), (g, W, H) => {
    g.fillStyle = bg; g.fillRect(0, 0, W, H); grain(g, W, H, 0.12, 31);
    g.fillStyle = fg; g.font = `600 ${size}px ${FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(text, W / 2, H / 2 + 2);
    g.strokeStyle = 'rgba(0,0,0,0.35)'; g.lineWidth = 6; g.strokeRect(12, 12, W - 24, H - 24);
  });
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.012), new THREE.MeshStandardMaterial({ map: tex, roughness: metal ? 0.35 : 0.85, metalness: metal ? 0.7 : 0 }));
  m.castShadow = true; return m;
}

// Big label painted straight on a surface: transparent, so the material under it shows.
export function stencil(text, w, h, { color = '#f2efe6', weight = 800, size = 220, worn = 0.6 } = {}) {
  const tex = canvasTexture(2048, Math.round(2048 * h / w), (g, W, H) => {
    g.clearRect(0, 0, W, H); g.fillStyle = color; g.font = `${weight} ${size}px ${FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(text, W / 2, H / 2);
    let s = 5; const rnd = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
    g.globalCompositeOperation = 'destination-out';
    for (let i = 0; i < 1500 * worn; i++) { g.globalAlpha = 0.2 + rnd() * 0.6; g.beginPath(); g.arc(rnd() * W, rnd() * H, 1 + rnd() * 6, 0, Math.PI * 2); g.fill(); }
  });
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({ map: tex, transparent: true, roughness: 0.9, polygonOffset: true, polygonOffsetFactor: -2 }));
  return m;
}

// ---- Signboard: the section's name large, its room beneath, in the theme's own style ----
// style: brass | stencil | painted | engraved | iron | backlit | enamel
export function signboard(name, sub, style = 'painted', { w = 1.8, h = 0.5 } = {}) {
  const S = {
    brass:    { bg: '#b9975b', fg: '#241b0e', sub: '#4a3a1e', border: '#7a6236', grainAmt: 0.14, weight: 700, metal: 0.8, rough: 0.35 },
    stencil:  { bg: '#3d4247', fg: '#e8e2d2', sub: '#c9c2b0', border: '#20242a', grainAmt: 0.25, weight: 800, metal: 0.6, rough: 0.6 },
    painted:  { bg: '#e4d9c2', fg: '#2b241c', sub: '#5a4e3c', border: '#8a7a5a', grainAmt: 0.16, weight: 700, metal: 0, rough: 0.85 },
    engraved: { bg: '#e9e6df', fg: '#3a3733', sub: '#4a453d', border: '#c9c5bc', grainAmt: 0.05, weight: 500, metal: 0, rough: 0.4 },
    iron:     { bg: '#1f2123', fg: '#d8d3c8', sub: '#a39d90', border: '#0e0f10', grainAmt: 0.2, weight: 700, metal: 0.7, rough: 0.55 },
    backlit:  { bg: '#f6f7f8', fg: '#1d2024', sub: '#5c636b', border: '#c8ccd0', grainAmt: 0.0, weight: 600, metal: 0, rough: 0.3, glow: true },
    enamel:   { bg: '#1f3f6e', fg: '#f4f1e8', sub: '#d6dbe4', border: '#f4f1e8', grainAmt: 0.06, weight: 700, metal: 0.2, rough: 0.3 },
  }[style];
  const tex = canvasTexture(1536, Math.round(1536 * h / w), (g, W, H) => {
    g.fillStyle = S.bg; g.fillRect(0, 0, W, H); grain(g, W, H, S.grainAmt, 37);
    g.strokeStyle = S.border; g.lineWidth = 10; g.strokeRect(18, 18, W - 36, H - 36);
    g.fillStyle = S.fg; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.font = `${S.weight} ${Math.round(H * 0.46)}px ${FONT}`; g.fillText(name.toUpperCase(), W / 2, H * (sub ? 0.4 : 0.52));
    if (sub) { g.fillStyle = S.sub; g.font = `500 ${Math.round(H * 0.24)}px ${FONT}`; g.fillText(sub.toUpperCase().split('').join(' '), W / 2, H * 0.77); }
  });
  const mat = new THREE.MeshStandardMaterial({ map: tex, roughness: S.rough, metalness: S.metal, emissive: S.glow ? 0xffffff : 0x000000, emissiveMap: S.glow ? tex : null, emissiveIntensity: S.glow ? 0.9 : 0 });
  // The lettered face is -z: a door's approach side, so the sign reads on the way in.
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.05), [null, null, null, null, null, mat].map((x) => x || new THREE.MeshStandardMaterial({ color: S.border, roughness: 0.7, metalness: S.metal })));
  m.castShadow = true; m.userData.kind = 'sign';
  return m;
}

// ---- Floor slab with a name cut into the stone, read from where the visitor stands ----
export function floorSlab(text, { w = 1.6, h = 0.6, stone = '#cfc9bd', ink = '#4a453d' } = {}) {
  const tex = canvasTexture(1024, Math.round(1024 * h / w), (g, W, H) => {
    g.fillStyle = stone; g.fillRect(0, 0, W, H); grain(g, W, H, 0.12, 41);
    g.strokeStyle = 'rgba(0,0,0,0.25)'; g.lineWidth = 4; g.strokeRect(8, 8, W - 16, H - 16);
    g.fillStyle = ink; g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = `600 ${Math.round(H * 0.5)}px ${FONT}`;
    g.fillText(text.toUpperCase().split('').join(' '), W / 2, H / 2 + 4);
  });
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, 0.04, h), [null, null, new THREE.MeshStandardMaterial({ map: tex, roughness: 0.7 }), null, null, null].map((x) => x || new THREE.MeshStandardMaterial({ color: stone, roughness: 0.8 })));
  m.receiveShadow = true; m.castShadow = true;
  return m;
}
