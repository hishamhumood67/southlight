"""SouthLight data pipeline, step 2: south-pole terrain grid.

For every point of a 2 km grid (polar stereographic) out to ~85 deg S:
  * terrain horizon mask, 360 azimuths (uint8: el = v/10 - 10 deg)
  * height, slope
  * 2027 statistics: % of time Sun visible, % Earth visible, longest night
Masks are written in 16x16-point tiles so the browser downloads only what
it needs. Code written with AI assistance (Claude).
"""
import json, os, sys, datetime as dt
import numpy as np
from multiprocessing import Pool
sys.path.insert(0, os.path.dirname(__file__))
import horizon as H, topo
from dem import PolarDEM

OUT = "docs/data/grid"
SPACING = 2000.0
NHALF = 75                      # grid -75..75 => 151 x 151, radius 150 km
TILE = 16
os.makedirs(OUT, exist_ok=True)

meta, EPH, T0 = topo.load()
i0 = int((dt.datetime(2027, 1, 1, tzinfo=dt.timezone.utc) - T0).total_seconds() / 3600)
SUN = EPH[i0:i0 + 8760, :3]; EARTH = EPH[i0:i0 + 8760, 3:]
AZ = np.arange(361)

def longest_run(b):
    best = cur = 0
    for v in b:
        cur = cur + 1 if v else 0
        best = max(best, cur)
    return best

def work(ij):
    i, j = ij
    x, y = i * SPACING, j * SPACING
    if np.hypot(x, y) > NHALF * SPACING:
        return ij, None
    lat, lon = PolarDEM.to_latlon(x, y)
    m = H.mask(lat, lon)
    mm = np.append(m, m[0])
    az, el = topo.azel(lat, lon, SUN)
    sun = el > np.interp(az, AZ, mm)
    az, el = topo.azel(lat, lon, EARTH)
    earth = el > np.interp(az, AZ, mm)
    sl = H.slope(lat, lon)
    return ij, dict(mask=np.clip(np.round((m + 10) * 10), 0, 255).astype(np.uint8),
                    h=H.site_height(lat, lon), slope=-1 if sl is None else sl,
                    sun=sun.mean(), earth=earth.mean(), night=longest_run(~sun))

if __name__ == "__main__":
    H.load()
    N = 2 * NHALF + 1
    jobs = [(i, j) for j in range(-NHALF, NHALF + 1) for i in range(-NHALF, NHALF + 1)]
    masks = np.zeros((N, N, 360), np.uint8)
    stats = np.full((5, N, N), np.nan, np.float32)
    with Pool(2) as p:
        for k, (ij, r) in enumerate(p.imap_unordered(work, jobs, chunksize=64)):
            if r is None:
                continue
            gi, gj = ij[0] + NHALF, ij[1] + NHALF
            masks[gj, gi] = r["mask"]
            stats[:, gj, gi] = [r["h"], r["slope"], r["sun"], r["earth"], r["night"]]
            if k % 2000 == 0:
                print(k, flush=True)
    nt = (N + TILE - 1) // TILE
    for tj in range(nt):
        for ti in range(nt):
            masks[tj*TILE:(tj+1)*TILE, ti*TILE:(ti+1)*TILE].tofile(f"{OUT}/t_{ti}_{tj}.bin")
    stats.tofile(f"{OUT}/stats.bin")
    json.dump(dict(spacing_m=SPACING, nhalf=NHALF, n=N, tile=TILE, ntiles=nt,
                   stats=["height_m", "slope_deg", "sun_frac_2027", "earth_frac_2027", "longest_night_h_2027"],
                   mask_encoding="uint8 v -> elevation deg = v/10 - 10; 360 azimuths, 0=N clockwise",
                   projection="LOLA south polar stereographic, R=1737.4 km, x=2R tan(pi/4+lat/2) sin(lon), y=... cos(lon)",
                   source="LRO LOLA LDEM_85S_40M + LDEM_75S_240M (PDS)", mast_m=2.0),
              open(f"{OUT}/grid.json", "w"), indent=1)
    np.save("data_raw/grid_masks.npy", masks)
    print("done")
