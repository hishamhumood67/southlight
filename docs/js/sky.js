// SouthLight — first-person 360° sky view (canvas 2D).
// Draws the real LOLA skyline, the Sun and Earth at true azimuth/elevation,
// their paths, and lets the user drag to look around.
// Code written with AI assistance (Claude).
import { horizonAt } from './astro.js';

const STARS = Array.from({ length: 420 }, (_, i) => {
  const r = Math.sin(i * 9301 + 49297) * 233280; const f = r - Math.floor(r);
  const r2 = Math.sin(i * 1777 + 7) * 99991; const g = r2 - Math.floor(r2);
  return { az: f * 360, el: -5 + g * 95, m: (i % 7) / 7 };
});
const DIRS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];

export class SkyView {
  constructor(canvas, onPan) {
    this.c = canvas; this.ctx = canvas.getContext('2d'); this.viewAz = 0; this.onPan = onPan;
    this.state = null;
    let drag = null;
    const down = e => { drag = { x: e.clientX, az: this.viewAz }; canvas.setPointerCapture(e.pointerId); canvas.style.cursor = 'grabbing'; };
    const move = e => { if (!drag) return; const fov = this.fov(); this.viewAz = ((drag.az - (e.clientX - drag.x) * fov / canvas.clientWidth) % 360 + 360) % 360; this.draw(); };
    const up = () => { drag = null; canvas.style.cursor = 'grab'; this.onPan && this.onPan(this.viewAz); };
    canvas.addEventListener('pointerdown', down); canvas.addEventListener('pointermove', move);
    canvas.addEventListener('pointerup', up); canvas.addEventListener('pointercancel', up);
    new ResizeObserver(() => this.draw()).observe(canvas);
  }
  fov() { return this.c.clientWidth < 600 ? 130 : 200; }
  lookAt(az) { this.viewAz = az; this.draw(); }
  set(state) { this.state = state; this.draw(); }

  draw() {
    const s = this.state; if (!s) return;
    const c = this.c, dpr = Math.min(2, window.devicePixelRatio || 1);
    const W = c.clientWidth, H = c.clientHeight;
    if (c.width !== Math.round(W * dpr) || c.height !== Math.round(H * dpr)) { c.width = Math.round(W * dpr); c.height = Math.round(H * dpr); }
    const g = this.ctx; g.setTransform(dpr, 0, 0, dpr, 0, 0);
    const fov = this.fov(), pxDeg = W / fov;
    const elMin = s.elMin, elMax = s.elMax, groundPx = 28;
    const yOf = el => (H - groundPx) - (el - elMin) / (elMax - elMin) * (H - groundPx - 10);
    const dAz = az => { let d = az - this.viewAz; d = ((d + 540) % 360) - 180; return d; };
    const xOf = az => W / 2 + dAz(az) * pxDeg;
    const lit = s.sunFrac;

    // sky
    const sky = g.createLinearGradient(0, 0, 0, H);
    sky.addColorStop(0, '#000004'); sky.addColorStop(1, lit > 0 ? '#0b0f1c' : '#020308');
    g.fillStyle = sky; g.fillRect(0, 0, W, H);
    // stars
    for (const st of STARS) {
      const x = xOf(st.az); if (x < -2 || x > W + 2) continue; const y = yOf(st.el); if (y < 0) continue;
      g.fillStyle = `rgba(255,255,255,${0.25 + 0.5 * st.m * (lit > 0 ? 0.4 : 1)})`; g.fillRect(x, y, st.m > 0.7 ? 1.6 : 1, st.m > 0.7 ? 1.6 : 1);
    }
    // elevation grid
    g.strokeStyle = '#ffffff10'; g.fillStyle = '#ffffff40'; g.font = '10px system-ui'; g.lineWidth = 1;
    const step = (elMax - elMin) > 40 ? 15 : 5;
    for (let e = Math.ceil(elMin / step) * step; e <= elMax; e += step) {
      const y = yOf(e); g.beginPath(); g.moveTo(0, y); g.lineTo(W, y); g.stroke(); g.fillText(`${e}°`, 4, y - 2);
    }
    // paths
    if (s.earthPath) this.path(g, s.earthPath, xOf, yOf, W, '#60a5fa55', 1.2);
    if (s.sunPath) this.path(g, s.sunPath, xOf, yOf, W, '#fbbf2466', 1.5, true);
    // sun
    const rS = Math.max(9, 0.53 * pxDeg * 1.2);
    if (s.sun) {
      const x = xOf(s.sun.az), y = yOf(s.sun.el);
      const glow = g.createRadialGradient(x, y, 0, x, y, rS * 6);
      glow.addColorStop(0, 'rgba(255,236,170,0.55)'); glow.addColorStop(1, 'rgba(255,200,80,0)');
      g.fillStyle = glow; g.beginPath(); g.arc(x, y, rS * 6, 0, 7); g.fill();
      g.fillStyle = '#fff6d5'; g.beginPath(); g.arc(x, y, rS, 0, 7); g.fill();
    }
    // earth with phase
    const rE = Math.max(9, 1.9 * pxDeg * 0.9);
    if (s.earth) {
      const x = xOf(s.earth.az), y = yOf(s.earth.el);
      g.fillStyle = '#0f2347'; g.beginPath(); g.arc(x, y, rE, 0, 7); g.fill();
      // lit part towards the Sun
      const k = s.earthLit ?? 0.5; const ang = s.sun ? Math.atan2(yOf(s.sun.el) - y, xOf(s.sun.az) - x) : 0;
      g.save(); g.beginPath(); g.arc(x, y, rE, 0, 7); g.clip();
      const off = (1 - 2 * k) * rE;
      const lg = g.createRadialGradient(x, y, 0, x, y, rE); lg.addColorStop(0, '#9cc9ff'); lg.addColorStop(1, '#3b82f6');
      g.fillStyle = lg; g.beginPath(); g.arc(x + Math.cos(ang) * -off, y + Math.sin(ang) * -off, rE * 1.02, 0, 7);
      if (k < 0.5) { g.fill(); g.fillStyle = '#0f2347'; g.beginPath(); g.arc(x - Math.cos(ang) * (rE * 2 * k), y - Math.sin(ang) * (rE * 2 * k), rE, 0, 7); }
      g.fill(); g.restore();
      g.strokeStyle = '#93c5fd88'; g.lineWidth = 1; g.beginPath(); g.arc(x, y, rE, 0, 7); g.stroke();
    }
    // terrain silhouette (drawn after bodies so it hides them)
    const mask = s.mask;
    g.beginPath(); g.moveTo(0, H);
    for (let px = 0; px <= W; px += 2) {
      const az = ((this.viewAz + (px - W / 2) / pxDeg) % 360 + 360) % 360;
      g.lineTo(px, Math.min(H, yOf(horizonAt(mask, az))));
    }
    g.lineTo(W, H); g.closePath();
    const tg = g.createLinearGradient(0, yOf(elMin + 6), 0, H);
    const b = 0.25 + 0.75 * lit;
    tg.addColorStop(0, `rgb(${70 * b + 18},${72 * b + 18},${78 * b + 22})`); tg.addColorStop(1, `rgb(${22 * b + 6},${23 * b + 6},${26 * b + 8})`);
    g.fillStyle = tg; g.fill();
    g.strokeStyle = lit > 0 ? '#cbd5e1aa' : '#47556988'; g.lineWidth = 1.2; g.stroke();
    // horizon of a flat sphere, for reference
    g.setLineDash([4, 6]); g.strokeStyle = '#ffffff22'; g.beginPath(); g.moveTo(0, yOf(0)); g.lineTo(W, yOf(0)); g.stroke(); g.setLineDash([]);
    // labels for hidden bodies
    const tag = (body, label, color) => {
      if (!body) return; const x = xOf(body.az); if (x < 0 || x > W) return;
      const hz = horizonAt(mask, body.az);
      if (body.el < hz) {
        const y = Math.min(H - groundPx - 8, yOf(hz) + 14);
        g.fillStyle = color; g.font = '12px system-ui'; g.textAlign = 'center';
        g.fillText(`${label} behind terrain ↓`, x, y); g.textAlign = 'left';
      }
    };
    tag(s.sun, '☀ Sun', '#fbbf24'); tag(s.earth, '🌍 Earth', '#93c5fd');
    // compass band
    g.fillStyle = '#05070dcc'; g.fillRect(0, H - groundPx + 6, W, groundPx);
    g.font = '11px system-ui'; g.textAlign = 'center';
    for (let a = 0; a < 360; a += 15) {
      const x = xOf(a); if (x < -10 || x > W + 10) continue;
      const major = a % 45 === 0;
      g.fillStyle = major ? '#e2e8f0' : '#64748b';
      g.fillText(major ? DIRS[a / 45] : `${a}`, x, H - 8);
    }
    g.textAlign = 'left';
    // exaggeration note
    const ex = ((H - groundPx - 10) / (elMax - elMin)) / pxDeg;
    this.exaggeration = ex;
  }

  path(g, pts, xOf, yOf, W, color, w, dots) {
    g.strokeStyle = color; g.fillStyle = color; g.lineWidth = w;
    let prev = null; g.beginPath();
    for (const p of pts) {
      const x = xOf(p.az), y = yOf(p.el);
      if (prev && Math.abs(x - prev.x) < W / 2) g.lineTo(x, y); else g.moveTo(x, y);
      prev = { x, y };
      if (dots) g.fillRect(x - 1, y - 1, 2, 2);
    }
    g.stroke();
  }
}
