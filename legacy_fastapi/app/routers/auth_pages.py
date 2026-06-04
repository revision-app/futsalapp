"""認証関連の HTML ページルーター（Jinja2 テンプレートを返す）"""
from typing import Optional

from fastapi import APIRouter, Depends, Request, Form, HTTPException
from fastapi.responses import HTMLResponse, RedirectResponse
from itsdangerous import BadSignature, SignatureExpired, URLSafeTimedSerializer
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import optional_current_user
from app.config import settings
from app.database import get_async_session
from app.models.user import User
from app.services.email import send_admin_invite_email
from app.templates_config import templates

router = APIRouter(tags=["auth-pages"])

_invite_serializer = URLSafeTimedSerializer(settings.ADMIN_INVITE_SECRET)


@router.get("/", response_class=HTMLResponse)
async def home(request: Request, current_user: Optional[User] = Depends(optional_current_user)):
    if current_user:
        return RedirectResponse("/events", status_code=302)
    return RedirectResponse("/auth/login", status_code=302)


@router.get("/auth/login", response_class=HTMLResponse)
async def login_page(request: Request, current_user: Optional[User] = Depends(optional_current_user)):
    if current_user:
        return RedirectResponse("/events", status_code=302)
    return templates.TemplateResponse("auth/login.html", {"request": request})


@router.get("/auth/register", response_class=HTMLResponse)
async def register_page(request: Request, invite: Optional[str] = None):
    """invite トークンが付いていれば管理者登録ページ"""
    is_admin_invite = False
    invite_email = ""
    if invite:
        try:
            invite_email = _invite_serializer.loads(invite, max_age=86400)
            is_admin_invite = True
        except (BadSignature, SignatureExpired):
            pass
    return templates.TemplateResponse(
        "auth/register.html",
        {"request": request, "is_admin_invite": is_admin_invite, "invite_email": invite_email, "invite_token": invite or ""},
    )


@router.get("/auth/forgot-password", response_class=HTMLResponse)
async def forgot_password_page(request: Request):
    return templates.TemplateResponse("auth/forgot_password.html", {"request": request})


@router.get("/auth/reset-password", response_class=HTMLResponse)
async def reset_password_page(request: Request, token: str = ""):
    return templates.TemplateResponse("auth/reset_password.html", {"request": request, "token": token})


@router.get("/auth/verify", response_class=HTMLResponse)
async def verify_page(request: Request, token: str = ""):
    return templates.TemplateResponse("auth/verify.html", {"request": request, "token": token})


@router.post("/admin/invite", response_class=HTMLResponse)
async def send_invite(
    request: Request,
    email: str = Form(...),
    session: AsyncSession = Depends(get_async_session),
    current_user: User = Depends(optional_current_user),
):
    if not current_user or not current_user.is_superuser:
        raise HTTPException(status_code=403)

    token = _invite_serializer.dumps(email)
    invite_url = f"{settings.BASE_URL}/auth/register?invite={token}"
    await send_admin_invite_email(email, invite_url)

    return templates.TemplateResponse(
        "admin/users.html",
        {"request": request, "current_user": current_user, "flash": f"{email} に招待メールを送信しました"},
    )
