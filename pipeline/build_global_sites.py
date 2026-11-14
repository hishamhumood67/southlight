"""SouthLight data pipeline, step 5: real terrain for curated sites outside the
south-pole maps (Apollo, Chandrayaan-3, Chang'e 4, IM-1) from the global
LOLA LDEM_64 (64 px/deg, ~470 m), read with HTTP range requests (only the
rows we need). Produces a 720-direction horizon mask, height and slope, and a
local East/North height grid for the 3D view.
Code written with AI assistance (Claude)."""
import json, os, sys, subprocess
import numpy as np

URL = "https://pds-geosciences.wustl.edu/lro/lro-l-lola-3-rdr-v1/lrolol_1xxx/data/lola_gdr/cylindrical/img/ldem_64.img"
PPD, NS, ROWB, R = 64, 23040, 46080, 1737400.0
W_DEG = 3.2                                     # half-window in latitude (~97 km)
OUT = "docs/data/dem"; CACHE = "data_raw/ldem64_cache"; os.makedirs(CACHE, exist_ok=True)

def rows(r0, r1):
    f = f"{CACHE}/rows_{r0}_{r1}.bin"
    if not os.path.exists(f):
        subprocess.run(["curl", "-s", "-r", f"{r0*ROWB}-{r1*ROWB-1}", "-o", f, URL], check=True)
    return np.fromfile(f, dtype="<i2").reshape(r1 - r0, NS).astype(np.float32) * 0.5

class Crop:
    def __init__(self, lat, lon):
        self.r0 = max(0, int((90 - lat - W_DEG) * PPD)); self.r1 = min(11520, int((90 - lat + W_DEG) * PPD) + 1)
        self.h = rows(self.r0, self.r1)
    def height(self, la, lo):
        r = (90 - la) * PPD - 0.5 - self.r0; c = (np.mod(lo, 360)) * PPD - 0.5
        r0 = np.clip(np.floor(r).astype(int), 0, self.h.shape[0] - 2); c0 = np.floor(c).astype(int)
        fr, fc = r - r0, c - c0; c0m, c1m = np.mod(c0, NS), np.mod(c0 + 1, NS)
        v = (self.h[r0, c0m] * (1 - fr) * (1 - fc) + self.h[r0, c1m] * (1 - fr) * fc + self.h[r0 + 1, c0m] * fr * (1 - fc) + self.h[r0 + 1, c1m] * fr * fc)
        ok = (r >= 0) & (r < self.h.shape[0] - 1)
        return np.where(ok, v, np.nan)

def dest(lat, lon, az, d):
    p1, l1, dl = np.radians(lat), np.radians(lon), d / R
    p2 = np.arcsin(np.sin(p1) * np.cos(dl) + np.cos(p1) * np.sin(dl) * np.cos(az))
    l2 = l1 + np.arctan2(np.sin(az) * np.sin(dl) * np.cos(p1), np.cos(dl) - np.sin(p1) * np.sin(p2))
    return np.degrees(p2), np.degrees(l2)

DIST = np.concatenate([np.arange(150, 3000, 150.0), 3000 * 1.02 ** np.arange(0, int(np.log(95000 / 3000) / np.log(1.02)) + 1)])

def site_data(lat, lon, mast=2.0):
    C = Crop(lat, lon)
    h0 = float(C.height(np.array([lat]), np.array([lon]))[0])
    az = np.radians(np.arange(720) * 0.5)[:, None]
    la, lo = dest(lat, lon, az, DIST[None, :])
    h = C.height(la, lo); dl = (DIST / R)[None, :]
    rs, rp = R + h0 + mast, R + h
    el = np.degrees(np.arctan2(rp * np.cos(dl) - rs, rp * np.sin(dl)))
    mask = np.nanmax(np.where(np.isnan(el), -90, el), axis=1)
    # slope over ~1 km
    e = [C.height(*map(np.array, dest(lat, lon, np.radians(a), 500.0))) for a in (90, 270, 0, 180)]
    gx, gy = (e[0] - e[1]) / 1000, (e[2] - e[3]) / 1000
    slope = float(np.degrees(np.arctan(np.hypot(gx, gy)))[()])
    # 3D grid: 161 x 161, 250 m spacing, local east/north arc distances, row 0 = north
    n, sp = 161, 250.0
    E = (np.arange(n) - (n - 1) / 2) * sp; N = -(np.arange(n) - (n - 1) / 2) * sp
    EE, NN = np.meshgrid(E, N); d = np.hypot(EE, NN); a = np.arctan2(EE, NN)
    gla, glo = dest(lat, lon, a, d); g = C.height(gla, glo)
    return mask, h0, slope, dict(n=n, spacing_m=sp, kind="enu"), g

if __name__ == "__main__":
    S = json.load(open("docs/data/sites.json")); P = json.load(open(f"{OUT}/patches.json"))
    for s in S["sites"]:
        if s["lat"] < -79.5 and s["id"] != "im1":
            continue
        mask, h0, slope, meta, grid = site_data(s["lat"], s["lon"])
        s.update(terrain=True, height_m=round(h0), slope_deg=round(slope, 1), mask=[round(float(v), 2) for v in mask],
                 terrain_source="LOLA LDEM_64 (~470 m)")
        if s["id"] == "im1":
            s["note"] = s["note"]  # keep
        np.clip(np.round(grid), -32768, 32767).astype("<i2").tofile(f"{OUT}/p_{s['id']}.bin")
        P[s["id"]] = meta
        print(s["id"], round(h0), round(slope, 1), "max horizon", round(float(mask.max()), 2))
    json.dump(S, open("docs/data/sites.json", "w"))
    json.dump(P, open(f"{OUT}/patches.json", "w"), indent=1)
