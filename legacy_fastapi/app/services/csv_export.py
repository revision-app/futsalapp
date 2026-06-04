"""出欠・MVP結果のCSVエクスポート"""
import csv
import io
import uuid
from collections import Counter
from datetime import timezone, timedelta

JST = timezone(timedelta(hours=9))

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.attendance import Attendance, AttendanceStatus
from app.models.event import Event
from app.models.mvp_vote import MvpVote
from app.models.season import Season
from app.models.user import User


async def export_attendance_csv(season_id: uuid.UUID, session: AsyncSession) -> str:
    """シーズン内の全イベント × 全ユーザーの出欠CSVを生成する"""
    # イベント一覧
    events_result = await session.execute(
        select(Event)
        .where(Event.season_id == season_id)
        .order_by(Event.event_date)
    )
    events = events_result.scalars().all()

    # アクティブユーザー一覧
    users_result = await session.execute(select(User).where(User.is_active == True).order_by(User.display_name))
    users = users_result.scalars().all()

    # 出欠データを辞書化 {(event_id, user_id): status}
    att_result = await session.execute(
        select(Attendance).where(Attendance.event_id.in_([e.id for e in events]))
    )
    att_map: dict[tuple, str] = {
        (str(a.event_id), str(a.user_id)): a.status.label for a in att_result.scalars().all()
    }

    output = io.StringIO()
    writer = csv.writer(output)

    # ヘッダー行
    header = ["ユーザー名", "メールアドレス"] + [
        f"{e.event_date.astimezone(JST).strftime('%m/%d')} {e.title}" for e in events
    ]
    writer.writerow(header)

    # データ行
    for user in users:
        row = [user.display_name or user.email, user.email]
        for event in events:
            status = att_map.get((str(event.id), str(user.id)), "未登録")
            row.append(status)
        writer.writerow(row)

    return output.getvalue()


async def export_mvp_csv(season_id: uuid.UUID, session: AsyncSession) -> str:
    """シーズン内のMVP投票結果CSVを生成する"""
    events_result = await session.execute(
        select(Event).where(Event.season_id == season_id).order_by(Event.event_date)
    )
    events = events_result.scalars().all()

    votes_result = await session.execute(
        select(MvpVote)
        .where(MvpVote.event_id.in_([e.id for e in events]))
        .options(selectinload(MvpVote.votee))
    )
    votes = votes_result.scalars().all()

    # イベントごとの得票集計
    vote_counts: dict[str, Counter] = {}
    for v in votes:
        eid = str(v.event_id)
        if eid not in vote_counts:
            vote_counts[eid] = Counter()
        vote_counts[eid][v.votee.display_name or v.votee.email] += 1

    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["イベント日", "タイトル", "MVP", "得票数"])

    for event in events:
        eid = str(event.id)
        if eid in vote_counts and vote_counts[eid]:
            top_name, top_count = vote_counts[eid].most_common(1)[0]
            writer.writerow([
                event.event_date.astimezone(JST).strftime("%Y/%m/%d"),
                event.title,
                top_name,
                top_count,
            ])
        else:
            writer.writerow([event.event_date.astimezone(JST).strftime("%Y/%m/%d"), event.title, "（投票なし）", 0])

    return output.getvalue()
