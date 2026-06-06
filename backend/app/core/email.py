"""Send feedback notification emails via SMTP (Gmail or any SMTP server).

Configuration (add to .env):
    SMTP_HOST=smtp.gmail.com
    SMTP_PORT=587
    SMTP_USER=your-sender@gmail.com
    SMTP_PASSWORD=your-app-password   # Gmail App Password (not account password)
    FEEDBACK_EMAIL=phapalesai25@gmail.com

For Gmail: enable 2FA → Google Account → Security → App Passwords → create one.
Leave SMTP_USER/SMTP_PASSWORD empty to skip email silently (no error raised).
"""

from __future__ import annotations

import asyncio
import logging
import smtplib
import ssl
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

from app.core.config import get_settings

logger = logging.getLogger(__name__)


def _send_sync(subject: str, body_html: str, body_text: str) -> None:
    settings = get_settings()
    smtp_host = getattr(settings, "SMTP_HOST", "") or ""
    smtp_port = int(getattr(settings, "SMTP_PORT", 587) or 587)
    smtp_user = getattr(settings, "SMTP_USER", "") or ""
    smtp_pass = getattr(settings, "SMTP_PASSWORD", "") or ""
    to_addr = getattr(settings, "FEEDBACK_EMAIL", "") or ""

    if not smtp_user or not smtp_pass or not to_addr:
        logger.debug("Email not configured — skipping feedback notification")
        return

    msg = MIMEMultipart("alternative")
    msg["Subject"] = subject
    msg["From"] = smtp_user
    msg["To"] = to_addr

    msg.attach(MIMEText(body_text, "plain"))
    msg.attach(MIMEText(body_html, "html"))

    ctx = ssl.create_default_context()
    try:
        with smtplib.SMTP(smtp_host or "smtp.gmail.com", smtp_port, timeout=10) as server:
            server.ehlo()
            server.starttls(context=ctx)
            server.login(smtp_user, smtp_pass)
            server.sendmail(smtp_user, to_addr, msg.as_string())
        logger.info("Feedback email sent to %s", to_addr)
    except Exception as exc:
        logger.warning("Failed to send feedback email: %s", exc)


async def send_feedback_email(
    *,
    generation_id: str,
    rating: int,
    feedback_type: str | None,
    comment: str | None,
    user_id: str | None,
) -> None:
    """Fire-and-forget feedback notification — never raises."""
    stars = "★" * rating + "☆" * (5 - rating)
    category = feedback_type or "general"
    user_label = user_id or "anonymous"
    comment_text = comment or "(no comment)"

    subject = f"[TerraSketch] New feedback: {stars} ({category})"

    body_text = (
        f"New feedback received on TerraSketch.\n\n"
        f"Rating:      {stars} ({rating}/5)\n"
        f"Category:    {category}\n"
        f"User:        {user_label}\n"
        f"Generation:  {generation_id}\n\n"
        f"Comment:\n{comment_text}\n\n"
        f"View generation: /result/{generation_id}"
    )

    body_html = f"""
<!DOCTYPE html>
<html>
<body style="font-family:system-ui,sans-serif;background:#0f172a;color:#e2e8f0;padding:32px;margin:0">
  <div style="max-width:520px;margin:0 auto">
    <div style="background:#1e293b;border-radius:16px;padding:28px;border:1px solid rgba(255,255,255,0.08)">
      <h1 style="margin:0 0 4px;font-size:20px;color:#f8fafc">
        New Feedback
        <span style="font-size:14px;color:#94a3b8;font-weight:400"> · TerraSketch</span>
      </h1>
      <p style="margin:0 0 24px;font-size:13px;color:#64748b">A user just rated a generation.</p>

      <table style="width:100%;border-collapse:collapse">
        <tr>
          <td style="padding:10px 0;border-bottom:1px solid rgba(255,255,255,0.06);color:#94a3b8;font-size:13px;width:110px">Rating</td>
          <td style="padding:10px 0;border-bottom:1px solid rgba(255,255,255,0.06);font-size:20px;color:#fbbf24">{stars}</td>
        </tr>
        <tr>
          <td style="padding:10px 0;border-bottom:1px solid rgba(255,255,255,0.06);color:#94a3b8;font-size:13px">Category</td>
          <td style="padding:10px 0;border-bottom:1px solid rgba(255,255,255,0.06);font-size:14px;color:#e2e8f0">{category}</td>
        </tr>
        <tr>
          <td style="padding:10px 0;border-bottom:1px solid rgba(255,255,255,0.06);color:#94a3b8;font-size:13px">Generation ID</td>
          <td style="padding:10px 0;border-bottom:1px solid rgba(255,255,255,0.06);font-size:13px;font-family:monospace;color:#818cf8">{generation_id}</td>
        </tr>
        <tr>
          <td style="padding:10px 0;color:#94a3b8;font-size:13px">User</td>
          <td style="padding:10px 0;font-size:13px;color:#e2e8f0">{user_label}</td>
        </tr>
      </table>

      <div style="margin-top:20px;background:rgba(255,255,255,0.03);border-radius:10px;padding:16px;border:1px solid rgba(255,255,255,0.06)">
        <p style="margin:0 0 8px;font-size:11px;text-transform:uppercase;letter-spacing:0.08em;color:#64748b">Comment</p>
        <p style="margin:0;font-size:14px;color:#cbd5e1;line-height:1.6">{comment_text}</p>
      </div>
    </div>
    <p style="margin:16px 0 0;font-size:11px;color:#334155;text-align:center">TerraSketch · automated feedback notification</p>
  </div>
</body>
</html>
"""

    await asyncio.to_thread(_send_sync, subject, body_html, body_text)
