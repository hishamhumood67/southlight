// SouthLight — application logic. Code written with AI assistance (Claude).
import * as A from './astro.js';
import * as T from './terrain.js';
import { SkyView } from './sky.js';
import { PoleMap } from './map.js';
import { LANDERS, simulate, fuelBudget } from './sim.js';
import { aboutHTML } from './about.js';

const $ = id => document.getElementById(id);
const DAY = 86400e3, HOUR = 3600e3, WINDOW_DAYS = 32;
const st = {
  mode: 'explore', site: null, planned: null, landingMs: 0, delay: 0, cursor: 0, series: null, winStart: 0,
  lander: 'medium', missionDays: 14, pins: [], playing: false, speed: 12, sitesData: [], lastResult: null,
};

// ---------- formatting
const fmtDate = ms => new Date(ms).toISOString().slice(0, 16).replace('T', ' ') + ' UTC';
const fmtDur = h => { h = Math.round(h); if (h < 48) return `${h} h`; const d = Math.floor(h / 24); return `${d} d ${h % 24} h`; };
const pct = v => `${Math.round(v)}%`;
const toast = msg => { const t = $('toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove('show'), 2600); };
const haversineKm = (a, b) => {
  const r = Math.PI / 180, dl = (b.lat - a.lat) * r, dn = (b.lon - a.lon) * r;
  const h = Math.sin(dl / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dn / 2) ** 2;
  return 2 * 1737.4 * Math.asin(Math.sqrt(h));
};

// ---------- site handling
async function buildSite(lat, lon, name = null, extra = {}) {
  if (extra.mask) return { lat, lon, name, ...extra };
  if (T.inGrid(lat, lon)) {
    const mask = await T.maskAt(lat, lon);
    return { lat, lon, name: name || `Custom ${(-lat).toFixed(2)}°S ${lon.toFixed(2)}°E`, mask, terrain: true,
      heightM: T.heightAt(lat, lon), slope: T.slopeAt(lat, lon), note: extra.note || 'Custom point. Horizon blended from the 2 km LOLA grid.' };
  }
  return { lat, lon, name: name || `Custom ${lat.toFixed(2)}°, ${lon.toFixed(2)}°E`, mask: new Float32Array(360), terrain: false,
    heightM: 0, slope: null, note: 'Outside the south-pole terrain map: horizon is a smooth sphere (local hills not modelled).' };
}

async function setSite(site, { keepPlanned = false } = {}) {
  st.site = site; if (!keepPlanned || !st.planned) st.planned = site;
  st.site.obs = A.makeSite(site.lat, site.lon, site.heightM || 0, 2);
  $('siteNote').innerHTML = `${site.note || ''}<br><span class="mono">${site.lat.toFixed(3)}°, ${site.lon.toFixed(3)}°E${site.terrain ? ` · ${(site.heightM / 1000).toFixed(2)} km elevation · slope ${site.slope != null && isFinite(site.slope) ? site.slope.toFixed(1) + '°' : 'n/a'}` : ''}</span>`;
  $('inLat').value = site.lat.toFixed(3); $('inLon').value = site.lon.toFixed(3);
  map.setCurrent(site.lat, site.lon);
  recompute(); writeHash();
  update3DSite();
}

// ---------- time & series
function recompute() {
  const land = st.landingMs + st.delay * DAY;
  st.winStart = land;
  const r = A.ephemRange();
  const hours = Math.min(WINDOW_DAYS * 24, Math.floor((r.end - land) / HOUR));
  st.series = A.series(st.site.obs, st.site.mask, land, hours, 1);
  st.summary = A.summarize(st.series);
  if (st.cursor < land || st.cursor > land + hours * HOUR) st.cursor = land;
  drawAll();
}
const idxAt = ms => Math.max(0, Math.min(st.series.t.length - 1, Math.round((ms - st.winStart) / HOUR)));

// ---------- drawing
function drawAll() { if (!st.series) return; drawSky(); drawTimeline(); drawCards(); drawVerdict(); drawLearn(); if (st.mode === 'plan') { drawPlan(); drawSeasons(); drawCompare(); } }

function drawSky() {
  const s = st.series, obs = st.site.obs, ms = st.cursor;
  const sun = A.sunAt(obs, ms), earth = A.earthAt(obs, ms);
  const hz = A.horizonAt(st.site.mask, sun.az), sunFrac = A.sunFraction(sun.el, hz);
  const sunPath = [], earthPath = [];
  for (let h = -12; h <= 36; h += 1) sunPath.push(A.sunAt(obs, ms + h * HOUR));
  for (let h = 0; h <= 30 * 24; h += 6) earthPath.push(A.earthAt(obs, st.winStart + h * HOUR));
  let maxEl = 8; for (const p of sunPath) maxEl = Math.max(maxEl, p.el); for (const p of earthPath) maxEl = Math.max(maxEl, p.el);
  let maxMask = 0, minMask = 0; for (const v of st.site.mask) { maxMask = Math.max(maxMask, v); minMask = Math.min(minMask, v); }
  // Earth phase: angle Sun–Earth seen from site
  const sv = dirVec(sun), ev = dirVec(earth); const elong = Math.acos(Math.max(-1, Math.min(1, sv[0] * ev[0] + sv[1] * ev[1] + sv[2] * ev[2])));
  const earthLit = (1 - Math.cos(elong)) / 2;
  sky.set({ mask: st.site.mask, sun, earth, sunFrac, earthLit, sunPath, earthPath,
    elMin: Math.max(-8, Math.min(-2, minMask - 1.5)), elMax: Math.min(90, Math.max(14, maxEl + 4, maxMask + 4)) });
  if (v3d) v3d.setSky(sun, earth, sunFrac);
  const eVis = earth.el > A.horizonAt(st.site.mask, earth.az);
  if (v3d && viewMode === 'astro') { const yawAz = ((-v3d.yaw * 180 / Math.PI) % 360 + 360) % 360; const D = ['N','NE','E','SE','S','SW','W','NW'][Math.round(yawAz / 45) % 8]; $('dirLabel').textContent = `Facing ${D} (${Math.round(yawAz)}°) · Sun ${dirName(sun.az)} · Earth ${dirName(earth.az)}`; } else $('dirLabel').textContent = '';
  $('skyBadge').innerHTML = `<span class="pill ${sunFrac > 0.5 ? 'on sun' : 'off'}">☀ ${sunFrac > 0.5 ? 'Sunlit' : 'Dark'}</span><span class="pill ${eVis ? 'on earth' : 'off'}">📡 ${eVis ? 'Earth link' : 'No Earth'}</span>`;
  $('readout').textContent = `${fmtDate(ms)} · Sun ${sun.el.toFixed(1)}° high · Earth ${earth.el.toFixed(1)}°`;
}
function dirName(az) { return ['N','NE','E','SE','S','SW','W','NW'][Math.round(az / 45) % 8]; }
function dirVec(p) { const a = p.az * Math.PI / 180, e = p.el * Math.PI / 180; return [Math.cos(e) * Math.sin(a), Math.cos(e) * Math.cos(a), Math.sin(e)]; }

function drawTimeline() {
  const c = $('timeline'), dpr = Math.min(2, devicePixelRatio || 1), W = c.clientWidth, H = c.clientHeight;
  c.width = W * dpr; c.height = H * dpr; const g = c.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0);
  const s = st.series, n = s.t.length; if (!n) return;
  const L = 34, R = W - 6, x = i => L + (R - L) * i / n;
  g.fillStyle = '#070b14'; g.fillRect(0, 0, W, H);
  const rows = [[8, '☀'], [36, '📡'], [64, '✔']]; const rh = 22;
  g.font = '12px system-ui'; g.fillStyle = '#94a3b8';
  rows.forEach(([y, l]) => g.fillText(l, 10, y + 15));
  for (let i = 0; i < n; i++) {
    const x0 = x(i), w = Math.max(1, x(i + 1) - x0 + 0.5);
    const f = s.sunFrac[i]; if (f > 0) { g.fillStyle = `rgba(251,191,36,${0.25 + 0.75 * f})`; g.fillRect(x0, 8, w, rh); }
    if (s.earthVis[i]) { g.fillStyle = '#60a5fa'; g.fillRect(x0, 36, w, rh); }
    if (f > 0.5 && s.earthVis[i]) { g.fillStyle = '#34d399'; g.fillRect(x0, 64, w, rh); }
  }
  // sun elevation curve
  let mn = Infinity, mx = -Infinity; for (let i = 0; i < n; i++) { mn = Math.min(mn, s.sunEl[i]); mx = Math.max(mx, s.sunEl[i]); }
  const yE = v => 112 - (v - mn) / Math.max(1, mx - mn) * 18;
  g.strokeStyle = '#fde68a99'; g.lineWidth = 1; g.beginPath();
  for (let i = 0; i < n; i++) i ? g.lineTo(x(i), yE(s.sunEl[i])) : g.moveTo(x(i), yE(s.sunEl[i])); g.stroke();
  // day ticks
  g.fillStyle = '#64748b'; g.font = '10px system-ui';
  for (let d = 0; d <= n / 24; d += 2) { const xx = x(d * 24); g.fillRect(xx, 88, 1, 4); g.fillText(`+${d}d`, xx + 2, 126); }
  // mission length (launch mode)
  if (st.mode === 'launch') { g.strokeStyle = '#a78bfa'; g.setLineDash([3, 3]); const xm = x(st.missionDays * 24); g.beginPath(); g.moveTo(xm, 4); g.lineTo(xm, 90); g.stroke(); g.setLineDash([]); g.fillStyle = '#a78bfa'; g.fillText('mission end', xm + 3, 98); }
  if (st.lastResult && st.lastResult.dead >= 0) { const xd = x(st.lastResult.dead); g.fillStyle = '#f87171'; g.fillText('✖ power lost', xd + 3, 6 + 8); g.fillRect(xd, 4, 2, 86); }
  // landing marker & cursor
  
  const xc = x((st.cursor - st.winStart) / HOUR);
  g.fillStyle = '#ffffff'; g.fillRect(xc - 1, 2, 2, 90);
}

function nextEventText(arr, k, thr, goneWord, backWord) {
  const ev = A.nextChange(arr, k, thr);
  if (!ev) return { v: '30 d+', s: `no ${goneWord} in the next ${WINDOW_DAYS} days` };
  const h = ev.index - k;
  return { v: fmtDur(h), s: ev.toVisible ? `until ${backWord}` : `until ${goneWord}` };
}

function drawCards() {
  const s = st.series, k = idxAt(st.cursor), sm = st.summary;
  const sunEv = nextEventText(s.sunFrac, k, 0.5, 'sunset', 'sunrise');
  const eaEv = nextEventText(s.earthVis, k, 0.5, 'Earthset', 'Earthrise');
  const lit = s.sunFrac[k] > 0.5, evis = s.earthVis[k];
  $('cards').innerHTML = `
    <div class="card"><div class="t">☀️ Sun right now</div><div class="v ${lit ? 'sun' : 'bad'}">${lit ? 'Shining' : 'Hidden'}</div><div class="s">${s.sunEl[k].toFixed(1)}° above the flat horizon · ${lit ? 'panels make power' : `hills here are ${s.sunHz[k].toFixed(1)}° high`}</div></div>
    <div class="card"><div class="t">${lit ? '⏳ Time until dark' : '⏳ Time until sunlight'}</div><div class="v ${lit ? 'sun' : 'bad'}">${sunEv.v}</div><div class="s">${sunEv.s}</div></div>
    <div class="card"><div class="t">📡 Radio to Earth</div><div class="v ${evis ? 'earth' : 'bad'}">${evis ? 'Yes' : 'No'}</div><div class="s">${s.earthEl[k].toFixed(1)}° high · ${evis ? 'Earth is above the hills' : 'Earth is hidden'}</div></div>
    <div class="card"><div class="t">${evis ? '⏳ Time until radio lost' : '⏳ Time until radio back'}</div><div class="v ${evis ? 'earth' : 'bad'}">${eaEv.v}</div><div class="s">${eaEv.s}</div></div>
    <div class="card wide"><div class="t">Details · next ${WINDOW_DAYS} days</div>
      <div class="s" style="font-size:13px;color:#e5e9f2;margin-top:4px">☀ Sunlight <b>${pct(sm.sunPct)}</b> · 📡 Earth <b>${pct(sm.earthPct)}</b> · ✔ Both <b>${pct(sm.bothPct)}</b><br>
      Longest darkness <b>${fmtDur(sm.longestNightH)}</b> · longest radio gap <b>${fmtDur(sm.longestEarthGapH)}</b> · highest Sun <b>${sm.maxSunEl.toFixed(1)}°</b></div></div>`;
}

function drawVerdict() {
  const sm = st.summary, d = fmtDate(st.winStart).slice(0, 10), sun = sm.sunPct, ea = sm.earthPct;
  let cls, head;
  if (sun < 3) { cls = 'bad'; head = '❌ No sunlight here — permanent shadow'; }
  else if (ea < 5) { cls = 'bad'; head = '❌ No direct radio to Earth here'; }
  else if (sun >= 75 && ea >= 45) { cls = 'good'; head = '✅ Good place to land'; }
  else if (sun >= 40 && ea >= 20) { cls = 'mid'; head = '⚠️ Possible, but risky'; }
  else { cls = 'bad'; head = sun < 40 ? '❌ Poor place to land — too little sunlight' : '❌ Poor place to land — Earth mostly hidden'; }
  const parts = [`If you land at <b>${st.site.name}</b> on <b>${d}</b>, over the next month:`,
    `☀️ the Sun gives <b>power ${pct(sun)}</b> of the time${sm.longestNightH > 0 ? ` (longest dark stretch: <b>${fmtDur(sm.longestNightH)}</b>)` : ' — it never sets!'};`,
    ea < 5 ? '📡 Earth is <b>never visible</b> — the lander would need a relay satellite (like Chang\'e 4 used).' : `📡 Earth is visible for <b>radio ${pct(ea)}</b> of the time${sm.longestEarthGapH > 0 && ea < 100 ? ` (longest silence: <b>${fmtDur(sm.longestEarthGapH)}</b>)` : ''}.`];
  $('verdict').className = 'verdict ' + cls; $('verdict').innerHTML = `<b class="big">${head}</b>${parts.join('<br>')}`;
}

function drawLearn() {
  if (st.mode !== 'explore') return;
  const sm = st.summary, site = st.site, polar = site.lat < -80;
  const parts = [];
  if (polar) {
    parts.push(`<p>☀️ At <b>${(-site.lat).toFixed(1)}°S</b> the Sun never climbs higher than about <b>${sm.maxSunEl.toFixed(1)}°</b> — it circles the horizon once every 29.5 days. A hill only a few degrees tall can block it for days.</p>`);
    parts.push(`<p>🌍 Earth stays in almost the same part of the sky, but it <b>wobbles up and down by about ±7°</b> (libration — the blue loop in the sky). When it dips behind terrain, a lander loses direct radio contact.</p>`);
    parts.push(`<p>⛰️ No air on the Moon means <b>no sunlight bending over hills</b>: the horizon is purely the terrain, measured by NASA's LOLA laser altimeter.</p>`);
    parts.push(`<p>👉 Try <b>Move site</b> or tap the map: a few kilometres can turn ${pct(sm.sunPct)} sunlight into something very different.</p>`);
  } else {
    parts.push(`<p>Here (${site.lat.toFixed(1)}°) the Sun rises and sets like on Earth, but a lunar day lasts about <b>29.5 Earth days</b>: ~15 days of light, then ~15 days of freezing night.</p>`);
    parts.push(`<p>${sm.earthPct > 50 ? '🌍 Earth hangs almost still in the sky here — direct radio is easy.' : '🌍 Earth is <b>never or rarely visible</b> from here (far side). Missions need a relay satellite.'}</p>`);
    parts.push(`<p>Compare with a south-pole site in the list: the Sun barely skims the horizon there.</p>`);
  }
  $('learn').innerHTML = parts.join('');
}

// ---------- plan mode
function drawPlan() {
  const L = LANDERS[st.lander], r = simulate(st.series, L, st.missionDays, st.site.slope, st.delay, haversineKm(st.planned, st.site));
  $('planStats').innerHTML = `<p class="note">Landing <b>${fmtDate(st.winStart)}</b>${st.delay ? ` (planned + ${st.delay} d delay)` : ''}. With the <b>${L.name}</b> lander (${L.panelW} W panels, ${(L.batteryWh / 1000).toFixed(1)} kWh battery) for a <b>${st.missionDays}-day</b> mission:
   ${r.dead >= 0 ? `<b style="color:var(--bad)">power runs out after ${fmtDur(r.dead)}</b>` : '<b style="color:var(--ok)">power lasts the whole mission</b>'}; Earth contact ${pct(r.earthPct)} of the time. Safety score <b>${r.score}/100</b>.</p>`;
}

function drawSeasons() {
  const c = $('seasons'), dpr = Math.min(2, devicePixelRatio || 1), W = c.clientWidth, H = 90;
  c.width = W * dpr; c.height = H * dpr; const g = c.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0);
  const r = A.ephemRange(); const months = [];
  let d = new Date(Date.UTC(2026, 11, 1));
  while (d.getTime() < r.end - 28 * DAY) {
    const nx = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1));
    const sr = A.series(st.site.obs, st.site.mask, d.getTime(), (nx - d) / HOUR, 3);
    const sm = A.summarize(sr); months.push({ d, sun: sm.sunPct, earth: sm.earthPct }); d = nx;
  }
  const bw = W / months.length;
  g.fillStyle = '#070b14'; g.fillRect(0, 0, W, H);
  months.forEach((m, i) => {
    const h1 = m.sun / 100 * 50; g.fillStyle = '#fbbf24'; g.fillRect(i * bw + 1, 55 - h1, bw * 0.45, h1);
    const h2 = m.earth / 100 * 50; g.fillStyle = '#60a5fa'; g.fillRect(i * bw + bw * 0.5, 55 - h2, bw * 0.45, h2);
    if (m.d.getUTCMonth() % 3 === 0) { g.fillStyle = '#64748b'; g.font = '9px system-ui'; g.fillText(m.d.toISOString().slice(2, 7), i * bw, 68); }
    const lm = new Date(st.winStart); if (lm.getUTCFullYear() === m.d.getUTCFullYear() && lm.getUTCMonth() === m.d.getUTCMonth()) { g.strokeStyle = '#a78bfa'; g.strokeRect(i * bw, 2, bw, 56); }
  });
  const best = months.reduce((a, b) => b.sun > a.sun ? b : a), worst = months.reduce((a, b) => b.sun < a.sun ? b : a);
  g.fillStyle = '#cbd5e1'; g.font = '11px system-ui';
  g.fillText(`Best: ${best.d.toISOString().slice(0, 7)} (${pct(best.sun)} sun) · Worst: ${worst.d.toISOString().slice(0, 7)} (${pct(worst.sun)})`, 4, 84);
}

async function findPlanB() {
  const out = $('planB'); out.innerHTML = '<p class="note">Searching…</p>';
  await new Promise(r => setTimeout(r, 30));
  const L = LANDERS[st.lander], base = st.landingMs + st.delay * DAY, H = st.missionDays * 24;
  const cands = [];
  const pts = st.site.terrain ? T.neighbours(st.site.lat, st.site.lon, 10) : [];
  pts.unshift({ lat: st.site.lat, lon: st.site.lon, distKm: 0, self: true });
  for (const p of pts) {
    const site = p.self ? st.site : await buildSite(p.lat, p.lon);
    if (site.slope != null && site.slope > 12) continue;
    const obs = A.makeSite(site.lat, site.lon, site.heightM || 0, 2);
    const long = A.series(obs, site.mask, base, H + 10 * 24, 1);
    for (let off = 0; off <= 10 * 24; off += 12) {
      const sub = { t: long.t.subarray(off, off + H), sunFrac: long.sunFrac.subarray(off, off + H), earthVis: long.earthVis.subarray(off, off + H) };
      if (sub.t.length < H) continue;
      const r = simulate(sub, L, st.missionDays, site.slope, st.delay + off / 24, haversineKm(st.planned, site));
      cands.push({ p, site, off, r });
    }
  }
  cands.sort((a, b) => b.r.score - a.r.score || a.off - b.off || a.p.distKm - b.p.distKm);
  const now = cands.find(c => c.p.self && c.off === 0);
  const picks = [];
  for (const c of cands) { if (picks.length >= 3) break; if (now && c === now) continue; if (!picks.some(q => q.p.lat === c.p.lat && q.p.lon === c.p.lon)) picks.push(c); }
  out.innerHTML = `<p class="note">Checked ${cands.length} site × date options. Current plan scores <b>${now ? now.r.score : '–'}</b>${now && picks[0] && now.r.score >= picks[0].r.score ? ' — already among the best options nearby. Alternatives if you need to move:' : '. Best alternatives:'}</p>` +
    picks.map((c, i) => `<div class="planb"><div><b>#${i + 1} · score ${c.r.score}</b><br>${c.p.self ? 'Same site' : `${c.p.distKm.toFixed(1)} km away`}, land ${c.off ? `${c.off / 24} d later` : 'on time'} · ${c.r.dead < 0 ? 'survives ✓' : `power out after ${fmtDur(c.r.dead)}`}</div><button data-pb="${i}">Go</button></div>`).join('');
  out.querySelectorAll('[data-pb]').forEach(b => b.onclick = async () => {
    const c = picks[+b.dataset.pb]; st.delay += c.off / 24; $('inDelay').value = Math.min(20, st.delay); $('delayVal').textContent = `${st.delay} d`;
    await setSite(c.p.self ? st.site : { ...c.site, name: `Plan B · ${c.p.distKm.toFixed(1)} km from ${st.planned.name}` }, { keepPlanned: true });
    toast('Plan B loaded — check the sky view and timeline');
  });
}

function drawCompare() {
  const L = LANDERS[st.lander];
  const rows = [st.site, ...st.pins.filter(p => p !== st.site)].slice(0, 5).map(site => {
    const obs = A.makeSite(site.lat, site.lon, site.heightM || 0, 2);
    const s = A.series(obs, site.mask, st.winStart, WINDOW_DAYS * 24, 1), sm = A.summarize(s);
    const r = simulate(s, L, st.missionDays, site.slope, st.delay, 0);
    return `<tr><td>${site === st.site ? '▶ ' : ''}${site.name}</td><td class="n">${pct(sm.sunPct)}</td><td class="n">${pct(sm.earthPct)}</td><td class="n">${fmtDur(sm.longestNightH)}</td><td class="n">${site.slope != null && isFinite(site.slope) ? site.slope.toFixed(0) + '°' : '–'}</td><td class="n"><b>${r.score}</b></td></tr>`;
  });
  $('compare').innerHTML = `<table class="cmp"><tr><th>Site</th><th>☀</th><th>📡</th><th>Longest dark</th><th>Slope</th><th>Score</th></tr>${rows.join('')}</table>`;
}

function exportCsv() {
  const s = st.series, lines = ['time_utc,sun_az_deg,sun_el_deg,terrain_horizon_deg,sun_visible_fraction,earth_az_deg,earth_el_deg,earth_visible'];
  for (let i = 0; i < s.t.length; i++) lines.push([new Date(s.t[i]).toISOString(), s.sunAz[i].toFixed(3), s.sunEl[i].toFixed(3), s.sunHz[i].toFixed(3), s.sunFrac[i].toFixed(3), s.earthAz[i].toFixed(3), s.earthEl[i].toFixed(3), s.earthVis[i]].join(','));
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([lines.join('\n')], { type: 'text/csv' }));
  a.download = `southlight_${st.site.lat.toFixed(2)}_${st.site.lon.toFixed(2)}.csv`; a.click();
}

// ---------- launch mode
function renderLanders() {
  $('landers').innerHTML = Object.entries(LANDERS).map(([k, L]) => `<button class="lander ${k === st.lander ? 'sel' : ''}" data-l="${k}"><b>${L.name}</b>${L.desc}<br>${L.panelW} W · ${(L.batteryWh / 1000).toFixed(1)} kWh</button>`).join('');
  $('landers').querySelectorAll('[data-l]').forEach(b => b.onclick = () => { st.lander = b.dataset.l; renderLanders(); writeHash(); if (st.mode === 'plan') drawPlan(); });
}

async function launch() {
  st.lastResult = null; $('result').innerHTML = '';
  const L = LANDERS[st.lander];
  const r = simulate(st.series, L, st.missionDays, st.site.slope, st.delay, haversineKm(st.planned, st.site));
  // animate: descent then fast-forward through the mission
  stop(); st.cursor = st.winStart; drawAll();
  $('result').innerHTML = `<div class="result"><h3>🚀 Descending to ${st.site.name}…</h3><p class="note">${r.landSun ? 'Sun is up — landing cameras can see hazards.' : '⚠ Landing in darkness — cameras cannot see boulders and craters.'} ${r.landEarth ? 'Earth is in view for live telemetry.' : '⚠ Earth is hidden — landing without live contact.'}</p></div>`;
  await new Promise(res => setTimeout(res, 1400));
  const endH = r.dead >= 0 ? r.dead : r.H;
  await new Promise(res => {
    const t0 = performance.now(), dur = 2600;
    const tick = now => { const f = Math.min(1, (now - t0) / dur); st.cursor = st.winStart + f * endH * HOUR; drawSky(); drawTimeline(); drawCards(); f < 1 ? requestAnimationFrame(tick) : res(); };
    requestAnimationFrame(tick);
  });
  st.lastResult = r; drawTimeline(); showResult(r);
}

function showResult(r) {
  const L = LANDERS[st.lander], cls = r.success && r.score >= 70 ? 'win' : r.success ? 'mid' : 'lose';
  const reasons = [];
  if (r.tipped) reasons.push(`⛰️ Slope here is ${r.slope.toFixed(0)}° — the lander tips over (limit ~15°).`);
  if (r.dead >= 0) {
    const k = r.dead, bh = L.batteryWh / L.loadW;
    if (r.darkRun >= bh * 0.6) reasons.push(`🔋 Battery empty after ${fmtDur(k)}: the Sun was hidden ${st.series.sunEl[k] > st.series.sunHz[k] - 3 && st.series.sunEl[k] > -1 ? 'behind the terrain' : 'below the horizon'} for ${fmtDur(r.darkRun)} — the battery only lasts ≈${fmtDur(bh)} at ${L.loadW} W.`);
    else reasons.push(`🔋 Battery empty after ${fmtDur(k)}: the Sun was too low or partly blocked for the panels (${L.panelW} W) to keep up with a ${L.loadW} W load.`);
  } else reasons.push(`🔋 Power lasted all ${st.missionDays} days (lowest battery ${pct(r.minBatPct)}).`);
  reasons.push(`📡 Earth was in view ${pct(r.earthPct)} of the time; longest radio gap ${fmtDur(r.maxGapH)}.`);
  reasons.push(r.landSun ? '🛬 Landed in sunlight — hazard cameras worked.' : '🛬 Landed in darkness — risky hazard detection.');
  reasons.push(`⛽ Fuel: needed ${Math.round(r.fuel.needKg)} kg of ${L.propKg} kg (Δv ${Math.round(r.fuel.dv)} m/s) → margin ${r.fuel.marginPct.toFixed(1)}%.`);
  const title = r.tipped ? '💥 Landing failed' : r.success ? (r.score >= 70 ? '✅ Mission success!' : '⚠️ Survived, with risks') : '❌ Mission lost';
  const bar = (lbl, v, col) => `<div><span style="width:52px">${lbl}</span><i><span style="width:${Math.round(v * 100)}%;background:${col}"></span></i></div>`;
  $('result').innerHTML = `<div class="result ${cls}"><h3>${title}</h3>
    <div class="score"><div class="big">${r.score}</div><div class="bars">${bar('Power', r.parts.power, '#fbbf24')}${bar('Radio', r.parts.comms, '#60a5fa')}${bar('Terrain', r.parts.terrain, '#34d399')}${bar('Fuel', r.parts.fuel, '#a78bfa')}</div></div>
    <ul>${reasons.map(x => `<li>${x}</li>`).join('')}</ul>
    ${r.success ? '' : '<p class="note">Try: a later landing date (Plan mode → seasons), <b>Find Plan B</b>, or a bigger battery.</p>'}
    <p class="disclaimer">Educational simulation: real NASA Sun/Earth/terrain data, simplified lander power and fuel models (score weights: power 40, radio 25, terrain 20, fuel 15).</p></div>`;
}

// ---------- guided tour
const TOUR = [
  { t: null, h: 'Welcome to SouthLight 👋', p: 'SouthLight answers one question: <b>if a spacecraft lands HERE on THIS date, will it get sunlight for power and see Earth for radio?</b> At the Moon\'s south pole both are hard, because the Sun skims the horizon and mountains block it. Everything you see uses real NASA data.' },
  { t: '.panel.left', h: '1 · Choose a place', p: 'Pick a famous landing site from the list, or <b>tap the map</b>. The map shows the south pole: <b>bright = lots of sunlight</b>, <b>black = craters that never see the Sun</b>.' },
  { t: '.skywrap', h: '2 · Look around', p: 'This is the <b>real NASA terrain</b> at your site. The Sun shines from its true direction, so you see the real long shadows. <b>Drag</b> to turn your head, or switch to <b>🛸 Drone view</b> to fly above the craters.' },
  { t: '#timeline', h: '3 · Choose a time', p: 'This strip is the <b>next month, hour by hour</b>. <b style="color:#fbbf24">Yellow</b> = Sun up (power). <b style="color:#60a5fa">Blue</b> = Earth visible (radio). <b style="color:#34d399">Green</b> = both. <b>Black gaps = danger.</b> Tap it to jump in time, or press ▶ to watch.' },
  { t: '#verdict', h: '4 · The answer', p: 'Here SouthLight gives you a <b>plain verdict</b>, and below it the countdowns: how long until dark, and how long until radio is lost.' },
  { t: '.modes', h: '5 · Plan and Launch', p: '<b>📋 Plan</b>: compare sites, see the best months, and find a <b>Plan B</b> if the launch is delayed. <b>🚀 Launch</b>: send a virtual lander and see if it survives. Have fun!' },
];
let tourI = 0;
function showTour(i) {
  document.querySelectorAll('.spot').forEach(e => e.classList.remove('spot'));
  if (i < 0 || i >= TOUR.length) { $('tour').classList.add('hidden'); try { localStorage.setItem('sl_tour', '1'); } catch {} return; }
  tourI = i; const s = TOUR[i]; $('tour').classList.remove('hidden');
  $('tourStep').textContent = `Step ${i + 1} of ${TOUR.length}`; $('tourTitle').textContent = s.h; $('tourText').innerHTML = s.p;
  $('tourBack').style.visibility = i ? 'visible' : 'hidden'; $('tourNext').textContent = i === TOUR.length - 1 ? 'Start exploring 🚀' : 'Next';
  const box = document.querySelector('.tourbox');
  if (!s.t) { box.style.left = '50%'; box.style.top = '30%'; box.style.transform = 'translate(-50%,0)'; document.body.classList.add('dim'); return; }
  const el = document.querySelector(s.t); el.scrollIntoView({ block: 'center', behavior: 'smooth' }); el.classList.add('spot');
  setTimeout(() => {
    const r = el.getBoundingClientRect(), bw = Math.min(360, innerWidth - 20); box.style.transform = 'none';
    let left = r.right + 14, top = Math.max(10, r.top);
    if (left + bw > innerWidth - 10) { left = Math.max(10, Math.min(innerWidth - bw - 10, r.left)); top = r.bottom + 12; if (top + 220 > innerHeight) top = Math.max(10, r.top - 230); }
    box.style.left = left + 'px'; box.style.top = top + 'px';
  }, 350);
}

// ---------- play
let raf = null, lastT = 0;
function play() { st.playing = true; $('btnPlay').textContent = '⏸'; lastT = performance.now(); raf = requestAnimationFrame(loop); }
function stop() { st.playing = false; $('btnPlay').textContent = '▶'; cancelAnimationFrame(raf); }
function loop(now) {
  const dt = (now - lastT) / 1000; lastT = now;
  st.cursor += dt * st.speed * HOUR;
  if (st.cursor > st.winStart + (st.series.t.length - 1) * HOUR) st.cursor = st.winStart;
  drawSky(); drawTimeline(); drawCards();
  if (st.playing) raf = requestAnimationFrame(loop);
}

// ---------- share link
function writeHash() {
  if (!st.site) return;
  const p = new URLSearchParams({ lat: st.site.lat.toFixed(4), lon: st.site.lon.toFixed(4), t: new Date(st.landingMs).toISOString().slice(0, 16), d: st.delay, m: st.mode, l: st.lander, md: st.missionDays });
  if (st.site.id) p.set('s', st.site.id);
  history.replaceState(null, '', '#' + p.toString());
}
function readHash() { const p = new URLSearchParams(location.hash.slice(1)); return Object.fromEntries(p.entries()); }

// ---------- setup
const sky = new SkyView($('sky'));
let v3d = null, viewMode = 'astro';
async function init3D() {
  try {
    const m = await import('./view3d.js'); await m.loadDem('data/dem');
    v3d = new m.View3D($('view3d')); v3d.onLook = () => st.series && drawSky();
  } catch (e) { console.warn('3D unavailable', e); viewMode = 'chart'; setView('chart'); $('terrainNote').textContent = '3D view unavailable on this device — showing sky chart'; }
}
async function update3DSite() {
  if (!v3d) return; await v3d.setSite(st.site); $('terrainNote').textContent = v3d.terrainNote;
  const sun = A.sunAt(st.site.obs, st.cursor); drawSky(); v3d.lookToward(sun.az);
}
function setView(m) {
  viewMode = m; document.querySelectorAll('[data-view]').forEach(b => b.classList.toggle('active', b.dataset.view === m));
  const chart = m === 'chart' || !v3d; $('sky').classList.toggle('hidden', !chart); $('view3d').classList.toggle('hidden', chart);
  $('viewHint').textContent = chart ? '⟷ drag to look around · real LOLA skyline · vertical scale exaggerated' : m === 'astro' ? '⟷ drag to look around · real NASA LOLA terrain · true scale' : 'drag to orbit · scroll/pinch to zoom · purple beam = your landing site';
  if (v3d && !chart) v3d.setMode(m); if (chart) sky.draw(); if (st.series) drawSky();
}
const map = new PoleMap($('map'), $('mapLegend'), async (lat, lon) => setSite(await buildSite(lat, lon)));

function setMode(m) {
  st.mode = m; document.body.dataset.mode = m;
  document.querySelectorAll('.modes button').forEach(b => b.classList.toggle('active', b.dataset.mode === m));
  st.lastResult = null; drawAll(); writeHash();
}

const FIRST_HASH = location.hash;
async function main() {
  document.body.dataset.mode = 'explore';
  const [, , sitesJson] = await Promise.all([A.loadEphemeris('data'), T.loadGrid('data/grid'), fetch('data/sites.json').then(r => r.json())]);
  st.sitesData = sitesJson.sites.map(s => ({ ...s, mask: Float32Array.from(s.mask), heightM: s.height_m ?? 0, slope: s.slope_deg }));
  // site select grouped
  const groups = {}; st.sitesData.forEach(s => (groups[s.group] ||= []).push(s));
  $('siteSelect').innerHTML = Object.entries(groups).map(([g, ss]) => `<optgroup label="${g}">${ss.map(s => `<option value="${s.id}">${s.name}</option>`).join('')}</optgroup>`).join('') + '<option value="custom" hidden>Custom point</option>';
  map.setMarkers(st.sitesData.map(s => ({ lat: s.lat, lon: s.lon, short: s.short })));
  renderLanders();

  // initial state from link or defaults
  const h = readHash(), r = A.ephemRange();
  const now = Date.now(); let land = h.t ? Date.parse(h.t + ':00Z') : Math.max(r.start, Math.min(r.end - 40 * DAY, Math.floor(now / DAY) * DAY + DAY));
  if (!isFinite(land)) land = r.start;
  st.landingMs = land; st.delay = +(h.d || 0); st.lander = LANDERS[h.l] ? h.l : 'medium'; st.missionDays = +(h.md || 14);
  $('inDate').value = new Date(land).toISOString().slice(0, 16);
  $('inDate').min = new Date(r.start).toISOString().slice(0, 16); $('inDate').max = new Date(r.end - 33 * DAY).toISOString().slice(0, 16);
  $('inDelay').value = st.delay; $('delayVal').textContent = `${st.delay} d`; $('inDays').value = st.missionDays; $('daysVal').textContent = `${st.missionDays} d`;
  renderLanders();
  let site;
  if (h.s && st.sitesData.find(s => s.id === h.s)) site = st.sitesData.find(s => s.id === h.s);
  else if (h.lat) site = await buildSite(+h.lat, +h.lon);
  else site = st.sitesData[0];
  $('siteSelect').value = site.id || 'custom';
  await init3D();
  document.querySelectorAll('[data-view]').forEach(b => b.onclick = () => setView(b.dataset.view));
  setView(v3d ? 'astro' : 'chart');
  setMode(['explore', 'plan', 'launch'].includes(h.m) ? h.m : 'explore');
  await setSite(site);
  map.draw();

  // events
  $('siteSelect').onchange = () => { const s = st.sitesData.find(x => x.id === $('siteSelect').value); if (s) setSite(s); };
  $('btnGo').onclick = async () => { $('siteSelect').value = 'custom'; setSite(await buildSite(+$('inLat').value, +$('inLon').value)); };
  $('mapLayer').onchange = () => map.setLayer($('mapLayer').value);
  document.querySelectorAll('[data-move]').forEach(b => b.onclick = async () => {
    if (!st.site.terrain) return toast('Move works inside the south-pole map');
    const before = st.summary.sunPct, { x, y } = T.toXY(st.site.lat, st.site.lon);
    const up = Math.hypot(x, y) || 1, ux = x / up, uy = y / up; // radial (north) direction in polar stereographic
    const dir = b.dataset.move, d = 2000;
    const [dx, dy] = dir === 'N' ? [ux * d, uy * d] : dir === 'S' ? [-ux * d, -uy * d] : dir === 'E' ? [uy * d, -ux * d] : [-uy * d, ux * d];
    const ll = T.toLatLon(x + dx, y + dy); $('siteSelect').value = 'custom';
    await setSite(await buildSite(ll.lat, ll.lon), { keepPlanned: true });
    const after = st.summary.sunPct, diff = after - before;
    $('nudgeMsg').innerHTML = `Moved 2 km ${dir}: sunlight ${pct(before)} → <b style="color:${diff >= 0 ? 'var(--ok)' : 'var(--bad)'}">${pct(after)}</b> (${diff >= 0 ? '+' : ''}${diff.toFixed(0)} pts)`;
  });
  document.querySelectorAll('.modes button').forEach(b => b.onclick = () => setMode(b.dataset.mode));
  $('inDate').onchange = () => { const v = Date.parse($('inDate').value + ':00Z'); if (isFinite(v)) { st.landingMs = v; st.cursor = 0; recompute(); writeHash(); } };
  $('inDelay').oninput = () => { st.delay = +$('inDelay').value; $('delayVal').textContent = `${st.delay} d`; st.cursor = 0; recompute(); writeHash(); };
  $('inDays').oninput = () => { st.missionDays = +$('inDays').value; $('daysVal').textContent = `${st.missionDays} d`; drawTimeline(); if (st.mode === 'plan') drawPlan(); writeHash(); };
  $('btnPlay').onclick = () => st.playing ? stop() : play();
  $('speed').onchange = () => st.speed = +$('speed').value;
  $('btnPlanB').onclick = findPlanB;
  $('btnPin').onclick = () => { if (!st.pins.includes(st.site)) st.pins.push(st.site); drawCompare(); toast('Pinned — pick another site to compare'); };
  $('btnCsv').onclick = exportCsv;
  $('btnLaunch').onclick = launch;
  $('btnTour').onclick = () => showTour(0);
  $('tourNext').onclick = () => showTour(tourI + 1); $('tourBack').onclick = () => showTour(tourI - 1); $('tourSkip').onclick = () => showTour(-1);
  let seen = false; try { seen = localStorage.getItem('sl_tour') === '1'; } catch {}
  if (!seen && !FIRST_HASH) setTimeout(() => showTour(0), 900);
  $('btnShare').onclick = async () => { writeHash(); try { await navigator.clipboard.writeText(location.href); toast('Link copied — anyone can open this exact mission'); } catch { toast(location.href); } };
  $('btnAbout').onclick = () => { $('aboutBody').innerHTML = aboutHTML(); $('about').showModal(); };
  // timeline scrubbing
  const tl = $('timeline'); let scrub = false;
  const setFromX = e => { const r = tl.getBoundingClientRect(), L = 34, R = r.width - 6; const f = Math.max(0, Math.min(1, (e.clientX - r.left - L) / (R - L))); st.cursor = st.winStart + f * st.series.t.length * HOUR; drawSky(); drawTimeline(); drawCards(); };
  tl.addEventListener('pointerdown', e => { scrub = true; tl.setPointerCapture(e.pointerId); stop(); setFromX(e); });
  tl.addEventListener('pointermove', e => scrub && setFromX(e));
  tl.addEventListener('pointerup', () => scrub = false);
  window.addEventListener('resize', () => { drawTimeline(); if (st.mode === 'plan') drawSeasons(); });
  // face the Sun at start
  sky.lookAt(A.sunAt(st.site.obs, st.cursor).az);
}
main().catch(e => { console.error(e); document.body.insertAdjacentHTML('afterbegin', `<p style="color:#f87171;padding:12px">Failed to load data: ${e.message}</p>`); });
