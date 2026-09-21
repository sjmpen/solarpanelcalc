import json
from pathlib import Path

import httpx
import pytest

from app.pvgis import PvgisError, SolarSystemParams, fetch_solar_production

FIXTURE = Path(__file__).parent / "fixtures" / "pvgis_response.json"


class _StubAsyncClient:
    def __init__(self, response: httpx.Response):
        self._response = response

    async def __aenter__(self) -> "_StubAsyncClient":
        return self

    async def __aexit__(self, *exc_info: object) -> None:
        return None

    async def get(self, url: str, params: dict | None = None, timeout: float | None = None) -> httpx.Response:
        return self._response


def stub_client(response: httpx.Response):
    def factory(*args: object, **kwargs: object) -> _StubAsyncClient:
        return _StubAsyncClient(response)

    return factory


@pytest.fixture
def system_params() -> SolarSystemParams:
    return SolarSystemParams(peak_power_kw=5.0, tilt_degrees=40, azimuth_degrees=0)


async def test_parses_pvgis_response(monkeypatch: pytest.MonkeyPatch, system_params: SolarSystemParams):
    payload = json.loads(FIXTURE.read_text())
    monkeypatch.setattr("app.pvgis.httpx.AsyncClient", stub_client(httpx.Response(200, json=payload)))

    estimate = await fetch_solar_production(60.17, 24.94, system_params)

    assert estimate.annual_kwh == pytest.approx(1732.47)
    assert len(estimate.monthly) == 12
    assert estimate.monthly[0].month == 1
    assert estimate.monthly[0].kwh == pytest.approx(31.62)
    assert estimate.monthly[-1].month == 12


async def test_raises_pvgis_error_on_non_200(
    monkeypatch: pytest.MonkeyPatch, system_params: SolarSystemParams
):
    response = httpx.Response(400, json={"message": "Location outside coverage"})
    monkeypatch.setattr("app.pvgis.httpx.AsyncClient", stub_client(response))

    with pytest.raises(PvgisError, match="Location outside coverage"):
        await fetch_solar_production(0.0, 0.0, system_params)


async def test_raises_pvgis_error_on_unexpected_shape(
    monkeypatch: pytest.MonkeyPatch, system_params: SolarSystemParams
):
    response = httpx.Response(200, json={"outputs": {}})
    monkeypatch.setattr("app.pvgis.httpx.AsyncClient", stub_client(response))

    with pytest.raises(PvgisError, match="Unexpected PVGIS response shape"):
        await fetch_solar_production(60.17, 24.94, system_params)
