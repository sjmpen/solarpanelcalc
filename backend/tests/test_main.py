import json
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

import app.main as main
from app.main import app
from app.pricing import PricingError, SpotPriceEntry
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


def test_upload_consumption_narrows_to_a_date_range():
    with FIXTURE.open("rb") as f:
        response = client.post(
            "/consumption/upload",
            files={"file": ("sample_consumption.csv", f, "text/csv")},
            params={"start_date": "2025-01-01", "end_date": "2025-01-01"},
        )
    assert response.status_code == 200
    assert response.json()["reading_count"] == 88  # see test_csv_parser.py for the math


def test_upload_consumption_rejects_a_date_range_matching_nothing():
    with FIXTURE.open("rb") as f:
        response = client.post(
            "/consumption/upload",
            files={"file": ("sample_consumption.csv", f, "text/csv")},
            params={"start_date": "2020-01-01", "end_date": "2020-01-01"},
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


async def _fake_fetch_spot_prices(day):
    from datetime import UTC, datetime

    return [SpotPriceEntry(timestamp=datetime(2024, 6, 14, 12, tzinfo=UTC), price_cents_per_kwh=4.567)]


async def _fake_fetch_spot_prices_error(day):
    raise PricingError("Elering returned 400: Invalid date range")


def test_spot_prices_returns_entries(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setattr(main, "fetch_spot_prices", _fake_fetch_spot_prices)

    response = client.get("/pricing/spot", params={"date": "2024-06-14"})

    assert response.status_code == 200
    body = response.json()
    assert body["date"] == "2024-06-14"
    assert body["entries"] == [
        {"timestamp": "2024-06-14T12:00:00Z", "price_cents_per_kwh": 4.567}
    ]


def test_spot_prices_maps_pricing_error_to_502(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setattr(main, "fetch_spot_prices", _fake_fetch_spot_prices_error)

    response = client.get("/pricing/spot", params={"date": "2024-06-14"})

    assert response.status_code == 502
    assert "Invalid date range" in response.json()["detail"]


def test_spot_prices_rejects_invalid_date():
    response = client.get("/pricing/spot", params={"date": "not-a-date"})
    assert response.status_code == 422


FLAT_TRANSFER = {"type": "flat", "price_cents_per_kwh": 3.0}


def _savings_request(
    energy_pricing: dict,
    transfer_pricing: dict = FLAT_TRANSFER,
    start_date: str | None = None,
    end_date: str | None = None,
) -> str:
    return json.dumps(
        {
            "lat": 60.17,
            "lon": 24.94,
            "monthly_production": [{"month": 1, "kwh": 150.0}],
            "energy_pricing": energy_pricing,
            "transfer_pricing": transfer_pricing,
            "start_date": start_date,
            "end_date": end_date,
        }
    )


def test_savings_calculate_fixed_price_end_to_end():
    # No mocking - fixed price needs no external calls, so this exercises
    # the real astronomy + hourly bucketing + pricing code for real.
    with FIXTURE.open("rb") as f:
        response = client.post(
            "/savings/calculate",
            files={"file": ("sample_consumption.csv", f, "text/csv")},
            data={"request": _savings_request({"type": "fixed", "price_cents_per_kwh": 10.0})},
        )

    assert response.status_code == 200
    body = response.json()
    assert body["total_consumption_kwh"] > 0
    assert 0 <= body["self_consumption_rate"] <= 1
    assert body["with_solar_cost_eur"] <= body["baseline_cost_eur"]
    assert body["savings_eur"] == pytest.approx(
        body["baseline_cost_eur"] - body["with_solar_cost_eur"], abs=0.01
    )
    assert len(body["monthly"]) >= 1


def test_savings_calculate_respects_a_narrowed_date_range():
    def calculate(start_date: str | None, end_date: str | None) -> float:
        with FIXTURE.open("rb") as f:
            response = client.post(
                "/savings/calculate",
                files={"file": ("sample_consumption.csv", f, "text/csv")},
                data={
                    "request": _savings_request(
                        {"type": "fixed", "price_cents_per_kwh": 10.0}, start_date=start_date, end_date=end_date
                    )
                },
            )
        assert response.status_code == 200
        return response.json()["total_consumption_kwh"]

    full_total = calculate(None, None)
    narrowed_total = calculate("2025-01-01", "2025-01-01")

    assert 0 < narrowed_total < full_total


def test_savings_calculate_rejects_a_date_range_matching_nothing():
    with FIXTURE.open("rb") as f:
        response = client.post(
            "/savings/calculate",
            files={"file": ("sample_consumption.csv", f, "text/csv")},
            data={
                "request": _savings_request(
                    {"type": "fixed", "price_cents_per_kwh": 10.0},
                    start_date="2020-01-01",
                    end_date="2020-01-01",
                )
            },
        )
    assert response.status_code == 422


def test_savings_calculate_rejects_bad_csv():
    response = client.post(
        "/savings/calculate",
        files={"file": ("bad.csv", b"not,a,fingrid,file\n1,2,3,4\n", "text/csv")},
        data={"request": _savings_request({"type": "fixed", "price_cents_per_kwh": 10.0})},
    )
    assert response.status_code == 422


def test_savings_calculate_rejects_missing_transfer_pricing():
    with FIXTURE.open("rb") as f:
        response = client.post(
            "/savings/calculate",
            files={"file": ("sample_consumption.csv", f, "text/csv")},
            data={
                "request": json.dumps(
                    {
                        "lat": 60.17,
                        "lon": 24.94,
                        "monthly_production": [{"month": 1, "kwh": 150.0}],
                        "energy_pricing": {"type": "fixed", "price_cents_per_kwh": 10.0},
                    }
                )
            },
        )
    assert response.status_code == 422


def test_savings_calculate_rejects_malformed_request_json():
    with FIXTURE.open("rb") as f:
        response = client.post(
            "/savings/calculate",
            files={"file": ("sample_consumption.csv", f, "text/csv")},
            data={"request": "not valid json"},
        )
    assert response.status_code == 422


async def _fake_fetch_spot_price_range(start, end):
    from datetime import UTC, datetime, timedelta

    return [
        SpotPriceEntry(timestamp=start + timedelta(hours=h), price_cents_per_kwh=5.0)
        for h in range(int((end - start).total_seconds() // 3600) + 1)
    ]


async def _fake_fetch_spot_price_range_error(start, end):
    raise PricingError("Elering returned 400: Invalid date range")


def test_savings_calculate_spot_price_uses_range_fetch(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setattr(main, "fetch_spot_price_range", _fake_fetch_spot_price_range)

    with FIXTURE.open("rb") as f:
        response = client.post(
            "/savings/calculate",
            files={"file": ("sample_consumption.csv", f, "text/csv")},
            data={"request": _savings_request({"type": "spot", "margin_cents_per_kwh": 0.5})},
        )

    assert response.status_code == 200
    body = response.json()
    assert body["total_consumption_kwh"] > 0


def test_savings_calculate_maps_pricing_error_to_502(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setattr(main, "fetch_spot_price_range", _fake_fetch_spot_price_range_error)

    with FIXTURE.open("rb") as f:
        response = client.post(
            "/savings/calculate",
            files={"file": ("sample_consumption.csv", f, "text/csv")},
            data={"request": _savings_request({"type": "spot"})},
        )

    assert response.status_code == 502
    assert "Invalid date range" in response.json()["detail"]
