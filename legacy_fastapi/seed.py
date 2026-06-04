"""
デバッグ用サンプルデータ投入スクリプト

使い方:
    python seed.py
"""
import asyncio
import random
from datetime import date, datetime, timedelta, timezone

from sqlalchemy import select

from app.database import async_session_maker, create_db_and_tables
from app.models.attendance import Attendance, AttendanceStatus
from app.models.event import Event, EventType
from app.models.mvp_vote import MvpVote
from app.models.season import Season
from app.models.user import User

JST = timezone(timedelta(hours=9))

# ── サンプルユーザー定義 ────────────────────────────────────────────────────
USERS = [
    {"email": "admin@revision.local",   "display_name": "管理者（田中）",  "is_superuser": True},
    {"email": "tanaka@revision.local",  "display_name": "田中 太郎",        "is_superuser": False},
    {"email": "sato@revision.local",    "display_name": "佐藤 次郎",        "is_superuser": False},
    {"email": "suzuki@revision.local",  "display_name": "鈴木 三郎",        "is_superuser": False},
    {"email": "yamada@revision.local",  "display_name": "山田 花子",        "is_superuser": False},
    {"email": "ito@revision.local",     "display_name": "伊藤 健一",        "is_superuser": False},
    {"email": "watanabe@revision.local","display_name": "渡辺 美咲",        "is_superuser": False},
    {"email": "kobayashi@revision.local","display_name":"小林 大輔",        "is_superuser": False},
]

PASSWORD = "password123"

# ── シーズン定義 ────────────────────────────────────────────────────────────
SEASONS = [
    {"name": "2024年前期", "start_date": date(2024, 1, 1), "end_date": date(2024, 6, 30)},
    {"name": "2024年後期", "start_date": date(2024, 7, 1), "end_date": date(2024, 12, 31)},
    {"name": "2025年前期", "start_date": date(2025, 1, 1), "end_date": date(2025, 6, 30)},
]

# ── イベント定義（シーズンインデックス, タイトル, 種別, 場所, 開催日） ──────
EVENTS = [
    # 2024年前期
    (0, "第1回練習",     EventType.practice, "○○フットサルパーク",   datetime(2024, 2, 3,  19, 0, tzinfo=JST)),
    (0, "第2回練習",     EventType.practice, "○○フットサルパーク",   datetime(2024, 2, 17, 19, 0, tzinfo=JST)),
    (0, "春季リーグ戦",  EventType.match,    "△△スポーツセンター",   datetime(2024, 3, 10, 13, 0, tzinfo=JST)),
    (0, "第3回練習",     EventType.practice, "○○フットサルパーク",   datetime(2024, 4, 6,  19, 0, tzinfo=JST)),
    (0, "前期打ち上げ",  EventType.party,    "居酒屋「蹴球」",        datetime(2024, 6, 22, 19, 0, tzinfo=JST)),
    # 2024年後期
    (1, "第4回練習",     EventType.practice, "○○フットサルパーク",   datetime(2024, 8, 24, 19, 0, tzinfo=JST)),
    (1, "秋季リーグ戦",  EventType.match,    "△△スポーツセンター",   datetime(2024, 9, 15, 13, 0, tzinfo=JST)),
    (1, "第5回練習",     EventType.practice, "○○フットサルパーク",   datetime(2024, 10, 5, 19, 0, tzinfo=JST)),
    (1, "年末大会",      EventType.match,    "□□アリーナ",           datetime(2024, 11, 23, 10, 0, tzinfo=JST)),
    (1, "納会",          EventType.party,    "焼肉「シュート」",      datetime(2024, 12, 14, 19, 0, tzinfo=JST)),
    # 2025年前期（直近）
    (2, "第6回練習",     EventType.practice, "○○フットサルパーク",   datetime(2025, 2, 15, 19, 0, tzinfo=JST)),
    (2, "第7回練習",     EventType.practice, "○○フットサルパーク",   datetime(2025, 3, 1,  19, 0, tzinfo=JST)),
    (2, "春季オープン戦",EventType.match,    "△△スポーツセンター",   datetime(2025, 3, 22, 13, 0, tzinfo=JST)),
    (2, "第8回練習",     EventType.practice, "○○フットサルパーク",   datetime(2025, 4, 12, 19, 0, tzinfo=JST)),
    (2, "次回練習（未来）",EventType.practice,"○○フットサルパーク",  datetime(2025, 5, 10, 19, 0, tzinfo=JST)),
]


async def main():
    print("テーブル作成...")
    await create_db_and_tables()

    async with async_session_maker() as session:
        # ── ユーザー作成 ──────────────────────────────────────────────────
        print("ユーザー作成中...")
        from fastapi_users.password import PasswordHelper
        ph = PasswordHelper()
        hashed_pw = ph.hash(PASSWORD)

        created_users: list[User] = []
        for u in USERS:
            existing = (await session.execute(select(User).where(User.email == u["email"]))).scalar_one_or_none()
            if existing:
                print(f"  スキップ（既存）: {u['email']}")
                created_users.append(existing)
                continue
            user = User(
                email=u["email"],
                hashed_password=hashed_pw,
                display_name=u["display_name"],
                is_superuser=u["is_superuser"],
                is_active=True,
                is_verified=True,
            )
            session.add(user)
            created_users.append(user)
            print(f"  作成: {u['email']}")

        await session.flush()

        # ── シーズン作成 ──────────────────────────────────────────────────
        print("シーズン作成中...")
        admin_user = created_users[0]
        created_seasons: list[Season] = []
        for s in SEASONS:
            existing = (await session.execute(select(Season).where(Season.name == s["name"]))).scalar_one_or_none()
            if existing:
                print(f"  スキップ（既存）: {s['name']}")
                created_seasons.append(existing)
                continue
            season = Season(
                name=s["name"],
                start_date=s["start_date"],
                end_date=s["end_date"],
                created_by=admin_user.id,
            )
            session.add(season)
            created_seasons.append(season)
            print(f"  作成: {s['name']}")

        await session.flush()

        # ── イベント作成 + 出欠レコード生成 ──────────────────────────────
        print("イベント・出欠作成中...")
        for season_idx, title, etype, location, event_date in EVENTS:
            existing = (await session.execute(select(Event).where(Event.title == title))).scalar_one_or_none()
            if existing:
                print(f"  スキップ（既存）: {title}")
                continue

            event = Event(
                season_id=created_seasons[season_idx].id,
                title=title,
                event_type=etype,
                location=location,
                event_date=event_date.astimezone(timezone.utc),
                created_by=admin_user.id,
            )
            session.add(event)
            await session.flush()

            # 出欠レコードをランダムに作成
            statuses = (
                [AttendanceStatus.attending] * 5 +
                [AttendanceStatus.absent] * 2 +
                [AttendanceStatus.pending] * 1
            )
            for i, user in enumerate(created_users):
                status = statuses[i % len(statuses)]
                att = Attendance(event_id=event.id, user_id=user.id, status=status)
                session.add(att)

            # 過去のイベントには MVP 投票も作成（practice / match のみ）
            if etype in (EventType.practice, EventType.match) and event_date < datetime.now(JST):
                attending_users = [
                    created_users[i] for i, _ in enumerate(created_users)
                    if statuses[i % len(statuses)] == AttendanceStatus.attending
                ]
                if len(attending_users) >= 2:
                    for voter in attending_users:
                        # 3pt・2pt・1pt をランダムに異なる人に投票
                        candidates = attending_users.copy()
                        random.shuffle(candidates)
                        for pt, votee in zip([3, 2, 1], candidates[:3]):
                            vote = MvpVote(
                                event_id=event.id,
                                voter_id=voter.id,
                                votee_id=votee.id,
                                points=pt,
                            )
                            session.add(vote)

            print(f"  作成: {title}")

        await session.commit()

    print("\n✅ サンプルデータ投入完了！")
    print(f"\nログイン情報（全ユーザー共通パスワード: {PASSWORD}）")
    print("-" * 45)
    for u in USERS:
        role = "管理者" if u["is_superuser"] else "一般"
        print(f"  [{role}] {u['email']}")


if __name__ == "__main__":
    asyncio.run(main())
