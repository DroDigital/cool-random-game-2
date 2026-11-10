import * as THREE from 'three';
import { TAU, rand } from './util.js';

const geoCache = {};
const cachedGeos = new Set();
const G_ = (k, f) => geoCache[k] || (geoCache[k] = (() => { const g = f(); cachedGeos.add(g); return g; })());
export const mat = (color, em = 0x000000, ei = 1, o = {}) => {
  const p = { color, emissive: em, emissiveIntensity: ei, flatShading: o.flat !== false, roughness: o.r ?? 0.55, metalness: o.m ?? 0.35, transparent: !!o.tr, opacity: o.op ?? 1 };
  if (o.side !== undefined) p.side = o.side;
  return new THREE.MeshStandardMaterial(p);
};
export const glowMat = (c, i = 3) => new THREE.MeshStandardMaterial({ color: 0x000000, emissive: c, emissiveIntensity: i, toneMapped: true });

function add(parent, geo, m, x = 0, y = 0, z = 0, shadow = true) {
  const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.castShadow = shadow; parent && parent.add(o); return o;
}
const box = (w, h, d) => G_(`b${w},${h},${d}`, () => new THREE.BoxGeometry(w, h, d));
const oct = (r, d = 0) => G_(`o${r},${d}`, () => new THREE.OctahedronGeometry(r, d));
const ico = (r, d = 0) => G_(`i${r},${d}`, () => new THREE.IcosahedronGeometry(r, d));
const cone = (r, h, s = 6) => G_(`c${r},${h},${s}`, () => new THREE.ConeGeometry(r, h, s));
const cyl = (r1, r2, h, s = 8) => G_(`y${r1},${r2},${h},${s}`, () => new THREE.CylinderGeometry(r1, r2, h, s));
const tor = (r, t, a = 6, b = 24) => G_(`t${r},${t},${a},${b}`, () => new THREE.TorusGeometry(r, t, a, b));
const sph = (r, s = 12) => G_(`s${r},${s}`, () => new THREE.SphereGeometry(r, s, s - 2));
export const G3 = { box, oct, ico, cone, cyl, tor, sph };

export function pivot(parent, x, y, z) { const g = new THREE.Group(); g.position.set(x, y, z); parent.add(g); return g; }

// ---------------------------------------------------------------- PLAYER
export function buildPlayer(accent) {
  const g = new THREE.Group(), rig = pivot(g, 0, 0, 0);
  const dark = mat(0x2a3148, 0x0a0e18, 1, { m: 0.55, r: 0.4 });
  const trim = mat(0x6a7aa8, 0x101828, 1, { m: 0.6, r: 0.3 });
  const cloth = mat(0x20122a, 0x000000, 0, { m: 0.1, r: 0.9 });
  const glow = glowMat(accent, 3.5);
  const P = { glow };
  // legs
  P.legL = pivot(rig, -0.22, 0.95, 0); P.legR = pivot(rig, 0.22, 0.95, 0);
  for (const l of [P.legL, P.legR]) {
    add(l, box(0.26, 0.55, 0.3), trim, 0, -0.28, 0); add(l, box(0.24, 0.5, 0.28), dark, 0, -0.7, 0.02);
    add(l, box(0.3, 0.16, 0.5), dark, 0, -0.95, 0.08);
  }
  // torso
  P.torso = pivot(rig, 0, 0.95, 0);
  add(P.torso, box(0.7, 0.25, 0.45), dark, 0, 0.05, 0);
  add(P.torso, box(0.95, 0.75, 0.58), trim, 0, 0.6, 0);
  add(P.torso, box(1.0, 0.1, 0.62), glow, 0, 0.2, 0, false);
  P.core = add(P.torso, oct(0.16), glow, 0, 0.66, 0.31, false);
  add(P.torso, box(0.5, 0.5, 0.2), dark, 0, 0.62, -0.38);
  for (const s of [-1, 1]) {
    const sh = add(P.torso, oct(0.34), trim, s * 0.62, 0.98, 0); sh.scale.set(1, 0.7, 1.1);
    add(P.torso, cone(0.07, 0.4, 4), glow, s * 0.68, 1.22, 0, false);
  }
  // head
  P.head = pivot(P.torso, 0, 1.2, 0);
  add(P.head, box(0.5, 0.52, 0.5), trim, 0, 0.1, 0);
  add(P.head, box(0.52, 0.2, 0.52), dark, 0, 0.36, 0);
  P.visor = add(P.head, box(0.4, 0.09, 0.05), glow, 0, 0.12, 0.27, false);
  const crest = add(P.head, cone(0.1, 0.6, 4), glow, 0, 0.55, -0.15, false); crest.rotation.x = -0.9;
  for (const s of [-1, 1]) { const h = add(P.head, cone(0.06, 0.4, 4), dark, s * 0.3, 0.4, 0); h.rotation.z = -s * 0.5; }
  // arms
  P.armL = pivot(P.torso, -0.66, 0.95, 0); P.armR = pivot(P.torso, 0.66, 0.95, 0);
  for (const a of [P.armL, P.armR]) {
    add(a, box(0.22, 0.45, 0.22), trim, 0, -0.25, 0); add(a, box(0.2, 0.4, 0.2), dark, 0, -0.62, 0.03); add(a, box(0.24, 0.2, 0.26), trim, 0, -0.88, 0.05);
  }
  // sword
  P.sword = pivot(P.armR, 0, -0.9, 0.05);
  add(P.sword, box(0.34, 0.07, 0.1), trim, 0, 0, 0);
  P.blade = add(P.sword, box(0.09, 0.05, 1.9), glow, 0, 0, 1.05, false);
  add(P.sword, box(0.14, 0.09, 1.95), dark, 0, -0.02, 1.05, false).scale.set(1, 0.5, 1);
  const tip = add(P.sword, cone(0.07, 0.4, 4), glow, 0, 0, 2.15, false); tip.rotation.x = Math.PI / 2;
  // cape
  const cg = new THREE.PlaneGeometry(0.95, 1.5, 4, 6);
  P.cape = add(P.torso, cg, mat(0x2a0f3a, accent, 0.25, { side: THREE.DoubleSide, m: 0.1, r: 0.9 }), 0, 0.15, -0.34);
  P.cape.geometry = cg.clone(); P.capeBase = Float32Array.from(P.cape.geometry.attributes.position.array);
  P.cape.castShadow = true;
  // aspect shard under feet glow
  return { group: g, rig, P };
}

export function setPlayerColor(P, c) {
  P.glow.emissive.set(c);
  P.cape.material.emissive.set(c);
}

export function animateCape(P, t, speed) {
  const pos = P.cape.geometry.attributes.position, base = P.capeBase;
  for (let i = 0; i < pos.count; i++) {
    const x = base[i * 3], y = base[i * 3 + 1];
    const k = (0.75 - y) / 1.5; // 0 top -> 1 bottom
    pos.setZ(i, Math.sin(t * 6 + y * 3 + x * 2) * 0.08 * k + k * k * (0.15 + speed * 0.5));
  }
  pos.needsUpdate = true;
}

// ---------------------------------------------------------------- ENEMIES
export function buildEnemy(type, accent) {
  const g = new THREE.Group(), rig = pivot(g, 0, 0, 0), P = { legs: [], orbit: [] };
  const body = mat(0x3a2d4c, 0x120a1c, 1, { m: 0.3, r: 0.55 }), plate = mat(0x66557f, 0x1a1028, 1, { m: 0.35, r: 0.4 });
  const eye = glowMat(accent, 4), hot = glowMat(0xff3a2a, 3);
  let r = 0.6;
  switch (type) {
    case 'skitter': {
      r = 0.5;
      const b = add(rig, oct(0.5), body, 0, 0.5, 0); b.scale.set(1, 0.6, 1.5);
      add(rig, box(0.7, 0.08, 0.8), eye, 0, 0.78, -0.1, false);
      add(rig, oct(0.28), plate, 0, 0.55, 0.65);
      add(rig, box(0.4, 0.07, 0.06), eye, 0, 0.6, 0.88, false);
      for (let i = 0; i < 6; i++) {
        const s = i < 3 ? -1 : 1, z = ((i % 3) - 1) * 0.5;
        const lp = pivot(rig, s * 0.35, 0.5, z); add(lp, box(0.07, 0.07, 0.7), plate, s * 0.3, -0.1, 0).rotation.z = s * 0.6;
        lp.rotation.y = s * 0.3; P.legs.push(lp);
      }
      break;
    }
    case 'husk': {
      r = 0.7;
      P.torso = pivot(rig, 0, 1.0, 0); P.torso.rotation.x = 0.25;
      add(P.torso, box(0.8, 1.0, 0.5), body, 0, 0.45, 0);
      add(P.torso, box(0.9, 0.2, 0.6), plate, 0, 0.9, 0);
      P.head = pivot(P.torso, 0, 1.15, 0.1); add(P.head, box(0.42, 0.4, 0.42), plate, 0, 0, 0); add(P.head, box(0.3, 0.08, 0.05), eye, 0, 0.03, 0.22, false);
      add(P.torso, cone(0.1, 0.5, 4), eye, 0, 0.6, -0.35, false).rotation.x = -1.2;
      P.armL = pivot(P.torso, -0.6, 0.85, 0); P.armR = pivot(P.torso, 0.6, 0.85, 0);
      for (const a of [P.armL, P.armR]) { add(a, box(0.2, 1.15, 0.2), body, 0, -0.5, 0.1); add(a, box(0.3, 0.3, 0.3), plate, 0, -1.1, 0.12); add(a, cone(0.05, 0.4, 4), eye, 0, -1.4, 0.15, false).rotation.x = Math.PI; }
      for (const s of [-1, 1]) { const l = pivot(rig, s * 0.25, 0.9, 0); add(l, box(0.26, 0.9, 0.28), body, 0, -0.45, 0); P.legs.push(l); }
      break;
    }
    case 'brute': {
      r = 1.35;
      P.torso = pivot(rig, 0, 1.7, 0);
      add(P.torso, box(1.7, 1.5, 1.1), body, 0, 0.5, 0);
      add(P.torso, box(1.9, 0.4, 1.2), plate, 0, 1.1, 0);
      add(P.torso, box(1.0, 0.8, 0.1), eye, 0, 0.5, 0.58, false);
      for (let i = 0; i < 5; i++) add(P.torso, cone(0.17, 0.9, 4), eye, (i - 2) * 0.38, 1.3, -0.5, false).rotation.x = -0.6;
      P.head = pivot(P.torso, 0, 1.4, 0.4); add(P.head, box(0.7, 0.55, 0.7), plate, 0, 0, 0); add(P.head, box(0.5, 0.1, 0.05), eye, 0, 0, 0.36, false);
      P.armL = pivot(P.torso, -1.15, 1.0, 0); P.armR = pivot(P.torso, 1.15, 1.0, 0);
      for (const a of [P.armL, P.armR]) { add(a, box(0.5, 1.3, 0.5), body, 0, -0.65, 0.1); add(a, box(0.95, 0.95, 0.95), plate, 0, -1.5, 0.2); add(a, box(0.5, 0.1, 0.96), eye, 0, -1.5, 0.2, false); }
      for (const s of [-1, 1]) { const l = pivot(rig, s * 0.55, 1.2, 0); add(l, box(0.6, 1.2, 0.6), body, 0, -0.6, 0); add(l, box(0.7, 0.25, 0.9), plate, 0, -1.15, 0.1); P.legs.push(l); }
      break;
    }
    case 'spitter': {
      r = 0.75;
      P.hover = 1.6;
      add(rig, ico(0.6, 0), body, 0, 0, 0);
      P.sac = add(rig, sph(0.42), glowMat(accent, 2.5), 0, -0.05, 0.4, false);
      for (let i = 0; i < 4; i++) { const t = pivot(rig, Math.cos(i * 1.57) * 0.3, -0.4, Math.sin(i * 1.57) * 0.3 - 0.2); add(t, cone(0.1, 1.1, 4), plate, 0, -0.5, 0).rotation.x = Math.PI; P.legs.push(t); }
      const rg = add(rig, tor(0.85, 0.05), eye, 0, 0.1, 0, false); rg.rotation.x = Math.PI / 2; P.ring = rg;
      add(rig, oct(0.18), eye, 0, 0.35, 0.4, false);
      break;
    }
    case 'wraith': {
      r = 0.65;
      P.hover = 0.35;
      const c = add(rig, cone(0.75, 2.4, 7), mat(0x0a0814, accent, 0.1, { tr: true, op: 0.92 }), 0, 1.2, 0);
      P.cloak = c;
      add(rig, sph(0.4), mat(0x07050c), 0, 2.45, 0);
      add(rig, box(0.38, 0.07, 0.05), eye, 0, 2.47, 0.36, false);
      add(rig, cone(0.28, 0.6, 5), mat(0x07050c), 0, 2.85, -0.05);
      for (let i = 0; i < 2; i++) { const o = pivot(rig, 0, 1.6, 0); const b = add(o, box(0.08, 0.05, 1.3), eye, 0.9, 0, 0, false); o.rotation.y = i * Math.PI; P.orbit.push(o); }
      break;
    }
    case 'bomber': {
      r = 0.75;
      const b = add(rig, ico(0.75, 0), mat(0x1a0d0d, 0, 0, { m: 0.4 }), 0, 0.9, 0);
      P.core = add(rig, ico(0.55, 1), hot, 0, 0.9, 0, false);
      P.core.scale.setScalar(1.02); b.scale.setScalar(1.12); b.material.transparent = true; b.material.opacity = 0.85;
      for (let i = 0; i < 4; i++) { const l = pivot(rig, Math.cos(i * 1.57 + 0.78) * 0.5, 0.45, Math.sin(i * 1.57 + 0.78) * 0.5); add(l, box(0.14, 0.5, 0.14), plate, 0, -0.1, 0); P.legs.push(l); }
      add(rig, cone(0.08, 0.5, 4), hot, 0, 1.85, 0, false);
      break;
    }
    case 'summoner': {
      r = 0.8;
      P.hover = 0.3;
      add(rig, cone(0.85, 2.2, 6), mat(0x120a1c, accent, 0.15), 0, 1.1, 0);
      add(rig, sph(0.36), mat(0x07050c), 0, 2.4, 0);
      add(rig, box(0.3, 0.08, 0.05), eye, 0, 2.42, 0.33, false);
      P.ring = add(rig, tor(0.9, 0.06, 6, 28), eye, 0, 3.1, 0, false); P.ring.rotation.x = Math.PI / 2;
      for (let i = 0; i < 3; i++) { const o = pivot(rig, 0, 1.9, 0); add(o, oct(0.2), eye, 1.1, 0, 0, false); o.rotation.y = i * TAU / 3; P.orbit.push(o); }
      break;
    }
  }
  return { group: g, rig, P, r };
}

export function buildBoss(kind, accent) {
  const g = new THREE.Group(), rig = pivot(g, 0, 0, 0), P = { legs: [], orbit: [] };
  const body = mat(0x3a2d4c, 0x120a1c, 1, { m: 0.3, r: 0.5 }), plate = mat(0x66557f, 0x1a1028, 1, { m: 0.35, r: 0.4 });
  const eye = glowMat(accent, 4), core = glowMat(accent, 2.2);
  let r = 3;
  if (kind === 0) { // Magma Colossus
    r = 3.2;
    P.torso = pivot(rig, 0, 5.2, 0);
    add(P.torso, box(4, 3.4, 2.6), body, 0, 0.9, 0);
    add(P.torso, box(4.6, 0.8, 3), plate, 0, 2.5, 0);
    add(P.torso, box(2.2, 1.8, 0.2), core, 0, 0.9, 1.35, false);
    P.core = add(P.torso, oct(0.8), eye, 0, 0.9, 1.5, false);
    for (let i = 0; i < 7; i++) add(P.torso, cone(0.4, 2.2 + (i % 2), 4), core, (i - 3) * 0.6, 2.9, -1.0, false).rotation.x = -0.5;
    P.head = pivot(P.torso, 0, 3.3, 0.5); add(P.head, box(1.5, 1.2, 1.5), plate, 0, 0, 0); add(P.head, box(1.1, 0.2, 0.1), eye, 0, 0.05, 0.78, false);
    for (const s of [-1, 1]) add(P.head, cone(0.25, 1.4, 4), core, s * 0.7, 0.9, 0, false).rotation.z = -s * 0.4;
    P.armL = pivot(P.torso, -2.8, 2.0, 0); P.armR = pivot(P.torso, 2.8, 2.0, 0);
    for (const a of [P.armL, P.armR]) { add(a, box(1.2, 3, 1.2), body, 0, -1.5, 0.2); add(a, box(2, 2, 2), plate, 0, -3.5, 0.4); add(a, box(2.1, 0.2, 2.1), eye, 0, -3.5, 0.4, false); add(a, oct(0.9), core, 0, 0.4, 0, false); }
    for (const s of [-1, 1]) { const l = pivot(rig, s * 1.3, 3.2, 0); add(l, box(1.6, 3.2, 1.6), body, 0, -1.6, 0); add(l, box(1.9, 0.5, 2.4), plate, 0, -3, 0.3); P.legs.push(l); }
  } else if (kind === 1) { // Glacial Weaver
    r = 2.9;
    P.hover = 3.2;
    P.core = add(rig, ico(1.8, 0), mat(0x0e2233, accent, 0.35, { m: 0.9, r: 0.15 }), 0, 0, 0);
    add(rig, ico(1.2, 0), core, 0, 0, 0, false);
    P.eye = add(rig, sph(0.6), eye, 0, 0.1, 1.5, false);
    for (let i = 0; i < 8; i++) {
      const a = i * TAU / 8, l = pivot(rig, Math.cos(a) * 1.2, -0.3, Math.sin(a) * 1.2); l.rotation.y = -a;
      const up = add(l, cone(0.35, 4.5, 4), plate, 2.2, -1.0, 0); up.rotation.z = -1.0; P.legs.push(l);
      add(l, cone(0.2, 2.2, 4), core, 3.4, -2.2, 0, false).rotation.z = Math.PI + 0.4;
    }
    for (let i = 0; i < 6; i++) { const o = pivot(rig, 0, 0.5 + (i % 2), 0); add(o, oct(0.4), core, 3.6, 0, 0, false).scale.set(0.6, 1.8, 0.6); o.rotation.y = i * TAU / 6; P.orbit.push(o); }
  } else { // Archon of the Storm
    r = 2.7;
    P.hover = 3.4;
    P.core = add(rig, ico(1.3, 1), core, 0, 0, 0, false);
    add(rig, ico(1.7, 0), mat(0x120a22, accent, 0.2, { tr: true, op: 0.55, m: 0.8 }), 0, 0, 0);
    P.ringA = add(rig, tor(2.7, 0.14, 6, 40), eye, 0, 0, 0, false);
    P.ringB = add(rig, tor(3.4, 0.1, 6, 40), plate, 0, 0, 0);
    for (let i = 0; i < 6; i++) { const o = pivot(rig, 0, 0, 0); add(o, box(0.25, 0.1, 2.6), eye, 4.3, 0, 0, false); add(o, cone(0.3, 0.9, 4), plate, 4.3, 0, 1.6).rotation.x = Math.PI / 2; o.rotation.y = i * TAU / 6; P.orbit.push(o); }
    for (let i = 0; i < 5; i++) add(rig, cone(0.28, 2.0, 4), plate, 0, 2.6, 0).position.set(Math.cos(i * 1.257) * 0.9, 2.2, Math.sin(i * 1.257) * 0.9);
    add(rig, box(1.4, 0.2, 0.1), eye, 0, 0.1, 1.5, false);
  }
  return { group: g, rig, P, r };
}

// ---------------------------------------------------------------- misc props
export function buildHeart(accent) {
  const g = new THREE.Group();
  const base = add(g, cyl(1.8, 2.2, 0.6, 8), mat(0x151018, 0, 0, { m: 0.7 }), 0, 0.3, 0);
  const crystal = add(g, oct(1.1, 0), glowMat(accent, 2.4), 0, 2.2, 0, false); crystal.scale.set(0.8, 1.6, 0.8);
  const shell = add(g, oct(1.6, 0), mat(0x223344, accent, 0.2, { tr: true, op: 0.3, m: 0.9, r: 0.1 }), 0, 2.2, 0); shell.scale.set(0.8, 1.6, 0.8);
  const r1 = add(g, tor(1.7, 0.06, 6, 40), glowMat(accent, 2), 0, 2.2, 0, false); r1.rotation.x = Math.PI / 2.3;
  return { group: g, crystal, shell, r1 };
}
export const isCachedGeo = (g) => cachedGeos.has(g);
