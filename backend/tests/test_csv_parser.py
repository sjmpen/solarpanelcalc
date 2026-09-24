from datetime import date
from pathlib import Path

import pytest

from app.csv_parser import (
    InvalidConsumptionCsv,
    filter_readings_by_date_range,
    parse_fingrid_csv,
    summarize,
)

FIXTURE = Path(__file__).parent / "fixtures" / "sample_consumption.csv"
EXPECTED_READING_COUNT = 192  # 2 full days at 15-minute resolution


def test_parses_comma_decimal_amounts():
    readings = parse_fingrid_csv(FIXTURE.read_bytes())
    assert readings[0].kwh == 1.112
    assert all(isinstance(r.kwh, float) for r in readings)


def test_reading_count_matches_15_minute_resolution():
    readings = parse_fingrid_csv(FIXTURE.read_bytes())
    assert len(readings) == EXPECTED_READING_COUNT


def test_flags_non_ok_quality_without_dropping_row():
    readings = parse_fingrid_csv(FIXTURE.read_bytes())
    flagged = [r for r in readings if not r.quality_ok]
    assert len(flagged) == 1
    assert len(readings) == EXPECTED_READING_COUNT


def test_rejects_wrong_header():
    bad = b"a;b;c\n1;2;3\n"
    with pytest.raises(InvalidConsumptionCsv):
        parse_fingrid_csv(bad)


def test_rejects_unsupported_resolution():
    header = (
        "Mittauspisteen tunnus;Tuotteen tyyppi;Resoluutio;Yksikkötyyppi;"
        "Lukeman tyyppi;Alkuaika;Määrä;Laatu\n"
    )
    row = "1;2;PT60M;kWh;BN01;2025-01-01T00:00:00Z;1,0;OK\n"
    with pytest.raises(InvalidConsumptionCsv):
        parse_fingrid_csv((header + row).encode("utf-8"))


def test_summary_totals():
    readings = parse_fingrid_csv(FIXTURE.read_bytes())
    summary = summarize(readings)
    assert summary.reading_count == EXPECTED_READING_COUNT
    assert summary.flagged_reading_count == 1
    assert summary.total_kwh == pytest.approx(sum(r.kwh for r in readings), rel=1e-6)


def test_filter_readings_by_date_range_with_no_bounds_keeps_everything():
    readings = parse_fingrid_csv(FIXTURE.read_bytes())
    assert filter_readings_by_date_range(readings, None, None) == readings


def test_filter_readings_by_date_range_narrows_to_a_single_finnish_day():
    # The fixture's UTC timestamps don't align with Finnish local midnight
    # (UTC+2 in January) - 2025-01-01 (Finnish calendar day) only covers the
    # readings from 2025-01-01T00:00Z up to (not including) 2025-01-01T22:00Z.
    readings = parse_fingrid_csv(FIXTURE.read_bytes())
    filtered = filter_readings_by_date_range(readings, date(2025, 1, 1), date(2025, 1, 1))

    assert len(filtered) == 88
    assert all(r.timestamp.isoformat() < "2025-01-01T22:00:00+00:00" for r in filtered)


def test_filter_readings_by_date_range_end_date_is_inclusive():
    readings = parse_fingrid_csv(FIXTURE.read_bytes())
    filtered = filter_readings_by_date_range(readings, date(2025, 1, 1), date(2025, 1, 2))

    # Excludes the last 8 readings (2025-01-02T22:00-23:45Z), which fall on
    # the Finnish calendar day 2025-01-03, one day past the requested end.
    assert len(filtered) == 88 + 96


def test_filter_readings_by_date_range_raises_when_nothing_matches():
    readings = parse_fingrid_csv(FIXTURE.read_bytes())
    with pytest.raises(InvalidConsumptionCsv, match="No consumption data"):
        filter_readings_by_date_range(readings, date(2020, 1, 1), date(2020, 1, 1))
