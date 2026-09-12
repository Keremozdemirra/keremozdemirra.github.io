import * as THREE from 'three';
import { createRenderer, createEnvironment, createLights, createFloor, createComposer } from './render.js';
import { loadCharacter } from './character.js';
import { createControls } from './controls.js';
import { createDoors } from './doors.js';
import { createWorld } from './world.js';
import { createAudio } from './audio.js';
import { createRooms } from './rooms.js';
import { onProgress } from './assets.js';

// Prototype: links are absolute so the world can be served from anywhere.
// When this becomes the site's home page, BASE becomes ''.
const BASE = 'https://keremozdemir.de';
const SITE = 'https://keremozdemir.de/';
// What each door says about itself lives in STRINGS below, in the three languages,
// so the list here is only what does not change with the language.
const DOORS = [
  { name: 'Work',    slug: 'work',    path: '/work/' },
  { name: 'Cases',   slug: 'cases',   path: '/cases/' },
  { name: 'Notes',   slug: 'notes',   path: '/notes/' },
  { name: 'About',   slug: 'about',   path: '/about/' },
  { name: 'Life',    slug: 'life',    path: '/life/' },
  { name: 'CV',      slug: 'cv',      path: '/cv/' },
  { name: 'Contact', slug: 'contact', path: '/contact/' },
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
// Inside the front page's frame the legal links are the page's own, and any link out of the
// world must replace the whole page rather than load the site inside the frame.
const params = new URLSearchParams(location.search);
if (params.has('embed')) { document.body.classList.add('embed'); for (const a of document.querySelectorAll('#list a, #doors a')) a.target = '_top'; }
// The hidden page list serves crawlers and the flat page. While the world runs, its links leave the
// tab order, since Tab walks the doors; flat() puts them back when it shows the list.
for (const a of document.querySelectorAll('#doors a')) a.tabIndex = -1;
// The language the reader chose on the site comes first, as ?lang= or as the "lang" the
// site keeps in storage on this origin; the browser's own language is the fallback.
let storedLang = null;
try { storedLang = localStorage.getItem('lang'); } catch (e) { /* storage blocked */ }
const pick = params.get('lang') || storedLang || navigator.language || '';
const LANG = /^de/i.test(pick) ? 'de' : /^tr/i.test(pick) ? 'tr' : 'en';
document.documentElement.lang = LANG;
const DE = LANG === 'de';
// The guide line in the site's three languages, keyboard and touch wording apart.
const STRINGS = {
  en: { walkTouch: 'Drag on the left to walk, on the right to look. Every door is a room.', walkKeys: 'WASD to walk, drag to look. Every door is a room.',
    enter: (n) => `Walk through to enter ${n}.`, readKeys: 'E reads it first.', readTouch: 'Tap the door to read about it first.',
    entering: (n) => `Entering ${n}…`, back: 'The door behind you leads back.', takeKeys: (t) => `E takes ${t}.`, takeTouch: (t) => `Tap ${t} to take it.`,
    putBackKeys: 'Esc puts it back.', putBackTouch: 'Close the page to put it back.', nothing: 'Nothing to take here. Walk up to an object.',
    tab: (n) => `${n}: Enter walks there.`, soundOn: 'Sound on', soundOff: 'Sound off', closeKeys: 'Close (Esc)', closeTouch: 'Close',
    loading: (n, t) => `Loading the world, ${n} of ${t}.`, loadingPlain: 'Loading the world.', roomsNone: (t) => `${t} rooms`, roomsSome: (n, t) => `${n} of ${t} rooms`, roomsAll: (t) => `All ${t} rooms seen`,
    names: { work: 'Work', cases: 'Cases', notes: 'Notes', about: 'About', life: 'Life', cv: 'CV', contact: 'Contact' },
    // Read off what each page says about itself. No counts on the Work door: the shelf is
    // filled from the site and grows with it.
    summaries: { work: 'The tools, one book each, shelved by category, every one open in a browser.', cases: 'Eight case studies: the question each tool was built to answer.',
      notes: 'Two notes: the agent as a decision subject, and why determinism does not buy a forecast.', about: 'Seven roles, two degrees in progress, and the languages and permit that frame the work.',
      life: 'A hand drawn game of one year in the life of a tree, drawn line by line.', cv: 'The same record on one page: roles, education, certifications, memberships.', contact: 'Write to Kerem.' },
    hints: { work: 'Every tool is a book. Take one.', cases: 'Eight case files on the desks. Open one.', notes: 'Notes pinned to the board. Take one down.', about: 'One portrait, one page. Take it off the wall.',
      life: 'Photographs on the line. Unpeg one.', cv: 'The CV on the desk. Pick it up.', contact: 'Letters on the hall table. Take one.' } },
  de: { walkTouch: 'Links ziehen zum Gehen, rechts zum Umsehen. Jede Tür ist ein Raum.', walkKeys: 'WASD zum Gehen, Ziehen zum Umsehen. Jede Tür ist ein Raum.',
    enter: (n) => `Durchgehen öffnet ${n}.`, readKeys: 'Erst lesen: E.', readTouch: 'Auf die Tür tippen, um erst zu lesen, was dahinter liegt.',
    entering: (n) => `Du betrittst ${n}…`, back: 'Die Tür hinter dir führt zurück.', takeKeys: (t) => `E nimmt ${t}.`, takeTouch: (t) => `Auf ${t} tippen, um es zu nehmen.`,
    putBackKeys: 'Esc legt es zurück.', putBackTouch: 'Seite schließen, um es zurückzulegen.', nothing: 'Hier ist nichts zu nehmen. Geh näher an einen Gegenstand.',
    tab: (n) => `${n}: Enter führt dich hin.`, soundOn: 'Ton an', soundOff: 'Ton aus', closeKeys: 'Schließen (Esc)', closeTouch: 'Schließen',
    loading: (n, t) => `Die Welt lädt, ${n} von ${t}.`, loadingPlain: 'Die Welt lädt.', roomsNone: (t) => `${t} Räume`, roomsSome: (n, t) => `${n} von ${t} Räumen`, roomsAll: (t) => `Alle ${t} Räume gesehen`,
    names: { work: 'Arbeiten', cases: 'Fallstudien', notes: 'Notizen', about: 'Über mich', life: 'Leben', cv: 'Lebenslauf', contact: 'Kontakt' },
    summaries: { work: 'Die Werkzeuge, jedes ein Buch, nach Kategorie ins Regal gestellt, jedes läuft im Browser.', cases: 'Acht Fallstudien: die Frage, für die jedes Werkzeug gebaut wurde.',
      notes: 'Zwei Notizen: der Agent als Entscheidungssubjekt, und warum Determinismus keine Prognose verschafft.', about: 'Sieben Stationen, zwei laufende Studiengänge, dazu die Sprachen und der Aufenthaltstitel, die den Rahmen der Arbeit setzen.',
      life: 'Ein handgezeichnetes Spiel über ein Jahr im Leben eines Baumes, Strich für Strich gezeichnet.', cv: 'Derselbe Werdegang auf einer Seite: Stationen, Ausbildung, Zertifikate, Mitgliedschaften.', contact: 'Schreib Kerem.' },
    hints: { work: 'Jedes Werkzeug ist ein Buch. Nimm eines.', cases: 'Acht Fallakten auf den Tischen. Öffne eine.', notes: 'Notizen an der Pinnwand. Nimm eine ab.', about: 'Ein Porträt, eine Seite. Nimm es von der Wand.',
      life: 'Fotos an der Leine. Löse eines.', cv: 'Der Lebenslauf auf dem Tisch. Heb ihn auf.', contact: 'Briefe auf dem Flurtisch. Nimm einen.' } },
  tr: { walkTouch: 'Yürümek için solda, bakmak için sağda sürükle. Her kapı bir oda.', walkKeys: 'Yürümek için WASD, bakmak için sürükle. Her kapı bir oda.',
    enter: (n) => `Kapıdan geçince ${n} açılır.`, readKeys: 'Önce okumak için E.', readTouch: 'Önce okumak için kapıya dokun.',
    entering: (n) => `${n} açılıyor…`, back: 'Arkandaki kapı geri götürür.', takeKeys: (t) => `E ile ${t} alınır.`, takeTouch: (t) => `Almak için ${t} nesnesine dokun.`,
    putBackKeys: 'Esc yerine koyar.', putBackTouch: 'Sayfayı kapatınca yerine döner.', nothing: 'Burada alınacak bir şey yok. Bir nesneye yaklaş.',
    tab: (n) => `${n}: Enter oraya götürür.`, soundOn: 'Ses açık', soundOff: 'Ses kapalı', closeKeys: 'Kapat (Esc)', closeTouch: 'Kapat',
    loading: (n, t) => `Dünya yükleniyor, ${t} dosyadan ${n}.`, loadingPlain: 'Dünya yükleniyor.', roomsNone: (t) => `${t} oda`, roomsSome: (n, t) => `${t} odadan ${n} görüldü`, roomsAll: (t) => `${t} odanın hepsi görüldü`,
    names: { work: 'Çalışmalar', cases: 'Vaka çalışmaları', notes: 'Notlar', about: 'Hakkımda', life: 'Hayat', cv: 'CV', contact: 'İletişim' },
    summaries: { work: 'Araçlar, her biri bir kitap, kategoriye göre rafta, hepsi tarayıcıda açılıyor.', cases: 'Sekiz vaka çalışması: her aracın yanıtlamak için yapıldığı soru.',
      notes: 'İki not: karar öznesi olarak etmen, ve determinizmin neden öngörü getirmediği.', about: 'Yedi görev, devam eden iki lisans, ve işi çerçeveleyen diller ile oturma izni.',
      life: 'Bir ağacın bir yılını anlatan, çizgi çizgi elle çizilmiş bir oyun.', cv: 'Aynı kayıt tek sayfada: görevler, eğitim, sertifikalar, üyelikler.', contact: 'Kerem\'e yaz.' },
    hints: { work: 'Her araç bir kitap. Birini al.', cases: 'Masalarda sekiz vaka dosyası. Birini aç.', notes: 'Panoya iğnelenmiş notlar. Birini indir.', about: 'Bir portre, bir sayfa. Duvardan al.',
      life: 'İpte fotoğraflar. Birinin mandalını çöz.', cv: 'Masadaki CV. Eline al.', contact: 'Hol masasında mektuplar. Birini al.' } },
}[LANG];
const WALK_HINT = isTouch ? STRINGS.walkTouch : STRINGS.walkKeys;

// Without WebGL the visitor goes straight to the site itself; the world is
// the front door, and a front door that cannot open should not be a wall.
function flat(reason) {
  console.error('world unavailable, opening the site instead:', reason);
  document.body.classList.add('flat');
  for (const a of document.querySelectorAll('#doors a')) a.removeAttribute('tabindex');
  // Inside the front page's frame the site is already around the world, so the frame keeps
  // its plain list of doors; only the full screen edition leaves for the site.
  if (document.body.classList.contains('embed')) return;
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
const doorRay = new THREE.Raycaster(), doorNdc = new THREE.Vector2();
// Where each pointer went down, so a look drag or a joystick stroke that ends over a
// book or a door does not count as a tap on it. 6 px is the controls' own drag threshold.
const downs = new Map();
canvas.addEventListener('pointerdown', (e) => downs.set(e.pointerId, { x: e.clientX, y: e.clientY }));
canvas.addEventListener('pointercancel', (e) => downs.delete(e.pointerId));
canvas.addEventListener('pointerup', (e) => {
  const d0 = downs.get(e.pointerId); downs.delete(e.pointerId);
  if (!d0 || Math.hypot(e.clientX - d0.x, e.clientY - d0.y) > 6) return;
  if (mode === 'room' && rooms.tap(e, camera)) { controls.clearGoal(); return; }
  if (mode === 'hub' && isTouch && !leaving && e.pointerType === 'touch') {
    doorNdc.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1); doorRay.setFromCamera(doorNdc, camera);
    const hit = doorRay.intersectObjects(doors.doors.map((d) => d.group), true)[0];
    // Measured from the visitor: an open door lets the ray through to the vestibule's back
    // wall, which from a camera five metres behind sat past the old limit at the range the hint asks for.
    if (hit && player.position.distanceTo(hit.point) < 5) { let o = hit.object; const d = doors.doors.find((x) => { let p = o; while (p) { if (p === x.group) return true; p = p.parent; } return false; }); if (d) { setHint(STRINGS.summaries[d.slug]); readUntil = clock.elapsedTime + 5; controls.clearGoal(); } }
  }
});
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
// While the world loads, the line carries the count; written directly, since a rising number is one change, not many.
onProgress((loaded, total) => { if (introStarted) return; const text = total > 1 ? STRINGS.loading(Math.min(loaded, total), total) : STRINGS.loadingPlain; hintText = text; hint.textContent = text; });
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
function showProgress() { if (!progress) return; const n = visited.size, t = DOORS.length; progress.textContent = n === 0 ? STRINGS.roomsNone(t) : n >= t ? STRINGS.roomsAll(t) : STRINGS.roomsSome(n, t); }
showProgress();
const LETTER_OF_DOOR = { work: 0, cases: 1, notes: 2, about: 3, life: 4, cv: 6, contact: 7 };
world.ready.then(() => { for (const slug of visited) world.lightLetter(LETTER_OF_DOOR[slug]); });

// ---- Keys beyond movement: E reads a door, M mutes, Tab and Enter walk to a door ----
let focusDoor = -1, readUntil = 0;
const muteBtn = document.getElementById('mute');
const setMuteLabel = () => { muteBtn.textContent = audio.muted ? STRINGS.soundOff : STRINGS.soundOn; };
document.getElementById('close').textContent = isTouch ? STRINGS.closeTouch : STRINGS.closeKeys;
setMuteLabel();
muteBtn.addEventListener('click', () => { audio.unlock(); audio.setMuted(!audio.muted); setMuteLabel(); });
addEventListener('keydown', (e) => {
  const k = e.key.toLowerCase();
  if (k === 'e' && mode === 'hub' && nearDoor) { setHint(STRINGS.summaries[nearDoor.slug]); readUntil = clock.elapsedTime + 5; }
  else if (k === 'e' && !leaving && ((mode === 'hub' && !nearDoor) || (mode === 'room' && !nearPanel && !rooms.held))) { setHint(STRINGS.nothing); readUntil = clock.elapsedTime + 2.5; audio.refuse(); }
  if (k === 'e' && mode === 'room' && nearPanel) rooms.take(nearPanel);
  if (k === 'm') { audio.setMuted(!audio.muted); setMuteLabel(); }
  if (k === 'tab' && document.activeElement === canvas && mode === 'hub') {
    // Tab walks the doors while the world holds the keyboard; past either end it lets the browser carry focus on to the links.
    const next = focusDoor + (e.shiftKey ? -1 : 1);
    if (next >= 0 && next < DOORS.length) { e.preventDefault(); focusDoor = next; const d = doors.doors[focusDoor]; setHint(STRINGS.tab(STRINGS.names[d.slug] || d.name)); readUntil = clock.elapsedTime + 4; live.textContent = STRINGS.names[d.slug] || d.name; }
    else focusDoor = -1;
  }
  if (k === 'enter' && focusDoor >= 0 && mode === 'hub' && !leaving) { const d = doors.doors[focusDoor]; controls.setGoal(d.group.position.clone().addScaledVector(d.dir, -1.5)); }
});

// ---- Loop ----
const prefetched = new Set();
let heading = 0, speed = 0, bodySpeed = 0, stepClock = 0, leaving = false, nearDoor = null, lastNear = null, leaveDoor = null, nearPanel = null;
const velocity = new THREE.Vector3(), next = new THREE.Vector3(), camGoal = new THREE.Vector3(), look = new THREE.Vector3(), flyTo = new THREE.Vector3(), shoulder = new THREE.Vector3();
const clock = new THREE.Clock();
// One footfall per stride. The walk clip plants a foot every 0.483 s at its authored
// 1.5 m/s, so a step is 0.725 m; the run clip every 0.35 s at 4.5 m/s, so 1.575 m. The
// stride blends between the two with the same weight the character blends the clips.
const STRIDE_WALK = 0.725, STRIDE_RUN = 1.575;
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
  // The Tab focus belongs to the plaza; carried into the room it would send Enter at the wall.
  focusDoor = -1;
  visited.add(door.slug); store.set('world.visited', [...visited]); showProgress();
  world.lightLetter(LETTER_OF_DOOR[door.slug]);
  setHint(STRINGS.entering(STRINGS.names[door.slug] || door.name));
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
    setHint(`${STRINGS.names[door.slug] || door.name}. ${STRINGS.hints[door.slug] || door.hint} ${STRINGS.back}`);
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
    // Just in front of the door on the plaza side, over the visitor's shoulder; the orbit eases
    // it back to its distance as they walk away. Behind the door it sat inside the vestibule.
    controls.orbit.yaw = door.angle; camera.position.copy(player.position).add(new THREE.Vector3(door.dir.x * 1.8, 1.3, door.dir.z * 1.8));
    for (const d of doors.doors) { d.used = false; d.wasInFront = true; d.open = 0; }
    veil.classList.remove('on'); veil.classList.add('off');
  }, 600);
}

const solids = [...doors.obstacles];
// The camera walks back from the visitor's head toward its goal and stops
// short of the first wall or piece of furniture it would otherwise enter.
const eye = new THREE.Vector3(), camDir = new THREE.Vector3(), probe = new THREE.Vector3();
const camRight = new THREE.Vector3(), toDoor = new THREE.Vector3();
function unclip(cam) {
  const list = mode === 'room' ? rooms.solids : solids;
  eye.copy(player.position); eye.y += 1.4;
  camDir.copy(cam).sub(eye); const len = camDir.length(); if (len < 0.4) return; camDir.divideScalar(len);
  for (let d = 0.5; d < len; d += 0.12) {
    probe.copy(eye).addScaledVector(camDir, d);
    for (const b of list) if (b.containsPoint(probe)) { cam.copy(eye).addScaledVector(camDir, Math.max(0.45, d - 0.25)); return; }
    if (mode === 'hub') for (const b of world.obstacles) if (b.containsPoint(probe)) { cam.copy(eye).addScaledVector(camDir, Math.max(0.45, d - 0.25)); return; }
    // The leaf counts whether open or shut: a camera past it looks at the back of a door
    // that then swings through the lens as it opens.
    if (mode === 'hub') for (const door of doors.doors) if (door.leafBox.containsPoint(probe)) { cam.copy(eye).addScaledVector(camDir, Math.max(0.45, d - 0.25)); return; }
  }
}
function blocked(point) {
  if (mode === 'room') { for (const box of rooms.solids) if (box.distanceToPoint(point) < BODY_RADIUS) return true; return false; }
  for (const box of solids) if (box.distanceToPoint(point) < BODY_RADIUS) return true;
  for (const box of world.obstacles) if (box.distanceToPoint(point) < BODY_RADIUS) return true;
  return doors.slabBlocks(point);
}

function frame() {
  followCanvas();
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
  // The body animates at the speed the visitor actually covered, so a wall or a shelf
  // stops the stride and the footsteps with it; `speed` stays the commanded value for steering.
  const moved = next.distanceTo(player.position) / Math.max(dt, 1e-4);
  bodySpeed += (moved - bodySpeed) * Math.min(1, dt * ACCEL);
  player.position.copy(next);
  player.rotation.y = heading;
  const stride = STRIDE_WALK + (STRIDE_RUN - STRIDE_WALK) * THREE.MathUtils.clamp((bodySpeed - WALK) / (RUN - WALK), 0, 1);
  stepClock += dt * (bodySpeed > 0.2 ? bodySpeed / stride : 0);
  if (stepClock > 1) { stepClock = 0; audio.footstep(true, 0); }
  if (character) character.update(dt, bodySpeed, window.__world.facing);

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
    if (introStarted) intro = Math.max(0, intro - dt / (wish.lengthSq() > 1e-4 ? 1.4 : 5.5));
    // Ease in and out, so the first visible second is the slow start of a move and the
    // camera is never already at full speed as the veil clears.
    const p = 1 - intro; const k = p * p * (3 - 2 * p);
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
    // Panned by the door's offset along the camera's right, so a door dead ahead sounds
    // ahead; by world x it sat hard to one side for every door off the z axis.
    if (res.opened) { camRight.setFromMatrixColumn(camera.matrixWorld, 0); toDoor.copy(res.opened.group.position).sub(camera.position); audio.door(doors.doors.indexOf(res.opened), THREE.MathUtils.clamp(toDoor.dot(camRight) / 6, -1, 1)); }
    if (res.wrongWay) audio.refuse();
    nearDoor = res.near;
    if (nearDoor !== lastNear) { lastNear = nearDoor; live.textContent = nearDoor ? STRINGS.names[nearDoor.slug] || nearDoor.name : ''; if (nearDoor && !prefetched.has(nearDoor.slug)) { prefetched.add(nearDoor.slug); rooms.prefetch([nearDoor.slug]); } }
    audio.update(nearDoor ? player.position.distanceTo(nearDoor.group.position) : 99, 0);
    if (!leaving && character && t > readUntil) setHint(nearDoor ? `${STRINGS.enter(STRINGS.names[nearDoor.slug] || nearDoor.name)} ${isTouch ? STRINGS.readTouch : STRINGS.readKeys}` : WALK_HINT);
  } else {
    const r = rooms.update(dt, player.position, camera);
    nearPanel = r.panel;
    if (r.back && !rooms.held) leaveRoom();
    if (!leaving && t > readUntil) setHint(rooms.held ? (isTouch ? STRINGS.putBackTouch : STRINGS.putBackKeys) : nearPanel ? (isTouch ? STRINGS.takeTouch : STRINGS.takeKeys)(nearPanel.userData.item.title) : `${(rooms.current && STRINGS.hints[rooms.current.slug]) || r.hint} ${STRINGS.back}`);
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
// Full screen, a rotated phone and a zoomed window do not always send resize in time, so the
// canvas is also measured every frame and the buffer follows its box whenever the two disagree.
for (const ev of ['fullscreenchange', 'webkitfullscreenchange', 'orientationchange']) document.addEventListener(ev, () => setTimeout(resize, 50));
if (window.ResizeObserver) new ResizeObserver(() => resize()).observe(document.documentElement);
// Floored, the way setSize sizes the buffer: rounded, an odd dimension at a pixel ratio of
// 1.5 disagreed by one pixel forever and the buffer was reallocated every frame.
function followCanvas() { const w = canvas.clientWidth, h = canvas.clientHeight; if (w && h && (canvas.width !== Math.floor(w * renderer.getPixelRatio()) || canvas.height !== Math.floor(h * renderer.getPixelRatio()))) { renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); post.resize(w, h); } }
resize();
frame();
