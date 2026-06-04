import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Integer, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class MvpVote(Base):
    __tablename__ = "mvp_votes"
    # voter_id + event_id + points の組み合わせで一意（同一ポイントは1人まで）
    __table_args__ = (UniqueConstraint("event_id", "voter_id", "points", name="uq_mvp_vote_event_voter_points"),)

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    event_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("events.id"), nullable=False)
    voter_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"), nullable=False)
    votee_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"), nullable=False)
    points: Mapped[int] = mapped_column(Integer, nullable=False)  # 1, 2, 3
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    event: Mapped["Event"] = relationship("Event", back_populates="mvp_votes")  # type: ignore[name-defined]
    voter: Mapped["User"] = relationship("User", foreign_keys=[voter_id])  # type: ignore[name-defined]
    votee: Mapped["User"] = relationship("User", foreign_keys=[votee_id])  # type: ignore[name-defined]
