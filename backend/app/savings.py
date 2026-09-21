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
    monthly_fee_eur: float = 0


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


class SavingsResult(BaseModel):
    total_consumption_kwh: float
    total_self_consumed_kwh: float
    total_exported_kwh: float
    self_consumption_rate: float  # self-consumed / total modeled production, 0-1
    baseline_cost_eur: float
    with_solar_cost_eur: float
    savings_eur: float
    monthly: list[MonthlySavings]


def _hour_start(timestamp: datetime) -> datetime:
    return timestamp.replace(minute=0, second=0, microsecond=0)


def calculate_savings(
    readings: list[Reading],
    lat: float,
    lon: float,
    monthly_production: list[MonthlyProductionInput],
    energy_pricing: EnergyPricingInput,
    transfer_pricing: TransferPricingInput | None,
    spot_prices: list[SpotPriceEntry] | None,
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

    monthly_acc: dict[tuple[int, int], dict[str, float]] = defaultdict(
        lambda: {
            "consumption_kwh": 0.0,
            "self_consumed_kwh": 0.0,
            "exported_kwh": 0.0,
            "baseline_cost_eur": 0.0,
            "with_solar_cost_eur": 0.0,
        }
    )

    for hour, consumption in consumption_by_hour.items():
        if energy_pricing.type == "spot":
            spot_price = spot_price_by_hour.get(hour)
            if spot_price is None:
                continue  # no price data for this hour - excluded, not estimated
            energy_price = spot_price + margin
        else:
            energy_price = fixed_price

        production = production_by_hour.get(hour, 0.0)
        self_consumed = min(consumption, production)
        exported = max(production - consumption, 0.0)
        grid_import = consumption - self_consumed

        transfer_price = (
            transfer_price_cents_per_kwh(hour, transfer_pricing) if transfer_pricing else 0.0
        )
        price_per_kwh_eur = (energy_price + transfer_price) / 100

        hour_baseline_cost = consumption * price_per_kwh_eur
        hour_with_solar_cost = grid_import * price_per_kwh_eur

        total_consumption += consumption
        total_production += production
        total_self_consumed += self_consumed
        total_exported += exported
        baseline_cost_eur += hour_baseline_cost
        with_solar_cost_eur += hour_with_solar_cost

        local = hour.astimezone(HELSINKI_TZ)
        acc = monthly_acc[(local.year, local.month)]
        acc["consumption_kwh"] += consumption
        acc["self_consumed_kwh"] += self_consumed
        acc["exported_kwh"] += exported
        acc["baseline_cost_eur"] += hour_baseline_cost
        acc["with_solar_cost_eur"] += hour_with_solar_cost

    monthly_fee_eur = energy_pricing.monthly_fee_eur + (
        transfer_pricing.monthly_fee_eur if transfer_pricing else 0.0
    )
    baseline_cost_eur += monthly_fee_eur * len(monthly_acc)
    with_solar_cost_eur += monthly_fee_eur * len(monthly_acc)
    for acc in monthly_acc.values():
        acc["baseline_cost_eur"] += monthly_fee_eur
        acc["with_solar_cost_eur"] += monthly_fee_eur

    self_consumption_rate = total_self_consumed / total_production if total_production > 0 else 0.0

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
        savings_eur=round(baseline_cost_eur - with_solar_cost_eur, 2),
        monthly=monthly,
    )
