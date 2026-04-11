import asyncio
import secrets
from email.message import EmailMessage

import aiosmtplib

from app.core.config import settings


def generate_verification_code():
    return f"{secrets.randbelow(1000000):06d}"


def build_password_reset_link(token: str):
    return f"https://medstream.local/reset-password?token={token}"


def build_account_recovery_link(token: str):
    return f"https://medstream.local/recover-account?token={token}"


async def send_email_async(recipient: str, subject: str, message: str):
    email = EmailMessage()
    email["From"] = settings.smtp_user or "no-reply@medstream.local"
    email["To"] = recipient
    email["Subject"] = subject
    email.set_content(message)

    await aiosmtplib.send(
        email,
        hostname=settings.smtp_host,
        port=settings.smtp_port,
        username=settings.smtp_user or None,
        password=settings.smtp_pass or None,
        start_tls=True,
    )


def send_email(recipient: str, subject: str, message: str):
    try:
        if not settings.smtp_host:
            raise RuntimeError("SMTP host not configured")

        asyncio.run(send_email_async(recipient, subject, message))
        print(f"[EMAIL-SENT] to={recipient} subject={subject} message={message}")
    except Exception as exc:
        print(f"[EMAIL-FALLBACK] to={recipient} subject={subject} message={message} error={exc}")


def send_sms(recipient: str, message: str):
    print(f"[SMS] to={recipient} message={message}")


def send_registration_notifications(email: str, phone_number: str | None, first_name: str):
    verification_code = generate_verification_code()
    email_message = (
        f"Hello Dr. {first_name}, welcome to MedStream. "
        f"Your registration verification code is {verification_code}. "
        f"Use this code to confirm your clinician account setup."
    )
    send_email(email, "MedStream registration verification", email_message)

    if phone_number:
        sms_message = (
            f"MedStream verification code: {verification_code}. "
            f"Complete your doctor account setup with this code."
        )
        send_sms(phone_number, sms_message)


def send_password_reset_notifications(email: str, phone_number: str | None, token: str):
    reset_link = build_password_reset_link(token)
    verification_code = generate_verification_code()
    email_message = (
        f"MedStream password reset requested. "
        f"Use reset link: {reset_link} "
        f"or verification code {verification_code}. "
        f"This reset request expires shortly."
    )
    send_email(email, "MedStream password reset", email_message)

    if phone_number:
        sms_message = (
            f"MedStream reset code: {verification_code}. "
            f"Reset link: {reset_link}"
        )
        send_sms(phone_number, sms_message)


def send_account_recovery_notifications(email: str, phone_number: str | None, token: str):
    recovery_link = build_account_recovery_link(token)
    verification_code = generate_verification_code()
    email_message = (
        f"MedStream account recovery requested. "
        f"Use recovery link: {recovery_link} "
        f"or verification code {verification_code}. "
        f"This recovery request expires shortly."
    )
    send_email(email, "MedStream account recovery", email_message)

    if phone_number:
        sms_message = (
            f"MedStream recovery code: {verification_code}. "
            f"Recovery link: {recovery_link}"
        )
        send_sms(phone_number, sms_message)


def send_email_change_confirmation(email: str, first_name: str):
    confirmation_code = generate_verification_code()
    email_message = (
        f"Hello Dr. {first_name}, MedStream received a request to change your account email. "
        f"Use confirmation code {confirmation_code} to confirm {email}."
    )
    send_email(email, "MedStream email change confirmation", email_message)
