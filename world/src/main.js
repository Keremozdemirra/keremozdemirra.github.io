import * as THREE from 'three';
import { createRenderer, createEnvironment, createLights, createFloor, createComposer } from './render.js';
import { loadCharacter } from './character.js';
import { createControls } from './controls.js';
import { createDoors } from './doors.js';
import { createWorld } from './world.js';
import { createAudio } from './audio.js';
import { createRooms } from './rooms.js';

// Prototype: links are absolute so the world can be served from anywhere.
// When this becomes the site's home page, BASE becomes ''.
const BASE = 'https://keremozdemir.de';
const SITE = 'https://keremozdemir.de/';
const DOORS = [
  { name: 'Work',    slug: 'work',    path: '/work/',    summary: 'Seventeen browser tools for climate, finance and trade, each one open.' },
  { name: 'Cases',   slug: 'cases',   path: '/cases/',   summary: 'Eight case studies: the question each tool was built to answer.' },
  { name: 'Notes',   slug: 'notes',   path: '/notes/',   summary: 'Short dated notes on carbon accounting and valuation.' },
  { name: 'About',   slug: 'about',   path: '/about/',   summary: 'Who is writing, and why this site exists.' },
  { name: 'Life',    slug: 'life',    path: '/life/',    summary: 'What happens outside the work.' },
  { name: 'CV',      slug: 'cv',      path: '/cv/',      summary: 'One page: education, work, tools.' },
  { name: 'Contact', slug: 'contact', path: '/contact/', summary: 'Write to Kerem.' },
];
// Which character to load. 'xbot' is the three.js mannequin, re-dressed in the
// world's ceramic and graphite; switch to 'tripo' or 'mixamo' once those files
// sit in world/character/. No runtime probing: a missing file logs a 404 on every visit.
const CHARACTER = 'xbot';
const CHARACTERS = {
  xbot: { modelUrl: 'vendor/three/Xbot.glb', facing: 0, redress: true },
  tripo: { modelUrl: 'character/model.glb', animUrls: { idle: 'character/idle.glb', walk: 'character/walking.glb', run: 'character/running.glb' }, facing: 0 },
  mixamo: { modelUrl: 'character/model.fbx', animUrls: { idle: 'character/idle.fbx', walk: 'character/walking.fbx', run: 'character/running.fbx' }, hair: { color: 0x1b1512 }, facing: 0 },
};
const WALK = 1.6, RUN = 4.2, ACCEL = 7, TURN = 10, BODY_RADIUS = 0.24;

const canvas = document.getElementById('stage');
const hint = document.getElementById('hint');
// Every change of the hint's text re-enters it with a small rise; the same
// text written again is not a change.
let hintText = hint.textContent;
function setHint(text) { if (text === hintText) return; hintText = text; hint.textContent = text; hint.classList.add('swap'); void hint.offsetWidth; hint.classList.remove('swap'); }
const live = document.getElementById('live');
const veil = document.getElementById('veil');
const isTouch = matchMedia('(pointer: coarse)').matches;
const DE = (navigator.language || '').toLowerCase().startsWith('de');
const WALK_HINT = isTouch
  ? (DE ? 'Links ziehen zum Gehen, rechts zum Umsehen. Jede Tür ist ein Raum.' : 'Drag on the left to walk, on the right to look. Every door is a room.')
  : (DE ? 'WASD zum Gehen, ziehen zum Umsehen. Jede Tür ist ein Raum.' : 'WASD to walk, drag to look. Every door is a room.');

// Without WebGL the visitor goes straight to the site itself; the world is
// the front door, and a front door that cannot open should not be a wall.
function flat(reason) {
  console.error('world unavailable, opening the site instead:', reason);
  document.body.classList.add('flat');
  location.replace(SITE);
}
let renderer;
try { renderer = createRenderer(canvas); } catch (err) { flat(err); throw err; }
canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); flat('context lost'); });

const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* storage blocked */ } },
};

const scene = new THREE.Scene();
createEnvironment(renderer, scene);
const camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.1, 150);
const lights = createLights(scene);
const floor = createFloor(scene);
const post = createComposer(renderer, scene, camera, { width: innerWidth, height: innerHeight });
const doors = createDoors(scene, DOORS);
const world = createWorld(scene, { doors: doors.doors });
const controls = createControls({ canvas, camera });
// Everything in the scene so far is the hub; rooms hide it while they are up.
const hubObjects = scene.children.filter((o) => !o.isLight && o !== floor && o.type !== 'Object3D' && o.name !== 'sky');
const audio = createAudio();
const rooms = createRooms(scene, { hubVisible: (on) => hubObjects.forEach((o) => { o.visible = on; }), time: world.time, lights, audio });
let mode = 'hub';
addEventListener('pointerdown', () => audio.unlock());
canvas.addEventListener('pointerup', (e) => { if (mode === 'room' && rooms.tap(e, camera)) controls.clearGoal(); });
addEventListener('keydown', () => audio.unlock());
// Live tuning handle for the browser console during development.
window.__world = { renderer, scene, camera, lights, floor, post, doors, controls, world, audio, rooms, get items() { return ITEMS; }, get player() { return player; } };

// What each room holds. The feed and the work page give the real items; the
// static lists below stand in until they arrive, and stay if the fetch fails.
const ITEMS = {
  work: [
    { title: 'ESG and finance instruments', url: `${BASE}/work/instruments/` }, { title: 'Tools for a single job', url: `${BASE}/work/workshop/` },
    { title: 'Agent based simulations', url: `${BASE}/work/simulations/` }, { title: 'Economics you can play with', url: `${BASE}/work/essays/` }, { title: 'Game theory', url: `${BASE}/work/games/` },
  ],
  cases: [], notes: [],
  about: [{ title: 'About', url: `${BASE}/about/`, image: 'og/about.png' }],
  life: [{ title: 'Life', url: `${BASE}/life/`, image: 'og/life.png' }],
  cv: [{ title: 'CV', url: `${BASE}/cv/`, image: 'og/cv.png' }],
  contact: [{ title: 'Contact', url: `${BASE}/contact/`, image: 'og/contact.png' }],
};
fetch(`${BASE}/feed.xml`).then((r) => r.text()).then((xml) => {
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  const items = [...doc.querySelectorAll('item')].map((it) => ({
    title: it.querySelector('title')?.textContent || '', url: it.querySelector('link')?.textContent || '',
    line: (it.querySelector('description')?.textContent || '').slice(0, 90), date: (it.querySelector('pubDate')?.textContent || '').slice(5, 16),
  }));
  const withImage = (i) => { const m = i.url.match(/\/(cases|notes)\/([^/]+)\//); return m ? { ...i, image: `og/${m[1]}-${m[2]}.png` } : i; };
  const cases = items.filter((i) => i.url.includes('/cases/')).map(withImage), notes = items.filter((i) => i.url.includes('/notes/')).map(withImage);
  if (cases.length) ITEMS.cases = cases;
  if (notes.length) ITEMS.notes = notes;
}).catch((err) => console.warn('feed unavailable', err));
// The work section is five categories, each a page of tools; every tool becomes a book.
fetch(`${BASE}/work/`).then((r) => r.text()).then(async (html) => {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const cats = [...doc.querySelectorAll('a[href^="/work/"]')].map((a) => ({ href: a.getAttribute('href'), name: (a.querySelector('.index-row-title, .font-serif, h2, h3, strong') || a).textContent.replace(/^\d+\s*/, '').trim().slice(0, 40) }));
  const seen = new Set(); const list = cats.filter((c) => { if (seen.has(c.href) || !c.name) return false; seen.add(c.href); return true; });
  const tools = [];
  await Promise.all(list.map(async (c) => {
    try {
      const page = new DOMParser().parseFromString(await (await fetch(BASE + c.href)).text(), 'text/html');
      const found = [...page.querySelectorAll('a[href^="/run/"]')].map((a) => ({
        title: (a.querySelector('.font-serif') || a).textContent.trim().slice(0, 40),
        line: (a.querySelector('p, span[style*="ink-soft"]') || { textContent: '' }).textContent.trim().slice(0, 110),
        url: BASE + a.getAttribute('href'), cat: c.name, catHref: c.href,
      }));
      c.tools = found;
    } catch (err) { c.tools = []; }
  }));
  for (const c of list) for (const t of c.tools || []) if (!tools.some((x) => x.url === t.url)) tools.push(t);
  if (tools.length) ITEMS.work = tools;
}).catch((err) => console.warn('work page unavailable', err));

// The player is a group the character model is parented to, so movement and
// facing stay independent of how any particular model was authored.
const player = new THREE.Group();
scene.add(player);
let character = null, introStarted = false;
(async () => {
  const spec = CHARACTERS[CHARACTER];
  try {
    const c = await loadCharacter({ modelUrl: spec.modelUrl, animUrls: spec.animUrls, hair: spec.hair, targetHeight: 1.78 });
    if (spec.redress) redress(c.group);
    character = c; c.group.rotation.y = spec.facing; player.add(c.group);
    window.__world.facing = spec.facing;
  } catch (err) {
    console.error(`character ${spec.modelUrl} unavailable`, err.message || err);
    player.add(fallbackFigure());
  }
  await world.ready.catch(() => {});
  veil.classList.add('off'); setHint(WALK_HINT);
  introStarted = true;
})();
// The mannequin wears the world's own materials: ceramic body, graphite joints.
function redress(group) {
  const env = scene.environment || null;
  const body = new THREE.MeshPhysicalMaterial({ color: 0xe9eaec, roughness: 0.35, clearcoat: 0.4, clearcoatRoughness: 0.25, envMapIntensity: 0.8, envMap: env });
  const joints = new THREE.MeshPhysicalMaterial({ color: 0x24272c, metalness: 0.85, roughness: 0.4, envMapIntensity: 1.1, envMap: env });
  group.traverse((o) => { if (o.isMesh) o.material = /joint/i.test(o.name) ? joints : body; });
}
function fallbackFigure() {
  const g = new THREE.Group(), m = new THREE.MeshStandardMaterial({ color: 0x16171a, roughness: 0.6 });
  for (const [geo, y] of [[new THREE.SphereGeometry(0.21, 24, 16), 1.6], [new THREE.CapsuleGeometry(0.19, 0.9, 6, 16), 0.9]]) {
    const mesh = new THREE.Mesh(geo, m); mesh.position.y = y; mesh.castShadow = true; g.add(mesh);
  }
  return g;
}

// Visited doors light letters of the name, quietly, across visits.
const visited = new Set(store.get('world.visited', []));
// The count under the name: rooms seen, out of seven, so the world reads as a game with an end.
const progress = document.getElementById('progress');
function showProgress() { if (!progress) return; const n = visited.size; progress.textContent = n === 0 ? `${DOORS.length} rooms` : n >= DOORS.length ? `All ${DOORS.length} rooms seen` : `${n} of ${DOORS.length} rooms`; }
showProgress();
const LETTER_OF_DOOR = { work: 0, cases: 1, notes: 2, about: 3, life: 4, cv: 6, contact: 7 };
world.ready.then(() => { for (const slug of visited) world.lightLetter(LETTER_OF_DOOR[slug]); });

// ---- Keys beyond movement: E reads a door, M mutes, Tab and Enter walk to a door ----
let focusDoor = -1, readUntil = 0;
const muteBtn = document.getElementById('mute');
const setMuteLabel = () => { muteBtn.textContent = audio.muted ? (DE ? 'Ton aus' : 'Sound off') : (DE ? 'Ton an' : 'Sound on'); };
setMuteLabel();
muteBtn.addEventListener('click', () => { audio.unlock(); audio.setMuted(!audio.muted); setMuteLabel(); });
addEventListener('keydown', (e) => {
  const k = e.key.toLowerCase();
  if (k === 'e' && mode === 'hub' && nearDoor) { setHint(nearDoor.summary); readUntil = clock.elapsedTime + 5; }
  if (k === 'e' && mode === 'room' && nearPanel) rooms.take(nearPanel);
  if (k === 'm') { audio.setMuted(!audio.muted); setMuteLabel(); }
  if (k === 'tab') { e.preventDefault(); focusDoor = (focusDoor + (e.shiftKey ? DOORS.length - 1 : 1)) % DOORS.length; const d = doors.doors[focusDoor]; setHint(`${d.name}: Enter walks there.`); readUntil = clock.elapsedTime + 4; live.textContent = d.name; }
  if (k === 'enter' && focusDoor >= 0) { const d = doors.doors[focusDoor]; controls.setGoal(d.group.position.clone().addScaledVector(d.dir, -1.5)); }
});

// ---- Loop ----
const prefetched = new Set();
let heading = 0, speed = 0, stepClock = 0, leaving = false, nearDoor = null, lastNear = null, leaveDoor = null, nearPanel = null;
const velocity = new THREE.Vector3(), next = new THREE.Vector3(), camGoal = new THREE.Vector3(), look = new THREE.Vector3(), flyTo = new THREE.Vector3(), shoulder = new THREE.Vector3();
const clock = new THREE.Clock();
// Arrival: the camera starts high behind the start and settles behind the
// character over a few seconds, so the first frame shows the whole world.
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
let intro = reducedMotion ? 0 : 1;
// A slow reveal: from high above the far side of the plaza, over the name and
// the seven fronts, down to the visitor's shoulder.
const introFrom = new THREE.Vector3(-4, 9.5, -20);
const introLook = new THREE.Vector3(0, 2.2, 8);
camera.position.copy(introFrom);

function enter(door) {
  if (leaving) return;
  leaving = true; leaveDoor = door;
  visited.add(door.slug); store.set('world.visited', [...visited]); showProgress();
  world.lightLetter(LETTER_OF_DOOR[door.slug]);
  setHint(`Entering ${door.name}…`);
  document.body.classList.add('letterbox');
  // The camera passes through the door; behind it the room builds while the veil is up.
  setTimeout(() => { veil.classList.remove('off'); veil.classList.add('on'); }, 550);
  setTimeout(async () => {
    await rooms.enter(door, ITEMS[door.slug] || []);
    controls.clearGoal();
    mode = 'room'; leaving = false; leaveDoor = null;
    player.position.set(0, 0, 0.8); heading = 0; controls.orbit.yaw = Math.PI; controls.orbit.distance = 4.0;
    camera.position.set(0, 1.9, -3.0);
    document.body.classList.remove('letterbox');
    veil.classList.remove('on'); veil.classList.add('off');
    setHint(`${door.name}. ${door.hint} The door behind you leads back.`);
    readUntil = clock.elapsedTime + 6;
  }, 1000);
}
function leaveRoom() {
  const door = rooms.current; if (!door || leaving) return;
  leaving = true;
  veil.classList.remove('off'); veil.classList.add('on');
  setTimeout(() => {
    rooms.leave(); controls.clearGoal(); mode = 'hub'; leaving = false; controls.orbit.distance = 5.2;
    player.position.copy(door.group.position).addScaledVector(door.dir, -2.2); heading = Math.atan2(-door.dir.x, -door.dir.z);
    controls.orbit.yaw = door.angle; camera.position.copy(player.position).add(new THREE.Vector3(door.dir.x * 4.5, 2.4, door.dir.z * 4.5));
    for (const d of doors.doors) { d.used = false; d.wasInFront = true; d.open = 0; }
    veil.classList.remove('on'); veil.classList.add('off');
  }, 600);
}

const solids = [...doors.obstacles];
// The camera walks back from the visitor's head toward its goal and stops
// short of the first wall or piece of furniture it would otherwise enter.
const eye = new THREE.Vector3(), camDir = new THREE.Vector3(), probe = new THREE.Vector3();
function unclip(cam) {
  const list = mode === 'room' ? rooms.solids : solids;
  eye.copy(player.position); eye.y += 1.4;
  camDir.copy(cam).sub(eye); const len = camDir.length(); if (len < 0.4) return; camDir.divideScalar(len);
  for (let d = 0.5; d < len; d += 0.12) {
    probe.copy(eye).addScaledVector(camDir, d);
    for (const b of list) if (b.containsPoint(probe)) { cam.copy(eye).addScaledVector(camDir, Math.max(0.45, d - 0.25)); return; }
    if (mode === 'hub') for (const b of world.obstacles) if (b.containsPoint(probe)) { cam.copy(eye).addScaledVector(camDir, Math.max(0.45, d - 0.25)); return; }
  }
}
function blocked(point) {
  if (mode === 'room') { for (const box of rooms.solids) if (box.distanceToPoint(point) < BODY_RADIUS) return true; return false; }
  for (const box of solids) if (box.distanceToPoint(point) < BODY_RADIUS) return true;
  for (const box of world.obstacles) if (box.distanceToPoint(point) < BODY_RADIUS) return true;
  return doors.slabBlocks(point);
}

function frame() {
  const dt = Math.min(clock.getDelta(), 0.05);
  const t = clock.elapsedTime;
  const { wish, run } = controls.update(dt, player.position);

  const reading = !document.getElementById('overlay').hidden;
  const targetSpeed = leaving || reading ? 0 : wish.length() * (run ? RUN : WALK);
  speed += (targetSpeed - speed) * Math.min(1, dt * ACCEL);
  if (wish.lengthSq() > 1e-4) {
    const want = Math.atan2(wish.x, wish.z);
    const diff = Math.atan2(Math.sin(want - heading), Math.cos(want - heading));
    heading += diff * Math.min(1, dt * TURN);
  }
  velocity.set(Math.sin(heading), 0, Math.cos(heading)).multiplyScalar(speed);
  next.copy(player.position).addScaledVector(velocity, dt);
  if (mode === 'hub' && speed > 0.1) doors.funnel(next, player.position, dt);
  if (blocked(next)) {
    // Slide along the obstacle: try each axis on its own before giving up.
    next.copy(player.position); next.x += velocity.x * dt;
    if (blocked(next)) { next.copy(player.position); next.z += velocity.z * dt; if (blocked(next)) next.copy(player.position); }
  }
  player.position.copy(next);
  player.rotation.y = heading;
  // Footsteps keep time with the walk.
  stepClock += dt * (speed > 0.2 ? speed / (speed > 3 ? 1.9 : 1.05) : 0);
  if (stepClock > 1) { stepClock = 0; audio.footstep(true, 0); }
  if (character) character.update(dt, speed, window.__world.facing);

  // Camera: the orbit the controls own; a flythrough while leaving.
  const o = controls.orbit;
  camGoal.set(Math.sin(o.yaw) * Math.cos(o.pitch), Math.sin(o.pitch), Math.cos(o.yaw) * Math.cos(o.pitch)).multiplyScalar(o.distance).add(player.position);
  // Over the shoulder: a step to the side, so the character never hides what the room is about.
  shoulder.set(Math.cos(o.yaw), 0, -Math.sin(o.yaw)).multiplyScalar(mode === 'room' ? 0.55 : 0.35);
  camGoal.add(shoulder);
  camGoal.y = Math.max(camGoal.y, 0.4);
  // Inside a room the camera stays inside the walls; the goal itself is kept
  // out of solids, so the camera never fights between a wall and its goal.
  if (mode === 'room' && rooms.bounds) camGoal.clamp(rooms.bounds.min, rooms.bounds.max);
  unclip(camGoal);
  if (leaving && leaveDoor) {
    flyTo.copy(leaveDoor.group.position).addScaledVector(leaveDoor.dir, -0.7).setY(1.6);
    camera.position.lerp(flyTo, 1 - Math.exp(-dt * 3.5));
    look.copy(leaveDoor.group.position).addScaledVector(leaveDoor.dir, 4).setY(1.3);
  } else if (intro > 0) {
    if (introStarted) intro = Math.max(0, intro - dt / 5.5);
    const k = 1 - Math.pow(intro, 2.2);
    camera.position.lerpVectors(introFrom, camGoal, k);
    look.copy(player.position); look.y += 1.5; look.lerp(introLook, 1 - k);
  } else {
    camera.position.lerp(camGoal, 1 - Math.exp(-dt * 6));
    if (mode === 'room' && rooms.bounds) camera.position.clamp(rooms.bounds.min, rooms.bounds.max);
    unclip(camera.position);
    look.copy(player.position).add(shoulder); look.y += 1.5;
  }
  // While something is held up to the eye the character steps out of the frame.
  if (character) character.group.visible = !(mode === 'room' && rooms.held);
  camera.lookAt(look);
  lights.follow(player.position);
  world.update(dt, player.position, t);

  if (mode === 'hub') {
    const res = doors.update(dt, player.position);
    if (res.crossed) enter(res.crossed);
    if (res.opened) audio.door(doors.doors.indexOf(res.opened), THREE.MathUtils.clamp((res.opened.group.position.x - camera.position.x) / 10, -1, 1));
    if (res.wrongWay) audio.refuse();
    nearDoor = res.near;
    if (nearDoor !== lastNear) { lastNear = nearDoor; live.textContent = nearDoor ? `${nearDoor.name} door ahead` : ''; if (nearDoor && !prefetched.has(nearDoor.slug)) { prefetched.add(nearDoor.slug); rooms.prefetch([nearDoor.slug]); } }
    audio.update(nearDoor ? player.position.distanceTo(nearDoor.group.position) : 99, 0);
    if (!leaving && character && t > readUntil) setHint(nearDoor ? (DE ? `Durchgehen öffnet ${nearDoor.name}. E liest zuerst.` : `Walk through to enter ${nearDoor.name}. E reads it first.`) : WALK_HINT);
  } else {
    const r = rooms.update(dt, player.position, camera);
    nearPanel = r.panel;
    if (r.back && !rooms.held) leaveRoom();
    if (!leaving && t > readUntil) setHint(rooms.held ? 'Esc puts it back.' : nearPanel ? `E takes ${nearPanel.userData.item.title}.` : `${r.hint} The door behind you leads back.`);
    audio.update(99, 0);
  }

  post.render(dt);
  requestAnimationFrame(frame);
}

function resize() {
  renderer.setSize(innerWidth, innerHeight, false);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  post.resize(innerWidth, innerHeight);
}
addEventListener('resize', resize);
resize();
frame();
