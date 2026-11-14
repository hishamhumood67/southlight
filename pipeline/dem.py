"""LOLA polar-stereographic DEM reader (PDS LDEM products).
Code written with AI assistance (Claude)."""
import re, numpy as np

R_M = 1737400.0

class PolarDEM:
    def __init__(self, img, lbl):
        t = open(lbl).read()
        g = lambda k: float(re.search(rf"\b{k}\s*=\s*([-\d.]+)", t).group(1))
        self.n = int(g("LINES"))
        self.scale = g("MAP_SCALE")          # m / pixel
        self.loff = g("LINE_PROJECTION_OFFSET")
        self.soff = g("SAMPLE_PROJECTION_OFFSET")
        self.sf = g("SCALING_FACTOR")
        self.h = np.memmap(img, dtype="<i2", mode="r", shape=(self.n, self.n))
        self.max_r = (self.n / 2 - 2) * self.scale

    @staticmethod
    def to_xy(lat, lon):
        """South polar stereographic (sphere R), metres. PDS convention."""
        la, lo = np.radians(lat), np.radians(lon)
        rho = 2 * R_M * np.tan(np.pi / 4 + la / 2)
        return rho * np.sin(lo), rho * np.cos(lo)

    @staticmethod
    def to_latlon(x, y):
        rho = np.hypot(x, y)
        lat = np.degrees(2 * np.arctan(rho / (2 * R_M)) - np.pi / 2)
        lon = np.degrees(np.arctan2(x, y)) % 360
        return lat, lon

    def sample_xy(self, x, y):
        """Bilinear height (m) at stereographic x,y; NaN outside."""
        s = self.soff + x / self.scale
        l = self.loff - y / self.scale
        ok = (s >= 0) & (s < self.n - 1) & (l >= 0) & (l < self.n - 1)
        s0 = np.clip(np.floor(s).astype(np.int64), 0, self.n - 2)
        l0 = np.clip(np.floor(l).astype(np.int64), 0, self.n - 2)
        fs, fl = s - s0, l - l0
        h = self.h
        v = (h[l0, s0] * (1 - fs) * (1 - fl) + h[l0, s0 + 1] * fs * (1 - fl)
             + h[l0 + 1, s0] * (1 - fs) * fl + h[l0 + 1, s0 + 1] * fs * fl) * self.sf
        return np.where(ok, v, np.nan)

    def height(self, lat, lon):
        return self.sample_xy(*self.to_xy(np.asarray(lat, float), np.asarray(lon, float)))
