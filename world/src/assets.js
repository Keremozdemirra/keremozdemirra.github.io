// Scanned CC0 assets from Poly Haven, downloaded once and vendored under
// assets/ beside the scene, so every request the world makes stays on this
// origin. Every asset is fetched once and shared.

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

// Poly Haven CC0 sets, hosted with the site under assets/ (the glTF files keep their textures/ folder).
const TEX = 'assets/textures';
const MOD = 'assets/models';
const manager = new THREE.LoadingManager();
const texLoader = new THREE.TextureLoader(manager);
// The hub's loading line reads the manager's count, so the wait has a number on it.
// onLoad is the wrong hook for it: the manager calls onLoad right after the last onProgress,
// and again every time the queue drains between path builders, so the count was wiped by a
// line carrying none at the moment it read the last file.
export function onProgress(cb) { manager.onProgress = (url, loaded, total) => cb(loaded, total); }
const gltfLoader = new GLTFLoader(manager);
const cache = new Map();

// Shared clock for wind; world.update advances it.
const uTime = { value: 0 };
export function tick(t) { uTime.value = t; }

function tex(url, srgb, repeat) {
  const key = `${url}|${repeat}`;
  if (cache.has(key)) return cache.get(key);
  const t = texLoader.load(url);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8;
  if (Array.isArray(repeat)) t.repeat.set(repeat[0], repeat[1]); else t.repeat.set(repeat, repeat);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  cache.set(key, t);
  return t;
}

// A PBR material from a Poly Haven texture set: colour, normal, roughness, ambient occlusion.
export function pbr(name, { repeat = 1, roughness = 1, color = 0xffffff, extra = {} } = {}) {
  return new THREE.MeshStandardMaterial({
    color,
    map: tex(`${TEX}/${name}/${name}_diff_1k.jpg`, true, repeat),
    normalMap: tex(`${TEX}/${name}/${name}_nor_gl_1k.jpg`, false, repeat),
    roughnessMap: tex(`${TEX}/${name}/${name}_rough_1k.jpg`, false, repeat),
    aoMap: tex(`${TEX}/${name}/${name}_ao_1k.jpg`, false, repeat),
    roughness,
    ...extra,
  });
}

// A model by Poly Haven id, resolved once; callers clone the scene.
export function model(name) {
  const key = `model:${name}`;
  if (cache.has(key)) return cache.get(key);
  const p = gltfLoader.loadAsync(`${MOD}/${name}/${name}_1k.gltf`).then((g) => {
    g.scene.traverse((o) => {
      if (!o.isMesh) return;
      o.castShadow = true; o.receiveShadow = true;
      const m = o.material; if (!m) return;
      if (m.map) m.map.anisotropy = 4;
      // Glass: transmission needs a pass this renderer does not run, and comes out black.
      if (m.transmission > 0 || (m.transparent && m.opacity < 0.95 && !m.alphaMap) || /glass|chimney|bulb/i.test(o.name) || /glass/i.test(m.name || '') || (/mirror/i.test(name) && /glass|mirror/i.test(o.name + ' ' + (m.name || '')))) {
        // A mirror's glass is a mirror: the studio environment reflected, not a window's translucency.
        const glass = /mirror/i.test(name)
          ? new THREE.MeshStandardMaterial({ color: 0xffffff, metalness: 1, roughness: 0.04, envMapIntensity: 1.2 })
          : new THREE.MeshPhysicalMaterial({ color: 0xdfe9ee, roughness: 0.08, metalness: 0, transparent: true, opacity: 0.28, depthWrite: false, clearcoat: 1, side: THREE.DoubleSide });
        o.material = glass; o.castShadow = false;
      }
    });
    return g.scene;
  }).catch((err) => { console.warn(`asset ${name} unavailable`, err); return null; });
  cache.set(key, p);
  return p;
}

// Foliage cards come as blended transparency; cut-out alpha draws in any order
// and writes depth, which is what a field of instanced tufts needs.
function cutout(mat) {
  if (!mat.transparent && !mat.alphaTest) return mat;
  mat.transparent = false; mat.alphaTest = 0.45; mat.depthWrite = true; mat.side = THREE.DoubleSide; mat.needsUpdate = true;
  return mat;
}

// Wind: the top of each card sways with a slow field over world position.
function windy(mat, strength) {
  const m = mat.clone();
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = uTime; shader.uniforms.uWind = { value: strength };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uTime; uniform float uWind;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        vec4 wpos = instanceMatrix * vec4(position, 1.0);
        float hgt = clamp(position.y / 0.5, 0.0, 1.0); hgt *= hgt;
        float gust = sin(uTime * 1.7 + wpos.x * 0.55 + wpos.z * 0.35) + 0.5 * sin(uTime * 3.1 + wpos.z * 1.3);
        transformed.x += gust * uWind * hgt; transformed.z += gust * uWind * 0.4 * hgt;`);
  };
  m.customProgramCacheKey = () => `wind${strength}`;
  return m;
}

// A Poly Haven set split into its variants: every top level mesh, stood on
// the ground and centred on its own footprint, so one tuft or one rock can
// be placed by itself.
export function variants(name) {
  const key = `variants:${name}`;
  if (cache.has(key)) return cache.get(key);
  const p = model(name).then((scene) => {
    if (!scene) return [];
    scene.updateMatrixWorld(true);
    const meshes = []; scene.traverse((o) => { if (o.isMesh) meshes.push(o); });
    return meshes.map((m) => {
      const geometry = m.geometry.clone(); geometry.applyMatrix4(m.matrixWorld);
      geometry.computeBoundingBox(); const b = geometry.boundingBox;
      geometry.translate(-(b.min.x + b.max.x) / 2, -b.min.y, -(b.min.z + b.max.z) / 2);
      geometry.computeBoundingBox(); geometry.computeBoundingSphere();
      const size = new THREE.Vector3(); geometry.boundingBox.getSize(size);
      return { name: m.name, geometry, material: cutout(m.material), radius: Math.max(size.x, size.z) / 2, height: size.y, verts: geometry.attributes.position.count };
    });
  });
  cache.set(key, p);
  return p;
}

// Many copies of a set's variants as instanced meshes: one draw call per
// variant however many copies. Returns the placements with their footprints
// so the caller can make obstacles of the solid ones.
export async function instances(parent, name, count, place, { scale = [1, 1], rnd = Math.random, sink = 0, tilt = 0, wind = 0, shadow = false, only = null } = {}) {
  let vs = await variants(name);
  if (only) vs = vs.filter(only);
  if (!vs.length) return [];
  const placed = [];
  for (let i = 0; i < count; i++) {
    const p = place(i); if (!p) continue;
    placed.push({ x: p.x, y: p.y || 0, z: p.z, s: p.scale ?? scale[0] + rnd() * (scale[1] - scale[0]), v: p.variant ?? Math.floor(rnd() * vs.length), yaw: rnd() * Math.PI * 2, tx: (rnd() - 0.5) * tilt, tz: (rnd() - 0.5) * tilt });
  }
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), pos = new THREE.Vector3(), scl = new THREE.Vector3();
  vs.forEach((v, vi) => {
    const list = placed.filter((p) => p.v === vi); if (!list.length) return;
    const im = new THREE.InstancedMesh(v.geometry, wind ? windy(v.material, wind) : v.material, list.length);
    list.forEach((p, k) => {
      e.set(p.tx, p.yaw, p.tz); q.setFromEuler(e); pos.set(p.x, p.y - sink * v.height * p.s, p.z); scl.setScalar(p.s);
      m4.compose(pos, q, scl); im.setMatrixAt(k, m4);
    });
    im.instanceMatrix.needsUpdate = true; im.computeBoundingSphere();
    im.castShadow = shadow; im.receiveShadow = true;
    parent.add(im);
  });
  return placed.map((p) => ({ x: p.x, z: p.z, s: p.s, radius: vs[p.v].radius * p.s, height: vs[p.v].height * p.s }));
}

// Scatter clones of a whole model: positions from a callback, scale range, random yaw.
export async function scatter(parent, name, count, place, { scale = [1, 1], rnd = Math.random } = {}) {
  const src = await model(name);
  if (!src) return [];
  const out = [];
  for (let i = 0; i < count; i++) {
    const m = src.clone();
    const p = place(i);
    if (!p) continue;
    m.position.set(p.x, p.y || 0, p.z);
    m.rotation.y = p.yaw ?? rnd() * Math.PI * 2;
    m.scale.setScalar(scale[0] + rnd() * (scale[1] - scale[0]));
    parent.add(m); out.push(m);
  }
  return out;
}
