from datetime import UTC, datetime, timedelta
from pathlib import Path

import pytest

from app.csv_parser import parse_fingrid_csv
from app.models import Reading
from app.pricing import SpotPriceEntry
from app.savings import (
    BATTERY_ROUND_TRIP_EFFICIENCY,
    BatteryInput,
    EnergyPricingInput,
    ExportPricingInput,
    MonthlyProductionInput,
    calculate_savings,
)
from app.transfer_pricing import TransferPricingInput

FIXTURE = Path(__file__).parent / "fixtures" / "sample_consumption.csv"
HELSINKI = (60.17, 24.94)
NO_TRANSFER = TransferPricingInput(type="flat", price_cents_per_kwh=0.0)


def hourly_readings(day: datetime, hours: int, kwh_per_hour: float) -> list[Reading]:
    return [
        Reading(timestamp=day + timedelta(hours=h), kwh=kwh_per_hour, quality_ok=True)
        for h in range(hours)
    ]


def test_zero_production_means_zero_savings():
    # The real 2-day fixture, but with no solar at all - with-solar cost
    # must exactly equal baseline cost, so savings is exactly 0. This is
    # the one fully hand-checkable case: baseline cost = total_kwh * price
    # (EUR/kWh), no astronomy or self-consumption logic in play.
    readings = parse_fingrid_csv(FIXTURE.read_bytes())
    energy_pricing = EnergyPricingInput(type="fixed", price_cents_per_kwh=10.0)

    result = calculate_savings(
        readings=readings,
        lat=HELSINKI[0],
        lon=HELSINKI[1],
        monthly_production=[MonthlyProductionInput(month=1, kwh=0.0)],
        energy_pricing=energy_pricing,
        transfer_pricing=NO_TRANSFER,
        spot_prices=None,
    )

    assert result.total_self_consumed_kwh == 0
    assert result.total_exported_kwh == 0
    assert result.savings_eur == 0
    expected_energy_cost = result.total_consumption_kwh * 0.10
    assert result.baseline_cost_eur == pytest.approx(expected_energy_cost, abs=0.01)
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
        transfer_pricing=NO_TRANSFER,
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
        transfer_pricing=NO_TRANSFER,
        spot_prices=None,
    )

    assert result.with_solar_cost_eur <= result.baseline_cost_eur
    assert result.savings_eur >= 0


def test_monthly_breakdown_sums_to_the_total():
    readings = parse_fingrid_csv(FIXTURE.read_bytes())
    energy_pricing = EnergyPricingInput(type="fixed", price_cents_per_kwh=9.5)

    result = calculate_savings(
        readings=readings,
        lat=HELSINKI[0],
        lon=HELSINKI[1],
        monthly_production=[MonthlyProductionInput(month=1, kwh=150.0)],
        energy_pricing=energy_pricing,
        transfer_pricing=NO_TRANSFER,
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
        transfer_pricing=NO_TRANSFER,
        spot_prices=None,
    )

    assert result.total_self_consumed_kwh == 0
    assert result.total_exported_kwh > 0
    assert result.self_consumption_rate == 0
    assert result.baseline_cost_eur == 0
    assert result.with_solar_cost_eur == 0
    assert result.savings_eur == 0


def test_transfer_pricing_increases_both_baseline_and_with_solar_cost():
    readings = parse_fingrid_csv(FIXTURE.read_bytes())
    energy_pricing = EnergyPricingInput(type="fixed", price_cents_per_kwh=8.0)
    low_transfer = calculate_savings(
        readings=readings,
        lat=HELSINKI[0],
        lon=HELSINKI[1],
        monthly_production=[MonthlyProductionInput(month=1, kwh=100.0)],
        energy_pricing=energy_pricing,
        transfer_pricing=TransferPricingInput(type="flat", price_cents_per_kwh=1.0),
        spot_prices=None,
    )
    high_transfer = calculate_savings(
        readings=readings,
        lat=HELSINKI[0],
        lon=HELSINKI[1],
        monthly_production=[MonthlyProductionInput(month=1, kwh=100.0)],
        energy_pricing=energy_pricing,
        transfer_pricing=TransferPricingInput(type="flat", price_cents_per_kwh=5.0),
        spot_prices=None,
    )

    assert high_transfer.baseline_cost_eur > low_transfer.baseline_cost_eur
    assert high_transfer.with_solar_cost_eur > low_transfer.with_solar_cost_eur


def test_export_revenue_is_zero_without_export_pricing():
    day = datetime(2024, 6, 1, tzinfo=UTC)
    readings = hourly_readings(day, hours=24, kwh_per_hour=0.0)
    energy_pricing = EnergyPricingInput(type="fixed", price_cents_per_kwh=10.0)

    result = calculate_savings(
        readings=readings,
        lat=HELSINKI[0],
        lon=HELSINKI[1],
        monthly_production=[MonthlyProductionInput(month=6, kwh=300.0)],
        energy_pricing=energy_pricing,
        transfer_pricing=NO_TRANSFER,
        spot_prices=None,
    )

    assert result.total_export_revenue_eur == 0
    assert all(m.export_revenue_eur == 0 for m in result.monthly)


def test_fixed_export_price_minus_commission_prices_exported_energy():
    day = datetime(2024, 6, 1, tzinfo=UTC)
    readings = hourly_readings(day, hours=24, kwh_per_hour=0.0)
    energy_pricing = EnergyPricingInput(type="fixed", price_cents_per_kwh=10.0)
    production = [MonthlyProductionInput(month=6, kwh=300.0)]

    baseline = calculate_savings(
        readings=readings,
        lat=HELSINKI[0],
        lon=HELSINKI[1],
        monthly_production=production,
        energy_pricing=energy_pricing,
        transfer_pricing=NO_TRANSFER,
        spot_prices=None,
    )
    with_export = calculate_savings(
        readings=readings,
        lat=HELSINKI[0],
        lon=HELSINKI[1],
        monthly_production=production,
        energy_pricing=energy_pricing,
        transfer_pricing=NO_TRANSFER,
        spot_prices=None,
        export_pricing=ExportPricingInput(type="fixed", price_cents_per_kwh=5.0, commission_cents_per_kwh=1.0),
    )

    assert with_export.total_exported_kwh == baseline.total_exported_kwh
    assert with_export.savings_eur == baseline.savings_eur  # export pricing never affects self-consumption savings
    expected_revenue = with_export.total_exported_kwh * (5.0 - 1.0) / 100
    assert with_export.total_export_revenue_eur == pytest.approx(expected_revenue, abs=0.01)
    assert sum(m.export_revenue_eur for m in with_export.monthly) == pytest.approx(
        with_export.total_export_revenue_eur, abs=0.01
    )


def test_export_commission_larger_than_price_floors_revenue_at_zero():
    day = datetime(2024, 6, 1, tzinfo=UTC)
    readings = hourly_readings(day, hours=24, kwh_per_hour=0.0)
    energy_pricing = EnergyPricingInput(type="fixed", price_cents_per_kwh=10.0)

    result = calculate_savings(
        readings=readings,
        lat=HELSINKI[0],
        lon=HELSINKI[1],
        monthly_production=[MonthlyProductionInput(month=6, kwh=300.0)],
        energy_pricing=energy_pricing,
        transfer_pricing=NO_TRANSFER,
        spot_prices=None,
        export_pricing=ExportPricingInput(type="fixed", price_cents_per_kwh=2.0, commission_cents_per_kwh=5.0),
    )

    assert result.total_exported_kwh > 0
    assert result.total_export_revenue_eur == 0


def test_spot_export_price_minus_commission_prices_exported_energy():
    day = datetime(2024, 6, 1, tzinfo=UTC)
    readings = hourly_readings(day, hours=24, kwh_per_hour=0.0)
    spot_prices = [SpotPriceEntry(timestamp=day + timedelta(hours=h), price_cents_per_kwh=8.0) for h in range(24)]
    # Fixed consumption contract, but export is spot-priced - spot_prices must
    # still be usable for the export side even though energy_pricing is fixed.
    energy_pricing = EnergyPricingInput(type="fixed", price_cents_per_kwh=10.0)

    result = calculate_savings(
        readings=readings,
        lat=HELSINKI[0],
        lon=HELSINKI[1],
        monthly_production=[MonthlyProductionInput(month=6, kwh=300.0)],
        energy_pricing=energy_pricing,
        transfer_pricing=NO_TRANSFER,
        spot_prices=spot_prices,
        export_pricing=ExportPricingInput(type="spot", commission_cents_per_kwh=2.0),
    )

    expected_revenue = result.total_exported_kwh * (8.0 - 2.0) / 100
    assert result.total_export_revenue_eur == pytest.approx(expected_revenue, abs=0.01)


def test_annual_benefit_scales_the_period_to_a_year_and_payback_is_none_without_a_cost():
    readings = parse_fingrid_csv(FIXTURE.read_bytes())
    energy_pricing = EnergyPricingInput(type="fixed", price_cents_per_kwh=8.0)

    result = calculate_savings(
        readings=readings,
        lat=HELSINKI[0],
        lon=HELSINKI[1],
        monthly_production=[MonthlyProductionInput(month=1, kwh=100.0)],
        energy_pricing=energy_pricing,
        transfer_pricing=NO_TRANSFER,
        spot_prices=None,
    )

    # The fixture's readings span 3 Finnish calendar days (2025-01-01 through
    # 2025-01-03 - the last few UTC hours roll into the next Finnish day,
    # same boundary math as test_csv_parser.py's date-range-filter tests).
    # abs tolerance is wide because the ~122x annualization multiplier
    # (365.25 / 3 days) amplifies the rounding already applied to savings_eur.
    total_benefit = result.savings_eur + result.total_export_revenue_eur
    expected_annual = total_benefit / 3 * 365.25
    assert result.annual_benefit_eur == pytest.approx(expected_annual, abs=1.0)
    assert result.payback_years is None


def test_payback_years_computed_from_system_cost():
    readings = parse_fingrid_csv(FIXTURE.read_bytes())
    energy_pricing = EnergyPricingInput(type="fixed", price_cents_per_kwh=8.0)

    result = calculate_savings(
        readings=readings,
        lat=HELSINKI[0],
        lon=HELSINKI[1],
        monthly_production=[MonthlyProductionInput(month=1, kwh=100.0)],
        energy_pricing=energy_pricing,
        transfer_pricing=NO_TRANSFER,
        spot_prices=None,
        system_cost_eur=2000.0,
    )

    assert result.annual_benefit_eur > 0
    assert result.payback_years == pytest.approx(2000.0 / result.annual_benefit_eur, abs=0.1)


def test_payback_years_is_none_when_annual_benefit_is_zero_even_with_a_cost_given():
    # Zero solar production - no self-consumption, no export - means zero
    # benefit, so a payback period is undefined (never "None" years) rather
    # than a division-by-zero or nonsensical result.
    readings = parse_fingrid_csv(FIXTURE.read_bytes())
    energy_pricing = EnergyPricingInput(type="fixed", price_cents_per_kwh=10.0)

    result = calculate_savings(
        readings=readings,
        lat=HELSINKI[0],
        lon=HELSINKI[1],
        monthly_production=[MonthlyProductionInput(month=1, kwh=0.0)],
        energy_pricing=energy_pricing,
        transfer_pricing=NO_TRANSFER,
        spot_prices=None,
        system_cost_eur=2000.0,
    )

    assert result.annual_benefit_eur == 0
    assert result.payback_years is None


def test_battery_increases_self_consumption_and_reduces_export_and_cost():
    readings = parse_fingrid_csv(FIXTURE.read_bytes())
    energy_pricing = EnergyPricingInput(type="fixed", price_cents_per_kwh=10.0)
    production = [MonthlyProductionInput(month=1, kwh=150.0)]

    no_battery = calculate_savings(
        readings=readings,
        lat=HELSINKI[0],
        lon=HELSINKI[1],
        monthly_production=production,
        energy_pricing=energy_pricing,
        transfer_pricing=NO_TRANSFER,
        spot_prices=None,
    )
    with_battery = calculate_savings(
        readings=readings,
        lat=HELSINKI[0],
        lon=HELSINKI[1],
        monthly_production=production,
        energy_pricing=energy_pricing,
        transfer_pricing=NO_TRANSFER,
        spot_prices=None,
        battery=BatteryInput(capacity_kwh=5.0),
    )

    assert with_battery.total_battery_delivered_kwh > 0
    assert with_battery.total_self_consumed_kwh > no_battery.total_self_consumed_kwh
    assert with_battery.total_exported_kwh < no_battery.total_exported_kwh
    assert with_battery.with_solar_cost_eur <= no_battery.with_solar_cost_eur
    assert sum(m.battery_delivered_kwh for m in with_battery.monthly) == pytest.approx(
        with_battery.total_battery_delivered_kwh, abs=0.01
    )


def test_battery_delivered_energy_is_bounded_by_capacity_and_efficiency():
    # Effectively unlimited production means the battery fills to capacity
    # every day and empties every night - so total delivered energy across
    # the fixture's period can never exceed capacity * efficiency * one
    # cycle per day, however many cycles the period actually contains.
    readings = parse_fingrid_csv(FIXTURE.read_bytes())
    energy_pricing = EnergyPricingInput(type="fixed", price_cents_per_kwh=10.0)
    capacity_kwh = 2.0

    result = calculate_savings(
        readings=readings,
        lat=HELSINKI[0],
        lon=HELSINKI[1],
        monthly_production=[MonthlyProductionInput(month=1, kwh=1_000_000.0)],
        energy_pricing=energy_pricing,
        transfer_pricing=NO_TRANSFER,
        spot_prices=None,
        battery=BatteryInput(capacity_kwh=capacity_kwh),
    )

    period_days = 3  # see test_csv_parser.py for this fixture's Finnish-day span
    assert 0 < result.total_battery_delivered_kwh <= capacity_kwh * BATTERY_ROUND_TRIP_EFFICIENCY * period_days


def test_battery_with_no_price_still_delivers_energy_but_no_payback():
    readings = parse_fingrid_csv(FIXTURE.read_bytes())
    energy_pricing = EnergyPricingInput(type="fixed", price_cents_per_kwh=10.0)

    result = calculate_savings(
        readings=readings,
        lat=HELSINKI[0],
        lon=HELSINKI[1],
        monthly_production=[MonthlyProductionInput(month=1, kwh=150.0)],
        energy_pricing=energy_pricing,
        transfer_pricing=NO_TRANSFER,
        spot_prices=None,
        battery=BatteryInput(capacity_kwh=5.0),
    )

    assert result.total_battery_delivered_kwh > 0
    assert result.payback_years is None


def test_payback_combines_system_cost_and_battery_price():
    readings = parse_fingrid_csv(FIXTURE.read_bytes())
    energy_pricing = EnergyPricingInput(type="fixed", price_cents_per_kwh=8.0)

    result = calculate_savings(
        readings=readings,
        lat=HELSINKI[0],
        lon=HELSINKI[1],
        monthly_production=[MonthlyProductionInput(month=1, kwh=100.0)],
        energy_pricing=energy_pricing,
        transfer_pricing=NO_TRANSFER,
        spot_prices=None,
        system_cost_eur=1000.0,
        battery=BatteryInput(capacity_kwh=5.0, price_eur=2000.0),
    )

    assert result.annual_benefit_eur > 0
    assert result.payback_years == pytest.approx(3000.0 / result.annual_benefit_eur, abs=0.1)


def test_payback_from_battery_price_alone():
    readings = parse_fingrid_csv(FIXTURE.read_bytes())
    energy_pricing = EnergyPricingInput(type="fixed", price_cents_per_kwh=8.0)

    result = calculate_savings(
        readings=readings,
        lat=HELSINKI[0],
        lon=HELSINKI[1],
        monthly_production=[MonthlyProductionInput(month=1, kwh=100.0)],
        energy_pricing=energy_pricing,
        transfer_pricing=NO_TRANSFER,
        spot_prices=None,
        battery=BatteryInput(capacity_kwh=5.0, price_eur=500.0),
    )

    assert result.annual_benefit_eur > 0
    assert result.payback_years == pytest.approx(500.0 / result.annual_benefit_eur, abs=0.1)


def test_raises_on_empty_readings():
    with pytest.raises(ValueError, match="No consumption readings"):
        calculate_savings(
            readings=[],
            lat=HELSINKI[0],
            lon=HELSINKI[1],
            monthly_production=[],
            energy_pricing=EnergyPricingInput(type="fixed", price_cents_per_kwh=10.0),
            transfer_pricing=NO_TRANSFER,
            spot_prices=None,
        )
