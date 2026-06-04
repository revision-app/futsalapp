"""Cron Job から呼び出されるリマインドメール処理"""
from datetime import date, timedelta

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.database import async_session_maker
from app.models.attendance import Attendance, AttendanceStatus
from app.models.event import Event
from app.models.user import User
from app.services.email import send_event_reminder
from app.config import settings


async def send_tomorrow_reminders() -> int:
    """明日のイベントの出欠未回答ユーザーにリマインドメールを送信する。送信数を返す。"""
    tomorrow = date.today() + timedelta(days=1)

    async with async_session_maker() as session:
        # 明日のイベントを取得
        result = await session.execute(
            select(Event)
            .where(
                Event.event_date >= tomorrow,
                Event.event_date < tomorrow + timedelta(days=1),
            )
            .options(selectinload(Event.attendances).selectinload(Attendance.user))
        )
        events = result.scalars().all()

        sent_count = 0
        for event in events:
            for attendance in event.attendances:
                if attendance.status == AttendanceStatus.pending:
                    user = attendance.user
                    if user.is_active:
                        event_url = f"{settings.BASE_URL}/events/{event.id}"
                        await send_event_reminder(
                            email=user.email,
                            display_name=user.display_name or user.email,
                            event_title=event.title,
                            event_url=event_url,
                        )
                        sent_count += 1

        return sent_count
