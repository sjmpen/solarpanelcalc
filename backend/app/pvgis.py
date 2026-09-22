from typing import Literal

import httpx
from pydantic import BaseModel, Field

PVGIS_PVCALC_URL = "https://re.jrc.ec.europa.eu/api/v5_2/PVcalc"


class SolarSystemParams(BaseModel):
    peak_power_kw: float = Field(gt=0)
    tilt_degrees: float = Field(ge=0, le=90)
    azimuth_degrees: float = Field(ge=-180, le=180)  # 0 = south, per PVGIS convention
    loss_percent: float = Field(default=14.0, ge=0, le=100)
    mounting: Literal["free", "building"] = "free"


class SolarEstimateRequest(SolarSystemParams):
    lat: float = Field(ge=-90, le=90)
    lon: float = Field(ge=-180, le=180)


class MonthlyProduction(BaseModel):
    month: int
    kwh: float


class SolarProductionEstimate(BaseModel):
    annual_kwh: float
    monthly: list[MonthlyProduction]


class PvgisError(RuntimeError):
    pass


async def fetch_solar_production(
    lat: float, lon: float, params: SolarSystemParams
) -> SolarProductionEstimate:
    query = {
        "lat": lat,
        "lon": lon,
        "peakpower": params.peak_power_kw,
        "loss": params.loss_percent,
        "angle": params.tilt_degrees,
        "aspect": params.azimuth_degrees,
        "mountingplace": params.mounting,
        "outputformat": "json",
    }

    async with httpx.AsyncClient() as client:
        try:
            response = await client.get(PVGIS_PVCALC_URL, params=query, timeout=30)
        except httpx.HTTPError as exc:
            raise PvgisError(f"Could not reach PVGIS: {exc}") from exc

    if response.status_code != 200:
        message = _extract_error_message(response)
        raise PvgisError(f"PVGIS returned {response.status_code}: {message}")

    try:
        payload = response.json()
        totals = payload["outputs"]["totals"]["fixed"]
        monthly_rows = payload["outputs"]["monthly"]["fixed"]
        return SolarProductionEstimate(
            annual_kwh=totals["E_y"],
            monthly=[
                MonthlyProduction(month=row["month"], kwh=row["E_m"]) for row in monthly_rows
            ],
        )
    except (KeyError, TypeError, ValueError) as exc:
        raise PvgisError(f"Unexpected PVGIS response shape: {exc}") from exc


def _extract_error_message(response: httpx.Response) -> str:
    try:
        body = response.json()
        return body.get("message", response.text)
    except ValueError:
        return response.text
