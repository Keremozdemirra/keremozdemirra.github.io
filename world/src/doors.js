// Seven doors on a circle around the start, each built by its theme. A door
// opens as the visitor comes near and closes behind them; crossing the
// threshold is what enters the room. main.js owns movement; this file owns
// the doors and what they block.

import * as THREE from 'three';
import { THEMES, angleOf, DOOR_R } from './themes.js';

const smooth = (x) => THREE.MathUtils.smoothstep(x, 0, 1);

export function createDoors(scene, DOORS) {
  const ring = new THREE.Group(); scene.add(ring);
  const obstacles = [];
  const doors = DOORS.map((d) => {
    const theme = THEMES[d.slug];
    const a = angleOf(d.slug);
    const g = new THREE.Group(); g.position.set(DOOR_R * Math.sin(a), 0, DOOR_R * Math.cos(a)); g.rotation.y = a; ring.add(g);
    const api = theme.door(g);
    // The jambs and the vestibule are solid; the leaf is solid only while closed.
    g.updateMatrixWorld(true);
    for (const s of [-1, 1]) { const jamb = new THREE.Box3().setFromCenterAndSize(new THREE.Vector3(s * (api.width / 2 + 0.5), 1.5, 0.8), new THREE.Vector3(0.6, 3, 2.0)); jamb.applyMatrix4(g.matrixWorld); obstacles.push(jamb); }
    const back = new THREE.Box3().setFromCenterAndSize(new THREE.Vector3(0, 1.5, 1.9), new THREE.Vector3(api.width + 1.2, 3, 0.4)); back.applyMatrix4(g.matrixWorld); obstacles.push(back);
    for (const s of [-1, 1]) { const wing = new THREE.Box3().setFromCenterAndSize(new THREE.Vector3(s * (api.width / 2 + 0.5 + 1.1), 1.5, 0.15), new THREE.Vector3(2.2, 3.6, 0.5)); wing.applyMatrix4(g.matrixWorld); obstacles.push(wing); }
    const leafBox = new THREE.Box3().setFromCenterAndSize(new THREE.Vector3(0, 1.2, 0), new THREE.Vector3(api.width, 2.4, 0.3)); leafBox.applyMatrix4(g.matrixWorld);
    return { name: d.name, slug: d.slug, path: d.path, summary: d.summary, hint: theme.hint, theme, group: g, api, leafBox, open: 0, used: false, wasInFront: true, wasOpen: false, flash: 0, angle: a, dir: new THREE.Vector3(Math.sin(a), 0, Math.cos(a)) };
  });

  const local = new THREE.Vector3();
  function update(dt, playerPosition) {
    let near = null, crossed = null, opened = null, wrongWay = null;
    for (const door of doors) {
      local.copy(playerPosition); door.group.worldToLocal(local);
      const dist = Math.hypot(local.x, local.z);
      const want = dist < 4.5 && local.z < 0.6 ? 1 : 0;
      door.open += (want - door.open) * Math.min(1, dt / 0.9);
      const o = smooth(door.open);
      door.api.set(o);
      if (o > 0.6 && !door.wasOpen) { door.wasOpen = true; opened = door; }
      if (o < 0.1) door.wasOpen = false;
      if (dist < 4) near = door;
      const inFront = local.z < 0;
      if (!door.used && door.wasInFront && !inFront && Math.abs(local.x) < door.api.width / 2 + 0.1 && Math.abs(local.z) < 1.0) { door.used = true; crossed = door; }
      if (door.flash > 0) door.flash = Math.max(0, door.flash - dt);
      door.wasInFront = inFront;
    }
    return { near, crossed, opened, wrongWay };
  }
  // Near an open door, nudge the visitor onto the centre line so a narrow
  // doorway never needs pixel perfect steering.
  const steer = new THREE.Vector3();
  function funnel(next, playerPosition, dt) {
    for (const door of doors) {
      local.copy(next); door.group.worldToLocal(local);
      if (door.open < 0.5 || local.z > 1.2 || local.z < -2.2 || Math.abs(local.x) > door.api.width / 2 + 0.5) continue;
      steer.set(-local.x, 0, 0).applyQuaternion(door.group.quaternion);
      next.addScaledVector(steer, Math.min(1, dt * 4));
    }
    return next;
  }
  // A closed leaf is solid.
  function slabBlocks(point) {
    for (const door of doors) if (door.open < 0.5 && door.leafBox.distanceToPoint(point) < 0.3) return true;
    return false;
  }
  return { doors, update, obstacles, slabBlocks, funnel, angles: doors.map((d) => d.angle) };
}
