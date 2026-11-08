"""Tiny MailPulse client for scripts that send their own mail (smtplib, any provider).

    from mailpulse_client import track

    msg = EmailMessage()
    msg["From"], msg["To"], msg["Subject"] = sender, to, subject
    t = track(to=to, subject=subject, text=body, sender=sender, template="cold-v3", company="Acme")
    msg["Message-ID"] = t["messageId"]      # lets reply matching work over IMAP
    msg.set_content(body)                    # plain part: links stay exactly as written
    msg.add_alternative(t["html"], subtype="html")   # HTML part carries the pixel
    smtp.send_message(msg)

Environment: MAILPULSE_URL (e.g. https://mailpulse.vercel.app) and MAILPULSE_API_KEY.
If the tracker is down, track() returns None after printing a warning, so a send never fails because of it.
Standard library only.
"""
from __future__ import annotations

import json
import os
import urllib.error
import urllib.request
import urllib.parse


def _call(method: str, path: str, body: dict | None = None, timeout: float = 15):
    base = os.environ.get("MAILPULSE_URL", "").rstrip("/")
    key = os.environ.get("MAILPULSE_API_KEY", "")
    if not base or not key:
        raise RuntimeError("Set MAILPULSE_URL and MAILPULSE_API_KEY")
    req = urllib.request.Request(
        f"{base}{path}",
        method=method,
        data=json.dumps(body).encode() if body is not None else None,
        headers={"Authorization": f"Bearer {key}", "Content-Type": "application/json"},
    )
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return json.loads(r.read() or b"{}")


def track(*, to: str, subject: str, text: str | None = None, html: str | None = None, sender: str | None = None,
          template: str | None = None, variant: str | None = None, company: str | None = None,
          to_name: str | None = None, track_opens: bool = True, track_clicks: bool = False, has_attachment: bool = False,
          follow_up_of: str | None = None) -> dict | None:
    """Registers an email you are about to send. Returns {id, html, messageId, pixelUrl, ...} or None on error."""
    body = {
        "to": to, "subject": subject, "text": text, "html": html, "from": sender, "template": template,
        "variant": variant, "company": company, "toName": to_name, "trackOpens": track_opens, "trackClicks": track_clicks,
        "hasAttachment": has_attachment, "followUpOf": follow_up_of,
    }
    try:
        return _call("POST", "/api/v1/messages", {k: v for k, v in body.items() if v is not None})
    except (urllib.error.URLError, RuntimeError, TimeoutError) as err:
        print(f"  (mailpulse: not tracked, {err})")
        return None


def mark_failed(message_id: str, error: str) -> None:
    """Call when the SMTP send fails after track(), so the email doesn't count as sent."""
    try:
        _call("PATCH", f"/api/v1/messages/{message_id}", {"status": "failed", "error": error})
    except Exception as err:  # noqa: BLE001 - best effort
        print(f"  (mailpulse: could not mark failed, {err})")


def stats(days: int | None = None) -> dict:
    return _call("GET", f"/api/v1/stats{f'?days={days}' if days else ''}")


def messages(*, to: str | None = None, limit: int = 100) -> list[dict]:
    """Return message status, engagementLevel, openConfidence and openSources unchanged."""
    query = urllib.parse.urlencode({"limit": limit, **({"to": to} if to else {})})
    return _call("GET", f"/api/v1/messages?{query}")["messages"]
