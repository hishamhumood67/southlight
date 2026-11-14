"""SouthLight data pipeline, step 3: curated landing sites.
Coordinates from public sources (LROC, IAU Gazetteer, NASA/GSFC papers).
Code written with AI assistance (Claude)."""
import json, os, sys
import numpy as np
sys.path.insert(0, os.path.dirname(__file__))
import horizon as H

SITES = [
 # id, name, lat, lon(E), group, note
 ("ridge", "Shackleton–de Gerlache connecting ridge", -89.45, 222.69, "South pole · Artemis area",
  "One of the best-lit spots near the pole (Mazarico et al. 2011, 'Site 1'). NASA's PRIME-1 / IM-2 team first considered this ridge."),
 ("malapert", "Malapert Massif summit", -85.99, 2.10, "South pole · Artemis III region",
  "A 5 km-high massif facing Earth. Artemis III candidate region. Summit located from LOLA terrain."),
 ("mouton", "Mons Mouton (IM-2 Athena)", -84.7906, 29.1957, "South pole · CLPS",
  "Intuitive Machines IM-2 landed here on 6 March 2025, about 160 km from the pole (CLPS)."),
 ("degerlache", "de Gerlache crater rim", -88.67, 292.0, "South pole · Artemis area",
  "Crater rim near the pole; 'de Gerlache Rim 2' is an Artemis III candidate region nearby."),
 ("shackleton_floor", "Shackleton crater floor (permanent shadow)", -89.66, 129.2, "South pole · Science target",
  "A permanently shadowed region — never sees the Sun. Great for ice, deadly for solar power."),
 ("im1", "Malapert A (IM-1 Odysseus)", -80.13, 1.44, "CLPS",
  "Intuitive Machines IM-1 landed here on 22 Feb 2024 — first commercial Moon landing (CLPS)."),
 ("chandrayaan3", "Statio Shiv Shakti (Chandrayaan-3)", -69.373, 32.319, "Other countries",
  "ISRO's Vikram lander touched down here on 23 Aug 2023 (IAU-approved name)."),
 ("change4", "Chang'e 4 (far side)", -45.444, 177.599, "Other countries",
  "CNSA's first far-side landing (2019). Earth is never visible here — it needed a relay satellite."),
 ("apollo11", "Apollo 11 – Tranquility Base", 0.674, 23.473, "Apollo",
  "First crewed landing, 20 July 1969. Near the equator: the Sun climbs high and Earth hangs overhead."),
 ("apollo17", "Apollo 17 – Taurus-Littrow", 20.191, 30.772, "Apollo",
  "Last crewed landing, December 1972."),
]

SHORT = {'ridge': 'Ridge', 'malapert': 'Malapert', 'mouton': 'Mouton (IM-2)', 'degerlache': 'de Gerlache', 'shackleton_floor': 'Shackleton'}

def flat_mask(n):
    return np.zeros(n)  # smooth-sphere horizon (terrain not modelled)

if __name__ == "__main__":
    H.load()
    out = []
    for sid, name, lat, lon, group, note in SITES:
        lon_s = ((lon + 180) % 360) - 180
        terrain = lat < -79.5
        if terrain:
            m = H.mask(lat, lon_s, naz=720)
            h = H.site_height(lat, lon_s); sl = H.slope(lat, lon_s)
        else:
            m = flat_mask(720); h = None; sl = None
        out.append(dict(id=sid, name=name, short=SHORT.get(sid, ''), lat=lat, lon=lon_s, group=group, note=note,
                        terrain=bool(terrain), height_m=None if h is None else round(h),
                        slope_deg=None if sl is None else round(sl, 1),
                        mask=[round(float(v), 2) for v in m]))
        print(sid, terrain, None if h is None else round(h), sl)
    json.dump(dict(mask_azimuths=720, mast_m=2.0, sites=out), open("docs/data/sites.json", "w"))
