// Behind every door a room built by its theme. The visitor walks up to an
// object, takes it (E, or a tap), it comes up to the eye and the page opens
// inside the world. Closing the page puts the object back. The way out is the
// door you came in by, standing behind you.

import * as THREE from 'three';
import { THEMES } from './themes.js';
import { tick, model } from './assets.js';

const smooth = (x) => THREE.MathUtils.smoothstep(x, 0, 1);
const UP_PULL = new THREE.Vector3(0, 0.6, 0);

export function createRooms(scene, { hubVisible, time, lights, audio = null }) {
  const overlay = document.getElementById('overlay'), frame = document.getElementById('page'), closeBtn = document.getElementById('close');
  let room = null, current = null, held = null, hold = 0, holdDir = 0;
  const tmp = new THREE.Vector3(), camPos = new THREE.Vector3(), camQ = new THREE.Quaternion(), fwd = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0), right = new THREE.Vector3();
  const tPos = new THREE.Vector3(), tQ = new THREE.Quaternion(), lookM = new THREE.Matrix4();

  async function build(door, items) {
    const g = new THREE.Group();
    const solids = [];
    const theme = door.theme;
    // The return door: same door, turned to face the room.
    const back = new THREE.Group(); back.position.set(0, 0, -3.5); back.rotation.y = Math.PI; g.add(back);
    const api = theme.door(back, { inRoom: true });
    const built = await theme.room(g, { solids, time }, items);
    scene.add(g);
    // Everything in the room throws and takes shadows, so the ceiling keeps the studio sun out.
    g.traverse((o) => { if (o.isMesh && !o.isInstancedMesh) { o.castShadow = true; o.receiveShadow = true; } });
    return { group: g, pickables: built.pickables, api, back, solids, open: 0, wasOpen: false, ambient: built.ambient, outdoors: !!built.outdoors, env: built.env, bounds: g.userData.bounds || null };
  }

  // The page opens in a frame that slides up; only the site's own addresses are allowed in it.
  const SITE = 'https://keremozdemir.de/';
  let closing = null, opening = null;
  // While the page is up, the world behind it is inert: Tab then reaches the Close button and
  // the framed page and nothing else, and it cannot land on the door links that sit off screen.
  const behind = () => [document.getElementById('stage'), document.querySelector('.hud'), document.getElementById('list'), document.getElementById('doors')].filter(Boolean);
  function open(item) {
    const url = String(item.url || '');
    if (!(url.startsWith(SITE) || url.startsWith('/'))) return;
    // Inside the front page's frame a page must replace the whole page, as the legal links
    // already do; a site nested inside a small box is no way to read it.
    if (document.body.classList.contains('embed')) { top.location.assign(url); return; }
    if (closing) { clearTimeout(closing); closing = null; }
    frame.src = url; overlay.hidden = false; document.body.classList.add('reading');
    // The bar names what was taken, so the page that slides up is not a stranger.
    const bar = document.getElementById('overlay-title'); if (bar) bar.textContent = item.title || 'Page';
    for (const el of behind()) el.inert = true;
    closeBtn.focus();
    requestAnimationFrame(() => requestAnimationFrame(() => overlay.classList.add('open')));
  }
  function closeOverlay() {
    if (overlay.hidden) return;
    overlay.classList.remove('open'); document.body.classList.remove('reading');
    for (const el of behind()) el.inert = false;
    // Focus goes back to the world, so the next key moves the visitor rather than starting from the top of the page.
    const stage = document.getElementById('stage'); if (stage) stage.focus({ preventScroll: true });
    closing = setTimeout(() => { overlay.hidden = true; frame.src = 'about:blank'; closing = null; }, 380);
    if (held) { holdDir = -1; if (audio) audio.tick(); }
  }
  closeBtn.addEventListener('click', closeOverlay);
  // Keystrokes with focus inside the framed page never reach this window. The world and the
  // pages share an origin in production, so the key is listened for inside the frame as well;
  // each load is a new document, so the listener is attached again on every one.
  frame.addEventListener('load', () => {
    try {
      frame.contentWindow.addEventListener('keydown', (e) => {
        if (e.key !== 'Escape') return;
        // The page's own Escape (its search palette, say) runs on the same event and claims the
        // key with preventDefault; deciding after the dispatch lets it close first, and alone.
        setTimeout(() => { if (!e.defaultPrevented) closeOverlay(); }, 0);
      });
    } catch (err) { /* another origin, as in local development: the Close button remains */ }
  });
  addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (!overlay.hidden) closeOverlay();
    // The hint promises Esc from the moment the object is taken, so Esc during the rise puts it back before the page opens.
    else if (held && holdDir > 0) { clearTimeout(opening); opening = null; holdDir = -1; if (audio) audio.tick(); }
  });

  // Taking an object: it rises to a spot in front of the eye, turns to face
  // the visitor, and the page opens once it has arrived.
  function take(obj) {
    if (held || !obj) return;
    held = obj; hold = 0; holdDir = 1;
    if (audio) audio.pickup();
    opening = setTimeout(() => { opening = null; if (held === obj) open(obj.userData.item); }, 650);
  }
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
  function tap(e, camera) {
    if (!room || !overlay.hidden || held) return false;
    ndc.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    const hits = ray.intersectObjects(room.pickables, true);
    if (!hits.length) return false;
    let o = hits[0].object; while (o && !o.userData.item) o = o.parent;
    if (o && o.getWorldPosition(tmp).distanceTo(camera.position) < 4.5) { take(o); return true; }
    return false;
  }

  let building = null;
  const hubFog = { color: null, density: 0, background: null };
  async function enter(door, items) {
    current = door;
    if (room) { scene.remove(room.group); room = null; }
    hubVisible(false);
    building = build(door, items);
    room = await building; building = null;
    // The room's own air: its ambient colour as fog and sky, thicker indoors.
    hubFog.color = scene.fog.color.clone(); hubFog.density = scene.fog.density; hubFog.background = scene.background;
    scene.fog.color.set(room.ambient); scene.fog.density = room.outdoors ? 0.008 : 0.02; scene.background = new THREE.Color(room.ambient);
    // Indoors the studio light stays outside: the room's own lamps do the work.
    if (lights && !room.outdoors) { hubFog.env = scene.environmentIntensity; hubFog.sun = lights.sun.intensity; hubFog.fill = lights.fill.intensity; scene.environmentIntensity = room.env ?? 0.3; lights.sun.intensity = 0.9; lights.fill.intensity = room.env ? room.env * 0.9 : 0.25; }
    wasInFront = true;
  }
  function leave() {
    if (room) { scene.remove(room.group); room = null; }
    current = null; held = null;
    if (hubFog.color) { scene.fog.color.copy(hubFog.color); scene.fog.density = hubFog.density; scene.background = hubFog.background; }
    if (lights && hubFog.env !== undefined) { scene.environmentIntensity = hubFog.env; lights.sun.intensity = hubFog.sun; lights.fill.intensity = hubFog.fill; hubFog.env = undefined; }
    hubVisible(true);
  }
  // While the visitor walks the hub, the rooms' models arrive quietly, one
  // theme at a time, so a door opens onto a room that is already there.
  function prefetch(order) {
    const names = [];
    for (const slug of order) { const src = THEMES[slug].room.toString(); for (const m of src.matchAll(/put(?:Part)?\(g, '([A-Za-z0-9_]+)'/g)) if (!names.includes(m[1])) names.push(m[1]); }
    let i = 0;
    const next = () => { if (i >= names.length) return; model(names[i++]).finally(() => setTimeout(next, 150)); };
    next(); next();
  }

  // Nearest object, the held object's animation, and whether the return door was crossed.
  let wasInFront = true;
  const local = new THREE.Vector3();
  function update(dt, playerPosition, camera) {
    if (!room) return { panel: null, back: false, hint: '' };
    tick(performance.now() / 1000);
    // Return door opens as the visitor approaches from inside.
    local.copy(playerPosition); room.back.worldToLocal(local);
    const dist = Math.hypot(local.x, local.z);
    const want = dist < 3.5 && local.z < 0.6 ? 1 : 0;
    room.open += (want - room.open) * Math.min(1, dt / 0.9);
    room.api.set(smooth(room.open));
    const inFront = local.z < 0;
    const back = wasInFront && !inFront && Math.abs(local.x) < room.api.width / 2 + 0.1 && Math.abs(local.z) < 1.0;
    wasInFront = inFront;
    // Held object flies to the eye and back.
    if (held) {
      hold = THREE.MathUtils.clamp(hold + holdDir * dt / 0.55, 0, 1);
      const k = smooth(hold);
      camera.getWorldPosition(camPos); camera.getWorldQuaternion(camQ);
      fwd.set(0, 0, -1).applyQuaternion(camQ); right.set(1, 0, 0).applyQuaternion(camQ);
      const kind = held.userData.kind;
      // Far enough that the whole object fits the view.
      if (!held.userData.dist) { const b = new THREE.Box3().setFromObject(held); const sz = b.getSize(new THREE.Vector3()); held.userData.dist = Math.max(0.45, Math.max(sz.x, sz.y, sz.z) * 1.35 + 0.15); }
      const dist = held.userData.dist;
      tPos.copy(camPos).addScaledVector(fwd, dist).addScaledVector(up, kind === 'sheet' ? -0.05 : -0.08).addScaledVector(right, 0.02);
      lookM.lookAt(camPos, tPos, up); tQ.setFromRotationMatrix(lookM);
      // Flat things (folders, sheets, envelopes) lie on the desk; stood up they face the eye.
      if (kind === 'folder' || kind === 'sheet' || kind === 'envelope') tQ.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI / 2));
      const home = held.userData.home;
      held.position.lerpVectors(home.p, tPos, k);
      held.quaternion.slerpQuaternions(home.q, tQ, k);
      if (held.userData.flap) held.userData.flap.rotation.z = -k * 2.6 * 0; // folders open on the page, not in the hand
      if (holdDir < 0 && hold <= 0) { held.position.copy(home.p); held.quaternion.copy(home.q); held = null; }
    }
    let near = null, best = 1.9;
    if (!held) for (const p of room.pickables) { p.getWorldPosition(tmp); tmp.y = playerPosition.y; const d = tmp.distanceTo(playerPosition); if (d < best) { best = d; near = p; } }
    // The nearest object eases out toward the visitor, so it is clear which one E takes.
    for (const p of room.pickables) {
      if (p === held) continue;
      const want = p === near ? 1 : 0; p.userData.pull = (p.userData.pull || 0) + (want - (p.userData.pull || 0)) * Math.min(1, dt / 0.18);
      const home = p.userData.home; p.position.copy(home.p).addScaledVector(p.userData.pullDir || UP_PULL, smooth(p.userData.pull) * (p.userData.pullAmount || 0.09));
    }
    return { panel: near, back, hint: current.theme.hint };
  }
  return { enter, leave, update, open, take, tap, closeOverlay, prefetch, get current() { return current; }, get room() { return room; }, get held() { return held; }, get solids() { return room ? room.solids : []; }, get bounds() { return room ? room.bounds : null; } };
}
