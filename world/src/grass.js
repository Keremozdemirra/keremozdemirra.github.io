// Field grass the way games do it: thousands of crossed cards with a painted
// blade texture, instanced in one draw call, bending in a slow wind. Scanned
// tufts are for close ups; this is what makes the ground read as a meadow.

import * as THREE from 'three';

// Blades painted onto a canvas: a clump of tapered strokes, lighter at the tips.
function bladeTexture() {
  const c = document.createElement('canvas'); c.width = 256; c.height = 256;
  const g = c.getContext('2d'); g.clearRect(0, 0, 256, 256);
  let s = 7;
  const rnd = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
  for (let i = 0; i < 26; i++) {
    const x0 = 40 + rnd() * 176, lean = (rnd() - 0.5) * 120, h = 150 + rnd() * 100, w = 5 + rnd() * 7;
    const grad = g.createLinearGradient(0, 256, 0, 256 - h);
    grad.addColorStop(0, '#4d5e2a'); grad.addColorStop(0.55, '#7f9440'); grad.addColorStop(1, '#b8bf6a');
    g.fillStyle = grad; g.beginPath();
    g.moveTo(x0 - w, 256); g.quadraticCurveTo(x0 + lean * 0.3, 256 - h * 0.55, x0 + lean, 256 - h);
    g.quadraticCurveTo(x0 + lean * 0.35, 256 - h * 0.5, x0 + w, 256); g.closePath(); g.fill();
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  return t;
}

// Three quads crossed at 60 degrees so the clump reads from every side.
function clumpGeometry(w, h) {
  const quads = [];
  for (let k = 0; k < 3; k++) {
    const q = new THREE.PlaneGeometry(w, h, 1, 3); q.translate(0, h / 2, 0); q.rotateY((k * Math.PI) / 3);
    quads.push(q);
  }
  const g = mergeGeometries(quads);
  return g;
}
function mergeGeometries(list) {
  const pos = [], uv = [], nor = [], idx = []; let off = 0;
  for (const g of list) {
    const p = g.attributes.position, u = g.attributes.uv, n = g.attributes.normal, ix = g.index;
    for (let i = 0; i < p.count; i++) { pos.push(p.getX(i), p.getY(i), p.getZ(i)); uv.push(u.getX(i), u.getY(i)); nor.push(0, 1, 0); }
    for (let i = 0; i < ix.count; i++) idx.push(ix.getX(i) + off);
    off += p.count;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  out.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  // Normals point up: a blade lit like the ground under it never looks like a card.
  out.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  out.setIndex(idx);
  return out;
}

export function createGrass(parent, { count = 7000, place, rnd = Math.random, time, height = 0.42 }) {
  const geo = clumpGeometry(0.7, height);
  const mat = new THREE.MeshStandardMaterial({ map: bladeTexture(), alphaTest: 0.5, side: THREE.DoubleSide, roughness: 1, metalness: 0, color: 0xdfe3c8 });
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = time;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uTime;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        vec4 wpos = instanceMatrix * vec4(position, 1.0);
        float hgt = uv.y * uv.y;
        float gust = sin(uTime * 1.5 + wpos.x * 0.45 + wpos.z * 0.3) + 0.45 * sin(uTime * 2.9 + wpos.z * 1.1 + wpos.x * 0.7);
        transformed.x += gust * 0.09 * hgt; transformed.z += gust * 0.04 * hgt;`);
    // Roots sit in shadow: darken toward the base so clumps have depth.
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <map_fragment>', '#include <map_fragment>\n diffuseColor.rgb *= mix(0.55, 1.05, vMapUv.y);');
  };
  mat.customProgramCacheKey = () => 'fieldgrass';
  const mesh = new THREE.InstancedMesh(geo, mat, count);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), p = new THREE.Vector3(), s = new THREE.Vector3(), col = new THREE.Color();
  let n = 0;
  for (let i = 0; i < count; i++) {
    const at = place(i); if (!at) continue;
    e.set((rnd() - 0.5) * 0.25, rnd() * Math.PI * 2, (rnd() - 0.5) * 0.25); q.setFromEuler(e);
    const sc = 0.7 + rnd() * 0.8; s.set(sc * (0.8 + rnd() * 0.5), sc, sc * (0.8 + rnd() * 0.5)); p.set(at.x, 0, at.z);
    m4.compose(p, q, s); mesh.setMatrixAt(n, m4);
    // Patches of drier and greener grass, never one flat green.
    col.setHSL(0.2 + rnd() * 0.05, 0.28 + rnd() * 0.18, 0.34 + rnd() * 0.16); mesh.setColorAt(n, col);
    n++;
  }
  mesh.count = n; mesh.instanceMatrix.needsUpdate = true; if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  mesh.computeBoundingSphere(); mesh.receiveShadow = true; mesh.castShadow = false;
  parent.add(mesh);
  return mesh;
}
