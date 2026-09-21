import math
from datetime import UTC, date, datetime, timedelta


def _clamp(value: float, lo: float, hi: float) -> float:
    return max(lo, min(hi, value))


def sunrise_sunset_utc(day: date, lat: float, lon: float) -> tuple[datetime, datetime]:
    """Simplified sunrise/sunset ("sunrise equation") for `day` at (lat, lon), in UTC.

    Standard low-precision approximation: solar declination from day-of-year,
    hour angle from arccos(-tan(lat)*tan(decl)), solar noon from longitude.
    No equation-of-time correction (off by up to ~15 minutes at worst) - not
    worth the extra complexity given the daily production curve this feeds
    into is already a simplified sine-shape approximation, not real
    irradiance data.

    The arccos argument is clamped to [-1, 1] rather than special-cased for
    polar day/night: clamping to -1 naturally yields a 24h "day" (polar day,
    sun never sets), clamping to +1 naturally yields a 0h "day" (polar
    night, sun never rises) - both fall out of the same formula.
    """
    day_of_year = day.timetuple().tm_yday
    declination = math.radians(-23.44 * math.cos(math.radians(360 / 365 * (day_of_year + 10))))
    lat_rad = math.radians(lat)

    hour_angle_arg = _clamp(-math.tan(lat_rad) * math.tan(declination), -1.0, 1.0)
    half_day_hours = math.degrees(math.acos(hour_angle_arg)) / 15.0

    solar_noon_utc_hours = 12.0 - lon / 15.0

    day_start = datetime.combine(day, datetime.min.time(), tzinfo=UTC)
    sunrise = day_start + timedelta(hours=solar_noon_utc_hours - half_day_hours)
    sunset = day_start + timedelta(hours=solar_noon_utc_hours + half_day_hours)
    return sunrise, sunset


def daily_hourly_production(day: date, lat: float, lon: float, day_total_kwh: float) -> dict[datetime, float]:
    """Splits `day_total_kwh` across `day`'s 24 UTC hours as a sine-shaped daylight curve.

    Production is 0 outside [sunrise, sunset]; within it, shaped as
    sin(pi * fraction_of_daylight_elapsed), sampled at each hour's midpoint.
    Normalized so the 24 returned values always sum back to day_total_kwh
    exactly (when day_total_kwh > 0 and there's at least some daylight).

    Note: for locations/dates with polar day, the 24h daylight window is
    centered on solar noon and may not align exactly with UTC calendar-day
    boundaries, so an hour or two right at midnight can end up with zero
    weight even though the sun never actually sets - the day's total energy
    is still fully and correctly distributed across whichever hours do
    qualify. Not worth extra complexity to fix for what's a tiny sliver of
    Finland's population and a couple of weeks a year.
    """
    day_start = datetime.combine(day, datetime.min.time(), tzinfo=UTC)
    hour_starts = [day_start + timedelta(hours=h) for h in range(24)]

    sunrise, sunset = sunrise_sunset_utc(day, lat, lon)
    day_length_hours = (sunset - sunrise).total_seconds() / 3600

    if day_total_kwh <= 0 or day_length_hours <= 0:
        return dict.fromkeys(hour_starts, 0.0)

    weights: dict[datetime, float] = {}
    for hour_start in hour_starts:
        midpoint = hour_start + timedelta(minutes=30)
        if sunrise <= midpoint <= sunset:
            fraction = (midpoint - sunrise).total_seconds() / 3600 / day_length_hours
            weights[hour_start] = math.sin(math.pi * fraction)
        else:
            weights[hour_start] = 0.0

    total_weight = sum(weights.values())
    if total_weight <= 0:
        return dict.fromkeys(hour_starts, 0.0)

    return {hour_start: day_total_kwh * weight / total_weight for hour_start, weight in weights.items()}
