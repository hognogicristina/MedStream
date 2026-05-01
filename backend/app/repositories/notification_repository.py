import asyncio
from email.message import EmailMessage
from urllib.parse import urlencode

import aiosmtplib

from app.core.config import settings
from app.validators.notification_validators import (
    validate_notification_body,
    validate_notification_recipient,
    validate_notification_subject,
    validate_smtp_host,
)


def _build_frontend_link(path: str, token: str):
    query = urlencode({"token": token})
    return f"{settings.frontend_base_url.rstrip('/')}{path}?{query}"


def build_verify_email_link(token: str):
    return _build_frontend_link("/verify-email", token)


def build_password_reset_link(token: str):
    return _build_frontend_link("/reset-password", token)


def _render_html_email(title: str, message: str, action_label: str, action_url: str):
    return f"""\
<!doctype html>
<html lang=\"en\">
  <body style=\"margin:0;padding:0;background:#16191f;font-family:Segoe UI,Helvetica Neue,Arial,sans-serif;color:#f2f3f3;\">
    <table role=\"presentation\" width=\"100%\" cellspacing=\"0\" cellpadding=\"0\" style=\"padding:32px 16px;background:#16191f;\">
      <tr>
        <td align=\"center\">
          <table role=\"presentation\" width=\"100%\" cellspacing=\"0\" cellpadding=\"0\" style=\"max-width:600px;border:1px solid #3b424b;background:#1b2430;border-radius:20px;overflow:hidden;\">
            <tr>
              <td style=\"padding:32px;\">
                <p style=\"margin:0 0 12px;font-size:12px;letter-spacing:0.28em;text-transform:uppercase;color:#ff9900;font-weight:700;\">MedStream</p>
                <h1 style=\"margin:0 0 16px;font-size:28px;line-height:1.2;color:#ffffff;\">{title}</h1>
                <p style=\"margin:0 0 24px;font-size:16px;line-height:1.6;color:#d5dbdb;\">{message}</p>
                <a href=\"{action_url}\" style=\"display:inline-block;padding:14px 22px;border-radius:14px;background:#ec7211;color:#16191f;text-decoration:none;font-weight:700;\">
                  {action_label}
                </a>
                <p style=\"margin:24px 0 8px;font-size:13px;color:#879196;\">If the button does not work, use this link:</p>
                <p style=\"margin:0;font-size:13px;line-height:1.6;word-break:break-all;\">
                  <a href=\"{action_url}\" style=\"color:#9dccff;text-decoration:none;\">{action_url}</a>
                </p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>
"""


async def send_email_async(recipient: str, subject: str, text_body: str, html_body: str):
    email = EmailMessage()
    email["From"] = settings.smtp_user or "no-reply@medstream.local"
    email["To"] = validate_notification_recipient(recipient)
    email["Subject"] = validate_notification_subject(subject)
    email.set_content(validate_notification_body(text_body, "Text body"))
    email.add_alternative(validate_notification_body(html_body, "HTML body"), subtype="html")

    await aiosmtplib.send(
        email,
        hostname=validate_smtp_host(settings.smtp_host),
        port=settings.smtp_port,
        username=settings.smtp_user or None,
        password=settings.smtp_pass or None,
        start_tls=settings.smtp_port not in (465, 1025),
        use_tls=settings.smtp_port == 465,
    )


def send_email(recipient: str, subject: str, text_body: str, html_body: str):
    validate_smtp_host(settings.smtp_host)

    try:
        loop = asyncio.get_event_loop()
        if loop.is_running():
            asyncio.run(send_email_async(recipient, subject, text_body, html_body))
        else:
            loop.run_until_complete(send_email_async(recipient, subject, text_body, html_body))
    except RuntimeError:
        asyncio.run(send_email_async(recipient, subject, text_body, html_body))


def send_registration_verification_email(email: str, first_name: str, token: str):
    action_url = build_verify_email_link(token)
    message = f"Hello Dr. {first_name}, your MedStream account is ready. Validate your email address to complete registration."
    send_email(
        email,
        "Validate your MedStream email",
        f"{message}\n\nValidate Email: {action_url}",
        _render_html_email("Validate Your Email", message, "Validate Email", action_url),
    )


def send_password_reset_email(email: str, first_name: str, token: str):
    action_url = build_password_reset_link(token)
    message = f"Hello Dr. {first_name}, we received a request to reset your MedStream password. This link expires shortly."
    send_email(
        email,
        "Reset your MedStream password",
        f"{message}\n\nReset Password: {action_url}",
        _render_html_email("Reset Your Password", message, "Reset Password", action_url),
    )


def send_email_change_verification_email(email: str, first_name: str, token: str):
    action_url = build_verify_email_link(token)
    message = f"Hello Dr. {first_name}, confirm your new email address to finish updating your MedStream account."
    send_email(
        email,
        "Confirm your MedStream email change",
        f"{message}\n\nVerify Email: {action_url}",
        _render_html_email("Confirm Email Change", message, "Verify Email", action_url),
    )
