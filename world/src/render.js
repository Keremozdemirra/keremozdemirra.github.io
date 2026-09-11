// Rendering: a white studio. The ground fades into the sky with no horizon,
// one warm key light throws soft shadows, and a bright neutral environment
// lights the scanned objects the way a photo studio would. The scene renders
// straight to the canvas: through a post chain white came out grey.

import * as THREE from 'three';

// Kept for modules that still tag glowing meshes; nothing blooms in the studio.
export const BLOOM = 1;

export const PAPER = 0xf3f2ee;
const SUN_OFFSET = new THREE.Vector3(9, 14, 7); // high, from the front right, so faces read and shadows fall short and soft

export function createRenderer(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  // Phones render at most 1.5x: the fill rate is where they spend the battery.
  renderer.setPixelRatio(Math.min(devicePixelRatio, matchMedia('(pointer: coarse)').matches ? 1.5 : 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.VSMShadowMap; // soft penumbra without PCF's sample noise
  renderer.setClearColor(PAPER, 1);
  return renderer;
}

export function createEnvironment(renderer, scene) {
  // A studio: a big soft box overhead, a warm key panel, a cool floor bounce.
  const room = new THREE.Scene();
  room.background = new THREE.Color(0xd9d9d6);
  const panel = (w, h, color, intensity, x, y, z) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color, toneMapped: false }));
    m.material.color.multiplyScalar(intensity); m.position.set(x, y, z); m.lookAt(0, y, 0); room.add(m);
  };
  panel(40, 40, 0xffffff, 2.6, 0, 20, 0.01);   // softbox overhead
  panel(20, 12, 0xfff1dc, 3.2, 12, 10, 8);    // warm key, front right
  panel(24, 12, 0xdfe6ee, 1.6, -14, 8, -6);   // cool fill, back left
  panel(60, 4, 0xd6d3cc, 1.0, 0, -3, 0);      // floor bounce
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(room, 0.03, 0.1, 100).texture;
  pmrem.dispose();
  scene.environmentIntensity = 0.85;
  scene.background = new THREE.Color(PAPER);
  scene.fog = new THREE.FogExp2(PAPER, 0.02);
  // A dome, cooler toward the zenith, so the white has a faint horizon in it.
  const sky = new THREE.Mesh(new THREE.SphereGeometry(140, 32, 16), new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: { top: { value: new THREE.Color(0xe6e9ec) }, bottom: { value: new THREE.Color(PAPER) } },
    vertexShader: 'varying float h; void main(){ h = normalize(position).y; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: 'uniform vec3 top; uniform vec3 bottom; varying float h; void main(){ float t = smoothstep(0.02, 0.6, h); gl_FragColor = vec4(mix(bottom, top, t), 1.0); }',
  }));
  sky.name = 'sky'; scene.add(sky);
}

export function createLights(scene) {
  const sun = new THREE.DirectionalLight(0xfff4e6, 2.6);
  sun.castShadow = true;
  const coarse = matchMedia('(pointer: coarse)').matches;
  sun.shadow.mapSize.set(coarse ? 1024 : 2048, coarse ? 1024 : 2048);
  sun.shadow.radius = 5;
  sun.shadow.blurSamples = 16;
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = 60;
  sun.shadow.camera.left = -22; sun.shadow.camera.right = 22;
  sun.shadow.camera.top = 22; sun.shadow.camera.bottom = -22;
  sun.shadow.bias = -0.0003;
  sun.shadow.normalBias = 0.02;
  scene.add(sun, sun.target);
  const fill = new THREE.HemisphereLight(0xffffff, 0xd8d4cc, 0.5);
  scene.add(fill);

  let azimuth = 0;
  const off = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
  function setAzimuth(rad) { azimuth = rad; }
  function follow(position) {
    off.copy(SUN_OFFSET).applyAxisAngle(up, azimuth);
    sun.position.set(position.x + off.x, position.y + off.y, position.z + off.z);
    sun.target.position.copy(position);
  }
  return { sun, fill, follow, setAzimuth };
}

export function createFloor(scene) {
  // The ground is the same colour as the sky, so with the fog there is no horizon.
  // The ground darkens very slightly away from the centre, so the plaza sits in a pool of light.
  const c = document.createElement('canvas'); c.width = c.height = 512; const g = c.getContext('2d');
  const grad = g.createRadialGradient(256, 256, 40, 256, 256, 256); grad.addColorStop(0, '#ffffff'); grad.addColorStop(0.55, '#f5f4f0'); grad.addColorStop(1, '#ebeae5');
  g.fillStyle = grad; g.fillRect(0, 0, 512, 512);
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(600, 600), new THREE.MeshStandardMaterial({ color: PAPER, roughness: 1 }));
  const pool = new THREE.Mesh(new THREE.CircleGeometry(60, 64), new THREE.MeshStandardMaterial({ map: tex, roughness: 1, transparent: true, depthWrite: false }));
  pool.rotation.x = -Math.PI / 2; pool.position.y = -0.006; pool.receiveShadow = true; scene.add(pool);
  floor.name = 'floor'; floor.rotation.x = -Math.PI / 2; floor.position.y = -0.012; floor.receiveShadow = true;
  scene.add(floor);
  return floor;
}

export function createComposer(renderer, scene, camera, { width, height }) {
  renderer.setSize(width, height, false);
  return {
    render() { renderer.setRenderTarget(null); renderer.render(scene, camera); },
    resize(w, h) { renderer.setSize(w, h, false); },
    setFloor() {},
  };
}
