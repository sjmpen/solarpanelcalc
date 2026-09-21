from datetime import date, timedelta

from fastapi import FastAPI, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, ValidationError

from app.csv_parser import InvalidConsumptionCsv, parse_fingrid_csv, summarize
from app.models import ConsumptionSummary
from app.pricing import PricingError, SpotPriceResponse, fetch_spot_price_range, fetch_spot_prices
from app.pvgis import (
    PvgisError,
    SolarEstimateRequest,
    SolarProductionEstimate,
    SolarSystemParams,
    fetch_solar_production,
)
from app.savings import EnergyPricingInput, MonthlyProductionInput, SavingsResult, calculate_savings
from app.transfer_pricing import TransferPricingInput

app = FastAPI(title="solarpanelcalc")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/consumption/upload", response_model=ConsumptionSummary)
async def upload_consumption(file: UploadFile) -> ConsumptionSummary:
    raw = await file.read()
    try:
        readings = parse_fingrid_csv(raw)
    except InvalidConsumptionCsv as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    return summarize(readings)


@app.post("/solar/estimate", response_model=SolarProductionEstimate)
async def estimate_solar_production(request: SolarEstimateRequest) -> SolarProductionEstimate:
    params = SolarSystemParams(
        peak_power_kw=request.peak_power_kw,
        tilt_degrees=request.tilt_degrees,
        azimuth_degrees=request.azimuth_degrees,
        loss_percent=request.loss_percent,
        mounting=request.mounting,
    )
    try:
        return await fetch_solar_production(request.lat, request.lon, params)
    except PvgisError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc


@app.get("/pricing/spot", response_model=SpotPriceResponse)
async def get_spot_prices(date: date) -> SpotPriceResponse:
    try:
        entries = await fetch_spot_prices(date)
    except PricingError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    return SpotPriceResponse(date=date, entries=entries)


class SavingsCalculationRequest(BaseModel):
    lat: float
    lon: float
    monthly_production: list[MonthlyProductionInput]
    energy_pricing: EnergyPricingInput
    transfer_pricing: TransferPricingInput | None = None


@app.post("/savings/calculate", response_model=SavingsResult)
async def calculate_savings_endpoint(file: UploadFile, request: str = Form(...)) -> SavingsResult:
    try:
        parsed_request = SavingsCalculationRequest.model_validate_json(request)
    except ValidationError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc

    raw = await file.read()
    try:
        readings = parse_fingrid_csv(raw)
    except InvalidConsumptionCsv as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc

    spot_prices = None
    if parsed_request.energy_pricing.type == "spot":
        min_ts = min(r.timestamp for r in readings)
        max_ts = max(r.timestamp for r in readings)
        try:
            spot_prices = await fetch_spot_price_range(min_ts, max_ts + timedelta(hours=1))
        except PricingError as exc:
            raise HTTPException(status_code=502, detail=str(exc)) from exc

    try:
        return calculate_savings(
            readings=readings,
            lat=parsed_request.lat,
            lon=parsed_request.lon,
            monthly_production=parsed_request.monthly_production,
            energy_pricing=parsed_request.energy_pricing,
            transfer_pricing=parsed_request.transfer_pricing,
            spot_prices=spot_prices,
        )
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
