import pytest

from app.core.errors import ValidationError
from app.validators.address_validators import validate_address_create, validate_address_update


def address_payload(**overrides):
    payload = {
        "street": "Liberty Street",
        "number": "12A",
        "apartment": "24",
        "city": "Brebu Nou",
        "county": "Caras-Severin",
        "postal_code": "000000",
    }
    payload.update(overrides)
    return payload


def test_address_create_rejects_street_longer_than_database_limit():
    with pytest.raises(ValidationError) as error:
        validate_address_create(address_payload(street="S" * 121))

    assert error.value.code == "FIELD_TOO_LONG"
    assert error.value.context == {"field": "Address street", "max": 120}


def test_address_create_rejects_number_longer_than_database_limit():
    with pytest.raises(ValidationError) as error:
        validate_address_create(address_payload(number="N" * 31))

    assert error.value.code == "FIELD_TOO_LONG"
    assert error.value.context == {"field": "Address number", "max": 30}


def test_address_create_rejects_apartment_longer_than_database_limit():
    with pytest.raises(ValidationError) as error:
        validate_address_create(address_payload(apartment="A" * 31))

    assert error.value.code == "FIELD_TOO_LONG"
    assert error.value.context == {"field": "Address apartment", "max": 30}


def test_address_update_rejects_city_longer_than_database_limit():
    with pytest.raises(ValidationError) as error:
        validate_address_update(address_payload(city="C" * 101))

    assert error.value.code == "FIELD_TOO_LONG"
    assert error.value.context == {"field": "Address city", "max": 100}
