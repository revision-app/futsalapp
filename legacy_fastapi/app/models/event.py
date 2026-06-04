import enum
import uuid
from datetime import datetime

from sqlalchemy import DateTime, Enum, ForeignKey, String, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class EventType(str, enum.Enum):
    practice = "practice"
    match = "match"
    party = "party"

    @property
    def label(self) -> str:
        labels = {
            "practice": "練習",
            "match": "試合",
            "party": "飲み会",
        }
        return labels[self.value]


class Event(Base):
    __tablename__ = "events"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    season_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("seasons.id"), nullable=False)
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    event_type: Mapped[EventType] = mapped_column(Enum(EventType), nullable=False)
    location: Mapped[str] = mapped_column(String(200), nullable=False, default="")
    event_date: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    created_by: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    season: Mapped["Season"] = relationship("Season", back_populates="events")  # type: ignore[name-defined]
    attendances: Mapped[list["Attendance"]] = relationship("Attendance", back_populates="event", cascade="all, delete-orphan")  # type: ignore[name-defined]
    mvp_votes: Mapped[list["MvpVote"]] = relationship("MvpVote", back_populates="event", cascade="all, delete-orphan")  # type: ignore[name-defined]
