// Keyboard, mouse and touch input for the third-person GTA-style controller.
// Owns the orbit camera's spherical state and the player's desired movement
// (wish); render and main decide what to do with either.

import * as THREE from 'three';

const MOVE_KEYS = new Set(['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright']);

const DRAG_THRESHOLD = 6; // px before a mouse press is a drag, not a click
const JOY_DEAD = 12; // px
const JOY_FULL = 70; // px, walk speed reached here
const JOY_RUN = 110; // px, run kicks in beyond here
const STOP_RADIUS = 0.25; // m, close enough to a click-goal to stop

const DIST_MIN = 3;
const DIST_MAX = 12;
const PITCH_MIN = 0.08;
const PITCH_MAX = 0.62; // a steep view from above turned the world into a scatter of boxes
const ORBIT_YAW_SENS = 0.006; // rad per px dragged
const ORBIT_PITCH_SENS = 0.004; // rad per px dragged
// A thumb has the right half of the screen, 195px on a 390px phone, where a
// mouse has the whole window: at the mouse rate one full stroke turned 67
// degrees and facing the door behind you took three. At these a stroke turns
// 123 degrees and a half turn is one and a half strokes.
const TOUCH_YAW_SENS = 0.011; // rad per px swiped
const TOUCH_PITCH_SENS = 0.007; // rad per px swiped
const ZOOM_SENS = 0.01; // distance per wheel deltaY unit
const AUTO_FOLLOW_TAU = 2.5; // seconds, how slowly the camera settles behind the player
const TURN_FOLLOW_TAU = 1.0; // seconds, the camera swinging round behind a walk that began toward it

export function createControls({ canvas, camera }) {
  const pressed = new Set();
  const orbit = { yaw: Math.PI, pitch: 0.22, distance: 5.2, autoFollow: true };

  let hasGoal = false;
  const goal = new THREE.Vector3();

  let joystickPointerId = -1, joystickOriginX = 0, joystickOriginY = 0, joystickDX = 0, joystickDY = 0;

  // One entry per active mouse or right-half touch pointer, tracking whether
  // it is still a pending click or has become an orbit drag.
  const dragPointers = new Map();

  const forward = new THREE.Vector3(), right = new THREE.Vector3(), wish = new THREE.Vector3(), toGoal = new THREE.Vector3();
  // The camera's frame this instant, and whether the frame the walk is read
  // against is held from the start of the current key or joystick gesture.
  const camForward = new THREE.Vector3(), camRight = new THREE.Vector3();
  let latched = false;
  // Entering or leaving a room moves the player and the camera in one step,
  // and the camera only looks at its new target a frame later. A held key
  // across that step would keep walking in the old room's frame, so the
  // frame is read live again for the two frames that follow such a jump.
  const lastPos = new THREE.Vector3(0, Infinity, 0);
  let settle = 0;
  // Set once a walk begins toward the camera, and kept for that gesture, so
  // the swing round behind is not abandoned at the side, where forwardness
  // passes through zero and the strafe gate below would otherwise stop it.
  let turning = false;
  const result = { wish, run: false };

  const raycaster = new THREE.Raycaster(), ndc = new THREE.Vector2(), groundHit = new THREE.Vector3();
  const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);

  function setGoal(point) { goal.copy(point); hasGoal = true; }
  function clearGoal() { hasGoal = false; }

  function raycastGround(clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    ndc.set(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
    raycaster.setFromCamera(ndc, camera);
    return raycaster.ray.intersectPlane(groundPlane, groundHit);
  }

  function anyOrbitDragging() {
    for (const p of dragPointers.values()) {
      if (p.kind === 'orbit') return true;
    }
    return false;
  }

  function onKeyDown(e) {
    const key = e.key.toLowerCase();
    if (key.startsWith('arrow')) e.preventDefault(); // arrows must not scroll the page
    if (MOVE_KEYS.has(key)) pressed.add(key);
    if (key === 'shift') pressed.add('shift');
  }

  function onKeyUp(e) { pressed.delete(e.key.toLowerCase()); }
  function onBlur() { pressed.clear(); }

  function onPointerDown(e) {
    if (e.pointerType === 'mouse') {
      if (e.button !== 0) return;
      canvas.setPointerCapture(e.pointerId);
      dragPointers.set(e.pointerId, { kind: 'pending', startX: e.clientX, startY: e.clientY, lastX: e.clientX, lastY: e.clientY });
      return;
    }
    if (e.pointerType === 'touch') {
      const rect = canvas.getBoundingClientRect();
      const leftHalf = e.clientX - rect.left < rect.width / 2;
      canvas.setPointerCapture(e.pointerId);
      if (leftHalf) {
        joystickPointerId = e.pointerId;
        joystickOriginX = e.clientX;
        joystickOriginY = e.clientY;
        joystickDX = 0;
        joystickDY = 0;
      } else {
        dragPointers.set(e.pointerId, { kind: 'orbit', startX: e.clientX, startY: e.clientY, lastX: e.clientX, lastY: e.clientY });
      }
    }
  }

  function onPointerMove(e) {
    if (e.pointerId === joystickPointerId) {
      joystickDX = e.clientX - joystickOriginX;
      joystickDY = e.clientY - joystickOriginY;
      return;
    }
    const p = dragPointers.get(e.pointerId);
    if (!p) return;
    if (p.kind === 'pending') {
      const moved = Math.hypot(e.clientX - p.startX, e.clientY - p.startY);
      if (moved <= DRAG_THRESHOLD) return;
      p.kind = 'orbit';
      p.lastX = e.clientX;
      p.lastY = e.clientY;
    }
    const dx = e.clientX - p.lastX;
    const dy = e.clientY - p.lastY;
    const touch = e.pointerType === 'touch';
    orbit.yaw -= dx * (touch ? TOUCH_YAW_SENS : ORBIT_YAW_SENS);
    orbit.pitch = THREE.MathUtils.clamp(orbit.pitch - dy * (touch ? TOUCH_PITCH_SENS : ORBIT_PITCH_SENS), PITCH_MIN, PITCH_MAX);
    p.lastX = e.clientX;
    p.lastY = e.clientY;
  }

  function onPointerUp(e) {
    if (e.pointerId === joystickPointerId) {
      joystickPointerId = -1;
      joystickDX = 0;
      joystickDY = 0;
      return;
    }
    const p = dragPointers.get(e.pointerId);
    if (!p) return;
    dragPointers.delete(e.pointerId);
    if (p.kind === 'pending') {
      const hit = raycastGround(e.clientX, e.clientY);
      if (hit) setGoal(hit);
    }
  }

  function onWheel(e) {
    // The wheel is the world's only while the world is the focused document,
    // which is always so in full screen and true in the frame on the home page
    // only after the reader has clicked into it. Inside that frame it is taken
    // only while a pointer is held on the canvas: the frame covers most of the
    // viewport, and with the wheel swallowed the page under the cursor stopped
    // scrolling the moment the demo started, until the cursor left the box.
    if (!document.hasFocus()) return;
    if (document.body.classList.contains('embed') && dragPointers.size === 0) return;
    e.preventDefault();
    orbit.distance = THREE.MathUtils.clamp(orbit.distance + e.deltaY * ZOOM_SENS, DIST_MIN, DIST_MAX);
  }

  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('blur', onBlur);
  canvas.addEventListener('pointerdown', onPointerDown);
  canvas.addEventListener('pointermove', onPointerMove);
  canvas.addEventListener('pointerup', onPointerUp);
  canvas.addEventListener('pointercancel', onPointerUp);
  canvas.addEventListener('wheel', onWheel, { passive: false });

  function update(dt, playerPosition) {
    camera.getWorldDirection(camForward);
    camForward.y = 0;
    if (camForward.lengthSq() < 1e-8) camForward.set(0, 0, 1); else camForward.normalize();
    camRight.set(-camForward.z, 0, camForward.x);

    // A key or joystick gesture reads the camera when it begins, and again
    // only while the reader is turning the camera by hand. It does not read
    // the camera while the camera moves on its own: with the live frame, a
    // walk toward the lens re-aimed itself every frame the follow swung
    // round, and the character curved instead of reaching the door.
    let moving = false;
    for (const k of MOVE_KEYS) if (pressed.has(k)) { moving = true; break; }
    const joyMag = joystickPointerId === -1 ? 0 : Math.hypot(joystickDX, joystickDY);
    if (joyMag > JOY_DEAD) moving = true;
    // No run covers a metre in one frame; a jump that far is a room entered or left.
    if (lastPos.distanceToSquared(playerPosition) > 1) { settle = 2; turning = false; }
    lastPos.copy(playerPosition);
    if (!moving || !latched || anyOrbitDragging() || settle > 0) { forward.copy(camForward); right.copy(camRight); }
    if (settle > 0) settle--;
    latched = moving;

    wish.set(0, 0, 0);
    let run = false;
    let usedKeyboard = false;
    if (pressed.has('w') || pressed.has('arrowup')) { wish.add(forward); usedKeyboard = true; }
    if (pressed.has('s') || pressed.has('arrowdown')) { wish.sub(forward); usedKeyboard = true; }
    if (pressed.has('d') || pressed.has('arrowright')) { wish.add(right); usedKeyboard = true; }
    if (pressed.has('a') || pressed.has('arrowleft')) { wish.sub(right); usedKeyboard = true; }

    if (usedKeyboard) {
      clearGoal();
      if (wish.lengthSq() > 1e-8) wish.normalize();
      run = pressed.has('shift');
    } else if (joystickPointerId !== -1) {
      if (joyMag > JOY_DEAD) {
        clearGoal();
        const strength = Math.min(1, (joyMag - JOY_DEAD) / (JOY_FULL - JOY_DEAD));
        const fwdAmount = (-joystickDY / joyMag) * strength;
        const rightAmount = (joystickDX / joyMag) * strength;
        wish.copy(forward).multiplyScalar(fwdAmount).addScaledVector(right, rightAmount);
        run = joyMag > JOY_RUN;
      }
    } else if (hasGoal) {
      toGoal.copy(goal).sub(playerPosition);
      toGoal.y = 0;
      const dist = toGoal.length();
      if (dist <= STOP_RADIUS) {
        hasGoal = false;
      } else {
        wish.copy(toGoal).normalize();
      }
    }
    if (wish.lengthSq() > 1) wish.normalize();

    if (orbit.autoFollow && !anyOrbitDragging() && wish.lengthSq() > 1e-6) {
      // Follow when the player moves roughly away from the camera, and swing
      // round when the player moves roughly toward it. Not on a strafe: with
      // a fast follow on every direction, holding a strafe key spun the
      // character in a tight circle: the camera swung behind the new heading,
      // which re-aimed the strafe, which swung the camera again.
      //
      // The swing exists for leaving a room. The way out is behind the
      // camera, and in a room the camera cannot back away from a character
      // walking at it, so the body grew until it filled the frame, passed
      // beside the lens and the view spun half a turn in a fifth of a second.
      // The walk direction is held for the gesture above, so the swing cannot
      // re-aim it; with the shorter time constant the camera is most of the
      // way behind before the door is reached.
      const targetYaw = Math.atan2(wish.x, wish.z) + Math.PI;
      const diff = Math.atan2(Math.sin(targetYaw - orbit.yaw), Math.cos(targetYaw - orbit.yaw));
      const forwardness = Math.cos(diff);
      if (forwardness < -0.3) turning = true;
      if (turning) orbit.yaw += diff * (1 - Math.exp(-dt / TURN_FOLLOW_TAU));
      else if (forwardness > 0.3) orbit.yaw += diff * forwardness * (1 - Math.exp(-dt / AUTO_FOLLOW_TAU));
    } else {
      turning = false;
    }

    result.run = run;
    return result;
  }

  function dispose() {
    window.removeEventListener('keydown', onKeyDown);
    window.removeEventListener('keyup', onKeyUp);
    window.removeEventListener('blur', onBlur);
    canvas.removeEventListener('pointerdown', onPointerDown);
    canvas.removeEventListener('pointermove', onPointerMove);
    canvas.removeEventListener('pointerup', onPointerUp);
    canvas.removeEventListener('pointercancel', onPointerUp);
    canvas.removeEventListener('wheel', onWheel);
  }

  return { update, orbit, setGoal, clearGoal, dispose };
}
