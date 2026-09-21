from pathlib import Path

import pytest
from fastapi.testclient import TestClient

import app.main as main
from app.main import app
from app.pvgis import MonthlyProduction, PvgisError, SolarProductionEstimate

FIXTURE = Path(__file__).parent / "fixtures" / "sample_consumption.csv"

client = TestClient(app)

VALID_ESTIMATE_REQUEST = {
    "lat": 60.17,
    "lon": 24.94,
    "peak_power_kw": 5.0,
    "tilt_degrees": 40,
    "azimuth_degrees": 0,
}


def test_health():
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_upload_consumption_returns_summary():
    with FIXTURE.open("rb") as f:
        response = client.post(
            "/consumption/upload",
            files={"file": ("sample_consumption.csv", f, "text/csv")},
        )
    assert response.status_code == 200
    body = response.json()
    assert body["reading_count"] == 192
    assert body["flagged_reading_count"] == 1


def test_upload_rejects_bad_csv():
    response = client.post(
        "/consumption/upload",
        files={"file": ("bad.csv", b"not,a,fingrid,file\n1,2,3,4\n", "text/csv")},
    )
    assert response.status_code == 422


async def _fake_fetch_solar_production(lat, lon, params):
    return SolarProductionEstimate(
        annual_kwh=1732.47, monthly=[MonthlyProduction(month=1, kwh=31.62)]
    )


async def _fake_fetch_solar_production_error(lat, lon, params):
    raise PvgisError("PVGIS returned 400: Location outside coverage")


def test_solar_estimate_returns_production(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setattr(main, "fetch_solar_production", _fake_fetch_solar_production)

    response = client.post("/solar/estimate", json=VALID_ESTIMATE_REQUEST)

    assert response.status_code == 200
    body = response.json()
    assert body["annual_kwh"] == pytest.approx(1732.47)
    assert body["monthly"] == [{"month": 1, "kwh": 31.62}]


def test_solar_estimate_maps_pvgis_error_to_502(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setattr(main, "fetch_solar_production", _fake_fetch_solar_production_error)

    response = client.post("/solar/estimate", json=VALID_ESTIMATE_REQUEST)

    assert response.status_code == 502
    assert "Location outside coverage" in response.json()["detail"]


def test_solar_estimate_rejects_invalid_params():
    response = client.post("/solar/estimate", json={**VALID_ESTIMATE_REQUEST, "peak_power_kw": -1})
    assert response.status_code == 422
