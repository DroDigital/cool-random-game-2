import * as THREE from 'three';
import { G, ASPECTS, BIOMES } from './state.js';
import { rand, randi, TAU, clamp, lerp, damp, angDiff, lerpAng, dist, yaw, pick, chance, shuffle } from './util.js';
import * as FX from './fx.js';
import * as A from './audio.js';
import { buildEnemy, buildBoss, glowMat, G3 } from './models.js';
import { P, hurtPlayer, collide, telegraph, waveRing, beamHazard, enemyShot, tickStatus, hitEnemy, killEnemy } from './combat.js';

let scene;
export const initEnemies = (sc) => (scene = sc);

export const DEFS = {
  skitter: { hp: 18, speed: 7.6, dmg: 7, score: 5, gold: 0.4, h: 1.2, mass: 0.5, cost: 1 },
  husk: { hp: 55, speed: 4.3, dmg: 13, score: 10, gold: 1, h: 2.6, mass: 1, cost: 2 },
  brute: { hp: 270, speed: 2.9, dmg: 30, score: 35, gold: 4, h: 4, mass: 4, cost: 6 },
  spitter: { hp: 42, speed: 3.9, dmg: 10, score: 15, gold: 1.5, h: 2.6, mass: 1, cost: 3 },
  wraith: { hp: 62, speed: 5.5, dmg: 17, score: 20, gold: 2, h: 3.2, mass: 1, cost: 4 },
  bomber: { hp: 34, speed: 6.4, dmg: 24, score: 12, gold: 1, h: 2, mass: 0.8, cost: 2 },
  summoner: { hp: 90, speed: 3.4, dmg: 0, score: 30, gold: 3, h: 3.6, mass: 1.5, cost: 5 },
};
export const BOSS_NAMES = ['Magma Colossus', 'Glacial Weaver', 'Archon of the Storm'];
const BOSS_HP = [2100, 2700, 3500];

export const hpScale = () => 1 + 0.17 * G.run.depth + 0.006 * G.run.depth * G.run.depth;

export function spawnEnemy(type, x, z, o = {}) {
  const d = DEFS[type], b = BIOMES[G.run.biome];
  const m = buildEnemy(type, b.accent);
  const sc = hpScale();
  const e = {
    type, def: d, group: m.group, rig: m.rig, P: m.P, r: m.r, h: d.h, x, z, kx: 0, kz: 0, face: rand(TAU), hp: d.hp * sc, maxHp: d.hp * sc,
    spd: d.speed, dmg: d.dmg * (1 + (sc - 1) * 0.55), score: d.score, gold: d.gold, mass: d.mass, spawnT: o.instant ? 0.01 : 0.9, stun: 0, flash: 0, t: rand(1), atkCd: rand(0.3, 1),
    state: 'chase', st: 0, walk: rand(TAU), seed: rand(TAU), color: b.accent, burn: 0, chill: 0, shock: 0, vuln: 0, freeze: 0, chillN: 0, dead: false, owner: o.owner || null,
    tHeart: !!(G.room && G.room.heart && chance(0.55)),
  };
  if (type === 'bomber') e.onDeath = bomberDeath;
  if (o.elite) makeElite(e, o.elite === true ? null : o.elite);
  if (o.ward !== undefined) addWard(e, o.ward);
  e.group.scale.setScalar(o.elite ? 1.3 : 1);
  e.group.position.set(x, 0, z);
  e.mats = [];
  e.group.traverse((m) => { if (m.isMesh) { m.castShadow = true; const mm = m.material; if (!mm.userData.e0) { mm.userData.e0 = mm.emissive.clone(); mm.userData.i0 = mm.emissiveIntensity; e.mats.push(mm); } } });
  scene.add(e.group);
  G.enemies.push(e);
  // spawn rift fx
  if (!o.instant) {
    FX.ring(x, z, b.accent, 0.3, 2.2, 0.8, 0.12, 0.9); FX.ring(x, z, 0xffffff, 0.2, 1.2, 0.8, 0.14, 0.5, true);
    FX.burst(x, 0.3, z, { count: 14, color: b.accent, speed: 4, life: 0.8, size: 0.6, up: 4, flat: 1 });
    A.sfx('spawn', 0.35);
  }
  return e;
}

const AFFIXES = ['swift', 'armored', 'volatile', 'arcane'];
function makeElite(e, affix) {
  e.elite = true; affix = affix || pick(AFFIXES); e.affix = affix;
  e.maxHp = e.hp = e.hp * 3.2; e.dmg *= 1.25; e.gold *= 4; e.score *= 5; e.r *= 1.25; e.mass *= 2;
  const col = { swift: 0x66ffcc, armored: 0xc0c8d8, volatile: 0xff5a3a, arcane: 0xd070ff }[affix];
  e.eliteColor = col; e.color = col;
  const ring = new THREE.Mesh(G3.tor(1.1, 0.07, 6, 32), glowMat(col, 3.5)); ring.rotation.x = Math.PI / 2; ring.position.y = 0.12; e.group.add(ring); e.eliteRing = ring;
  const crown = new THREE.Mesh(G3.oct(0.22), glowMat(col, 4)); crown.position.y = e.h + 0.7; crown.scale.y = 1.6; e.group.add(crown); e.crown = crown;
  if (affix === 'swift') e.spd *= 1.4;
  if (affix === 'armored') e.armored = true;
  if (affix === 'volatile') { const prev = e.onDeath; e.onDeath = (q, o) => { prev && prev(q, o); telegraph(q.x, q.z, 4.2, 0.9, q.dmg * 1.2, { color: 0xff6a2a, sfx: 'boom' }); FX.text(q.x, 3, q.z, 'VOLATILE!', 'warn'); }; }
  if (affix === 'arcane') e.arcaneT = 3;
  FX.text(e.x, e.h + 1.5, e.z, affix.toUpperCase() + ' ELITE', 'elite');
}
export function addWard(e, elem) {
  e.ward = { elem, hp: e.maxHp * 0.55 };
  const w = new THREE.Mesh(new THREE.IcosahedronGeometry(1, 1), new THREE.MeshBasicMaterial({ color: ASPECTS[elem].color, wireframe: true, transparent: true, opacity: 0.8, toneMapped: false }));
  w.scale.setScalar(e.r * 1.5 + 0.3); w.position.y = e.h * 0.5; e.group.add(w); e.wardMesh = w;
}

function bomberDeath(e, o) {
  if (e.exploded) return; e.exploded = true;
  enemyBlast(e.x, e.z, 3.0, e.dmg * 0.7, 0xff7a2a);
}
export function enemyBlast(x, z, r, dmg, col = 0xff6a2a) {
  FX.ring(x, z, col, 0.5, r * 1.2, 0.4, 0.2, 1, false, 1.5); FX.ring(x, z, 0xffffff, 0.2, r, 0.25, 0.25, 0.8, true);
  FX.burst(x, 0.8, z, { count: 36, color: [col, 0xffffff, 0xffc060], speed: r * 3.5, life: 0.6, size: 1, gravity: 5, up: 3 });
  FX.flash(x, 2, z, col, 50, 0.35); A.sfx('boom', 0.9); FX.shake(0.45);
  if (dist(x, z, P.x, P.z) < r + 0.4) hurtPlayer(dmg, x, z);
  for (const e of G.enemies) if (!e.dead && e.spawnT <= 0 && dist(x, z, e.x, e.z) < r + e.r) hitEnemy(e, dmg * 1.6, { dot: true, elem: -1, kx: e.x - x, kz: e.z - z, kb: 10, stun: 0.3 });
}

// ------------------------------------------------------------------ helpers
function target(e) {
  const h = G.room && G.room.heart;
  if (h && h.hp > 0 && e.tHeart) return { x: h.x, z: h.z, heart: true, r: 1.8 };
  return { x: P.x, z: P.z, heart: false, r: 0.5 };
}
function slowMul(e) {
  let m = 1;
  if (e.chill > 0) m *= 0.55;
  if (e.pulled > 0) m *= 0.4;
  return m * (G.enemyTime || 1);
}
function stepTo(e, tx, tz, sp, dt) {
  const dx = tx - e.x, dz = tz - e.z, d = Math.hypot(dx, dz) || 1;
  e.x += dx / d * sp * dt; e.z += dz / d * sp * dt; e.moving = 1;
  return d;
}
function faceTo(e, tx, tz, dt, rate = 10) { e.face = lerpAng(e.face, Math.atan2(tz - e.z, tx - e.x), 1 - Math.exp(-rate * dt)); }
function hitTarget(e, tg, dmg, kb = 0) {
  if (tg.heart) { G.room.damageHeart && G.room.damageHeart(dmg, e); } else hurtPlayer(dmg, e.x, e.z);
}

// ------------------------------------------------------------------ AI per type
const AI = {
  skitter(e, dt, tg) {
    const d = dist(e.x, e.z, tg.x, tg.z);
    e.atkCd -= dt;
    if (e.state === 'leap') {
      e.st -= dt; e.x += Math.cos(e.face) * 19 * dt * (G.enemyTime || 1); e.z += Math.sin(e.face) * 19 * dt * (G.enemyTime || 1); e.moving = 1;
      if (e.st <= 0) { e.state = 'chase'; e.leapCd = rand(2, 4); }
    } else {
      e.leapCd = (e.leapCd ?? rand(1, 2)) - dt;
      faceTo(e, tg.x, tg.z, dt, 12);
      const sp = e.spd * slowMul(e);
      const zig = Math.sin(G.time * 6 + e.seed) * 0.5, a = Math.atan2(tg.z - e.z, tg.x - e.x) + zig * (d > 3 ? 1 : 0);
      e.x += Math.cos(a) * sp * dt; e.z += Math.sin(a) * sp * dt; e.moving = 1;
      if (e.leapCd <= 0 && d > 3 && d < 8) { e.state = 'leap'; e.st = 0.28; e.leapCd = 99; A.sfx('dash', 0.2, 1.6); }
    }
    if (d < e.r + tg.r + 0.7 && e.atkCd <= 0) { e.atkCd = 0.9; hitTarget(e, tg, e.dmg); FX.burst(e.x, 0.6, e.z, { count: 5, color: 0xff4060, speed: 3, life: 0.2, size: 0.4 }); }
  },
  husk(e, dt, tg) {
    const d = dist(e.x, e.z, tg.x, tg.z);
    e.atkCd -= dt;
    if (e.state === 'wind') {
      e.st -= dt; faceTo(e, tg.x, tg.z, dt, 4);
      e.P.armR.rotation.x = lerp(e.P.armR.rotation.x, -2.4, 0.3);
      if (e.st <= 0) {
        e.state = 'chase'; e.atkCd = 1.2; e.P.armR.rotation.x = 0.8;
        FX.slash(e.x + Math.cos(e.face), e.z + Math.sin(e.face), e.face, 2.7, 1.8, 0xff4a5a, 0.18);
        A.sfx('slash', 0.3, 0.6);
        const dd = dist(e.x, e.z, tg.x, tg.z);
        if (dd < 2.8 + tg.r && Math.abs(angDiff(e.face, Math.atan2(tg.z - e.z, tg.x - e.x))) < 1.1) hitTarget(e, tg, e.dmg);
      }
    } else {
      faceTo(e, tg.x, tg.z, dt, 8);
      if (d > e.r + tg.r + 1.1) stepTo(e, tg.x, tg.z, e.spd * slowMul(e), dt);
      if (d < 2.4 + tg.r && e.atkCd <= 0) { e.state = 'wind'; e.st = 0.5; FX.ring(e.x + Math.cos(e.face) * 1.4, e.z + Math.sin(e.face) * 1.4, 0xff3040, 0.3, 1.6, 0.5, 0.15, 0.7); }
      e.P.armR.rotation.x = lerp(e.P.armR.rotation.x, Math.sin(e.walk) * 0.5, 0.2);
    }
  },
  brute(e, dt, tg) {
    const d = dist(e.x, e.z, tg.x, tg.z);
    e.atkCd -= dt;
    if (e.state === 'slam') {
      e.st -= dt; faceTo(e, tg.x, tg.z, dt, 3);
      const k = clamp(1 - e.st / 0.95, 0, 1);
      e.P.armL.rotation.x = e.P.armR.rotation.x = k < 0.8 ? lerp(0, -2.6, k / 0.8) : lerp(-2.6, 0.4, (k - 0.8) / 0.2);
      if (e.st <= 0) e.state = 'chase';
    } else {
      faceTo(e, tg.x, tg.z, dt, 5);
      if (d > e.r + tg.r + 1.5) stepTo(e, tg.x, tg.z, e.spd * slowMul(e), dt);
      e.P.armL.rotation.x = Math.sin(e.walk) * 0.3; e.P.armR.rotation.x = -Math.sin(e.walk) * 0.3;
      if (d < 5.5 && e.atkCd <= 0) {
        e.state = 'slam'; e.st = 0.95; e.atkCd = 2.6;
        const sx = e.x + Math.cos(e.face) * 3.2, sz = e.z + Math.sin(e.face) * 3.2;
        telegraph(sx, sz, 3.8, 0.95, e.dmg, { hurtsEnemies: false, onFire: (h) => { if (tg.heart && dist(h.x, h.z, tg.x, tg.z) < h.r + 1.8) G.room.damageHeart(e.dmg, e); } });
      }
    }
  },
  spitter(e, dt, tg) {
    const d = dist(e.x, e.z, tg.x, tg.z);
    e.atkCd -= dt; faceTo(e, tg.x, tg.z, dt, 6);
    const sp = e.spd * slowMul(e);
    const want = tg.heart ? 12 : 10.5;
    if (d < want - 2.5) { const a = Math.atan2(e.z - tg.z, e.x - tg.x); e.x += Math.cos(a) * sp * dt; e.z += Math.sin(a) * sp * dt; e.moving = 1; }
    else if (d > want + 2.5) stepTo(e, tg.x, tg.z, sp, dt);
    else { const a = Math.atan2(tg.z - e.z, tg.x - e.x) + Math.PI / 2 * (e.seed > 3 ? 1 : -1); e.x += Math.cos(a) * sp * 0.5 * dt; e.z += Math.sin(a) * sp * 0.5 * dt; e.moving = 0.5; }
    if (e.state === 'wind') {
      e.st -= dt; e.P.sac.scale.setScalar(1 + (0.45 - e.st) * 1.5);
      if (e.st <= 0) {
        e.state = 'chase'; e.P.sac.scale.setScalar(1);
        const a = Math.atan2(tg.z - e.z, tg.x - e.x), n = G.run.depth >= 3 ? 3 : 1;
        for (let i = 0; i < n; i++) enemyShot(e.x, e.z, a + (i - (n - 1) / 2) * 0.22, 12, e.dmg, e.color, { y: 1.6 });
      }
    } else if (e.atkCd <= 0 && d < 17) { e.state = 'wind'; e.st = 0.5; e.atkCd = rand(2.0, 3.0); }
  },
  wraith(e, dt, tg) {
    const d = dist(e.x, e.z, tg.x, tg.z);
    e.atkCd -= dt;
    if (e.state === 'chase') { // stalk
      faceTo(e, tg.x, tg.z, dt, 8);
      const sp = e.spd * slowMul(e), a = Math.atan2(e.z - tg.z, e.x - tg.x);
      if (d > 8) stepTo(e, tg.x, tg.z, sp, dt);
      else { const ta = a + 0.9 * dt * 0.8 * (e.seed > 3 ? 1 : -1); e.x = tg.x + Math.cos(ta) * d; e.z = tg.z + Math.sin(ta) * d; e.moving = 1; }
      if (e.atkCd <= 0) { e.state = 'fade'; e.st = 0.35; A.sfx('blink', 0.4); }
    } else if (e.state === 'fade') {
      e.st -= dt; e.alpha = clamp(e.st / 0.35, 0, 1);
      if (e.st <= 0) {
        const a = rand(TAU); e.x = tg.x + Math.cos(a) * 4; e.z = tg.z + Math.sin(a) * 4; collide(e, e.r);
        e.state = 'tele'; e.st = 0.5; e.alpha = 1; FX.burst(e.x, 1, e.z, { count: 12, color: e.color, speed: 5, life: 0.4, size: 0.6 }); A.sfx('blink', 0.4);
        e.face = Math.atan2(tg.z - e.z, tg.x - e.x);
        e.dashA = e.face; FX.ring(e.x, e.z, 0xff3a4a, 0.4, 1.4, 0.5);
      }
    } else if (e.state === 'tele') {
      e.st -= dt; e.dashA = Math.atan2(tg.z - e.z, tg.x - e.x); e.face = e.dashA;
      if (Math.random() < dt * 40) FX.emit(e.x + Math.cos(e.dashA) * rand(0, 6), 0.3, e.z + Math.sin(e.dashA) * rand(0, 6), 0, 0.5, 0, 0.2, 0.5, 0, 0xff3a4a);
      if (e.st <= 0) { e.state = 'dash'; e.st = 0.25; e.hitDash = false; A.sfx('slash3', 0.3, 1.4); }
    } else if (e.state === 'dash') {
      e.st -= dt; const sp = 26 * (G.enemyTime || 1);
      e.x += Math.cos(e.dashA) * sp * dt; e.z += Math.sin(e.dashA) * sp * dt; e.moving = 1;
      FX.trail(e.x, 1.2, e.z, 0xff3a4a, 0.8, 0.3);
      if (!e.hitDash && dist(e.x, e.z, tg.x, tg.z) < 1.4 + tg.r) { e.hitDash = true; hitTarget(e, tg, e.dmg); }
      if (e.st <= 0) { e.state = 'recover'; e.st = 0.7; }
    } else if (e.state === 'recover') { e.st -= dt; if (e.st <= 0) { e.state = 'chase'; e.atkCd = rand(1.8, 3); } }
  },
  bomber(e, dt, tg) {
    const d = dist(e.x, e.z, tg.x, tg.z);
    if (e.state === 'fuse') {
      e.st -= dt; const k = 1 - e.st / 0.8;
      e.P.core.scale.setScalar(1 + Math.sin(G.time * (20 + k * 40)) * 0.1 + k * 0.3);
      e.P.core.material.emissiveIntensity = 3 + Math.sin(G.time * (20 + k * 40)) * 2;
      if (e.st <= 0) { e.exploded = true; enemyBlast(e.x, e.z, 4.2, e.dmg); e.hp = 0; killEnemy(e, { dot: true }); }
    } else {
      faceTo(e, tg.x, tg.z, dt, 10);
      stepTo(e, tg.x, tg.z, e.spd * slowMul(e), dt);
      if (d < 3.2 + tg.r) { e.state = 'fuse'; e.st = 0.8; A.sfx('warn', 0.5, 2); telegraph(e.x, e.z, 4.2, 0.8, 0, { silent: true, quiet: true, color: 0xff7a2a }); }
    }
  },
  summoner(e, dt, tg) {
    const d = dist(e.x, e.z, P.x, P.z);
    e.atkCd -= dt; faceTo(e, P.x, P.z, dt, 5);
    const sp = e.spd * slowMul(e);
    if (e.state === 'cast') {
      e.st -= dt; if (e.P.ring) e.P.ring.rotation.z += dt * 12;
      if (Math.random() < dt * 40) FX.emit(e.x + rand(-1.5, 1.5), 0.2, e.z + rand(-1.5, 1.5), 0, rand(2, 5), 0, 0.5, 0.6, 0, e.color);
      if (e.st <= 0) {
        e.state = 'chase';
        const mine = G.enemies.filter((q) => q.owner === e && !q.dead).length;
        for (let i = 0; i < 3 && mine + i < 7; i++) { const a = rand(TAU); const sx = e.x + Math.cos(a) * 2.5, sz = e.z + Math.sin(a) * 2.5; const o = { x: sx, z: sz }; collide(o, 0.6); spawnEnemy('skitter', o.x, o.z, { owner: e }); }
      }
    } else {
      if (d < 11) { const a = Math.atan2(e.z - P.z, e.x - P.x); e.x += Math.cos(a) * sp * dt; e.z += Math.sin(a) * sp * dt; e.moving = 1; }
      else if (d > 16) stepTo(e, P.x, P.z, sp, dt);
      if (e.atkCd <= 0) { e.state = 'cast'; e.st = 1.0; e.atkCd = 6; A.sfx('spawn', 0.5, 0.7); }
    }
  },
};

// ------------------------------------------------------------------ boss
export function spawnBoss(kind, x = 0, z = -8) {
  const b = BIOMES[G.run.biome];
  const m = buildBoss(kind, b.accent);
  const hp = BOSS_HP[kind] * (1 + 0.05 * G.run.depth);
  const e = {
    type: 'boss' + kind, boss: true, kind, def: { name: BOSS_NAMES[kind] }, group: m.group, rig: m.rig, P: m.P, r: m.r, h: kind === 0 ? 9 : 7, x, z, kx: 0, kz: 0, face: Math.PI / 2,
    hp, maxHp: hp, spd: 3.2, dmg: 22 + G.run.depth * 1.5, score: 1000, gold: 25, mass: 100, noKnock: true, spawnT: 0.01, stun: 0, flash: 0, t: 0,
    state: 'intro', st: 3, atk: null, phase: 1, atkN: 0, walk: 0, seed: rand(TAU), color: b.accent, burn: 0, chill: 0, shock: 0, vuln: 0, freeze: 0, chillN: 0, dead: false,
    invuln: true, name: BOSS_NAMES[kind],
  };
  e.mats = [];
  e.group.traverse((mm) => { if (mm.isMesh) { mm.castShadow = true; const q = mm.material; if (!q.userData.e0) { q.userData.e0 = q.emissive.clone(); q.userData.i0 = q.emissiveIntensity; e.mats.push(q); } } });
  e.group.position.set(x, 0, z);
  scene.add(e.group); G.enemies.push(e);
  G.boss = e;
  e.onDeath = () => { G.boss = null; for (const q of G.enemies) if (!q.boss && !q.dead) { q.hp = 0; killEnemy(q, { dot: true }); } };
  A.sfx('roar', 1); FX.shake(1.0);
  return e;
}
const bossDmg = (e, m = 1) => e.dmg * m;
const ADDS = [['husk', 'skitter'], ['wraith', 'skitter'], ['bomber', 'wraith', 'husk']];

const BATK = {
  slam(e, dt, s) { // telegraph circles on the player; shockwave after
    const n = e.phase >= 3 ? 3 : e.phase === 2 ? 2 : 1;
    if (s.t === 0 || (s.i < n && s.t >= s.next)) {
      if (s.t === 0) { s.i = 0; s.next = 0; }
      const tx = P.x + P.vx * 0.3, tz = P.z + P.vz * 0.3;
      telegraph(tx, tz, 5.2, 0.95, bossDmg(e, 1.2), { sfx: 'slam', onFire: (h) => waveRing(h.x, h.z, 13, 24, bossDmg(e, 0.6), e.color) });
      s.i++; s.next = s.t + 1.25;
      if (e.P.armL) { e.armUp = 1; }
    }
    if (s.t > s.next - 0.1 && s.i >= n) return true;
  },
  meteors(e, dt, s) {
    s.c = (s.c ?? 0) - dt;
    if (s.c <= 0 && s.t < 3.4) {
      s.c = e.phase >= 3 ? 0.2 : 0.3;
      const lead = Math.random() < 0.5; const a = rand(TAU), r = rand(2, 9);
      telegraph(lead ? P.x + P.vx * 0.35 : P.x + Math.cos(a) * r, lead ? P.z + P.vz * 0.35 : P.z + Math.sin(a) * r, 2.6, 0.9, bossDmg(e, 0.8), { sfx: 'boom', silent: true });
    }
    if (s.t > 4.4) return true;
  },
  spiral(e, dt, s) {
    s.c = (s.c ?? 0) - dt; s.a = (s.a ?? rand(TAU));
    if (s.c <= 0 && s.t < 3.6) {
      s.c = e.phase >= 3 ? 0.075 : 0.1; s.a += 0.3 * (s.dir ??= chance(0.5) ? 1 : -1);
      const arms = e.phase >= 2 ? 3 : 2;
      for (let i = 0; i < arms; i++) enemyShot(e.x, e.z, s.a + i * TAU / arms, 9.5, bossDmg(e, 0.4), e.color, { y: 1.6, life: 4 });
    }
    if (s.t > 4.2) return true;
  },
  nova(e, dt, s) {
    const waves = e.phase >= 3 ? 3 : 2;
    s.w ??= 0;
    if (s.w < waves && s.t >= s.w * 0.75) {
      const n = 24, off = s.w * TAU / n / 2;
      for (let i = 0; i < n; i++) enemyShot(e.x, e.z, off + i * TAU / n, 8, bossDmg(e, 0.4), e.color, { y: 1.6, life: 5 });
      A.sfx('boom', 0.4); FX.ring(e.x, e.z, e.color, 1, 8, 0.5);
      s.w++;
    }
    return s.w >= waves && s.t > (waves - 1) * 0.75 + 0.6;
  },
  summon(e, dt, s) {
    if (s.t === 0) {
      FX.ring(e.x, e.z, e.color, 1, 12, 0.8, 0.2, 1, false, 2); A.sfx('spawn', 0.8, 0.6); FX.shake(0.3);
      const n = 3 + e.phase; const list = ADDS[e.kind];
      for (let i = 0; i < n; i++) { const a = i / n * TAU + rand(0.5); const o = { x: e.x + Math.cos(a) * 9, z: e.z + Math.sin(a) * 9 }; collide(o, 0.6); spawnEnemy(pick(list), o.x, o.z); }
      s.t = 0.0001;
    }
    return s.t > 1.5;
  },
  charge(e, dt, s) {
    if (!s.go) {
      if (s.t === 0 || !s.beam) {
        s.a = Math.atan2(P.z - e.z, P.x - e.x);
        s.beam = beamHazard(e.x, e.z, s.a, 34, 3.4, 0.9, 0.45, 0, bossDmg(e, 1.3), e.color, (h) => { if (s.t < 0.9) { s.a = Math.atan2(P.z - e.z, P.x - e.x); h.a = s.a; h.x = e.x; h.z = e.z; } });
        s.t = 0.0001;
      }
      e.face = lerpAng(e.face, s.a, 0.2);
      if (s.t >= 0.9) { s.go = true; A.sfx('roar', 0.6); }
    } else {
      const sp = 44 * (G.enemyTime || 1);
      e.x += Math.cos(s.a) * sp * dt; e.z += Math.sin(s.a) * sp * dt; collide(e, 1.5); e.moving = 1;
      FX.burst(e.x, 0.5, e.z, { count: 3, color: e.color, speed: 6, life: 0.4, size: 1.2, flat: 1 });
      FX.shake(0.15);
      if (s.t > 1.35) return true;
    }
  },
  laser(e, dt, s) {
    if (s.t === 0) {
      const a0 = Math.atan2(P.z - e.z, P.x - e.x), sw = (chance(0.5) ? 1 : -1) * TAU * 0.8;
      const n = e.phase >= 3 ? 2 : 1;
      s.beams = [];
      for (let i = 0; i < n; i++) s.beams.push(beamHazard(e.x, e.z, a0 + i * Math.PI, 36, 2.6, 1.2, 3.2, sw, bossDmg(e, 0.9), 0xff3a8a, (h) => { h.x = e.x; h.z = e.z; }));
      s.t = 0.0001;
    }
    if (s.t > 1.2 && !s.fired) { s.fired = true; A.sfx('ult', 0.5); FX.shake(0.4); }
    if (s.t > 1.2) FX.shake(0.08);
    return s.t > 4.7;
  },
  icespikes(e, dt, s) {
    if (s.t === 0) {
      const lines = e.phase >= 2 ? 10 : 7, off = rand(TAU);
      for (let l = 0; l < lines; l++) for (let k = 1; k <= 6; k++) {
        const a = off + l * TAU / lines, x = e.x + Math.cos(a) * k * 3.3, z = e.z + Math.sin(a) * k * 3.3;
        if (Math.hypot(x, z) > G.arena.radius - 1) continue;
        setTimeout(() => G.state === 'play' && !e.dead && telegraph(x, z, 1.8, 0.85, bossDmg(e, 0.7), { color: 0x6fe0ff, sfx: 'ice', silent: k > 1 }), k * 130);
      }
      s.t = 0.0001; A.sfx('ice', 1, 0.6);
    }
    return s.t > 2.4;
  },
  blink(e, dt, s) {
    if (s.t === 0) { s.t = 0.0001; s.ph = 0; }
    if (s.ph === 0 && s.t > 0.45) {
      s.ph = 1; FX.ring(e.x, e.z, e.color, 1, 7, 0.5); const a = rand(TAU), r = rand(5, 11); e.x = Math.cos(a) * r; e.z = Math.sin(a) * r;
      FX.ring(e.x, e.z, e.color, 1, 9, 0.5, 0.2, 1, false, 2); A.sfx('blink', 0.9); FX.shake(0.3);
      telegraph(e.x, e.z, 5, 0.7, bossDmg(e, 0.9), { color: 0xd070ff, sfx: 'boom' });
    }
    e.alpha = s.ph === 0 ? clamp(1 - s.t / 0.45, 0, 1) : clamp((s.t - 0.45) / 0.3, 0, 1);
    if (s.t > 1.0) { e.alpha = 1; return true; }
  },
};
const BOSS_ATKS = [
  { 1: ['slam', 'meteors', 'summon', 'charge'], 2: ['slam', 'spiral', 'meteors', 'charge', 'summon'], 3: ['slam', 'spiral', 'meteors', 'charge', 'nova'] },
  { 1: ['icespikes', 'charge', 'spiral', 'summon'], 2: ['icespikes', 'nova', 'charge', 'spiral', 'summon'], 3: ['icespikes', 'meteors', 'nova', 'charge', 'spiral'] },
  { 1: ['laser', 'spiral', 'blink', 'nova'], 2: ['laser', 'spiral', 'blink', 'meteors', 'summon'], 3: ['laser', 'nova', 'blink', 'meteors', 'spiral', 'charge'] },
];

function bossAI(e, dt) {
  const hpk = e.hp / e.maxHp;
  const ph = hpk < 0.33 ? 3 : hpk < 0.66 ? 2 : 1;
  if (ph !== e.phase) { e.phase = ph; if (e.state !== 'intro') { e.atk = null; e.state = 'idle'; e.st = 1.6; FX.text(e.x, e.h + 1, e.z, 'ENRAGED', 'warn'); A.sfx('roar', 1); FX.shake(0.9); FX.ring(e.x, e.z, e.color, 1, 20, 0.8, 0.2, 1, false, 2); e.invuln = false; } }
  const tg = { x: P.x, z: P.z };
  if (e.state === 'intro') {
    e.st -= dt; e.invuln = true; faceTo(e, tg.x, tg.z, dt, 3);
    if (Math.random() < dt * 30) FX.emit(e.x + rand(-3, 3), 0.2, e.z + rand(-3, 3), 0, rand(3, 8), 0, 0.8, 1, 0, e.color);
    if (e.st <= 0) { e.state = 'idle'; e.st = 0.8; e.invuln = false; }
    return;
  }
  if (e.state === 'idle') {
    e.st -= dt; faceTo(e, tg.x, tg.z, dt, 4);
    const d = dist(e.x, e.z, tg.x, tg.z);
    if (d > 8) stepTo(e, tg.x, tg.z, e.spd * slowMul(e) * (e.kind === 0 ? 1 : 1.2), dt);
    else if (d < 5) { const a = Math.atan2(e.z - tg.z, e.x - tg.x); e.x += Math.cos(a) * 3 * dt; e.z += Math.sin(a) * 3 * dt; }
    if (e.st <= 0) {
      const list = BOSS_ATKS[e.kind][e.phase];
      let name = pick(list); if (name === e.lastAtk) name = pick(list);
      e.lastAtk = name; e.atk = { name, t: 0 }; e.state = 'atk'; e.atkN++;
    }
  } else if (e.state === 'atk') {
    const s = e.atk; const first = s.t === 0;
    const done = BATK[s.name](e, dt, s);
    if (!first || s.t === 0) s.t += dt * (G.enemyTime || 1);
    if (done) { e.state = 'idle'; e.st = e.phase === 3 ? 0.8 : e.phase === 2 ? 1.2 : 1.7; e.atk = null; e.alpha = 1; }
  }
  collide(e, 1.5);
}

// ------------------------------------------------------------------ main enemy update
const tmpV = new THREE.Vector3();
export function updateEnemies(dt) {
  G.enemyTime = 1 - (P.stats.timelord || 0);
  const list = G.enemies;
  for (let i = list.length - 1; i >= 0; i--) {
    const e = list[i];
    if (e.dead) {
      e.deadT += dt; const k = e.deadT / (e.boss ? 0.8 : 0.18);
      e.group.scale.setScalar(Math.max(0.001, (e.elite ? 1.3 : 1) * (1 - k)));
      if (e.boss) { e.group.position.y -= dt * 2; if (Math.random() < 0.5) FX.burst(e.x + rand(-2, 2), rand(1, 6), e.z + rand(-2, 2), { count: 6, color: [e.color, 0xffffff], speed: 8, life: 0.6, size: 1 }); }
      if (k >= 1) { scene.remove(e.group); list.splice(i, 1); disposeEnemy(e); }
      continue;
    }
    // spawn-in
    if (e.spawnT > 0) {
      e.spawnT -= dt; const k = clamp(1 - e.spawnT / 0.9, 0, 1);
      e.rig.position.y = -e.h * (1 - k); e.group.position.set(e.x, 0, e.z);
      if (e.spawnT <= 0) e.rig.position.y = 0;
      continue;
    }
    if (e.pulled > 0) e.pulled -= dt;
    tickStatus(e, dt);
    if (e.dead) continue;
    const edt = dt * (G.enemyTime || 1);
    e.moving = 0; e.walk += dt * (e.spd || 4) * 0.9;
    // knockback
    if (e.kx || e.kz) {
      e.x += e.kx * dt; e.z += e.kz * dt; const f = Math.exp(-7 * dt); e.kx *= f; e.kz *= f;
      if (Math.abs(e.kx) + Math.abs(e.kz) < 0.2) e.kx = e.kz = 0;
    }
    if (e.freeze > 0) {
      if (!e.iceMesh) { const m = new THREE.Mesh(G3.ico(1, 0), new THREE.MeshStandardMaterial({ color: 0xaee8ff, emissive: 0x4fd8ff, emissiveIntensity: 0.6, transparent: true, opacity: 0.55, roughness: 0.1, metalness: 0.2, flatShading: true })); m.scale.set(e.r * 1.3, e.h * 0.6, e.r * 1.3); m.position.y = e.h * 0.5; e.group.add(m); e.iceMesh = m; }
      e.iceMesh.visible = true;
    } else if (e.stun > 0) e.stun -= dt;
    else {
      const tg = target(e);
      if (e.boss) bossAI(e, edt); else {
        AI[e.type](e, edt, tg);
        if (e.affix === 'arcane') { e.arcaneT -= edt; if (e.arcaneT <= 0) { e.arcaneT = 4.5; for (let k = 0; k < 8; k++) enemyShot(e.x, e.z, k * TAU / 8 + G.time, 7, e.dmg * 0.5, 0xd070ff, { y: 1.4 }); } }
      }
    }
    // separation (soft)
    if (!e.boss) for (let j = i - 1; j >= 0; j--) {
      const o = list[j]; if (o.dead || o.spawnT > 0 || o.boss) continue;
      const dx = e.x - o.x, dz = e.z - o.z, m = e.r + o.r, d2 = dx * dx + dz * dz;
      if (d2 < m * m && d2 > 0.0001) { const d = Math.sqrt(d2), push = (m - d) * 0.5; const wa = o.mass / (e.mass + o.mass); e.x += dx / d * push * wa; e.z += dz / d * push * wa; o.x -= dx / d * push * (1 - wa); o.z -= dz / d * push * (1 - wa); }
    }
    // keep out of the player (can't walk through)
    if (!e.boss) { const dx = e.x - P.x, dz = e.z - P.z, m = e.r + 0.55, d = Math.hypot(dx, dz); if (d < m * 0.8 && d > 0.01 && P.dashT <= 0) { e.x = P.x + dx / d * m * 0.8; e.z = P.z + dz / d * m * 0.8; } }
    collide(e, e.boss ? 1.5 : e.r * 0.6);
    render(e, dt);
  }
}

function render(e, dt) {
  const P_ = e.P, t = G.time;
  const hover = (P_.hover || 0) + (P_.hover ? Math.sin(t * 2 + e.seed) * 0.25 : 0);
  e.group.position.set(e.x, hover, e.z);
  e.group.rotation.y = yaw(e.face);
  const mv = e.moving || 0;
  if (P_.legs) P_.legs.forEach((l, i) => { l.rotation.x = Math.sin(e.walk * 1.4 + i * (e.type === 'skitter' ? 1.05 : Math.PI)) * 0.8 * mv; });
  if (P_.orbit) P_.orbit.forEach((o, i) => (o.rotation.y += dt * (e.boss ? 1.5 : 3) * (i % 2 ? 1 : -1)));
  if (P_.ring && !e.boss) P_.ring.rotation.z += dt * 2;
  if (e.boss) {
    if (P_.ringA) { P_.ringA.rotation.x += dt * 0.8; P_.ringA.rotation.y += dt * 0.5; P_.ringB.rotation.z += dt * 0.6; P_.ringB.rotation.x = 1; }
    if (P_.core && e.kind === 2) P_.core.rotation.y += dt;
    if (e.kind === 0) {
      const up = e.armUp > 0 ? (e.armUp = Math.max(0, e.armUp - dt * 0.9)) : 0;
      const lean = e.state === 'atk' && e.atk && e.atk.name === 'slam' ? 1 : 0;
      P_.armL.rotation.x = lerp(P_.armL.rotation.x, lean ? -2.6 : Math.sin(e.walk) * 0.3, 0.12);
      P_.armR.rotation.x = lerp(P_.armR.rotation.x, lean ? -2.6 : -Math.sin(e.walk) * 0.3, 0.12);
      P_.torso.rotation.x = Math.sin(t * 1.5) * 0.03 + (e.state === 'intro' ? Math.sin(t * 30) * 0.02 : 0);
    }
    e.group.position.y = hover + (e.kind > 0 ? 0 : 0) + (e.state === 'atk' && e.atk?.name === 'charge' ? 0 : 0);
  } else {
    if (P_.torso && e.type !== 'brute') P_.torso.rotation.z = Math.sin(e.walk) * 0.06 * mv;
    if (P_.head && e.type === 'husk') P_.head.rotation.x = Math.sin(e.walk * 0.5) * 0.1;
    if (e.type === 'brute' && e.state !== 'slam') P_.torso.position.y = 1.7 + Math.abs(Math.sin(e.walk)) * 0.08 * mv;
    if (e.type === 'wraith' || e.type === 'summoner') e.rig.position.y = Math.sin(t * 3 + e.seed) * 0.12;
    if (e.type === 'spitter') P_.legs.forEach((l, i) => (l.rotation.z = Math.sin(t * 3 + i) * 0.3));
    if (e.type === 'bomber' && e.state !== 'fuse') { P_.core.material.emissiveIntensity = 2.5 + Math.sin(t * 6 + e.seed) * 1; }
    if (e.type === 'skitter') e.rig.position.y = Math.abs(Math.sin(e.walk * 1.4)) * 0.05;
  }
  // wraith alpha
  if (e.alpha !== undefined && P_.cloak) { P_.cloak.material.opacity = 0.92 * e.alpha; e.group.visible = e.alpha > 0.04; }
  if (e.boss && e.alpha !== undefined) e.group.visible = e.alpha > 0.04;
  if (e.eliteRing) { e.eliteRing.rotation.z += dt * 2; e.crown.rotation.y += dt * 3; e.crown.position.y = e.h + 0.7 + Math.sin(t * 3) * 0.1; if (Math.random() < dt * 8) FX.emit(e.x + rand(-0.6, 0.6), rand(0.2, e.h), e.z + rand(-0.6, 0.6), 0, rand(1, 2), 0, 0.6, 0.35, 0, e.eliteColor); }
  if (e.wardMesh) { e.wardMesh.rotation.y += dt; e.wardMesh.rotation.x += dt * 0.6; }
  // hit flash + freeze tint
  if (e.flash > 0) {
    e.flash -= dt; const k = Math.max(0, e.flash / 0.1);
    for (const m of e.mats) { m.emissive.setRGB(1, 1, 1); m.emissiveIntensity = 0.3 + k * 1.5; }
    if (e.flash <= 0) for (const m of e.mats) { m.emissive.copy(m.userData.e0); m.emissiveIntensity = m.userData.i0; }
  }
}

function disposeEnemy(e) {
  e.group.traverse((o) => { if (o.isMesh) { const ms = Array.isArray(o.material) ? o.material : [o.material]; ms.forEach((m) => m.dispose()); if (o === e.wardMesh) o.geometry.dispose(); } });
}

export function clearEnemies() {
  for (const e of G.enemies) { scene.remove(e.group); disposeEnemy(e); }
  G.enemies.length = 0; G.boss = null;
}
export const aliveCount = () => G.enemies.filter((e) => !e.dead).length;
