import * as THREE from 'three';
import { EffectComposer } from '../lib/postprocessing/EffectComposer.js';
import { RenderPass } from '../lib/postprocessing/RenderPass.js';
import { UnrealBloomPass } from '../lib/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from '../lib/postprocessing/ShaderPass.js';
import { OutputPass } from '../lib/postprocessing/OutputPass.js';
import { G, ASPECTS, BIOMES } from './state.js';
import { clamp, damp, rand, fmt } from './util.js';
import * as FX from './fx.js';
import * as A from './audio.js';
import * as UI from './ui.js';
import { initWorld, buildArena, applyBiomeLighting, updateArena, lights } from './world.js';
import { P, initPlayer, resetPlayer, updatePlayer, updateCombat, addBoon, healPlayer, aspectColor, clearCombat } from './combat.js';
import { initEnemies, updateEnemies, clearEnemies } from './enemies.js';
import { initRooms, newRun, updateRoom, rollShop } from './rooms.js';
import { rollBoons } from './boons.js';

const canvas = document.getElementById('game');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05;
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(42, 1, 0.5, 900);
G.scene = scene; G.camera = camera; G.renderer = renderer; G.P = P;
G.input.aim = new THREE.Vector3(0, 0, -5); G.input.pressed = {};

// ---------------------------------------------------------------- post-processing
const rt = new THREE.WebGLRenderTarget(innerWidth, innerHeight, { type: THREE.HalfFloatType, samples: 4 });
const composer = new EffectComposer(renderer, rt);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.55, 0.6, 1.0);
composer.addPass(bloom);
const finalPass = new ShaderPass({
  uniforms: { tDiffuse: { value: null }, time: { value: 0 }, aberr: { value: 0.0015 }, hurt: { value: 0 }, flash: { value: 0 }, low: { value: 0 }, vig: { value: 1.1 } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }',
  fragmentShader: `uniform sampler2D tDiffuse; uniform float time,aberr,hurt,flash,low,vig; varying vec2 vUv;
    float h(vec2 p){ return fract(sin(dot(p,vec2(12.9898,78.233)))*43758.5453); }
    void main(){ vec2 d=vUv-0.5; float r=dot(d,d); vec2 off=d*aberr*(0.4+r*3.0);
      vec3 c=vec3(texture2D(tDiffuse,vUv+off).r,texture2D(tDiffuse,vUv).g,texture2D(tDiffuse,vUv-off).b);
      c*=1.0-r*vig;
      c=mix(c,c*vec3(1.7,0.45,0.45)+vec3(0.12,0.0,0.0),hurt*smoothstep(0.0,0.35,r+0.08));
      float l=dot(c,vec3(.299,.587,.114)); c=mix(c,vec3(l)*vec3(1.1,.8,.8),low*0.45);
      c+=vec3(flash); c+=(h(vUv*1000.+time)-0.5)*0.02;
      gl_FragColor=vec4(c,1.); }`,
});
composer.addPass(finalPass);
composer.addPass(new OutputPass());

function resize() {
  const w = innerWidth, h = innerHeight;
  renderer.setSize(w, h, false); composer.setSize(w, h); bloom.setSize(w, h);
  camera.aspect = w / h; camera.updateProjectionMatrix();
  FX.uniforms.uScale.value = renderer.domElement.height / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2));
}
addEventListener('resize', resize);

// ---------------------------------------------------------------- input
const K = G.input.keys, M = G.input.mouse, PR = G.input.pressed;
addEventListener('keydown', (e) => {
  const k = e.key === ' ' ? 'space' : e.key.toLowerCase();
  if (['space', 'tab', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(k)) e.preventDefault();
  if (e.repeat) return;
  K[k] = true;
  // overlays consume their keys, so a card pick or shop close can't leak into gameplay on the next frame
  if (G.state === 'cards' && ['1', '2', '3'].includes(k)) { UI.cardPickKey(+k - 1); return; }
  if (G.state === 'shop' && (k === 'e' || k === 'escape')) { UI.closeShop(); return; }
  PR[k] = true;
  if (k === 'escape') togglePause();
  if (k === 'm') A.toggleMute();
  if ((G.state === 'dead' || G.state === 'victory') && k === 'r') restart();
});
addEventListener('keyup', (e) => { K[e.key === ' ' ? 'space' : e.key.toLowerCase()] = false; });
addEventListener('blur', () => { for (const k in K) K[k] = false; M.down = M.right = false; if (G.state === 'play') togglePause(true); });
canvas.addEventListener('mousedown', (e) => { if (e.button === 0) M.down = true; if (e.button === 2) { M.right = true; PR.rmb = true; } });
addEventListener('mouseup', (e) => { if (e.button === 0) M.down = false; if (e.button === 2) M.right = false; });
addEventListener('mousemove', (e) => { M.x = e.clientX; M.y = e.clientY; });
addEventListener('contextmenu', (e) => e.preventDefault());
addEventListener('wheel', (e) => { PR.wheel = Math.sign(e.deltaY); }, { passive: true });

const ray = new THREE.Raycaster(), plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -0.4), ndc = new THREE.Vector2(), hit = new THREE.Vector3();
function updateAim() {
  ndc.set((M.x / innerWidth) * 2 - 1, -(M.y / innerHeight) * 2 + 1);
  ray.setFromCamera(ndc, camera);
  if (ray.ray.intersectPlane(plane, hit)) G.input.aim.copy(hit);
}

function togglePause(force) {
  if (G.state === 'play') { G.state = 'paused'; document.getElementById('pause').style.display = 'flex'; }
  else if (G.state === 'paused' && !force) { G.state = 'play'; document.getElementById('pause').style.display = 'none'; }
}

// ---------------------------------------------------------------- game flow
G.onDeath = () => {
  A.sfx('death'); G.timeScale = 0.3; FX.shake(1);
  setTimeout(() => {
    G.timeScale = 1; G.state = 'dead';
    const r = G.run, best = Math.max(r.score | 0, +(localStorage.getItem('shardfall_best') || 0));
    try { localStorage.setItem('shardfall_best', best); } catch (e) {}
    document.getElementById('death-sub').textContent = `${BIOMES[r.biome].name} · Room ${r.rooms} · Best score ${fmt(best)}`;
    document.getElementById('death-stats').innerHTML = stats(r);
    document.getElementById('death').style.display = 'flex'; UI.showHUD(false);
    P.group.visible = false;
  }, 1300);
  FX.burst(P.x, 1.2, P.z, { count: 80, color: [aspectColor(), 0xffffff], speed: 16, life: 1, size: 1.1, gravity: 3 });
  P.group.visible = false;
};
G.onVictory = () => {
  G.state = 'victory'; A.sfx('win');
  const r = G.run; const best = Math.max(r.score | 0, +(localStorage.getItem('shardfall_best') || 0));
  try { localStorage.setItem('shardfall_best', best); } catch (e) {}
  document.getElementById('win-stats').innerHTML = stats(r);
  document.getElementById('victory').style.display = 'flex'; UI.showHUD(false);
};
const stats = (r) => [['Score', fmt(r.score)], ['Rooms', r.rooms], ['Kills', fmt(r.kills)], ['Best chain', r.bestCombo], ['Reactions', r.reactions], ['Damage', fmt(r.dmg)], ['Gold', fmt(r.goldTotal)], ['Time', Math.floor(r.time / 60) + 'm ' + Math.floor(r.time % 60) + 's']].map(([a, b]) => `<div>${a}<b>${b}</b></div>`).join('');

async function restart() {
  document.getElementById('death').style.display = 'none'; document.getElementById('victory').style.display = 'none';
  await UI.fade(true);
  startRun();
}
function startRun() {
  UI.showHUD(true);
  P.group.visible = true;
  newRun();
  UI.hint('', 1);
  // ui sync
  document.querySelectorAll('.asp').forEach((el, i) => el.classList.toggle('on', i === 0));
  G.ui.aspectChanged(0);
}
document.getElementById('start').addEventListener('click', () => {
  A.init(); A.startMusic();
  document.getElementById('title').style.display = 'none';
  UI.fade(true).then(() => startRun());
});
document.getElementById('retry').addEventListener('click', restart);
document.getElementById('again').addEventListener('click', restart);
document.getElementById('shop-close').addEventListener('click', () => UI.closeShop());

UI.setShopHandlers({
  buy(it) {
    if (it.kind === 'boon') addBoon(it.boon.id);
    else if (it.kind === 'heal') { healPlayer(P.stats.maxHp * 0.5); P.shield = P.stats.shield; }
  },
  reroll(room) {
    const rr = rollBoons(P.b, 3, 0.8); let i = 0;
    room.stock.forEach((it) => { if (it.kind === 'boon') { const b = rr[i++]; if (b) { it.boon = b; it.sold = false; it.cost = Math.round(70 + b.r * 55 + Math.random() * 20); } } });
    const rer = room.stock.find((s) => s.reroll); rer.cost += 15;
  },
});

// ---------------------------------------------------------------- camera
const camFocus = new THREE.Vector3(), camPos = new THREE.Vector3();
let titleAng = 0;
function updateCamera(dt, real) {
  let off = new THREE.Vector3(0, 19, 11);
  if (G.state === 'title') {
    titleAng += real * 0.12;
    const r = 26;
    camera.position.set(Math.cos(titleAng) * r, 9 + Math.sin(titleAng * 0.5) * 1.5, Math.sin(titleAng) * r);
    camera.lookAt(0, 4, 0);
    return;
  }
  const boss = G.boss && !G.boss.dead;
  if (boss) off.multiplyScalar(1.35);
  const tx = P.x + (G.input.aim.x - P.x) * 0.16, tz = P.z + (G.input.aim.z - P.z) * 0.16;
  if (G.camSnap) { camFocus.set(tx, 0, tz); G.camSnap = false; }
  camFocus.x = damp(camFocus.x, tx, 6, real); camFocus.z = damp(camFocus.z, tz, 6, real);
  camPos.copy(camFocus).add(off);
  G.shake = Math.max(0, G.shake - real * 2.4);
  const s = G.shake * G.shake;
  camera.position.set(camPos.x + rand(-1, 1) * s * 1.2, camPos.y + rand(-1, 1) * s * 0.8, camPos.z + rand(-1, 1) * s * 1.2);
  camera.lookAt(camFocus.x, 0, camFocus.z - 1);
  // sun follows player so shadows stay crisp
  lights.sun.position.set(P.x - 16, 34, P.z + 14); lights.sun.target.position.set(P.x, 0, P.z); lights.sun.target.updateMatrixWorld();
}

// ---------------------------------------------------------------- main loop
let last = performance.now();
function frame(now) {
  requestAnimationFrame(frame);
  const real = Math.min(G.maxDt, (now - last) / 1000); last = now;
  G.hitstop = Math.max(0, G.hitstop - real);
  let dt = real * G.timeScale * (G.hitstop > 0 ? 0.04 : 1);
  G.time += real;
  updateAim();
  if (G.state === 'play' || G.state === 'dead' || G.state === 'transition' || G.state === 'victory') {
    if (G.state === 'play' || G.state === 'dead' || G.state === 'victory') {
      if (G.state === 'play' || G.state === 'victory') updatePlayer(dt);
      updateEnemies(dt); updateCombat(dt);
    }
    updateRoom(real * G.timeScale);
    FX.updateParticles(real * G.timeScale * (G.hitstop > 0 ? 0.3 : 1)); FX.update(real);
    if (G.state === 'play') {
      let inten = Math.min(1, G.enemies.filter((e) => !e.dead).length / 14 + (G.boss ? 0.5 : 0));
      if (G.room && G.room.state !== 'active') inten *= 0.25;
      A.setMusic(undefined, inten);
    }
    UI.updateHUD(dt);
  } else if (G.state === 'title') {
    if (G.arena) updateArena(G.arena, real, G.time, camera.position);
    FX.updateParticles(real); FX.update(real);
    P.group.position.set(0, 0, 0); P.group.rotation.y = G.time * 0.3;
  } else if (G.state === 'cards' || G.state === 'shop' || G.state === 'paused') {
    FX.update(0);
  }
  updateCamera(dt, real);
  // post uniforms
  const u = finalPass.uniforms;
  G.flashRed = Math.max(0, (G.flashRed || 0) - real * 2); G.flashWhite = Math.max(0, (G.flashWhite || 0) - real * 2.2);
  u.time.value = G.time; u.hurt.value = G.flashRed; u.flash.value = G.flashWhite * 0.5;
  u.aberr.value = 0.0012 + G.shake * 0.006 + G.flashRed * 0.004 + G.flashWhite * 0.006;
  u.low.value = P.alive && G.run && G.state === 'play' ? clamp(1 - P.hp / (P.stats.maxHp * 0.4), 0, 1) : 0;
  for (const k in PR) delete PR[k];
  composer.render();
}

// ---------------------------------------------------------------- boot
async function boot() {
  resize();
  FX.init(scene); initWorld(renderer, scene); initPlayer(scene); initEnemies(scene); initRooms(scene); UI.init();
  G.lights = lights;
  G.run = { depth: 0, biome: 0, idx: 0, rooms: 0, gold: 0, goldTotal: 0, kills: 0, score: 0, combo: 0, comboT: 0, bestCombo: 0, hits: 0, reactions: 0, dmg: 0, dmgTaken: 1, time: 0 };
  resetPlayer(); P.group.position.set(0, 0, 0);
  G.arena = buildArena(0, 26, scene); applyBiomeLighting(0, scene);
  G.state = 'title';
  document.getElementById('title').style.display = 'flex';
  UI.showHUD(false);
  window.__G = G; window.__P = P;
  requestAnimationFrame(frame);
}
boot();
