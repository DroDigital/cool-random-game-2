// Fully procedural WebAudio: SFX + adaptive generative music. No assets.
let ctx = null, master, sfxBus, musBus, noiseBuf, comp;
let muted = false;
const M = { root: 41.2, intensity: 0, step: 0, next: 0, on: false, bar: 0 };

export function init() {
  if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
  ctx = new (window.AudioContext || window.webkitAudioContext)();
  comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -14; comp.ratio.value = 5;
  master = ctx.createGain(); master.gain.value = 0.7;
  sfxBus = ctx.createGain(); sfxBus.gain.value = 0.9;
  musBus = ctx.createGain(); musBus.gain.value = 0.38;
  sfxBus.connect(master); musBus.connect(master); master.connect(comp); comp.connect(ctx.destination);
  noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
  const d = noiseBuf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
}
export function toggleMute() {
  muted = !muted;
  if (master) master.gain.value = muted ? 0 : 0.7;
  return muted;
}

function tone(f, dur, type = 'sine', vol = 0.3, slide = 0, delay = 0, bus = sfxBus) {
  if (!ctx) return;
  const t = ctx.currentTime + delay;
  const o = ctx.createOscillator(), g = ctx.createGain();
  o.type = type; o.frequency.setValueAtTime(f, t);
  if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, f * slide), t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + 0.008);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g); g.connect(bus); o.start(t); o.stop(t + dur + 0.05);
}
function noise(dur, f0, f1, vol = 0.3, type = 'bandpass', q = 1, delay = 0, bus = sfxBus) {
  if (!ctx) return;
  const t = ctx.currentTime + delay;
  const s = ctx.createBufferSource(); s.buffer = noiseBuf; s.loop = true;
  const fl = ctx.createBiquadFilter(); fl.type = type; fl.Q.value = q;
  fl.frequency.setValueAtTime(f0, t); fl.frequency.exponentialRampToValueAtTime(Math.max(30, f1), t + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  s.connect(fl); fl.connect(g); g.connect(bus); s.start(t, Math.random()); s.stop(t + dur + 0.05);
}

const last = {};
export function sfx(name, vol = 1, pitch = 1) {
  if (!ctx || muted) return;
  const now = ctx.currentTime;
  if (last[name] && now - last[name] < 0.03) return; // rate-limit identical sounds
  last[name] = now;
  const p = pitch * (0.94 + Math.random() * 0.12), v = vol;
  switch (name) {
    case 'slash': noise(0.16, 1800 * p, 500, 0.35 * v, 'bandpass', 1.2); tone(220 * p, 0.1, 'sawtooth', 0.06 * v, 0.5); break;
    case 'slash3': noise(0.3, 1200 * p, 200, 0.5 * v, 'bandpass', 0.8); tone(110 * p, 0.25, 'sawtooth', 0.15 * v, 0.4); break;
    case 'hit': noise(0.09, 900 * p, 200, 0.4 * v, 'lowpass'); tone(160 * p, 0.09, 'square', 0.12 * v, 0.4); break;
    case 'crit': noise(0.14, 3000, 400, 0.5 * v, 'bandpass'); tone(600 * p, 0.12, 'square', 0.15 * v, 0.5); tone(900 * p, 0.2, 'sine', 0.12 * v, 1.5, 0.03); break;
    case 'kill': tone(120 * p, 0.2, 'sawtooth', 0.14 * v, 0.3); noise(0.2, 600, 80, 0.3 * v, 'lowpass'); break;
    case 'dash': noise(0.2, 400 * p, 3000, 0.3 * v, 'bandpass', 0.7); break;
    case 'fire': noise(0.35, 500, 2200, 0.35 * v, 'bandpass', 0.6); tone(90 * p, 0.3, 'sawtooth', 0.12 * v, 2); break;
    case 'boom': noise(0.6, 600, 40, 0.8 * v, 'lowpass', 0.7); tone(70 * p, 0.5, 'sine', 0.5 * v, 0.3); break;
    case 'bigboom': noise(1.1, 500, 30, 1 * v, 'lowpass', 0.7); tone(48 * p, 0.9, 'sine', 0.7 * v, 0.4); tone(90 * p, 0.6, 'sawtooth', 0.15 * v, 0.3); break;
    case 'zap': noise(0.18, 4000, 1500, 0.4 * v, 'highpass'); tone(1400 * p, 0.12, 'sawtooth', 0.12 * v, 0.2); tone(700 * p, 0.14, 'square', 0.08 * v, 2, 0.02); break;
    case 'ice': tone(1800 * p, 0.18, 'triangle', 0.14 * v, 0.5); tone(2600 * p, 0.14, 'sine', 0.09 * v, 0.6, 0.03); noise(0.12, 5000, 2000, 0.2 * v, 'highpass'); break;
    case 'freeze': tone(2200 * p, 0.35, 'sine', 0.15 * v, 0.4); noise(0.3, 6000, 1500, 0.25 * v, 'highpass'); break;
    case 'shatter': noise(0.35, 7000, 800, 0.55 * v, 'highpass'); tone(1200 * p, 0.15, 'triangle', 0.2 * v, 0.3); tone(300 * p, 0.2, 'square', 0.1 * v, 0.4); break;
    case 'steam': noise(0.5, 3000, 800, 0.4 * v, 'bandpass', 0.5); tone(200 * p, 0.4, 'sine', 0.2 * v, 0.5); break;
    case 'overload': tone(80 * p, 0.5, 'sawtooth', 0.3 * v, 4); noise(0.5, 3000, 200, 0.6 * v, 'bandpass'); break;
    case 'superconduct': tone(1000 * p, 0.4, 'sawtooth', 0.12 * v, 0.25); tone(1500 * p, 0.4, 'sine', 0.1 * v, 0.3, 0.05); break;
    case 'hurt': noise(0.25, 500, 80, 0.7 * v, 'lowpass'); tone(110, 0.3, 'sawtooth', 0.3 * v, 0.4); break;
    case 'pickup': tone(880 * p, 0.1, 'triangle', 0.15 * v); tone(1320 * p, 0.14, 'triangle', 0.12 * v, 1, 0.05); break;
    case 'coin': tone(1400 * p, 0.08, 'square', 0.06 * v); tone(1900 * p, 0.12, 'square', 0.05 * v, 1, 0.05); break;
    case 'heal': tone(523, 0.2, 'sine', 0.2 * v); tone(659, 0.2, 'sine', 0.2 * v, 1, 0.08); tone(784, 0.3, 'sine', 0.2 * v, 1, 0.16); break;
    case 'card': tone(440 * p, 0.15, 'triangle', 0.12 * v, 1.5); noise(0.1, 4000, 8000, 0.1 * v, 'highpass'); break;
    case 'select': tone(523, 0.12, 'triangle', 0.2); tone(784, 0.25, 'triangle', 0.2, 1, 0.07); tone(1046, 0.4, 'sine', 0.15, 1, 0.14); break;
    case 'portal': tone(200, 0.9, 'sine', 0.2 * v, 3); tone(300, 0.9, 'triangle', 0.1 * v, 3, 0.1); noise(0.8, 300, 3000, 0.15 * v, 'bandpass', 2); break;
    case 'warn': tone(300, 0.12, 'square', 0.07 * v); tone(300, 0.12, 'square', 0.07 * v, 1, 0.18); break;
    case 'spawn': tone(90 * p, 0.35, 'sawtooth', 0.12 * v, 2.5); noise(0.3, 200, 1200, 0.15 * v, 'bandpass'); break;
    case 'well': tone(60, 0.8, 'sine', 0.4 * v, 2.5); noise(0.7, 150, 2500, 0.3 * v, 'bandpass', 1.5); break;
    case 'ult': tone(55, 1.6, 'sawtooth', 0.35 * v, 0.5); tone(110, 1.2, 'sine', 0.3 * v, 4); noise(1.4, 200, 8000, 0.5 * v, 'bandpass', 0.5); break;
    case 'roar': tone(70, 1.4, 'sawtooth', 0.4 * v, 0.6); tone(73, 1.4, 'square', 0.25 * v, 0.55); noise(1.2, 400, 100, 0.4 * v, 'lowpass'); break;
    case 'slam': noise(0.5, 300, 40, 0.9 * v, 'lowpass'); tone(55, 0.4, 'sine', 0.6 * v, 0.5); break;
    case 'shoot': tone(500 * p, 0.14, 'sawtooth', 0.1 * v, 0.4); noise(0.1, 2000, 600, 0.12 * v); break;
    case 'blink': noise(0.25, 6000, 400, 0.25 * v, 'bandpass', 3); tone(1200 * p, 0.2, 'sine', 0.1 * v, 0.3); break;
    case 'levelup': [523, 659, 784, 1046].forEach((f, i) => tone(f, 0.25, 'triangle', 0.18, 1, i * 0.07)); break;
    case 'death': tone(220, 1.6, 'sawtooth', 0.35, 0.2); noise(1.4, 800, 40, 0.5, 'lowpass'); break;
    case 'win': [392, 523, 659, 784, 1046, 1318].forEach((f, i) => tone(f, 0.6, 'triangle', 0.18, 1, i * 0.12)); break;
  }
}

// ---------- adaptive music ----------
const SCALE = [0, 3, 5, 7, 10, 12, 15]; // minor pentatonic-ish
export function setMusic(root, intensity) {
  M.root = root ?? M.root;
  if (intensity !== undefined) M.intensity += (intensity - M.intensity) * 0.05;
}
export function startMusic() {
  if (!ctx || M.on) return;
  M.on = true; M.next = ctx.currentTime + 0.1; M.step = 0;
  // sub drone
  const o = ctx.createOscillator(), o2 = ctx.createOscillator(), g = ctx.createGain(), f = ctx.createBiquadFilter();
  o.type = 'sawtooth'; o2.type = 'sawtooth'; o.frequency.value = M.root; o2.frequency.value = M.root * 1.005;
  f.type = 'lowpass'; f.frequency.value = 220; g.gain.value = 0.16;
  o.connect(f); o2.connect(f); f.connect(g); g.connect(musBus); o.start(); o2.start();
  M.drone = { o, o2, f };
  setInterval(schedule, 60);
}
function schedule() {
  if (!ctx || !M.on) return;
  const spb = 60 / 112 / 2; // eighth notes at 112bpm
  if (M.drone) {
    M.drone.o.frequency.setTargetAtTime(M.root, ctx.currentTime, 0.5);
    M.drone.o2.frequency.setTargetAtTime(M.root * 1.005, ctx.currentTime, 0.5);
    M.drone.f.frequency.setTargetAtTime(160 + M.intensity * 500, ctx.currentTime, 0.3);
  }
  while (M.next < ctx.currentTime + 0.25) {
    const t = M.next - ctx.currentTime, s = M.step % 16, I = M.intensity;
    const bars = [0, 0, 5, 3];
    const degree = bars[Math.floor(M.step / 16) % 4];
    const base = M.root * 2 * Math.pow(2, degree / 12);
    // bass pulse
    if (s % 2 === 0) tone(base, spb * 1.6, 'sawtooth', 0.09 + I * 0.05, 0.98, t, musBus);
    // kick
    if (I > 0.25 && s % 4 === 0) { tone(120, 0.18, 'sine', 0.35 * Math.min(1, I + 0.3), 0.3, t, musBus); }
    // hats
    if (I > 0.45 && s % 2 === 1) noise(0.05, 8000, 6000, 0.05 + I * 0.03, 'highpass', 1, t, musBus);
    // snare
    if (I > 0.6 && s % 8 === 4) noise(0.14, 2500, 800, 0.16, 'bandpass', 1, t, musBus);
    // arp
    if (I > 0.35 && (s % 2 === 1 || I > 0.8)) {
      const n = SCALE[(M.step * 3 + Math.floor(M.step / 16) * 2) % SCALE.length];
      tone(M.root * 8 * Math.pow(2, (degree + n) / 12), spb * 1.2, 'triangle', 0.035 + I * 0.025, 0.995, t, musBus);
    }
    // pad on bar start
    if (s === 0) {
      [0, 7, 12].forEach((iv) => tone(M.root * 4 * Math.pow(2, (degree + iv) / 12), spb * 14, 'sine', 0.05, 1.002, t, musBus));
    }
    M.step++; M.next += spb;
  }
}
