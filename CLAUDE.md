# solarpanelcalc

A website that estimates the cost savings of installing solar panels, based
on a user's real electricity consumption history (uploaded as a Fingrid
Datahub CSV export), their house location, chosen solar system parameters,
and their electricity contract type (spot price vs. fixed price).

## Stack

- **Backend**: Python + FastAPI, managed with `uv`, tested with `pytest`.
- **Frontend**: React + TypeScript via Vite.
- **Maps**: Leaflet (`react-leaflet`) + OpenStreetMap/Nominatim — no API key
  needed. Address search is submit-based (not type-ahead), to stay within
  Nominatim's usage policy; clicking the map sets a location directly.
- **Solar production**: PVGIS `PVcalc` API (`re.jrc.ec.europa.eu`, no API
  key) — monthly + annual kWh estimate from location + system params
  (peak power, tilt, azimuth, loss %, mounting). See `backend/app/pvgis.py`.
  Deliberately monthly, not hourly — see M3 notes below.

## Running the backend

```bash
cd backend
uv sync
uv run fastapi dev app/main.py    # serves on :8000
```

## Running the frontend

```bash
cd frontend
npm install
cp .env.example .env              # only needed if the backend isn't on :8000
npm run dev                       # serves on :5173
```

The backend allows CORS from `http://localhost:5173` (see `CORSMiddleware`
in `backend/app/main.py`); the frontend reads the API's base URL from
`VITE_API_BASE_URL` (defaults to `http://localhost:8000`, see `src/api.ts`).

## Running tests

```bash
cd backend && uv run pytest
cd frontend && npm run test       # vitest
cd frontend && npx tsc -b         # typecheck
```

## Roadmap

- **M0** (done): repo scaffolding, Fingrid CSV parser, `/consumption/upload`
- **M1** (done): frontend scaffold (Vite + React + TS) + CSV upload UI
- **M2** (done): address input — Leaflet map + Nominatim geocoding
- **M3** (done): PVGIS integration — solar production estimate for location + system params
- **M4**: electricity price integration — spot price history + fixed-price input
- **M5**: savings engine (consumption + production + pricing) and results view

**M3 note for M5 (savings engine):** PVGIS `PVcalc` gives monthly averages
from long-term climate data, not a time series for the user's actual
2024-2026 consumption period — PVGIS's historical hourly data (`seriescalc`)
wouldn't calendar-align with that period either. When designing the savings
math, decide then whether monthly production vs. monthly consumption is
accurate enough, or whether an hourly pattern-matched approach (PVGIS
`seriescalc`/`tmy` mapped by month+hour-of-day rather than exact date) is
worth the added complexity — informed by what M4's pricing data looks like
too.

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
environment), outbound calls to third-party APIs — PVGIS
(`re.jrc.ec.europa.eu`), Nominatim (`nominatim.openstreetmap.org`), OSM tile
servers, and Finnish spot price APIs (M4) — are blocked by the egress proxy
(confirmed for all of PVGIS/Nominatim/tiles as of M2/M3). Those integrations
are unit-tested there against recorded fixtures/mocks, and need a live local
run to confirm real requests/responses before being considered fully done.
