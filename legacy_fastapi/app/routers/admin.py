"""管理者ルーター"""
import uuid
from typing import Optional

from fastapi import APIRouter, Depends, Form, HTTPException, Request
from fastapi.responses import HTMLResponse, RedirectResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import current_admin_user, get_user_manager
from app.database import get_async_session
from app.models.user import User

from app.templates_config import templates

router = APIRouter(prefix="/admin", tags=["admin"])


@router.get("/dashboard", response_class=HTMLResponse)
async def admin_dashboard(
    request: Request,
    session: AsyncSession = Depends(get_async_session),
    current_user: User = Depends(current_admin_user),
):
    from app.models.event import Event
    from app.models.season import Season
    from sqlalchemy import func

    user_count = (await session.execute(select(func.count()).select_from(User).where(User.is_active == True))).scalar()
    event_count = (await session.execute(select(func.count()).select_from(Event))).scalar()
    season_count = (await session.execute(select(func.count()).select_from(Season))).scalar()

    return templates.TemplateResponse(
        "admin/dashboard.html",
        {
            "request": request,
            "current_user": current_user,
            "user_count": user_count,
            "event_count": event_count,
            "season_count": season_count,
        },
    )


@router.get("/users", response_class=HTMLResponse)
async def user_list(
    request: Request,
    session: AsyncSession = Depends(get_async_session),
    current_user: User = Depends(current_admin_user),
):
    result = await session.execute(select(User).order_by(User.created_at.desc()))
    users = result.scalars().all()
    return templates.TemplateResponse(
        "admin/users.html",
        {"request": request, "users": users, "current_user": current_user},
    )


@router.post("/users/{user_id}/toggle-admin")
async def toggle_admin(
    user_id: uuid.UUID,
    session: AsyncSession = Depends(get_async_session),
    current_user: User = Depends(current_admin_user),
):
    user = await session.get(User, user_id)
    if not user:
        raise HTTPException(status_code=404)
    if user.id == current_user.id:
        raise HTTPException(status_code=400, detail="自分の管理者権限は変更できません")
    user.is_superuser = not user.is_superuser
    await session.commit()
    return RedirectResponse("/admin/users", status_code=302)


@router.post("/users/{user_id}/toggle-active")
async def toggle_active(
    user_id: uuid.UUID,
    session: AsyncSession = Depends(get_async_session),
    current_user: User = Depends(current_admin_user),
):
    user = await session.get(User, user_id)
    if not user:
        raise HTTPException(status_code=404)
    if user.id == current_user.id:
        raise HTTPException(status_code=400, detail="自分のアカウントは無効化できません")
    user.is_active = not user.is_active
    await session.commit()
    return RedirectResponse("/admin/users", status_code=302)


@router.get("/invite", response_class=HTMLResponse)
async def invite_page(
    request: Request,
    current_user: User = Depends(current_admin_user),
):
    return templates.TemplateResponse(
        "admin/invite.html",
        {"request": request, "current_user": current_user},
    )


@router.post("/invite")
async def send_invite(
    request: Request,
    email: str = Form(...),
    current_user: User = Depends(current_admin_user),
):
    from app.config import settings
    from app.services.email import send_admin_invite_email
    from itsdangerous import URLSafeTimedSerializer

    serializer = URLSafeTimedSerializer(settings.ADMIN_INVITE_SECRET)
    token = serializer.dumps(email)
    invite_url = f"{settings.BASE_URL}/auth/register?invite={token}"
    await send_admin_invite_email(email, invite_url)

    return templates.TemplateResponse(
        "admin/invite.html",
        {"request": request, "current_user": current_user, "flash": f"{email} に招待メールを送信しました"},
    )
