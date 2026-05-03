from app.db.base import Base
from app.db.session import engine
from sqlalchemy import inspect, text


def init_db():
    Base.metadata.create_all(bind=engine)
    _ensure_updated_at_columns()


def _ensure_updated_at_columns():
    inspector = inspect(engine)
    table_column_specs = {
        "patient_allergies": {"updated_at": "TIMESTAMP"},
        "patient_condition_assignments": {"updated_at": "TIMESTAMP"},
    }

    with engine.begin() as connection:
        for table_name, required_columns in table_column_specs.items():
            existing_columns = {column["name"] for column in inspector.get_columns(table_name)}
            for column_name, column_type in required_columns.items():
                if column_name in existing_columns:
                    continue
                connection.execute(text(f"ALTER TABLE {table_name} ADD COLUMN {column_name} {column_type}"))
                connection.execute(text(f"UPDATE {table_name} SET {column_name} = created_at WHERE {column_name} IS NULL"))
