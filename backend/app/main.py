from fastapi import FastAPI, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware

from app.csv_parser import InvalidConsumptionCsv, parse_fingrid_csv, summarize
from app.models import ConsumptionSummary
from app.pvgis import (
    PvgisError,
    SolarEstimateRequest,
    SolarProductionEstimate,
    SolarSystemParams,
    fetch_solar_production,
)

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
