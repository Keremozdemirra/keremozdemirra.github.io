// Loads a rigged glTF or FBX (Mixamo skeleton), scales it to a target height,
// blends idle/walk/run clips by speed, and grows procedural curly hair when
// asked. Doors, render and main own everything else.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import { retargetClip } from 'three/addons/utils/SkeletonUtils.js';
// Mixamo's Walk/Run clips move the root at roughly these speeds; dividing
// the requested ground speed by these keeps feet from sliding.
const AUTHORED_WALK_SPEED = 1.5;
const AUTHORED_RUN_SPEED = 4.5;
const TIMESCALE_MIN = 0.6;
const TIMESCALE_MAX = 1.6;
// Game design speeds, used only to place the idle/walk/run blend weights.
const BLEND_WALK_SPEED = 1.6;
const BLEND_RUN_SPEED = 4.2;
const BLEND_EASE_TAU = 0.15; // seconds, crossfade smoothing
function findSkinnedMesh(root) {
  let mesh = null;
  root.traverse((node) => { if (node.isSkinnedMesh && !mesh) mesh = node; });
  return mesh;
}
function findClip(clips, keyword) {
  return clips.find((clip) => clip.name.toLowerCase().includes(keyword)) || null;
}
// One shape for both formats: a root Object3D plus its clips. Mixamo
// "without skin" animation FBX files load fine here too, just with no mesh.
async function loadSource(url) {
  if (url.toLowerCase().endsWith('.fbx')) {
    const fbx = await new FBXLoader().loadAsync(url);
    return { root: fbx, clips: fbx.animations || [] };
  }
  const gltf = await new GLTFLoader().loadAsync(url);
  return { root: gltf.scene, clips: gltf.animations || [] };
}
// FBXLoader hands back MeshPhongMaterial; match the rest of the scene
// (MeshStandardMaterial) so lighting is consistent.
function toStandardMaterial(material) {
  const list = Array.isArray(material) ? material : [material];
  const converted = list.map((mat) => {
    if (!mat) return mat;
    const standard = new THREE.MeshStandardMaterial({
      map: mat.map || null, normalMap: mat.normalMap || null,
      color: mat.color ? mat.color.clone() : new THREE.Color(0xffffff),
      transparent: mat.transparent, alphaTest: mat.alphaTest, side: mat.side,
      roughness: 0.7, metalness: 0,
    });
    if (standard.map) standard.map.colorSpace = THREE.SRGBColorSpace;
    return standard;
  });
  return Array.isArray(material) ? converted : converted[0];
}
// Mixamo animation FBX files prefix bone names with "mixamorig:" or
// "mixamorig" (no colon); strip either so both sides compare equal.
function normalizeBoneName(name) {
  return name.replace(/^mixamorig:?/i, '');
}
// An animation-only FBX ("without skin") has no SkinnedMesh, only bones;
// synthesize a .skeleton from the bone hierarchy for SkeletonUtils to read.
function skeletonSourceFor(root) {
  const skinned = findSkinnedMesh(root);
  if (skinned) return skinned;
  const bones = [];
  root.traverse((node) => { if (node.isBone) bones.push(node); });
  if (bones.length === 0) return null;
  root.skeleton = new THREE.Skeleton(bones);
  return root;
}
// Reconciles bone names against the model's skeleton: identical names are used as is, a shared
// mixamorig prefix mismatch is fixed by renaming tracks, and only a real mismatch retargets via SkeletonUtils.
function adaptClipsToTarget(clips, targetSkinned, sourceRoot) {
  if (!targetSkinned || clips.length === 0) return { clips, mixerRoot: null };
  const targetNames = new Set(targetSkinned.skeleton.bones.map((b) => b.name));
  const sourceNames = new Set();
  for (const clip of clips) {
    for (const track of clip.tracks) {
      const dot = track.name.lastIndexOf('.');
      sourceNames.add(dot === -1 ? track.name : track.name.slice(0, dot));
    }
  }
  if ([...sourceNames].every((name) => targetNames.has(name))) return { clips, mixerRoot: null };
  const normalizedToTarget = new Map();
  for (const name of targetNames) normalizedToTarget.set(normalizeBoneName(name), name);
  // Mixamo clips often animate finger bones a lighter export dropped. Those
  // tracks are noise, so the test is whether most bones line up, and the
  // unknown ones are removed rather than sending the clip through retargeting.
  const known = [...sourceNames].filter((name) => normalizedToTarget.has(normalizeBoneName(name)));
  const prefixOnly = known.length >= 0.6 * sourceNames.size;
  if (prefixOnly) {
    const renamed = clips.map((clip) => {
      const cloned = clip.clone();
      for (const track of cloned.tracks) {
        const dot = track.name.lastIndexOf('.');
        const boneName = dot === -1 ? track.name : track.name.slice(0, dot);
        const suffix = dot === -1 ? '' : track.name.slice(dot);
        const targetName = normalizedToTarget.get(normalizeBoneName(boneName));
        if (targetName) track.name = `${targetName}${suffix}`;
      }
      cloned.tracks = cloned.tracks.filter((track) => {
        const dot = track.name.lastIndexOf('.');
        return targetNames.has(dot === -1 ? track.name : track.name.slice(0, dot));
      });
      return cloned;
    });
    return { clips: renamed, mixerRoot: null };
  }
  const sourceSkinned = skeletonSourceFor(sourceRoot);
  if (!sourceSkinned) return { clips, mixerRoot: null }; // nothing usable to retarget from
  const options = { getBoneName: (bone) => bone.name };
  const retargeted = clips.map((clip) => retargetClip(targetSkinned, sourceSkinned, clip, options));
  return { clips: retargeted, mixerRoot: targetSkinned };
}
// main.js moves the player group; a clip carrying the Hips' horizontal travel would double-move it.
// Lock x and z to the first frame's value everywhere, keeping any vertical bob in y.
function stripHipsHorizontalMotion(clip) {
  for (const track of clip.tracks) {
    const dot = track.name.lastIndexOf('.');
    if (dot === -1 || track.name.slice(dot) !== '.position') continue;
    if (normalizeBoneName(track.name.slice(0, dot)).toLowerCase() !== 'hips') continue;
    const values = track.values; // stride 3: x, y, z per keyframe
    const x0 = values[0], z0 = values[2];
    for (let i = 0; i < values.length; i += 3) { values[i] = x0; values[i + 2] = z0; }
  }
}
// Small deterministic PRNG (mulberry32) so hair placement is reproducible.
function makeRng(seed) {
  let state = seed >>> 0;
  return function rng() {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
// Spherical cap of small overlapping spheres around the head bone, skipping the front-lower
// sector so hair does not grow over the face.
function buildHair(options, targetSkinned, modelScale, targetHeight) {
  if (!targetSkinned) return null;
  const headBone = targetSkinned.skeleton.bones.find((bone) => {
    const lower = bone.name.toLowerCase();
    return lower.endsWith('head') && lower !== 'headtop_end';
  });
  if (!headBone) return null;
  const { color = 0x1b1512, curl = 0.028, count = 420, coverage = 0.62 } = options;
  // No reliable local-space bbox to read a head size off; scale with height.
  const headRadius = 0.105 * (targetHeight / 1.75);
  const mesh = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 10, 8), new THREE.MeshStandardMaterial({ color, roughness: 0.85 }), count);
  mesh.castShadow = true;
  mesh.frustumCulled = false; // instances sit far from the geometry origin, default bounds cull wrong
  const rng = makeRng(0x9e3779b9);
  const cosMin = Math.cos(coverage * Math.PI);
  const matrix = new THREE.Matrix4(), position = new THREE.Vector3(), scale = new THREE.Vector3(), noRotation = new THREE.Quaternion();
  for (let i = 0; i < count; i++) {
    const theta = Math.acos(1 - rng() * (1 - cosMin)); // area-uniform sample over the cap, 0 at the crown
    let phi = rng() * Math.PI * 2; // azimuth, 0 faces local +z (forward for a Mixamo head)
    if (theta > 0.45 * Math.PI && Math.cos(phi) > 0) phi += Math.PI; // keep the face sector bare, mirror to the back
    const sinTheta = Math.sin(theta);
    // Metric sizes shrink by the model's scale factor since this mesh is parented inside that rig.
    const radiusOffset = (headRadius + 0.35 * curl) / modelScale;
    position.set(sinTheta * Math.sin(phi), Math.cos(theta), sinTheta * Math.cos(phi)).multiplyScalar(radiusOffset);
    const size = (curl * (0.7 + rng() * 0.6)) / modelScale;
    scale.set(size, size, size);
    matrix.compose(position, noRotation, scale);
    mesh.setMatrixAt(i, matrix);
  }
  mesh.instanceMatrix.needsUpdate = true;
  headBone.add(mesh);
  return mesh;
}
// Triangular crossfade across three basis poses, continuous in speed so the mixer never jump-cuts.
function targetWeights(speed) {
  if (speed <= 0.0001) return { idle: 1, walk: 0, run: 0 };
  if (speed <= BLEND_WALK_SPEED) {
    const t = speed / BLEND_WALK_SPEED;
    return { idle: 1 - t, walk: t, run: 0 };
  }
  const t = Math.min(1, (speed - BLEND_WALK_SPEED) / (BLEND_RUN_SPEED - BLEND_WALK_SPEED));
  return { idle: 0, walk: 1 - t, run: t };
}
export async function loadCharacter({ modelUrl, animUrl = modelUrl, animUrls = null, targetHeight = 1.75, hair = null }) {
  let modelSource;
  try {
    modelSource = await loadSource(modelUrl);
  } catch (err) {
    throw new Error(`loadCharacter: could not load "${modelUrl}": ${err && err.message ? err.message : err}`);
  }
  const scene = modelSource.root; // a GLTF scene or an FBX group, both plain Object3D from here on
  const modelIsFbx = modelUrl.toLowerCase().endsWith('.fbx');
  scene.traverse((node) => {
    if (!node.isMesh) return;
    node.castShadow = true;
    node.receiveShadow = false;
    node.frustumCulled = false; // skinned meshes get culled wrongly against their bind-pose bbox
    if (modelIsFbx) {
      node.material = toStandardMaterial(node.material);
    } else {
      const materials = Array.isArray(node.material) ? node.material : [node.material];
      for (const material of materials) {
        if (material && 'envMapIntensity' in material) material.envMapIntensity = 1;
      }
    }
  });
  // Scale the bind-pose bbox to targetHeight, then drop the feet to y = 0; this also absorbs Mixamo's centimetre-scale FBX export (roughly 180 units raw).
  const box = new THREE.Box3().setFromObject(scene);
  const rawHeight = Math.max(box.max.y - box.min.y, 1e-6);
  const modelScale = targetHeight / rawHeight;
  scene.scale.setScalar(modelScale);
  scene.updateMatrixWorld(true);
  const scaledBox = new THREE.Box3().setFromObject(scene);
  scene.position.y -= scaledBox.min.y;
  scene.updateMatrixWorld(true);
  const group = new THREE.Group();
  group.add(scene);
  const targetSkinned = findSkinnedMesh(scene);
  // Legacy path: one animation source (glTF or FBX) carrying named clips, searched by name; the whole story when animUrls is absent.
  let legacyClips = modelSource.clips;
  let legacySourceRoot = scene;
  if (animUrl !== modelUrl) {
    let animSource;
    try {
      animSource = await loadSource(animUrl);
    } catch (err) {
      throw new Error(`loadCharacter: could not load "${animUrl}": ${err && err.message ? err.message : err}`);
    }
    legacyClips = animSource.clips;
    legacySourceRoot = animSource.root;
  }
  const legacyAdapted = adaptClipsToTarget(legacyClips, targetSkinned, legacySourceRoot);
  let mixerRoot = legacyAdapted.mixerRoot || scene;
  let idleClip = findClip(legacyAdapted.clips, 'idle'), walkClip = findClip(legacyAdapted.clips, 'walk'), runClip = findClip(legacyAdapted.clips, 'run');
  // animUrls: one Mixamo animation FBX per role. Every Mixamo animation FBX carries a single clip named "mixamo.com", so the role comes from the key, not the clip name; a missing key keeps the legacy result.
  if (animUrls) {
    const roles = ['idle', 'walk', 'run'].filter((role) => animUrls[role]);
    if (roles.length > 0) {
      const sources = await Promise.all(roles.map((role) => loadSource(animUrls[role])));
      roles.forEach((role, i) => {
        const rawClip = sources[i].clips[0];
        if (!rawClip) return;
        const adapted = adaptClipsToTarget([rawClip], targetSkinned, sources[i].root);
        if (adapted.mixerRoot) mixerRoot = adapted.mixerRoot;
        if (role === 'idle') idleClip = adapted.clips[0];
        else if (role === 'walk') walkClip = adapted.clips[0];
        else runClip = adapted.clips[0];
      });
    }
  }
  if (!idleClip && !walkClip && !runClip) {
    throw new Error(`loadCharacter: no idle, walk or run clip found for "${modelUrl}"`);
  }
  for (const clip of [idleClip, walkClip, runClip]) {
    if (!clip) continue;
    stripHipsHorizontalMotion(clip);
  }
  const mixer = new THREE.AnimationMixer(mixerRoot);
  // A missing role borrows another role's clip, cloned so it gets its own mixer action instead of colliding with the original (mixer.clipAction caches one action per clip per root).
  const idleSource = idleClip || (walkClip || runClip).clone();
  const walkSource = walkClip || (runClip || idleClip).clone();
  const runSource = runClip || (walkClip || idleClip).clone();
  const idleAction = mixer.clipAction(idleSource);
  const walkAction = mixer.clipAction(walkSource);
  const runAction = mixer.clipAction(runSource);
  idleAction.play();
  walkAction.play();
  runAction.play();
  if (!idleClip) {
    idleAction.paused = true; // held on its first frame, a still pose beats no idle at all
    idleAction.time = 0;
  }
  // A missing run clip plays the walk clip sped up instead; normalise against the walk authored speed so timeScale comes out higher, not lower.
  const runAuthoredSpeed = runClip ? AUTHORED_RUN_SPEED : AUTHORED_WALK_SPEED;
  const weights = { idle: 1, walk: 0, run: 0 };
  const hairMesh = hair ? buildHair(hair, targetSkinned, modelScale, targetHeight) : null;
  function update(dt, speed, heading) {
    group.rotation.y = heading;
    const target = targetWeights(speed);
    const ease = 1 - Math.exp(-dt / BLEND_EASE_TAU);
    weights.idle += (target.idle - weights.idle) * ease;
    weights.walk += (target.walk - weights.walk) * ease;
    weights.run += (target.run - weights.run) * ease;
    idleAction.setEffectiveWeight(weights.idle);
    walkAction.setEffectiveWeight(weights.walk);
    runAction.setEffectiveWeight(weights.run);
    walkAction.timeScale = THREE.MathUtils.clamp(speed / AUTHORED_WALK_SPEED, TIMESCALE_MIN, TIMESCALE_MAX);
    runAction.timeScale = THREE.MathUtils.clamp(speed / runAuthoredSpeed, TIMESCALE_MIN, TIMESCALE_MAX);
    mixer.update(dt);
  }
  function dispose() {
    mixer.stopAllAction();
    scene.traverse((node) => {
      if (!node.isMesh) return;
      node.geometry.dispose();
      const materials = Array.isArray(node.material) ? node.material : [node.material];
      for (const material of materials) {
        if (!material) continue;
        for (const key in material) {
          const value = material[key];
          if (value && value.isTexture) value.dispose();
        }
        material.dispose();
      }
    });
    if (hairMesh) {
      hairMesh.geometry.dispose();
      hairMesh.material.dispose();
    }
  }
  return { group, update, dispose };
}
