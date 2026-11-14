// SouthLight — lander mission simulation (educational, simplified models).
// Power: solar panels + battery, hour by hour, using the real Sun/terrain series.
// Radio: direct-to-Earth only when Earth is above the terrain horizon.
// Fuel: rocket equation with an approximate descent delta-v budget.
// Code written with AI assistance (Claude).

export const LANDERS = {
  small:  { name: 'Small', desc: 'Rover-size lander', panelW: 300,  batteryWh: 1500,  loadW: 120,  dryKg: 600,  propKg: 600,  isp: 320 },
  medium: { name: 'Medium', desc: 'CLPS-class lander', panelW: 900,  batteryWh: 5000,  loadW: 350,  dryKg: 1500, propKg: 1450, isp: 320 },
  large:  { name: 'Large', desc: 'Cargo lander',      panelW: 4000, batteryWh: 30000, loadW: 1600, dryKg: 5000, propKg: 4700, isp: 330 },
};

const G0 = 9.80665;
export const DESCENT_DV = 1900;   // m/s, approx. 100 km lunar orbit -> surface incl. braking
export const HOVER_DV = 60;       // m/s reserve for hazard avoidance
const V_ORBIT = 1633;             // m/s, ~100 km circular lunar orbit
const WAIT_DV_PER_DAY = 0.5;      // m/s per day of orbit maintenance while waiting

export function fuelBudget(lander, delayDays, divertKm) {
  const dv = DESCENT_DV + HOVER_DV + WAIT_DV_PER_DAY * delayDays + V_ORBIT * (divertKm / 1737.4);
  const need = lander.dryKg * (Math.exp(dv / (lander.isp * G0)) - 1);
  return { dv, needKg: need, marginPct: 100 * (lander.propKg - need) / lander.propKg };
}

// series s starts exactly at landing (index 0), hourly
export function simulate(s, lander, missionDays, slopeDeg, delayDays = 0, divertKm = 0) {
  const H = Math.min(s.t.length, Math.round(missionDays * 24));
  let bat = lander.batteryWh, dead = -1, earthH = 0, gap = 0, maxGap = 0, minBat = bat;
  const batTrace = new Float32Array(H);
  for (let i = 0; i < H; i++) {
    bat = Math.min(lander.batteryWh, bat + lander.panelW * s.sunFrac[i] - lander.loadW);
    minBat = Math.min(minBat, bat); batTrace[i] = Math.max(0, bat);
    if (s.earthVis[i]) { earthH++; gap = 0; } else { gap++; maxGap = Math.max(maxGap, gap); }
    if (bat <= 0) { dead = i; break; }
  }
  const survivedH = dead >= 0 ? dead : H;
  const landSun = s.sunFrac[0] > 0.5, landEarth = !!s.earthVis[0];
  const fuel = fuelBudget(lander, delayDays, divertKm);
  const slope = slopeDeg ?? 3;
  const tipped = slope > 15;
  const simH = dead >= 0 ? dead + 1 : H;
  let darkRun = 0; if (dead >= 0) { for (let i = dead; i >= 0 && s.sunFrac[i] < 0.5; i--) darkRun++; }
  const out = { H, survivedH, dead, darkRun, earthPct: 100 * earthH / Math.max(1, simH), maxGapH: maxGap, minBatPct: 100 * Math.max(0, minBat) / lander.batteryWh,
    landSun, landEarth, slope, tipped, fuel, batTrace };
  // safety score (0..100) — transparent weights
  const pPower = tipped ? 0 : survivedH / H;
  const pComms = Math.min(1, out.earthPct / 60);
  let pTerrain = slope <= 5 ? 1 : slope >= 15 ? 0 : 1 - (slope - 5) / 10;
  if (!landSun) pTerrain *= 0.6;          // landing cameras can't see hazards in darkness
  const pFuel = fuel.marginPct >= 10 ? 1 : fuel.marginPct <= 0 ? 0 : fuel.marginPct / 10;
  out.parts = { power: pPower, comms: pComms, terrain: pTerrain, fuel: pFuel };
  out.score = Math.round(100 * (0.4 * pPower + 0.25 * pComms + 0.2 * pTerrain + 0.15 * pFuel));
  out.success = !tipped && dead < 0 && fuel.marginPct > 0;
  if (!out.success) out.score = Math.min(out.score, 59);   // a lost mission can never look 'safe'
  return out;
}
