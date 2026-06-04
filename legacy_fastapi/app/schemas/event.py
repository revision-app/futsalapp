import uuid
from datetime import datetime

from pydantic import BaseModel

from app.models.event import EventType


class EventCreate(BaseModel):
    season_id: uuid.UUID
    title: str
    event_type: EventType
    location: str = ""
    event_date: datetime


class EventUpdate(BaseModel):
    title: str | None = None
    event_type: EventType | None = None
    location: str | None = None
    event_date: datetime | None = None


class EventRead(BaseModel):
    id: uuid.UUID
    season_id: uuid.UUID
    title: str
    event_type: EventType
    location: str
    event_date: datetime
    created_by: uuid.UUID

    model_config = {"from_attributes": True}
