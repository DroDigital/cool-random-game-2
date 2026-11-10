import * as THREE from 'three';
import { G, ASPECTS, BIOMES } from './state.js';
import { rand, randi, TAU, clamp, lerp, damp, angDiff, lerpAng, dist, yaw, easeOut, pick, chance } from './util.js';
import * as FX from './fx.js';
import * as A from './audio.js';
import { buildPlayer, setPlayerColor, animateCape, mat, glowMat, G3 } from './models.js';
import { baseStats, BOONS } from './boons.js';

export const P = {};
let scene;
const V = new THREE.Vector3();

// ===================================================================== player setup
export function initPlayer(sc) {
  scene = sc;
  const m = buildPlayer(ASPECTS[0].color);
  P.model = m; P.group = m.group; P.parts = m.P;
  scene.add(P.group);
  P.orbitG = new THREE.Group(); scene.add(P.orbitG);
  // ground aspect ring under player
  P.halo = new THREE.Mesh(new THREE.RingGeometry(0.7, 0.85, 40), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
  P.halo.rotation.x = -Math.PI / 2; P.halo.position.y = 0.06; scene.add(P.halo);
}

export function resetPlayer() {
  Object.assign(P, {
    x: 0, z: 8, vx: 0, vz: 0, face: -Math.PI / 2, b: {}, aspect: 0, hp: 100, shield: 0, shieldT: 0,
    combo: 0, comboT: 0, atkCd: 0, swing: null, lunge: 0, lunge0: 0, lungeA: 0, dashT: 0, dashDirX: 0, dashDirZ: 1, dashCharges: 2, dashRec: 0,
    skillCd: 0, wellCd: 0, surge: 0, inv: 0, hurtT: 0, walk: 0, trinityT: 0, ultInv: 0, swapFlash: 0, castT: 0, lastTrail: 0, alive: true, orbitAng: 0, orbitN: 0,
    stats: baseStats(),
  });
  P.hp = P.stats.maxHp; P.shield = 0;
  P.group.visible = true;
  setPlayerColor(P.parts, ASPECTS[0].color);
  recalc(true);
}

export function recalc(init) {
  const S = baseStats();
  for (const b of BOONS) { const n = P.b[b.id] || 0; if (n > 0) b.ap(S, n); }
  const oldMax = P.stats.maxHp;
  P.stats = S;
  if (!init && S.maxHp > oldMax) P.hp += S.maxHp - oldMax;
  P.hp = Math.min(P.hp, S.maxHp);
  if (P.shield > S.shield) P.shield = S.shield;
  // rebuild orbiting blades
  if (S.orbit !== P.orbitN) {
    P.orbitG.clear(); P.orbitN = S.orbit;
    for (let i = 0; i < S.orbit; i++) {
      const g = new THREE.Group(); const bl = new THREE.Mesh(G3.box(0.12, 0.1, 1.1), P.parts.glow); bl.position.z = 0; g.add(bl);
      const tip = new THREE.Mesh(G3.cone(0.12, 0.4, 4), P.parts.glow); tip.rotation.x = Math.PI / 2; tip.position.z = 0.7; g.add(tip);
      g.userData.a = i / S.orbit * TAU; P.orbitG.add(g);
    }
  }
}

export function addBoon(id) {
  P.b[id] = (P.b[id] || 0) + 1;
  const def = BOONS.find((b) => b.id === id);
  recalc();
  if (def.pick) def.pick(P, healPlayer);
  if (id === 'aegis') P.shield = P.stats.shield;
}

export const aspectColor = () => ASPECTS[P.aspect].color;

// ===================================================================== collision helpers
export function collide(o, r) {
  const ar = G.arena; if (!ar) return;
  const d = Math.hypot(o.x, o.z), lim = ar.radius - r - 0.2;
  if (d > lim) { o.x *= lim / d; o.z *= lim / d; }
  for (const ob of ar.obstacles) {
    const dx = o.x - ob.x, dz = o.z - ob.z, dd = Math.hypot(dx, dz), m = ob.r + r;
    if (dd < m && dd > 0.001) { o.x = ob.x + dx / dd * m; o.z = ob.z + dz / dd * m; }
  }
}
export function hitsObstacle(x, z, r = 0.3) {
  const ar = G.arena; if (Math.hypot(x, z) > ar.radius - 0.2) return true;
  return ar.obstacles.some((ob) => Math.hypot(x - ob.x, z - ob.z) < ob.r + r);
}
export function nearestEnemy(x, z, maxD = 99, filter) {
  let best = null, bd = maxD;
  for (const e of G.enemies) { if (e.dead || e.spawnT > 0 || (filter && !filter(e))) continue; const d = dist(x, z, e.x, e.z) - e.r; if (d < bd) { bd = d; best = e; } }
  return best;
}

// ===================================================================== player damage
export function healPlayer(n) {
  if (!P.alive) return;
  const h = Math.min(n, P.stats.maxHp - P.hp);
  if (h <= 0) return;
  P.hp += h; FX.text(P.x, 3, P.z, '+' + Math.ceil(h), 'heal'); A.sfx('heal', 0.6);
  FX.burst(P.x, 1, P.z, { count: 10, color: 0x6dff9a, speed: 2.5, up: 3, life: 0.7, size: 0.5 });
}
export function hurtPlayer(dmg, sx, sz, o = {}) {
  if (!P.alive || G.state !== 'play') return false;
  if (P.dashT > 0 || P.ultInv > 0) {
    if (P.dashT > 0 && !o.noDodge && G.time - (P.lastDodge || 0) > 0.4) { P.lastDodge = G.time; P.surge = Math.min(100, P.surge + 3); FX.text(P.x, 2.8, P.z, 'DODGE', 'dodge'); }
    return false;
  }
  if (P.inv > 0) return false;
  dmg *= P.stats.taken * (G.run.dmgTaken || 1);
  dmg = Math.max(1, Math.round(dmg));
  P.shieldT = 5;
  let rem = dmg;
  if (P.shield > 0) { const s = Math.min(P.shield, rem); P.shield -= s; rem -= s; FX.text(P.x, 2.6, P.z, '-' + s, 'shield'); }
  if (rem > 0) { P.hp -= rem; FX.text(P.x, 2.8, P.z, '-' + rem, 'hurt'); }
  P.inv = 0.7; P.hurtT = 0.35;
  G.run.hits++; G.run.combo = 0;
  const dx = P.x - sx, dz = P.z - sz, d = Math.hypot(dx, dz) || 1;
  P.vx += dx / d * 9; P.vz += dz / d * 9;
  FX.shake(rem > 0 ? 0.55 : 0.25); FX.hitstop(0.07); A.sfx('hurt', rem > 0 ? 1 : 0.5);
  FX.burst(P.x, 1.2, P.z, { count: 16, color: [0xff3030, 0xff8060], speed: 6, life: 0.5, size: 0.5 });
  G.flashRed = 0.6;
  if (P.hp <= 0) { P.hp = 0; P.alive = false; G.onDeath && G.onDeath(); }
  return true;
}

// ===================================================================== enemy damage / status / reactions
const ELEM_TXT = ['#ff9a5a', '#7fe3ff', '#fff27a'];
export function critRoll(dmg) {
  const S = P.stats;
  if (Math.random() < S.crit) return [dmg * S.critMul, true];
  return [dmg, false];
}
export function playerDmgMul() {
  const S = P.stats; let m = S.dmg;
  if (S.berserk && P.hp < S.maxHp * 0.5) m *= 1 + S.berserk;
  if (P.trinityT > 0) m *= 1.35;
  return m;
}

export function hitEnemy(e, dmg, o = {}) {
  if (e.dead || e.spawnT > 0 || e.invuln) return 0;
  const S = P.stats;
  let d = dmg, crit = false;
  if (o.canCrit) [d, crit] = critRoll(d);
  if (e.vuln > 0) d *= 1.4;
  let shattered = false;
  if (e.freeze > 0 && !o.dot) {
    d *= 2 + S.frozenBonus; e.freeze = 0; shattered = true; crit = true;
  } else if (e.freeze > 0) d *= 1 + S.frozenBonus;
  if (e.ward) {
    if (o.elem === e.ward.elem) {
      e.ward.hp -= d;
      if (e.ward.hp <= 0) breakWard(e);
    } else { d *= 0.12; if (!o.dot) FX.text(e.x, e.h + 0.5, e.z, 'WARDED', 'ward'); o = { ...o, noStatus: true }; }
  }
  if (e.armored && !o.noArmor) d *= 0.6;
  if (S.execute && !e.boss && !e.elite && e.hp - d < e.maxHp * S.execute && !o.dot) d = e.hp + 1;
  d = Math.max(1, d);
  e.hp -= d; e.flash = 0.1;
  if (!o.dot) { P.surge = Math.min(100, P.surge + d * 0.045 * S.surgeMul); G.run.dmg += d; }
  if (S.life && !o.dot) { P.hp = Math.min(S.maxHp, P.hp + d * S.life); }
  if (o.kx !== undefined && !e.boss && !e.noKnock) {
    const kb = (o.kb ?? 6) * (e.armored ? 0.5 : 1) / (e.mass || 1);
    e.kx += o.kx * kb; e.kz += o.kz * kb;
  }
  if (o.stun && !e.boss && !e.noKnock) e.stun = Math.max(e.stun, o.stun);
  // numbers
  if (!o.dot || d >= 3) {
    const c = o.elem >= 0 ? (o.elem === 0 ? 'e0' : o.elem === 1 ? 'e1' : 'e2') : '';
    FX.text(e.x, e.h + 0.3, e.z, Math.round(d) + (crit ? '!' : ''), (crit ? 'crit ' : '') + c + (d > 60 ? ' big' : ''));
  }
  if (!o.dot) {
    A.sfx(crit ? 'crit' : 'hit', crit ? 0.8 : 0.6);
    FX.burst(e.x, e.h * 0.55, e.z, { count: crit ? 14 : 7, color: o.elem >= 0 ? ASPECTS[o.elem].color : 0xffffff, speed: crit ? 9 : 6, life: 0.35, size: crit ? 0.7 : 0.45 });
    if (e.boss) FX.hitstop(0.012);
  }
  if (shattered) shatter(e);
  if (o.elem >= 0 && !o.noStatus && !o.noReact) applyElement(e, o.elem, o.pw ?? 1);
  if (e.hp <= 0) { killEnemy(e, o); return d; }
  if (e.onHurt) e.onHurt(e);
  return d;
}

function breakWard(e) {
  FX.text(e.x, e.h + 1, e.z, 'WARD BROKEN', 'react');
  FX.ring(e.x, e.z, ASPECTS[e.ward.elem].color, 0.5, 4, 0.5);
  FX.burst(e.x, e.h * 0.5, e.z, { count: 24, color: ASPECTS[e.ward.elem].color, speed: 9, life: 0.5, size: 0.7 });
  A.sfx('shatter', 0.6);
  e.ward = null; if (e.wardMesh) { e.group.remove(e.wardMesh); e.wardMesh = null; }
  e.stun = Math.max(e.stun, 0.6);
}

function reactionText(e, txt, col) {
  FX.text(e.x, e.h + 1.1, e.z, txt, 'react');
  G.run.reactions++; G.run.score += 25 * comboMult();
}
export const comboMult = () => Math.min(4, 1 + Math.floor((G.run.combo || 0) / 6) * 0.25);

function shatter(e) {
  const S = P.stats; const R = 3 * S.reactR;
  reactionText(e, 'SHATTER!');
  A.sfx('shatter'); FX.shake(0.3); FX.hitstop(0.05);
  FX.ring(e.x, e.z, 0xbdf1ff, 0.5, R * 1.2, 0.4);
  FX.burst(e.x, e.h * 0.5, e.z, { count: 30, color: [0xbdf1ff, 0xffffff, 0x4fd8ff], speed: 12, life: 0.7, size: 0.7, gravity: 8 });
  for (const o of G.enemies) {
    if (o === e || o.dead || o.spawnT > 0) continue;
    if (dist(o.x, o.z, e.x, e.z) < R + o.r) hitEnemy(o, 30 * S.reactMul * playerDmgMul(), { elem: -1, noReact: true, kx: o.x - e.x, kz: o.z - e.z, kb: 4, dot: true, noStatus: true, noArmor: false }), addChill(o, 1);
  }
}
function addChill(e, n) {
  if (e.dead) return;
  e.chill = 3; e.chillN = (e.chillN || 0) + n;
  if (e.chillN >= P.stats.chillNeed && e.freeze <= 0 && !(e.freezeImm > 0)) {
    e.chillN = 0; e.chill = 0; e.freeze = e.boss ? 0.9 : e.elite ? 1.4 : 2.0; if (e.boss || e.elite) e.freezeImm = 4;
    FX.text(e.x, e.h + 1, e.z, 'FROZEN', 'e1'); A.sfx('freeze', 0.7);
    FX.burst(e.x, e.h * 0.5, e.z, { count: 16, color: 0xbdf1ff, speed: 5, life: 0.6, size: 0.6 });
  }
}
function applyElement(e, elem, pw) {
  if (e.dead) return;
  const S = P.stats, now = G.time;
  const canReact = !(e.reactCd > now);
  const R = (base) => base * S.reactR;
  if (elem === 0) {
    if (canReact && e.chill > 0) return steam(e);
    if (canReact && e.shock > 0) return overload(e);
    e.burn = 3 * S.burnDur; e.burnDps = 7 * playerDmgMul() * S.burnMul;
  } else if (elem === 1) {
    if (canReact && e.burn > 0) return steam(e);
    if (canReact && e.shock > 0) return superconduct(e);
    addChill(e, 1);
  } else {
    if (canReact && e.burn > 0) return overload(e);
    if (canReact && e.chill > 0) return superconduct(e);
    e.shock = 3;
    // arc to nearby
    let n = S.shockArcs, last = e; const hit = new Set([e]);
    while (n-- > 0) {
      const t = nearestEnemy(last.x, last.z, 7, (q) => !hit.has(q));
      if (!t) break;
      hit.add(t); FX.beam(last.x, 1.2, last.z, t.x, 1.2, t.z, 0xfff27a, 0.14, 0.14, 0.5);
      hitEnemy(t, 9 * playerDmgMul(), { elem: -1, dot: true, noStatus: true, noReact: true }); t.shock = 3; last = t;
    }
    if (hit.size > 1) A.sfx('zap', 0.4);
  }
}
function steam(e) {
  const S = P.stats, R = 3.6 * S.reactR; e.burn = 0; e.chill = 0; e.chillN = 0; e.reactCd = G.time + 0.4;
  reactionText(e, 'STEAM BURST'); A.sfx('steam'); FX.shake(0.25);
  FX.ring(e.x, e.z, 0xdff6ff, 0.5, R * 1.3, 0.5, 0.2); FX.flash(e.x, 2, e.z, 0xdff6ff, 30, 0.3);
  for (let i = 0; i < 26; i++) FX.emit(e.x + rand(-1, 1), rand(0.3, 1.5), e.z + rand(-1, 1), rand(-4, 4), rand(1, 5), rand(-4, 4), rand(0.6, 1.1), 1.3, 2.4, 0xdfeeff, 0, 2, 0.6);
  for (const o of G.enemies) if (!o.dead && o.spawnT <= 0 && dist(o.x, o.z, e.x, e.z) < R + o.r) {
    hitEnemy(o, 34 * S.reactMul * playerDmgMul(), { elem: -1, dot: true, noStatus: true, noReact: true, kx: o.x - e.x, kz: o.z - e.z, kb: 7, stun: 0.5 });
    if (o !== e) addChill(o, 1);
  }
}
function overload(e) {
  const S = P.stats, R = 4 * S.reactR; e.burn = 0; e.shock = 0; e.reactCd = G.time + 0.4;
  reactionText(e, 'OVERLOAD'); A.sfx('overload'); FX.shake(0.5); FX.hitstop(0.05);
  FX.ring(e.x, e.z, 0xffb050, 0.5, R * 1.3, 0.45, 0.2, 1, false, 1.4); FX.flash(e.x, 2, e.z, 0xffd070, 60, 0.35);
  FX.burst(e.x, 1, e.z, { count: 36, color: [0xffe94a, 0xff8030, 0xffffff], speed: 14, life: 0.6, size: 0.8, gravity: 5 });
  let n = 0;
  for (const o of G.enemies) if (!o.dead && o.spawnT <= 0 && dist(o.x, o.z, e.x, e.z) < R + o.r) {
    hitEnemy(o, 52 * S.reactMul * playerDmgMul(), { elem: -1, dot: true, noStatus: true, noReact: true, kx: o.x - e.x, kz: o.z - e.z, kb: 12, stun: 0.6 });
    if (o !== e && n++ < 3) FX.beam(e.x, 1.2, e.z, o.x, 1.2, o.z, 0xfff27a, 0.18, 0.2, 0.8);
  }
}
function superconduct(e) {
  const S = P.stats, R = 3.4 * S.reactR; e.chill = 0; e.chillN = 0; e.shock = 0; e.reactCd = G.time + 0.4;
  reactionText(e, 'SUPERCONDUCT'); A.sfx('superconduct');
  FX.ring(e.x, e.z, 0xa0f0ff, 0.5, R * 1.2, 0.5, 0.2); FX.ring(e.x, e.z, 0xfff27a, 0.3, R, 0.4, 0.3);
  for (const o of G.enemies) if (!o.dead && o.spawnT <= 0 && dist(o.x, o.z, e.x, e.z) < R + o.r) {
    o.vuln = 6; hitEnemy(o, 22 * S.reactMul * playerDmgMul(), { elem: -1, dot: true, noStatus: true, noReact: true });
    FX.burst(o.x, o.h + 0.5, o.z, { count: 6, color: 0xa0f0ff, speed: 2, up: 3, life: 0.8, size: 0.5 });
  }
}

export function tickStatus(e, dt) {
  const S = P.stats;
  if (e.freezeImm > 0) e.freezeImm -= dt;
  if (e.burn > 0) {
    e.burn -= dt; e.burnTick = (e.burnTick || 0) - dt;
    if (Math.random() < dt * 30) FX.emit(e.x + rand(-0.4, 0.4), rand(0.3, e.h), e.z + rand(-0.4, 0.4), rand(-0.3, 0.3), rand(2, 4), rand(-0.3, 0.3), 0.5, 0.55, 0, pick([0xff7a2a, 0xffc060]), 0, 1);
    if (e.burnTick <= 0) { e.burnTick = 0.5; hitEnemy(e, e.burnDps * 0.5, { dot: true, elem: -1 }); }
  }
  if (e.chill > 0) { e.chill -= dt; if (e.chill <= 0) e.chillN = 0; if (Math.random() < dt * 8) FX.emit(e.x + rand(-0.4, 0.4), rand(0.3, e.h), e.z + rand(-0.4, 0.4), 0, -0.5, 0, 0.6, 0.4, 0, 0xbdf1ff); }
  if (e.shock > 0) { e.shock -= dt; if (Math.random() < dt * 10) FX.emit(e.x + rand(-0.5, 0.5), rand(0.3, e.h), e.z + rand(-0.5, 0.5), rand(-3, 3), rand(-1, 3), rand(-3, 3), 0.15, 0.35, 0, 0xfff27a, 0, 4); }
  if (e.vuln > 0) e.vuln -= dt;
  if (e.freeze > 0) { e.freeze -= dt; if (e.freeze <= 0 && e.iceMesh) e.iceMesh.visible = false; }
}

export function killEnemy(e, o = {}) {
  if (e.dead) return;
  e.dead = true; e.deadT = 0;
  const S = P.stats, run = G.run;
  run.kills++; run.combo++; run.comboT = 3.5;
  if (run.combo > run.bestCombo) run.bestCombo = run.combo;
  run.score += (e.score || 10) * comboMult();
  P.surge = Math.min(100, P.surge + 2 * S.surgeMul);
  const col = e.color || 0xffffff;
  FX.burst(e.x, e.h * 0.5, e.z, { count: e.boss ? 120 : e.elite ? 40 : 18, color: [col, 0xffffff, 0x333344], speed: e.boss ? 18 : 9, life: 0.8, size: e.boss ? 1.4 : 0.8, gravity: 6, up: 3 });
  FX.ring(e.x, e.z, col, 0.3, e.r * 2.2 + 1, 0.35);
  A.sfx('kill', e.boss ? 1 : 0.6);
  if (!o.dot) FX.hitstop(e.boss ? 0.25 : e.elite ? 0.1 : 0.03);
  FX.shake(e.boss ? 1.2 : e.elite ? 0.4 : 0.1);
  // drops
  const gold = Math.round((e.gold ?? 1) * S.gold + (chance(0.4) ? 1 : 0));
  dropPickups('gold', e.x, e.z, gold);
  if (chance(e.elite ? 0.5 : 0.07) && !e.boss) dropPickups('hp', e.x, e.z, 1);
  // boons on kill
  if (S.healKill) healPlayer(S.healKill);
  if (S.adren) { P.dashRec = Math.max(0, P.dashRec - 0.5 * S.adren); P.surge = Math.min(100, P.surge + 1.5 * S.adren); }
  if (S.killBlast && !o.chainBlast) explode(e.x, e.z, 3 + S.killBlast * 0.6, (14 + 8 * S.killBlast) * playerDmgMul(), P.aspect, { chainBlast: true, small: true });
  if (e.onDeath) e.onDeath(e, o);
}

// ===================================================================== AoE helpers
export function explode(x, z, r, dmg, elem, o = {}) {
  const col = elem >= 0 ? ASPECTS[elem].color : 0xffffff;
  FX.ring(x, z, col, 0.5, r * 1.1, o.small ? 0.3 : 0.45, 0.15, 1, false, 1.2);
  FX.ring(x, z, 0xffffff, 0.2, r * 0.8, 0.25, 0.2, 0.8, true);
  FX.burst(x, 0.6, z, { count: o.small ? 14 : 34, color: [col, 0xffffff], speed: r * 3, life: 0.5, size: 0.8, gravity: 4 });
  FX.flash(x, 2, z, col, o.small ? 20 : 45, 0.3);
  A.sfx(o.small ? 'hit' : 'boom', o.small ? 0.5 : 0.8);
  if (!o.small) FX.shake(0.35);
  let n = 0;
  for (const e of G.enemies) {
    if (e.dead || e.spawnT > 0) continue;
    const d = dist(x, z, e.x, e.z);
    if (d < r + e.r) {
      const f = 1 - clamp(d / (r + e.r), 0, 1) * 0.4;
      hitEnemy(e, dmg * f, { elem, canCrit: !o.noCrit, kx: e.x - x, kz: e.z - z, kb: o.kb ?? 9, stun: o.stun ?? 0.25, chainBlast: o.chainBlast });
      n++;
    }
  }
  return n;
}

// ===================================================================== projectiles (player)
const projGeo = {};
export function fireProj(kind, x, z, a, o) {
  const col = ASPECTS[o.elem ?? P.aspect].color;
  let mesh;
  if (kind === 'fire') { mesh = new THREE.Mesh(G3.ico(0.45, 1), glowMat(col, 4)); }
  else if (kind === 'lance') { mesh = new THREE.Mesh(G3.cone(0.2, 1.6, 4), glowMat(col, 4)); mesh.rotation.x = Math.PI / 2; const g = new THREE.Group(); g.add(mesh); mesh = g; }
  else if (kind === 'blade') { mesh = new THREE.Mesh(G3.box(0.12, 0.1, 1.6), glowMat(col, 4)); const g = new THREE.Group(); g.add(mesh); mesh = g; }
  else if (kind === 'wave') { mesh = new THREE.Mesh(new THREE.RingGeometry(0.8, 1, 24, 1, -0.9, 1.8).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.9, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, toneMapped: false, depthWrite: false })); const g = new THREE.Group(); g.add(mesh); mesh = g; mesh.scale.setScalar(2.2); }
  mesh.position.set(x, 1.1, z); mesh.rotation.y = yaw(a); scene.add(mesh);
  const p = { kind, x, z, a, vx: Math.cos(a) * o.speed, vz: Math.sin(a) * o.speed, speed: o.speed, r: o.r ?? 0.6, dmg: o.dmg, elem: o.elem ?? P.aspect, life: o.life ?? 1.2, pierce: o.pierce ?? 0, mesh, hit: new Set(), col, boom: o.boom };
  G.projs.push(p); return p;
}
function updateProjs(dt) {
  for (let i = G.projs.length - 1; i >= 0; i--) {
    const p = G.projs[i];
    p.life -= dt; p.x += p.vx * dt; p.z += p.vz * dt;
    p.mesh.position.set(p.x, 1.1, p.z);
    if (p.kind === 'fire') { FX.trail(p.x, 1.1, p.z, pick([0xff7a2a, 0xffc060]), 0.7, 0.4); p.mesh.rotation.y += dt * 8; }
    else if (p.kind === 'wave') p.mesh.scale.setScalar(p.mesh.scale.x + dt * 5);
    else FX.trail(p.x, 1.1, p.z, p.col, 0.4, 0.25);
    let dead = p.life <= 0 || (p.kind !== 'wave' && hitsObstacle(p.x, p.z, 0.2));
    if (!dead) for (const e of G.enemies) {
      if (e.dead || e.spawnT > 0 || p.hit.has(e)) continue;
      const rad = p.kind === 'wave' ? p.mesh.scale.x : p.r;
      if (dist(p.x, p.z, e.x, e.z) < e.r + rad) {
        p.hit.add(e);
        if (p.kind === 'fire') { dead = true; break; }
        hitEnemy(e, p.dmg, { elem: p.elem, canCrit: true, kx: p.vx, kz: p.vz, kb: 5, stun: 0.12 });
        A.sfx(p.kind === 'lance' ? 'ice' : 'hit', 0.4);
        if (p.pierce-- <= 0) { dead = true; break; }
      }
    }
    if (dead) {
      if (p.kind === 'fire') { explode(p.x, p.z, 3.8 * P.stats.aoe, p.dmg, p.elem, { kb: 10, stun: 0.3 }); }
      else if (p.kind === 'lance') { FX.burst(p.x, 1, p.z, { count: 8, color: p.col, speed: 5, life: 0.3, size: 0.5 }); }
      scene.remove(p.mesh); p.mesh.traverse((m) => { if (m.isMesh) { m.material.dispose(); if (p.kind === 'wave') m.geometry.dispose(); } });
      G.projs.splice(i, 1);
    }
  }
}

// ===================================================================== enemy projectiles
const eShotGeo = new THREE.IcosahedronGeometry(0.35, 1);
export function enemyShot(x, z, a, speed, dmg, color = 0xff4060, o = {}) {
  const m = new THREE.Mesh(eShotGeo, glowMat(color, 4)); m.position.set(x, o.y ?? 1.2, z); m.scale.setScalar(o.size ?? 1); scene.add(m);
  const s = { x, z, vx: Math.cos(a) * speed, vz: Math.sin(a) * speed, dmg, r: 0.45 * (o.size ?? 1), life: o.life ?? 5, mesh: m, color, homing: o.homing || 0, y: o.y ?? 1.2 };
  G.eprojs.push(s); A.sfx('shoot', 0.3); return s;
}
function updateEProjs(dt) {
  for (let i = G.eprojs.length - 1; i >= 0; i--) {
    const s = G.eprojs[i];
    s.life -= dt;
    if (s.homing) { const a = Math.atan2(s.vz, s.vx), t = Math.atan2(P.z - s.z, P.x - s.x), sp = Math.hypot(s.vx, s.vz), na = a + clamp(angDiff(a, t), -s.homing * dt, s.homing * dt); s.vx = Math.cos(na) * sp; s.vz = Math.sin(na) * sp; }
    const ts = G.enemyTime || 1;
    s.x += s.vx * dt * ts; s.z += s.vz * dt * ts;
    s.mesh.position.set(s.x, s.y, s.z);
    FX.trail(s.x, s.y, s.z, s.color, 0.5, 0.3);
    let dead = s.life <= 0 || hitsObstacle(s.x, s.z, 0.1);
    if (!dead && dist(s.x, s.z, P.x, P.z) < s.r + 0.55) { if (hurtPlayer(s.dmg, s.x, s.z)) dead = true; else if (P.dashT > 0) dead = false; }
    if (dead) { FX.burst(s.x, s.y, s.z, { count: 8, color: s.color, speed: 4, life: 0.3, size: 0.5 }); scene.remove(s.mesh); s.mesh.material.dispose(); G.eprojs.splice(i, 1); }
  }
}

// ===================================================================== hazards (telegraphed zones etc.)
const discG = new THREE.CircleGeometry(1, 40).rotateX(-Math.PI / 2), ringG = new THREE.RingGeometry(0.93, 1, 48).rotateX(-Math.PI / 2);
const bmat = (c, o = 0.4) => new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: o, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false, side: THREE.DoubleSide });

export function telegraph(x, z, r, dur, dmg, o = {}) {
  const col = o.color ?? 0xff2a3a;
  const fill = new THREE.Mesh(discG, bmat(col, 0.28)), rim = new THREE.Mesh(ringG, bmat(col, 0.9));
  fill.position.set(x, 0.1, z); rim.position.set(x, 0.11, z); rim.scale.set(r, 1, r); fill.scale.set(0.01, 1, 0.01);
  scene.add(fill, rim);
  const h = { kind: 'circle', x, z, r, t: 0, dur, dmg, o, fill, rim, col };
  G.hazards.push(h); if (!o.silent) A.sfx('warn', 0.35); return h;
}
export function waveRing(x, z, speed, maxR, dmg, col = 0xff5030) {
  const m = new THREE.Mesh(new THREE.RingGeometry(0.94, 1, 64).rotateX(-Math.PI / 2), bmat(col, 0.95)); m.position.set(x, 0.25, z); scene.add(m);
  G.hazards.push({ kind: 'wave', x, z, speed, maxR, dmg, r: 0.1, mesh: m, col, hit: false, t: 0 });
}
export function beamHazard(x, z, a, len, width, tele, active, sweep, dmg, col = 0xff3a5a, follow) {
  const g = new THREE.Mesh(new THREE.BoxGeometry(1, 0.1, 1), bmat(col, 0.5)); g.position.y = 0.3; scene.add(g);
  const h = { kind: 'beam', x, z, a, len, width, tele, active, sweep, dmg, t: 0, mesh: g, col, follow, tick: 0 };
  G.hazards.push(h); A.sfx('warn', 0.5); return h;
}
export function patch(x, z, r, life, dps, elem, col) {
  const m = new THREE.Mesh(discG, bmat(col ?? ASPECTS[elem].color, 0.35)); m.position.set(x, 0.08, z); m.scale.set(r, 1, r); scene.add(m);
  G.hazards.push({ kind: 'patch', x, z, r, life, dps, elem, mesh: m, tick: 0, t: 0 });
}
function removeHazard(i) {
  const h = G.hazards[i];
  for (const k of ['fill', 'rim', 'mesh']) if (h[k]) { scene.remove(h[k]); h[k].material.dispose(); if (h.kind === 'wave' || h.kind === 'beam') h[k].geometry.dispose(); }
  G.hazards.splice(i, 1);
}
export function clearHazards() { while (G.hazards.length) removeHazard(G.hazards.length - 1); }

function updateHazards(dt) {
  const et = G.enemyTime || 1;
  for (let i = G.hazards.length - 1; i >= 0; i--) {
    const h = G.hazards[i]; h.t += dt;
    if (h.kind === 'circle') {
      const k = h.t / h.dur;
      h.fill.scale.set(Math.max(0.01, h.r * k), 1, Math.max(0.01, h.r * k));
      h.rim.material.opacity = 0.5 + 0.5 * Math.sin(h.t * 20) * (k > 0.7 ? 1 : 0.2) ;
      if (h.t >= h.dur) {
        const o = h.o;
        if (!o.quiet) {
          FX.ring(h.x, h.z, h.col, 0.5, h.r * 1.15, 0.4, 0.2, 1, false, 1.5); FX.ring(h.x, h.z, 0xffffff, 0.2, h.r * 0.8, 0.25, 0.25, 0.7, true);
          FX.burst(h.x, 0.5, h.z, { count: 26, color: [h.col, 0xffffff], speed: h.r * 3, life: 0.6, size: 0.9, gravity: 6, up: 4 });
          FX.flash(h.x, 2, h.z, h.col, 40, 0.3); A.sfx(o.sfx || 'slam', 0.8);
          FX.shake(0.2 + Math.min(0.5, h.r * 0.05));
        }
        if (h.dmg > 0 && dist(h.x, h.z, P.x, P.z) < h.r + 0.3) hurtPlayer(h.dmg, h.x, h.z, o.hurt);
        if (o.hurtsEnemies) for (const e of G.enemies) if (!e.dead && e.spawnT <= 0 && dist(h.x, h.z, e.x, e.z) < h.r + e.r) hitEnemy(e, o.enemyDmg ?? 40, { dot: true, elem: o.elem ?? -1, kx: e.x - h.x, kz: e.z - h.z, kb: 10, stun: 0.4 });
        if (o.onFire) o.onFire(h);
        removeHazard(i);
      }
    } else if (h.kind === 'wave') {
      h.r += h.speed * dt * et; h.mesh.scale.set(h.r, 1, h.r); h.mesh.material.opacity = 0.95 * (1 - h.r / h.maxR);
      if (!h.hit && Math.abs(dist(h.x, h.z, P.x, P.z) - h.r) < 0.9) { if (hurtPlayer(h.dmg, h.x, h.z)) h.hit = true; }
      if (h.r >= h.maxR) removeHazard(i);
    } else if (h.kind === 'beam') {
      if (h.follow) h.follow(h);
      const tele = h.t < h.tele, k = tele ? h.t / h.tele : (h.t - h.tele) / h.active;
      if (!tele) h.a += (h.sweep / h.active) * dt * et;
      const w = tele ? h.width * 0.15 : h.width;
      h.mesh.scale.set(h.len, 1, w); h.mesh.rotation.y = -h.a;
      h.mesh.position.set(h.x + Math.cos(h.a) * h.len / 2, 0.4, h.z + Math.sin(h.a) * h.len / 2);
      h.mesh.material.opacity = tele ? 0.35 + 0.3 * Math.sin(h.t * 30) : 0.9;
      h.mesh.material.color.set(tele ? h.col : 0xffffff);
      if (!tele) {
        FX.emit(h.x + Math.cos(h.a) * rand(0, h.len), 0.6, h.z + Math.sin(h.a) * rand(0, h.len), rand(-2, 2), rand(1, 4), rand(-2, 2), 0.4, 0.8, 0, h.col, 0, 1);
        h.tick -= dt;
        // point-line distance
        const dx = P.x - h.x, dz = P.z - h.z, t = clamp(dx * Math.cos(h.a) + dz * Math.sin(h.a), 0, h.len);
        const d = Math.hypot(dx - Math.cos(h.a) * t, dz - Math.sin(h.a) * t);
        if (d < w / 2 + 0.45 && h.tick <= 0) { if (hurtPlayer(h.dmg, h.x, h.z)) h.tick = 0.3; }
      }
      if (h.t >= h.tele + h.active) removeHazard(i);
    } else if (h.kind === 'patch') {
      h.life -= dt; h.tick -= dt;
      h.mesh.material.opacity = 0.2 + 0.2 * Math.sin(h.t * 8) * (h.life < 0.6 ? h.life / 0.6 : 1);
      if (Math.random() < dt * 14) FX.emit(h.x + rand(-h.r, h.r) * 0.8, 0.2, h.z + rand(-h.r, h.r) * 0.8, 0, rand(1.5, 3), 0, 0.5, 0.6, 0, ASPECTS[h.elem].color);
      if (h.tick <= 0) { h.tick = 0.4; for (const e of G.enemies) if (!e.dead && e.spawnT <= 0 && dist(h.x, h.z, e.x, e.z) < h.r + e.r) hitEnemy(e, h.dps * 0.4, { elem: h.elem, dot: true, noReact: false, pw: 0.5 }); }
      if (h.life <= 0) removeHazard(i);
    }
  }
}

// ===================================================================== singularity wells
const wellGeo = new THREE.TorusGeometry(1, 0.06, 6, 48).rotateX(Math.PI / 2);
function castWell() {
  const S = P.stats;
  const dx = G.input.aim.x - P.x, dz = G.input.aim.z - P.z, d = Math.min(Math.hypot(dx, dz), 15), a = Math.atan2(dz, dx);
  const w = { x: P.x + Math.cos(a) * d, z: P.z + Math.sin(a) * d, t: 0, dur: 3.2, r: 6.5 * S.wellR * S.aoe, mini: false };
  spawnWell(w); P.wellCd = 10 * (1 - Math.min(0.7, S.cdr)); A.sfx('well'); FX.shake(0.2);
}
function spawnWell(w) {
  const g = new THREE.Group();
  const core = new THREE.Mesh(G3.ico(0.9, 1), new THREE.MeshBasicMaterial({ color: 0x000000 })); g.add(core);
  const halo = new THREE.Mesh(G3.ico(1.1, 1), bmat(aspectColor(), 0.5)); halo.scale.setScalar(1.15); g.add(halo);
  const r1 = new THREE.Mesh(wellGeo, bmat(0xffffff, 0.8)), r2 = new THREE.Mesh(wellGeo, bmat(aspectColor(), 0.8));
  g.add(r1, r2); g.position.set(w.x, 1.4, w.z); scene.add(g);
  const area = new THREE.Mesh(ringG, bmat(aspectColor(), 0.5)); area.position.set(w.x, 0.1, w.z); area.scale.set(w.r, 1, w.r); scene.add(area);
  Object.assign(w, { g, core, halo, r1, r2, area, elem: P.aspect });
  G.wells.push(w);
}
function updateWells(dt) {
  for (let i = G.wells.length - 1; i >= 0; i--) {
    const w = G.wells[i]; w.t += dt;
    const k = w.t / w.dur, grow = Math.min(1, w.t * 4);
    w.g.scale.setScalar((w.mini ? 0.6 : 1) * (grow * (1 + k * 0.6)));
    w.r1.rotation.z += dt * 6; w.r2.rotation.x += dt * 4; w.r1.scale.setScalar(2.2 + Math.sin(w.t * 8) * 0.2); w.r2.scale.setScalar(3 + Math.sin(w.t * 6) * 0.3);
    w.area.scale.set(w.r * (1 - k * 0.3), 1, w.r * (1 - k * 0.3)); w.area.material.opacity = 0.2 + 0.3 * k;
    // swirl particles
    for (let j = 0; j < 2; j++) { const a = rand(TAU), rr = w.r * rand(0.4, 1); FX.emit(w.x + Math.cos(a) * rr, 0.4 + rand(1.5), w.z + Math.sin(a) * rr, -Math.cos(a) * 9 - Math.sin(a) * 4, 1, -Math.sin(a) * 9 + Math.cos(a) * 4, rr / 10, 0.5, 0, ASPECTS[w.elem].color, 0, 0); }
    for (const e of G.enemies) {
      if (e.dead || e.spawnT > 0) continue;
      const dx = w.x - e.x, dz = w.z - e.z, d = Math.hypot(dx, dz);
      if (d < w.r + e.r && d > 0.5) {
        const pull = (e.boss ? 3 : e.elite ? 9 : 15) * (1 - d / (w.r + 2) * 0.4) / (e.mass || 1);
        e.kx += dx / d * pull * dt * 6; e.kz += dz / d * pull * dt * 6;
        e.pulled = 0.2;
      }
    }
    w.tick = (w.tick || 0) - dt;
    if (w.tick <= 0) { w.tick = 0.4; for (const e of G.enemies) if (!e.dead && e.spawnT <= 0 && dist(w.x, w.z, e.x, e.z) < w.r) hitEnemy(e, 5 * playerDmgMul(), { dot: true, elem: -1 }); }
    if (w.t >= w.dur) {
      const S = P.stats;
      explode(w.x, w.z, w.r * 0.85, 75 * playerDmgMul() * S.wellDmg * (w.mini ? 0.5 : 1), P.aspect, { kb: 6, stun: 0.5 });
      FX.shake(0.5); FX.hitstop(0.06); A.sfx('bigboom', 0.7);
      if (P.aspect === 0) patch(w.x, w.z, w.r * 0.5, 3, 12 * playerDmgMul(), 0);
      if (S.wellLinger && !w.mini) { spawnWell({ x: w.x, z: w.z, t: 0, dur: 2.2, r: w.r * 0.7, mini: true }); }
      scene.remove(w.g, w.area); w.area.material.dispose(); w.g.traverse((m) => m.isMesh && m.material.dispose());
      G.wells.splice(i, 1);
    }
  }
}
export function clearWells() { for (const w of G.wells) { scene.remove(w.g, w.area); w.area.material.dispose(); w.g.traverse((m) => { if (m.isMesh) m.material.dispose(); }); } G.wells.length = 0; }

// ===================================================================== pickups
const goldGeo = new THREE.OctahedronGeometry(0.22, 0), goldMat = glowMat(0xffc83a, 2.5), hpMat = glowMat(0x55ff88, 2.5);
export function dropPickups(kind, x, z, n = 1, o = {}) {
  for (let i = 0; i < n; i++) {
    let mesh;
    if (kind === 'gold') mesh = new THREE.Mesh(goldGeo, goldMat);
    else if (kind === 'hp') { mesh = new THREE.Mesh(G3.oct(0.35, 0), hpMat); }
    else if (kind === 'reward') {
      mesh = new THREE.Group(); const c = new THREE.Mesh(G3.oct(0.7, 0), glowMat(o.color ?? 0xffffff, 3)); c.scale.y = 1.5; mesh.add(c);
      const r = new THREE.Mesh(G3.tor(1.1, 0.05, 6, 32), glowMat(o.color ?? 0xffffff, 3)); mesh.add(r); mesh.userData.r = r; mesh.userData.c = c;
    }
    mesh.position.set(x, 0.5, z); scene.add(mesh);
    const a = rand(TAU), s = kind === 'reward' ? 0 : rand(3, 7);
    G.pickups.push({ kind, x, z, y: 0.6, vx: Math.cos(a) * s, vz: Math.sin(a) * s, vy: kind === 'reward' ? 0 : rand(5, 9), mesh, t: 0, val: o.val ?? 1, o });
  }
}
function updatePickups(dt) {
  const S = P.stats;
  for (let i = G.pickups.length - 1; i >= 0; i--) {
    const p = G.pickups[i]; p.t += dt;
    const d = dist(p.x, p.z, P.x, P.z);
    if (p.kind === 'reward') {
      p.mesh.position.set(p.x, 1.4 + Math.sin(p.t * 2) * 0.25, p.z); p.mesh.userData.r.rotation.x += dt * 2; p.mesh.userData.r.rotation.y += dt * 1.3; p.mesh.userData.c.rotation.y += dt * 2;
      if (Math.random() < dt * 30) FX.emit(p.x + rand(-1, 1), rand(0.2, 2.5), p.z + rand(-1, 1), 0, rand(1, 2), 0, 1, 0.5, 0, p.o.color ?? 0xffffff);
      if (d < 2) { p.o.onCollect && p.o.onCollect(p); disposePickup(p); G.pickups.splice(i, 1); }
      continue;
    }
    if (p.vy !== 0 || p.y > 0.6) {
      p.vy -= 22 * dt; p.y += p.vy * dt;
      if (p.y < 0.5) { p.y = 0.5; p.vy = 0; p.vx *= 0.3; p.vz *= 0.3; }
      p.x += p.vx * dt; p.z += p.vz * dt; p.vx *= 1 - dt * 2; p.vz *= 1 - dt * 2;
    }
    const mag = p.t > 0.5 && d < S.pickup;
    if (mag) { const s = 18 + (S.pickup - d) * 2; p.x += (P.x - p.x) / d * s * dt; p.z += (P.z - p.z) / d * s * dt; p.y = lerp(p.y, 1, dt * 5); }
    p.mesh.position.set(p.x, p.y + (p.vy === 0 && !mag ? Math.sin(p.t * 4 + i) * 0.1 : 0), p.z); p.mesh.rotation.y += dt * 4;
    if (d < 1.0 && p.t > 0.25) {
      if (p.kind === 'gold') { G.run.gold += 1; G.run.goldTotal++; A.sfx('coin', 0.4, 1 + Math.min(0.5, (G.run.coinStreak = (G.run.coinStreak || 0) + 1) * 0.02)); }
      else if (p.kind === 'hp') healPlayer(12);
      scene.remove(p.mesh); G.pickups.splice(i, 1);
    }
  }
}
function disposePickup(p) { scene.remove(p.mesh); if (p.kind === 'reward') p.mesh.traverse((m) => { if (m.isMesh) m.material.dispose(); }); }
export function clearPickups() { for (const p of G.pickups) disposePickup(p); G.pickups.length = 0; }

// ===================================================================== player update
function swapAspect(n) {
  if (n === P.aspect) return;
  const S = P.stats, old = P.aspect; P.aspect = n;
  const c = ASPECTS[n].color; setPlayerColor(P.parts, c);
  P.halo.material.color.set(c); P.swapFlash = 0.3;
  FX.ring(P.x, P.z, c, 0.5, 3, 0.4); FX.burst(P.x, 1.2, P.z, { count: 14, color: c, speed: 5, life: 0.5, size: 0.5 }); A.sfx('card', 0.6, 1 + n * 0.25);
  if (S.trinity) {
    P.trinityT = 3; explode(P.x, P.z, 5.5, 26 * playerDmgMul(), n, { small: true, kb: 7, stun: 0.3 });
    FX.ring(P.x, P.z, c, 0.5, 6, 0.5, 0.2, 1, false, 1.5);
  }
  G.ui && G.ui.aspectChanged && G.ui.aspectChanged(n);
}

function doAttack() {
  const S = P.stats, asp = ASPECTS[P.aspect];
  const finisher = P.combo === 2;
  // aim + soft auto-target
  let a = Math.atan2(G.input.aim.z - P.z, G.input.aim.x - P.x);
  let best = null, bd = 99;
  for (const e of G.enemies) { if (e.dead || e.spawnT > 0) continue; const d = dist(P.x, P.z, e.x, e.z); if (d < 5.5 && Math.abs(angDiff(a, Math.atan2(e.z - P.z, e.x - P.x))) < 0.55 && d < bd) { bd = d; best = e; } }
  if (best) a = lerpAng(a, Math.atan2(best.z - P.z, best.x - P.x), 0.6);
  P.face = a;
  const range = (finisher ? 4.8 : 3.8) * S.range * S.aoe, arc = (finisher ? 4.0 : 2.1) * S.arc;
  const dmg = 24 * playerDmgMul() * (finisher ? 1.7 : 1);
  const dur = (finisher ? 0.34 : 0.22) / S.aspd;
  P.swing = { t: 0, dur, dir: P.combo % 2 ? -1 : 1, fin: finisher, hit: false, a, range, arc, dmg };
  P.atkCd = (finisher ? 0.46 : 0.3) / S.aspd; P.comboT = 0.75;
  P.lunge = 0.1; P.lunge0 = 0.1; P.lungeA = a;
  P.combo = (P.combo + 1) % 3;
  FX.slash(P.x + Math.cos(a) * 0.4, P.z + Math.sin(a) * 0.4, a, range, Math.min(arc, 6.2), asp.color, finisher ? 0.3 : 0.2, finisher ? 0.15 : 0.5);
  A.sfx(finisher ? 'slash3' : 'slash', 0.7, 1 + P.aspect * 0.12);
  if (S.mirror) fireProj('blade', P.x, P.z, a, { speed: 26, dmg: dmg * 0.6, pierce: 99, life: 0.7, r: 0.9 });
}
function resolveSwing() {
  const sw = P.swing, S = P.stats; sw.hit = true;
  let hits = 0;
  for (const e of G.enemies) {
    if (e.dead || e.spawnT > 0) continue;
    const dx = e.x - P.x, dz = e.z - P.z, d = Math.hypot(dx, dz);
    if (d > sw.range + e.r * 0.6) continue;
    if (Math.abs(angDiff(sw.a, Math.atan2(dz, dx))) > sw.arc / 2 && d > e.r + 0.8) continue;
    hits++;
    hitEnemy(e, sw.dmg, { elem: P.aspect, canCrit: true, kx: dx, kz: dz, kb: sw.fin ? 14 : 6, stun: sw.fin ? 0.35 : 0.1, pw: sw.fin ? 1.5 : 1 });
  }
  // parry enemy projectiles
  for (let i = G.eprojs.length - 1; i >= 0; i--) {
    const s = G.eprojs[i], dx = s.x - P.x, dz = s.z - P.z, d = Math.hypot(dx, dz);
    if (d < sw.range + 1 && Math.abs(angDiff(sw.a, Math.atan2(dz, dx))) < sw.arc / 2 + 0.3) {
      FX.burst(s.x, 1.2, s.z, { count: 10, color: [s.color, 0xffffff], speed: 8, life: 0.4, size: 0.6 }); FX.text(s.x, 2, s.z, 'PARRY', 'dodge');
      P.surge = Math.min(100, P.surge + 2 * S.surgeMul); A.sfx('crit', 0.5);
      scene.remove(s.mesh); s.mesh.material.dispose(); G.eprojs.splice(i, 1);
    }
  }
  if (hits) { FX.hitstop(sw.fin ? 0.07 : 0.035); FX.shake(sw.fin ? 0.4 : 0.14); }
  if (sw.fin && S.shockwave) fireProj('wave', P.x, P.z, sw.a, { speed: 20, dmg: sw.dmg * 0.55, pierce: 99, life: 0.55, r: 1 });
}

function castSkill() {
  const S = P.stats, asp = P.aspect;
  const a = Math.atan2(G.input.aim.z - P.z, G.input.aim.x - P.x);
  P.face = a;
  const go = (mul) => {
    const dmg = playerDmgMul() * mul;
    if (asp === 0) { fireProj('fire', P.x + Math.cos(a) * 1.2, P.z + Math.sin(a) * 1.2, a, { speed: 26, dmg: 42 * dmg, r: 0.7, life: 1.3 }); A.sfx('fire'); FX.burst(P.x + Math.cos(a), 1.2, P.z + Math.sin(a), { count: 10, color: 0xff8030, speed: 5, life: 0.3, size: 0.6 }); }
    else if (asp === 1) { for (let i = -2; i <= 2; i++) fireProj('lance', P.x + Math.cos(a) * 1, P.z + Math.sin(a) * 1, a + i * 0.16, { speed: 34, dmg: 17 * dmg, pierce: 4, life: 0.75, r: 0.5 }); A.sfx('ice'); }
    else {
      A.sfx('zap');
      let t = null, bd = 99;
      for (const e of G.enemies) { if (e.dead || e.spawnT > 0) continue; const d = dist(P.x, P.z, e.x, e.z); const df = Math.abs(angDiff(a, Math.atan2(e.z - P.z, e.x - P.x))); if (d < 18 && df < 0.7 && d + df * 6 < bd) { bd = d + df * 6; t = e; } }
      if (!t) { FX.beam(P.x, 1.4, P.z, P.x + Math.cos(a) * 12, 1.2, P.z + Math.sin(a) * 12, 0xfff27a, 0.2, 0.2); return; }
      let last = { x: P.x, z: P.z }, cur = t, n = 4 + S.shockArcs; const hit = new Set(); let delay = 0;
      while (cur && n-- > 0) {
        hit.add(cur); const from = last, tgt = cur, dd = delay;
        setTimeout(() => { if (G.state !== 'play') return; FX.beam(from.x, 1.4, from.z, tgt.x, 1.2, tgt.z, 0xfff27a, 0.22, 0.25, 0.9); FX.flash(tgt.x, 1.5, tgt.z, 0xfff27a, 14, 0.15); if (!tgt.dead) hitEnemy(tgt, 26 * dmg, { elem: 2, canCrit: true, kx: tgt.x - from.x, kz: tgt.z - from.z, kb: 4, stun: 0.2 }); }, dd);
        last = cur; cur = nearestEnemy(cur.x, cur.z, 9, (q) => !hit.has(q)); delay += 70;
      }
    }
  };
  go(1);
  if (S.echo) setTimeout(() => G.state === 'play' && P.alive && go(0.6), 260);
  P.skillCd = (asp === 2 ? 2.2 : 2.8) * (1 - Math.min(0.7, S.cdr));
  P.castT = 0.2;
}

function castUlt() {
  const S = P.stats; P.surge = 0; P.ultInv = 1.2; const c = aspectColor();
  const run = (mul, delay) => {
    setTimeout(() => {
      if (G.state !== 'play') return;
      const R = 17 * S.aoe;
      FX.ring(P.x, P.z, c, 1, R, 0.7, 0.2, 1, false, 2.2); FX.ring(P.x, P.z, 0xffffff, 1, R * 0.8, 0.5, 0.25, 0.8, true);
      FX.ring(P.x, P.z, c, 0.5, R * 0.6, 0.5, 0.3, 1, false, 1.5);
      FX.flash(P.x, 3, P.z, c, 90, 0.6, 30); FX.shake(1.1); A.sfx('ult', 1);
      FX.burst(P.x, 1, P.z, { count: 120, color: [c, 0xffffff], speed: 26, life: 0.9, size: 1.1, gravity: 2, flat: 0, up: 2 });
      G.flashWhite = 0.7;
      for (const e of G.enemies) {
        if (e.dead || e.spawnT > 0) continue;
        const d = dist(P.x, P.z, e.x, e.z); if (d > R + e.r) continue;
        setTimeout(() => {
          if (e.dead) return;
          if (P.aspect === 1) { e.chillN = 5; addChill(e, 1); }
          if (P.aspect === 2) FX.beam(P.x, 1.4, P.z, e.x, 1.2, e.z, 0xfff27a, 0.25, 0.3, 1);
          hitEnemy(e, 110 * playerDmgMul() * S.ultMul * mul, { elem: P.aspect, canCrit: true, kx: e.x - P.x, kz: e.z - P.z, kb: 16, stun: 0.8, pw: 2 });
          if (P.aspect === 0) { e.burn = 4 * S.burnDur; e.burnDps = 10 * playerDmgMul() * S.burnMul; }
        }, d * 12);
      }
    }, delay);
  };
  run(1, 0);
  if (S.supernova) run(0.7, 700);
  G.timeScale = 0.25; setTimeout(() => (G.timeScale = 1), 220);
}

export function updatePlayer(dt) {
  const S = P.stats, inp = G.input, K = inp.keys;
  if (!P.alive) return;
  // cooldowns
  const cdT = dt * (1 + (S.timelord ? 0.25 : 0)); // (cdr bonus already applied at cast)
  P.atkCd -= dt; P.skillCd -= cdT; P.wellCd -= cdT; P.inv -= dt; P.hurtT -= dt; P.trinityT -= dt; P.ultInv -= dt; P.castT -= dt; P.swapFlash -= dt;
  if (P.comboT > 0) { P.comboT -= dt; if (P.comboT <= 0) P.combo = 0; }
  if (P.dashCharges < S.dashMax) { P.dashRec += dt * S.dashRate; if (P.dashRec >= 1.5) { P.dashRec = 0; P.dashCharges++; } } else P.dashRec = 0;
  // shield regen
  P.shieldT -= dt; if (P.shield < S.shield && P.shieldT <= 0) P.shield = Math.min(S.shield, P.shield + 14 * dt);
  // aspect swap
  for (let i = 0; i < 3; i++) if (inp.pressed[String(i + 1)]) swapAspect(i);
  if (inp.pressed.wheel) swapAspect((P.aspect + inp.pressed.wheel + 3) % 3);
  if (inp.pressed.tab) swapAspect((P.aspect + 1) % 3);
  // movement input
  let mx = (K.d || K.arrowright ? 1 : 0) - (K.a || K.arrowleft ? 1 : 0), mz = (K.s || K.arrowdown ? 1 : 0) - (K.w || K.arrowup ? 1 : 0);
  // camera is rotated 0 about Y, looking toward -z: W = -z
  const ml = Math.hypot(mx, mz); if (ml > 0) { mx /= ml; mz /= ml; }
  const aimA = Math.atan2(inp.aim.z - P.z, inp.aim.x - P.x);
  // dash
  if (inp.pressed.space && P.dashCharges >= 1 && P.dashT <= 0) {
    P.dashCharges--; P.dashT = 0.2; P.dashTotal = 0.2; P.inv = Math.max(P.inv, 0.05);
    P.dashDirX = ml > 0 ? mx : Math.cos(aimA); P.dashDirZ = ml > 0 ? mz : Math.sin(aimA);
    P.swing = null; A.sfx('dash', 0.8); FX.ring(P.x, P.z, aspectColor(), 0.3, 2.2, 0.3);
    FX.burst(P.x, 0.8, P.z, { count: 14, color: aspectColor(), speed: 6, life: 0.4, size: 0.6 });
    if (S.dashBolt) dashBolt();
    P.lastTrail = 0;
  }
  if (P.dashT > 0) {
    P.dashT -= dt;
    const sp = 42;
    const o = { x: P.x + P.dashDirX * sp * dt, z: P.z + P.dashDirZ * sp * dt }; collide(o, 0.6);
    P.x = o.x; P.z = o.z; P.vx = P.dashDirX * 8; P.vz = P.dashDirZ * 8;
    for (let i = 0; i < 3; i++) FX.emit(P.x + rand(-0.3, 0.3), rand(0.3, 1.8), P.z + rand(-0.3, 0.3), 0, 0, 0, 0.35, 0.8, 0, aspectColor(), 0, 3);
    P.lastTrail -= dt;
    if (S.dashFire && P.lastTrail <= 0) { P.lastTrail = 0.045; patch(P.x, P.z, 1.5, 2.5, 14 * playerDmgMul(), 0); }
    P.face = Math.atan2(P.dashDirZ, P.dashDirX);
    if (P.dashT <= 0) { P.inv = Math.max(P.inv, 0.12); if (S.dashFrost) { explode(P.x, P.z, 5, 14 * playerDmgMul(), 1, { small: true, kb: 4 }); FX.ring(P.x, P.z, 0x9fe8ff, 0.5, 5.5, 0.5, 0.2, 1, false, 1.5); } if (S.dashBolt) dashBolt(); }
  } else {
    const spd = 9.2 * S.move * (P.swing ? 0.8 : 1) * (P.castT > 0 ? 0.85 : 1);
    const tx = mx * spd, tz = mz * spd;
    const acc = ml > 0 ? 14 : 12;
    P.vx = damp(P.vx, tx, acc, dt); P.vz = damp(P.vz, tz, acc, dt);
    if (P.lunge > 0) { P.lunge -= dt; const k = 22; P.vx += Math.cos(P.lungeA) * k * dt * 6; P.vz += Math.sin(P.lungeA) * k * dt * 6; }
    P.x += P.vx * dt; P.z += P.vz * dt;
    collide(P, 0.6);
    // facing
    if (P.swing || inp.mouse.down || inp.mouse.right || P.castT > 0) P.face = P.swing ? P.face : aimA; else P.face = lerpAng(P.face, aimA, 1 - Math.exp(-14 * dt));
    // attack / skills
    if (inp.mouse.down && P.atkCd <= 0 && !P.swing) doAttack();
    if ((inp.mouse.right || inp.pressed.rmb) && P.skillCd <= 0) castSkill();
    if (inp.pressed.q && P.wellCd <= 0) castWell();
    if (inp.pressed.r && P.surge >= 100) castUlt();
  }
  // swing update
  if (P.swing) {
    P.swing.t += dt;
    if (!P.swing.hit && P.swing.t >= P.swing.dur * 0.25) resolveSwing();
    if (P.swing.t >= P.swing.dur) P.swing = null;
  }
  P.group.position.set(P.x, 0, P.z);
  animatePlayer(dt, Math.hypot(P.vx, P.vz));
  // orbiting blades
  if (S.orbit) orbitBlades(dt);
  // light + halo
  const L = G.lights.player; L.position.set(P.x, 3.5, P.z); L.color.set(aspectColor());
  P.halo.position.set(P.x, 0.07, P.z); P.halo.scale.setScalar(1 + Math.sin(G.time * 4) * 0.05);
  P.halo.material.opacity = 0.35 + (P.swapFlash > 0 ? P.swapFlash * 2 : 0);
  if (P.surge >= 100 && Math.random() < dt * 20) FX.emit(P.x + rand(-0.5, 0.5), 0.2, P.z + rand(-0.5, 0.5), 0, rand(2, 4), 0, 0.7, 0.5, 0, aspectColor());
  if (P.trinityT > 0 && Math.random() < dt * 25) FX.emit(P.x + rand(-0.6, 0.6), rand(0.2, 2), P.z + rand(-0.6, 0.6), 0, rand(1, 3), 0, 0.5, 0.4, 0, 0xffffff);
}

function dashBolt() {
  const near = G.enemies.filter((e) => !e.dead && e.spawnT <= 0 && dist(e.x, e.z, P.x, P.z) < 10).sort((a, b) => dist(a.x, a.z, P.x, P.z) - dist(b.x, b.z, P.x, P.z)).slice(0, 3);
  for (const e of near) { FX.beam(P.x, 1.3, P.z, e.x, 1.2, e.z, 0xfff27a, 0.2, 0.2, 0.8); hitEnemy(e, 22 * playerDmgMul(), { elem: 2, canCrit: true, kx: e.x - P.x, kz: e.z - P.z, kb: 5 }); }
  if (near.length) A.sfx('zap', 0.5);
}

function orbitBlades(dt) {
  const S = P.stats; P.orbitAng += dt * 3.6;
  const n = P.orbitG.children.length;
  P.orbitG.position.set(P.x, 1.1, P.z);
  P.orbitG.children.forEach((g, i) => {
    const a = P.orbitAng + i / n * TAU; const rx = Math.cos(a) * 2.6, rz = Math.sin(a) * 2.6;
    g.position.set(rx, 0, rz); g.rotation.y = -a + Math.PI; // pointing tangentially
    g.rotation.y = -(a + Math.PI / 2) + Math.PI / 2;
    for (const e of G.enemies) {
      if (e.dead || e.spawnT > 0) continue;
      if (e.orbitCd > G.time) continue;
      if (dist(P.x + rx, P.z + rz, e.x, e.z) < e.r + 0.8) { e.orbitCd = G.time + 0.35; hitEnemy(e, 11 * playerDmgMul(), { elem: P.aspect, canCrit: true, kx: Math.cos(a + 1.5), kz: Math.sin(a + 1.5), kb: 4, pw: 0.5 }); }
    }
    if (Math.random() < dt * 20) FX.trail(P.x + rx, 1.1, P.z + rz, aspectColor(), 0.4, 0.25);
  });
}

function animatePlayer(dt, speed) {
  const p = P.parts, t = G.time;
  P.walk += dt * (speed * 1.1);
  const w = Math.sin(P.walk), mv = Math.min(1, speed / 9);
  P.group.rotation.y = yaw(P.face);
  p.legL.rotation.x = w * 0.9 * mv; p.legR.rotation.x = -w * 0.9 * mv;
  p.torso.position.y = 0.95 + Math.abs(Math.sin(P.walk)) * 0.07 * mv + Math.sin(t * 2) * 0.015;
  p.torso.rotation.x = 0.12 * mv + (P.dashT > 0 ? 0.5 : 0);
  p.head.rotation.x = -0.05;
  p.armL.rotation.x = -w * 0.7 * mv - 0.2; p.armL.rotation.z = 0.1;
  let sweep = -0.25, pitch = -0.7, twist = 0;
  if (P.swing) {
    const sw = P.swing, k = Math.min(1, sw.t / sw.dur), e = easeOut(k);
    sweep = lerp(1.7 * sw.dir, -1.7 * sw.dir, e); pitch = -1.45; twist = -sweep * 0.35;
    if (sw.fin) P.group.rotation.y += lerp(0, -TAU * sw.dir, e);
    p.armL.rotation.x = -0.9;
  } else if (P.castT > 0) { pitch = -1.6; sweep = 0.1; p.armL.rotation.x = -1.5; }
  p.armR.rotation.order = 'YXZ';
  p.armR.rotation.y = lerp(p.armR.rotation.y, sweep, P.swing ? 0.7 : 0.25); p.armR.rotation.x = lerp(p.armR.rotation.x, pitch, 0.4);
  p.torso.rotation.y = lerp(p.torso.rotation.y, twist, 0.4);
  p.sword.rotation.x = P.swing ? 0 : 0.5;
  animateCape(p, t, mv);
  const hurtK = P.hurtT > 0 ? P.hurtT / 0.35 : 0;
  P.group.scale.set(1 + hurtK * 0.1, 1 - hurtK * 0.08, 1 + hurtK * 0.1);
  // invuln blink
  P.group.visible = !(P.inv > 0 && P.dashT <= 0 && P.ultInv <= 0 && Math.floor(G.time * 24) % 2 === 0);
}

// ===================================================================== update all combat entities
export function updateCombat(dt) {
  updateProjs(dt); updateEProjs(dt); updateHazards(dt); updateWells(dt); updatePickups(dt);
  const run = G.run;
  if (run.comboT > 0) { run.comboT -= dt; if (run.comboT <= 0) run.combo = 0; }
}

export function clearCombat() {
  for (const p of G.projs) scene.remove(p.mesh); G.projs.length = 0;
  for (const s of G.eprojs) scene.remove(s.mesh); G.eprojs.length = 0;
  clearHazards(); clearWells(); clearPickups();
}
