from pathlib import Path

from fastapi.testclient import TestClient

from app.main import app

FIXTURE = Path(__file__).parent / "fixtures" / "sample_consumption.csv"

client = TestClient(app)


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
