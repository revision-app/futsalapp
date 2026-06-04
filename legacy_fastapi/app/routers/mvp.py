"""MVP 投票ルーター（ポイント制: 3pt / 2pt / 1pt）"""
import uuid
from collections import defaultdict

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import HTMLResponse, RedirectResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.auth import current_active_user
from app.database import get_async_session
from app.models.attendance import Attendance, AttendanceStatus
from app.models.event import Event
from app.models.mvp_vote import MvpVote
from app.models.user import User
from app.templates_config import templates

router = APIRouter(prefix="/mvp", tags=["mvp"])


@router.get("/{event_id}", response_class=HTMLResponse)
async def mvp_vote_page(
    event_id: uuid.UUID,
    request: Request,
    session: AsyncSession = Depends(get_async_session),
    current_user: User = Depends(current_active_user),
):
    event = await session.get(Event, event_id)
    if not event:
        raise HTTPException(status_code=404)

    # 参加者一覧（attending のみ）
    att_result = await session.execute(
        select(Attendance)
        .where(Attendance.event_id == event_id, Attendance.status == AttendanceStatus.attending)
        .options(selectinload(Attendance.user))
    )
    attendees = [a.user for a in att_result.scalars().all()]

    # 自分の投票（ポイント別）
    my_votes_result = await session.execute(
        select(MvpVote).where(MvpVote.event_id == event_id, MvpVote.voter_id == current_user.id)
    )
    my_votes = {v.points: v for v in my_votes_result.scalars().all()}

    return templates.TemplateResponse(
        "mvp/vote.html",
        {
            "request": request,
            "event": event,
            "attendees": attendees,
            "my_votes": my_votes,  # {3: MvpVote, 2: MvpVote, 1: MvpVote}
            "current_user": current_user,
        },
    )


@router.post("/{event_id}/vote", response_class=HTMLResponse)
async def submit_vote(
    event_id: uuid.UUID,
    request: Request,
    session: AsyncSession = Depends(get_async_session),
    current_user: User = Depends(current_active_user),
):
    form = await request.form()
    # フォームから各ポイントの投票先を取得（空文字は未選択）
    selections: dict[int, uuid.UUID | None] = {}
    for pt in [3, 2, 1]:
        val = form.get(f"votee_{pt}pt", "")
        selections[pt] = uuid.UUID(str(val)) if val else None

    # 1件以上の投票が必要
    if not any(selections.values()):
        raise HTTPException(status_code=400, detail="1件以上投票してください")

    # 同一人物への重複ポイントチェック
    voted_ids = [v for v in selections.values() if v is not None]
    if len(voted_ids) != len(set(voted_ids)):
        raise HTTPException(status_code=400, detail="同じ人に複数のポイントを投票することはできません")

    # 既存の投票を取得
    existing_result = await session.execute(
        select(MvpVote).where(MvpVote.event_id == event_id, MvpVote.voter_id == current_user.id)
    )
    existing_map = {v.points: v for v in existing_result.scalars().all()}

    for pt, votee_id in selections.items():
        if votee_id is None:
            # 未選択 → 既存の投票があれば削除
            if pt in existing_map:
                await session.delete(existing_map[pt])
        else:
            if pt in existing_map:
                # 既存を上書き
                existing_map[pt].votee_id = votee_id
            else:
                # 新規作成
                vote = MvpVote(
                    event_id=event_id,
                    voter_id=current_user.id,
                    votee_id=votee_id,
                    points=pt,
                )
                session.add(vote)

    await session.commit()
    return RedirectResponse(f"/mvp/{event_id}/results", status_code=302)


@router.get("/{event_id}/results", response_class=HTMLResponse)
async def mvp_results(
    event_id: uuid.UUID,
    request: Request,
    session: AsyncSession = Depends(get_async_session),
    current_user: User = Depends(current_active_user),
):
    event = await session.get(Event, event_id)
    if not event:
        raise HTTPException(status_code=404)

    votes_result = await session.execute(
        select(MvpVote)
        .where(MvpVote.event_id == event_id)
        .options(selectinload(MvpVote.votee))
    )
    votes = votes_result.scalars().all()

    # ポイント集計
    totals: dict[uuid.UUID, int] = defaultdict(int)
    pt_counts: dict[uuid.UUID, dict[int, int]] = defaultdict(lambda: {3: 0, 2: 0, 1: 0})
    votee_map: dict[uuid.UUID, User] = {}
    for v in votes:
        totals[v.votee_id] += v.points
        pt_counts[v.votee_id][v.points] += 1
        votee_map[v.votee_id] = v.votee

    ranked = sorted(
        [
            {
                "user": votee_map[uid],
                "total": total,
                "pt3": pt_counts[uid][3],
                "pt2": pt_counts[uid][2],
                "pt1": pt_counts[uid][1],
            }
            for uid, total in totals.items()
        ],
        key=lambda x: (-x["total"], -x["pt3"], -x["pt2"]),
    )

    my_votes_result = await session.execute(
        select(MvpVote).where(MvpVote.event_id == event_id, MvpVote.voter_id == current_user.id)
    )
    my_votes = {v.points: v for v in my_votes_result.scalars().all()}

    return templates.TemplateResponse(
        "mvp/results.html",
        {
            "request": request,
            "event": event,
            "ranked": ranked,
            "my_votes": my_votes,
            "total_voters": len({v.voter_id for v in votes}),
            "current_user": current_user,
        },
    )
