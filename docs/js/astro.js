// SouthLight — astronomy core.
// Sun/Earth positions come from NASA/JPL SPICE (DE440) precomputed hourly in
// the lunar Mean-Earth frame (see pipeline/ephemeris.py). Here we turn them
// into topocentric azimuth/elevation for any site and compare with the
// terrain horizon mask from LOLA. Code written with AI assistance (Claude).

export const R_MOON_KM = 1737.4;
export const SUN_RADIUS_DEG = 0.2666;

let EPH = null, META = null, T0 = 0;

export async function loadEphemeris(base = 'data') {
  META = await (await fetch(`${base}/ephem.json`)).json();
  const buf = await (await fetch(`${base}/ephem.bin`)).arrayBuffer();
  EPH = new Float32Array(buf);
  T0 = Date.parse(META.start_utc);
  return META;
}

export const ephemRange = () => ({ start: T0, end: T0 + (META.count - 1) * 3600e3 });
export const hourIndex = (ms) => (ms - T0) / 3600e3;

function basis(latDeg, lonDeg) {
  const la = latDeg * Math.PI / 180, lo = lonDeg * Math.PI / 180;
  const up = [Math.cos(la) * Math.cos(lo), Math.cos(la) * Math.sin(lo), Math.sin(la)];
  const east = [-Math.sin(lo), Math.cos(lo), 0];
  const north = [up[1] * east[2] - up[2] * east[1], up[2] * east[0] - up[0] * east[2], up[0] * east[1] - up[1] * east[0]];
  return { up, east, north };
}

// Linear interpolation of the ephemeris at fractional hour index.
function vecAt(h, off) {
  const n = META.count;
  const i = Math.max(0, Math.min(n - 2, Math.floor(h)));
  const f = Math.max(0, Math.min(1, h - i));
  const a = i * 6 + off, b = a + 6;
  return [EPH[a] + (EPH[b] - EPH[a]) * f, EPH[a + 1] + (EPH[b + 1] - EPH[a + 1]) * f, EPH[a + 2] + (EPH[b + 2] - EPH[a + 2]) * f];
}

export function makeSite(lat, lon, heightM = 0, mastM = 2) {
  const b = basis(lat, lon);
  const r = R_MOON_KM + (heightM + mastM) / 1000;
  return { lat, lon, ...b, pos: b.up.map(v => v * r) };
}

function azelOf(site, v) {
  const d = [v[0] - site.pos[0], v[1] - site.pos[1], v[2] - site.pos[2]];
  const L = Math.hypot(d[0], d[1], d[2]);
  const x = (d[0] * site.east[0] + d[1] * site.east[1] + d[2] * site.east[2]) / L;
  const y = (d[0] * site.north[0] + d[1] * site.north[1] + d[2] * site.north[2]) / L;
  const z = (d[0] * site.up[0] + d[1] * site.up[1] + d[2] * site.up[2]) / L;
  let az = Math.atan2(x, y) * 180 / Math.PI; if (az < 0) az += 360;
  return { az, el: Math.asin(Math.max(-1, Math.min(1, z))) * 180 / Math.PI, dist: L };
}

export const sunAt = (site, ms) => azelOf(site, vecAt(hourIndex(ms), 0));
export const earthAt = (site, ms) => azelOf(site, vecAt(hourIndex(ms), 3));

// Horizon elevation at azimuth from a mask array (any length, 0=N clockwise)
export function horizonAt(mask, az) {
  const n = mask.length, p = (az / 360) * n;
  const i = Math.floor(p) % n, j = (i + 1) % n, f = p - Math.floor(p);
  return mask[i] * (1 - f) + mask[j] * f;
}

// Fraction (0..1) of the solar disk above the terrain horizon
export function sunFraction(el, hz) {
  const x = (el - hz) / SUN_RADIUS_DEG; // -1..1 across the disk
  if (x <= -1) return 0; if (x >= 1) return 1;
  // area of circular segment
  const t = Math.acos(-x); return (t - Math.sin(2 * t) / 2) / Math.PI;
}

// Hourly series over [startMs, startMs + hours)
export function series(site, mask, startMs, hours, stepH = 1) {
  const n = Math.floor(hours / stepH);
  const out = { t: new Float64Array(n), sunEl: new Float32Array(n), sunAz: new Float32Array(n), sunHz: new Float32Array(n),
    sunFrac: new Float32Array(n), earthEl: new Float32Array(n), earthAz: new Float32Array(n), earthVis: new Uint8Array(n) };
  for (let k = 0; k < n; k++) {
    const ms = startMs + k * stepH * 3600e3;
    const s = sunAt(site, ms), e = earthAt(site, ms);
    const hs = horizonAt(mask, s.az), he = horizonAt(mask, e.az);
    out.t[k] = ms; out.sunEl[k] = s.el; out.sunAz[k] = s.az; out.sunHz[k] = hs;
    out.sunFrac[k] = sunFraction(s.el, hs);
    out.earthEl[k] = e.el; out.earthAz[k] = e.az; out.earthVis[k] = e.el > he ? 1 : 0;
  }
  return out;
}

// Next transition from visible -> hidden (or hidden -> visible) after index k
export function nextChange(arr, k, threshold = 0.5) {
  const now = arr[k] > threshold;
  for (let i = k + 1; i < arr.length; i++) if ((arr[i] > threshold) !== now) return { index: i, toVisible: !now };
  return null;
}

export function summarize(s) {
  const n = s.t.length; let sun = 0, earth = 0, both = 0, maxEl = -90, night = 0, longestNight = 0, gap = 0, longestGap = 0;
  for (let i = 0; i < n; i++) {
    const lit = s.sunFrac[i] > 0.5; sun += s.sunFrac[i]; earth += s.earthVis[i]; if (lit && s.earthVis[i]) both++;
    if (lit) maxEl = Math.max(maxEl, s.sunEl[i]);
    night = lit ? 0 : night + 1; longestNight = Math.max(longestNight, night);
    gap = s.earthVis[i] ? 0 : gap + 1; longestGap = Math.max(longestGap, gap);
  }
  return { sunPct: 100 * sun / n, earthPct: 100 * earth / n, bothPct: 100 * both / n, maxSunEl: maxEl,
    longestNightH: longestNight, longestEarthGapH: longestGap };
}
