import { shuffle } from './util.js';

// stat block defaults; boons mutate a fresh copy each recalc
export const baseStats = () => ({
  dmg: 1, aspd: 1, move: 1, maxHp: 100, crit: 0.05, critMul: 1.6, cdr: 0, dashMax: 2, dashRate: 1, life: 0, healKill: 0,
  aoe: 1, range: 1, arc: 1, pickup: 5, gold: 1, reactMul: 1, reactR: 1, burnMul: 1, burnDur: 1, chillNeed: 3, frozenBonus: 0,
  shockArcs: 1, orbit: 0, echo: 0, wellR: 1, wellDmg: 1, wellLinger: false, shockwave: false, killBlast: 0, dashFire: false,
  dashBolt: false, dashFrost: false, berserk: 0, adren: 0, surgeMul: 1, ultMul: 1, shield: 0, taken: 1, execute: 0, supernova: false,
  timelord: 0, mirror: false, trinity: false,
});

const lv = (n) => (n > 1 ? ` (Lv ${n})` : '');
// rarity: 0 common, 1 rare, 2 epic, 3 legendary
export const BOONS = [
  { id: 'keen', name: 'Razor Edge', r: 0, sym: '⚔', max: 5, desc: '+18% damage.', ap: (S, n) => (S.dmg *= 1 + 0.18 * n) },
  { id: 'tempo', name: 'Quickened Pulse', r: 0, sym: '≫', max: 4, desc: '+12% attack speed, +5% move speed.', ap: (S, n) => { S.aspd *= 1 + 0.12 * n; S.move *= 1 + 0.05 * n; } },
  { id: 'vigor', name: 'Vital Core', r: 0, sym: '♥', max: 5, desc: '+25 max HP and heal 25.', ap: (S, n) => (S.maxHp += 25 * n), pick: (P, heal) => heal(25) },
  { id: 'stride', name: 'Fleet Foot', r: 0, sym: '➤', max: 3, desc: '+10% move speed. Dash recharges 18% faster.', ap: (S, n) => { S.move *= 1 + 0.1 * n; S.dashRate *= 1 + 0.18 * n; } },
  { id: 'lucky', name: "Predator's Eye", r: 0, sym: '◎', max: 4, desc: '+10% crit chance, +25% crit damage.', ap: (S, n) => { S.crit += 0.1 * n; S.critMul += 0.25 * n; } },
  { id: 'reservoir', name: 'Arcane Reservoir', r: 0, sym: '◌', max: 3, desc: '-15% skill cooldowns.', ap: (S, n) => (S.cdr += 0.15 * n) },
  { id: 'magnet', name: 'Soul Magnet', r: 0, sym: '✧', max: 3, desc: 'Pickups fly to you from afar. +25% gold.', ap: (S, n) => { S.pickup += 4 * n; S.gold += 0.25 * n; } },
  { id: 'iron', name: 'Ironhide', r: 0, sym: '▣', max: 3, desc: 'Take 12% less damage.', ap: (S, n) => (S.taken *= Math.pow(0.88, n)) },

  { id: 'cinder', name: 'Cinder Brand', r: 1, sym: '♨', max: 3, tag: 0, desc: 'Burns last 2× longer and hurt 50% more.', ap: (S, n) => { S.burnDur *= 1 + n; S.burnMul *= 1 + 0.5 * n; } },
  { id: 'frostbite', name: 'Deep Frostbite', r: 1, sym: '❄', max: 2, tag: 1, desc: 'Freeze after 1 fewer chill. Frozen foes take +25% damage.', ap: (S, n) => { S.chillNeed = Math.max(1, 3 - n); S.frozenBonus += 0.25 * n; } },
  { id: 'static', name: 'Static Web', r: 1, sym: '⚡', max: 3, tag: 2, desc: 'Lightning chains to 2 more foes.', ap: (S, n) => (S.shockArcs += 2 * n) },
  { id: 'phoenix', name: 'Phoenix Step', r: 1, sym: '✺', max: 1, tag: 0, desc: 'Dashing leaves a trail of searing flame.', ap: (S) => (S.dashFire = true) },
  { id: 'stormstep', name: 'Stormstep', r: 1, sym: 'ϟ', max: 1, tag: 2, desc: 'Dashing discharges lightning into nearby foes.', ap: (S) => (S.dashBolt = true) },
  { id: 'glacial', name: 'Glacial Step', r: 1, sym: '❅', max: 1, tag: 1, desc: 'Ending a dash releases a freezing nova.', ap: (S) => (S.dashFrost = true) },
  { id: 'orbit', name: 'Shard Orbit', r: 1, sym: '✦', max: 3, desc: 'Two spectral blades orbit you, carrying your Aspect.', ap: (S, n) => (S.orbit += 2 * n) },
  { id: 'echo', name: 'Echo Casting', r: 1, sym: '◐', max: 1, desc: 'Aspect skills echo, casting a second time.', ap: (S) => (S.echo = 1) },
  { id: 'horizon', name: 'Event Horizon', r: 1, sym: '◉', max: 2, desc: 'Singularity is 30% wider and collapses for far more, leaving a mini-well.', ap: (S, n) => { S.wellR *= 1 + 0.3 * n; S.wellDmg += 0.6 * n; S.wellLinger = true; } },
  { id: 'reactor', name: 'Reaction Mastery', r: 1, sym: '☢', max: 3, desc: 'Elemental reactions hit 50% harder and wider.', ap: (S, n) => { S.reactMul += 0.5 * n; S.reactR += 0.2 * n; } },
  { id: 'cleave', name: 'Wide Arc', r: 1, sym: '☾', max: 2, desc: 'Slashes reach farther and wider. 3rd strike unleashes a shockwave.', ap: (S, n) => { S.arc += 0.3 * n; S.range += 0.18 * n; S.shockwave = true; } },
  { id: 'blast', name: 'Chain Reaction', r: 1, sym: '✹', max: 3, desc: 'Slain foes detonate in your Aspect.', ap: (S, n) => (S.killBlast += n) },

  { id: 'vamp', name: 'Vampiric Edge', r: 2, sym: '☥', max: 3, desc: 'Heal 2 HP per kill and 1.5% of damage dealt.', ap: (S, n) => { S.healKill += 2 * n; S.life += 0.015 * n; } },
  { id: 'berserk', name: 'Berserker', r: 2, sym: '☗', max: 2, desc: '+50% damage while below half HP.', ap: (S, n) => (S.berserk += 0.5 * n) },
  { id: 'adren', name: 'Bloodrush', r: 2, sym: '≋', max: 2, desc: 'Kills refund dash charge and surge.', ap: (S, n) => (S.adren += n) },
  { id: 'overcharge', name: 'Overcharge', r: 2, sym: '⌬', max: 2, desc: 'Surge builds 60% faster. Cataclysm hits 40% harder.', ap: (S, n) => { S.surgeMul += 0.6 * n; S.ultMul += 0.4 * n; } },
  { id: 'aegis', name: 'Aegis Pulse', r: 2, sym: '⬡', max: 3, desc: 'A 25-point barrier that regenerates when you avoid damage.', ap: (S, n) => (S.shield += 25 * n) },
  { id: 'execute', name: 'Executioner', r: 2, sym: '☠', max: 1, desc: 'Non-elite foes under 20% HP are instantly slain.', ap: (S) => (S.execute = 0.2) },

  { id: 'supernova', name: 'Supernova', r: 3, sym: '☀', max: 1, desc: 'Cataclysm detonates twice and charges 40% faster.', ap: (S) => { S.supernova = true; S.surgeMul += 0.4; } },
  { id: 'timelord', name: 'Chrono Fracture', r: 3, sym: '⧖', max: 1, desc: 'Enemies move 20% slower. Your skills recharge 25% faster.', ap: (S) => { S.timelord = 0.2; S.cdr += 0.25; } },
  { id: 'mirror', name: 'Mirror Blades', r: 3, sym: '⟁', max: 1, desc: 'Every slash also hurls a piercing spectral blade.', ap: (S) => (S.mirror = true) },
  { id: 'trinity', name: 'Trinity Resonance', r: 3, sym: '☯', max: 1, desc: 'Switching Aspect unleashes a nova of the new element and grants +35% damage for 3s.', ap: (S) => (S.trinity = true) },
];
export const BOON_BY_ID = Object.fromEntries(BOONS.map((b) => [b.id, b]));
export const RARITY = [
  { name: 'Common', css: '#c9d3e6', w: 55, cost: 40 },
  { name: 'Rare', css: '#4fb8ff', w: 30, cost: 75 },
  { name: 'Epic', css: '#c46bff', w: 12, cost: 120 },
  { name: 'Legendary', css: '#ffc23a', w: 3, cost: 190 },
];

export function rollBoons(have, n = 3, bias = 0, minR = 0) {
  const pool = BOONS.filter((b) => (have[b.id] || 0) < b.max && b.r >= minR);
  const out = [];
  const bag = pool.map((b) => ({ b, w: RARITY[b.r].w * (b.r >= 1 ? 1 + bias : 1) * (have[b.id] ? 1.25 : 1) }));
  while (out.length < n && bag.length) {
    const tot = bag.reduce((s, x) => s + x.w, 0);
    let r = Math.random() * tot, i = 0;
    for (; i < bag.length - 1; i++) { r -= bag[i].w; if (r <= 0) break; }
    out.push(bag[i].b); bag.splice(i, 1);
  }
  return out;
}
