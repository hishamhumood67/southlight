// SouthLight — 2D south-pole map from precomputed LOLA grid statistics.
// Code written with AI assistance (Claude).
import { grid, stat, STAT, toXY, toLatLon } from './terrain.js';

const LAYERS = {
  sun:    { k: STAT.sun,    min: 0, max: 1,    stops: ['#000000', '#1e1b4b', '#b45309', '#fbbf24', '#fffbe6'], fmt: v => `${Math.round(v * 100)}%`, lo: '0% lit', hi: '100% lit' },
  earth:  { k: STAT.earth,  min: 0, max: 1,    stops: ['#000000', '#0c1a3a', '#1d4ed8', '#60a5fa', '#e0f2fe'], fmt: v => `${Math.round(v * 100)}%`, lo: 'never', hi: 'always' },
  slope:  { k: STAT.slope,  min: 0, max: 25,   stops: ['#065f46', '#34d399', '#facc15', '#f97316', '#b91c1c'], fmt: v => `${v.toFixed(0)}°`, lo: '0° flat', hi: '25°+ steep' },
  height: { k: STAT.height, min: -5000, max: 6000, stops: ['#0a0a0a', '#334155', '#94a3b8', '#e2e8f0', '#ffffff'], fmt: v => `${(v / 1000).toFixed(1)} km`, lo: '−5 km', hi: '+6 km' },
};
const hex = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
function ramp(stops, t) {
  t = Math.max(0, Math.min(1, t)); const p = t * (stops.length - 1), i = Math.min(stops.length - 2, Math.floor(p)), f = p - i;
  const a = hex(stops[i]), b = hex(stops[i + 1]); return a.map((v, j) => Math.round(v + (b[j] - v) * f));
}

export class PoleMap {
  constructor(canvas, legend, onPick) {
    this.c = canvas; this.legend = legend; this.onPick = onPick; this.layer = 'sun'; this.markers = []; this.cur = null;
    canvas.addEventListener('click', e => {
      const r = canvas.getBoundingClientRect(); const G = grid();
      const fx = (e.clientX - r.left) / r.width * G.n, fy = (e.clientY - r.top) / r.height * G.n;
      const x = (fx - G.nhalf - 0.5) * G.spacing_m, y = -(fy - G.nhalf - 0.5) * G.spacing_m;
      if (Math.hypot(x, y) > (G.nhalf - 1) * G.spacing_m) return;
      const ll = toLatLon(x, y); this.onPick(ll.lat, ll.lon);
    });
  }
  setLayer(l) { this.layer = l; this.img = null; this.draw(); }
  setMarkers(m) { this.markers = m; this.draw(); }
  setCurrent(lat, lon) { this.cur = { lat, lon }; this.draw(); }

  build() {
    const G = grid(), L = LAYERS[this.layer], n = G.n;
    const off = document.createElement('canvas'); off.width = n; off.height = n;
    const ctx = off.getContext('2d'), im = ctx.createImageData(n, n);
    for (let gj = 0; gj < n; gj++) for (let gi = 0; gi < n; gi++) {
      const v = stat(L.k, gi, gj); const o = ((n - 1 - gj) * n + gi) * 4;
      if (!isFinite(v) || (this.layer === 'slope' && v < 0)) { im.data[o + 3] = 0; continue; }
      const [r, g, b] = ramp(L.stops, (v - L.min) / (L.max - L.min)); im.data.set([r, g, b, 255], o);
    }
    ctx.putImageData(im, 0, 0); this.img = off;
    this.legend.innerHTML = `<span>${L.lo}</span><span class="bar" style="background:linear-gradient(90deg,${L.stops.join(',')})"></span><span>${L.hi}</span>`;
  }

  draw() {
    const G = grid(); if (!G) return;
    if (!this.img) this.build();
    const c = this.c, g = c.getContext('2d'), W = c.width, H = c.height;
    g.fillStyle = '#000'; g.fillRect(0, 0, W, H);
    g.imageSmoothingEnabled = true; g.drawImage(this.img, 0, 0, W, H);
    const P = (lat, lon) => { const { x, y } = toXY(lat, lon); return [(x / G.spacing_m + G.nhalf + 0.5) / G.n * W, (-y / G.spacing_m + G.nhalf + 0.5) / G.n * H]; };
    // latitude rings
    g.strokeStyle = '#ffffff22'; g.fillStyle = '#ffffff66'; g.font = '10px system-ui';
    for (const lat of [-86, -88]) { const [, y] = P(lat, 180); const r = y - H / 2; g.beginPath(); g.arc(W / 2, H / 2, r, 0, 7); g.stroke(); g.fillText(`${-lat}°S`, W / 2 + 3, H / 2 + r - 3); }
    g.fillStyle = '#e2e8f0'; g.fillText('↑ Earth-facing side (0°E)', 6, 12); 
    g.beginPath(); g.arc(W / 2, H / 2, 2, 0, 7); g.fill();
    for (const m of this.markers) {
      if (m.lat > -84.9) continue; const [x, y] = P(m.lat, m.lon);
      g.fillStyle = '#ffffffcc'; g.beginPath(); g.arc(x, y, 3, 0, 7); g.fill();
      g.fillStyle = '#ffffffcc'; g.font = '9px system-ui'; g.fillText(m.short || '', x + 5, y + (m.short === 'Shackleton' ? 10 : 3));
    }
    if (this.cur && this.cur.lat <= -84.9) {
      const [x, y] = P(this.cur.lat, this.cur.lon);
      g.strokeStyle = '#a78bfa'; g.lineWidth = 2; g.beginPath(); g.arc(x, y, 7, 0, 7); g.stroke();
      g.beginPath(); g.moveTo(x - 11, y); g.lineTo(x - 4, y); g.moveTo(x + 4, y); g.lineTo(x + 11, y); g.moveTo(x, y - 11); g.lineTo(x, y - 4); g.moveTo(x, y + 4); g.lineTo(x, y + 11); g.stroke(); g.lineWidth = 1;
    } else if (this.cur) {
      g.fillStyle = '#000a'; g.fillRect(0, H - 34, W, 34); g.fillStyle = '#e2e8f0'; g.font = '12px system-ui';
      g.fillText('This site is outside the south-pole map.', 8, H - 14);
    }
  }
}
