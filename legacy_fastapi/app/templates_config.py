"""全ルーターで共有する Jinja2Templates インスタンス"""
from datetime import datetime, timezone, timedelta

from fastapi.templating import Jinja2Templates

templates = Jinja2Templates(directory="app/templates")

JST = timezone(timedelta(hours=9))


def to_jst(dt: datetime) -> datetime:
    """UTC datetime を JST に変換する Jinja2 フィルター"""
    if dt is None:
        return dt
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(JST)


templates.env.filters["to_jst"] = to_jst
