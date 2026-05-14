import {useMemo, useState} from "react"
import {Button, Pagination, Select} from "@cloudscape-design/components"
import AwsDatePicker from "./AwsDatePicker.jsx"
import AwsTimeInput from "./AwsTimeInput.jsx"
import {isValidTime} from "../utils/time.js"

function ClearableInput({disabled = false, onChange, required = false, type = "text", value, ...props}) {
  return (
    <div className="medstream-clearable-field">
      <input
        {...props}
        className="medstream-clearable-input"
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        required={required}
        type={type}
        value={value}
      />
    </div>
  )
}

function ClearableTextarea({disabled = false, onChange, value, ...props}) {
  return (
    <div className="medstream-clearable-field medstream-clearable-textarea-field">
      <textarea
        {...props}
        className="medstream-clearable-input medstream-activity-description"
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        value={value}
      />
    </div>
  )
}

function getSelectedOption(options, value) {
  return options.find((option) => option.value === value) || null
}

function toDateParts(value) {
  if (!value) {
    return {date: "", time: ""}
  }

  const scheduled = new Date(value)
  if (Number.isNaN(scheduled.getTime())) {
    return {date: "", time: ""}
  }

  const pad = (part) => String(part).padStart(2, "0")
  return {
    date: `${scheduled.getFullYear()}-${pad(scheduled.getMonth() + 1)}-${pad(scheduled.getDate())}`,
    time: `${pad(scheduled.getHours())}:${pad(scheduled.getMinutes())}`,
  }
}

function buildScheduledAt(date, time) {
  if (!date || !time) {
    return ""
  }

  return `${date}T${time}`
}

function matchesParticipantSearch(item, query) {
  if (!query) {
    return true
  }

  const normalizedQuery = query.trim().toLowerCase()
  const fullName = `${item.last_name || ""} ${item.first_name || ""}`.trim().toLowerCase()
  return fullName.includes(normalizedQuery)
}

export default function ActivityDialog({
                                         activity,
                                         activityTypes,
                                         currentDoctorId,
                                         doctors,
                                         isOpen,
                                         isSubmitting,
                                         mode = "create",
                                         onClose,
                                         onSubmit,
                                         patientSelectionMode = "multiple",
                                         patients,
                                       }) {
  const patientPageSize = 8
  const buildInitialForm = () => {
    const selectedDoctorIds = Array.from(new Set([
      currentDoctorId,
      ...(activity?.doctor_ids || []),
    ].filter(Boolean)))
    const selectedPatientIds = activity?.patient_ids?.length
      ? activity.patient_ids
      : patients.filter((patient) => patient.isCurrent).map((patient) => patient.id)
    const {date, time} = toDateParts(activity?.scheduled_at)

    return {
      type: activity?.type || "",
      title: activity?.title || "",
      description: activity?.description || "",
      scheduledDate: date,
      scheduledTime: time,
      doctorIds: selectedDoctorIds,
      patientIds: patientSelectionMode === "hidden" ? selectedPatientIds.slice(0, 1) : selectedPatientIds,
    }
  }
  const [form, setForm] = useState(buildInitialForm)
  const [patientQuery, setPatientQuery] = useState("")
  const [patientPage, setPatientPage] = useState(1)
  const activityTypeOptions = activityTypes.map((activityType) => ({label: activityType, value: activityType}))

  const filteredPatients = useMemo(
    () => patients
      .filter((patient) =>
        !patient.is_discharged &&
        patient.department === doctors.find(d => d.id === currentDoctorId)?.specialization
      )
      .filter((patient) => matchesParticipantSearch(patient, patientQuery)),
    [patientQuery, patients, doctors, currentDoctorId],
  )
  const maxPatientPage = Math.max(1, Math.ceil(filteredPatients.length / patientPageSize))
  const currentPatientPage = Math.min(patientPage, maxPatientPage)
  const visiblePatients = filteredPatients.slice((currentPatientPage - 1) * patientPageSize, currentPatientPage * patientPageSize)

  if (!isOpen) {
    return null
  }

  const toggleDoctorSelection = (doctorId, keepSelected = false) => {
    setForm((current) => {
      const values = new Set(current.doctorIds)

      if (values.has(doctorId) && !keepSelected) {
        values.delete(doctorId)
      } else {
        values.add(doctorId)
      }

      return {
        ...current,
        doctorIds: Array.from(values),
      }
    })
  }

  const selectPatient = (patientId) => {
    setForm((current) => ({
      ...current,
      patientIds: patientSelectionMode === "single"
        ? [patientId]
        : current.patientIds.includes(patientId)
          ? current.patientIds.filter((id) => id !== patientId)
          : [...current.patientIds, patientId],
    }))
  }

  const isValid = form.title.trim()
    && form.type
    && form.scheduledDate
    && isValidTime(form.scheduledTime)
    && form.doctorIds.length > 0
    && form.patientIds.length > 0

  return (
    <div className="console-modal-overlay medstream-activity-modal-overlay z-50">
      <div className="console-modal medstream-dialog-panel medstream-activity-dialog">
        <div className="medstream-activity-dialog-header">
          <div>
            <p className="medstream-activity-dialog-eyebrow">Activities</p>
            <h2 className="medstream-activity-dialog-title">{mode === "edit" ? "Edit Activity" : "Add Activity"}</h2>
          </div>
          <Button
            className="medstream-cancel-button"
            onClick={onClose}
            disabled={isSubmitting}
          >
            Cancel
          </Button>
        </div>

        <form
          className="medstream-form medstream-activity-dialog-form"
          onSubmit={(event) => {
            event.preventDefault()
            const payload = {
              type: form.type,
              title: form.title.trim(),
              description: form.description.trim(),
              scheduled_at: buildScheduledAt(form.scheduledDate, form.scheduledTime),
              doctor_ids: Array.from(new Set([currentDoctorId, ...form.doctorIds].filter(Boolean))),
            }

            if (mode !== "edit") {
              payload.patient_ids = form.patientIds
            }

            onSubmit(payload)
          }}
        >
          <div className="medstream-form-grid">
            <div className="login-field">
              <label className="login-label" htmlFor="activity-type">Type</label>
              <Select
                selectedOption={getSelectedOption(activityTypeOptions, form.type)}
                onChange={({detail}) => setForm((current) => ({...current, type: detail.selectedOption.value}))}
                options={activityTypeOptions}
                placeholder="Select type"
                selectedAriaLabel="Selected activity type"
              />
            </div>

            <div className="medstream-activity-date-grid">
              <div className="login-field">
                <label className="login-label" htmlFor="activity-date">Date</label>
                <AwsDatePicker
                  id="activity-date"
                  value={form.scheduledDate}
                  onChange={(value) => setForm((current) => ({...current, scheduledDate: value}))}
                  className="medstream-clearable-input"
                  autoComplete="off"
                  required
                />
              </div>

              <div className="login-field">
                <label className="login-label" htmlFor="activity-time">Time</label>
                <AwsTimeInput
                  id="activity-time"
                  value={form.scheduledTime}
                  onChange={(value) => setForm((current) => ({...current, scheduledTime: value}))}
                  className="medstream-clearable-input"
                  required
                />
              </div>
            </div>
          </div>

          <div className="login-field">
            <label className="login-label" htmlFor="activity-title">Title</label>
            <ClearableInput
              id="activity-title"
              type="text"
              value={form.title}
              onChange={(value) => setForm((current) => ({...current, title: value}))}
              placeholder="Example: Post-op monitoring review"
              required
            />
          </div>

          <div className="login-field medstream-form-field-wide">
            <label className="login-label" htmlFor="activity-description">Description</label>
            <ClearableTextarea
              id="activity-description"
              value={form.description}
              onChange={(value) => setForm((current) => ({...current, description: value}))}
              placeholder="Optional details"
              rows={2}
            />
          </div>

          <div className={`medstream-activity-participants ${patientSelectionMode === "hidden" || mode === "edit" ? "medstream-activity-participants-single" : ""}`}>
            {patientSelectionMode !== "hidden" && mode !== "edit" && (
              <section className="medstream-activity-participant-panel">
                <div className="medstream-activity-panel-header">
                  <p className="medstream-activity-panel-title">
                    {patientSelectionMode === "single" ? "Patient" : "Patients Involved"}
                  </p>
                  <span className="medstream-activity-panel-count">{filteredPatients.length}</span>
                </div>

                <div className="login-field medstream-activity-search">
                  <label className="login-label" htmlFor="activity-patient-search">Search patient</label>
                  <ClearableInput
                    id="activity-patient-search"
                    value={patientQuery}
                    onChange={(value) => {
                      setPatientQuery(value)
                      setPatientPage(1)
                    }}
                    placeholder="Search by name"
                  />
                </div>

                <div className="medstream-activity-choice-list custom-scrollbar" role="listbox" aria-label={patientSelectionMode === "single" ? "Patient" : "Patients involved"}>
                  {visiblePatients.map((patient) => (
                    <label
                      key={patient.id}
                      className="medstream-activity-choice"
                      role="option"
                      aria-selected={form.patientIds.includes(patient.id)}
                    >
                      <input
                        className="medstream-choice-input"
                        type={patientSelectionMode === "single" ? "radio" : "checkbox"}
                        name={patientSelectionMode === "single" ? "activity-patient" : undefined}
                        checked={form.patientIds.includes(patient.id)}
                        onChange={() => selectPatient(patient.id)}
                      />
                      <span className="medstream-activity-choice-text">
                        {patient.last_name} {patient.first_name}
                        {patient.isCurrent ? " (Current patient)" : ""}
                      </span>
                    </label>
                  ))}
                  {visiblePatients.length === 0 && (
                    <p className="medstream-activity-empty">No patients match the current search.</p>
                  )}
                </div>

                {maxPatientPage > 1 && (
                  <div className="medstream-activity-pagination">
                    <Pagination
                      currentPageIndex={currentPatientPage}
                      pagesCount={maxPatientPage}
                      onChange={({detail}) => setPatientPage(detail.currentPageIndex)}
                    />
                  </div>
                )}
              </section>
            )}
            <section className="medstream-activity-participant-panel">
              <div className="medstream-activity-panel-header">
                <p className="medstream-activity-panel-title">Doctors Involved</p>
                <span className="medstream-activity-panel-count">{doctors.length}</span>
              </div>
              <div className="medstream-activity-choice-list medstream-activity-doctor-list custom-scrollbar" role="listbox" aria-label="Doctors involved">
                {doctors.map((doctor) => {
                  const isCurrentDoctor = doctor.id === currentDoctorId
                  const isSelectedDoctor = form.doctorIds.includes(doctor.id) || isCurrentDoctor
                  return (
                    <label
                      key={doctor.id}
                      className="medstream-activity-choice"
                      role="option"
                      aria-selected={isSelectedDoctor}
                    >
                      <input
                        className="medstream-choice-input"
                        type="checkbox"
                        checked={isSelectedDoctor}
                        disabled={isCurrentDoctor}
                        onChange={() => toggleDoctorSelection(doctor.id, isCurrentDoctor)}
                      />
                      <span className="medstream-activity-choice-text">
                        Dr. {doctor.first_name} {doctor.last_name}
                        {isCurrentDoctor ? " (You)" : ""}
                      </span>
                    </label>
                  )
                })}
              </div>
            </section>
          </div>

          <div className="medstream-form-actions">
            <Button
              formAction="submit"
              variant="primary"
              className="medstream-submit-button"
              disabled={!isValid || isSubmitting}
            >
              {isSubmitting ? "Saving..." : mode === "edit" ? "Save Changes" : "Add Activity"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}
