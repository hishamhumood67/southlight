"""SouthLight data pipeline, step 4: terrain for the 3D view.

* 200 m south-pole elevation tiles (128x128 px, int16 metres) covering
  +-166 km around the pole, block-averaged from LOLA LDEM_85S_40M
  (LDEM_75S_240M beyond its edge).
* 40 m close-up patches (12.8 km) around each curated polar site; 240 m
  patches (30 km) for curated sites north of the 40 m map.
All in LOLA south polar stereographic coordinates.
Code written with AI assistance (Claude).
"""
import json, os, sys
import numpy as np
sys.path.insert(0, os.path.dirname(__file__))
import horizon as H
from dem import PolarDEM

OUT = "docs/data/dem"
os.makedirs(OUT, exist_ok=True)
H.load()

def heights(xs, ys, sub=1, step=0.0):
    """mean height over sub x sub sub-samples spread across one pixel of size step"""
    acc = np.zeros(xs.shape, np.float64); cnt = np.zeros(xs.shape)
    offs = [((k + 0.5) / sub - 0.5) * step for k in range(sub)] if sub > 1 else [0.0]
    for ox in offs:
        for oy in offs:
            hn = H.D_NEAR.sample_xy(xs + ox, ys + oy)
            hf = H.D_FAR.sample_xy(xs + ox, ys + oy)
            h = np.where(np.isnan(hn), hf, hn)
            ok = ~np.isnan(h); acc[ok] += h[ok]; cnt[ok] += 1
    return np.where(cnt > 0, acc / np.maximum(cnt, 1), -32768)

# ---- 200 m tiles
SP, TILE, NT = 200.0, 128, 13
N = TILE * NT
half = N * SP / 2
for tj in range(NT):
    for ti in range(NT):
        ix = np.arange(TILE) + ti * TILE; jy = np.arange(TILE) + tj * TILE
        X = -half + (ix + 0.5) * SP
        Y = half - (jy + 0.5) * SP          # row 0 = north edge (+y)
        XX, YY = np.meshgrid(X, Y)
        h = heights(XX, YY, sub=3, step=SP)
        np.clip(np.round(h), -32768, 32767).astype("<i2").tofile(f"{OUT}/t_{ti}_{tj}.bin")
    print("row", tj, flush=True)
json.dump(dict(spacing_m=SP, tile=TILE, ntiles=NT, half_m=half,
               layout="tile (ti,tj): x from -half+ti*tile*sp, y from +half-tj*tile*sp (row 0 north); int16 metres above 1737.4 km",
               source="LOLA LDEM_85S_40M (3x3 averaged) + LDEM_75S_240M"), open(f"{OUT}/tiles.json", "w"), indent=1)

# ---- close-up patches for curated sites
sites = json.load(open("docs/data/sites.json"))["sites"]
patches = {}
for s in sites:
    if s["lat"] > -75.5:
        continue
    x0, y0 = PolarDEM.to_xy(s["lat"], s["lon"])
    near = np.isfinite(H.D_NEAR.sample_xy(np.array([x0]), np.array([y0])))[0]
    sp, n = (40.0, 320) if near else (240.0, 128)
    X = x0 + (np.arange(n) - n / 2 + 0.5) * sp
    Y = y0 - (np.arange(n) - n / 2 + 0.5) * sp
    XX, YY = np.meshgrid(X, Y)
    h = heights(XX, YY, sub=1)
    np.clip(np.round(h), -32768, 32767).astype("<i2").tofile(f"{OUT}/p_{s['id']}.bin")
    patches[s["id"]] = dict(x0=float(x0), y0=float(y0), spacing_m=sp, n=n)
    print("patch", s["id"], sp, n)
json.dump(patches, open(f"{OUT}/patches.json", "w"), indent=1)
