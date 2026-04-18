from app.models.doctor.doctor_activity_patient import doctor_activity_patients

def assign_doctor_to_patient(db, doctor_id, patient_id):
    exists = db.execute(
        doctor_activity_patients.select().where(
            (doctor_activity_patients.c.doctor_id == doctor_id) &
            (doctor_activity_patients.c.patient_id == patient_id)
        )
    ).first()

    if not exists:
        db.execute(
            doctor_activity_patients.insert().values(
                doctor_id=doctor_id,
                patient_id=patient_id
            )
        )