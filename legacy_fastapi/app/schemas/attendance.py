import uuid

from pydantic import BaseModel

from app.models.attendance import AttendanceStatus


class AttendanceUpdate(BaseModel):
    status: AttendanceStatus


class AttendanceRead(BaseModel):
    id: uuid.UUID
    event_id: uuid.UUID
    user_id: uuid.UUID
    status: AttendanceStatus

    model_config = {"from_attributes": True}
