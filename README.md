# 🌗 SouthLight

**Will your Moon mission see the Sun and talk to Earth?**

SouthLight is a web app for the NASA Space Apps Challenge 2026 challenge **"Lunar Landing Site Navigator."** Pick any landing site and date, stand on the surface in a 360° view of the real terrain, and see where the Sun and Earth are. The app then tells you:

- how much power the site gets,
- when you can talk to Earth,
- what happens when the launch slips.

It is built from NASA data: **JPL SPICE ephemeris** and **LRO LOLA topography**.

**Team:** Erebus Computatrum · Universal Event

## Live app
👉 https://hishamhumood67.github.io/southlight/ *(GitHub Pages)*

## What it does
| Mode | For | Features |
|---|---|---|
| 🔭 **Explore** | Students & the public | Curated sites (Apollo, CLPS, Artemis III regions, Chandrayaan-3, Chang'e 4) or any point on the south-pole map · 360° first-person sky view with the real LOLA skyline, Sun and Earth (with phase and libration loop) · time playback · "Move site 2 km" to show why small changes matter · plain-language explanations |
| 📋 **Plan** | Mission planners | 30-day sunlight / Earth-contact timeline with sunset and Earthset countdowns · launch-delay slider · seasons view (monthly sunlight, Dec 2026 – Dec 2028) · **Plan B finder** (ranks every grid point within 10 km × landing times up to 10 days later) · site comparison table · CSV export |
| 🚀 **Launch** | Everyone | Choose a lander (panels, battery, fuel) and launch a virtual mission on the real data · hour-by-hour power and radio simulation · landing-lighting, slope and fuel checks · Mission Safety Score with reasons |

Any scenario can be shared as a link.

## How it works
1. **Sun and Earth positions** (`pipeline/ephemeris.py`): NASA/JPL NAIF SPICE (DE440 planetary ephemeris and DE440 lunar orientation) gives apparent Sun and Earth vectors from the Moon, hourly, in the lunar Mean-Earth frame. The browser converts them to topocentric azimuth and elevation for any site.
2. **Terrain horizon** (`pipeline/horizon.py`): ray-marching across the LOLA DEMs LDEM_85S_40M and LDEM_75S_240M, out to 650 km, with lunar curvature included. This follows the method of Mazarico et al. (2011). There is no atmosphere, so there is no refraction.
3. **South-pole grid** (`pipeline/build_grid.py`): horizon masks, slope and 2027 sunlight / Earth-visibility statistics for about 17,700 points on a 2 km grid. Masks are tiled so the browser loads only what it needs.
4. **Lander model** (`docs/js/sim.js`): a simplified solar + battery energy balance, direct-to-Earth visibility, a slope limit, and a rocket-equation fuel budget.

## Validation
- The ephemeris matches the **JPL Horizons API** to within 0.0001° in azimuth and elevation (see `validation/horizons_check.md`).
- The illumination results match published studies:
  - The Shackleton–de Gerlache ridge gets 81% sunlight in 2027 at 2 m height (93% at 10 m). Published estimates are roughly 80–92%.
  - Shackleton's floor gets 0% sunlight (a permanently shadowed region).

## Run locally
```bash
cd docs && python3 -m http.server 8000   # open http://localhost:8000
```
## Rebuild the data
```bash
pip install spiceypy numpy
bash pipeline/download_data.sh
python3 pipeline/ephemeris.py data_raw docs/data
python3 pipeline/build_sites.py
python3 pipeline/build_grid.py            # ~15 min on 2 cores
```

## NASA data used
- NASA/JPL NAIF SPICE generic kernels: `de440s.bsp`, `moon_pa_de440_200625.bpc`, `moon_de440_250416.tf`, `pck00011.tpc`, `naif0012.tls`
- NASA LRO LOLA gridded topography, PDS Geosciences Node: `LDEM_85S_40M`, `LDEM_75S_240M`
- JPL Horizons API (validation)

## Limitations
- This is an educational and planning-support tool. It is not for mission certification.
- At 40–240 m resolution, the terrain cannot show boulders.
- Panel orientation, temperature and lander geometry are not modelled.
- The lander specifications are generic.
- Sites north of 80°S use a smooth-sphere horizon.
- The ephemeris covers Nov 2026 to Dec 2028.

## Use of AI
The team chose the challenge, the concept (SouthLight), the audience and the features. The source code for the data pipeline and the website was written with the help of an AI assistant (Claude by Anthropic). The results were checked against JPL Horizons and published studies. No AI-generated images, audio or video are used.

## License
MIT. NASA data is public domain or used under the terms of each source.
