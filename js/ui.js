import * as THREE from 'three';
import { G, ASPECTS, BIOMES, ROOM_TYPES } from './state.js';
import { BOON_BY_ID, RARITY } from './boons.js';
import * as A from './audio.js';
import { fmt } from './util.js';

const $ = (id) => document.getElementById(id);
export const ICONS = {
  ember: '<svg viewBox="0 0 24 24"><path fill="currentColor" d="M12 1.5c.9 4.2 5.6 6.2 5.6 11.4a5.6 5.6 0 0 1-11.2 0c0-2.2 1-3.6 2.2-4.7.1 2 1 3 2 3.2-.6-4 .2-6.3 1.4-9.9z"/></svg>',
  frost: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 2v20M4 7l16 10M4 17L20 7M9 3l3 3 3-3M9 21l3-3 3 3"/></svg>',
  volt: '<svg viewBox="0 0 24 24"><path fill="currentColor" d="M14 1 4 14h6l-2 9 11-14h-6z"/></svg>',
  well: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 12m-2 0a2 2 0 1 0 4 0a2 2 0 1 0-4 0M12 6a6 6 0 1 1-6 6M12 2a10 10 0 1 1-10 10"/></svg>',
  dash: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M4 5l7 7-7 7M12 5l7 7-7 7"/></svg>',
  ult: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 1l2.4 7.6L22 9l-6 4.6L18 22l-6-4.6L6 22l2-8.4L2 9l7.6-.4z"/></svg>',
  blade: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M20 2 9 13l2 2L22 4zM7 15l-5 5 2 2 5-5z"/></svg>',
};

let lastCards = null;
export function init() {
  $('aspects').innerHTML = ASPECTS.map((a, i) => `<div class="asp" data-i="${i}" style="--c:${a.css}">${ICONS[a.id]}<b>${i + 1}</b></div>`).join('');
  $('sk-rmb-i').innerHTML = ICONS.ember; $('sk-q-i').innerHTML = ICONS.well; $('sk-dash-i').innerHTML = ICONS.dash; $('sk-r-i').innerHTML = ICONS.ult; $('sk-lmb-i').innerHTML = ICONS.blade;
  G.ui = { aspectChanged };
  document.querySelectorAll('.asp').forEach((el) => el.addEventListener('mousedown', (e) => { e.stopPropagation(); G.input.pressed[String(+el.dataset.i + 1)] = true; }));
}
function aspectChanged(n) {
  document.querySelectorAll('.asp').forEach((el, i) => el.classList.toggle('on', i === n));
  $('sk-rmb-i').innerHTML = ICONS[ASPECTS[n].id]; $('sk-rmb').style.setProperty('--c', ASPECTS[n].css);
  document.documentElement.style.setProperty('--asp', ASPECTS[n].css);
  $('sk-rmb-n').textContent = ASPECTS[n].skill;
}
export function showHUD(v) { $('hud').style.display = v ? 'block' : 'none'; }

export function fade(on) {
  return new Promise((res) => {
    const f = $('fade'); f.classList.toggle('on', on);
    setTimeout(res, on ? 420 : 520);
  });
}
let bannerT, hintT;
export function banner(title, sub = '', kind = '') {
  const b = $('banner'); b.className = ''; void b.offsetWidth;
  b.className = 'show ' + kind;
  b.innerHTML = `<h1>${title}</h1>${sub ? `<p>${sub}</p>` : ''}`;
  clearTimeout(bannerT); bannerT = setTimeout(() => (b.className = ''), kind === 'small' ? 1400 : 2800);
}
export function hint(text, ms = 5000) {
  const h = $('hint'); h.textContent = text; h.classList.add('show');
  clearTimeout(hintT); hintT = setTimeout(() => h.classList.remove('show'), ms);
}
export function setRoomHeader(room, biome, run) {
  $('biome').textContent = biome.name;
  $('roomno').textContent = `Room ${run.rooms} · ${room.name}`;
  document.documentElement.style.setProperty('--biome', '#' + new THREE.Color(biome.accent).getHexString());
}
export function setObjective(t) { $('objective').textContent = t; }
export function setPrompt(t) { const p = $('prompt'); p.textContent = t || ''; p.style.opacity = t ? 1 : 0; }
export function setHeartBar(v) { const e = $('heartbar'); if (v === null) { e.style.display = 'none'; return; } e.style.display = 'block'; e.firstElementChild.style.width = Math.max(0, v * 100) + '%'; }
export function setTrack(e) { G.track = e; $('track').style.display = e ? 'block' : 'none'; }

export function showBoss(b) { $('bossbar').style.display = 'block'; $('bossname').textContent = b.name; }
export function updateBoss(b) { $('bossfill').style.width = Math.max(0, b.hp / b.maxHp * 100) + '%'; }
export function hideBoss() { $('bossbar').style.display = 'none'; }

// ---------- portal labels
export function makeLabel(c, rw, special) {
  const el = document.createElement('div'); el.className = 'plabel';
  const t = ROOM_TYPES[c.type];
  el.innerHTML = `<div class="pn">${t.sym} ${special ? 'Next Realm' : t.name}</div><div class="pr" style="--rc:#${(rw && rw.color !== undefined ? rw.color : 0xffffff).toString(16).padStart(6, '0')}">${c.type === 'shop' ? 'Spend gold' : rw.name ? rw.sym + ' ' + rw.name : ''}</div>${c.type === 'boss' ? '<div class="pb">GUARDIAN</div>' : ''}`;
  $('labels').appendChild(el); return el;
}
const v3 = new THREE.Vector3();
export function positionLabel(el, x, y, z) {
  v3.set(x, y, z).project(G.camera);
  el.style.transform = `translate(${(v3.x * 0.5 + 0.5) * innerWidth}px, ${(-v3.y * 0.5 + 0.5) * innerHeight}px) translate(-50%,-50%)`;
}
export function clearLabels() { $('labels').innerHTML = ''; }

// ---------- cards
export function showCards(cards, title, cb) {
  G.state = 'cards';
  const o = $('cards'); o.style.display = 'flex'; $('cards-title').textContent = title;
  const row = $('cards-row'); row.innerHTML = '';
  cards.forEach((b, i) => row.appendChild(cardEl(b, i, () => pick(b))));
  A.sfx('card', 1, 0.8);
  const pick = (b) => {
    o.style.display = 'none'; G.state = 'play'; lastCards = null; A.sfx('select');
    cb(b);
  };
  lastCards = { cards, pick };
}
export function cardPickKey(i) { if (lastCards && lastCards.cards[i]) lastCards.pick(lastCards.cards[i]); }
function cardEl(b, i, onClick, price) {
  const lvl = (G.P && G.P.b[b.id]) || 0;
  const rar = RARITY[b.r];
  const el = document.createElement('div'); el.className = 'card r' + b.r; el.style.setProperty('--rc', rar.css); el.style.animationDelay = i * 0.08 + 's';
  const tag = b.tag !== undefined ? `<span class="etag" style="color:${ASPECTS[b.tag].css}">${ASPECTS[b.tag].name}</span>` : '';
  el.innerHTML = `<div class="cr">${rar.name}</div><div class="sym">${b.sym}</div><div class="cn">${b.name}</div><div class="cd">${b.desc}</div><div class="cl">${tag}${lvl ? `Lv ${lvl} → ${lvl + 1}` : 'NEW'}</div>${price !== undefined ? `<div class="price">◆ ${price}</div>` : `<div class="key">${i + 1}</div>`}`;
  el.addEventListener('click', onClick);
  return el;
}

// ---------- shop
let shopRoom;
export function openShop(room) {
  shopRoom = room; G.state = 'shop'; $('shop').style.display = 'flex'; renderShop();
  A.sfx('card', 1, 0.7);
}
export function closeShop() { $('shop').style.display = 'none'; if (G.state === 'shop') G.state = 'play'; }
function renderShop() {
  const room = shopRoom; $('shop-gold').textContent = '◆ ' + G.run.gold;
  const row = $('shop-row'); row.innerHTML = '';
  room.stock.forEach((it, i) => {
    let el;
    if (it.kind === 'boon') el = cardEl(it.boon, i, () => buy(it), it.cost);
    else {
      el = document.createElement('div'); el.className = 'card utility'; el.innerHTML = `<div class="sym">${it.reroll ? '↻' : '♥'}</div><div class="cn">${it.name}</div><div class="cd">${it.desc}</div><div class="price">◆ ${it.cost}</div>`;
      el.addEventListener('click', () => buy(it));
    }
    if (it.sold) el.classList.add('sold'); else if (G.run.gold < it.cost) el.classList.add('poor');
    row.appendChild(el);
  });
}
let buyHandlers = {};
export function setShopHandlers(h) { buyHandlers = h; }
function buy(it) {
  if (it.sold || G.run.gold < it.cost) { A.sfx('hurt', 0.3); return; }
  G.run.gold -= it.cost; A.sfx('coin', 1);
  if (it.reroll) { it.sold = false; buyHandlers.reroll(shopRoom); }
  else { it.sold = true; buyHandlers.buy(it); }
  renderShop();
}

// ---------- per-frame HUD
const cache = {};
function setTxt(id, v) { if (cache[id] !== v) { cache[id] = v; $(id).textContent = v; } }
export function updateHUD(dt) {
  const P = G.P; if (!P || !G.run) return;
  const S = P.stats;
  $('hpfill').style.width = Math.max(0, P.hp / S.maxHp * 100) + '%';
  $('shfill').style.width = S.shield ? Math.max(0, P.shield / S.shield * 100) + '%' : '0%';
  setTxt('hptxt', `${Math.ceil(P.hp)} / ${S.maxHp}` + (S.shield ? `  (+${Math.ceil(P.shield)})` : ''));
  setTxt('gold', fmt(G.run.gold)); setTxt('score', fmt(G.run.score)); setTxt('kills', fmt(G.run.kills));
  const c = G.run.combo;
  const cb = $('combo'); cb.style.opacity = c > 2 ? 1 : 0; if (c > 2) { setTxt('combo-n', c); setTxt('combo-m', 'x' + Math.min(4, 1 + Math.floor(c / 6) * 0.25).toFixed(2)); $('combo-bar').style.width = Math.max(0, G.run.comboT / 3.5 * 100) + '%'; }
  // skills
  const cdr = (el, cd, max) => el.style.setProperty('--cd', (cd > 0 ? Math.min(1, cd / max) : 0) * 100 + '%');
  cdr($('sk-rmb'), P.skillCd, 2.8); cdr($('sk-q'), P.wellCd, 10);
  $('sk-q').classList.toggle('ready', P.wellCd <= 0);
  $('sk-rmb').classList.toggle('ready', P.skillCd <= 0);
  const pips = $('pips'); const n = S.dashMax;
  if (pips.children.length !== n) pips.innerHTML = '<i></i>'.repeat(n);
  for (let i = 0; i < n; i++) { const el = pips.children[i]; el.className = i < P.dashCharges ? 'full' : i === P.dashCharges ? 'rec' : ''; if (i === P.dashCharges) el.style.setProperty('--p', Math.min(1, P.dashRec / 1.5) * 100 + '%'); }
  const sr = $('sk-r'); sr.style.setProperty('--fill', P.surge + '%'); sr.classList.toggle('ready', P.surge >= 100);
  setTxt('surge-n', P.surge >= 100 ? 'READY' : Math.floor(P.surge) + '%');
  // boons strip
  const ids = Object.keys(P.b); const sig = ids.map((k) => k + P.b[k]).join();
  if (cache.boonsig !== sig) {
    cache.boonsig = sig;
    $('boonlist').innerHTML = ids.map((k) => { const b = BOON_BY_ID[k]; return `<div class="bi r${b.r}" title="${b.name}: ${b.desc}">${b.sym}${P.b[k] > 1 ? `<sub>${P.b[k]}</sub>` : ''}<span class="tip"><b>${b.name}</b>${P.b[k] > 1 ? ' Lv' + P.b[k] : ''}<br>${b.desc}</span></div>`; }).join('');
  }
  // tracking arrow for hunts
  if (G.track && !G.track.dead) {
    v3.set(G.track.x, 2, G.track.z).project(G.camera);
    const tr = $('track'); const w = innerWidth, h = innerHeight;
    let x = (v3.x * 0.5 + 0.5) * w, y = (-v3.y * 0.5 + 0.5) * h; const on = v3.z < 1 && x > 40 && x < w - 40 && y > 80 && y < h - 120;
    if (!on) { const cx = w / 2, cy = h / 2; let dx = x - cx, dy = y - cy; if (v3.z > 1) { dx = -dx; dy = -dy; } const k = Math.min((w / 2 - 50) / Math.abs(dx || 1), (h / 2 - 110) / Math.abs(dy || 1)); x = cx + dx * k; y = cy + dy * k; tr.style.transform = `translate(${x}px,${y}px) translate(-50%,-50%) rotate(${Math.atan2(dy, dx)}rad)`; tr.className = 'edge'; }
    else { tr.style.transform = `translate(${x}px,${y - 90}px) translate(-50%,-50%)`; tr.className = 'on'; }
  }
  // vignette states
  document.body.classList.toggle('lowhp', P.hp < S.maxHp * 0.3 && P.alive);
}
