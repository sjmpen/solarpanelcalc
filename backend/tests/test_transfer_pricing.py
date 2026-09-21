from datetime import UTC, datetime

import pytest

from app.transfer_pricing import TransferPricingInput, transfer_price_cents_per_kwh


def test_flat_rate_is_constant():
    transfer = TransferPricingInput(type="flat", price_cents_per_kwh=3.5)
    # Helsinki is UTC+2 in December (EET)
    price = transfer_price_cents_per_kwh(datetime(2024, 12, 15, 3, tzinfo=UTC), transfer)
    assert price == 3.5


@pytest.mark.parametrize(
    ("utc_hour", "expected"),
    [
        (4, "night"),  # 06:59 EET
        (5, "day"),  # 07:00 EET (EET = UTC+2)
        (19, "day"),  # 21:59 EET
        (20, "night"),  # 22:00 EET
    ],
)
def test_day_night_boundaries(utc_hour: int, expected: str):
    transfer = TransferPricingInput(
        type="day-night", day_price_cents_per_kwh=5.0, night_price_cents_per_kwh=2.0
    )
    # December 15, well clear of any DST transition, EET = UTC+2 throughout.
    price = transfer_price_cents_per_kwh(datetime(2024, 12, 15, utc_hour, 59, tzinfo=UTC), transfer)
    assert price == (5.0 if expected == "day" else 2.0)


def test_seasonal_rest_of_year():
    transfer = TransferPricingInput(
        type="seasonal",
        winter_day_price_cents_per_kwh=6.0,
        winter_night_price_cents_per_kwh=3.0,
        other_price_cents_per_kwh=1.5,
    )
    # October, well outside winter (Nov-Mar) on either side of any DST edge.
    price = transfer_price_cents_per_kwh(datetime(2024, 10, 15, 12, tzinfo=UTC), transfer)
    assert price == 1.5


def test_seasonal_winter_weekday_daytime_is_winter_day():
    transfer = TransferPricingInput(
        type="seasonal",
        winter_day_price_cents_per_kwh=6.0,
        winter_night_price_cents_per_kwh=3.0,
        other_price_cents_per_kwh=1.5,
    )
    # Tuesday, December 10 2024, 10:00 EET (08:00 UTC) - clearly winter day.
    price = transfer_price_cents_per_kwh(datetime(2024, 12, 10, 8, tzinfo=UTC), transfer)
    assert price == 6.0


def test_seasonal_winter_night_hours_are_winter_night():
    transfer = TransferPricingInput(
        type="seasonal",
        winter_day_price_cents_per_kwh=6.0,
        winter_night_price_cents_per_kwh=3.0,
        other_price_cents_per_kwh=1.5,
    )
    # Tuesday, December 10 2024, 23:00 EET (21:00 UTC) - winter, but after 21:00.
    price = transfer_price_cents_per_kwh(datetime(2024, 12, 10, 21, tzinfo=UTC), transfer)
    assert price == 3.0


def test_seasonal_winter_sunday_is_always_winter_night():
    transfer = TransferPricingInput(
        type="seasonal",
        winter_day_price_cents_per_kwh=6.0,
        winter_night_price_cents_per_kwh=3.0,
        other_price_cents_per_kwh=1.5,
    )
    # Sunday, December 15 2024, 12:00 EET (10:00 UTC) - would be "day" hours,
    # but Sundays don't qualify as a winter day per the assumed boundaries.
    price = transfer_price_cents_per_kwh(datetime(2024, 12, 15, 10, tzinfo=UTC), transfer)
    assert price == 3.0


def test_missing_price_field_defaults_to_zero():
    transfer = TransferPricingInput(type="flat")
    price = transfer_price_cents_per_kwh(datetime(2024, 6, 1, tzinfo=UTC), transfer)
    assert price == 0.0
