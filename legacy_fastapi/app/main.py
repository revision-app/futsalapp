"""FastAPI エントリーポイント"""
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.exceptions import HTTPException
from fastapi.responses import JSONResponse, RedirectResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates

from app.auth import auth_backend, fastapi_users
from app.database import create_db_and_tables
from app.routers import admin, attendance, auth_pages, events, mvp
from app.schemas.user import UserCreate, UserRead, UserUpdate


@asynccontextmanager
async def lifespan(app: FastAPI):
    # 起動時にテーブルを作成（Alembic 未実行でも動作するように）
    await create_db_and_tables()
    yield


app = FastAPI(
    title="フットサルアプリ",
    description="フットサルチームの出欠・MVP管理Webアプリ",
    version="1.0.0",
    lifespan=lifespan,
)

# ── 静的ファイル ──────────────────────────────────────────────────────────────
app.mount("/static", StaticFiles(directory="app/static"), name="static")

# ── 401 → ログインページへリダイレクト ────────────────────────────────────────
@app.exception_handler(401)
async def unauthorized_handler(request: Request, exc: HTTPException):
    # API エンドポイント（/api/...）は JSON のまま返す
    if request.url.path.startswith("/api/"):
        return JSONResponse(status_code=401, content={"detail": "Unauthorized"})
    return RedirectResponse(url="/auth/login", status_code=302)

# ── FastAPI-Users ルーター ────────────────────────────────────────────────────
# JSON API エンドポイント（認証・ユーザー管理）
app.include_router(
    fastapi_users.get_auth_router(auth_backend),
    prefix="/api/auth/jwt",
    tags=["auth-api"],
)
app.include_router(
    fastapi_users.get_register_router(UserRead, UserCreate),
    prefix="/api/auth",
    tags=["auth-api"],
)
app.include_router(
    fastapi_users.get_reset_password_router(),
    prefix="/api/auth",
    tags=["auth-api"],
)
app.include_router(
    fastapi_users.get_verify_router(UserRead),
    prefix="/api/auth",
    tags=["auth-api"],
)
app.include_router(
    fastapi_users.get_users_router(UserRead, UserUpdate),
    prefix="/api/users",
    tags=["users-api"],
)

# ── アプリケーションルーター ──────────────────────────────────────────────────
app.include_router(auth_pages.router)
app.include_router(events.router)
app.include_router(attendance.router)
app.include_router(mvp.router)
app.include_router(admin.router)


# ── ヘルスチェック ────────────────────────────────────────────────────────────
@app.get("/health")
async def health():
    return {"status": "ok"}


# ── Cron Job エンドポイント（リマインドメール）──────────────────────────────────
@app.post("/cron/reminders")
async def run_reminders(request: Request):
    """Railway Cron Job から呼び出される。秘密ヘッダーで保護。"""
    from app.config import settings

    auth_header = request.headers.get("X-Cron-Secret")
    if auth_header != settings.ADMIN_INVITE_SECRET:
        return JSONResponse(status_code=403, content={"detail": "Forbidden"})

    from app.services.reminder import send_tomorrow_reminders
    sent = await send_tomorrow_reminders()
    return {"sent": sent}
