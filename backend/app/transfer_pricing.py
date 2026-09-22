from datetime import datetime
from typing import Literal

from pydantic import BaseModel

from app.pricing import HELSINKI_TZ

# Boundaries matching the hints shown in frontend/src/components/TransferPricingFields.tsx -
# common Finnish DSO approximations (e.g. Elenia's Yösähkö/Kausisähkö), not
# fetched or verified against any live source.
DAY_START_HOUR = 7
DAY_END_HOUR = 22  # exclusive
WINTER_MONTHS = {11, 12, 1, 2, 3}
WINTER_DAY_START_HOUR = 7
WINTER_DAY_END_HOUR = 21  # exclusive
WINTER_DAY_MAX_WEEKDAY = 5  # Python weekday(): Monday=0 .. Sunday=6; Mon-Sat qualify


class TransferPricingInput(BaseModel):
    type: Literal["flat", "day-night", "seasonal"]
    price_cents_per_kwh: float | None = None
    day_price_cents_per_kwh: float | None = None
    night_price_cents_per_kwh: float | None = None
    winter_day_price_cents_per_kwh: float | None = None
    winter_night_price_cents_per_kwh: float | None = None
    other_price_cents_per_kwh: float | None = None


def transfer_price_cents_per_kwh(timestamp_utc: datetime, transfer: TransferPricingInput) -> float:
    local = timestamp_utc.astimezone(HELSINKI_TZ)

    if transfer.type == "flat":
        return transfer.price_cents_per_kwh or 0.0

    if transfer.type == "day-night":
        is_day = DAY_START_HOUR <= local.hour < DAY_END_HOUR
        return (transfer.day_price_cents_per_kwh or 0.0) if is_day else (transfer.night_price_cents_per_kwh or 0.0)

    # seasonal
    if local.month not in WINTER_MONTHS:
        return transfer.other_price_cents_per_kwh or 0.0

    is_winter_day = (
        local.weekday() <= WINTER_DAY_MAX_WEEKDAY
        and WINTER_DAY_START_HOUR <= local.hour < WINTER_DAY_END_HOUR
    )
    return (
        (transfer.winter_day_price_cents_per_kwh or 0.0)
        if is_winter_day
        else (transfer.winter_night_price_cents_per_kwh or 0.0)
    )
