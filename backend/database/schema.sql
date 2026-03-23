CREATE TABLE IF NOT EXISTS departments (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name VARCHAR(150) NOT NULL UNIQUE,
    bed_count INTEGER NOT NULL CHECK (bed_count >= 0)
);

CREATE TABLE IF NOT EXISTS patients (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    full_name VARCHAR(200) NOT NULL,
    national_id VARCHAR(50) NOT NULL UNIQUE,
    birth_date DATE NOT NULL,
    sex VARCHAR(20) NOT NULL CHECK (sex IN ('male', 'female', 'other')),
    address TEXT,
    medical_history JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS doctors (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    full_name VARCHAR(200) NOT NULL,
    specialization VARCHAR(150) NOT NULL,
    years_experience INTEGER NOT NULL CHECK (years_experience >= 0),
    salary NUMERIC(12, 2) NOT NULL CHECK (salary >= 0),
    department_id BIGINT NOT NULL,
    CONSTRAINT fk_doctors_department
        FOREIGN KEY (department_id) REFERENCES departments (id)
        ON UPDATE CASCADE
        ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS nurses (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    full_name VARCHAR(200) NOT NULL,
    shift_type VARCHAR(20) NOT NULL CHECK (shift_type IN ('day', 'night', 'rotating')),
    department_id BIGINT NOT NULL,
    CONSTRAINT fk_nurses_department
        FOREIGN KEY (department_id) REFERENCES departments (id)
        ON UPDATE CASCADE
        ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS medications (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name VARCHAR(150) NOT NULL,
    type VARCHAR(100) NOT NULL,
    manufacturer VARCHAR(150),
    standard_dosage VARCHAR(100) NOT NULL
);

CREATE TABLE IF NOT EXISTS admissions (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    patient_id BIGINT NOT NULL,
    doctor_id BIGINT NOT NULL,
    department_id BIGINT NOT NULL,
    admission_date TIMESTAMPTZ NOT NULL,
    discharge_date TIMESTAMPTZ,
    initial_diagnosis TEXT NOT NULL,
    CONSTRAINT chk_admissions_dates
        CHECK (discharge_date IS NULL OR discharge_date >= admission_date),
    CONSTRAINT fk_admissions_patient
        FOREIGN KEY (patient_id) REFERENCES patients (id)
        ON UPDATE CASCADE
        ON DELETE RESTRICT,
    CONSTRAINT fk_admissions_doctor
        FOREIGN KEY (doctor_id) REFERENCES doctors (id)
        ON UPDATE CASCADE
        ON DELETE RESTRICT,
    CONSTRAINT fk_admissions_department
        FOREIGN KEY (department_id) REFERENCES departments (id)
        ON UPDATE CASCADE
        ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS consultations (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    patient_id BIGINT NOT NULL,
    doctor_id BIGINT NOT NULL,
    notes TEXT,
    final_diagnosis TEXT,
    consultation_date TIMESTAMPTZ NOT NULL,
    CONSTRAINT fk_consultations_patient
        FOREIGN KEY (patient_id) REFERENCES patients (id)
        ON UPDATE CASCADE
        ON DELETE RESTRICT,
    CONSTRAINT fk_consultations_doctor
        FOREIGN KEY (doctor_id) REFERENCES doctors (id)
        ON UPDATE CASCADE
        ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS lab_results (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    patient_id BIGINT NOT NULL,
    test_type VARCHAR(150) NOT NULL,
    result_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    unit VARCHAR(50),
    value NUMERIC(12, 4),
    normal_range VARCHAR(100),
    recorded_at TIMESTAMPTZ NOT NULL,
    CONSTRAINT fk_lab_results_patient
        FOREIGN KEY (patient_id) REFERENCES patients (id)
        ON UPDATE CASCADE
        ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS alerts (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    patient_id BIGINT NOT NULL,
    alert_type VARCHAR(100) NOT NULL,
    value NUMERIC(12, 4),
    severity VARCHAR(20) NOT NULL DEFAULT 'warning' CHECK (severity IN ('warning', 'critical')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_alerts_patient
        FOREIGN KEY (patient_id) REFERENCES patients (id)
        ON UPDATE CASCADE
        ON DELETE RESTRICT
);

ALTER TABLE alerts
ADD COLUMN IF NOT EXISTS severity VARCHAR(20) NOT NULL DEFAULT 'warning';

ALTER TABLE alerts
DROP CONSTRAINT IF EXISTS chk_alerts_severity;

ALTER TABLE alerts
ADD CONSTRAINT chk_alerts_severity
CHECK (severity IN ('warning', 'critical'));

CREATE TABLE IF NOT EXISTS treatments (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    admission_id BIGINT NOT NULL,
    medication_id BIGINT NOT NULL,
    dosage VARCHAR(100) NOT NULL,
    frequency_per_day INTEGER NOT NULL CHECK (frequency_per_day > 0),
    start_date DATE NOT NULL,
    end_date DATE,
    CONSTRAINT chk_treatments_dates
        CHECK (end_date IS NULL OR end_date >= start_date),
    CONSTRAINT fk_treatments_admission
        FOREIGN KEY (admission_id) REFERENCES admissions (id)
        ON UPDATE CASCADE
        ON DELETE CASCADE,
    CONSTRAINT fk_treatments_medication
        FOREIGN KEY (medication_id) REFERENCES medications (id)
        ON UPDATE CASCADE
        ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS vital_signs (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    patient_id BIGINT NOT NULL,
    admission_id BIGINT,
    heart_rate INTEGER CHECK (heart_rate > 0),
    oxygen_saturation NUMERIC(5, 2) CHECK (oxygen_saturation >= 0 AND oxygen_saturation <= 100),
    temperature NUMERIC(4, 1) CHECK (temperature > 0),
    blood_pressure_systolic INTEGER CHECK (blood_pressure_systolic > 0),
    blood_pressure_diastolic INTEGER CHECK (blood_pressure_diastolic > 0),
    respiratory_rate INTEGER CHECK (respiratory_rate > 0),
    recorded_at TIMESTAMPTZ NOT NULL,
    CONSTRAINT chk_vital_signs_bp
        CHECK (
            blood_pressure_systolic IS NULL
            OR blood_pressure_diastolic IS NULL
            OR blood_pressure_systolic >= blood_pressure_diastolic
        ),
    CONSTRAINT fk_vital_signs_patient
        FOREIGN KEY (patient_id) REFERENCES patients (id)
        ON UPDATE CASCADE
        ON DELETE RESTRICT,
    CONSTRAINT fk_vital_signs_admission
        FOREIGN KEY (admission_id) REFERENCES admissions (id)
        ON UPDATE CASCADE
        ON DELETE SET NULL
);
