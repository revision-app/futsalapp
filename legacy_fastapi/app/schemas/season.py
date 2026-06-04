import uuid
from datetime import date

from pydantic import BaseModel, field_validator


class SeasonCreate(BaseModel):
    name: str
    start_date: date
    end_date: date

    @field_validator("end_date")
    @classmethod
    def end_after_start(cls, v: date, info) -> date:
        if "start_date" in info.data and v < info.data["start_date"]:
            raise ValueError("終了日は開始日以降にしてください")
        return v


class SeasonUpdate(BaseModel):
    name: str | None = None
    start_date: date | None = None
    end_date: date | None = None


class SeasonRead(BaseModel):
    id: uuid.UUID
    name: str
    start_date: date
    end_date: date
    created_by: uuid.UUID

    model_config = {"from_attributes": True}
