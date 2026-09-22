from datetime import UTC, datetime, timedelta
from pathlib import Path

import pytest

from app import spot_price_cache
from app.spot_price_cache import get_cached_range, store_entries


@pytest.fixture(autouse=True)
def _isolated_cache(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(spot_price_cache, "CACHE_DB_PATH", tmp_path / "test_cache.sqlite3")


def test_round_trip_for_a_fully_covered_range():
    start = datetime(2024, 6, 14, 0, tzinfo=UTC)
    entries = [(start + timedelta(hours=h), 5.0 + h) for h in range(24)]

    store_entries(entries)

    result = get_cached_range(start, start + timedelta(hours=24))

    assert result == entries


def test_returns_none_when_the_range_is_partially_covered():
    start = datetime(2024, 6, 14, 0, tzinfo=UTC)
    store_entries([(start + timedelta(hours=h), 5.0) for h in range(23)])  # missing the last hour

    assert get_cached_range(start, start + timedelta(hours=24)) is None


def test_returns_none_when_the_range_is_entirely_uncached():
    start = datetime(2024, 6, 14, 0, tzinfo=UTC)

    assert get_cached_range(start, start + timedelta(hours=24)) is None


def test_returns_empty_list_for_an_empty_range():
    start = datetime(2024, 6, 14, 0, tzinfo=UTC)

    assert get_cached_range(start, start) == []


def test_store_entries_upserts_overlapping_data():
    start = datetime(2024, 6, 14, 0, tzinfo=UTC)
    store_entries([(start, 5.0)])
    store_entries([(start, 9.0)])  # overwrite

    assert get_cached_range(start, start + timedelta(hours=1)) == [(start, 9.0)]


def test_round_trip_across_a_dst_spring_forward_23_hour_day():
    # Finnish clocks spring forward on 2024-03-31, so the UTC span for that
    # Finnish calendar day is only 23 hours - the completeness check must be
    # derived from the actual span, not a hardcoded 24.
    start = datetime(2024, 3, 30, 22, tzinfo=UTC)
    end = datetime(2024, 3, 31, 21, tzinfo=UTC)
    entries = [(start + timedelta(hours=h), 5.0 + h) for h in range(23)]

    store_entries(entries)

    assert get_cached_range(start, end) == entries
