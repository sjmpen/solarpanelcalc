import calendar
from collections import defaultdict
from datetime import datetime, timedelta
from typing import Literal

from pydantic import BaseModel

from app.models import Reading
from app.pricing import HELSINKI_TZ, SpotPriceEntry
from app.solar_shape import daily_hourly_production
from app.transfer_pricing import TransferPricingInput, transfer_price_cents_per_kwh


class EnergyPricingInput(BaseModel):
    type: Literal["fixed", "spot"]
    price_cents_per_kwh: float | None = None  # fixed
    margin_cents_per_kwh: float | None = None  # spot, on top of Elering's price


class ExportPricingInput(BaseModel):
    type: Literal["fixed", "spot"]
    price_cents_per_kwh: float | None = None  # fixed sell-back price
    commission_cents_per_kwh: float = 0.0  # deducted from the sell price either way


# Fixed, not user-configurable - a reasonable round-trip figure for a home
# Li-ion battery, documented as a simplification rather than exposed as a knob.
BATTERY_ROUND_TRIP_EFFICIENCY = 0.9


class BatteryInput(BaseModel):
    capacity_kwh: float
    price_eur: float | None = None


class MonthlyProductionInput(BaseModel):
    month: int
    kwh: float


class MonthlySavings(BaseModel):
    year: int
    month: int
    consumption_kwh: float
    self_consumed_kwh: float
    exported_kwh: float
    baseline_cost_eur: float
    with_solar_cost_eur: float
    savings_eur: float
    export_revenue_eur: float
    battery_delivered_kwh: float


class SavingsResult(BaseModel):
    total_consumption_kwh: float
    total_self_consumed_kwh: float
    total_exported_kwh: float
    self_consumption_rate: float  # self-consumed / total modeled production, 0-1
    baseline_cost_eur: float
    with_solar_cost_eur: float
    savings_eur: float
    total_export_revenue_eur: float
    total_battery_delivered_kwh: float
    annual_benefit_eur: float
    payback_years: float | None
    monthly: list[MonthlySavings]


def _hour_start(timestamp: datetime) -> datetime:
    return timestamp.replace(minute=0, second=0, microsecond=0)


def _export_price_cents_per_kwh(
    hour: datetime, export_pricing: ExportPricingInput, spot_price_by_hour: dict[datetime, float]
) -> float | None:
    """The sell-back price for exported energy in `hour`, net of commission.

    Floored at 0 - a commission larger than the sell price shouldn't produce
    negative revenue, consistent with this app's conservative-estimate
    philosophy elsewhere. Returns None (excluded, not estimated) when a spot
    sell price has no matching data for this hour.
    """
    if export_pricing.type == "spot":
        spot_price = spot_price_by_hour.get(hour)
        if spot_price is None:
            return None
        sell_price = spot_price
    else:
        sell_price = export_pricing.price_cents_per_kwh or 0.0

    return max(sell_price - export_pricing.commission_cents_per_kwh, 0.0)


def calculate_savings(
    readings: list[Reading],
    lat: float,
    lon: float,
    monthly_production: list[MonthlyProductionInput],
    energy_pricing: EnergyPricingInput,
    transfer_pricing: TransferPricingInput,
    spot_prices: list[SpotPriceEntry] | None,
    export_pricing: ExportPricingInput | None = None,
    system_cost_eur: float | None = None,
    battery: BatteryInput | None = None,
) -> SavingsResult:
    """Combines consumption, a synthesized hourly production curve, and pricing
    into a savings estimate. See backend/app/solar_shape.py and the M5 plan
    notes in CLAUDE.md for the deliberate simplifications this involves.
    """
    consumption_by_hour: dict[datetime, float] = defaultdict(float)
    for reading in readings:
        consumption_by_hour[_hour_start(reading.timestamp)] += reading.kwh

    if not consumption_by_hour:
        raise ValueError("No consumption readings to calculate savings from")

    production_by_month = {p.month: p.kwh for p in monthly_production}

    start_local_day = min(consumption_by_hour).astimezone(HELSINKI_TZ).date()
    end_local_day = max(consumption_by_hour).astimezone(HELSINKI_TZ).date()

    production_by_hour: dict[datetime, float] = {}
    day = start_local_day
    while day <= end_local_day:
        days_in_month = calendar.monthrange(day.year, day.month)[1]
        day_total_kwh = production_by_month.get(day.month, 0.0) / days_in_month
        production_by_hour.update(daily_hourly_production(day, lat, lon, day_total_kwh))
        day += timedelta(days=1)

    spot_price_by_hour: dict[datetime, float] = {}
    if spot_prices is not None:
        for entry in spot_prices:
            spot_price_by_hour[_hour_start(entry.timestamp)] = entry.price_cents_per_kwh

    margin = energy_pricing.margin_cents_per_kwh or 0.0
    fixed_price = energy_pricing.price_cents_per_kwh or 0.0

    total_consumption = 0.0
    total_production = 0.0
    total_self_consumed = 0.0
    total_exported = 0.0
    baseline_cost_eur = 0.0
    with_solar_cost_eur = 0.0
    total_export_revenue_eur = 0.0
    total_battery_delivered_kwh = 0.0
    battery_charge_kwh = 0.0

    monthly_acc: dict[tuple[int, int], dict[str, float]] = defaultdict(
        lambda: {
            "consumption_kwh": 0.0,
            "self_consumed_kwh": 0.0,
            "exported_kwh": 0.0,
            "baseline_cost_eur": 0.0,
            "with_solar_cost_eur": 0.0,
            "export_revenue_eur": 0.0,
            "battery_delivered_kwh": 0.0,
        }
    )

    # Chronological order matters here: the battery below carries state
    # (battery_charge_kwh) across hours, so this can no longer rely on
    # consumption_by_hour's dict/insertion order happening to be sorted.
    for hour in sorted(consumption_by_hour):
        consumption = consumption_by_hour[hour]
        if energy_pricing.type == "spot":
            spot_price = spot_price_by_hour.get(hour)
            if spot_price is None:
                continue  # no price data for this hour - excluded, not estimated
            energy_price = spot_price + margin
        else:
            energy_price = fixed_price

        production = production_by_hour.get(hour, 0.0)
        self_consumed = min(consumption, production)
        surplus = max(production - consumption, 0.0)
        deficit = consumption - self_consumed

        # Self-consumption-maximizing dispatch only: the battery charges
        # from solar surplus and discharges to cover demand otherwise met
        # by the grid - never charges from the grid, never discharges to
        # export. (Price-arbitrage dispatch was discussed and deliberately
        # not built - see CLAUDE.md.)
        battery_delivered = 0.0
        if battery is not None:
            if surplus > 0:
                charge = min(surplus, battery.capacity_kwh - battery_charge_kwh)
                battery_charge_kwh += charge
                surplus -= charge
            elif deficit > 0:
                deliverable = battery_charge_kwh * BATTERY_ROUND_TRIP_EFFICIENCY
                battery_delivered = min(deficit, deliverable)
                battery_charge_kwh -= battery_delivered / BATTERY_ROUND_TRIP_EFFICIENCY
                deficit -= battery_delivered

        exported = surplus
        grid_import = deficit
        self_consumed += battery_delivered

        transfer_price = transfer_price_cents_per_kwh(hour, transfer_pricing)
        price_per_kwh_eur = (energy_price + transfer_price) / 100

        hour_baseline_cost = consumption * price_per_kwh_eur
        hour_with_solar_cost = grid_import * price_per_kwh_eur
        hour_export_revenue = 0.0
        if export_pricing is not None:
            export_price = _export_price_cents_per_kwh(hour, export_pricing, spot_price_by_hour)
            if export_price is not None:
                hour_export_revenue = exported * export_price / 100

        total_consumption += consumption
        total_production += production
        total_self_consumed += self_consumed
        total_exported += exported
        baseline_cost_eur += hour_baseline_cost
        with_solar_cost_eur += hour_with_solar_cost
        total_export_revenue_eur += hour_export_revenue
        total_battery_delivered_kwh += battery_delivered

        local = hour.astimezone(HELSINKI_TZ)
        acc = monthly_acc[(local.year, local.month)]
        acc["consumption_kwh"] += consumption
        acc["self_consumed_kwh"] += self_consumed
        acc["exported_kwh"] += exported
        acc["baseline_cost_eur"] += hour_baseline_cost
        acc["with_solar_cost_eur"] += hour_with_solar_cost
        acc["export_revenue_eur"] += hour_export_revenue
        acc["battery_delivered_kwh"] += battery_delivered

    self_consumption_rate = total_self_consumed / total_production if total_production > 0 else 0.0

    # Scale the calculated period's total benefit to a 365.25-day year, so a
    # payback period can be estimated even from a shorter upload - most
    # accurate with close to a year of real data (documented in CLAUDE.md).
    period_days = (end_local_day - start_local_day).days + 1
    total_benefit_eur = (baseline_cost_eur - with_solar_cost_eur) + total_export_revenue_eur
    annual_benefit_eur = total_benefit_eur / period_days * 365.25

    battery_cost_eur = battery.price_eur or 0.0 if battery is not None else 0.0
    total_investment_eur = (system_cost_eur or 0.0) + battery_cost_eur
    cost_given = system_cost_eur is not None or (battery is not None and battery.price_eur is not None)

    payback_years = None
    if cost_given and annual_benefit_eur > 0:
        payback_years = total_investment_eur / annual_benefit_eur

    monthly = [
        MonthlySavings(
            year=year,
            month=month,
            consumption_kwh=round(acc["consumption_kwh"], 3),
            self_consumed_kwh=round(acc["self_consumed_kwh"], 3),
            exported_kwh=round(acc["exported_kwh"], 3),
            baseline_cost_eur=round(acc["baseline_cost_eur"], 2),
            with_solar_cost_eur=round(acc["with_solar_cost_eur"], 2),
            savings_eur=round(acc["baseline_cost_eur"] - acc["with_solar_cost_eur"], 2),
            export_revenue_eur=round(acc["export_revenue_eur"], 2),
            battery_delivered_kwh=round(acc["battery_delivered_kwh"], 3),
        )
        for (year, month), acc in sorted(monthly_acc.items())
    ]

    return SavingsResult(
        total_consumption_kwh=round(total_consumption, 3),
        total_self_consumed_kwh=round(total_self_consumed, 3),
        total_exported_kwh=round(total_exported, 3),
        self_consumption_rate=round(self_consumption_rate, 4),
        baseline_cost_eur=round(baseline_cost_eur, 2),
        with_solar_cost_eur=round(with_solar_cost_eur, 2),
        total_export_revenue_eur=round(total_export_revenue_eur, 2),
        total_battery_delivered_kwh=round(total_battery_delivered_kwh, 3),
        savings_eur=round(baseline_cost_eur - with_solar_cost_eur, 2),
        annual_benefit_eur=round(annual_benefit_eur, 2),
        payback_years=round(payback_years, 1) if payback_years is not None else None,
        monthly=monthly,
    )
