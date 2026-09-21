from pathlib import Path

import pytest

from app.csv_parser import InvalidConsumptionCsv, parse_fingrid_csv, summarize

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
