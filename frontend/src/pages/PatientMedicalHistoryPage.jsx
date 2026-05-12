import {useCallback, useEffect, useMemo, useState} from "react"
import {useParams} from "react-router-dom"
import BackButton from "../components/BackButton.jsx"
import LoadingSpinner from "../components/LoadingSpinner.jsx"
import DataTable from "../components/DataTable.jsx"
import {useNotifications} from "../hooks/useNotifications.js"
import {useAuth} from "../components/AuthContext.jsx"
import {getCurrentDoctor} from "../services/doctorApi.js"
import {
  administerMedication,
  assignPatientCondition,
  createPatientAllergy,
  createPatientDiagnosis,
  getAllergyOptions,
  getConditionOptions,
  getConditionStatusOptions,
  getDiagnosisOptions,
  getDosageOptions,
  getFrequencyOptions,
  getMedicationOptions,
  getPatient,
  getPatientAllergies,
  getPatientConditions,
  getPatientDiagnosis,
  getPatientDoctors,
  getPatientMedicationOptions,
  getPatientMedications,
  updateMedication,
  updatePatientAllergy,
  updatePatientCondition,
  updatePatientDiagnosis,
} from "../services/patientApi.js"
import {getErrorMessage, getResponseData, getResponseMessage} from "../services/apiMessages.js"

function formatDateTime(value) {
  if (!value) return "--"

  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(new Date(value))
}

function trimValue(value) {
  return String(value || "").trim()
}

const normalize = (value) => String(value || "").trim().toLowerCase()

function normalizeMedicationForm(form) {
  return {
    name: trimValue(form.name),
    dosage: trimValue(form.dosage),
    frequency: trimValue(form.frequency),
  }
}

function normalizeMedicationUpdateForm(form) {
  return {
    dosage: trimValue(form.dosage),
    frequency: trimValue(form.frequency),
    note: trimValue(form.note),
  }
}

function normalizeConditionUpdateForm(form) {
  return {
    status: trimValue(form.status),
    notes: trimValue(form.notes),
  }
}

function hasChanges(initialValues, currentValues, keys) {
  return keys.some((key) => initialValues[key] !== currentValues[key])
}

const INITIAL_FORMS = {
  diagnosis: {diagnosis: "", notes: "", status: ""},
  editDiagnosis: {diagnosis: "", notes: "", status: "", note: ""},
  medication: {name: "", dosage: "", frequency: ""},
  editMedication: {dosage: "", frequency: "", note: ""},
  allergy: {name: "", severity: "mild"},
  editAllergy: {name: "", severity: "mild"},
  editCondition: {status: "", notes: ""},
}

const STATUS_COLORS = {
  diagnosis: {
    active: "#BBF7D0",
    resolved: "#BFDBFE",
    chronic: "#FDE68A",
    inactive: "#E5E7EB",
  },
  allergy: {
    mild: "#BBF7D0",
    moderate: "#FDE68A",
    severe: "#FCA5A5",
  },
  condition: {
    active: "#BBF7D0",
    improving: "#86EFAC",
    stable: "#BFDBFE",
    worsening: "#FDE68A",
    critical: "#FCA5A5",
    resolved: "#BAE6FD",
    chronic: "#E9D5FF",
  },
}

export default function PatientMedicalHistoryPage() {
  const {id} = useParams()
  const {notifyError, notifySuccess} = useNotifications()
  const {token} = useAuth()

  const [patient, setPatient] = useState(null)
  const [currentDoctor, setCurrentDoctor] = useState(null)
  const [diagnosis, setDiagnosis] = useState([])
  const [medications, setMedications] = useState([])
  const [allergies, setAllergies] = useState([])
  const [patientConditions, setPatientConditions] = useState([])
  const [conditionOptions, setConditionOptions] = useState([])
  const [doctors, setDoctors] = useState([])
  const [showDoctorsModal, setShowDoctorsModal] = useState(false)

  const [filter, setFilter] = useState("all")
  const [conditionSearch, setConditionSearch] = useState("")
  const [showDialog, setShowDialog] = useState(null)
  const [editItem, setEditItem] = useState(null)

  const [diagnosisForm, setDiagnosisForm] = useState(INITIAL_FORMS.diagnosis)
  const [editDiagnosisForm, setEditDiagnosisForm] = useState(INITIAL_FORMS.editDiagnosis)
  const [medicationForm, setMedicationForm] = useState(INITIAL_FORMS.medication)
  const [editMedicationForm, setEditMedicationForm] = useState(INITIAL_FORMS.editMedication)
  const [allergyForm, setAllergyForm] = useState(INITIAL_FORMS.allergy)
  const [editAllergyForm, setEditAllergyForm] = useState(INITIAL_FORMS.editAllergy)
  const [conditionId, setConditionId] = useState("")
  const [editConditionForm, setEditConditionForm] = useState(INITIAL_FORMS.editCondition)

  const [allergyOptions, setAllergyOptions] = useState([])
  const [medicationOptions, setMedicationOptions] = useState([])
  const [dosageOptions, setDosageOptions] = useState([])
  const [frequencyOptions, setFrequencyOptions] = useState([])
  const [conditionStatusOptions, setConditionStatusOptions] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const initialAllergySeverity =
    editItem && showDialog === "edit_allergy"
      ? trimValue(editItem.severity)
      : ""

  const currentAllergySeverity = trimValue(editAllergyForm.severity)

  const canSubmitAllergy =
    initialAllergySeverity !== currentAllergySeverity && Boolean(currentAllergySeverity)

  const authHeaders = token ? {Authorization: `Bearer ${token}`} : {}

  useEffect(() => {
    const loadMe = async () => {
      if (!token) return

      try {
        const res = await getCurrentDoctor({Authorization: `Bearer ${token}`})
        setCurrentDoctor(getResponseData(res))
      } catch (error) {
        console.error("Failed to load current doctor", error)
      }
    }

    loadMe()
  }, [token])

  const loadData = useCallback(async () => {
    setIsLoading(true)

    try {
      const [
        patientRes,
        diagnosisRes,
        medicationsRes,
        allergiesRes,
        patientConditionsRes,
        conditionOptionsRes,
        doctorsRes,
        allergyOptRes,
        medOptRes,
        dosageOptRes,
        frequencyOptRes,
        conditionStatusRes,
        diagnosisOptionsRes,
        medicationOptionsRes,
      ] = await Promise.all([
        getPatient(id),
        getPatientDiagnosis(id, 1, 100),
        getPatientMedications(id),
        getPatientAllergies(id, 1, 100),
        getPatientConditions(id),
        getConditionOptions(),
        getPatientDoctors(id),
        getAllergyOptions(),
        getPatientMedicationOptions(id),
        getDosageOptions(),
        getFrequencyOptions(),
        getConditionStatusOptions(),
        getDiagnosisOptions(),
        getMedicationOptions(),
      ])

      setPatient(getResponseData(patientRes))
      setDiagnosis((getResponseData(diagnosisRes) || {}).items || [])
      setMedications(getResponseData(medicationsRes) || [])
      setAllergies((getResponseData(allergiesRes) || {}).items || [])
      setPatientConditions(getResponseData(patientConditionsRes) || [])
      setConditionOptions(getResponseData(conditionOptionsRes) || [])
      setDoctors(getResponseData(doctorsRes) || [])

      setAllergyOptions(getResponseData(allergyOptRes) || [])
      setMedicationOptions(getResponseData(medOptRes) || [])
      setDosageOptions(getResponseData(dosageOptRes) || [])
      setFrequencyOptions(getResponseData(frequencyOptRes) || [])
      setConditionStatusOptions(getResponseData(conditionStatusRes) || [])
      void diagnosisOptionsRes
      void medicationOptionsRes
    } catch (error) {
      notifyError(getErrorMessage(error))
    } finally {
      setIsLoading(false)
    }
  }, [id, notifyError])

  useEffect(() => {
    loadData()
  }, [loadData])

  const items = useMemo(() => {
    const mapped = [
      ...diagnosis.map((item) => ({
        ...item,
        type: "diagnosis",
        label: item.diagnosis,
        timestamp: item.updated_at || item.created_at || item.diagnosed_at
      })),
      ...medications.map((item) => ({...item, type: "medication", label: item.name, timestamp: item.updated_at || item.created_at})),
      ...allergies.map((item) => ({...item, type: "allergy", label: item.allergy_name, timestamp: item.updated_at || item.created_at})),
      ...patientConditions.map((item) => ({
        ...item,
        type: "condition",
        label: item.name,
        id: item.assignment_id || item.id,
        timestamp: item.updated_at || item.diagnosed_at || item.created_at,
      })),
    ]

    const filtered = filter === "all" ? mapped : mapped.filter((item) => item.type === filter)
    return filtered.sort((left, right) => new Date(right.timestamp) - new Date(left.timestamp))
  }, [allergies, diagnosis, filter, medications, patientConditions])

  const doctorNameById = useMemo(() => {
    return Object.fromEntries(
      doctors.map((doctor) => [doctor.id, `${doctor.first_name || ""} ${doctor.last_name || ""}`.trim()]),
    )
  }, [doctors])

  const filteredConditionOptions = useMemo(() => {
    const normalizedQuery = conditionSearch.trim().toLowerCase()
    const assignedNames = new Set(patientConditions.map((item) => item.name))

    return conditionOptions.filter((item) => {
      if (assignedNames.has(item.name)) {
        return false
      }

      if (!normalizedQuery) {
        return true
      }

      return item.name.toLowerCase().includes(normalizedQuery)
    })
  }, [conditionOptions, conditionSearch, patientConditions])

  const patientName = patient ? `${patient.last_name} ${patient.first_name}` : "Patient"
  const isDoctorAssigned = Boolean(currentDoctor && doctors.some((doctor) => doctor.id === currentDoctor.id))
  const canMutateRecords = Boolean(isDoctorAssigned && !patient?.is_discharged)

  const initialMedicationValues = editItem && showDialog === "edit_medication"
    ? normalizeMedicationUpdateForm({
      dosage: editItem.dosage,
      frequency: editItem.frequency || "",
      note: editItem.last_updated_note || "",
    })
    : normalizeMedicationForm({name: "", dosage: "", frequency: ""})
  const currentMedicationValues = showDialog === "edit_medication"
    ? normalizeMedicationUpdateForm(editMedicationForm)
    : normalizeMedicationForm(medicationForm)
  const canSubmitAddMedication = hasChanges(
    normalizeMedicationForm({name: "", dosage: "", frequency: ""}),
    normalizeMedicationForm(medicationForm),
    ["name", "dosage", "frequency"],
  ) && Boolean(
    trimValue(medicationForm.name)
    && trimValue(medicationForm.dosage)
    && trimValue(medicationForm.frequency),
  )

  const canSubmitEditMedication = hasChanges(
    initialMedicationValues,
    currentMedicationValues,
    ["dosage", "frequency"],
  ) && Boolean(
    currentMedicationValues.dosage
    && currentMedicationValues.frequency
    && currentMedicationValues.note,
  )

  const initialConditionValues = editItem && showDialog === "edit_condition"
    ? normalizeConditionUpdateForm({
      status: editItem.status,
      notes: editItem.notes || "",
    })
    : normalizeConditionUpdateForm({status: "", notes: ""})
  const currentConditionValues = normalizeConditionUpdateForm(editConditionForm)
  const canSubmitCondition = hasChanges(
    initialConditionValues,
    currentConditionValues,
    ["status"],
  ) && Boolean(currentConditionValues.notes)

  const selectedConditionName = useMemo(() => {
    if (!conditionId) {
      return ""
    }
    const selected = conditionOptions.find((condition) => String(condition.id) === String(conditionId))
    return selected?.name || ""
  }, [conditionId, conditionOptions])

  const isDuplicateMedication = useMemo(() => {
    const name = normalize(medicationForm.name)
    if (!name) {
      return false
    }
    return medications.some((item) => normalize(item.name) === name)
  }, [medicationForm.name, medications])

  const isDuplicateAllergy = useMemo(() => {
    const name = normalize(allergyForm.name)
    if (!name) {
      return false
    }
    return allergies.some((item) => normalize(item.allergy_name) === name)
  }, [allergies, allergyForm.name])

  const isDuplicateCondition = useMemo(() => {
    const name = normalize(selectedConditionName)
    if (!name) {
      return false
    }
    return patientConditions.some((item) => normalize(item.name) === name)
  }, [patientConditions, selectedConditionName])

  const appendDoctorNote = (note) => {
    const doctorName = currentDoctor
      ? `${currentDoctor.first_name} ${currentDoctor.last_name}`
      : "Unknown"

    const suffix = `Modified by doctor: ${doctorName}`

    if (!note) return suffix
    if (note.includes(suffix)) return note

    return `${note}\n${suffix}`
  }

  const handleSubmit = async (type) => {
    if (!currentDoctor || isSubmitting) {
      return
    }
    if (type === "medication" && isDuplicateMedication) {
      return
    }
    if (type === "allergy" && isDuplicateAllergy) {
      return
    }
    if (type === "condition" && isDuplicateCondition) {
      return
    }

    setIsSubmitting(true)

    try {
      let response

      if (type === "diagnosis") {
        response = await createPatientDiagnosis(id, diagnosisForm, authHeaders)
        setDiagnosisForm({diagnosis: "", notes: "", status: ""})
      }

      if (type === "medication") {
        response = await administerMedication(id, normalizeMedicationForm(medicationForm), authHeaders)
        setMedicationForm({name: "", dosage: "", frequency: ""})
      }

      if (type === "edit_diagnosis") {
        const payload = {}

        if (trimValue(editDiagnosisForm.status)) {
          payload.status = trimValue(editDiagnosisForm.status)
        }

        if (trimValue(editDiagnosisForm.note)) {
          payload.note = appendDoctorNote(trimValue(editDiagnosisForm.note))
        }

        response = await updatePatientDiagnosis(editItem.id, payload, authHeaders)
        setEditDiagnosisForm({diagnosis: "", notes: "", status: "", note: ""})
      }

      if (type === "edit_medication") {
        const normalized = normalizeMedicationUpdateForm(editMedicationForm)
        const payload = {note: appendDoctorNote(normalized.note)}

        if (normalized.dosage !== trimValue(editItem.dosage)) {
          payload.dosage = normalized.dosage
        }

        if (normalized.frequency !== trimValue(editItem.frequency)) {
          payload.frequency = normalized.frequency
        }

        response = await updateMedication(editItem.id, payload, authHeaders)
        setEditMedicationForm({dosage: "", frequency: "", note: ""})
      }

      if (type === "allergy") {
        response = await createPatientAllergy(id, {
          allergy_name: allergyForm.name,
          severity: allergyForm.severity,
        }, authHeaders)
        setAllergyForm({name: "", severity: "mild"})
      }

      if (type === "edit_allergy") {
        response = await updatePatientAllergy(editItem.id, {
          severity: trimValue(editAllergyForm.severity),
        }, authHeaders)
        setEditAllergyForm({name: "", severity: "mild"})
      }

      if (type === "condition") {
        response = await assignPatientCondition(id, {
          condition_id: Number(conditionId),
        }, authHeaders)
        setConditionId("")
        setConditionSearch("")
      }

      if (type === "edit_condition") {
        const normalized = normalizeConditionUpdateForm(editConditionForm)
        const payload = {
          notes: appendDoctorNote(normalized.notes),
        }

        if (normalized.status !== trimValue(editItem.status)) {
          payload.status = normalized.status
        }

        response = await updatePatientCondition(editItem.id, payload, authHeaders)
        setEditConditionForm({status: "", notes: ""})
      }

      notifySuccess(getResponseMessage(response))
      setShowDialog(null)
      setEditItem(null)
      loadData()
    } catch (error) {
      notifyError(getErrorMessage(error))
    } finally {
      setIsSubmitting(false)
    }
  }

  const openEdit = (item) => {
    if (!isDoctorAssigned) {
      return
    }

    setEditItem(item)

    if (item.type === "diagnosis") {
      setEditDiagnosisForm({
        diagnosis: item.diagnosis || "",
        notes: item.notes || "",
        status: item.status || "",
        note: "",
      })
      setShowDialog("edit_diagnosis")
    }

    if (item.type === "medication") {
      setEditMedicationForm({
        dosage: item.dosage,
        frequency: item.frequency || "",
        note: "",
      })
      setShowDialog("edit_medication")
    }

    if (item.type === "allergy") {
      setEditAllergyForm({
        name: item.allergy_name || "",
        severity: item.severity || "mild",
      })
      setShowDialog("edit_allergy")
    }

    if (item.type === "condition") {
      setEditConditionForm({
        status: item.status || "",
        notes: "",
      })
      setShowDialog("edit_condition")
    }
  }

  const resetAllDialogState = () => {
    setDiagnosisForm(INITIAL_FORMS.diagnosis)
    setEditDiagnosisForm(INITIAL_FORMS.editDiagnosis)
    setMedicationForm(INITIAL_FORMS.medication)
    setEditMedicationForm(INITIAL_FORMS.editMedication)
    setAllergyForm(INITIAL_FORMS.allergy)
    setEditAllergyForm(INITIAL_FORMS.editAllergy)
    setConditionId("")
    setConditionSearch("")
    setEditConditionForm(INITIAL_FORMS.editCondition)
  }

  const handleCancelDialog = () => {
    resetAllDialogState()
    setShowDialog(null)
    setEditItem(null)
  }

  const getRecordStatusMeta = (item) => {
    if (item.type === "diagnosis" && item.status) {
      return {label: item.status, color: STATUS_COLORS.diagnosis[String(item.status || "").toLowerCase()] || "#6B7280"}
    }

    if (item.type === "condition" && item.status) {
      return {label: item.status, color: STATUS_COLORS.condition[String(item.status || "").toLowerCase()] || "#6B7280"}
    }

    if (item.type === "allergy" && item.severity) {
      return {label: item.severity, color: STATUS_COLORS.allergy[String(item.severity || "").toLowerCase()] || "#6B7280"}
    }

    return null
  }

  if (isLoading) {
    return (
      <div className="app-shell min-h-screen px-4 py-6 text-[var(--text-primary)]">
        <div className="mx-auto max-w-6xl flex flex-col gap-6">
          <LoadingSpinner/>
        </div>
      </div>
    )
  }

  return (
    <div className="app-shell min-h-screen px-4 py-6 text-[var(--text-primary)]">
      <div className="mx-auto max-w-6xl flex flex-col gap-6">
        <header className="console-topbar rounded-3xl p-6 sm:p-8">
          <div className="space-y-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.35em] text-[#ff9900]">Clinical Records</p>
            </div>

            <div>
              <div className="mt-2 flex w-full items-start justify-between">
                <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                  <h1 className="text-4xl font-semibold tracking-tight text-[var(--text-primary)] sm:text-5xl">{patientName}</h1>
                </div>
                <BackButton/>
              </div>

              <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
                <button
                  type="button"
                  onClick={() => setShowDoctorsModal(true)}
                  className="inline-flex w-fit px-0 py-0 text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--link)] transition hover:text-[var(--text-primary)]"
                >
                  View Assigned Doctors
                </button>
              </div>

              <div className="mt-4 border-t border-[var(--border-subtle)] pt-4 overflow-x-auto min-h-[70px] custom-scrollbar">
                <div className="flex items-center gap-3 w-full pb-2">
                  <select
                    value={filter}
                    onChange={(event) => setFilter(event.target.value)}
                    className="console-input flex-1 min-w-[180px] px-4 py-2 rounded-full text-sm font-semibold border border-[var(--border-primary)] bg-transparent"
                  >
                    <option value="all">All Records</option>
                    <option value="diagnosis">Diagnosis</option>
                    <option value="medication">Medication</option>
                    <option value="allergy">Allergy</option>
                    <option value="condition">Condition</option>
                  </select>
                  <div className="h-6 w-px bg-[var(--border-primary)] mx-2"></div>
                  <div className="flex items-center gap-3 flex-wrap">
                    <button onClick={() => setShowDialog("diagnosis")}
                            disabled={!canMutateRecords}
                            className="console-button-secondary rounded-full px-4 py-2 text-sm font-semibold transition whitespace-nowrap shrink-0 hover:!bg-[#ff9900] hover:!text-[#16191f] hover:!border-[#ff9900] disabled:cursor-not-allowed disabled:border-[var(--border-strong)] disabled:bg-[var(--border-primary)] disabled:text-[var(--text-secondary)]">
                      Add Diagnosis
                    </button>
                    <button onClick={() => setShowDialog("medication")}
                            disabled={!canMutateRecords}
                            className="console-button-secondary rounded-full px-4 py-2 text-sm font-semibold transition whitespace-nowrap shrink-0 hover:!bg-[#ff9900] hover:!text-[#16191f] hover:!border-[#ff9900] disabled:cursor-not-allowed disabled:border-[var(--border-strong)] disabled:bg-[var(--border-primary)] disabled:text-[var(--text-secondary)]">
                      Add Medication
                    </button>
                    <button onClick={() => setShowDialog("allergy")}
                            disabled={!canMutateRecords}
                            className="console-button-secondary rounded-full px-4 py-2 text-sm font-semibold transition whitespace-nowrap shrink-0 hover:!bg-[#ff9900] hover:!text-[#16191f] hover:!border-[#ff9900] disabled:cursor-not-allowed disabled:border-[var(--border-strong)] disabled:bg-[var(--border-primary)] disabled:text-[var(--text-secondary)]">
                      Add Allergy
                    </button>
                    <button onClick={() => setShowDialog("condition")}
                            disabled={!canMutateRecords}
                            className="console-button-secondary rounded-full px-4 py-2 text-sm font-semibold transition whitespace-nowrap shrink-0 hover:!bg-[#ff9900] hover:!text-[#16191f] hover:!border-[#ff9900] disabled:cursor-not-allowed disabled:border-[var(--border-strong)] disabled:bg-[var(--border-primary)] disabled:text-[var(--text-secondary)]">
                      Add Condition
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </header>

        <div className="monitor-card rounded-[28px] p-6 border border-[var(--border-primary)] mt-6">
          <DataTable
            items={items}
            loading={isLoading}
            pageSize={8}
            emptyMessage="No records match the current filter."
            controlsLayoutClassName="hidden"
            shellClassName="space-y-3"
            bodyClassName="space-y-3"
            getItemKey={(item) => `${item.type}-${item.id}`}
            renderRow={(item) => {
              const involvedDoctorStr = item.doctor_id
                ? doctorNameById[item.doctor_id] || "--"
                : "--"
              const itemDoctorName = trimValue(item.modified_by) || (
                item.doctor_id ? doctorNameById[item.doctor_id] || "" : ""
              )
              const statusMeta = getRecordStatusMeta(item)

              return (
                <div className="rounded-2xl border border-[var(--border-primary)] bg-[var(--surface-2)] px-4 py-4 flex flex-col sm:flex-row justify-between gap-4">
                  <div className="max-w-xl">
                    <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[#ffcc80] mb-1">{item.type}</p>
                    <p className="text-sm font-semibold text-[var(--text-primary)]">{item.label}</p>
                    {item.type === "diagnosis" && item.notes && (
                      <p className="text-sm text-[var(--text-secondary)] mt-1">{item.notes}</p>
                    )}

                    {item.type === "medication" && item.dosage && (
                      <p className="text-sm text-[var(--text-secondary)] mt-1">{item.dosage}</p>
                    )}
                    {(
                      (item.type === "diagnosis" && item.status_note)
                      || (item.type === "medication" && item.last_updated_note)
                      || (item.type === "condition" && item.notes)
                      || ((item.type === "diagnosis" || item.type === "condition") && itemDoctorName)
                    ) && (() => {
                      const raw =
                        item.type === "diagnosis"
                          ? item.status_note
                          : item.type === "medication"
                            ? item.last_updated_note
                            : item.notes
                      const normalizedRaw = typeof raw === "string" ? raw : ""
                      const splitIndex = normalizedRaw.indexOf("Modified by doctor:")

                      const mainText = splitIndex !== -1 ? normalizedRaw.slice(0, splitIndex).trim() : normalizedRaw
                      const doctorText = splitIndex !== -1
                        ? normalizedRaw.slice(splitIndex).trim()
                        : itemDoctorName
                          ? `Modified by doctor: ${itemDoctorName}`
                          : null

                      return (
                        <div className="text-xs text-[var(--text-muted)] mt-2 shadow-inner bg-[var(--surface-4)] px-3 py-2 rounded-md space-y-1">
                          {mainText && <p>{mainText}</p>}
                          {doctorText && <p className="italic">{doctorText}</p>}
                        </div>
                      )
                    })()}
                    {statusMeta && (
                      <div className="mt-2">
                        <span
                          className="inline-block px-2 py-0.5 rounded text-xs font-medium uppercase tracking-wider border"
                          style={{
                            color: statusMeta.color,
                            borderColor: statusMeta.color,
                            backgroundColor: `${statusMeta.color}1A`,
                          }}
                        >
                          {statusMeta.label}
                        </span>
                      </div>
                    )}
                  </div>

                  <div className="flex sm:flex-col justify-between sm:justify-end items-end gap-3 text-right">
                    <div>
                      <span className="block text-xs uppercase tracking-wider text-[var(--text-muted)] font-medium mb-1">
                        Doc: {involvedDoctorStr}
                      </span>
                      <span className="block text-xs text-[var(--text-muted)]">Last updated: {formatDateTime(item.timestamp)}</span>
                    </div>

                    {["diagnosis", "medication", "allergy", "condition"].includes(item.type) && (
                      <button
                        onClick={() => openEdit(item)}
                        disabled={!isDoctorAssigned || Boolean(patient?.is_discharged)}
                        className="console-button-secondary rounded-xl text-xs font-semibold px-3 py-1.5 transition mt-2 disabled:cursor-not-allowed disabled:border-[var(--border-strong)] disabled:bg-[var(--border-primary)] disabled:text-[var(--text-secondary)]"
                      >
                        Edit
                      </button>
                    )}
                  </div>
                </div>
              )
            }}
          />
        </div>

        {showDialog && (
          <div className="console-modal-overlay">
            <div className="console-modal monitor-card rounded-[28px] p-6 w-full max-w-md">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.3em] text-[#ff9900]">Clinical Records</p>
                  <h2 className="mt-2 text-2xl font-semibold text-[var(--text-primary)] capitalize">
                    {showDialog.startsWith("edit_") ? `Update ${showDialog.replace("edit_", "").replaceAll("_", " ")}` : `Add ${showDialog.replaceAll("_", " ")}`}
                  </h2>
                </div>
                <button
                  type="button"
                  onClick={handleCancelDialog}
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
                  handleSubmit(showDialog)
                }}
              >
                {showDialog === "diagnosis" && (
                  <>
                    <div className="login-field">
                      <label className="login-label" htmlFor="diagnosis-name">Diagnosis</label>
                      <input
                        id="diagnosis-name"
                        className="login-input"
                        value={diagnosisForm.diagnosis}
                        onChange={(event) => setDiagnosisForm({...diagnosisForm, diagnosis: event.target.value})}
                      />
                    </div>
                    <div className="login-field">
                      <label className="login-label" htmlFor="diagnosis-status">Status</label>
                      <select
                        id="diagnosis-status"
                        className="login-input"
                        value={diagnosisForm.status}
                        onChange={(event) => setDiagnosisForm({...diagnosisForm, status: event.target.value})}
                      >
                        <option value="">Select status</option>
                        {["active", "resolved", "chronic", "inactive"].map((status) => (
                          <option key={status} value={status}>{status}</option>
                        ))}
                      </select>
                    </div>
                    <div className="login-field">
                      <label className="login-label" htmlFor="diagnosis-notes">Notes</label>
                      <textarea
                        id="diagnosis-notes"
                        className="login-input min-h-24"
                        value={diagnosisForm.notes}
                        onChange={(event) => setDiagnosisForm({...diagnosisForm, notes: event.target.value})}
                      />
                    </div>
                  </>
                )}

                {showDialog === "medication" && (
                  <>
                    <div className="login-field">
                      <label className="login-label" htmlFor="medication-name">Medication</label>
                      <select
                        id="medication-name"
                        className={`login-input ${isDuplicateMedication ? "border-red-500" : ""}`}
                        value={medicationForm.name}
                        onChange={(event) => setMedicationForm({...medicationForm, name: event.target.value})}
                      >
                        <option value="">Select medication</option>
                        {medicationOptions.map((medication) => (
                          <option key={`${medication.name}-${medication.pregnancy_category}`} value={medication.name}>
                            {medication.name} ({medication.pregnancy_category})
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div className="login-field">
                        <label className="login-label" htmlFor="medication-dosage">Dosage</label>
                        <select
                          id="medication-dosage"
                          className="login-input"
                          value={medicationForm.dosage}
                          onChange={(event) => setMedicationForm({...medicationForm, dosage: event.target.value})}
                        >
                          <option value="">Select dosage</option>
                          {dosageOptions.map((dosage) => (
                            <option key={dosage} value={dosage}>{dosage}</option>
                          ))}
                        </select>
                      </div>
                      <div className="login-field">
                        <label className="login-label" htmlFor="medication-frequency">Frequency</label>
                        <select
                          id="medication-frequency"
                          className="login-input"
                          value={medicationForm.frequency}
                          onChange={(event) => setMedicationForm({...medicationForm, frequency: event.target.value})}
                        >
                          <option value="">Select frequency</option>
                          {frequencyOptions.map((frequency) => (
                            <option key={frequency} value={frequency}>{frequency}</option>
                          ))}
                        </select>
                      </div>
                    </div>
                  </>
                )}

                {showDialog === "allergy" && (
                  <div className="space-y-4">
                    <div className="login-field">
                      <label className="login-label" htmlFor="allergy-name">Allergy</label>
                      <select
                        id="allergy-name"
                        className={`login-input ${isDuplicateAllergy ? "border-red-500" : ""}`}
                        value={allergyForm.name}
                        onChange={(event) => setAllergyForm({...allergyForm, name: event.target.value})}
                      >
                        <option value="">Select allergy</option>
                        {allergyOptions.map((allergy) => (
                          <option key={allergy} value={allergy}>{allergy}</option>
                        ))}
                      </select>
                    </div>
                    <div className="login-field">
                      <label className="login-label" htmlFor="allergy-severity">Severity</label>
                      <select
                        id="allergy-severity"
                        className="login-input"
                        value={allergyForm.severity}
                        onChange={(event) => setAllergyForm({...allergyForm, severity: event.target.value})}
                      >
                        <option value="mild">Mild</option>
                        <option value="moderate">Moderate</option>
                        <option value="severe">Severe</option>
                      </select>
                    </div>
                  </div>
                )}

                {showDialog === "condition" && (
                  <div className="space-y-4">
                    <div className="login-field">
                      <label className="login-label" htmlFor="condition-search">Search condition</label>
                      <input
                        id="condition-search"
                        className="login-input"
                        value={conditionSearch}
                        onChange={(event) => setConditionSearch(event.target.value)}
                        placeholder="Search by condition name"
                      />
                    </div>
                    <div className="login-field">
                      <label className="login-label" htmlFor="condition-select">Condition</label>
                      <select
                        className={`login-input ${isDuplicateCondition ? "border-red-500" : ""}`}
                        id="condition-select"
                        value={conditionId}
                        onChange={(event) => setConditionId(event.target.value)}
                      >
                        <option value="">Select condition</option>
                        {filteredConditionOptions.map((condition) => (
                          <option key={condition.id} value={condition.id}>{condition.name}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                )}

                {showDialog === "edit_diagnosis" && (
                  <>
                    <div className="login-field">
                      <label className="login-label" htmlFor="edit-diagnosis-status">Status</label>
                      <select
                        id="edit-diagnosis-status"
                        className="login-input"
                        value={editDiagnosisForm.status}
                        onChange={(event) => setEditDiagnosisForm({...editDiagnosisForm, status: event.target.value})}
                      >
                        <option value="">Keep current status</option>
                        {["active", "resolved", "chronic", "inactive"].map((status) => (
                          <option key={status} value={status}>{status}</option>
                        ))}
                      </select>
                    </div>
                    <div className="login-field">
                      <label className="login-label" htmlFor="edit-diagnosis-status-note">Status Note</label>
                      <textarea
                        id="edit-diagnosis-status-note"
                        className="login-input min-h-24"
                        value={editDiagnosisForm.note}
                        onChange={(event) => setEditDiagnosisForm({...editDiagnosisForm, note: event.target.value})}
                      />
                    </div>
                  </>
                )}

                {showDialog === "edit_allergy" && (
                  <div className="space-y-4">
                    <div className="login-field">
                      <label className="login-label" htmlFor="edit-allergy-severity">Severity</label>
                      <select
                        id="edit-allergy-severity"
                        className="login-input"
                        value={editAllergyForm.severity}
                        onChange={(event) => setEditAllergyForm({...editAllergyForm, severity: event.target.value})}
                      >
                        <option value="mild">Mild</option>
                        <option value="moderate">Moderate</option>
                        <option value="severe">Severe</option>
                      </select>
                    </div>
                  </div>
                )}

                {showDialog === "edit_medication" && (
                  <>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div className="login-field">
                        <label className="login-label" htmlFor="edit-medication-dosage">Dosage</label>
                        <select
                          id="edit-medication-dosage"
                          className="login-input"
                          value={editMedicationForm.dosage}
                          onChange={(event) => setEditMedicationForm({...editMedicationForm, dosage: event.target.value})}
                        >
                          <option value="">Select dosage</option>
                          {dosageOptions.map((dosage) => (
                            <option key={dosage} value={dosage}>{dosage}</option>
                          ))}
                        </select>
                      </div>
                      <div className="login-field">
                        <label className="login-label" htmlFor="edit-medication-frequency">Frequency</label>
                        <select
                          id="edit-medication-frequency"
                          className="login-input"
                          value={editMedicationForm.frequency}
                          onChange={(event) => setEditMedicationForm({...editMedicationForm, frequency: event.target.value})}
                        >
                          <option value="">Select frequency</option>
                          {frequencyOptions.map((frequency) => (
                            <option key={frequency} value={frequency}>{frequency}</option>
                          ))}
                        </select>
                      </div>
                    </div>
                    <div className="login-field">
                      <label className="login-label" htmlFor="edit-medication-notes">Reason / Notes</label>
                      <textarea
                        id="edit-medication-notes"
                        className="login-input min-h-24"
                        required
                        value={editMedicationForm.note}
                        onChange={(event) => setEditMedicationForm({...editMedicationForm, note: event.target.value})}
                      />
                    </div>
                  </>
                )}

                {showDialog === "edit_condition" && (
                  <>
                    <div className="login-field">
                      <label className="login-label" htmlFor="edit-condition-status">Status</label>
                      <select
                        id="edit-condition-status"
                        className="login-input w-full"
                        value={editConditionForm.status}
                        onChange={(event) => setEditConditionForm({...editConditionForm, status: event.target.value})}
                      >
                        <option value="">Select status</option>
                        {conditionStatusOptions.map((status) => (
                          <option key={status} value={status}>{status}</option>
                        ))}
                      </select>
                    </div>
                    <div className="login-field">
                      <label className="login-label" htmlFor="edit-condition-notes">Reason / Notes</label>
                      <textarea
                        id="edit-condition-notes"
                        className="login-input min-h-24"
                        value={editConditionForm.notes}
                        onChange={(event) => setEditConditionForm({...editConditionForm, notes: event.target.value})}
                      />
                    </div>
                  </>
                )}

                <div className="flex justify-end gap-3">
                  <div className="group relative inline-flex">
                    <button
                      type="submit"
                      disabled={
                        isSubmitting
                        || !canMutateRecords
                        || (showDialog === "edit_diagnosis" && (!trimValue(editDiagnosisForm.status) || !trimValue(editDiagnosisForm.note)))
                        || (showDialog === "medication" && (!canSubmitAddMedication || isDuplicateMedication))
                        || (showDialog === "edit_medication" && !canSubmitEditMedication)
                        || (showDialog === "edit_allergy" && !canSubmitAllergy)
                        || (showDialog === "edit_condition" && !canSubmitCondition)
                        || (showDialog === "condition" && (!conditionId || isDuplicateCondition))
                        || (showDialog === "diagnosis" && (!trimValue(diagnosisForm.diagnosis) || !trimValue(diagnosisForm.status)))
                        || (showDialog === "allergy" && ((!trimValue(allergyForm.name) || !trimValue(allergyForm.severity)) || isDuplicateAllergy))
                      }
                      className="console-button-primary rounded-2xl px-4 py-3 text-sm font-semibold disabled:cursor-not-allowed disabled:border-[var(--border-strong)] disabled:bg-[var(--border-primary)] disabled:text-[var(--text-secondary)]"
                    >
                      {isSubmitting ? "Saving..." : "Submit"}
                    </button>
                    {showDialog === "medication" && isDuplicateMedication ? (
                      <span
                        className="pointer-events-none absolute left-1/2 top-full z-50 mt-2 -translate-x-1/2 rounded-md border border-[var(--border-soft)] bg-[var(--surface-4)] px-2 py-1 text-xs text-[var(--text-primary)] opacity-0 transition-opacity duration-150 group-hover:opacity-100">
                        This medication already exists for this patient
                      </span>
                    ) : null}
                    {showDialog === "condition" && isDuplicateCondition ? (
                      <span
                        className="pointer-events-none absolute left-1/2 top-full z-50 mt-2 -translate-x-1/2 rounded-md border border-[var(--border-soft)] bg-[var(--surface-4)] px-2 py-1 text-xs text-[var(--text-primary)] opacity-0 transition-opacity duration-150 group-hover:opacity-100">
                        This condition already exists for this patient
                      </span>
                    ) : null}
                    {showDialog === "allergy" && isDuplicateAllergy ? (
                      <span
                        className="pointer-events-none absolute left-1/2 top-full z-50 mt-2 -translate-x-1/2 rounded-md border border-[var(--border-soft)] bg-[var(--surface-4)] px-2 py-1 text-xs text-[var(--text-primary)] opacity-0 transition-opacity duration-150 group-hover:opacity-100">
                        This allergy already exists for this patient
                      </span>
                    ) : null}
                  </div>
                </div>
              </form>
            </div>
          </div>
        )}

        {showDoctorsModal && (
          <div className="console-modal-overlay z-50">
            <div className="console-modal monitor-card rounded-[28px] p-6 w-[600px] max-w-full">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-semibold text-[var(--text-primary)]">Assigned Doctors</h2>
                <button onClick={() => setShowDoctorsModal(false)}
                        className="console-button-secondary px-3 py-1.5 rounded-xl text-sm">
                  Close
                </button>
              </div>
              <DataTable
                items={doctors}
                loading={isLoading}
                pageSize={100}
                controlsLayoutClassName="hidden"
                emptyMessage="No doctors are assigned."
                getItemKey={(doctor) => doctor.id}
                shellClassName="space-y-3"
                bodyClassName="space-y-3"
                renderRow={(doctor) => (
                  <div
                    className="rounded-2xl border border-[var(--border-primary)] bg-[var(--surface-2)] px-4 py-3 flex flex-col sm:flex-row justify-between items-start sm:items-center">
                    <div>
                      <p className="text-sm font-semibold text-[var(--text-primary)]">Dr. {doctor.first_name} {doctor.last_name}</p>
                      <p className="text-xs uppercase tracking-[0.2em] text-[#ffcc80] mt-1">{doctor.specialization}</p>
                    </div>
                    <p className="text-sm text-[var(--text-secondary)] font-medium">{doctor.email}</p>
                  </div>
                )}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
