import json
from datetime import UTC, date, datetime, timedelta
from pathlib import Path

import httpx
import pytest

from app import pricing, spot_price_cache
from app.pricing import PricingError, fetch_spot_price_range, fetch_spot_prices, finnish_day_bounds_utc

FIXTURE = Path(__file__).parent / "fixtures" / "elering_response.json"


@pytest.fixture(autouse=True)
def _isolated_cache(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(spot_price_cache, "CACHE_DB_PATH", tmp_path / "test_cache.sqlite3")


class _StubAsyncClient:
    def __init__(self, response: httpx.Response, calls: list[dict] | None = None):
        self._response = response
        self._calls = calls

    async def __aenter__(self) -> "_StubAsyncClient":
        return self

    async def __aexit__(self, *exc_info: object) -> None:
        return None

    async def get(self, url: str, params: dict | None = None, timeout: float | None = None) -> httpx.Response:
        if self._calls is not None:
            self._calls.append(params or {})
        return self._response


def stub_client(response: httpx.Response, calls: list[dict] | None = None):
    def factory(*args: object, **kwargs: object) -> _StubAsyncClient:
        return _StubAsyncClient(response, calls)

    return factory


class _DynamicStubAsyncClient:
    """Unlike _StubAsyncClient, generates one hourly entry per requested hour
    instead of returning a fixed canned payload - needed for the caching
    tests below, which check exact hour-for-hour cache completeness rather
    than just entry counts."""

    def __init__(self, calls: list[dict] | None):
        self._calls = calls

    async def __aenter__(self) -> "_DynamicStubAsyncClient":
        return self

    async def __aexit__(self, *exc_info: object) -> None:
        return None

    async def get(self, url: str, params: dict | None = None, timeout: float | None = None) -> httpx.Response:
        if self._calls is not None:
            self._calls.append(params or {})

        start = datetime.fromisoformat(params["start"].replace("Z", "+00:00"))
        end = datetime.fromisoformat(params["end"].replace("Z", "+00:00"))
        hours = round((end - start).total_seconds() / 3600)
        fi_entries = [
            {"timestamp": int((start + timedelta(hours=h)).timestamp()), "price": 40.0 + h}
            for h in range(hours)
        ]
        return httpx.Response(200, json={"data": {"fi": fi_entries}})


def dynamic_stub_client(calls: list[dict] | None = None):
    def factory(*args: object, **kwargs: object) -> _DynamicStubAsyncClient:
        return _DynamicStubAsyncClient(calls)

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
    # 45.67 EUR/MWh -> 4.567 c/kWh pre-tax -> * 1.255 (25.5% VAT) = 5.731585
    assert entries[0].price_cents_per_kwh == pytest.approx(5.731585)
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


async def test_fetch_spot_price_range_chunks_requests_over_a_year(monkeypatch: pytest.MonkeyPatch):
    # Elering rejects a single request spanning more than 1 year - a long
    # range (like a real ~2-year Fingrid export covers) must be split into
    # multiple requests, none exceeding MAX_REQUEST_RANGE (350 days).
    payload = json.loads(FIXTURE.read_text())
    calls: list[dict] = []
    monkeypatch.setattr("app.pricing.httpx.AsyncClient", stub_client(httpx.Response(200, json=payload), calls))

    start = datetime(2023, 1, 1, tzinfo=UTC)
    end = start + timedelta(days=1000)  # 1000 / 350 -> 3 chunks: 350 + 350 + 300

    entries = await fetch_spot_price_range(start, end)

    assert len(calls) == 3
    assert len(entries) == 24 * len(calls)  # 24 fixture entries per page, concatenated
    assert entries == sorted(entries, key=lambda e: e.timestamp)


async def test_fetch_spot_price_range_makes_one_request_within_a_year(
    monkeypatch: pytest.MonkeyPatch,
):
    payload = json.loads(FIXTURE.read_text())
    calls: list[dict] = []
    monkeypatch.setattr("app.pricing.httpx.AsyncClient", stub_client(httpx.Response(200, json=payload), calls))

    start = datetime(2024, 1, 1, tzinfo=UTC)
    end = datetime(2024, 6, 1, tzinfo=UTC)
    await fetch_spot_price_range(start, end)

    assert len(calls) == 1


def _freeze_now(monkeypatch: pytest.MonkeyPatch, now: datetime) -> None:
    monkeypatch.setattr(pricing, "_current_utc_time", lambda: now)


async def test_fetch_spot_price_range_caches_a_fully_settled_range(monkeypatch: pytest.MonkeyPatch):
    _freeze_now(monkeypatch, datetime(2024, 7, 1, tzinfo=UTC))
    calls: list[dict] = []
    monkeypatch.setattr("app.pricing.httpx.AsyncClient", dynamic_stub_client(calls))

    start, end = finnish_day_bounds_utc(date(2024, 6, 14))

    first = await fetch_spot_price_range(start, end)
    assert len(calls) == 1

    second = await fetch_spot_price_range(start, end)
    assert len(calls) == 1  # no additional HTTP call - served from cache
    assert second == first


async def test_fetch_spot_price_range_never_caches_the_live_portion(monkeypatch: pytest.MonkeyPatch):
    now = datetime(2024, 6, 15, 10, tzinfo=UTC)
    _freeze_now(monkeypatch, now)
    calls: list[dict] = []
    monkeypatch.setattr("app.pricing.httpx.AsyncClient", dynamic_stub_client(calls))

    start, today_start = finnish_day_bounds_utc(date(2024, 6, 14))
    end = today_start + timedelta(hours=6)

    await fetch_spot_price_range(start, end)
    assert len(calls) == 2  # settled portion + live portion

    await fetch_spot_price_range(start, end)
    assert len(calls) == 3  # settled portion cached, live portion re-fetched


async def test_fetch_spot_price_range_refetches_whole_settled_range_on_partial_cache(
    monkeypatch: pytest.MonkeyPatch,
):
    _freeze_now(monkeypatch, datetime(2024, 7, 1, tzinfo=UTC))
    start, end = finnish_day_bounds_utc(date(2024, 6, 14))

    # Pre-seed the cache with all but one hour of the range.
    spot_price_cache.store_entries(
        [(start + timedelta(hours=h), 5.0) for h in range(23)]
    )

    calls: list[dict] = []
    monkeypatch.setattr("app.pricing.httpx.AsyncClient", dynamic_stub_client(calls))

    entries = await fetch_spot_price_range(start, end)

    assert len(calls) == 1  # incomplete cache triggers one full refetch
    assert len(entries) == 24


async def test_fetch_spot_prices_caches_a_past_day(monkeypatch: pytest.MonkeyPatch):
    _freeze_now(monkeypatch, datetime(2024, 7, 1, tzinfo=UTC))
    calls: list[dict] = []
    monkeypatch.setattr("app.pricing.httpx.AsyncClient", dynamic_stub_client(calls))

    await fetch_spot_prices(date(2024, 6, 14))
    assert len(calls) == 1

    await fetch_spot_prices(date(2024, 6, 14))
    assert len(calls) == 1
