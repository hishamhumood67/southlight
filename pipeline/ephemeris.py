"""SouthLight data pipeline, step 1: Sun and Earth ephemeris.

Uses NASA/JPL NAIF SPICE kernels (DE440 planetary ephemeris, DE440 lunar
orientation) to compute the apparent position of the Sun and Earth as seen
from the Moon's centre, expressed in the lunar Mean-Earth/Polar-Axis
(MOON_ME) body-fixed frame, every hour.

The browser later subtracts the landing-site position from these vectors and
rotates into the site's local East-North-Up frame, giving exact topocentric
azimuth/elevation for ANY coordinates the user picks.

Output: docs/data/ephem.bin  (Float32, per hour: Sx,Sy,Sz,Ex,Ey,Ez in km)
        docs/data/ephem.json (metadata)
Code written with AI assistance (Claude); see README.
"""
import json, os, sys
import numpy as np
import spiceypy as sp

RAW = sys.argv[1] if len(sys.argv) > 1 else "data_raw"
OUT = sys.argv[2] if len(sys.argv) > 2 else "docs/data"
os.makedirs(OUT, exist_ok=True)

for k in ["naif0012.tls", "pck00011.tpc", "de440s.bsp",
          "moon_pa_de440_200625.bpc", "moon_de440_250416.tf"]:
    sp.furnsh(os.path.join(RAW, k))

START = "2026-11-01T00:00:00"
END = "2029-01-01T00:00:00"
STEP_H = 1

et0 = sp.str2et(START)
et1 = sp.str2et(END)
n = int((et1 - et0) / 3600 / STEP_H)
ets = et0 + np.arange(n) * 3600.0 * STEP_H

arr = np.zeros((n, 6), dtype=np.float32)
for i, et in enumerate(ets):
    s, _ = sp.spkpos("SUN", et, "MOON_ME", "LT+S", "MOON")
    e, _ = sp.spkpos("EARTH", et, "MOON_ME", "LT+S", "MOON")
    arr[i, :3] = s
    arr[i, 3:] = e

arr.tofile(os.path.join(OUT, "ephem.bin"))
meta = {
    "start_utc": START + "Z",
    "step_hours": STEP_H,
    "count": int(n),
    "fields": ["sun_x", "sun_y", "sun_z", "earth_x", "earth_y", "earth_z"],
    "units": "km",
    "frame": "MOON_ME (lunar Mean Earth / Polar Axis, DE440)",
    "correction": "LT+S (light time + stellar aberration), observer = Moon centre",
    "kernels": ["naif0012.tls", "pck00011.tpc", "de440s.bsp",
                "moon_pa_de440_200625.bpc", "moon_de440_250416.tf"],
    "source": "NASA/JPL NAIF SPICE generic kernels",
    "moon_radius_km": 1737.4,
}
json.dump(meta, open(os.path.join(OUT, "ephem.json"), "w"), indent=1)
print("hours:", n, "bytes:", arr.nbytes)
