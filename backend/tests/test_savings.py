from datetime import UTC, datetime, timedelta
from pathlib import Path

import pytest

from app.csv_parser import parse_fingrid_csv
from app.models import Reading
from app.savings import EnergyPricingInput, MonthlyProductionInput, calculate_savings

FIXTURE = Path(__file__).parent / "fixtures" / "sample_consumption.csv"
HELSINKI = (60.17, 24.94)


def hourly_readings(day: datetime, hours: int, kwh_per_hour: float) -> list[Reading]:
    return [
        Reading(timestamp=day + timedelta(hours=h), kwh=kwh_per_hour, quality_ok=True)
        for h in range(hours)
    ]


def test_zero_production_means_zero_savings():
    # The real 2-day fixture, but with no solar at all - with-solar cost
    # must exactly equal baseline cost, so savings is exactly 0. This is
    # the one fully hand-checkable case: baseline cost = total_kwh * price
    # (EUR/kWh) + monthly fee, no astronomy or self-consumption logic in play.
    readings = parse_fingrid_csv(FIXTURE.read_bytes())
    energy_pricing = EnergyPricingInput(type="fixed", price_cents_per_kwh=10.0, monthly_fee_eur=5.0)

    result = calculate_savings(
        readings=readings,
        lat=HELSINKI[0],
        lon=HELSINKI[1],
        monthly_production=[MonthlyProductionInput(month=1, kwh=0.0)],
        energy_pricing=energy_pricing,
        transfer_pricing=None,
        spot_prices=None,
    )

    assert result.total_self_consumed_kwh == 0
    assert result.total_exported_kwh == 0
    assert result.savings_eur == 0
    expected_energy_cost = result.total_consumption_kwh * 0.10
    assert result.baseline_cost_eur == pytest.approx(expected_energy_cost + 5.0, abs=0.01)
    assert result.with_solar_cost_eur == pytest.approx(result.baseline_cost_eur, abs=0.001)


def test_huge_production_never_self_consumes_more_than_actual_consumption():
    readings = parse_fingrid_csv(FIXTURE.read_bytes())
    energy_pricing = EnergyPricingInput(type="fixed", price_cents_per_kwh=10.0)

    result = calculate_savings(
        readings=readings,
        lat=HELSINKI[0],
        lon=HELSINKI[1],
        monthly_production=[MonthlyProductionInput(month=1, kwh=1_000_000.0)],
        energy_pricing=energy_pricing,
        transfer_pricing=None,
        spot_prices=None,
    )

    assert result.total_self_consumed_kwh <= result.total_consumption_kwh
    # Even with effectively unlimited production, nighttime consumption still
    # has to be imported from the grid (production is 0 at night) - so cost
    # drops a lot but isn't zero, and self-consumption never exceeds 100%.
    assert result.with_solar_cost_eur < result.baseline_cost_eur
    assert result.savings_eur > 0
    assert result.self_consumption_rate < 1


def test_savings_never_negative_with_a_flat_positive_price():
    readings = parse_fingrid_csv(FIXTURE.read_bytes())
    energy_pricing = EnergyPricingInput(type="fixed", price_cents_per_kwh=8.0)

    result = calculate_savings(
        readings=readings,
        lat=HELSINKI[0],
        lon=HELSINKI[1],
        monthly_production=[MonthlyProductionInput(month=1, kwh=100.0)],
        energy_pricing=energy_pricing,
        transfer_pricing=None,
        spot_prices=None,
    )

    assert result.with_solar_cost_eur <= result.baseline_cost_eur
    assert result.savings_eur >= 0


def test_monthly_breakdown_sums_to_the_total():
    readings = parse_fingrid_csv(FIXTURE.read_bytes())
    energy_pricing = EnergyPricingInput(type="fixed", price_cents_per_kwh=9.5, monthly_fee_eur=4.0)

    result = calculate_savings(
        readings=readings,
        lat=HELSINKI[0],
        lon=HELSINKI[1],
        monthly_production=[MonthlyProductionInput(month=1, kwh=150.0)],
        energy_pricing=energy_pricing,
        transfer_pricing=None,
        spot_prices=None,
    )

    assert sum(m.savings_eur for m in result.monthly) == pytest.approx(result.savings_eur, abs=0.05)
    assert sum(m.baseline_cost_eur for m in result.monthly) == pytest.approx(
        result.baseline_cost_eur, abs=0.05
    )


def test_no_consumption_gives_full_export_and_zero_cost():
    day = datetime(2024, 6, 1, tzinfo=UTC)
    readings = hourly_readings(day, hours=24, kwh_per_hour=0.0)
    energy_pricing = EnergyPricingInput(type="fixed", price_cents_per_kwh=10.0)

    result = calculate_savings(
        readings=readings,
        lat=HELSINKI[0],
        lon=HELSINKI[1],
        monthly_production=[MonthlyProductionInput(month=6, kwh=300.0)],
        energy_pricing=energy_pricing,
        transfer_pricing=None,
        spot_prices=None,
    )

    assert result.total_self_consumed_kwh == 0
    assert result.total_exported_kwh > 0
    assert result.self_consumption_rate == 0
    assert result.baseline_cost_eur == 0
    assert result.with_solar_cost_eur == 0
    assert result.savings_eur == 0


def test_transfer_pricing_increases_both_baseline_and_with_solar_cost():
    from app.transfer_pricing import TransferPricingInput

    readings = parse_fingrid_csv(FIXTURE.read_bytes())
    energy_pricing = EnergyPricingInput(type="fixed", price_cents_per_kwh=8.0)
    no_transfer = calculate_savings(
        readings=readings,
        lat=HELSINKI[0],
        lon=HELSINKI[1],
        monthly_production=[MonthlyProductionInput(month=1, kwh=100.0)],
        energy_pricing=energy_pricing,
        transfer_pricing=None,
        spot_prices=None,
    )
    with_transfer = calculate_savings(
        readings=readings,
        lat=HELSINKI[0],
        lon=HELSINKI[1],
        monthly_production=[MonthlyProductionInput(month=1, kwh=100.0)],
        energy_pricing=energy_pricing,
        transfer_pricing=TransferPricingInput(type="flat", price_cents_per_kwh=3.0),
        spot_prices=None,
    )

    assert with_transfer.baseline_cost_eur > no_transfer.baseline_cost_eur
    assert with_transfer.with_solar_cost_eur > no_transfer.with_solar_cost_eur


def test_raises_on_empty_readings():
    with pytest.raises(ValueError, match="No consumption readings"):
        calculate_savings(
            readings=[],
            lat=HELSINKI[0],
            lon=HELSINKI[1],
            monthly_production=[],
            energy_pricing=EnergyPricingInput(type="fixed", price_cents_per_kwh=10.0),
            transfer_pricing=None,
            spot_prices=None,
        )
