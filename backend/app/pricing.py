from datetime import UTC, date, datetime, time, timedelta
from zoneinfo import ZoneInfo

import httpx
from pydantic import BaseModel

ELERING_PRICE_URL = "https://dashboard.elering.ee/api/nps/price"
HELSINKI_TZ = ZoneInfo("Europe/Helsinki")

# Elering's NPS price is the pre-tax Nord Pool exchange price. Finnish
# electricity is subject to 25.5% VAT, which we add here so the price
# shown is what the user would actually be billed.
FINLAND_VAT_MULTIPLIER = 1.255


class SpotPriceEntry(BaseModel):
    timestamp: datetime  # UTC
    price_cents_per_kwh: float  # VAT-inclusive (25.5%)


class SpotPriceResponse(BaseModel):
    date: date
    entries: list[SpotPriceEntry]


class PricingError(RuntimeError):
    pass


def finnish_day_bounds_utc(day: date) -> tuple[datetime, datetime]:
    """Midnight-to-midnight in Europe/Helsinki for `day`, as UTC instants."""
    start_local = datetime.combine(day, time.min, tzinfo=HELSINKI_TZ)
    end_local = datetime.combine(day + timedelta(days=1), time.min, tzinfo=HELSINKI_TZ)
    return start_local.astimezone(UTC), end_local.astimezone(UTC)


async def fetch_spot_prices(day: date) -> list[SpotPriceEntry]:
    """Fetches Finnish day-ahead spot prices for `day` (a Finnish calendar day)."""
    start, end = finnish_day_bounds_utc(day)
    return await fetch_spot_price_range(start, end)


async def fetch_spot_price_range(start: datetime, end: datetime) -> list[SpotPriceEntry]:
    """Fetches Finnish day-ahead spot prices for [start, end) UTC, VAT-inclusive (25.5%)."""
    query = {
        "start": start.isoformat().replace("+00:00", "Z"),
        "end": end.isoformat().replace("+00:00", "Z"),
    }

    async with httpx.AsyncClient() as client:
        try:
            response = await client.get(ELERING_PRICE_URL, params=query, timeout=30)
        except httpx.HTTPError as exc:
            raise PricingError(f"Could not reach Elering: {exc}") from exc

    if response.status_code != 200:
        message = _extract_error_message(response)
        raise PricingError(f"Elering returned {response.status_code}: {message}")

    try:
        payload = response.json()
        fi_entries = payload["data"]["fi"]
        entries = [
            SpotPriceEntry(
                timestamp=datetime.fromtimestamp(row["timestamp"], tz=UTC),
                price_cents_per_kwh=row["price"] / 10 * FINLAND_VAT_MULTIPLIER,
            )
            for row in fi_entries
        ]
    except (KeyError, TypeError, ValueError) as exc:
        raise PricingError(f"Unexpected Elering response shape: {exc}") from exc

    return sorted(entries, key=lambda entry: entry.timestamp)


def _extract_error_message(response: httpx.Response) -> str:
    try:
        body = response.json()
        return body.get("message", response.text)
    except ValueError:
        return response.text
