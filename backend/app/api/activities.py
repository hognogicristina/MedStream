from fastapi import APIRouter, Header, HTTPException

from app.api.activity_utils import (
    attach_activity_relationships,
    ensure_activity_departments_match,
    ensure_activity_patients_are_editable,
    ensure_activity_patients_match_doctor_department,
    ensure_activity_modifier,
    ensure_supported_activity_type,
    load_activity_or_404,
    load_doctors_for_activity,
    load_patients_for_activity,
    serialize_activity,
)
from app.api.doctors import get_current_doctor
from app.api.patients import verify_patient_assignment
from app.core.http import ApiResponse, success_response
from app.db.session import SessionLocal
from app.models.doctor.doctor_activity import DoctorActivity
from app.schemas.doctor_activity import DoctorActivityCreate, DoctorActivityRead, DoctorActivityUpdate

router = APIRouter(prefix="/activities", tags=["activities"])


@router.post("", response_model=ApiResponse[DoctorActivityRead])
def create_activity(payload: DoctorActivityCreate, authorization: str | None = Header(default=None)):
    current_doctor = get_current_doctor(authorization)

    with SessionLocal() as db:
        ensure_supported_activity_type(payload.type)
        patients = load_patients_for_activity(db, payload.patient_ids)
        for patient in patients:
            verify_patient_assignment(db, current_doctor.id, patient.id)
        ensure_activity_patients_match_doctor_department(patients, current_doctor)
        ensure_activity_patients_are_editable(patients)

        doctor_ids = payload.doctor_ids
        if current_doctor.id not in doctor_ids:
            doctor_ids = [current_doctor.id, *doctor_ids]

        doctors = load_doctors_for_activity(db, doctor_ids)
        ensure_activity_departments_match(patients, doctors)

        activity = DoctorActivity(
            doctor_id=current_doctor.id,
            patient_id=patients[0].id,
            type=payload.type,
            title=payload.title,
            description=payload.description,
            scheduled_at=payload.scheduled_at,
            status="incoming",
        )
        attach_activity_relationships(activity, patients, doctors)
        db.add(activity)
        db.commit()
        db.refresh(activity)
        activity = load_activity_or_404(db, activity.id)

        return success_response(
            "Activity created successfully.",
            serialize_activity(activity),
            status_code=201,
        )


@router.patch("/{activity_id}", response_model=ApiResponse[DoctorActivityRead])
def update_activity(activity_id: int, payload: DoctorActivityUpdate, authorization: str | None = Header(default=None)):
    current_doctor = get_current_doctor(authorization)

    with SessionLocal() as db:
        activity = load_activity_or_404(db, activity_id)
        ensure_activity_modifier(activity, current_doctor.id)

        updated_fields = []

        if payload.type is not None:
            ensure_supported_activity_type(payload.type)
            activity.type = payload.type
            updated_fields.append("type")

        if payload.title is not None:
            activity.title = payload.title
            updated_fields.append("title")

        if payload.description is not None:
            activity.description = payload.description
            updated_fields.append("description")

        if payload.scheduled_at is not None:
            activity.scheduled_at = payload.scheduled_at
            updated_fields.append("scheduled_at")

        if payload.status is not None:
            normalized_status = payload.status.strip().lower()
            if normalized_status not in {"incoming", "completed", "canceled"}:
                raise HTTPException(status_code=400, detail="Invalid activity status.")
            activity.status = normalized_status
            updated_fields.append("status")

        if payload.patient_ids is not None:
            patients = load_patients_for_activity(db, payload.patient_ids)
            for patient in patients:
                verify_patient_assignment(db, current_doctor.id, patient.id)
            ensure_activity_patients_match_doctor_department(patients, current_doctor)
        else:
            patients = list(activity.patients)
        ensure_activity_patients_are_editable(patients)

        if payload.doctor_ids is not None:
            doctor_ids = payload.doctor_ids
            if current_doctor.id not in doctor_ids:
                doctor_ids = [current_doctor.id, *doctor_ids]
            doctors = load_doctors_for_activity(db, doctor_ids)
        else:
            doctors = list(activity.doctors)

        if payload.patient_ids is not None or payload.doctor_ids is not None:
            ensure_activity_departments_match(patients, doctors)
            attach_activity_relationships(activity, patients, doctors)
            if payload.patient_ids is not None:
                updated_fields.append("patient_ids")
            if payload.doctor_ids is not None:
                updated_fields.append("doctor_ids")

        if not updated_fields:
            raise HTTPException(status_code=400, detail="No activity updates were provided.")

        db.commit()
        activity = load_activity_or_404(db, activity.id)

        return success_response(
            f"Activity updated successfully. Updated: {', '.join(updated_fields)}.",
            serialize_activity(activity),
        )
