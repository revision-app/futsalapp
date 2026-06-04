"""SendGrid を使ったメール送信サービス"""
import sendgrid
from sendgrid.helpers.mail import Mail

from app.config import settings


def _send(to_email: str, subject: str, html_content: str) -> None:
    if not settings.SENDGRID_API_KEY:
        print(f"[DEV] メール送信スキップ（SENDGRID_API_KEY未設定）")
        print(f"  宛先: {to_email}")
        print(f"  件名: {subject}")
        return

    sg = sendgrid.SendGridAPIClient(api_key=settings.SENDGRID_API_KEY)
    message = Mail(
        from_email=settings.SENDGRID_FROM_EMAIL,
        to_emails=to_email,
        subject=subject,
        html_content=html_content,
    )
    sg.send(message)


async def send_verification_email(email: str, token: str) -> None:
    verify_url = f"{settings.BASE_URL}/auth/verify?token={token}"
    html = f"""
    <p>REVISIONへの登録ありがとうございます。</p>
    <p>以下のリンクをクリックしてメールアドレスを確認してください。</p>
    <p><a href="{verify_url}">{verify_url}</a></p>
    <p>このリンクは24時間有効です。</p>
    """
    _send(email, "【REVISION】メールアドレスの確認", html)


async def send_password_reset_email(email: str, token: str) -> None:
    reset_url = f"{settings.BASE_URL}/auth/reset-password?token={token}"
    html = f"""
    <p>パスワードリセットのリクエストを受け付けました。</p>
    <p>以下のリンクをクリックして新しいパスワードを設定してください。</p>
    <p><a href="{reset_url}">{reset_url}</a></p>
    <p>このリンクは1時間有効です。リクエストに心当たりがない場合は無視してください。</p>
    """
    _send(email, "【REVISION】パスワードリセット", html)


async def send_event_reminder(email: str, display_name: str, event_title: str, event_url: str) -> None:
    html = f"""
    <p>{display_name} さん、こんにちは。</p>
    <p>明日のイベントのお知らせです。</p>
    <p><strong>{event_title}</strong></p>
    <p>出欠を回答していない場合は、以下のリンクから登録をお願いします。</p>
    <p><a href="{event_url}">{event_url}</a></p>
    """
    _send(email, f"【REVISION】明日のイベントリマインド: {event_title}", html)


async def send_admin_invite_email(email: str, invite_url: str) -> None:
    html = f"""
    <p>REVISIONの管理者として招待されました。</p>
    <p>以下のリンクからアカウントを作成してください。</p>
    <p><a href="{invite_url}">{invite_url}</a></p>
    <p>このリンクは24時間有効です。</p>
    """
    _send(email, "【REVISION】管理者招待", html)
