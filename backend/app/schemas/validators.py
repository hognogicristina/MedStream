ROMANIA_COUNTRY = "Romania"


def normalize_romanian_phone_number(value: str | None):
    digits = "".join(char for char in str(value or "").strip() if char.isdigit())

    if not digits:
        return None

    if digits.startswith("40") and len(digits) == 11:
        digits = f"0{digits[2:]}"

    if len(digits) != 10 or not digits.startswith("07"):
        raise ValueError("Phone number must contain exactly 10 digits and start with 07.")

    return digits
