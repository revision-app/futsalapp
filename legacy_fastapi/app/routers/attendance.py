"""出欠管理ルーター（HTMX 対応）"""
import uuid

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import HTMLResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import current_active_user
from app.database import get_async_session
from app.models.attendance import Attendance, AttendanceStatus
from app.models.user import User

from app.templates_config import templates

router = APIRouter(prefix="/attendance", tags=["attendance"])


@router.post("/{event_id}/toggle", response_class=HTMLResponse)
async def toggle_attendance(
    event_id: uuid.UUID,
    request: Request,
    session: AsyncSession = Depends(get_async_session),
    current_user: User = Depends(current_active_user),
):
    """HTMX から呼び出される。出欠ステータスをサイクルして HTML フラグメントを返す。"""
    result = await session.execute(
        select(Attendance).where(
            Attendance.event_id == event_id,
            Attendance.user_id == current_user.id,
        )
    )
    att = result.scalar_one_or_none()

    if att is None:
        att = Attendance(event_id=event_id, user_id=current_user.id, status=AttendanceStatus.pending)
        session.add(att)

    # pending → attending → absent → pending
    cycle = {
        AttendanceStatus.pending: AttendanceStatus.attending,
        AttendanceStatus.attending: AttendanceStatus.absent,
        AttendanceStatus.absent: AttendanceStatus.pending,
    }
    att.status = cycle[att.status]
    await session.commit()

    return templates.TemplateResponse(
        "partials/attendance_button.html",
        {"request": request, "att": att, "event_id": event_id},
    )


@router.post("/{event_id}/set/{status}", response_class=HTMLResponse)
async def set_attendance(
    event_id: uuid.UUID,
    status: AttendanceStatus,
    request: Request,
    session: AsyncSession = Depends(get_async_session),
    current_user: User = Depends(current_active_user),
):
    """特定ステータスに直接セット（イベント詳細ページのボタン用）"""
    result = await session.execute(
        select(Attendance).where(
            Attendance.event_id == event_id,
            Attendance.user_id == current_user.id,
        )
    )
    att = result.scalar_one_or_none()

    if att is None:
        att = Attendance(event_id=event_id, user_id=current_user.id, status=status)
        session.add(att)
    else:
        att.status = status

    await session.commit()

    return templates.TemplateResponse(
        "partials/attendance_buttons.html",
        {"request": request, "att": att, "event_id": event_id, "AttendanceStatus": AttendanceStatus},
    )
