# solarpanelcalc

A website that estimates the cost savings of installing solar panels, based
on a user's real electricity consumption history (uploaded as a Fingrid
Datahub CSV export), their house location, chosen solar system parameters,
and their electricity contract type (spot price vs. fixed price).

## Stack

- **Backend**: Python + FastAPI, managed with `uv`, tested with `pytest`.
- **Frontend**: React + TypeScript via Vite (added in a later milestone).
- **Maps**: Leaflet + OpenStreetMap/Nominatim — no API key needed (added in
  a later milestone).

## Running the backend

```bash
cd backend
uv sync
uv run fastapi dev app/main.py
```

## Running tests

```bash
cd backend
uv run pytest
```

## Roadmap

- **M0** (done): repo scaffolding, Fingrid CSV parser, `/consumption/upload`
- **M1**: frontend scaffold + CSV upload UI
- **M2**: address input — Leaflet map + Nominatim geocoding
- **M3**: PVGIS integration — solar production estimate for location + system params
- **M4**: electricity price integration — spot price history + fixed-price input
- **M5**: savings engine (consumption + production + pricing) and results view

## Fingrid CSV format

`;`-delimited, comma as decimal separator, `PT15M` (15-minute) resolution
readings, ISO 8601 UTC timestamps, e.g.:

```
Mittauspisteen tunnus;Tuotteen tyyppi;Resoluutio;Yksikkötyyppi;Lukeman tyyppi;Alkuaika;Määrä;Laatu
643006966022791278;8716867000030;PT15M;kWh;BN01;2024-12-31T22:00:00Z;2,126000;OK
```

The parser (`backend/app/csv_parser.py`) validates the header, resolution,
and unit, and keeps (rather than drops) rows where `Laatu != "OK"`, flagging
them via `Reading.quality_ok` instead. `backend/tests/fixtures/sample_consumption.csv`
is a small, anonymized 2-day slice of real data for tests — the full raw CSV
is never committed; drop it in the gitignored `backend/data/` for manual
local testing instead.

## Sandbox note

When developing in a network-restricted sandbox (e.g. Claude Code's remote
environment), outbound calls to third-party APIs used by later milestones —
PVGIS (`re.jrc.ec.europa.eu`), Nominatim (`nominatim.openstreetmap.org`),
and Finnish spot price APIs — may be blocked by the egress proxy. Those
integrations should be unit-tested against recorded fixtures/mocks there,
and live-verified locally (or in an environment with open egress) before
being considered done.
