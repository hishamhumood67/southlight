# Validation 1: SouthLight ephemeris vs JPL Horizons (DE441)
Queried 2026-11-14 via https://ssd.jpl.nasa.gov/api/horizons.api (observer: coord@301, geodetic, alt 0).

| Time (UTC) | Target @ Site | Horizons Az, El (deg) | SouthLight Az, El (deg) |
|---|---|---|---|
| 2026-12-01 00:00 | Sun @ Apollo 11 (23.473E, 0.674N) | 268.6487, -13.4222 | 268.6487, -13.4222 |
| 2026-12-02 00:00 | Sun @ Apollo 11 | 268.6976, -25.5803 | 268.6976, -25.5803 |
| 2026-12-03 00:00 | Sun @ Apollo 11 | 268.6734, -37.7452 | 268.6734, -37.7452 |
| 2026-12-01 00:00 | Earth @ near-pole (137W, 89.45S) | 143.6606, -2.0532 | 143.6606, -2.0532 |
| 2026-12-02 00:00 | Earth @ near-pole | 143.8801, -3.5193 | 143.8801, -3.5193 |
| 2026-12-03 00:00 | Earth @ near-pole | 143.7987, -4.8006 | 143.7987, -4.8006 |

Agreement: better than 0.0001 deg (geometric horizon, before terrain).
