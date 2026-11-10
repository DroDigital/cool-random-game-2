import * as THREE from 'three';
import { G } from './state.js';
import { rand, TAU, easeOut, yaw } from './util.js';

const MAXP = 6000;
let pts, pPos, pCol, pSize, pAlpha;
const pVel = new Float32Array(MAXP * 3), pLife = new Float32Array(MAXP), pMax = new Float32Array(MAXP);
const pS0 = new Float32Array(MAXP), pS1 = new Float32Array(MAXP), pGrav = new Float32Array(MAXP), pDrag = new Float32Array(MAXP);
const pA0 = new Float32Array(MAXP), pC = new Float32Array(MAXP * 3);
let pNext = 0;
const tmpC = new THREE.Color();
export const uniforms = { uScale: { value: 600 } };

const rings = [], slashes = [], beams = [], lights = [], texts = [];
let scene;

export function init(sc) {
  scene = sc;
  const geo = new THREE.BufferGeometry();
  pPos = new Float32Array(MAXP * 3); pCol = new Float32Array(MAXP * 3); pSize = new Float32Array(MAXP); pAlpha = new Float32Array(MAXP);
  geo.setAttribute('position', new THREE.BufferAttribute(pPos, 3).setUsage(THREE.DynamicDrawUsage));
  geo.setAttribute('color', new THREE.BufferAttribute(pCol, 3).setUsage(THREE.DynamicDrawUsage));
  geo.setAttribute('size', new THREE.BufferAttribute(pSize, 1).setUsage(THREE.DynamicDrawUsage));
  geo.setAttribute('alpha', new THREE.BufferAttribute(pAlpha, 1).setUsage(THREE.DynamicDrawUsage));
  const mat = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: `attribute float size; attribute float alpha; attribute vec3 color; varying vec3 vC; varying float vA; uniform float uScale;
      void main(){ vC=color; vA=alpha; vec4 mv=modelViewMatrix*vec4(position,1.0); gl_PointSize=max(0.0,size*uScale/(-mv.z)); gl_Position=projectionMatrix*mv; }`,
    fragmentShader: `varying vec3 vC; varying float vA;
      void main(){ float d=length(gl_PointCoord-0.5)*2.0; float a=smoothstep(1.0,0.0,d); a*=a; gl_FragColor=vec4(vC*(0.6+a*0.8), a*vA); }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  });
  pts = new THREE.Points(geo, mat);
  pts.frustumCulled = false;
  scene.add(pts);
  for (let i = 0; i < 6; i++) {
    const l = new THREE.PointLight(0xffffff, 0, 16, 1.6);
    l.userData = { t: 0, dur: 0.3, peak: 0 };
    scene.add(l); lights.push(l);
  }
}

export function emit(x, y, z, vx, vy, vz, life, s0, s1, color, grav = 0, drag = 0, a0 = 1) {
  const i = pNext; pNext = (pNext + 1) % MAXP;
  const i3 = i * 3;
  pPos[i3] = x; pPos[i3 + 1] = y; pPos[i3 + 2] = z;
  pVel[i3] = vx; pVel[i3 + 1] = vy; pVel[i3 + 2] = vz;
  pLife[i] = life; pMax[i] = life; pS0[i] = s0; pS1[i] = s1; pGrav[i] = grav; pDrag[i] = drag; pA0[i] = a0;
  tmpC.set(color);
  pC[i3] = tmpC.r; pC[i3 + 1] = tmpC.g; pC[i3 + 2] = tmpC.b;
}

// radial burst
export function burst(x, y, z, o = {}) {
  const n = o.count ?? 12, sp = o.speed ?? 6, life = o.life ?? 0.5, size = o.size ?? 0.5, col = o.color ?? 0xffffff;
  const up = o.up ?? 0, grav = o.gravity ?? 0, drag = o.drag ?? 2, flat = o.flat ?? 0;
  const cols = Array.isArray(col) ? col : null;
  for (let i = 0; i < n; i++) {
    const a = rand(TAU), e = flat ? 0 : rand(-1, 1) * 0.8, s = sp * rand(0.3, 1);
    const c = cols ? cols[(Math.random() * cols.length) | 0] : col;
    emit(x, y, z, Math.cos(a) * s * (1 - Math.abs(e) * 0.3), (flat ? 0 : e * s) + up * rand(0.5, 1), Math.sin(a) * s * (1 - Math.abs(e) * 0.3),
      life * rand(0.6, 1.2), size * rand(0.6, 1.3), 0, c, grav, drag);
  }
}
export function trail(x, y, z, color, size = 0.4, life = 0.3) {
  emit(x + rand(-0.1, 0.1), y + rand(-0.1, 0.1), z + rand(-0.1, 0.1), rand(-0.5, 0.5), rand(0, 1), rand(-0.5, 0.5), life, size, 0, color, 0, 2);
}

export function updateParticles(dt) {
  for (let i = 0; i < MAXP; i++) {
    if (pLife[i] <= 0) { pAlpha[i] = 0; continue; }
    pLife[i] -= dt;
    const i3 = i * 3;
    if (pLife[i] <= 0) { pAlpha[i] = 0; pSize[i] = 0; continue; }
    const k = 1 - pLife[i] / pMax[i];
    const dr = Math.exp(-pDrag[i] * dt);
    pVel[i3] *= dr; pVel[i3 + 1] = pVel[i3 + 1] * dr - pGrav[i] * dt; pVel[i3 + 2] *= dr;
    pPos[i3] += pVel[i3] * dt; pPos[i3 + 1] += pVel[i3 + 1] * dt; pPos[i3 + 2] += pVel[i3 + 2] * dt;
    if (pPos[i3 + 1] < 0.02 && pGrav[i] > 0) { pPos[i3 + 1] = 0.02; pVel[i3 + 1] *= -0.3; }
    pSize[i] = pS0[i] + (pS1[i] - pS0[i]) * k;
    pAlpha[i] = pA0[i] * (1 - k * k);
    pCol[i3] = pC[i3]; pCol[i3 + 1] = pC[i3 + 1]; pCol[i3 + 2] = pC[i3 + 2];
  }
  const g = pts.geometry;
  g.attributes.position.needsUpdate = g.attributes.color.needsUpdate = g.attributes.size.needsUpdate = g.attributes.alpha.needsUpdate = true;
}

// ---------- rings / discs ----------
let ringGeo, discGeo;
function getRing(disc) {
  if (!ringGeo) {
    ringGeo = new THREE.RingGeometry(0.9, 1, 64); ringGeo.rotateX(-Math.PI / 2);
    discGeo = new THREE.CircleGeometry(1, 48); discGeo.rotateX(-Math.PI / 2);
  }
  let r = rings.find((q) => !q.active && q.disc === disc);
  if (!r) {
    const m = new THREE.Mesh(disc ? discGeo : ringGeo, new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }));
    scene.add(m);
    r = { mesh: m, disc, active: false };
    rings.push(r);
  }
  return r;
}
export function ring(x, z, color, r0, r1, dur = 0.4, y = 0.12, op = 1, disc = false, thick = 1) {
  const r = getRing(disc);
  r.active = true; r.t = 0; r.dur = dur; r.r0 = r0; r.r1 = r1; r.op = op; r.thick = thick;
  r.mesh.position.set(x, y, z); r.mesh.visible = true; r.mesh.material.color.set(color);
  r.mesh.scale.set(r0, thick, r0);
}

// ---------- slash arcs ----------
const slashGeos = {};
export function slash(x, z, a, range, arc, color, dur = 0.22, inner = 0.45) {
  const key = Math.round(arc * 20) + '_' + inner;
  if (!slashGeos[key]) {
    slashGeos[key] = new THREE.RingGeometry(inner, 1, 40, 1, -arc / 2, arc);
    slashGeos[key].rotateX(-Math.PI / 2);
  }
  let s = slashes.find((q) => !q.active);
  if (!s) {
    s = { mesh: new THREE.Mesh(slashGeos[key], new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, toneMapped: false })), active: false };
    scene.add(s.mesh); slashes.push(s);
  }
  s.mesh.geometry = slashGeos[key];
  s.active = true; s.t = 0; s.dur = dur; s.range = range; s.mesh.visible = true;
  s.mesh.material.color.set(color);
  s.mesh.position.set(x, 0.9, z); s.mesh.rotation.y = -a;
  s.mesh.scale.set(range * 0.6, 1, range * 0.6);
}

// ---------- beams (lightning ribbons) ----------
const SEG = 10;
function makeBeam() {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array((SEG + 1) * 2 * 3), 3));
  const idx = [];
  for (let i = 0; i < SEG; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
  g.setIndex(idx);
  const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, toneMapped: false }));
  m.frustumCulled = false; scene.add(m);
  return { mesh: m, active: false };
}
export function beam(x1, y1, z1, x2, y2, z2, color, width = 0.3, dur = 0.18, jitter = 0.7) {
  let b = beams.find((q) => !q.active);
  if (!b) { b = makeBeam(); beams.push(b); }
  b.active = true; b.t = 0; b.dur = dur; b.mesh.visible = true; b.mesh.material.color.set(color);
  const p = b.mesh.geometry.attributes.position.array;
  const dx = x2 - x1, dz = z2 - z1, L = Math.hypot(dx, dz) || 1, nx = -dz / L, nz = dx / L;
  for (let i = 0; i <= SEG; i++) {
    const t = i / SEG, j = i === 0 || i === SEG ? 0 : rand(-jitter, jitter);
    const cx = x1 + dx * t + nx * j, cy = y1 + (y2 - y1) * t, cz = z1 + dz * t + nz * j;
    const w = width * (1 - Math.abs(t - 0.5) * 0.6);
    p[i * 6] = cx + nx * w; p[i * 6 + 1] = cy; p[i * 6 + 2] = cz + nz * w;
    p[i * 6 + 3] = cx - nx * w; p[i * 6 + 4] = cy; p[i * 6 + 5] = cz - nz * w;
  }
  b.mesh.geometry.attributes.position.needsUpdate = true;
  // sparks along bolt
  for (let i = 0; i < 4; i++) { const t = Math.random(); emit(x1 + dx * t, y1, z1 + dz * t, rand(-2, 2), rand(0, 2), rand(-2, 2), 0.3, 0.35, 0, color, 0, 3); }
}

// ---------- flash lights ----------
export function flash(x, y, z, color, intensity = 40, dur = 0.3, dist = 16) {
  let l = lights.find((q) => q.userData.t <= 0);
  if (!l) l = lights.reduce((a, b) => (a.userData.t < b.userData.t ? a : b));
  l.position.set(x, y, z); l.color.set(color); l.distance = dist;
  l.userData.t = dur; l.userData.dur = dur; l.userData.peak = intensity; l.intensity = intensity;
}

export function shake(a) { G.shake = Math.max(G.shake, a); }
export function hitstop(t) { G.hitstop = Math.max(G.hitstop, t); }

// ---------- floating text ----------
let layer;
const camV = new THREE.Vector3();
export function text(x, y, z, str, cls = '') {
  if (!layer) layer = document.getElementById('floaters');
  if (texts.length > 60) return;
  const el = document.createElement('div');
  el.className = 'ft ' + cls; el.textContent = str;
  layer.appendChild(el);
  texts.push({ el, x: x + rand(-0.4, 0.4), y, z: z + rand(-0.4, 0.4), t: 0, dur: cls.includes('big') ? 1.1 : 0.8, vx: rand(-1, 1) });
}

export function update(dt) {
  for (const r of rings) if (r.active) {
    r.t += dt; const k = r.t / r.dur;
    if (k >= 1) { r.active = false; r.mesh.visible = false; continue; }
    const s = r.r0 + (r.r1 - r.r0) * easeOut(k);
    r.mesh.scale.set(s, r.thick, s);
    r.mesh.material.opacity = r.op * (1 - k) * (r.disc ? 0.7 : 1);
  }
  for (const s of slashes) if (s.active) {
    s.t += dt; const k = s.t / s.dur;
    if (k >= 1) { s.active = false; s.mesh.visible = false; continue; }
    const sc = s.range * (0.6 + 0.4 * easeOut(Math.min(1, k * 2.5)));
    s.mesh.scale.set(sc, 1, sc);
    s.mesh.material.opacity = (1 - k) * 0.95;
  }
  for (const b of beams) if (b.active) {
    b.t += dt; const k = b.t / b.dur;
    if (k >= 1) { b.active = false; b.mesh.visible = false; continue; }
    b.mesh.material.opacity = 1 - k;
  }
  for (const l of lights) if (l.userData.t > 0) {
    l.userData.t -= dt; const k = Math.max(0, l.userData.t / l.userData.dur);
    l.intensity = l.userData.peak * k * k;
  } else l.intensity = 0;
  // floating text
  const cam = G.camera, W = innerWidth, H = innerHeight;
  for (let i = texts.length - 1; i >= 0; i--) {
    const t = texts[i]; t.t += dt;
    if (t.t > t.dur) { t.el.remove(); texts.splice(i, 1); continue; }
    const k = t.t / t.dur;
    camV.set(t.x + t.vx * k, t.y + k * 2.2, t.z).project(cam);
    t.el.style.transform = `translate(${(camV.x * 0.5 + 0.5) * W}px, ${(-camV.y * 0.5 + 0.5) * H}px) translate(-50%,-50%) scale(${k < 0.15 ? 0.5 + k * 6 : 1})`;
    t.el.style.opacity = k > 0.6 ? 1 - (k - 0.6) / 0.4 : 1;
  }
}
export function clearAll() {
  for (let i = 0; i < MAXP; i++) pLife[i] = 0;
  for (const r of rings) { r.active = false; r.mesh.visible = false; }
  for (const s of slashes) { s.active = false; s.mesh.visible = false; }
  for (const b of beams) { b.active = false; b.mesh.visible = false; }
}
