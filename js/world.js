import * as THREE from 'three';
import { G, BIOMES } from './state.js';
import { rand, randi, TAU, pick, chance } from './util.js';
import { mat, glowMat, G3 } from './models.js';
import * as FX from './fx.js';

export let lights = {};
const texCache = {};

export function initWorld(renderer, scene) {
  // environment map for metallic reflections
  const env = new THREE.Scene();
  const sky = new THREE.Mesh(new THREE.SphereGeometry(50, 24, 12), new THREE.ShaderMaterial({
    side: THREE.BackSide,
    vertexShader: 'varying vec3 p; void main(){ p=position; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }',
    fragmentShader: 'varying vec3 p; void main(){ float h=normalize(p).y; vec3 c=mix(vec3(0.05,0.06,0.1),vec3(0.5,0.55,0.8),smoothstep(-0.2,1.0,h)); gl_FragColor=vec4(c,1.); }',
  }));
  env.add(sky);
  for (const [x, y, z, s] of [[30, 25, 10, 14], [-25, 15, -20, 10], [0, 40, -30, 12]]) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(s, s * 0.4, 1), new THREE.MeshBasicMaterial({ color: 0xffffff })); m.position.set(x, y, z); m.lookAt(0, 0, 0); env.add(m);
  }
  const pm = new THREE.PMREMGenerator(renderer);
  scene.environment = pm.fromScene(env, 0.04).texture;
  scene.environmentIntensity = 0.5;

  lights.hemi = new THREE.HemisphereLight(0xffffff, 0x222233, 1.5);
  lights.sun = new THREE.DirectionalLight(0xffffff, 2.2);
  lights.sun.castShadow = true;
  lights.sun.shadow.mapSize.set(2048, 2048);
  const sc = lights.sun.shadow.camera; sc.left = -34; sc.right = 34; sc.top = 34; sc.bottom = -34; sc.near = 1; sc.far = 120;
  lights.sun.shadow.bias = -0.0004; lights.sun.shadow.normalBias = 0.05;
  lights.rim = new THREE.DirectionalLight(0xffffff, 2.4);
  lights.rim.position.set(15, 10, -25);
  lights.player = new THREE.PointLight(0xffffff, 30, 20, 1.4);
  scene.add(lights.hemi, lights.sun, lights.sun.target, lights.rim, lights.player);
}

export function applyBiomeLighting(bi, scene) {
  const b = BIOMES[bi];
  lights.hemi.color.set(b.hemiSky); lights.hemi.groundColor.set(b.hemiGround);
  lights.sun.color.set(b.sun); lights.rim.color.set(b.rim);
  lights.player.color.set(b.accent2);
  scene.fog = new THREE.FogExp2(b.fog, 0.0125);
  scene.background = new THREE.Color(b.fog);
}

function floorTextures(bi) {
  if (texCache[bi]) return texCache[bi];
  const b = BIOMES[bi], S = 1024, C = S / 2;
  const mk = () => { const c = document.createElement('canvas'); c.width = c.height = S; return c; };
  const a = mk(), e = mk(), ax = a.getContext('2d'), ex = e.getContext('2d');
  const hex = (n) => '#' + new THREE.Color(n).getHexString();
  // albedo: dark stone with polar tiling
  ax.fillStyle = hex(b.floor); ax.fillRect(0, 0, S, S);
  for (let i = 0; i < 4000; i++) { ax.fillStyle = `rgba(${randi(0, 40)},${randi(0, 40)},${randi(0, 50)},${rand(0.05, 0.25)})`; const s = rand(2, 14); ax.fillRect(rand(S), rand(S), s, s); }
  ax.strokeStyle = 'rgba(0,0,0,0.55)'; ax.lineWidth = 3;
  for (let r = 60; r < C; r += 52) { ax.beginPath(); ax.arc(C, C, r, 0, TAU); ax.stroke(); }
  for (let i = 0; i < 48; i++) { const t = i / 48 * TAU; ax.beginPath(); ax.moveTo(C + Math.cos(t) * 60, C + Math.sin(t) * 60); ax.lineTo(C + Math.cos(t) * C, C + Math.sin(t) * C); ax.stroke(); }
  // emissive
  ex.fillStyle = '#000'; ex.fillRect(0, 0, S, S);
  const col = hex(b.accent), col2 = hex(b.accent2);
  ex.shadowColor = col; ex.shadowBlur = 14; ex.strokeStyle = col; ex.lineCap = 'round';
  const ringAt = (f, w, c = col, dash) => { ex.strokeStyle = c; ex.lineWidth = w; ex.setLineDash(dash || []); ex.beginPath(); ex.arc(C, C, f * C, 0, TAU); ex.stroke(); ex.setLineDash([]); };
  ringAt(0.985, 8); ringAt(0.93, 2.5, col, [6, 10]); ringAt(0.78, 4); ringAt(0.52, 3, col2, [30, 14]); ringAt(0.3, 5); ringAt(0.14, 3, col2);
  // runes between 0.78 and 0.93
  ex.lineWidth = 3; ex.strokeStyle = col2;
  for (let i = 0; i < 36; i++) {
    const t = i / 36 * TAU, r0 = 0.82 * C, r1 = 0.9 * C;
    ex.beginPath(); ex.moveTo(C + Math.cos(t) * r0, C + Math.sin(t) * r0);
    for (let k = 0; k < randi(2, 4); k++) { const rr = rand(r0, r1), tt = t + rand(-0.03, 0.03); ex.lineTo(C + Math.cos(tt) * rr, C + Math.sin(tt) * rr); }
    ex.stroke();
  }
  // biome pattern
  ex.strokeStyle = col; ex.lineWidth = 3;
  if (bi === 0) { // lava cracks
    ex.shadowBlur = 18;
    for (let i = 0; i < 26; i++) {
      let t = rand(TAU), r = rand(0.3, 0.9) * C; let x = C + Math.cos(t) * r, y = C + Math.sin(t) * r;
      ex.strokeStyle = chance(0.5) ? col : col2; ex.lineWidth = rand(1.5, 4);
      ex.beginPath(); ex.moveTo(x, y);
      for (let k = 0; k < randi(4, 9); k++) { x += rand(-40, 40); y += rand(-40, 40); ex.lineTo(x, y); }
      ex.stroke();
    }
  } else if (bi === 1) { // snowflake symmetry
    ex.lineWidth = 3;
    for (let i = 0; i < 6; i++) {
      const t = i / 6 * TAU; ex.save(); ex.translate(C, C); ex.rotate(t);
      ex.beginPath(); ex.moveTo(0, 0); ex.lineTo(C * 0.52, 0); ex.stroke();
      for (const d of [0.2, 0.32, 0.44]) { ex.beginPath(); ex.moveTo(C * d, 0); ex.lineTo(C * (d + 0.07), C * 0.06); ex.moveTo(C * d, 0); ex.lineTo(C * (d + 0.07), -C * 0.06); ex.stroke(); }
      ex.restore();
    }
  } else { // circuit traces
    ex.lineWidth = 3;
    for (let i = 0; i < 40; i++) {
      let t = rand(TAU), r = rand(0.18, 0.75) * C; let x = C + Math.cos(t) * r, y = C + Math.sin(t) * r;
      ex.strokeStyle = chance(0.4) ? col2 : col;
      ex.beginPath(); ex.moveTo(x, y);
      for (let k = 0; k < randi(2, 5); k++) { if (chance(0.5)) x += pick([-1, 1]) * rand(20, 70); else y += pick([-1, 1]) * rand(20, 70); ex.lineTo(x, y); }
      ex.stroke(); ex.fillStyle = col2; ex.beginPath(); ex.arc(x, y, 5, 0, TAU); ex.fill();
    }
  }
  // center sigil: triple triangle
  ex.shadowBlur = 16; ex.strokeStyle = col2; ex.lineWidth = 4;
  for (let k = 0; k < 2; k++) { ex.beginPath(); for (let i = 0; i < 3; i++) { const t = i / 3 * TAU + k * Math.PI / 3 - Math.PI / 2; ex[i ? 'lineTo' : 'moveTo'](C + Math.cos(t) * C * 0.26, C + Math.sin(t) * C * 0.26); } ex.closePath(); ex.stroke(); }
  const ta = new THREE.CanvasTexture(a), te = new THREE.CanvasTexture(e);
  ta.colorSpace = te.colorSpace = THREE.SRGBColorSpace; ta.anisotropy = te.anisotropy = 8;
  return (texCache[bi] = { map: ta, emissive: te });
}

let glowSprite;
function sunSprite(color, size) {
  const c = document.createElement('canvas'); c.width = c.height = 256; const x = c.getContext('2d');
  const g = x.createRadialGradient(128, 128, 0, 128, 128, 128);
  const col = new THREE.Color(color), rgb = `${(col.r * 255) | 0},${(col.g * 255) | 0},${(col.b * 255) | 0}`;
  g.addColorStop(0, `rgba(255,255,255,1)`); g.addColorStop(0.12, `rgba(${rgb},0.95)`); g.addColorStop(0.15, `rgba(${rgb},0.5)`); g.addColorStop(0.5, `rgba(${rgb},0.12)`); g.addColorStop(1, `rgba(${rgb},0)`);
  x.fillStyle = g; x.fillRect(0, 0, 256, 256);
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), blending: THREE.AdditiveBlending, depthWrite: false, fog: false, transparent: true }));
  s.scale.set(size, size, 1); return s;
}

export function buildArena(bi, R, scene, o = {}) {
  const b = BIOMES[bi], group = new THREE.Group(), obstacles = [], anim = [], emitters = [];
  const A = { group, radius: R, obstacles, anim, emitters, biome: b, bi, bg: new THREE.Group() };
  const tx = floorTextures(bi);
  // platform
  const topMat = new THREE.MeshStandardMaterial({ map: tx.map, emissiveMap: tx.emissive, emissive: 0xffffff, emissiveIntensity: 0.85, roughness: 0.42, metalness: 0.55 });
  const sideMat = mat(b.rock, b.accent, 0.08, { m: 0.5, r: 0.7 });
  const plat = new THREE.Mesh(new THREE.CylinderGeometry(R, R * 0.96, 1.6, 72, 1), [sideMat, topMat, sideMat]);
  plat.position.y = -0.8; plat.receiveShadow = true; group.add(plat);
  const under = new THREE.Mesh(new THREE.ConeGeometry(R * 0.96, R * 1.1, 9, 3, true), mat(b.rock, b.accent, 0.05, { m: 0.3, r: 0.9 }));
  under.rotation.x = Math.PI; under.position.y = -1.6 - R * 0.55; group.add(under);
  // jagged crystals hanging below
  for (let i = 0; i < 14; i++) { const a = rand(TAU), r = rand(0.2, 0.8) * R; const c = new THREE.Mesh(new THREE.ConeGeometry(rand(0.5, 1.4), rand(3, 9), 5), glowMat(b.accent, 1.6)); c.rotation.x = Math.PI; c.position.set(Math.cos(a) * r, -3 - R * 0.35 - rand(2), Math.sin(a) * r); group.add(c); }
  const rim = new THREE.Mesh(new THREE.TorusGeometry(R, 0.14, 6, 96), glowMat(b.accent, 3)); rim.rotation.x = Math.PI / 2; rim.position.y = 0.05; group.add(rim);
  // edge barrier shimmer
  const wall = new THREE.Mesh(new THREE.CylinderGeometry(R, R, 5, 64, 1, true), new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
    uniforms: { c: { value: new THREE.Color(b.accent) }, t: { value: 0 } },
    vertexShader: 'varying vec2 u; varying vec3 p; void main(){ u=uv; p=position; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }',
    fragmentShader: 'uniform vec3 c; uniform float t; varying vec2 u; varying vec3 p; void main(){ float f=pow(1.0-u.y,3.0); float s=0.5+0.5*sin(atan(p.z,p.x)*40.0+t*2.0+u.y*6.0); gl_FragColor=vec4(c*(1.2+s),f*(0.16+0.12*s)); }',
  }));
  wall.position.y = 2.5; group.add(wall); A.wall = wall;
  // edge spikes
  for (let i = 0; i < 28; i++) {
    const a = i / 28 * TAU + rand(-0.05, 0.05);
    const s = new THREE.Mesh(new THREE.ConeGeometry(rand(0.25, 0.55), rand(1.4, 3.6), 4), mat(b.rock, b.accent, 0.6, { m: 0.6 }));
    s.position.set(Math.cos(a) * (R + 0.4), 0.8, Math.sin(a) * (R + 0.4)); s.rotation.set(rand(-0.2, 0.2), rand(TAU), rand(-0.3, 0.3)); s.castShadow = true; group.add(s);
  }
  // pillars (obstacles)
  const pillars = o.pillars ?? randi(5, 7);
  const spots = [];
  const portalZone = { x: 0, z: -R * 0.78 };
  let tries = 0;
  while (spots.length < pillars && tries++ < 200) {
    const a = rand(TAU), r = rand(0.38, 0.8) * R, x = Math.cos(a) * r, z = Math.sin(a) * r;
    if (Math.hypot(x, z) < 7) continue;
    if (Math.hypot(x - portalZone.x, z - portalZone.z) < 9) continue;
    if (spots.some((s) => Math.hypot(s.x - x, s.z - z) < 9)) continue;
    spots.push({ x, z });
  }
  const pillMat = mat(0x181420, b.accent, 0.1, { m: 0.7, r: 0.4 }), bandMat = glowMat(b.accent, 2.4);
  for (const s of spots) {
    const g = new THREE.Group(), h = rand(3.2, 4.6);
    const body = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.4, h, 8), pillMat); body.position.y = h / 2; body.castShadow = body.receiveShadow = true; g.add(body);
    for (const y of [0.25, 0.5, 0.78]) { const bd = new THREE.Mesh(new THREE.CylinderGeometry(1.16 - y * 0.1, 1.16 - y * 0.1, 0.12, 8), bandMat); bd.position.y = h * y; g.add(bd); }
    const cap = new THREE.Mesh(G3.oct(0.9, 0), bandMat); cap.position.y = h + 1.3; cap.scale.y = 1.6; g.add(cap); anim.push((dt, t) => { cap.rotation.y += dt; cap.position.y = h + 1.3 + Math.sin(t * 2 + s.x) * 0.2; });
    g.position.set(s.x, 0, s.z); group.add(g);
    obstacles.push({ x: s.x, z: s.z, r: 1.45 });
  }
  // low decor: crystal clusters, braziers
  for (let i = 0; i < 16; i++) {
    const a = rand(TAU), r = rand(0.55, 0.95) * R, x = Math.cos(a) * r, z = Math.sin(a) * r;
    if (obstacles.some((p) => Math.hypot(p.x - x, p.z - z) < 3)) continue;
    const cg = new THREE.Group();
    for (let k = 0; k < randi(2, 4); k++) { const c = new THREE.Mesh(new THREE.ConeGeometry(rand(0.15, 0.35), rand(0.7, 1.8), 5), glowMat(chance(0.7) ? b.accent : b.accent2, 1.8)); c.position.set(rand(-0.4, 0.4), 0.5, rand(-0.4, 0.4)); c.rotation.set(rand(-0.4, 0.4), 0, rand(-0.4, 0.4)); cg.add(c); }
    cg.position.set(x, 0, z); group.add(cg);
  }
  const brz = bi === 0 ? 6 : 3;
  for (let i = 0; i < brz; i++) {
    const a = i / brz * TAU + 0.4, x = Math.cos(a) * (R - 1.6), z = Math.sin(a) * (R - 1.6);
    const g = new THREE.Group();
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.5, 1.4, 6), pillMat); stem.position.y = 0.7; g.add(stem);
    const bowl = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.35, 0.3, 6), bandMat); bowl.position.y = 1.5; g.add(bowl);
    g.position.set(x, 0, z); group.add(g); emitters.push({ x, y: 1.7, z });
  }
  scene.add(group);

  // ---- background: sky, stars, floating islands, towers
  const bg = A.bg;
  const skyMat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: { top: { value: new THREE.Color(b.skyTop) }, mid: { value: new THREE.Color(b.skyMid) }, bot: { value: new THREE.Color(b.skyBot) } },
    vertexShader: 'varying vec3 p; void main(){ p=normalize(position); gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }',
    fragmentShader: 'uniform vec3 top,mid,bot; varying vec3 p; void main(){ float h=p.y; vec3 c=h>0.0?mix(mid,top,pow(h,0.6)):mix(mid,bot,pow(-h,0.5)); gl_FragColor=vec4(c,1.); }',
  });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(450, 32, 16), skyMat); sky.renderOrder = -10; bg.add(sky);
  A.sky = sky;
  const sp = sunSprite(b.accent, 330); sp.position.set(-120, 90, -380); bg.add(sp);
  const sp2 = sunSprite(b.accent2, 120); sp2.position.set(-120, 90, -379); bg.add(sp2);
  const sg = new THREE.BufferGeometry(), sa = new Float32Array(900);
  for (let i = 0; i < 300; i++) { const u = rand(TAU), v = rand(0.05, 1), r = 420; sa[i * 3] = Math.cos(u) * Math.sqrt(1 - v * v) * r; sa[i * 3 + 1] = v * r; sa[i * 3 + 2] = Math.sin(u) * Math.sqrt(1 - v * v) * r; }
  sg.setAttribute('position', new THREE.BufferAttribute(sa, 3));
  bg.add(new THREE.Points(sg, new THREE.PointsMaterial({ color: 0xffffff, size: 1.8, sizeAttenuation: false, fog: false, transparent: true, opacity: 0.8 })));
  const far = new THREE.Group(); bg.add(far); A.far = far;
  for (let i = 0; i < 26; i++) {
    const a = rand(TAU), r = rand(70, 190), s = rand(5, 22);
    const g = new THREE.Group();
    const rock = new THREE.Mesh(G3.ico(1, 0), mat(b.rock, b.accent, 0.05, { m: 0.3, r: 0.9 })); rock.scale.set(s, s * rand(0.4, 0.7), s); g.add(rock);
    const under = new THREE.Mesh(new THREE.ConeGeometry(1, 1, 6), mat(b.rock, 0, 0, { r: 0.9 })); under.scale.set(s * 0.8, s * 1.1, s * 0.8); under.rotation.x = Math.PI; under.position.y = -s * 0.8; g.add(under);
    if (chance(0.7)) { const c = new THREE.Mesh(G3.oct(1, 0), glowMat(b.accent, 2)); c.scale.set(s * 0.12, s * 0.4, s * 0.12); c.position.y = s * 0.55; g.add(c); }
    g.position.set(Math.cos(a) * r, rand(-45, 30), Math.sin(a) * r); g.rotation.y = rand(TAU);
    g.userData.spin = rand(-0.05, 0.05); far.add(g);
  }
  for (let i = 0; i < 9; i++) { // distant spires
    const a = i / 9 * TAU + rand(-0.2, 0.2), r = rand(220, 280), h = rand(60, 160);
    const t = new THREE.Mesh(new THREE.ConeGeometry(rand(6, 14), h, 5), mat(b.rock, b.accent, 0.08, { r: 0.9 })); t.position.set(Math.cos(a) * r, h / 2 - 90, Math.sin(a) * r); bg.add(t);
    const l = new THREE.Mesh(G3.oct(2, 0), glowMat(b.accent2, 3)); l.position.set(t.position.x, h - 80, t.position.z); bg.add(l);
  }
  scene.add(bg);
  return A;
}

export function updateArena(A, dt, t, camPos) {
  A.wall.material.uniforms.t.value = t;
  for (const f of A.anim) f(dt, t);
  A.far.children.forEach((g) => (g.rotation.y += g.userData.spin * dt));
  A.bg.position.copy(camPos).setY(0); // keep sky centered on camera
  // ambient motes
  const b = A.biome;
  if (Math.random() < dt * 40) {
    const a = rand(TAU), r = Math.sqrt(Math.random()) * A.radius;
    const bi = A.bi;
    const c = b.mote[(Math.random() * b.mote.length) | 0];
    if (bi === 1) FX.emit(Math.cos(a) * r, rand(8, 14), Math.sin(a) * r, rand(-1, 1), rand(-2.5, -1.5), rand(-1, 1), 5, 0.25, 0.1, c, 0, 0, 0.8);
    else FX.emit(Math.cos(a) * r, rand(0.2, 2), Math.sin(a) * r, rand(-0.5, 0.5), rand(1, 3), rand(-0.5, 0.5), rand(2, 4), 0.3, 0.05, c, 0, 0.3, 0.9);
  }
  for (const e of A.emitters) if (Math.random() < dt * 25) FX.emit(e.x + rand(-0.2, 0.2), e.y, e.z + rand(-0.2, 0.2), rand(-0.3, 0.3), rand(2, 4), rand(-0.3, 0.3), rand(0.5, 1), 0.7, 0, pick(b.mote), 0, 0.5);
}

export function disposeArena(A, scene) {
  for (const g of [A.group, A.bg]) {
    scene.remove(g);
    g.traverse((o) => {
      if (o.isMesh || o.isPoints) {
        if (o.geometry && !o.geometry.userData.shared && !isCached(o.geometry)) o.geometry.dispose();
        const ms = Array.isArray(o.material) ? o.material : [o.material];
        ms.forEach((m) => m.dispose && m.dispose());
      }
    });
  }
}
import { isCachedGeo } from './models.js';
const isCached = (g) => isCachedGeo(g);
