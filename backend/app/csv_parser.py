import csv
import io
from datetime import date, datetime

from app.models import ConsumptionSummary, Reading
from app.pricing import finnish_day_bounds_utc

EXPECTED_HEADER = [
    "Mittauspisteen tunnus",
    "Tuotteen tyyppi",
    "Resoluutio",
    "Yksikkötyyppi",
    "Lukeman tyyppi",
    "Alkuaika",
    "Määrä",
    "Laatu",
]

EXPECTED_RESOLUTION = "PT15M"
EXPECTED_UNIT = "kWh"


class InvalidConsumptionCsv(ValueError):
    pass


def parse_fingrid_csv(raw: bytes) -> list[Reading]:
    """Parse a Fingrid Datahub electricity consumption export.

    Format: ';'-delimited, comma as decimal separator, 15-minute resolution,
    ISO 8601 UTC timestamps, e.g.:
    Mittauspisteen tunnus;Tuotteen tyyppi;Resoluutio;Yksikkötyyppi;Lukeman tyyppi;Alkuaika;Määrä;Laatu
    """
    text = raw.decode("utf-8-sig")
    reader = csv.reader(io.StringIO(text), delimiter=";")

    try:
        header = next(reader)
    except StopIteration:
        raise InvalidConsumptionCsv("CSV file is empty")

    if header != EXPECTED_HEADER:
        raise InvalidConsumptionCsv(
            f"Unexpected CSV header, expected a Fingrid Datahub consumption export, got: {header}"
        )

    readings: list[Reading] = []
    for row_number, row in enumerate(reader, start=2):
        if not row:
            continue
        if len(row) != len(EXPECTED_HEADER):
            raise InvalidConsumptionCsv(
                f"Row {row_number} has {len(row)} columns, expected {len(EXPECTED_HEADER)}"
            )

        _, _, resolution, unit, _, start_time, amount, quality = row

        if resolution != EXPECTED_RESOLUTION:
            raise InvalidConsumptionCsv(
                f"Row {row_number}: unsupported resolution '{resolution}', "
                f"only {EXPECTED_RESOLUTION} is currently supported"
            )
        if unit != EXPECTED_UNIT:
            raise InvalidConsumptionCsv(
                f"Row {row_number}: unsupported unit '{unit}', only {EXPECTED_UNIT} is currently supported"
            )

        readings.append(
            Reading(
                timestamp=datetime.fromisoformat(start_time.replace("Z", "+00:00")),
                kwh=float(amount.replace(",", ".")),
                quality_ok=quality == "OK",
            )
        )

    if not readings:
        raise InvalidConsumptionCsv("CSV file contains no data rows")

    return readings


def filter_readings_by_date_range(
    readings: list[Reading], start_date: date | None, end_date: date | None
) -> list[Reading]:
    """Narrows readings to [start_date, end_date], inclusive, as Finnish
    calendar days (consistent with finnish_day_bounds_utc elsewhere in the
    app). Either bound may be None to leave that side open.
    """
    lower = finnish_day_bounds_utc(start_date)[0] if start_date else None
    upper = finnish_day_bounds_utc(end_date)[1] if end_date else None

    filtered = [
        r
        for r in readings
        if (lower is None or r.timestamp >= lower) and (upper is None or r.timestamp < upper)
    ]
    if not filtered:
        raise InvalidConsumptionCsv("No consumption data within the selected date range")
    return filtered


def summarize(readings: list[Reading]) -> ConsumptionSummary:
    total_kwh = sum(r.kwh for r in readings)
    start = min(r.timestamp for r in readings)
    end = max(r.timestamp for r in readings)

    # each reading covers a 15-minute slot, so the covered span is one slot past the last start time
    span_days = ((end - start).total_seconds() + 15 * 60) / 86400

    return ConsumptionSummary(
        reading_count=len(readings),
        start=start,
        end=end,
        total_kwh=round(total_kwh, 3),
        average_daily_kwh=round(total_kwh / span_days, 3),
        flagged_reading_count=sum(1 for r in readings if not r.quality_ok),
    )
