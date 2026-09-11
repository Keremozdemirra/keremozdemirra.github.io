// The hub: a white studio with the name standing in it and seven themed
// paths running out to seven doors. Each theme lays its own ground and its
// own objects along its path; this file only places them and the name.

import * as THREE from 'three';
import { FontLoader } from 'three/addons/loaders/FontLoader.js';
import { TextGeometry } from 'three/addons/geometries/TextGeometry.js';
import { THEMES, angleOf, DOOR_R, PATH_FROM } from './themes.js';
import { tick, pbr, model } from './assets.js';

const FONT_URL = 'vendor/three/addons/helvetiker_bold.typeface.json';
function seeded(seed) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }

// The name as standing letters: two lines of matte plaster behind the About
// door, big enough to read from the start. Glyphs the font lacks are built
// from the plain letter plus a dot or a diaeresis.
async function nameLetters(group) {
  const font = await new FontLoader().loadAsync(FONT_URL);
  const mat = new THREE.MeshStandardMaterial({ color: 0xd8d5ce, roughness: 0.92 });
  const has = (ch) => !!font.data.glyphs[ch];
  // One glyph as a mesh whose origin is the middle of its advance, feet on the ground.
  function glyph(ch, size) {
    if (ch === ' ') return { mesh: null, advance: size * 0.55 };
    const base = has(ch) ? ch : ch === 'Ö' ? 'O' : ch === 'İ' ? 'I' : ch;
    const geo = new TextGeometry(base, { font, size, depth: size * 0.22, curveSegments: 8, bevelEnabled: true, bevelThickness: size * 0.012, bevelSize: size * 0.01, bevelSegments: 2 });
    geo.computeBoundingBox(); const bb = geo.boundingBox; const w = bb.max.x - bb.min.x;
    const g = new THREE.Group();
    const m = new THREE.Mesh(geo, mat); m.castShadow = m.receiveShadow = true; m.position.set(-bb.min.x - w / 2, -bb.min.y, -size * 0.11); g.add(m);
    if (!has(ch) && (ch === 'Ö' || ch === 'İ')) {
      for (const dx of (ch === 'Ö' ? [-0.2, 0.2] : [0])) { const d = new THREE.Mesh(new THREE.BoxGeometry(size * 0.16, size * 0.16, size * 0.22), mat); d.castShadow = true; d.position.set(dx * w, bb.max.y - bb.min.y + size * 0.22, 0); g.add(d); }
    }
    return { mesh: g, advance: w + size * 0.12 };
  }
  return { glyph };
}

export function createWorld(scene, { doors = [] } = {}) {
  const root = new THREE.Group();
  scene.add(root);
  const obstacles = [];
  const time = { value: 0 };
  const rnd = seeded(11);

  // A stone plaza at the start: a pale disc with a darker inlaid ring, where the seven paths begin.
  const plaza = new THREE.Mesh(new THREE.CircleGeometry(PATH_FROM + 0.2, 96), pbr('marble_01', { repeat: 4, roughness: 0.45, color: 0xd9d5cc }));
  plaza.rotation.x = -Math.PI / 2; plaza.position.y = 0.006; plaza.receiveShadow = true; root.add(plaza);
  const ring = new THREE.Mesh(new THREE.RingGeometry(PATH_FROM - 0.35, PATH_FROM - 0.2, 96), new THREE.MeshStandardMaterial({ color: 0x8f8a80, roughness: 0.6 }));
  ring.rotation.x = -Math.PI / 2; ring.position.y = 0.012; root.add(ring);
  const kerb = new THREE.Mesh(new THREE.RingGeometry(PATH_FROM + 0.2, PATH_FROM + 0.32, 96), new THREE.MeshStandardMaterial({ color: 0xcfcbc2, roughness: 0.7 }));
  kerb.rotation.x = -Math.PI / 2; kerb.position.y = 0.01; root.add(kerb);

  // The name runs around the whole hub as a ring of standing letters, three
  // times over, outside the doors, every letter turned to face the start.
  const nameReady = nameLetters(root).then(({ glyph }) => {
    // Three copies, each centred in its own third of the circle, so the gaps between them are equal.
    const size = 3.0, text = 'KEREM ÖZDEMİR', runs = 3;
    const parts = [...text].map((ch) => glyph(ch, size));
    const width = parts.reduce((a, p) => a + p.advance, 0);
    const r = DOOR_R + 7.5;
    for (let k = 0; k < runs; k++) {
      const centre = angleOf('about') + k * (Math.PI * 2 / runs);
      let arc = -width / 2;
      for (const p of [...text].map((ch) => (k === 0 ? null : glyph(ch, size))).map((g, i) => g || parts[i])) {
        if (p.mesh) {
          const theta = centre - (arc + p.advance / 2) / r;   // text runs clockwise seen from above, left to right from the centre
          p.mesh.position.set(r * Math.sin(theta), 0, r * Math.cos(theta)); p.mesh.rotation.y = theta + Math.PI;
          root.add(p.mesh);
        }
        arc += p.advance;
      }
    }
  }).catch((err) => console.warn('name font unavailable', err));

  // Seven paths, one per door, each laid by its theme.
  const paths = doors.map((d) => {
    const theme = THEMES[d.slug];
    const g = new THREE.Group(); g.rotation.y = d.angle; root.add(g); g.updateMatrixWorld(true);
    // Solids are measured in world space as objects land, since the group's transform is already final.
    const solids = obstacles;
    const p = Promise.resolve().then(() => theme.path.call({ solids, name: theme.name }, g, { rnd, time })).catch((err) => console.warn(`path ${d.slug} failed`, err));
    return p;
  });
  const ready = Promise.all([nameReady, ...paths]).then(() => ({ ok: true }));

  function update(dt, pos, t) { time.value = t; tick(t); }
  return { update, obstacles, ready, time, lightLetter() {}, setNight() {}, letters: () => [], drones: [{ userData: { speed: 0 } }], collectedCount: () => 0 };
}
