from fastapi import FastAPI, HTTPException, UploadFile

from app.csv_parser import InvalidConsumptionCsv, parse_fingrid_csv, summarize
from app.models import ConsumptionSummary

app = FastAPI(title="solarpanelcalc")


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
