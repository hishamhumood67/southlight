"""Topocentric Sun/Earth azimuth-elevation from the precomputed ephemeris.
Same maths the website uses (docs/js/astro.js). Code written with AI assistance."""
import json, numpy as np, datetime as dt

R_MOON = 1737.4

def load(path="docs/data"):
    meta = json.load(open(f"{path}/ephem.json"))
    a = np.fromfile(f"{path}/ephem.bin", dtype=np.float32).reshape(-1, 6).astype(np.float64)
    t0 = dt.datetime.fromisoformat(meta["start_utc"].replace("Z", "+00:00"))
    return meta, a, t0

def enu_basis(lat, lon):
    la, lo = np.radians(lat), np.radians(lon)
    up = np.array([np.cos(la)*np.cos(lo), np.cos(la)*np.sin(lo), np.sin(la)])
    east = np.array([-np.sin(lo), np.cos(lo), 0.0])
    north = np.cross(up, east)
    return east, north, up

def azel(lat, lon, vecs, h_km=0.0):
    """vecs: (N,3) body positions from Moon centre (km, MOON_ME). Returns az(deg from N, clockwise), el(deg)."""
    e, n, u = enu_basis(lat, lon)
    site = u * (R_MOON + h_km)
    d = vecs - site
    d /= np.linalg.norm(d, axis=1)[:, None]
    x, y, z = d @ e, d @ n, d @ u
    az = (np.degrees(np.arctan2(x, y)) + 360) % 360
    el = np.degrees(np.arcsin(np.clip(z, -1, 1)))
    return az, el
