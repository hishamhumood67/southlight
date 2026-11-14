// SouthLight — "How it works" content. Written with AI assistance (Claude).
export const aboutHTML = () => `
<h2>How SouthLight works</h2>
<p><b>The problem.</b> At the Moon's south pole the Sun skims the horizon and Earth wobbles near it.
Whether a lander gets power (Sun) and direct radio (Earth) depends on the exact spot, the exact date, and the mountains around it.
NASA's expert tools (Quickmap, Moon Trek, JPL Horizons) contain this information, but they are slow to use for "what if we land 5 days later, or 2 km away?".
SouthLight answers those questions in seconds, for planners, students and the public.</p>

<h3>1 · Where are the Sun and Earth? (NASA/JPL SPICE)</h3>
<p>We use NASA/JPL NAIF SPICE kernels — DE440 planetary ephemeris and the DE440 lunar orientation — to compute, every hour from Nov 2026 to Dec 2028,
the apparent positions of the Sun and Earth seen from the Moon (light-time and aberration corrected), in the lunar Mean-Earth frame.
The website converts these into azimuth and elevation for <i>any</i> site you choose, including the site's own height above the reference sphere.
This automatically includes Earth's libration (the ±7° wobble) and the Sun's seasonal motion.</p>

<h3>2 · Where is the horizon? (LRO LOLA topography)</h3>
<p>The Moon has no atmosphere, so there is no refraction — the horizon is purely terrain. Following the published method of Mazarico et al. (2011),
for each direction (every 0.5–1°) we march outward across NASA's Lunar Orbiter Laser Altimeter elevation models
(LDEM_85S_40M near the site, LDEM_75S_240M out to 650 km) and keep the highest elevation angle, including the Moon's curvature.
Panels/antennas are assumed 2 m above the ground.</p>
<ul>
<li><b>Curated sites</b> are computed exactly at their coordinates (720 directions).</li>
<li><b>Anywhere on the map</b> uses a precomputed 2 km grid (≈17,700 points within ~150 km of the pole), blended between neighbours.
Narrow ridge crests can be under-represented at 2 km spacing, so curated sites are more accurate than map clicks.</li>
<li>Listed sites outside the polar maps (Apollo 11 &amp; 17, IM-1, Chandrayaan-3, Chang'e 4) use NASA's global LOLA map LDEM_64 (~470 m), read directly from the PDS archive.</li>
<li>Custom coordinates outside the south-pole map use a smooth-sphere horizon (no local hills).</li>
</ul>

<h3>3 · The 3D view</h3>
<p>The 3D landscape is built from the same LOLA elevation data (40 m close-ups around polar sites, 200 m tiles for any point on the map, ~470 m elsewhere),
placed on the curved Moon in the site's local frame at true scale. The Sun lights it from its real direction, so shadows are the real shadows for that date and hour;
Earth is lit by the same Sun, so its phase is correct. Beyond the close-up terrain, the far skyline is drawn from the LOLA horizon calculation.</p>

<h3>4 · Validation</h3>
<p><b>Ephemeris vs JPL Horizons (DE441)</b>, queried directly from the Horizons API with a surface observer on the Moon:</p>
<table><tr><th>UTC</th><th>Target @ site</th><th>Horizons az / el</th><th>SouthLight az / el</th></tr>
<tr><td>2026-12-01 00:00</td><td>Sun @ Apollo 11</td><td>268.6487 / −13.4222</td><td>268.6487 / −13.4222</td></tr>
<tr><td>2026-12-03 00:00</td><td>Sun @ Apollo 11</td><td>268.6734 / −37.7452</td><td>268.6734 / −37.7452</td></tr>
<tr><td>2026-12-01 00:00</td><td>Earth @ 89.45°S 137°W</td><td>143.6606 / −2.0532</td><td>143.6606 / −2.0532</td></tr>
<tr><td>2026-12-03 00:00</td><td>Earth @ 89.45°S 137°W</td><td>143.7987 / −4.8006</td><td>143.7987 / −4.8006</td></tr></table>
<p>Agreement is better than 0.0001°.</p>
<p><b>Illumination vs published studies.</b> For the Shackleton–de Gerlache connecting ridge we compute 81% sunlight in 2027 at 2 m height
(93% with a 10 m mast), longest continuous daylight 166 days and longest night 9 days (4 days at 10 m).
Published work finds the best ridge spots receive roughly 80–92% average sunlight, with continuous-light periods of months
(e.g. Mazarico et al. 2011; JPL IPN Progress Report 42-176). Shackleton's floor shows 0% sunlight (a known permanently shadowed region), and
about 10% of the mapped area never sees the Sun in 2027 — consistent with mapped permanently shadowed regions.
Differences come from the year analysed (lighting changes over the 18.6-year lunar cycle), height above ground and DEM resolution.</p>

<h3>5 · The lander simulation (simplified, educational)</h3>
<ul>
<li><b>Power:</b> hour by hour, panels produce power in proportion to how much of the solar disk is above the terrain; a battery covers the dark hours.</li>
<li><b>Radio:</b> direct-to-Earth contact only when Earth's centre is above the terrain horizon (no relay satellites).</li>
<li><b>Terrain:</b> slope from the 40 m LOLA model; above ~15° the lander tips over. Landing in darkness reduces the terrain score (cameras can't see hazards).</li>
<li><b>Fuel:</b> rocket equation with ≈1,900 m/s descent from a 100 km orbit + 60 m/s hover reserve, + 0.5 m/s per day of delay in orbit,
+ a plane-change cost for diverting to a Plan B site. Lander sizes are generic, not real spacecraft.</li>
<li><b>Safety score</b> = 40% power + 25% radio + 20% terrain + 15% fuel margin.</li>
</ul>

<h3>Data sources</h3>
<ul>
<li>NASA/JPL NAIF SPICE generic kernels: de440s.bsp, moon_pa_de440_200625.bpc, moon_de440_250416.tf, pck00011.tpc, naif0012.tls</li>
<li>NASA LRO LOLA gridded topography, PDS Geosciences Node: LDEM_85S_40M, LDEM_75S_240M, LDEM_64 (global)</li>
<li>JPL Horizons API (validation)</li>
<li>Site coordinates: LROC (IM-2), IAU Gazetteer of Planetary Nomenclature (Statio Shiv Shakti), Mazarico et al. 2011 (connecting ridge), public mission reports.</li>
</ul>

<h3>Limits</h3>
<p>Not for real mission certification. 40–240 m terrain cannot see boulders; panel orientation, temperature and lander shape are not modelled;
ephemeris covers Nov 2026 – Dec 2028.</p>

<h3>Use of AI</h3>
<p>The team (Erebus Computatrum) designed the concept and features. Code for the data pipeline and website was written with the help of an AI assistant (Claude by Anthropic);
results were checked against JPL Horizons and published studies as described above. No AI-generated images are used.</p>
`;
