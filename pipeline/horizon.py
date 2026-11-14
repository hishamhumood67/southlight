"""Terrain horizon masks from LOLA DEMs (method of Mazarico et al. 2011):
for every azimuth, march outward across the terrain and keep the highest
elevation angle, accounting for the Moon's curvature.
Code written with AI assistance (Claude)."""
import numpy as np
from dem import PolarDEM, R_M

D_NEAR = D_FAR = None

def load(raw="data_raw"):
    global D_NEAR, D_FAR
    D_NEAR = PolarDEM(f"{raw}/ldem_85s_40m.img", f"{raw}/ldem_85s_40m.lbl")
    D_FAR = PolarDEM(f"{raw}/ldem_75s_240m.img", f"{raw}/ldem_75s_240m.lbl")

# ray distances (m): fine near site, coarser far away, out to 650 km
DIST = np.concatenate([np.arange(40, 2000, 40.0),
                       2000 * 1.012 ** np.arange(0, int(np.log(650000 / 2000) / np.log(1.012)) + 1)])

def terrain_height(lat, lon):
    x, y = PolarDEM.to_xy(lat, lon)
    hn = D_NEAR.sample_xy(x, y)
    hf = D_FAR.sample_xy(x, y)
    return np.where(np.isnan(hn), hf, hn)

def site_height(lat, lon):
    return float(terrain_height(np.array([lat]), np.array([lon]))[0])

def mask(lat, lon, naz=360, mast_m=2.0, dist=DIST):
    """Horizon elevation (deg) for naz azimuths (0=N, clockwise, E=90)."""
    p1, l1 = np.radians(lat), np.radians(lon)
    az = np.radians(np.arange(naz) * 360.0 / naz)[:, None]
    dlt = (dist / R_M)[None, :]
    p2 = np.arcsin(np.sin(p1) * np.cos(dlt) + np.cos(p1) * np.sin(dlt) * np.cos(az))
    l2 = l1 + np.arctan2(np.sin(az) * np.sin(dlt) * np.cos(p1),
                         np.cos(dlt) - np.sin(p1) * np.sin(p2))
    h = terrain_height(np.degrees(p2), np.degrees(l2))
    rs = R_M + site_height(lat, lon) + mast_m
    rp = R_M + h
    el = np.degrees(np.arctan2(rp * np.cos(dlt) - rs, rp * np.sin(dlt)))
    el = np.where(np.isnan(el), -90, el)
    return el.max(axis=1)

def slope(lat, lon, r=120.0):
    """Mean surface slope (deg) over ~r metres using the 40 m DEM."""
    x, y = PolarDEM.to_xy(lat, lon)
    s = D_NEAR.scale
    xs = x + np.array([-r, r, 0, 0]); ys = y + np.array([0, 0, -r, r])
    h = D_NEAR.sample_xy(xs, ys)
    if np.any(np.isnan(h)):
        return None
    gx = (h[1] - h[0]) / (2 * r); gy = (h[3] - h[2]) / (2 * r)
    return float(np.degrees(np.arctan(np.hypot(gx, gy))))
