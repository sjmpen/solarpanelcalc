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
- **Electricity pricing**: Elering's day-ahead price API
  (`dashboard.elering.ee`, no API key) for spot prices (`fi` market, EUR/MWh
  converted to c/kWh) — chosen over `api.porssisahko.net` for its historical
  depth. Fixed price is just a number the user enters, no API. See
  `backend/app/pricing.py`, including `finnish_day_bounds_utc` (Finnish
  calendar day → UTC range via `zoneinfo`, DST-aware).

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
- **M4** (done): electricity price integration — spot price history + fixed-price input
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

**M4 note for M5:** unlike M3, Elering's spot price data *does*
calendar-align with the real consumption period (real historical Nord Pool
prices, not climate averages) — so for spot-priced savings, fetching the
actual per-hour prices for the actual consumption dates is realistic, not
just a pattern-match like PVGIS production. `fetch_spot_prices`/
`finnish_day_bounds_utc` in `backend/app/pricing.py` currently fetch one
Finnish calendar day at a time (M4's own scope was a single-day preview,
not the full ~2-year range) — M5 will need to call it per day across the
consumption period (or extend it to accept a range) once it knows exactly
what the savings calc needs. `PricingChoice` (`frontend/src/pricing.ts`) is
already lifted to `App.tsx` state for M5 to consume, same as `location`.

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
servers, and Elering (`dashboard.elering.ee`) — are blocked by the egress
proxy (confirmed for all four as of M2/M3/M4, each via a direct `curl`
against the real running backend, not just guessed). Those integrations are
unit-tested there against recorded fixtures/mocks, and need a live local
run to confirm real requests/responses before being considered fully done.
Visual/UI checks (screenshots, not just passing tests) are also worth doing
in-sandbox even though the network calls themselves can't be verified there
— M3's compass widget had a real CSS bug that only a screenshot caught.
