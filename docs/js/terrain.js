// SouthLight — terrain (NASA LRO LOLA) access in the browser.
// Horizon masks for a 2 km south-pole grid are precomputed from LOLA DEMs
// (pipeline/build_grid.py) and loaded in small tiles on demand.
// Code written with AI assistance (Claude).

const R_M = 1737400;
let G = null, STATS = null;
const tiles = new Map();

export async function loadGrid(base = 'data/grid') {
  G = await (await fetch(`${base}/grid.json`)).json();
  G.base = base;
  STATS = new Float32Array(await (await fetch(`${base}/stats.bin`)).arrayBuffer());
  return G;
}
export const grid = () => G;

export function toXY(lat, lon) {
  const la = lat * Math.PI / 180, lo = lon * Math.PI / 180;
  const rho = 2 * R_M * Math.tan(Math.PI / 4 + la / 2);
  return { x: rho * Math.sin(lo), y: rho * Math.cos(lo) };
}
export function toLatLon(x, y) {
  const rho = Math.hypot(x, y);
  const lat = (2 * Math.atan(rho / (2 * R_M)) - Math.PI / 2) * 180 / Math.PI;
  let lon = Math.atan2(x, y) * 180 / Math.PI;
  return { lat, lon };
}
export function inGrid(lat, lon) {
  if (!G || lat > -84.9) return false;
  const { x, y } = toXY(lat, lon);
  return Math.hypot(x, y) <= (G.nhalf - 1) * G.spacing_m;
}

// stats layer k at grid index (gi, gj) in 0..n-1
export function stat(k, gi, gj) {
  const n = G.n; if (gi < 0 || gj < 0 || gi >= n || gj >= n) return NaN;
  return STATS[k * n * n + gj * n + gi];
}
export const STAT = { height: 0, slope: 1, sun: 2, earth: 3, night: 4 };

function statInterp(k, lat, lon) {
  const { x, y } = toXY(lat, lon);
  const fx = x / G.spacing_m + G.nhalf, fy = y / G.spacing_m + G.nhalf;
  const i = Math.floor(fx), j = Math.floor(fy), u = fx - i, v = fy - j;
  const a = stat(k, i, j), b = stat(k, i + 1, j), c = stat(k, i, j + 1), d = stat(k, i + 1, j + 1);
  const vals = [[a, (1 - u) * (1 - v)], [b, u * (1 - v)], [c, (1 - u) * v], [d, u * v]].filter(p => isFinite(p[0]) && (k !== STAT.slope || p[0] >= 0));
  const w = vals.reduce((s, p) => s + p[1], 0);
  return w ? vals.reduce((s, p) => s + p[0] * p[1], 0) / w : NaN;
}
export const heightAt = (lat, lon) => statInterp(STAT.height, lat, lon);
export const slopeAt = (lat, lon) => statInterp(STAT.slope, lat, lon);

async function tile(ti, tj) {
  const key = ti + '_' + tj;
  if (!tiles.has(key)) tiles.set(key, fetch(`${G.base}/t_${ti}_${tj}.bin`).then(r => r.arrayBuffer()).then(b => new Uint8Array(b)));
  return tiles.get(key);
}
async function gridMask(gi, gj) {
  const T = G.tile, ti = Math.floor(gi / T), tj = Math.floor(gj / T);
  const t = await tile(ti, tj);
  const w = Math.min(T, G.n - ti * T);               // tile width (edge tiles are smaller)
  const li = gi - ti * T, lj = gj - tj * T;
  const off = (lj * w + li) * 360;
  return t.subarray(off, off + 360);
}

// Horizon mask (deg, 360 azimuths) at any point in the grid: bilinear blend of 4 neighbours.
export async function maskAt(lat, lon) {
  const { x, y } = toXY(lat, lon);
  const fx = x / G.spacing_m + G.nhalf, fy = y / G.spacing_m + G.nhalf;
  const i = Math.floor(fx), j = Math.floor(fy), u = fx - i, v = fy - j;
  const ms = await Promise.all([gridMask(i, j), gridMask(i + 1, j), gridMask(i, j + 1), gridMask(i + 1, j + 1)]);
  const w = [(1 - u) * (1 - v), u * (1 - v), (1 - u) * v, u * v];
  const out = new Float32Array(360);
  for (let a = 0; a < 360; a++) {
    let s = 0, ws = 0;
    for (let q = 0; q < 4; q++) if (ms[q][a] > 0) { s += (ms[q][a] / 10 - 10) * w[q]; ws += w[q]; }
    out[a] = ws ? s / ws : 0;
  }
  return out;
}

// Grid points (lat/lon) within radiusKm of a site, for Plan B searches.
export function neighbours(lat, lon, radiusKm, stepCells = 1) {
  const { x, y } = toXY(lat, lon);
  const ci = Math.round(x / G.spacing_m), cj = Math.round(y / G.spacing_m), R = Math.ceil(radiusKm * 1000 / G.spacing_m);
  const pts = [];
  for (let dj = -R; dj <= R; dj += stepCells) for (let di = -R; di <= R; di += stepCells) {
    const gx = (ci + di) * G.spacing_m, gy = (cj + dj) * G.spacing_m;
    const d = Math.hypot(gx - x, gy - y) / 1000;
    if (d > radiusKm || Math.hypot(gx, gy) > (G.nhalf - 1) * G.spacing_m) continue;
    const gi = ci + di + G.nhalf, gj = cj + dj + G.nhalf;
    if (!(stat(STAT.sun, gi, gj) >= 0)) continue;
    pts.push({ ...toLatLon(gx, gy), distKm: d, gi, gj });
  }
  return pts;
}
