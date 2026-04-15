from datetime import datetime

from fastapi import APIRouter, HTTPException, Query, Header
from sqlalchemy import desc, func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import selectinload

from app.api.doctors import get_current_doctor
from app.models.doctor.doctor_activity import DoctorActivity
from app.models.doctor.doctor_activity_doctor import doctor_activity_doctors

from app.core.http import ApiResponse, success_response
from app.db.session import SessionLocal
from app.models.patient.patient_medication import PatientMedication
from app.models.patient.patient_admission_history import PatientAdmissionHistory
from app.models.patient.patient import Patient
from app.models.doctor.doctor_activity import DoctorActivity
from app.models.patient.patient_activity_doctor import patient_activity_doctors
from app.models.patient.patient_allergy import PatientAllergy
from app.models.patient.patient_condition import PatientCondition
from app.models.patient.patient_condition_assignment import PatientConditionAssignment
from app.models.patient.patient_diagnosis import PatientDiagnosis
from app.schemas.doctor import DoctorRead
from app.schemas.patient_medication import PatientMedicationCreate, PatientMedicationRead
from app.schemas.patient import PatientCreate, PatientDepartmentUpdate, PatientDischargeUpdate, PatientRead, PatientUpdate
from app.schemas.patient_admission_history import (
    PatientAdmissionActionCreate,
    PatientAdmissionHistoryPage,
    PatientAdmissionHistoryRead,
)
from app.schemas.patient_allergy import PatientAllergyCreate, PatientAllergyPage, PatientAllergyRead
from app.schemas.patient_condition import PatientConditionAssignmentCreate, PatientConditionRead, PatientConditionAssignmentRead, \
    ConditionUpdate
from app.schemas.doctor_activity import DoctorActivityRead
from app.schemas.patient_medication import MedicationUpdate
from app.schemas.patient_diagnosis import (
    PatientDiagnosisCreate,
    PatientDiagnosisRead,
    PatientDiagnosisPage,
    PatientDiagnosisUpdate
)

router = APIRouter(prefix="/patients", tags=["patients"])


def serialize(model, schema):
    return schema.model_validate(model).model_dump(mode="json")


def serialize_many(models, schema):
    return [serialize(model, schema) for model in models]


def flatten_patient_address(address_payload: dict | None):
    address = address_payload or {}
    return {
        "address_street": address.get("street"),
        "address_number": address.get("number"),
        "address_apartment": address.get("apartment"),
        "address_city": address.get("city"),
        "address_state": address.get("county"),
        "address_postal_code": address.get("postal_code"),
        "address_country": "Romania",
    }


def build_paginated_payload(items, total: int, page: int, page_size: int, schema):
    return {
        "items": serialize_many(items, schema),
        "total": total,
        "page": page,
        "page_size": page_size,
    }


def get_patient_or_404(db, patient_id: int):
    patient = db.get(Patient, patient_id)
    if patient is None:
        raise HTTPException(status_code=404, detail="Patient not found.")
    return patient


def verify_patient_access(db, doctor_id: int, patient_id: int):
    # Check if doctor is explicitly assigned
    is_assigned = db.execute(
        select(Patient.id)
        .join(patient.doctors.property.secondary, patient.doctors.property.secondary.c.patient_id == Patient.id)
        .where(patient.doctors.property.secondary.c.doctor_id == doctor_id, Patient.id == patient_id)
    ).scalar_one_or_none()
    
    if is_assigned is not None:
        return
        
    has_activity = db.execute(
        select(DoctorActivity.id)
        .join(Patient.activities.property.secondary, Patient.activities.property.secondary.c.activity_id == DoctorActivity.id)
        .join(doctor_activity_doctors, doctor_activity_doctors.c.doctor_activity_id == DoctorActivity.id)
        .where(
            doctor_activity_doctors.c.doctor_id == doctor_id, 
            Patient.activities.property.secondary.c.patient_id == patient_id
        )
    ).scalar_one_or_none()
    
    if has_activity is None:
        raise HTTPException(status_code=403, detail="Doctor is not assigned to this patient.")


def ensure_patient_identity_uniqueness(db, *, cnp: str | None = None, phone_number: str | None = None, patient_id: int | None = None):
    if cnp:
        cnp_query = select(Patient).where(Patient.cnp == cnp)
        if patient_id is not None:
            cnp_query = cnp_query.where(Patient.id != patient_id)
        if db.execute(cnp_query).scalar_one_or_none():
            raise HTTPException(status_code=400, detail="CNP already registered.")

    if phone_number:
        phone_query = select(Patient).where(Patient.phone_number == phone_number)
        if patient_id is not None:
            phone_query = phone_query.where(Patient.id != patient_id)
        if db.execute(phone_query).scalar_one_or_none():
            raise HTTPException(status_code=400, detail="Phone number already registered.")


@router.get("", response_model=ApiResponse[list[PatientRead]])
def list_patients(
        condition_id: int | None = Query(default=None, ge=1),
):
    with SessionLocal() as db:
        patient_query = select(Patient)

        if condition_id is not None:
            patient_query = patient_query.join(
                PatientConditionAssignment,
                PatientConditionAssignment.patient_id == Patient.id,
            ).where(PatientConditionAssignment.condition_id == condition_id)

        patients = db.execute(
            patient_query.order_by(desc(Patient.id))
        ).scalars().all()

        return success_response(
            "Patients retrieved successfully.",
            serialize_many(patients, PatientRead)
        )


@router.get("/{id}", response_model=ApiResponse[PatientRead])
def get_patient(id: int):
    with SessionLocal() as db:
        patient = get_patient_or_404(db, id)
        return success_response("Patient retrieved successfully.", serialize(patient, PatientRead))


@router.get("/{id}/doctors", response_model=ApiResponse[list[DoctorRead]])
def get_patient_doctors(id: int):
    with SessionLocal() as db:
        patient = db.execute(
            select(Patient).options(selectinload(Patient.doctors)).where(Patient.id == id)
        ).scalar_one_or_none()

        if patient is None:
            raise HTTPException(status_code=404, detail="Patient not found.")

        doctors = sorted(patient.doctors, key=lambda doctor: doctor.id, reverse=True)
        return success_response("Patient doctors retrieved successfully.", serialize_many(doctors, DoctorRead))


@router.post("", response_model=ApiResponse[PatientRead])
def create_patient(payload: PatientCreate):
    with SessionLocal() as db:
        ensure_patient_identity_uniqueness(db, cnp=payload.cnp, phone_number=payload.phone_number)
        payload_data = payload.model_dump()
        address_data = flatten_patient_address(payload_data.pop("address"))
        patient = Patient(**payload_data, **address_data)
        db.add(patient)
        try:
            db.commit()
            db.refresh(patient)
        except IntegrityError:
            db.rollback()
            raise HTTPException(status_code=400, detail="Patient identity fields must be unique.")

        return success_response("Patient created successfully.", serialize(patient, PatientRead), status_code=201)


@router.patch("/{id}", response_model=ApiResponse[PatientRead])
def update_patient(id: int, payload: PatientUpdate):
    with SessionLocal() as db:
        patient = get_patient_or_404(db, id)
        updates = payload.model_dump(exclude_unset=True)

        if "cnp" in updates or "phone_number" in updates:
            ensure_patient_identity_uniqueness(
                db,
                cnp=updates.get("cnp"),
                phone_number=updates.get("phone_number"),
                patient_id=patient.id,
            )

        address_updates = flatten_patient_address(updates.pop("address")) if "address" in updates else {}

        for field, value in updates.items():
            setattr(patient, field, value)

        for field, value in address_updates.items():
            setattr(patient, field, value)

        try:
            db.commit()
            db.refresh(patient)
        except IntegrityError:
            db.rollback()
            raise HTTPException(status_code=400, detail="Patient identity fields must be unique.")

        return success_response("Patient updated successfully.", serialize(patient, PatientRead))


@router.patch("/{id}/department", response_model=ApiResponse[PatientRead])
def update_patient_department(id: int, payload: PatientDepartmentUpdate):
    with SessionLocal() as db:
        patient = get_patient_or_404(db, id)
        patient.department = payload.department
        db.commit()
        db.refresh(patient)

        return success_response("Patient department updated successfully.", serialize(patient, PatientRead))


@router.patch("/{id}/discharge", response_model=ApiResponse[PatientRead])
def discharge_patient(id: int, payload: PatientDischargeUpdate):
    with SessionLocal() as db:
        patient = get_patient_or_404(db, id)

        if patient.is_discharged:
            raise HTTPException(status_code=400, detail="Patient is already discharged.")

        patient.is_discharged = True
        patient.discharge_reason = payload.reason
        patient.discharge_date = datetime.utcnow()
        db.add(
            PatientAdmissionHistory(
                patient_id=patient.id,
                type="discharge",
                reason=payload.reason,
                created_at=patient.discharge_date,
            )
        )
        db.commit()
        db.refresh(patient)

        return success_response("Patient discharged successfully.", serialize(patient, PatientRead))


@router.post("/{id}/readmit", response_model=ApiResponse[PatientRead])
def readmit_patient(id: int, payload: PatientAdmissionActionCreate):
    with SessionLocal() as db:
        patient = get_patient_or_404(db, id)

        if not patient.is_discharged:
            raise HTTPException(status_code=400, detail="Patient is not currently discharged.")

        patient.is_discharged = False
        patient.discharge_reason = None
        patient.discharge_date = None
        db.add(
            PatientAdmissionHistory(
                patient_id=patient.id,
                type="readmission",
                reason=payload.reason,
                created_at=datetime.utcnow(),
            )
        )
        db.commit()
        db.refresh(patient)

        return success_response("Patient readmitted successfully.", serialize(patient, PatientRead))


@router.get("/{id}/admission-history", response_model=ApiResponse[PatientAdmissionHistoryPage])
def get_patient_admission_history(
        id: int,
        page: int = Query(1, ge=1),
        page_size: int = Query(5, ge=1, le=100),
):
    with SessionLocal() as db:
        get_patient_or_404(db, id)
        total = db.execute(
            select(func.count()).select_from(PatientAdmissionHistory).where(PatientAdmissionHistory.patient_id == id)
        ).scalar_one()
        entries = db.execute(
            select(PatientAdmissionHistory)
            .where(PatientAdmissionHistory.patient_id == id)
            .order_by(desc(PatientAdmissionHistory.created_at), desc(PatientAdmissionHistory.id))
            .offset((page - 1) * page_size)
            .limit(page_size)
        ).scalars().all()
        return success_response(
            "Patient admission history retrieved successfully.",
            build_paginated_payload(entries, total, page, page_size, PatientAdmissionHistoryRead),
        )


@router.get("/{id}/medical-history", response_model=ApiResponse[dict])
def get_full_medical_history(id: int):
    with SessionLocal() as db:
        get_patient_or_404(db, id)

        conditions = db.execute(
            select(PatientCondition)
            .join(PatientConditionAssignment, PatientConditionAssignment.condition_id == PatientCondition.id)
            .where(PatientConditionAssignment.patient_id == id)
        ).scalars().all()

        allergies = db.execute(
            select(PatientAllergy).where(PatientAllergy.patient_id == id)
        ).scalars().all()

        diagnosis = db.execute(
            select(PatientDiagnosis).where(PatientDiagnosis.patient_id == id)
        ).scalars().all()

        medications = db.execute(
            select(PatientMedication).where(PatientMedication.patient_id == id)
        ).scalars().all()

        activities = db.execute(
            select(DoctorActivity)
            .options(selectinload(DoctorActivity.doctors), selectinload(DoctorActivity.patients))
            .join(patient_activity_doctors, patient_activity_doctors.c.activity_id == DoctorActivity.id)
            .where(patient_activity_doctors.c.patient_id == id)
        ).scalars().all()

        return success_response(
            "Patient full medical history retrieved successfully.",
            {
                "conditions": serialize_many(conditions, PatientConditionRead),
                "allergies": serialize_many(allergies, PatientAllergyRead),
                "diagnosis": serialize_many(diagnosis, PatientDiagnosisRead),
                "medications": serialize_many(medications, PatientMedicationRead),
                "activities": [
                    {
                        **serialize(activity, DoctorActivityRead),
                        "patient_ids": [p.id for p in activity.patients],
                        "doctor_ids": [d.id for d in activity.doctors]
                    } for activity in activities
                ],
            },
        )


@router.get("/{id}/conditions", response_model=ApiResponse[list[PatientConditionRead]])
def get_patient_conditions(id: int):
    with SessionLocal() as db:
        get_patient_or_404(db, id)
        conditions = db.execute(
            select(PatientCondition)
            .join(PatientConditionAssignment, PatientConditionAssignment.condition_id == PatientCondition.id)
            .where(PatientConditionAssignment.patient_id == id)
            .order_by(PatientCondition.name.asc(), PatientCondition.id.asc())
        ).scalars().all()
        return success_response("Patient conditions retrieved successfully.", serialize_many(conditions, PatientConditionRead))


@router.post("/{id}/conditions", response_model=ApiResponse[list[PatientConditionRead]])
def assign_patient_condition(id: int, payload: PatientConditionAssignmentCreate, authorization: str | None = Header(default=None)):
    current_doctor = get_current_doctor(authorization)
    with SessionLocal() as db:
        patient = get_patient_or_404(db, id)
        verify_patient_access(db, current_doctor.id, patient.id)
        condition = db.get(PatientCondition, payload.condition_id)

        if condition is None:
            raise HTTPException(status_code=404, detail="Condition not found.")

        existing_assignment = db.execute(
            select(PatientConditionAssignment).where(
                PatientConditionAssignment.patient_id == patient.id,
                PatientConditionAssignment.condition_id == condition.id,
            )
        ).scalar_one_or_none()

        if existing_assignment is None:
            db.add(
                PatientConditionAssignment(
                    patient_id=patient.id,
                    condition_id=condition.id,
                )
            )
            db.commit()

        conditions = db.execute(
            select(PatientCondition)
            .join(PatientConditionAssignment, PatientConditionAssignment.condition_id == PatientCondition.id)
            .where(PatientConditionAssignment.patient_id == patient.id)
            .order_by(PatientCondition.name.asc(), PatientCondition.id.asc())
        ).scalars().all()
        return success_response("Patient condition assigned successfully.", serialize_many(conditions, PatientConditionRead))


@router.patch("/condition/{assignment_id}", response_model=ApiResponse[PatientConditionAssignmentRead])
def update_condition_assignment(assignment_id: int, payload: ConditionUpdate, authorization: str | None = Header(default=None)):
    current_doctor = get_current_doctor(authorization)
    with SessionLocal() as db:
        assignment = db.get(PatientConditionAssignment, assignment_id)

        if assignment is None:
            raise HTTPException(status_code=404, detail="Assignment not found.")
            
        verify_patient_access(db, current_doctor.id, assignment.patient_id)

        if payload.status:
            assignment.status = payload.status

        if payload.notes:
            assignment.notes = payload.notes

        db.commit()
        db.refresh(assignment)

        return success_response(
            "Condition updated successfully.",
            serialize(assignment, PatientConditionAssignmentRead),
        )


@router.get("/{id}/allergies", response_model=ApiResponse[PatientAllergyPage])
def get_patient_allergies(id: int, page: int = Query(1, ge=1), page_size: int = Query(5, ge=1, le=100)):
    with SessionLocal() as db:
        get_patient_or_404(db, id)
        total = db.execute(
            select(func.count()).select_from(PatientAllergy).where(PatientAllergy.patient_id == id)
        ).scalar_one()
        allergies = db.execute(
            select(PatientAllergy)
            .where(PatientAllergy.patient_id == id)
            .order_by(desc(PatientAllergy.created_at), desc(PatientAllergy.id))
            .offset((page - 1) * page_size)
            .limit(page_size)
        ).scalars().all()
        return success_response(
            "Patient allergies retrieved successfully.",
            build_paginated_payload(allergies, total, page, page_size, PatientAllergyRead),
        )


@router.post("/{id}/allergies", response_model=ApiResponse[PatientAllergyRead])
def create_patient_allergy(id: int, payload: PatientAllergyCreate, authorization: str | None = Header(default=None)):
    current_doctor = get_current_doctor(authorization)
    with SessionLocal() as db:
        patient = get_patient_or_404(db, id)
        verify_patient_access(db, current_doctor.id, patient.id)
        allergy = PatientAllergy(
            patient_id=patient.id,
            allergy_name=payload.allergy_name,
            severity=payload.severity,
        )
        db.add(allergy)
        db.commit()
        db.refresh(allergy)
        return success_response("Patient allergy added successfully.", serialize(allergy, PatientAllergyRead), status_code=201)


@router.get("/{id}/diagnosis", response_model=ApiResponse[PatientDiagnosisPage])
def get_patient_diagnosis(id: int, page: int = Query(1, ge=1), page_size: int = Query(5, ge=1, le=100)):
    with SessionLocal() as db:
        get_patient_or_404(db, id)
        total = db.execute(
            select(func.count()).select_from(PatientDiagnosis).where(PatientDiagnosis.patient_id == id)
        ).scalar_one()
        diagnosis_entries = db.execute(
            select(PatientDiagnosis)
            .where(PatientDiagnosis.patient_id == id)
            .order_by(desc(PatientDiagnosis.created_at), desc(PatientDiagnosis.id))
            .offset((page - 1) * page_size)
            .limit(page_size)
        ).scalars().all()
        return success_response(
            "Patient diagnosis retrieved successfully.",
            build_paginated_payload(diagnosis_entries, total, page, page_size, PatientDiagnosisRead),
        )


@router.post("/{id}/diagnosis", response_model=ApiResponse[PatientDiagnosisRead])
def create_patient_diagnosis(id: int, payload: PatientDiagnosisCreate, authorization: str | None = Header(default=None)):
    current_doctor = get_current_doctor(authorization)
    with SessionLocal() as db:
        patient = get_patient_or_404(db, id)
        verify_patient_access(db, current_doctor.id, patient.id)
        diagnosis_entry = PatientDiagnosis(
            patient_id=patient.id,
            diagnosis=payload.diagnosis,
            notes=payload.notes,
        )
        db.add(diagnosis_entry)
        db.commit()
        db.refresh(diagnosis_entry)
        return success_response(
            "Patient diagnosis added successfully.",
            serialize(diagnosis_entry, PatientDiagnosisRead),
            status_code=201,
        )


@router.patch("/diagnosis/{diagnosis_id}", response_model=ApiResponse[PatientDiagnosisRead])
def update_patient_diagnosis(diagnosis_id: int, payload: PatientDiagnosisUpdate, authorization: str | None = Header(default=None)):
    current_doctor = get_current_doctor(authorization)
    with SessionLocal() as db:
        diagnosis = db.get(PatientDiagnosis, diagnosis_id)

        if diagnosis is None:
            raise HTTPException(status_code=404, detail="Diagnosis not found.")
            
        verify_patient_access(db, current_doctor.id, diagnosis.patient_id)

        diagnosis.status = payload.status
        diagnosis.status_note = payload.note

        db.commit()
        db.refresh(diagnosis)

        return success_response(
            "Diagnosis status updated successfully.",
            serialize(diagnosis, PatientDiagnosisRead),
        )


@router.post("/{id}/medication", response_model=ApiResponse[PatientMedicationRead])
def administer_medication(id: int, payload: PatientMedicationCreate, authorization: str | None = Header(default=None)):
    current_doctor = get_current_doctor(authorization)
    with SessionLocal() as db:
        patient = get_patient_or_404(db, id)
        verify_patient_access(db, current_doctor.id, patient.id)
        medication = PatientMedication(
            patient_id=patient.id,
            name=payload.name,
            dosage=payload.dosage,
        )
        db.add(medication)
        db.commit()
        db.refresh(medication)

        return success_response(
            "Medication administered successfully.",
            serialize(medication, PatientMedicationRead),
            status_code=201,
        )


@router.get("/{id}/medications", response_model=ApiResponse[list[PatientMedicationRead]])
def get_patient_medications(id: int):
    with SessionLocal() as db:
        get_patient_or_404(db, id)

        meds = db.execute(
            select(PatientMedication)
            .where(PatientMedication.patient_id == id)
            .order_by(desc(PatientMedication.created_at))
        ).scalars().all()

        return success_response(
            "Patient medications retrieved successfully.",
            serialize_many(meds, PatientMedicationRead),
        )


@router.get("/{id}/activities", response_model=ApiResponse[list[DoctorActivityRead]])
def get_patient_activities(id: int):
    with SessionLocal() as db:
        get_patient_or_404(db, id)

        activities = db.execute(
            select(DoctorActivity)
            .options(selectinload(DoctorActivity.doctors), selectinload(DoctorActivity.patients))
            .join(patient_activity_doctors, patient_activity_doctors.c.activity_id == DoctorActivity.id)
            .where(patient_activity_doctors.c.patient_id == id)
            .order_by(desc(DoctorActivity.scheduled_at))
        ).scalars().all()

        return success_response(
            "Patient activities retrieved successfully.",
            [
                {
                    **serialize(activity, DoctorActivityRead),
                    "patient_ids": [p.id for p in activity.patients],
                    "doctor_ids": [d.id for d in activity.doctors]
                } for activity in activities
            ],
        )


@router.patch("/medications/{medication_id}", response_model=ApiResponse[PatientMedicationRead])
def update_medication(medication_id: int, payload: MedicationUpdate, authorization: str | None = Header(default=None)):
    current_doctor = get_current_doctor(authorization)
    with SessionLocal() as db:
        medication = db.get(PatientMedication, medication_id)

        if medication is None:
            raise HTTPException(status_code=404, detail="Medication not found.")
            
        verify_patient_access(db, current_doctor.id, medication.patient_id)

        if payload.dosage:
            medication.dosage = payload.dosage
            medication.last_updated_note = payload.note

        db.commit()
        db.refresh(medication)

        return success_response(
            "Medication updated successfully.",
            serialize(medication, PatientMedicationRead),
        )


@router.get("/{id}/doctors", response_model=ApiResponse[list[DoctorRead]])
def get_patient_doctors(id: int):
    with SessionLocal() as db:
        get_patient_or_404(db, id)

        doctors = db.execute(
            select(Doctor)
            .join(doctor_activity_patients, doctor_activity_patients.c.doctor_id == Doctor.id)
            .where(doctor_activity_patients.c.patient_id == id)
            .order_by(Doctor.id.desc())
        ).scalars().all()

        return success_response(
            "Patient doctors retrieved successfully.",
            serialize_many(doctors, DoctorRead),
        )
