from datetime import date

import pytest

from app.solar_shape import daily_hourly_production, sunrise_sunset_utc

HELSINKI = (60.17, 24.94)
UTSJOKI = (69.9, 27.03)  # far northern Finland, gets true polar day/night


def day_length_hours(day: date, lat: float, lon: float) -> float:
    sunrise, sunset = sunrise_sunset_utc(day, lat, lon)
    return (sunset - sunrise).total_seconds() / 3600


def test_helsinki_summer_solstice_day_length():
    # Real Helsinki summer solstice day length is ~18h50m; this formula is a
    # known simplified approximation (no equation-of-time correction), so
    # the tolerance here is generous rather than to-the-minute.
    length = day_length_hours(date(2024, 6, 21), *HELSINKI)
    assert 17 <= length <= 20


def test_helsinki_winter_solstice_day_length():
    # Real Helsinki winter solstice day length is ~5h49m.
    length = day_length_hours(date(2024, 12, 21), *HELSINKI)
    assert 4 <= length <= 7


def test_utsjoki_december_is_polar_night():
    length = day_length_hours(date(2024, 12, 21), *UTSJOKI)
    assert length == 0


def test_utsjoki_june_is_polar_day():
    length = day_length_hours(date(2024, 6, 21), *UTSJOKI)
    assert length == 24


def test_daily_production_sums_to_the_target_total():
    hourly = daily_hourly_production(date(2024, 6, 21), *HELSINKI, day_total_kwh=24.0)
    assert len(hourly) == 24
    assert sum(hourly.values()) == pytest.approx(24.0)


def test_daily_production_is_zero_outside_daylight():
    hourly = daily_hourly_production(date(2024, 12, 21), *HELSINKI, day_total_kwh=10.0)
    night_hours = [kwh for hour, kwh in hourly.items() if hour.hour in (0, 1, 2, 3)]
    assert all(kwh == 0 for kwh in night_hours)
    assert sum(hourly.values()) == pytest.approx(10.0)


def test_daily_production_is_zero_for_zero_target():
    hourly = daily_hourly_production(date(2024, 6, 21), *HELSINKI, day_total_kwh=0.0)
    assert sum(hourly.values()) == 0


def test_polar_day_spreads_production_across_most_of_the_day():
    # The 24h daylight window is centered on solar noon and may not align
    # exactly to UTC day boundaries, so an hour or two near midnight can
    # end up with zero weight - the total is still fully distributed
    # (see the docstring in solar_shape.py), just concentrated into
    # however many hours do qualify.
    hourly = daily_hourly_production(date(2024, 6, 21), *UTSJOKI, day_total_kwh=48.0)
    hours_with_production = sum(1 for kwh in hourly.values() if kwh > 0)
    assert hours_with_production >= 20
    assert sum(hourly.values()) == pytest.approx(48.0)


def test_polar_night_produces_nothing():
    hourly = daily_hourly_production(date(2024, 12, 21), *UTSJOKI, day_total_kwh=48.0)
    assert sum(hourly.values()) == 0
