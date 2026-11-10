import * as THREE from 'three';
import { G, ASPECTS, BIOMES, ROOM_TYPES } from './state.js';
import { rand, randi, TAU, clamp, dist, pick, chance, shuffle } from './util.js';
import * as FX from './fx.js';
import * as A from './audio.js';
import * as UI from './ui.js';
import { P, resetPlayer, addBoon, healPlayer, dropPickups, clearCombat, telegraph, hitEnemy, collide, hurtPlayer, explode, hitsObstacle } from './combat.js';
import { spawnEnemy, spawnBoss, clearEnemies, aliveCount, DEFS, BOSS_NAMES, hpScale } from './enemies.js';
import { buildArena, disposeArena, applyBiomeLighting, updateArena } from './world.js';
import { buildHeart, glowMat, G3 } from './models.js';
import { rollBoons, RARITY, BOON_BY_ID } from './boons.js';

let scene;
export const initRooms = (sc) => (scene = sc);

const REWARDS = {
  boon: { name: 'Boon', sym: '✦', color: 0x7fe8ff },
  rare: { name: 'Rare Boon', sym: '✹', color: 0xc46bff },
  heal: { name: 'Restoration', sym: '♥', color: 0x55ff88 },
  gold: { name: 'Gold Cache', sym: '◆', color: 0xffc83a },
  legend: { name: 'Legendary Boon', sym: '☀', color: 0xffc23a },
  none: { name: '', sym: '', color: 0xffffff },
};

// ------------------------------------------------------------------ run flow
export function newRun() {
  clearEnemies(); clearCombat();
  G.run = { depth: 0, biome: 0, idx: 0, rooms: 0, gold: 20, goldTotal: 0, kills: 0, score: 0, combo: 0, comboT: 0, bestCombo: 0, hits: 0, reactions: 0, dmg: 0, dmgTaken: 1, time: 0, shopsThisBiome: 0, lastType: null };
  resetPlayer();
  return enterRoom({ type: 'slaughter', reward: 'boon' }, true);
}

function planChoices() {
  const r = G.run;
  const nextIdx = r.idx + 1;
  if (nextIdx === 3) { // boss next
    return [{ type: 'boss', reward: 'legend' }];
  }
  const types = ['slaughter', 'defend', 'hunt', 'tempest', 'prism'];
  const mk = (type) => {
    const rr = Math.random();
    const reward = type === 'shop' ? 'none' : (type === 'hunt' || type === 'prism') && rr < 0.55 ? 'rare' : rr < 0.55 ? 'boon' : rr < 0.72 ? 'rare' : rr < 0.88 ? 'heal' : 'gold';
    return { type, reward };
  };
  let pool = shuffle(types.filter((t) => t !== r.lastType));
  const out = [mk(pool[0]), mk(pool[1])];
  if (nextIdx === 2) out[1] = { type: 'shop', reward: 'none' }; // shop before the boss
  return out;
}

export async function enterRoom(spec, first = false) {
  const r = G.run;
  G.state = 'transition';
  if (!first) await UI.fade(true);
  clearEnemies(); clearCombat(); FX.clearAll();
  if (G.room) dropRoomProps(G.room);
  UI.clearLabels(); UI.hideBoss();
  const biomeChanged = !G.arena || G.arena.bi !== r.biome;
  // --- build arena
  if (G.arena) disposeArena(G.arena, scene);
  const R = spec.type === 'boss' ? 30 : spec.type === 'shop' ? 20 : pick([24, 26, 28]);
  G.arena = buildArena(r.biome, R, scene, { pillars: spec.type === 'boss' ? 4 : spec.type === 'shop' ? 3 : undefined });
  applyBiomeLighting(r.biome, scene);
  A.setMusic(BIOMES[r.biome].root);
  // --- reset player placement
  P.x = 0; P.z = R * 0.55; P.vx = P.vz = 0; P.face = -Math.PI / 2; P.swing = null; P.dashT = 0;
  P.hp = Math.min(P.hp, P.stats.maxHp); P.shield = P.stats.shield;
  G.camSnap = true;
  const room = { type: spec.type, spec, reward: spec.reward, t: 0, state: 'active', queue: [], wave: 0, spawned: 0, name: ROOM_TYPES[spec.type].name, portals: [] };
  G.room = room; r.lastType = spec.type; r.rooms++;
  UI.setRoomHeader(room, BIOMES[r.biome], r);
  setupRoom(room);
  await UI.fade(false);
  G.state = 'play';
  const introSub = spec.type === 'boss' ? '' : ROOM_TYPES[spec.type].desc;
  if (spec.type === 'boss') UI.banner(BOSS_NAMES[r.biome], 'Slay the guardian of ' + BIOMES[r.biome].name, 'boss');
  else UI.banner(room.name, introSub);
  if (r.idx === 0 && r.biome === 0 && first) UI.hint('WASD move · LMB slash (3-hit combo) · RMB aspect skill · SPACE dash · 1/2/3 switch Aspect', 7000);
}

function setupRoom(room) {
  const r = G.run, d = r.depth;
  const t = room.type;
  if (t === 'slaughter') {
    room.waves = [6 + d * 1.8, 8 + d * 2.2, 11 + d * 2.6].map((b) => Math.round(b));
    if (d >= 5) room.waves.push(14 + d * 2.5);
    queueWave(room, room.waves[0], false);
  } else if (t === 'prism') {
    room.waves = [6 + d * 1.4, 8 + d * 1.8, 11 + d * 2].map((b) => Math.round(b));
    queueWave(room, room.waves[0], false, true);
    UI.hint('Warded foes take almost no damage — match your Aspect to the ward colour (1/2/3)!', 8000);
  } else if (t === 'defend') {
    const hm = buildHeart(BIOMES[r.biome].accent2); scene.add(hm.group); room.heartModel = hm;
    room.heart = { x: 0, z: 0, hp: 450 + d * 40, maxHp: 450 + d * 40, flash: 0 };
    G.arena.obstacles.push({ x: 0, z: 0, r: 2.3 });
    room.damageHeart = (dmg) => {
      const h = room.heart; if (!h || h.hp <= 0) return; h.hp -= dmg * 0.8; h.flash = 0.25; FX.shake(0.15);
      FX.burst(0, 2.2, 0, { count: 8, color: BIOMES[G.run.biome].accent2, speed: 5, life: 0.4, size: 0.6 });
      A.sfx('hit', 0.6, 0.6);
      if (h.hp <= 0) { h.hp = 0; room.heartDead = true; }
    };
    room.dur = 52; room.spawnT = 1.5; room.pressure = 0;
    UI.hint('Foes will attack the Heart Crystal — intercept them before it shatters!', 7000);
  } else if (t === 'hunt') {
    const far = spawnPoint(16);
    const type = pick(['brute', 'wraith', 'husk']);
    const ch = spawnEnemy(type, far.x, far.z, { elem: true, elite: pick(['swift', 'armored', 'arcane', 'volatile']) });
    ch.champion = true; ch.maxHp = ch.hp = ch.maxHp * 1.9; ch.score *= 3; ch.gold *= 3;
    ch.group.scale.setScalar(1.55); ch.r *= 1.2;
    ch.thresholds = [0.66, 0.33];
    ch.onHurt = (q) => {
      while (q.thresholds.length && q.hp / q.maxHp < q.thresholds[0]) {
        q.thresholds.shift();
        FX.ring(q.x, q.z, 0xffc23a, 1, 9, 0.6, 0.2, 1, false, 2); FX.text(q.x, q.h + 2, q.z, 'THE CHAMPION CALLS FOR AID', 'warn'); A.sfx('roar', 0.6);
        const p = spawnPoint(14); q.x = p.x; q.z = p.z; q.stun = 0; FX.burst(q.x, 1, q.z, { count: 30, color: 0xffc23a, speed: 10, life: 0.6, size: 1 });
        queueWave(G.room, Math.round(6 + G.run.depth * 1.3), false);
      }
    };
    room.champion = ch;
    queueWave(room, Math.round(5 + d * 1.4), false);
    UI.hint('A Champion has been marked. Hunt it down!', 5000);
  } else if (t === 'tempest') {
    room.dur = 46; room.stormT = 1.5; room.spawnT = 2;
    UI.hint('The storm tears the sky open — keep moving, lure foes into the strikes!', 7000);
  } else if (t === 'boss') {
    const b = spawnBoss(r.biome, 0, -R_(room) * 0.2);
    room.boss = b; UI.showBoss(b);
  } else if (t === 'shop') {
    room.state = 'shop';
    const hm = buildHeart(0xffc23a); hm.group.position.set(0, 0, -4); scene.add(hm.group); room.vendor = hm;
    G.arena.obstacles.push({ x: 0, z: -4, r: 2.2 });
    room.stock = rollShop(); room.vx = 0; room.vz = -4;
    UI.setObjective('Visit the Wanderer — press E');
    openPortals(room);
  }
  if (!['shop'].includes(t)) UI.setObjective(room.name);
}
const R_ = () => G.arena.radius;

export function rollShop() {
  const have = P.b;
  const picks = rollBoons(have, 3, 0.8);
  const stock = picks.map((b) => ({ kind: 'boon', boon: b, cost: Math.round(RARITY[b.r].cost * (0.9 + Math.random() * 0.25)), sold: false }));
  stock.push({ kind: 'heal', name: 'Healing Draught', desc: 'Restore 50% of your max HP.', cost: 55, sold: false });
  stock.push({ kind: 'gold', name: 'Rerolled Fate', desc: 'Re-roll the boons on offer.', cost: 25, sold: false, reroll: true });
  return stock;
}

// ------------------------------------------------------------------ spawning
export function spawnPoint(minD = 9) {
  const R = G.arena.radius;
  for (let i = 0; i < 30; i++) {
    const a = rand(TAU), rr = R * rand(0.45, 0.9), x = Math.cos(a) * rr, z = Math.sin(a) * rr;
    if (dist(x, z, P.x, P.z) < minD) continue;
    if (hitsObstacle(x, z, 1.2)) continue;
    return { x, z };
  }
  return { x: -P.x, z: -P.z };
}

function compose(budget, depth, allow) {
  const avail = [['skitter', 3], ['husk', 3]];
  if (depth >= 1) avail.push(['spitter', 2]);
  if (depth >= 2) avail.push(['bomber', 2], ['brute', 1.2]);
  if (depth >= 3) avail.push(['wraith', 2]);
  if (depth >= 4) avail.push(['summoner', 1.2]);
  const list = allow ? avail.filter(([t]) => allow.includes(t)) : avail;
  const out = [];
  let guard = 60;
  while (budget > 0 && guard-- > 0 && out.length < 26) {
    const opts = list.filter(([t]) => DEFS[t].cost <= budget);
    if (!opts.length) break;
    const tot = opts.reduce((s, o) => s + o[1], 0); let x = Math.random() * tot, pickT = opts[0][0];
    for (const [t, w] of opts) { x -= w; if (x <= 0) { pickT = t; break; } }
    if (pickT === 'skitter') { const n = Math.min(3, budget); for (let i = 0; i < n; i++) out.push('skitter'); budget -= n; }
    else { out.push(pickT); budget -= DEFS[pickT].cost; }
  }
  return out;
}

export function queueWave(room, budget, elite, ward) {
  const d = G.run.depth;
  const list = compose(budget, d, ward ? ['skitter', 'husk', 'spitter', 'bomber', 'wraith', 'brute'] : null);
  let t = 0.2;
  const groupPts = [];
  const gp = () => { const p = spawnPoint(8); groupPts.push(p); return p; };
  let cluster = null, cn = 0;
  for (const type of list) {
    if (!cluster || cn <= 0) { cluster = gp(); cn = type === 'skitter' ? 3 : randi(1, 3); }
    cn--;
    const x = cluster.x + rand(-2.5, 2.5), z = cluster.z + rand(-2.5, 2.5);
    const o = {};
    if (ward) o.ward = randi(0, 2);
    room.queue.push({ t: t += rand(0.05, 0.25), type, x, z, o });
  }
  if (elite && d >= 1) room.queue.push({ t: t + 0.5, type: pick(['husk', 'brute', 'wraith', 'spitter'].filter((q) => d >= 2 || q !== 'brute')), ...(() => { const p = spawnPoint(10); return { x: p.x, z: p.z }; })(), o: { elite: true } });
  room.spawned += list.length + (elite ? 1 : 0);
  room.waveSize = list.length + (elite ? 1 : 0);
  room.waveStart = room.t;
  UI.banner(`Wave ${room.wave + 1}`, '', 'small');
  A.sfx('warn', 0.5, 0.7);
}

function drainQueue(room, dt) {
  if (!room.queue.length) return;
  room.qt = (room.qt || 0) + dt;
  while (room.queue.length && room.queue[0].t <= room.qt) {
    const q = room.queue.shift(); const p = { x: q.x, z: q.z }; collide(p, 1);
    spawnEnemy(q.type, p.x, p.z, q.o);
  }
  if (!room.queue.length) room.qt = 0;
}

// ------------------------------------------------------------------ per-frame
export function updateRoom(dt) {
  const room = G.room; if (!room) return;
  const r = G.run;
  room.t += dt; r.time += dt;
  updateArena(G.arena, dt, G.time, G.camera.position);
  biomeHazards(room, dt);
  if (room.state === 'active') {
    drainQueue(room, dt);
    const alive = aliveCount();
    const t = room.type;
    if (t === 'slaughter' || t === 'prism') {
      const total = room.waves.length;
      UI.setObjective(`${room.name} — Wave ${Math.min(room.wave + 1, total)}/${total} · ${alive + room.queue.length} foes`);
      const waveAge = room.t - room.waveStart;
      if (room.wave + 1 < total && room.queue.length === 0 && (alive <= Math.max(2, room.waveSize * 0.12) || waveAge > 28) && waveAge > 3) {
        room.wave++; queueWave(room, room.waves[room.wave], room.wave === total - 1 && t === 'slaughter', t === 'prism');
      } else if (room.wave + 1 >= total && alive === 0 && room.queue.length === 0 && waveAge > 1.5) clearRoom(room);
    } else if (t === 'defend') {
      const rem = Math.max(0, room.dur - room.t);
      UI.setObjective(`Defend the Heart — ${Math.ceil(rem)}s`);
      UI.setHeartBar(room.heart.hp / room.heart.maxHp);
      room.heart.flash = Math.max(0, room.heart.flash - dt);
      updateHeart(room, dt);
      room.spawnT -= dt;
      if (room.spawnT <= 0 && rem > 4) {
        room.pressure++; room.spawnT = Math.max(3.2, 6.8 - r.depth * 0.25);
        queueWave(room, Math.round(4 + r.depth * 1.2 + room.pressure * 0.6), room.pressure % 4 === 0);
        room.waveStart = room.t;
      }
      if (room.heartDead) failDefend(room);
      else if (rem <= 0) {
        wipeEnemies(room); clearRoom(room);
      }
    } else if (t === 'hunt') {
      UI.setObjective(`Slay the marked Champion${alive > 1 ? ` · ${alive - (room.champion.dead ? 0 : 1)} guards` : ''}`);
      if (room.champion && !room.champion.dead) {
        const c = room.champion; UI.setTrack(c);
        if (Math.random() < dt * 30) FX.emit(c.x + rand(-0.5, 0.5), rand(0, 14), c.z + rand(-0.5, 0.5), 0, rand(2, 6), 0, 0.8, 0.8, 0, 0xffc23a);
      } else { UI.setTrack(null); wipeEnemies(room); clearRoom(room); }
    } else if (t === 'tempest') {
      const rem = Math.max(0, 46 - room.t);
      UI.setObjective(`Survive the Tempest — ${Math.ceil(rem)}s`);
      room.stormT -= dt;
      const rate = lerpT(0.95, 0.38, 1 - rem / 46);
      if (room.stormT <= 0 && rem > 2.5) {
        room.stormT = rate;
        const aimP = Math.random() < 0.55;
        const a = rand(TAU), rr = rand(0, G.arena.radius * 0.9);
        const x = aimP ? P.x + P.vx * 0.4 + rand(-2, 2) : Math.cos(a) * rr, z = aimP ? P.z + P.vz * 0.4 + rand(-2, 2) : Math.sin(a) * rr;
        stormStrike(x, z);
      }
      room.spawnT -= dt;
      if (room.spawnT <= 0 && rem > 5) { room.spawnT = 4.2; const l = compose(3 + Math.floor(r.depth * 0.8), r.depth, ['skitter', 'husk', 'bomber', 'spitter']); l.forEach((tp, i) => { const p = spawnPoint(8); room.queue.push({ t: (room.qt || 0) + 0.1 + i * 0.12, type: tp, x: p.x, z: p.z, o: {} }); }); }
      if (rem <= 0) { wipeEnemies(room); clearRoom(room); }
    } else if (t === 'boss') {
      const b = room.boss;
      if (b && b.dead) {
        UI.hideBoss(); wipeEnemies(room); clearRoom(room);
      } else if (b) UI.updateBoss(b);
    }
  } else if (room.state === 'shop') {
    const d = dist(P.x, P.z, room.vx, room.vz);
    room.vendor.crystal.rotation.y += dt; room.vendor.crystal.position.y = 2.2 + Math.sin(G.time * 2) * 0.2; room.vendor.r1.rotation.z += dt;
    room.nearVendor = d < 5;
    UI.setPrompt(room.nearVendor ? 'Press E — Wanderer' : null);
    if (room.nearVendor && G.input.pressed.e) UI.openShop(room);
    updatePortals(room, dt);
  } else if (room.state === 'cleared' || room.state === 'portals') {
    updatePortals(room, dt);
  }
}
const lerpT = (a, b, t) => a + (b - a) * clamp(t, 0, 1);

function updateHeart(room, dt) {
  const hm = room.heartModel, h = room.heart;
  hm.crystal.rotation.y += dt * 0.8; hm.crystal.position.y = 2.2 + Math.sin(G.time * 2) * 0.15; hm.r1.rotation.z += dt; hm.shell.rotation.y -= dt * 0.5;
  const k = h.hp / h.maxHp;
  hm.crystal.material.emissiveIntensity = (1.2 + k * 1.4) * (1 + h.flash * 4);
  hm.crystal.scale.set(0.8, 1.6, 0.8).multiplyScalar(0.7 + k * 0.3 + h.flash);
  if (Math.random() < dt * 20) FX.emit((Math.random() - 0.5) * 2, 0.3, (Math.random() - 0.5) * 2, 0, rand(2, 5), 0, 1, 0.5, 0, BIOMES[G.run.biome].accent2);
}
function failDefend(room) {
  room.heartDead = false; room.failed = true;
  const hm = room.heartModel;
  FX.burst(0, 2, 0, { count: 120, color: [BIOMES[G.run.biome].accent2, 0xffffff], speed: 24, life: 1, size: 1.2, gravity: 4, up: 4 });
  FX.ring(0, 0, 0xffffff, 1, 24, 0.7, 0.2, 1, false, 2); FX.shake(1); A.sfx('bigboom', 1);
  scene.remove(hm.group); G.arena.obstacles = G.arena.obstacles.filter((o) => !(o.x === 0 && o.z === 0));
  UI.banner('THE HEART SHATTERS', 'Rewards lost', 'warn');
  room.reward = 'none'; room.heart = null;
  for (const e of G.enemies) e.tHeart = false;
  const hp = Math.round(P.stats.maxHp * 0.25); P.hp = Math.max(1, P.hp - hp); G.flashRed = 0.6;
  wipeEnemies(room); clearRoom(room);
}
// quietly dissolve leftover foes when a room ends (no kills, no rewards)
function wipeEnemies(room) {
  room.queue.length = 0;
  for (const e of G.enemies) if (!e.dead && !e.boss) {
    setTimeout(() => { if (e.dead) return; e.dead = true; e.deadT = 0; FX.burst(e.x, e.h * 0.5, e.z, { count: 10, color: e.color, speed: 6, life: 0.5, size: 0.6 }); }, rand(0, 400));
  }
}
function dropRoomProps(room) {
  for (const hm of [room.heartModel, room.vendor]) if (hm) { scene.remove(hm.group); hm.group.traverse((o) => { if (o.isMesh) o.material.dispose(); }); }
  room.heartModel = room.vendor = null;
}

// ------------------------------------------------------------------ hazards by biome
function stormStrike(x, z) {
  const b = G.run.biome;
  const col = [0xff6a2a, 0x7fe3ff, 0xffe94a][b];
  telegraph(x, z, 3, 0.95, 16 + G.run.depth * 1.5, { color: col, hurtsEnemies: true, enemyDmg: 45, sfx: b === 2 ? 'zap' : 'boom', silent: true,
    onFire: (h) => { if (b === 2) FX.beam(h.x + rand(-2, 2), 30, h.z + rand(-2, 2), h.x, 0, h.z, 0xfff27a, 0.5, 0.3, 3); FX.flash(h.x, 4, h.z, col, 80, 0.3, 22); } });
  // falling streak visual
  for (let i = 0; i < 10; i++) setTimeout(() => FX.emit(x + rand(-0.4, 0.4), 22 - i * 2, z + rand(-0.4, 0.4), 0, -30, 0, 0.3, 1.2, 0.2, col), i * 12 + 500);
}
function biomeHazards(room, dt) {
  if (room.state !== 'active' || room.type === 'shop') return;
  if (room.type === 'tempest') return;
  const bi = G.run.biome, d = G.run.depth;
  room.hz = (room.hz ?? rand(4, 7)) - dt;
  if (room.hz <= 0) {
    room.hz = rand(6, 10) - d * 0.2;
    const x = rand(-1, 1) * G.arena.radius * 0.7, z = rand(-1, 1) * G.arena.radius * 0.7;
    if (Math.hypot(x, z) < G.arena.radius - 3 && room.type !== 'boss') {
      for (let i = 0; i < 3; i++) setTimeout(() => G.state === 'play' && room.state === 'active' && stormStrike(x + rand(-4, 4), z + rand(-4, 4)), i * 350);
    }
  }
}

// ------------------------------------------------------------------ clear + rewards + portals
function clearRoom(room) {
  if (room.state !== 'active') return;
  room.state = 'cleared';
  UI.setHeartBar(null); UI.setTrack(null);
  A.sfx('select', 0.7); FX.shake(0.3);
  const failed = room.failed;
  UI.banner(room.type === 'boss' ? 'GUARDIAN SLAIN' : failed ? 'ROOM ENDED' : 'ROOM CLEARED', '', room.type === 'boss' ? 'boss' : '');
  UI.setObjective('');
  G.run.score += 100 * (G.run.depth + 1);
  const rw = REWARDS[room.reward];
  if (room.reward === 'none') { openPortals(room); return; }
  const cx = 0, cz = room.type === 'boss' ? 6 : 0;
  setTimeout(() => {
    if (G.state !== 'play') return;
    dropPickups('reward', cx, cz, 1, { color: rw.color, onCollect: () => claimReward(room) });
    FX.ring(cx, cz, rw.color, 0.5, 6, 0.8, 0.2); A.sfx('portal', 0.5);
    UI.setObjective('Claim your reward: ' + rw.name);
    FX.burst(cx, 1, cz, { count: 40, color: rw.color, speed: 8, life: 1, size: 0.8, up: 5 });
  }, 900);
}

function claimReward(room) {
  const rw = room.reward;
  UI.setObjective('');
  A.sfx('select', 0.8);
  if (rw === 'heal') { healPlayer(P.stats.maxHp * 0.5); P.shield = P.stats.shield; dropPickups('gold', P.x, P.z, 10); openPortals(room); return; }
  if (rw === 'gold') { dropPickups('gold', P.x, P.z, 40 + G.run.depth * 6); openPortals(room); return; }
  const bias = rw === 'rare' ? 1.8 : rw === 'legend' ? 4 : 0;
  const cards = rollBoons(P.b, 3, bias, rw === 'legend' ? 2 : rw === 'rare' ? 1 : 0);
  if (rw === 'legend' && cards.length < 3) { for (const b of rollBoons(P.b, 3 - cards.length, 2, 1)) if (!cards.includes(b)) cards.push(b); }
  UI.showCards(cards, rw === 'legend' ? 'GUARDIAN\'S SPOILS' : rw === 'rare' ? 'RARE BOON' : 'CHOOSE A BOON', (b) => { addBoon(b.id); openPortals(room); });
}

function openPortals(room) {
  room.state = room.type === 'shop' ? 'shop' : 'portals';
  const r = G.run;
  // end of the run?
  if (room.type === 'boss' && r.biome === 2) { setTimeout(() => G.onVictory && G.onVictory(), 600); return; }
  let choices;
  if (room.type === 'boss') choices = [{ type: 'slaughter', reward: 'boon', descend: true }];
  else choices = planChoices();
  const R = G.arena.radius;
  const n = choices.length;
  room.portals = choices.map((c, i) => {
    const x = n === 1 ? 0 : (i === 0 ? -1 : 1) * 6.5, z = -R * 0.72;
    return makePortal(c, x, z, room);
  });
  A.sfx('portal', 0.8);
  if (room.type !== 'shop') UI.setObjective('Step through a portal');
  if (room.type === 'shop') room.state = 'shop';
}

function makePortal(c, x, z, room) {
  const biome = BIOMES[G.run.biome], rw = REWARDS[c.reward];
  const col = c.descend ? 0xffffff : c.type === 'boss' ? 0xff3a5a : c.type === 'shop' ? 0xffc23a : rw.color;
  const g = new THREE.Group(); g.position.set(x, 0, z);
  const ring = new THREE.Mesh(G3.tor(2.4, 0.18, 8, 48), glowMat(col, 3)); ring.position.y = 3; g.add(ring);
  const ring2 = new THREE.Mesh(G3.tor(2.0, 0.06, 6, 40), glowMat(biome.accent2, 2)); ring2.position.y = 3; g.add(ring2);
  const disc = new THREE.Mesh(new THREE.CircleGeometry(2.3, 40), new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, uniforms: { c: { value: new THREE.Color(col) }, t: { value: 0 } },
    vertexShader: 'varying vec2 u; void main(){ u=uv-0.5; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }',
    fragmentShader: 'uniform vec3 c; uniform float t; varying vec2 u; void main(){ float r=length(u)*2.; float a=atan(u.y,u.x); float s=0.5+0.5*sin(a*5.+t*3.-r*14.); float f=smoothstep(1.,0.2,r); gl_FragColor=vec4(c*(0.6+s*1.4),f*(0.35+s*0.4)); }',
  }));
  disc.position.y = 3; g.add(disc);
  const base = new THREE.Mesh(G3.cyl(2.6, 3, 0.4, 8), new THREE.MeshStandardMaterial({ color: 0x141018, metalness: 0.7, roughness: 0.4, flatShading: true })); base.position.y = 0.2; g.add(base);
  for (const s of [-1, 1]) { const p = new THREE.Mesh(G3.box(0.6, 6, 0.6), new THREE.MeshStandardMaterial({ color: 0x1a1522, metalness: 0.7, roughness: 0.4, flatShading: true })); p.position.set(s * 2.9, 3, 0); p.castShadow = true; g.add(p); const tip = new THREE.Mesh(G3.oct(0.4), glowMat(col, 3)); tip.position.set(s * 2.9, 6.3, 0); g.add(tip); }
  scene.add(g);
  const label = UI.makeLabel(c, REWARDS[c.reward], c.descend ? 'Descend' : null);
  FX.ring(x, z, col, 0.5, 5, 0.8, 0.2); FX.flash(x, 3, z, col, 60, 0.6);
  return { g, ring, ring2, disc, x, z, c, col, label, y: 0 };
}

function updatePortals(room, dt) {
  for (const p of room.portals) {
    p.ring.rotation.z += dt; p.ring2.rotation.z -= dt * 1.5; p.disc.material.uniforms.t.value = G.time;
    if (Math.random() < dt * 20) FX.emit(p.x + rand(-2, 2), 0.2, p.z + rand(-1, 1), 0, rand(3, 6), 0, 0.9, 0.6, 0, p.col);
    UI.positionLabel(p.label, p.x, 7, p.z);
    if (G.state === 'play' && dist(P.x, P.z, p.x, p.z) < 2.3) { goPortal(p, room); return; }
  }
}
function goPortal(p, room) {
  const r = G.run;
  for (const q of room.portals) q.label.remove();
  room.portals = []; room.state = 'leaving';
  A.sfx('portal', 1);
  r.idx++;
  if (p.c.descend) { r.biome++; r.idx = 0; }
  r.depth = r.biome * 4 + r.idx;
  enterRoom(p.c);
}

export function endRoomCleanup() { /* arena is disposed on next load */ }
