from datetime import datetime

from pydantic import BaseModel


class Reading(BaseModel):
    timestamp: datetime
    kwh: float
    quality_ok: bool


class ConsumptionSummary(BaseModel):
    reading_count: int
    start: datetime
    end: datetime
    total_kwh: float
    average_daily_kwh: float
    flagged_reading_count: int
