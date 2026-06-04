"""イベント・シーズン管理ルーター"""
import uuid
from typing import Optional

from fastapi import APIRouter, Depends, Form, HTTPException, Request
from fastapi.responses import HTMLResponse, RedirectResponse, StreamingResponse
from app.templates_config import templates
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.auth import current_active_user, optional_current_user
from app.database import get_async_session
from app.models.attendance import Attendance, AttendanceStatus
from app.models.event import Event, EventType
from app.models.season import Season
from app.models.user import User
from app.services.csv_export import export_attendance_csv, export_mvp_csv

router = APIRouter(tags=["events"])


# ─── シーズン ───────────────────────────────────────────────────────────────

@router.get("/seasons", response_class=HTMLResponse)
async def season_list(
    request: Request,
    session: AsyncSession = Depends(get_async_session),
    current_user: User = Depends(current_active_user),
):
    result = await session.execute(select(Season).order_by(Season.start_date.desc()))
    seasons = result.scalars().all()
    return templates.TemplateResponse(
        "seasons/list.html", {"request": request, "seasons": seasons, "current_user": current_user}
    )


@router.get("/seasons/new", response_class=HTMLResponse)
async def new_season_form(
    request: Request,
    current_user: User = Depends(current_active_user),
):
    if not current_user.is_superuser:
        raise HTTPException(status_code=403)
    return templates.TemplateResponse("seasons/form.html", {"request": request, "current_user": current_user, "season": None})


@router.post("/seasons/new")
async def create_season(
    request: Request,
    name: str = Form(...),
    start_date: str = Form(...),
    end_date: str = Form(...),
    session: AsyncSession = Depends(get_async_session),
    current_user: User = Depends(current_active_user),
):
    if not current_user.is_superuser:
        raise HTTPException(status_code=403)
    from datetime import date
    season = Season(
        name=name,
        start_date=date.fromisoformat(start_date),
        end_date=date.fromisoformat(end_date),
        created_by=current_user.id,
    )
    session.add(season)
    await session.commit()
    return RedirectResponse("/seasons", status_code=302)


@router.get("/seasons/{season_id}/edit", response_class=HTMLResponse)
async def edit_season_form(
    season_id: uuid.UUID,
    request: Request,
    session: AsyncSession = Depends(get_async_session),
    current_user: User = Depends(current_active_user),
):
    if not current_user.is_superuser:
        raise HTTPException(status_code=403)
    season = await session.get(Season, season_id)
    if not season:
        raise HTTPException(status_code=404)
    return templates.TemplateResponse("seasons/form.html", {"request": request, "current_user": current_user, "season": season})


@router.post("/seasons/{season_id}/edit")
async def update_season(
    season_id: uuid.UUID,
    name: str = Form(...),
    start_date: str = Form(...),
    end_date: str = Form(...),
    session: AsyncSession = Depends(get_async_session),
    current_user: User = Depends(current_active_user),
):
    if not current_user.is_superuser:
        raise HTTPException(status_code=403)
    season = await session.get(Season, season_id)
    if not season:
        raise HTTPException(status_code=404)
    from datetime import date
    season.name = name
    season.start_date = date.fromisoformat(start_date)
    season.end_date = date.fromisoformat(end_date)
    await session.commit()
    return RedirectResponse("/seasons", status_code=302)


@router.get("/seasons/{season_id}/export/attendance")
async def export_season_attendance(
    season_id: uuid.UUID,
    session: AsyncSession = Depends(get_async_session),
    current_user: User = Depends(current_active_user),
):
    if not current_user.is_superuser:
        raise HTTPException(status_code=403)
    csv_data = await export_attendance_csv(season_id, session)
    return StreamingResponse(
        iter([csv_data.encode("utf-8-sig")]),
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename=attendance_{season_id}.csv"},
    )


@router.get("/seasons/{season_id}/export/mvp")
async def export_season_mvp(
    season_id: uuid.UUID,
    session: AsyncSession = Depends(get_async_session),
    current_user: User = Depends(current_active_user),
):
    if not current_user.is_superuser:
        raise HTTPException(status_code=403)
    csv_data = await export_mvp_csv(season_id, session)
    return StreamingResponse(
        iter([csv_data.encode("utf-8-sig")]),
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename=mvp_{season_id}.csv"},
    )


# ─── イベント ───────────────────────────────────────────────────────────────

@router.get("/events", response_class=HTMLResponse)
async def event_list(
    request: Request,
    season_id: Optional[uuid.UUID] = None,
    session: AsyncSession = Depends(get_async_session),
    current_user: User = Depends(current_active_user),
):
    query = select(Event).order_by(Event.event_date.asc())
    if season_id:
        query = query.where(Event.season_id == season_id)
    result = await session.execute(query.options(selectinload(Event.season)))
    events = result.scalars().all()

    seasons_result = await session.execute(select(Season).order_by(Season.start_date.desc()))
    seasons = seasons_result.scalars().all()

    # 自分の出欠状況を一括取得
    att_result = await session.execute(
        select(Attendance).where(
            Attendance.user_id == current_user.id,
            Attendance.event_id.in_([e.id for e in events]),
        )
    )
    att_map = {a.event_id: a for a in att_result.scalars().all()}

    return templates.TemplateResponse(
        "events/list.html",
        {
            "request": request,
            "events": events,
            "seasons": seasons,
            "att_map": att_map,
            "current_user": current_user,
            "selected_season_id": season_id,
            "AttendanceStatus": AttendanceStatus,
        },
    )


@router.get("/events/new", response_class=HTMLResponse)
async def new_event_form(
    request: Request,
    session: AsyncSession = Depends(get_async_session),
    current_user: User = Depends(current_active_user),
):
    if not current_user.is_superuser:
        raise HTTPException(status_code=403)
    seasons_result = await session.execute(select(Season).order_by(Season.start_date.desc()))
    seasons = seasons_result.scalars().all()
    return templates.TemplateResponse(
        "events/form.html",
        {"request": request, "current_user": current_user, "event": None, "seasons": seasons, "EventType": EventType},
    )


@router.post("/events/new")
async def create_event(
    season_id: str = Form(...),
    title: str = Form(...),
    event_type: str = Form(...),
    location: str = Form(""),
    event_date: str = Form(...),
    session: AsyncSession = Depends(get_async_session),
    current_user: User = Depends(current_active_user),
):
    if not current_user.is_superuser:
        raise HTTPException(status_code=403)
    from datetime import datetime, timezone, timedelta
    JST = timezone(timedelta(hours=9))
    event = Event(
        season_id=uuid.UUID(season_id),
        title=title,
        event_type=EventType(event_type),
        location=location,
        event_date=datetime.fromisoformat(event_date).replace(tzinfo=JST).astimezone(timezone.utc),
        created_by=current_user.id,
    )
    session.add(event)
    await session.flush()

    # 全アクティブユーザーの出欠レコードを作成（pending）
    users_result = await session.execute(select(User).where(User.is_active == True))
    for user in users_result.scalars().all():
        att = Attendance(event_id=event.id, user_id=user.id, status=AttendanceStatus.pending)
        session.add(att)

    await session.commit()
    return RedirectResponse(f"/events/{event.id}", status_code=302)


@router.get("/events/{event_id}", response_class=HTMLResponse)
async def event_detail(
    event_id: uuid.UUID,
    request: Request,
    session: AsyncSession = Depends(get_async_session),
    current_user: User = Depends(current_active_user),
):
    event = await session.get(
        Event,
        event_id,
        options=[
            selectinload(Event.attendances).selectinload(Attendance.user),
            selectinload(Event.season),
        ],
    )
    if not event:
        raise HTTPException(status_code=404)

    # 自分の出欠
    my_att = next((a for a in event.attendances if a.user_id == current_user.id), None)

    # 参加者カウント
    attending = [a for a in event.attendances if a.status == AttendanceStatus.attending]
    absent = [a for a in event.attendances if a.status == AttendanceStatus.absent]
    pending = [a for a in event.attendances if a.status == AttendanceStatus.pending]

    return templates.TemplateResponse(
        "events/detail.html",
        {
            "request": request,
            "event": event,
            "my_att": my_att,
            "attending": attending,
            "absent": absent,
            "pending": pending,
            "current_user": current_user,
            "AttendanceStatus": AttendanceStatus,
        },
    )


@router.get("/events/{event_id}/edit", response_class=HTMLResponse)
async def edit_event_form(
    event_id: uuid.UUID,
    request: Request,
    session: AsyncSession = Depends(get_async_session),
    current_user: User = Depends(current_active_user),
):
    if not current_user.is_superuser:
        raise HTTPException(status_code=403)
    event = await session.get(Event, event_id)
    if not event:
        raise HTTPException(status_code=404)
    seasons_result = await session.execute(select(Season).order_by(Season.start_date.desc()))
    seasons = seasons_result.scalars().all()
    return templates.TemplateResponse(
        "events/form.html",
        {"request": request, "current_user": current_user, "event": event, "seasons": seasons, "EventType": EventType},
    )


@router.post("/events/{event_id}/edit")
async def update_event(
    event_id: uuid.UUID,
    season_id: str = Form(...),
    title: str = Form(...),
    event_type: str = Form(...),
    location: str = Form(""),
    event_date: str = Form(...),
    session: AsyncSession = Depends(get_async_session),
    current_user: User = Depends(current_active_user),
):
    if not current_user.is_superuser:
        raise HTTPException(status_code=403)
    event = await session.get(Event, event_id)
    if not event:
        raise HTTPException(status_code=404)
    from datetime import datetime, timezone, timedelta
    JST = timezone(timedelta(hours=9))
    event.season_id = uuid.UUID(season_id)
    event.title = title
    event.event_type = EventType(event_type)
    event.location = location
    event.event_date = datetime.fromisoformat(event_date).replace(tzinfo=JST).astimezone(timezone.utc)
    await session.commit()
    return RedirectResponse(f"/events/{event_id}", status_code=302)


@router.post("/events/{event_id}/delete")
async def delete_event(
    event_id: uuid.UUID,
    session: AsyncSession = Depends(get_async_session),
    current_user: User = Depends(current_active_user),
):
    if not current_user.is_superuser:
        raise HTTPException(status_code=403)
    event = await session.get(Event, event_id)
    if not event:
        raise HTTPException(status_code=404)
    await session.delete(event)
    await session.commit()
    return RedirectResponse("/events", status_code=302)
