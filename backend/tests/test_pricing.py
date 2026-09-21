import json
from datetime import date
from pathlib import Path

import httpx
import pytest

from app.pricing import PricingError, fetch_spot_prices, finnish_day_bounds_utc

FIXTURE = Path(__file__).parent / "fixtures" / "elering_response.json"


class _StubAsyncClient:
    def __init__(self, response: httpx.Response):
        self._response = response

    async def __aenter__(self) -> "_StubAsyncClient":
        return self

    async def __aexit__(self, *exc_info: object) -> None:
        return None

    async def get(self, url: str, params: dict | None = None, timeout: float | None = None) -> httpx.Response:
        return self._response


def stub_client(response: httpx.Response):
    def factory(*args: object, **kwargs: object) -> _StubAsyncClient:
        return _StubAsyncClient(response)

    return factory


def test_finnish_day_bounds_utc_on_a_normal_day():
    start, end = finnish_day_bounds_utc(date(2024, 6, 15))

    # Helsinki is UTC+3 (EEST) in June -> local midnight is 21:00 UTC the day before
    assert start.isoformat() == "2024-06-14T21:00:00+00:00"
    assert end.isoformat() == "2024-06-15T21:00:00+00:00"


def test_finnish_day_bounds_utc_across_dst_spring_forward():
    # Clocks in Finland spring forward on the last Sunday of March (2024-03-31).
    # The day itself is still a normal midnight-to-midnight span in UTC terms,
    # even though it only has 23 local hours.
    start, end = finnish_day_bounds_utc(date(2024, 3, 31))

    assert start.isoformat() == "2024-03-30T22:00:00+00:00"  # EET (UTC+2) before the switch
    assert end.isoformat() == "2024-03-31T21:00:00+00:00"  # EEST (UTC+3) after the switch


async def test_fetch_spot_prices_parses_finnish_entries_and_converts_units(
    monkeypatch: pytest.MonkeyPatch,
):
    payload = json.loads(FIXTURE.read_text())
    monkeypatch.setattr("app.pricing.httpx.AsyncClient", stub_client(httpx.Response(200, json=payload)))

    entries = await fetch_spot_prices(date(2024, 6, 14))

    assert len(entries) == 24
    assert entries[0].price_cents_per_kwh == pytest.approx(4.567)  # 45.67 EUR/MWh -> 4.567 c/kWh
    assert entries == sorted(entries, key=lambda e: e.timestamp)


async def test_fetch_spot_prices_raises_on_non_200(monkeypatch: pytest.MonkeyPatch):
    response = httpx.Response(400, json={"message": "Invalid date range"})
    monkeypatch.setattr("app.pricing.httpx.AsyncClient", stub_client(response))

    with pytest.raises(PricingError, match="Invalid date range"):
        await fetch_spot_prices(date(2024, 6, 14))


async def test_fetch_spot_prices_raises_on_unexpected_shape(monkeypatch: pytest.MonkeyPatch):
    response = httpx.Response(200, json={"data": {}})
    monkeypatch.setattr("app.pricing.httpx.AsyncClient", stub_client(response))

    with pytest.raises(PricingError, match="Unexpected Elering response shape"):
        await fetch_spot_prices(date(2024, 6, 14))
