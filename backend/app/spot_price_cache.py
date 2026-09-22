import sqlite3
from datetime import datetime
from pathlib import Path

CACHE_DB_PATH = Path(__file__).resolve().parent.parent / "data" / "spot_price_cache.sqlite3"
# backend/data/ is already gitignored (same place the user's real consumption
# CSV goes) - this cache is local-only and never committed.


def _connect() -> sqlite3.Connection:
    CACHE_DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(CACHE_DB_PATH)
    conn.execute(
        "CREATE TABLE IF NOT EXISTS spot_prices ("
        "timestamp_utc TEXT PRIMARY KEY, price_cents_per_kwh REAL NOT NULL)"
    )
    return conn


def get_cached_range(start: datetime, end: datetime) -> list[tuple[datetime, float]] | None:
    """Returns cached (timestamp, price) rows for [start, end), sorted by
    timestamp, but only if every hour in the range is present - a single
    missing hour returns None so callers never work with silently-incomplete
    data. The expected count is derived from the actual span (not a
    hardcoded 24/day), so 23/25-hour DST days are handled correctly.
    """
    expected_hours = round((end - start).total_seconds() / 3600)
    if expected_hours <= 0:
        return []

    with _connect() as conn:
        rows = conn.execute(
            "SELECT timestamp_utc, price_cents_per_kwh FROM spot_prices "
            "WHERE timestamp_utc >= ? AND timestamp_utc < ? ORDER BY timestamp_utc",
            (start.isoformat(), end.isoformat()),
        ).fetchall()

    if len(rows) != expected_hours:
        return None

    return [(datetime.fromisoformat(ts), price) for ts, price in rows]


def store_entries(entries: list[tuple[datetime, float]]) -> None:
    """Upserts (timestamp, price) rows - safe to call with overlapping data."""
    if not entries:
        return

    with _connect() as conn:
        conn.executemany(
            "INSERT OR REPLACE INTO spot_prices (timestamp_utc, price_cents_per_kwh) VALUES (?, ?)",
            [(timestamp.isoformat(), price) for timestamp, price in entries],
        )
