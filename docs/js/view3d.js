// SouthLight — realistic 3D view of a landing site (three.js).
// Terrain = NASA LRO LOLA elevation (40 m close-ups / 200 m tiles), placed on
// the curved Moon in the site's local East-North-Up frame. The Sun lights it
// from its true direction (real shadows); Earth is lit by the same Sun, so its
// phase is correct automatically. Code written with AI assistance (Claude).
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

const R = 1737400;
let TILES = null, PATCHES = null; const tileCache = new Map();

export async function loadDem(base = 'data/dem') {
  [TILES, PATCHES] = await Promise.all([fetch(`${base}/tiles.json`).then(r => r.json()), fetch(`${base}/patches.json`).then(r => r.json())]);
  TILES.base = base;
}
function toXY(lat, lon) { const la = lat * Math.PI / 180, lo = lon * Math.PI / 180, rho = 2 * R * Math.tan(Math.PI / 4 + la / 2); return [rho * Math.sin(lo), rho * Math.cos(lo)]; }
function toLatLon(x, y) { const rho = Math.hypot(x, y); return [2 * Math.atan(rho / (2 * R)) - Math.PI / 2, Math.atan2(x, y)]; }
async function tile(ti, tj) {
  const k = ti + '_' + tj;
  if (!tileCache.has(k)) tileCache.set(k, fetch(`${TILES.base}/t_${ti}_${tj}.bin`).then(r => r.arrayBuffer()).then(b => new Int16Array(b)));
  return tileCache.get(k);
}

// Returns {n, sp, x0, y0, h:Float32Array(n*n)} grid centred on (x0,y0); row 0 = +y (north side in map coords)
async function terrainFor(site) {
  if (site.id && PATCHES[site.id]) {
    const p = PATCHES[site.id];
    const raw = new Int16Array(await (await fetch(`${TILES.base}/p_${site.id}.bin`)).arrayBuffer());
    return { n: p.n, sp: p.spacing_m, x0: p.x0, y0: p.y0, h: Float32Array.from(raw) };
  }
  if (site.lat > -84.6) return null;
  const [x0, y0] = toXY(site.lat, site.lon), sp = TILES.spacing_m, T = TILES.tile, n = 161;
  const h = new Float32Array(n * n);
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const x = x0 + (i - (n - 1) / 2) * sp, y = y0 - (j - (n - 1) / 2) * sp;
    const gx = (x + TILES.half_m) / sp - 0.5, gy = (TILES.half_m - y) / sp - 0.5;
    const ix = Math.round(gx), iy = Math.round(gy);
    const ti = Math.floor(ix / T), tj = Math.floor(iy / T);
    if (ti < 0 || tj < 0 || ti >= TILES.ntiles || tj >= TILES.ntiles) { h[j * n + i] = 0; continue; }
    const t = await tile(ti, tj); h[j * n + i] = t[(iy - tj * T) * T + (ix - ti * T)];
  }
  return { n, sp, x0, y0, h };
}

function glowTexture(inner, outer) {
  const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d');
  const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64); gr.addColorStop(0, inner); gr.addColorStop(0.15, inner); gr.addColorStop(1, outer);
  g.fillStyle = gr; g.fillRect(0, 0, 128, 128); return new THREE.CanvasTexture(c);
}

function regolithTexture() {
  const N = 512, c = document.createElement('canvas'); c.width = c.height = N; const g = c.getContext('2d');
  const im = g.createImageData(N, N); let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  // value noise, several octaves (tileable)
  const oct = [8, 16, 32, 64, 128].map(f => { const a = new Float32Array(f * f); for (let i = 0; i < a.length; i++) a[i] = rnd(); return { f, a }; });
  const smooth = t => t * t * (3 - 2 * t);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    let v = 0, amp = 0.5, tot = 0;
    for (const { f, a } of oct) { const fx = x / N * f, fy = y / N * f, x0 = Math.floor(fx), y0 = Math.floor(fy), tx = smooth(fx - x0), ty = smooth(fy - y0);
      const A = a[(y0 % f) * f + x0 % f], B = a[(y0 % f) * f + (x0 + 1) % f], C = a[((y0 + 1) % f) * f + x0 % f], D = a[((y0 + 1) % f) * f + (x0 + 1) % f];
      v += amp * (A + (B - A) * tx + (C - A) * ty + (A - B - C + D) * tx * ty); tot += amp; amp *= 0.55; }
    const k = Math.round(150 + (v / tot - 0.5) * 120); const o = (y * N + x) * 4; im.data[o] = im.data[o + 1] = im.data[o + 2] = k; im.data[o + 3] = 255;
  }
  g.putImageData(im, 0, 0);
  // small craters
  for (let i = 0; i < 140; i++) { const x = rnd() * N, y = rnd() * N, r = 2 + rnd() ** 3 * 22;
    const gr = g.createRadialGradient(x - r * 0.25, y - r * 0.25, 0, x, y, r); gr.addColorStop(0, 'rgba(0,0,0,0.28)'); gr.addColorStop(0.8, 'rgba(0,0,0,0.12)'); gr.addColorStop(0.92, 'rgba(255,255,255,0.18)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.beginPath(); g.arc(x, y, r, 0, 7); g.fill(); }
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t;
}

export class View3D {
  constructor(container) {
    this.el = container;
    const r = this.renderer = new THREE.WebGLRenderer({ antialias: true, logarithmicDepthBuffer: true, preserveDrawingBuffer: true });
    r.setPixelRatio(Math.min(2, devicePixelRatio || 1)); r.shadowMap.enabled = true; r.shadowMap.type = THREE.PCFSoftShadowMap;
    r.toneMapping = THREE.ACESFilmicToneMapping; r.toneMappingExposure = 1.1; r.outputColorSpace = THREE.SRGBColorSpace;
    container.appendChild(r.domElement);
    this.scene = new THREE.Scene(); this.scene.background = new THREE.Color(0x000000);
    this.camera = new THREE.PerspectiveCamera(60, 1, 0.5, 3e7);
    this.ambient = new THREE.HemisphereLight(0x8a94b0, 0x202020, 0.35); this.detail = regolithTexture(); this.scene.add(this.ambient);
    this.sunLight = new THREE.DirectionalLight(0xfff6e8, 3.2); this.sunLight.castShadow = true;
    this.sunLight.shadow.mapSize.set(4096, 4096); this.sunLight.shadow.bias = -0.0004; this.sunLight.shadow.normalBias = 2;
    this.scene.add(this.sunLight, this.sunLight.target);
    // stars
    const sv = []; for (let i = 0; i < 2500; i++) { const u = Math.random() * 2 - 1, a = Math.random() * 6.283, s = Math.sqrt(1 - u * u); sv.push(s * Math.cos(a) * 2e7, u * 2e7, s * Math.sin(a) * 2e7); }
    const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.Float32BufferAttribute(sv, 3));
    this.stars = new THREE.Points(sg, new THREE.PointsMaterial({ color: 0xffffff, size: 1.3, sizeAttenuation: false, transparent: true, opacity: 0.8 }));
    this.scene.add(this.stars);
    // sun disk + glow (distance 1.5e7 m, true angular size 0.53°)
    const SD = 1.5e7, sr = SD * Math.tan(0.2666 * Math.PI / 180);
    this.sun = new THREE.Group();
    this.sun.add(new THREE.Mesh(new THREE.SphereGeometry(sr, 24, 16), new THREE.MeshBasicMaterial({ color: 0xfffaf0 })));
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture('rgba(255,245,220,1)', 'rgba(255,200,100,0)'), blending: THREE.AdditiveBlending, depthWrite: false }));
    glow.scale.setScalar(sr * 14); this.sun.add(glow); this.sunDist = SD; this.scene.add(this.sun);
    // earth (true angular diameter ~1.9°) lit by the sun -> correct phase
    const ED = 1.2e7, er = ED * Math.tan(0.95 * Math.PI / 180);
    this.earth = new THREE.Mesh(new THREE.SphereGeometry(er, 48, 32), new THREE.MeshStandardMaterial({ color: 0x3f7fe0, roughness: 0.7, emissive: 0x050a18 }));
    const clouds = new THREE.Mesh(new THREE.SphereGeometry(er * 1.01, 48, 32), new THREE.MeshStandardMaterial({ color: 0xffffff, transparent: true, opacity: 0.35, roughness: 1 }));
    this.earth.add(clouds); this.earthDist = ED; this.scene.add(this.earth);
    // site marker (drone view)
    this.marker = new THREE.Group();
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(18, 18, 900, 12), new THREE.MeshBasicMaterial({ color: 0xa78bfa, transparent: true, opacity: 0.55 }));
    beam.position.y = 450; this.marker.add(beam);
    const ring = new THREE.Mesh(new THREE.RingGeometry(80, 120, 48), new THREE.MeshBasicMaterial({ color: 0xa78bfa, side: THREE.DoubleSide }));
    ring.rotation.x = -Math.PI / 2; ring.position.y = 6; this.marker.add(ring); this.scene.add(this.marker);
    this.controls = new OrbitControls(this.camera, r.domElement); this.controls.enableDamping = true; this.controls.maxPolarAngle = Math.PI * 0.495;
    this.mode = 'astro'; this.yaw = 0; this.pitch = 0.03; this.eye = 1.8;
    this.bindLook();
    new ResizeObserver(() => this.resize()).observe(container); this.resize();
    const loop = () => { if (this.mode === 'drone') this.controls.update(); this.renderer.render(this.scene, this.camera); requestAnimationFrame(loop); };
    loop();
  }
  resize() { const w = this.el.clientWidth, h = this.el.clientHeight; this.renderer.setSize(w, h, false); this.camera.aspect = w / h; this.camera.updateProjectionMatrix(); }
  bindLook() {
    const dom = this.renderer.domElement; let d = null;
    dom.addEventListener('pointerdown', e => { if (this.mode !== 'astro') return; d = { x: e.clientX, y: e.clientY, yaw: this.yaw, pitch: this.pitch }; dom.setPointerCapture(e.pointerId); });
    dom.addEventListener('pointermove', e => { if (!d) return; this.yaw = d.yaw - (e.clientX - d.x) * 0.004; this.pitch = Math.max(-0.6, Math.min(1.2, d.pitch + (e.clientY - d.y) * 0.004)); this.applyAstro(); this.onLook && this.onLook(); });
    dom.addEventListener('pointerup', () => d = null);
  }
  // ENU (east, north, up) -> three (x=east, y=up, z=-north)
  static v(e, n, u) { return new THREE.Vector3(e, u, -n); }

  async setSite(site) {
    this.site = site;
    if (this.terrain) { this.scene.remove(this.terrain); this.terrain.geometry.dispose(); }
    if (this.ringMesh) { this.scene.remove(this.ringMesh); this.ringMesh.geometry.dispose(); }
    const T = await terrainFor(site);
    const la0 = site.lat * Math.PI / 180, lo0 = site.lon * Math.PI / 180;
    const up = [Math.cos(la0) * Math.cos(lo0), Math.cos(la0) * Math.sin(lo0), Math.sin(la0)], east = [-Math.sin(lo0), Math.cos(lo0), 0];
    const north = [up[1] * east[2] - up[2] * east[1], up[2] * east[0] - up[0] * east[2], up[0] * east[1] - up[1] * east[0]];
    let h0 = site.heightM || 0;
    let geo, half;
    if (T) {
      const { n, sp, x0, y0, h } = T; h0 = h[(n >> 1) * n + (n >> 1)];
      const pos = new Float32Array(n * n * 3), col = new Float32Array(n * n * 3), uv = new Float32Array(n * n * 2), rep = sp / 160;
      const o = up.map(v => v * (R + h0));
      for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
        const k = j * n + i, x = x0 + (i - (n - 1) / 2) * sp, y = y0 - (j - (n - 1) / 2) * sp;
        const [la, lo] = toLatLon(x, y), rr = R + h[k];
        const p = [rr * Math.cos(la) * Math.cos(lo) - o[0], rr * Math.cos(la) * Math.sin(lo) - o[1], rr * Math.sin(la) - o[2]];
        const e = p[0] * east[0] + p[1] * east[1] + p[2] * east[2], nn = p[0] * north[0] + p[1] * north[1] + p[2] * north[2], u = p[0] * up[0] + p[1] * up[1] + p[2] * up[2];
        pos.set([e, u, -nn], k * 3);
        const v = 0.42 + 0.06 * Math.sin(i * 12.9898 + j * 78.233) * Math.sin(i * 0.37 + j * 0.61) + 0.04 * ((h[k] % 97) / 97);
        col.set([v, v * 0.985, v * 0.96], k * 3); uv.set([i * rep, j * rep], k * 2);
      }
      const idx = []; for (let j = 0; j < n - 1; j++) for (let i = 0; i < n - 1; i++) { const a = j * n + i; idx.push(a, a + n, a + 1, a + 1, a + n, a + n + 1); }
      geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setAttribute('color', new THREE.BufferAttribute(col, 3)); geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
      geo.setIndex(idx); geo.computeVertexNormals(); half = (n - 1) / 2 * sp;
      this.terrainNote = sp <= 40 ? 'LOLA 40 m terrain' : `LOLA ${sp} m terrain`;
    } else {
      // no polar DEM here: gentle generic plain (clearly labelled)
      const n = 161, sp = 60; half = (n - 1) / 2 * sp; geo = new THREE.PlaneGeometry(half * 2, half * 2, n - 1, n - 1); geo.rotateX(-Math.PI / 2);
      const p = geo.attributes.position; for (let i = 0; i < p.count; i++) { const x = p.getX(i), z = p.getZ(i); p.setY(i, 6 * Math.sin(x / 700) * Math.cos(z / 900) + 3 * Math.sin(x / 210 + z / 330) - (x * x + z * z) / (2 * R)); }
      const uvA = geo.attributes.uv; for (let i = 0; i < uvA.count; i++) uvA.setXY(i, uvA.getX(i) * 60, uvA.getY(i) * 60);
      const col = new Float32Array(p.count * 3).fill(0.45); geo.setAttribute('color', new THREE.BufferAttribute(col, 3)); geo.computeVertexNormals(); h0 = 0;
      this.terrainNote = 'Generic plain — no LOLA polar terrain loaded for this site';
    }
    this.half = half;
    this.terrain = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, map: this.detail, roughness: 0.97, metalness: 0 }));
    this.terrain.receiveShadow = true; this.terrain.castShadow = true; this.scene.add(this.terrain);
    // far skyline ring from the LOLA horizon mask (what lies beyond the close-up terrain)
    const mask = site.mask, N = mask.length, D = Math.max(half * 1.6, 15000), pos = [], ind = [];
    for (let a = 0; a <= N; a++) {
      const az = (a % N) / N * 2 * Math.PI, el = mask[a % N] * Math.PI / 180;
      const e = Math.sin(az) * D, nn = Math.cos(az) * D, top = this.eye + Math.tan(el) * D, bot = top - 30000;
      pos.push(e, bot, -nn, e, top, -nn); if (a < N) { const b = a * 2; ind.push(b, b + 2, b + 1, b + 1, b + 2, b + 3); }
    }
    const rg = new THREE.BufferGeometry(); rg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); rg.setIndex(ind); rg.computeVertexNormals();
    this.ringMesh = new THREE.Mesh(rg, new THREE.MeshStandardMaterial({ color: 0x3a3a3a, roughness: 1, side: THREE.DoubleSide }));
    this.scene.add(this.ringMesh);
    // shadow camera covers the terrain patch
    const sc = this.sunLight.shadow.camera; sc.left = sc.bottom = -half * 1.1; sc.right = sc.top = half * 1.1; sc.near = 1; sc.far = 4 * half + 4e4; sc.updateProjectionMatrix();
    this.setMode(this.mode, true);
  }

  // sun/earth: {az, el} in degrees; sunFrac 0..1
  setSky(sun, earth, sunFrac) {
    const dir = (b) => { const a = b.az * Math.PI / 180, e = b.el * Math.PI / 180; return View3D.v(Math.cos(e) * Math.sin(a), Math.cos(e) * Math.cos(a), Math.sin(e)); };
    const ds = dir(sun), de = dir(earth);
    this.sun.position.copy(ds).multiplyScalar(this.sunDist);
    this.earth.position.copy(de).multiplyScalar(this.earthDist);
    const L = Math.max(this.half || 5000, 5000) * 2;
    this.sunLight.position.copy(ds).multiplyScalar(L); this.sunLight.target.position.set(0, 0, 0);
    this.sunLight.intensity = sun.el > -1.5 ? 3.2 : 0;   // terrain itself blocks low light via shadows
    this.earth.lookAt(this.sun.position);
    this.sunDir = ds;
  }

  setMode(mode, keep) {
    this.mode = mode; const astro = mode === 'astro';
    this.ambient.intensity = astro ? 0.25 : 0.9;
    this.controls.enabled = !astro; this.ringMesh && (this.ringMesh.visible = astro); this.marker.visible = !astro;
    if (astro) { this.camera.fov = 60; this.camera.near = 0.5; this.applyAstro(); }
    else {
      this.camera.fov = 50; this.camera.near = 5;
      if (!keep || !this.droneSet) {
        const d = Math.min(this.half * 0.9, 9000), back = this.sunDir ? this.sunDir.clone().setY(0).normalize().multiplyScalar(-1) : new THREE.Vector3(0, 0, 1);
        const side = new THREE.Vector3(-back.z, 0, back.x);
        this.camera.position.copy(back.multiplyScalar(d * 0.4).add(side.multiplyScalar(d * 0.9))).setY(d * 0.55);
        this.controls.target.set(0, 0, 0); this.droneSet = true;
      }
      this.controls.maxDistance = this.half * 1.8; this.controls.minDistance = 300;
    }
    this.camera.updateProjectionMatrix();
  }
  lookToward(az) { this.yaw = -az * Math.PI / 180; this.applyAstro(); }
  applyAstro() {
    if (this.mode !== 'astro') return;
    this.camera.position.set(0, this.eye, 0);
    const az = -this.yaw, f = new THREE.Vector3(Math.sin(az) * Math.cos(this.pitch), Math.sin(this.pitch), -Math.cos(az) * Math.cos(this.pitch));
    this.camera.lookAt(f.add(this.camera.position));
  }
}
