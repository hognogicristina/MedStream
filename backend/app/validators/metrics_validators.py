from __future__ import annotations

from app.core.errors import ValidationError


def validate_pagination(page: int, page_size: int) -> tuple[int, int]:
    if page < 1:
        raise ValidationError("INVALID_PAGE")
    if page_size < 1:
        raise ValidationError("INVALID_PAGE_SIZE")
    return page, page_size


def validate_metric_value(value):
    if value is None:
        return 0.0
    return round(float(value), 2)


def validate_window_minutes(value: int) -> int:
    if value < 1:
        raise ValidationError("INVALID_WINDOW_MINUTES")
    return value
