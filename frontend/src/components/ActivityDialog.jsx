import {useMemo, useState} from "react"
import {Pagination} from "@cloudscape-design/components"

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
      type: activity?.type || activityTypes[0] || "",
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
    && form.scheduledTime
    && form.doctorIds.length > 0
    && form.patientIds.length > 0

  return (
    <div className="console-modal-overlay z-50">
      <div className="console-modal monitor-card rounded-[28px] p-6 w-full max-w-2xl">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-[#ff9900]">Activities</p>
            <h2 className="mt-2 text-2xl font-semibold text-[var(--text-primary)]">{mode === "edit" ? "Edit Activity" : "Add Activity"}</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="console-button-secondary rounded-xl px-3 py-2 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-60"
          >
            Cancel
          </button>
        </div>

        <form
          className="mt-5 space-y-4"
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
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="login-field">
              <label className="login-label" htmlFor="activity-type">Type</label>
              <select
                id="activity-type"
                value={form.type}
                onChange={(event) => setForm((current) => ({...current, type: event.target.value}))}
                className="login-input"
                required
              >
                <option value="">Select type</option>
                {activityTypes.map((activityType) => (
                  <option key={activityType} value={activityType}>
                    {activityType}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="login-field">
                <label className="login-label" htmlFor="activity-date">Date</label>
                <input
                  id="activity-date"
                  type="date"
                  value={form.scheduledDate}
                  onChange={(event) => setForm((current) => ({...current, scheduledDate: event.target.value}))}
                  className="login-input"
                  required
                />
              </div>

              <div className="login-field">
                <label className="login-label" htmlFor="activity-time">Time</label>
                <input
                  id="activity-time"
                  type="time"
                  value={form.scheduledTime}
                  onChange={(event) => setForm((current) => ({...current, scheduledTime: event.target.value}))}
                  className="login-input"
                  required
                />
              </div>
            </div>
          </div>

          <div className="login-field">
            <label className="login-label" htmlFor="activity-title">Title</label>
            <input
              id="activity-title"
              type="text"
              value={form.title}
              onChange={(event) => setForm((current) => ({...current, title: event.target.value}))}
              className="login-input"
              placeholder="Example: Post-op monitoring review"
              required
            />
          </div>

          <div className="login-field">
            <label className="login-label" htmlFor="activity-description">Description</label>
            <textarea
              id="activity-description"
              value={form.description}
              onChange={(event) => setForm((current) => ({...current, description: event.target.value}))}
              className="login-input min-h-28"
              placeholder="Optional details"
            />
          </div>

          <div className={`grid gap-4 ${patientSelectionMode === "hidden" ? "" : "sm:grid-cols-2"}`}>
            {patientSelectionMode !== "hidden" && mode !== "edit" && (
              <div className="rounded-xl border border-[var(--border-primary)] bg-[var(--surface-2)] p-3 text-sm">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[#ffcc80]">
                    {patientSelectionMode === "single" ? "Patient" : "Patients Involved"}
                  </p>
                  <span className="text-xs text-[var(--text-muted)]">{filteredPatients.length}</span>
                </div>

                <div className="login-field mt-3">
                  <label className="login-label" htmlFor="activity-patient-search">Search patient</label>
                  <input
                    id="activity-patient-search"
                    type="text"
                    value={patientQuery}
                    onChange={(event) => {
                      setPatientQuery(event.target.value)
                      setPatientPage(1)
                    }}
                    className="login-input"
                    placeholder="Search by name"
                  />
                </div>

                <div className="mt-3 space-y-2 max-h-44 overflow-y-auto pr-1">
                  {visiblePatients.map((patient) => (
                    <label key={patient.id} className="flex items-center gap-3 text-sm text-[var(--text-primary)]">
                      <input
                        type={patientSelectionMode === "single" ? "radio" : "checkbox"}
                        name={patientSelectionMode === "single" ? "activity-patient" : undefined}
                        checked={form.patientIds.includes(patient.id)}
                        onChange={() => selectPatient(patient.id)}
                      />
                      <span>
                        {patient.last_name} {patient.first_name}
                        {patient.isCurrent ? " (Current patient)" : ""}
                      </span>
                    </label>
                  ))}
                  {visiblePatients.length === 0 && (
                    <p className="text-sm text-[var(--text-muted)]">No patients match the current search.</p>
                  )}
                </div>

                {maxPatientPage > 1 && (
                  <div className="mt-4 flex justify-end">
                    <Pagination
                      currentPageIndex={currentPatientPage}
                      pagesCount={maxPatientPage}
                      onChange={({detail}) => setPatientPage(detail.currentPageIndex)}
                    />
                  </div>
                )}
              </div>
            )}
            <div className="rounded-xl border border-[var(--border-primary)] bg-[var(--surface-2)] p-3 text-sm">
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[#ffcc80]">Doctors Involved</p>
              <div className="mt-3 space-y-2 max-h-36 overflow-y-auto pr-1">
                {doctors.map((doctor) => {
                  const isCurrentDoctor = doctor.id === currentDoctorId
                  return (
                    <label key={doctor.id} className="flex items-center gap-2 text-xs text-[var(--text-primary)]">
                      <input
                        type="checkbox"
                        checked={form.doctorIds.includes(doctor.id) || isCurrentDoctor}
                        disabled={isCurrentDoctor}
                        onChange={() => toggleDoctorSelection(doctor.id, isCurrentDoctor)}
                      />
                      <span>
                        Dr. {doctor.first_name} {doctor.last_name}
                        {isCurrentDoctor ? " (You)" : ""}
                      </span>
                    </label>
                  )
                })}
              </div>
            </div>
          </div>

          <div className="flex justify-end">
            <button
              type="submit"
              disabled={!isValid || isSubmitting}
              className="console-button-primary rounded-2xl px-5 py-3 text-sm font-semibold disabled:cursor-not-allowed disabled:border-[var(--border-strong)] disabled:bg-[var(--border-primary)] disabled:text-[var(--text-secondary)]"
            >
              {isSubmitting ? "Saving..." : mode === "edit" ? "Save Changes" : "Add Activity"}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
