# solarpanelcalc

A website that estimates the cost savings of installing solar panels, based
on a user's real electricity consumption history (uploaded as a Fingrid
Datahub CSV export), their house location, chosen solar system parameters,
and their electricity contract type (spot price vs. fixed price).

## Stack

- **Backend**: Python + FastAPI, managed with `uv`, tested with `pytest`.
- **Frontend**: React + TypeScript via Vite.
- **Hero banner**: `frontend/public/hero-landscape.svg`, a hand-drawn Firewatch-
  style Finnish lake scene (aurora, sunset, spruce + a birch, a lakeside
  cottage) rendered above the `<h1>` in `App.tsx`. Pure decoration, no
  behavior — self-contained colors so it looks the same in light/dark mode.
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
  depth. Elering's price is pre-tax; `FINLAND_VAT_MULTIPLIER` (1.255, i.e.
  25.5% VAT) is applied before returning it, so `SpotPriceEntry.price_cents_per_kwh`
  is always VAT-inclusive — the frontend says so next to the spot price
  preview. Fixed price is just a number the user enters, and is assumed to
  already include VAT (no way to check that server-side). See
  `backend/app/pricing.py`, including `finnish_day_bounds_utc` (Finnish
  calendar day → UTC range via `zoneinfo`, DST-aware).
- **Local spot-price cache** (`backend/app/spot_price_cache.py`): a settled
  (fully past) Finnish day's spot price never changes once published, so
  `fetch_spot_price_range` (and therefore `fetch_spot_prices`, the
  `/pricing/spot` preview, and `/savings/calculate` in spot mode) splits any
  requested range at "the start of today, Finnish local time." Everything
  before that is cached in a local SQLite DB
  (`backend/data/spot_price_cache.sqlite3`, stdlib `sqlite3`, no new
  dependency — same gitignored directory as the user's real consumption
  CSV, never committed); everything from today onward is always fetched
  fresh and never cached, since it can still be provisional. A recalculation
  with the same date range (e.g. tweaking system params and re-running
  `/savings/calculate`) hits the cache instead of re-fetching the whole
  consumption period from Elering every time. If the settled portion isn't
  *fully* cached (even one missing hour), the whole settled range is
  refetched and overwritten — no fine-grained gap-filling, since that would
  be overkill for a personal-use tool. Cached prices are VAT-adjusted at
  fetch time using whatever `FINLAND_VAT_MULTIPLIER` is current then, same
  as the uncached behavior — the cache just locks in that snapshot, so a
  future VAT change wouldn't retroactively update already-cached rows.
- **Pricing model** (`frontend/src/pricing.ts`, frontend-only, no backend
  involvement): `PricingChoice` (fixed or spot) carries a margin (c/kWh) for
  spot on top of Elering's price. Separately, `TransferPricing`
  (`components/TransferPricingFields.tsx`, always visible — both energy and
  transfer pricing are required, since the savings calc needs both) models
  grid-company transfer pricing (paid separately from the electricity
  retailer) as one of flat / day-night / seasonal — see that file's assumed
  day/night and winter boundary definitions (stated as common Finnish DSO
  approximations, e.g. Elenia's products, not fetched or verified against
  any live source). The same boundaries are re-implemented backend-side in
  `backend/app/transfer_pricing.py` for the savings calculation. No monthly
  fees anywhere in the model — they'd cancel out identically in both the
  baseline and with-solar cost, so they don't affect `savings_eur` at all;
  removed rather than kept as dead weight on the form.
- **Savings engine** (`backend/app/savings.py`, `POST /savings/calculate`):
  combines consumption + a synthesized hourly production curve + pricing
  into a savings estimate. See "How the savings engine works" below.

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
- **M5** (done): savings engine (consumption + production + pricing) and results view

The app is feature-complete per the original roadmap as of M5. Further work
from here is refinement (see "Known limitations" below), not new milestones.

## How the savings engine works

PVGIS gives monthly production totals (M3); consumption is 15-minute data;
spot prices are hourly. `backend/app/savings.py`'s `calculate_savings`
brings them to a common hourly resolution:

1. **`backend/app/solar_shape.py`** synthesizes an hourly production curve:
   real sunrise/sunset per day for the user's lat/lon (a standard simplified
   "sunrise equation" — solar declination from day-of-year, hour angle from
   `arccos(-tan(lat)*tan(decl))`, clamped to `[-1,1]` so polar day/night fall
   out of the same formula rather than needing special cases), then each
   day's fair share of its month's PVGIS total (`month_kwh / days_in_month`)
   is spread across daylight hours as a `sin(pi * fraction)` curve. No
   equation-of-time correction (~±15 min error at worst — negligible next to
   the sine-shape approximation itself).
2. Consumption readings are bucketed into matching hourly sums.
3. For each hour: `self_consumed = min(consumption, production)`,
   `exported = max(production - consumption, 0)`, cost is computed both
   with actual consumption (baseline) and with consumption minus
   self-consumption (with-solar), at that hour's price (spot, from
   `fetch_spot_price_range` — the whole consumption period from Elering in
   as few calls as possible, not per-day like `/pricing/spot`'s preview,
   chunked into <=350-day requests since Elering rejects a single request
   spanning more than 1 year (confirmed against the real API — a ~2-year
   Fingrid export needs 2-3 chunked requests) — plus margin; or fixed) plus
   transfer price
   (`backend/app/transfer_pricing.py`, mirrors the frontend's boundaries).
   Both energy and transfer pricing are required inputs (`EnergyPricingInput`,
   `TransferPricingInput` — no `| None`) — there's no monthly fee anywhere
   in the model (would cancel out in `savings_eur` identically either way,
   so it was removed rather than kept as a no-op field on the form).

**The frontend sends its already-fetched PVGIS monthly estimate** rather
than having this endpoint re-call PVGIS — so **fixed-price mode needs zero
external calls**, fully verifiable in this sandbox (confirmed via `curl`
against a running server with the real 21-month consumption file: sane,
internally-consistent numbers, sub-second). Spot-price mode still needs one
Elering call and keeps the "verify locally" caveat.

### Known limitations (deliberate, documented rather than hidden)

- This is a simplified model, not a bill-accurate simulation — surfaced as
  a permanent note in `SavingsResults.tsx`.
- Exported (excess) solar is reported in kWh but **not priced** — no export
  euro figure, since sell-back compensation varies by contract and isn't
  collected as an input. The headline savings figure is self-consumption
  savings only, a conservative lower bound.
- Hours with no matching spot price (e.g. consumption data extending past
  whatever "today" actually is when run locally, since this sandbox's
  system clock is set to a fictional future date) are excluded from the
  totals, not estimated or interpolated.
- No persistence — every calculation is a fresh request.

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
proxy (confirmed for all four via a direct `curl` against the real running
backend, not just guessed). Those integrations are unit-tested there against
recorded fixtures/mocks, and need a live local run to confirm real
requests/responses before being considered fully done. `/savings/calculate`
in fixed-price mode is the one exception that needs no external calls at
all (see "How the savings engine works") and was fully verified in-sandbox,
including a real headless-browser run of the whole upload→location→
estimate→pricing→results flow (PVGIS mocked at the network boundary with
Playwright route interception, since only that one call is blocked — the
rest of the pipeline, including the actual savings math, ran for real).

This is exactly why the "verify locally" caveat matters: the first real
local run of spot-price mode hit `fetch_spot_price_range` sending the
whole ~21-month consumption range in one Elering request, which Elering
rejected ("Maximum period is 1 year") — invisible from this sandbox since
the call never reaches Elering here at all, only a local run with real
network access surfaced it. Fixed with request chunking (`MAX_REQUEST_RANGE`
in `backend/app/pricing.py`), covered by tests asserting the actual call
count for both a sub-year and a >1000-day range.
Visual/UI checks (screenshots, not just passing tests) are also worth doing
in-sandbox even though the network calls themselves can't be verified there
— M3's compass widget had a real CSS bug that only a screenshot caught.
