import uuid
from typing import Optional

from fastapi import Depends, Request
from fastapi_users import BaseUserManager, FastAPIUsers, UUIDIDMixin
from fastapi_users.authentication import AuthenticationBackend, CookieTransport, JWTStrategy
from fastapi_users.db import SQLAlchemyUserDatabase
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import get_async_session
from app.models.user import User

# ── Cookie transport (HTTP-only, XSS 対策) ────────────────────────────────────
cookie_transport = CookieTransport(
    cookie_name="futsalapp_token",
    cookie_max_age=60 * 60 * 24 * 30,  # 30 日
    cookie_secure=False,  # 本番では True に変更 (HTTPS 必須)
    cookie_httponly=True,
    cookie_samesite="lax",
)


def get_jwt_strategy() -> JWTStrategy:
    return JWTStrategy(secret=settings.SECRET_KEY, lifetime_seconds=60 * 60 * 24 * 30)


auth_backend = AuthenticationBackend(
    name="jwt_cookie",
    transport=cookie_transport,
    get_strategy=get_jwt_strategy,
)


# ── DB adapter dependency ─────────────────────────────────────────────────────
async def get_user_db(session: AsyncSession = Depends(get_async_session)):
    yield SQLAlchemyUserDatabase(session, User)


# ── UserManager ───────────────────────────────────────────────────────────────
class UserManager(UUIDIDMixin, BaseUserManager[User, uuid.UUID]):
    reset_password_token_secret = settings.SECRET_KEY
    verification_token_secret = settings.SECRET_KEY

    async def on_after_register(self, user: User, request: Optional[Request] = None):
        print(f"ユーザー登録完了: {user.email}")

    async def on_after_forgot_password(
        self, user: User, token: str, request: Optional[Request] = None
    ):
        from app.services.email import send_password_reset_email
        await send_password_reset_email(user.email, token)

    async def on_after_request_verify(
        self, user: User, token: str, request: Optional[Request] = None
    ):
        from app.services.email import send_verification_email
        await send_verification_email(user.email, token)


async def get_user_manager(user_db=Depends(get_user_db)):
    yield UserManager(user_db)


# ── FastAPIUsers instance ─────────────────────────────────────────────────────
fastapi_users = FastAPIUsers[User, uuid.UUID](get_user_manager, [auth_backend])

current_active_user = fastapi_users.current_user(active=True)
current_admin_user = fastapi_users.current_user(active=True, superuser=True)


async def optional_current_user(request: Request) -> Optional[User]:
    """ログインしていない場合は None を返す（ページ表示用）"""
    try:
        return await fastapi_users.current_user(active=True, optional=True)(request)
    except Exception:
        return None
