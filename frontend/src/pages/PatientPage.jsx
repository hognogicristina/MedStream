import {useCallback, useEffect, useRef, useState} from "react"
import {Link, useParams} from "react-router-dom"
import BackButton from "../components/BackButton"
import CountValue from "../components/CountValue"
import DepartmentTransferDialog from "../components/DepartmentTransferDialog"
import EditPatientDialog from "../components/EditPatientDialog"
import MedicalHistoryDialog from "../components/MedicalHistoryDialog"
import PatientAdmissionActionCard from "../components/PatientAdmissionActionCard"
import PatientConditionDialog from "../components/PatientConditionDialog"
import {useNotifications} from "../components/NotificationProvider"
import {usePatientAdmissionActions} from "../hooks/usePatientAdmissionActions"
import {api} from "../services/api"
import {getErrorMessage, getResponseData, getResponseMessage} from "../services/apiMessages"
import {createWebSocket} from "../services/ws"
import {formatPatientPhoneWithCode} from "../utils/patientPhone"

function formatDateTime(value) {
  if (!value) {
    return "--"
  }

  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value))
}

function formatDate(value) {
  if (!value) {
    return "--"
  }

  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(value))
}

function formatArrivalMethod(value) {
  if (value === "ambulance") {
    return "Ambulance"
  }

  if (value === "self") {
    return "Self"
  }

  return value || "--"
}

function formatHistoryType(value) {
  if (!value) {
    return "--"
  }

  return value
    .split("_")
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(" ")
}

function formatAdmissionType(value) {
  if (value === "readmission") {
    return "Readmission"
  }

  if (value === "discharge") {
    return "Discharge"
  }

  return value || "--"
}

function PaginationControls({page, maxPage, onPrevious, onNext}) {
  return (
    <div className="mb-4 flex items-center justify-between gap-3">
      <div className="console-chip rounded-full px-3 py-1 text-xs font-medium">
        Page {page}
      </div>

      <div className="flex items-center gap-2">
        <button
          className="console-button-ghost rounded-full px-3 py-1.5 text-xs font-medium disabled:cursor-not-allowed disabled:border-[#31363f] disabled:text-[#6b7280]"
          onClick={onPrevious}
          disabled={page === 1}
          type="button"
        >
          Previous
        </button>

        <button
          className="console-button-ghost rounded-full px-3 py-1.5 text-xs font-medium disabled:cursor-not-allowed disabled:border-[#31363f] disabled:text-[#6b7280]"
          onClick={onNext}
          disabled={page >= maxPage}
          type="button"
        >
          Next
        </button>
      </div>
    </div>
  )
}

export default function PatientPage() {
  const {notifyError, notifySuccess} = useNotifications()
  const {id} = useParams()
  const pageSize = 5
  const [patient, setPatient] = useState(null)
  const [vitals, setVitals] = useState([])
  const [vitalsHistory, setVitalsHistory] = useState([])
  const [alerts, setAlerts] = useState([])
  const [allergies, setAllergies] = useState([])
  const [allergiesTotal, setAllergiesTotal] = useState(0)
  const [conditions, setConditions] = useState([])
  const [patientConditions, setPatientConditions] = useState([])
  const [medicalHistory, setMedicalHistory] = useState([])
  const [medicalHistoryTotal, setMedicalHistoryTotal] = useState(0)
  const [admissionHistory, setAdmissionHistory] = useState([])
  const [admissionHistoryTotal, setAdmissionHistoryTotal] = useState(0)
  const [department, setDepartment] = useState("")
  const [isUpdatingDepartment, setIsUpdatingDepartment] = useState(false)
  const [isLoadingPatient, setIsLoadingPatient] = useState(true)
  const [isLoadingAllergies, setIsLoadingAllergies] = useState(true)
  const [isLoadingConditions, setIsLoadingConditions] = useState(true)
  const [isLoadingMedicalHistory, setIsLoadingMedicalHistory] = useState(true)
  const [isLoadingAdmissionHistory, setIsLoadingAdmissionHistory] = useState(true)
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false)
  const [isMedicalHistoryDialogOpen, setIsMedicalHistoryDialogOpen] = useState(false)
  const [isConditionDialogOpen, setIsConditionDialogOpen] = useState(false)
  const [isSavingPatient, setIsSavingPatient] = useState(false)
  const [isTransferDialogOpen, setIsTransferDialogOpen] = useState(false)
  const [medicationName, setMedicationName] = useState("")
  const [dosage, setDosage] = useState("")
  const [allergyName, setAllergyName] = useState("")
  const [allergySeverity, setAllergySeverity] = useState("mild")
  const [isSubmittingMedication, setIsSubmittingMedication] = useState(false)
  const [isSubmittingAllergy, setIsSubmittingAllergy] = useState(false)
  const [isSubmittingHistory, setIsSubmittingHistory] = useState(false)
  const [isSubmittingCondition, setIsSubmittingCondition] = useState(false)
  const [vitalsPage, setVitalsPage] = useState(1)
  const [allergiesPage, setAllergiesPage] = useState(1)
  const [medicalHistoryPage, setMedicalHistoryPage] = useState(1)
  const [admissionHistoryPage, setAdmissionHistoryPage] = useState(1)
  const alertAudioRef = useRef(null)
  const canSubmitMedication = medicationName.trim().length > 0 && dosage.trim().length > 0
  const canSubmitAllergy = allergyName.trim().length > 0 && allergySeverity.trim().length > 0

  if (!alertAudioRef.current) {
    alertAudioRef.current = new Audio("/alert.mp3")
  }

  useEffect(() => {
    setPatient(null)
    setVitals([])
    setVitalsHistory([])
    setAlerts([])
    setAllergies([])
    setAllergiesTotal(0)
    setConditions([])
    setPatientConditions([])
    setMedicalHistory([])
    setMedicalHistoryTotal(0)
    setAdmissionHistory([])
    setAdmissionHistoryTotal(0)
    setDepartment("")
    setAllergyName("")
    setAllergySeverity("mild")
    setVitalsPage(1)
    setAllergiesPage(1)
    setMedicalHistoryPage(1)
    setAdmissionHistoryPage(1)
    setIsEditDialogOpen(false)
    setIsMedicalHistoryDialogOpen(false)
    setIsConditionDialogOpen(false)
    setIsTransferDialogOpen(false)
  }, [id])

  const loadPatient = useCallback(async () => {
    setIsLoadingPatient(true)

    try {
      const response = await api.get(`/patients/${id}`)
      const patientData = getResponseData(response)
      setPatient(patientData)
      setDepartment(patientData.department)
    } catch (error) {
      setPatient(null)
      setDepartment("")
      notifyError(getErrorMessage(error))
    } finally {
      setIsLoadingPatient(false)
    }
  }, [id, notifyError])

  const loadAllergies = useCallback(async (page = allergiesPage) => {
    setIsLoadingAllergies(true)

    try {
      const response = await api.get(`/patients/${id}/allergies?page=${page}&page_size=${pageSize}`)
      const data = getResponseData(response) || {}
      setAllergies(data.items || [])
      setAllergiesTotal(data.total || 0)
    } catch (error) {
      setAllergies([])
      setAllergiesTotal(0)
      notifyError(getErrorMessage(error))
    } finally {
      setIsLoadingAllergies(false)
    }
  }, [allergiesPage, id, notifyError])

  const loadConditions = useCallback(async () => {
    setIsLoadingConditions(true)

    try {
      const [conditionsResponse, patientConditionsResponse] = await Promise.all([
        api.get("/conditions"),
        api.get(`/patients/${id}/conditions`),
      ])
      setConditions(getResponseData(conditionsResponse) || [])
      setPatientConditions(getResponseData(patientConditionsResponse) || [])
    } catch (error) {
      setConditions([])
      setPatientConditions([])
      notifyError(getErrorMessage(error))
    } finally {
      setIsLoadingConditions(false)
    }
  }, [id, notifyError])

  const loadMedicalHistory = useCallback(async (page = medicalHistoryPage) => {
    setIsLoadingMedicalHistory(true)

    try {
      const response = await api.get(`/patients/${id}/medical-history?page=${page}&page_size=${pageSize}`)
      const data = getResponseData(response) || {}
      setMedicalHistory(data.items || [])
      setMedicalHistoryTotal(data.total || 0)
    } catch (error) {
      setMedicalHistory([])
      setMedicalHistoryTotal(0)
      notifyError(getErrorMessage(error))
    } finally {
      setIsLoadingMedicalHistory(false)
    }
  }, [id, medicalHistoryPage, notifyError])

  const loadAdmissionHistory = useCallback(async (page = admissionHistoryPage) => {
    setIsLoadingAdmissionHistory(true)

    try {
      const response = await api.get(`/patients/${id}/admission-history?page=${page}&page_size=${pageSize}`)
      const data = getResponseData(response) || {}
      setAdmissionHistory(data.items || [])
      setAdmissionHistoryTotal(data.total || 0)
    } catch (error) {
      setAdmissionHistory([])
      setAdmissionHistoryTotal(0)
      notifyError(getErrorMessage(error))
    } finally {
      setIsLoadingAdmissionHistory(false)
    }
  }, [admissionHistoryPage, id, notifyError])

  useEffect(() => {
    loadPatient()
  }, [loadPatient])

  useEffect(() => {
    loadAllergies(allergiesPage)
  }, [allergiesPage, loadAllergies])

  useEffect(() => {
    loadConditions()
  }, [loadConditions])

  useEffect(() => {
    loadMedicalHistory(medicalHistoryPage)
  }, [loadMedicalHistory, medicalHistoryPage])

  useEffect(() => {
    loadAdmissionHistory(admissionHistoryPage)
  }, [admissionHistoryPage, loadAdmissionHistory])

  const admissionActions = usePatientAdmissionActions({
    patientId: id,
    onPatientChange: setPatient,
    onHistoryRefresh: async () => {
      await loadAdmissionHistory(1)
      setAdmissionHistoryPage(1)
    },
    notifyError,
    notifySuccess,
  })

  useEffect(() => {
    const socket = createWebSocket((msg) => {
      if (String(msg.data?.patient_id) !== id) {
        return
      }

      if (msg.type === "vital") {
        const vital = {
          ...msg.data,
          time: new Date().toLocaleTimeString(),
        }

        setVitalsHistory((prev) => [...prev, vital])
        setVitals((prev) => [vital, ...prev.slice(0, 20)])
      }

      if (msg.type === "alert") {
        setAlerts((prev) => [msg.data, ...prev.slice(0, 10)])
        alertAudioRef.current.currentTime = 0
        alertAudioRef.current.play().catch(() => {
        })
      }
    })

    return () => {
      socket.close()
    }
  }, [id])

  const handleDepartmentTransfer = async ({department: nextDepartment, reason}) => {
    setIsUpdatingDepartment(true)

    try {
      const response = await api.patch(`/patients/${id}/department`, {
        department: nextDepartment,
        reason,
      })

      const patientData = getResponseData(response)
      setDepartment(patientData.department)
      setPatient((current) => current ? {...current, department: patientData.department} : current)
      notifySuccess(getResponseMessage(response))
      setIsTransferDialogOpen(false)
    } catch (error) {
      notifyError(getErrorMessage(error))
    } finally {
      setIsUpdatingDepartment(false)
    }
  }

  const handlePatientUpdate = async (payload) => {
    setIsSavingPatient(true)

    try {
      const response = await api.patch(`/patients/${id}`, payload)
      const patientData = getResponseData(response)
      setPatient(patientData)
      setDepartment(patientData.department)
      notifySuccess(getResponseMessage(response))
      setIsEditDialogOpen(false)
    } catch (error) {
      notifyError(getErrorMessage(error))
    } finally {
      setIsSavingPatient(false)
    }
  }

  const handleMedicationSubmit = async (event) => {
    event.preventDefault()

    if (!canSubmitMedication || isSubmittingMedication) {
      return
    }

    setIsSubmittingMedication(true)

    try {
      const response = await api.post(`/patients/${id}/medication`, {
        medication_name: medicationName,
        dosage,
      })

      setMedicationName("")
      setDosage("")
      notifySuccess(getResponseMessage(response))
    } catch (error) {
      notifyError(getErrorMessage(error))
    } finally {
      setIsSubmittingMedication(false)
    }
  }

  const handleAllergySubmit = async (event) => {
    event.preventDefault()

    if (!canSubmitAllergy || isSubmittingAllergy) {
      return
    }

    setIsSubmittingAllergy(true)

    try {
      const response = await api.post(`/patients/${id}/allergies`, {
        allergy_name: allergyName,
        severity: allergySeverity,
      })
      setAllergyName("")
      setAllergySeverity("mild")
      await loadAllergies(1)
      setAllergiesPage(1)
      notifySuccess(getResponseMessage(response))
    } catch (error) {
      notifyError(getErrorMessage(error))
    } finally {
      setIsSubmittingAllergy(false)
    }
  }

  const handleMedicalHistorySubmit = async (payload) => {
    if (!payload.condition_name.trim() || !payload.type.trim() || isSubmittingHistory) {
      return
    }

    setIsSubmittingHistory(true)

    try {
      const response = await api.post(`/patients/${id}/medical-history`, {
        condition_name: payload.condition_name,
        description: payload.description.trim() || null,
        type: payload.type,
      })
      await loadMedicalHistory(1)
      setMedicalHistoryPage(1)
      setIsMedicalHistoryDialogOpen(false)
      notifySuccess(getResponseMessage(response))
    } catch (error) {
      notifyError(getErrorMessage(error))
    } finally {
      setIsSubmittingHistory(false)
    }
  }

  const handlePatientConditionSubmit = async ({condition_id}) => {
    if (!condition_id || isSubmittingCondition) {
      return
    }

    setIsSubmittingCondition(true)

    try {
      const response = await api.post(`/patients/${id}/conditions`, {condition_id})
      setPatientConditions(getResponseData(response) || [])
      setIsConditionDialogOpen(false)
      notifySuccess(getResponseMessage(response))
    } catch (error) {
      notifyError(getErrorMessage(error))
    } finally {
      setIsSubmittingCondition(false)
    }
  }

  const latestDisplayedVital = vitals[0]
  const paginatedVitals = vitals.slice((vitalsPage - 1) * pageSize, vitalsPage * pageSize)
  const maxVitalsPage = Math.max(1, Math.ceil(vitals.length / pageSize))
  const maxAllergiesPage = Math.max(1, Math.ceil(allergiesTotal / pageSize))
  const maxMedicalHistoryPage = Math.max(1, Math.ceil(medicalHistoryTotal / pageSize))
  const maxAdmissionHistoryPage = Math.max(1, Math.ceil(admissionHistoryTotal / pageSize))
  const previewAlerts = alerts.slice(0, 3)
  const patientFullName = patient ? `${patient.last_name} ${patient.first_name}`.trim() : ""
  const pageTitle = patientFullName || (isLoadingPatient ? "Loading patient..." : "Patient")
  const patientBirthDate = patient?.birth_date ? formatDate(patient.birth_date) : "--"

  const patientAge = patient?.birth_date
    ? (() => {
      const today = new Date()
      const birthDate = new Date(patient.birth_date)
      let age = today.getFullYear() - birthDate.getFullYear()
      const monthDelta = today.getMonth() - birthDate.getMonth()

      if (monthDelta < 0 || (monthDelta === 0 && today.getDate() < birthDate.getDate())) {
        age -= 1
      }

      return `${age} yrs`
    })()
    : "--"

  const patientStreetAddress = patient?.address
    ? [
      `${patient.address.street || ""} ${patient.address.number || ""}`.trim(),
      patient.address.apartment ? `Apt ${patient.address.apartment}` : "",
      patient.address.city || "",
    ].filter(Boolean).join(", ")
    : ""
  const patientCountry = patient?.address?.country || "--"
  const patientCounty = patient?.address?.county || "--"

  const patientMetadata = [
    {label: "CNP", value: patient?.cnp || "--"},
    {label: "Birth Date", value: patientBirthDate},
    {label: "Age", value: patientAge},
    {label: "Gender", value: patient?.gender || "--"},
    {label: "Arrival Method", value: formatArrivalMethod(patient?.arrival_method)},
    {label: "Phone Number", value: patient?.phone_number ? formatPatientPhoneWithCode(patient.phone_number) : "--"},
    {label: "Country", value: patientCountry},
    {label: "County", value: patientCounty},
    {label: "Address", value: patientStreetAddress || "--", isWide: true},
  ]

  useEffect(() => {
    if (vitalsPage > maxVitalsPage) {
      setVitalsPage(maxVitalsPage)
    }
  }, [maxVitalsPage, vitalsPage])

  useEffect(() => {
    if (allergiesPage > maxAllergiesPage) {
      setAllergiesPage(maxAllergiesPage)
    }
  }, [allergiesPage, maxAllergiesPage])

  useEffect(() => {
    if (medicalHistoryPage > maxMedicalHistoryPage) {
      setMedicalHistoryPage(maxMedicalHistoryPage)
    }
  }, [maxMedicalHistoryPage, medicalHistoryPage])

  useEffect(() => {
    if (admissionHistoryPage > maxAdmissionHistoryPage) {
      setAdmissionHistoryPage(maxAdmissionHistoryPage)
    }
  }, [admissionHistoryPage, maxAdmissionHistoryPage])

  return (
    <div className="app-shell min-h-screen px-4 py-6 text-slate-100 sm:px-6 lg:px-8">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
        <header className="console-topbar rounded-[24px] p-6 sm:p-8">
          <div className="space-y-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.35em] text-[#ff9900]">Patient Monitoring</p>
            </div>

            <div>
              <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2">
                <h1 className="text-4xl font-semibold tracking-tight text-white sm:text-5xl">{pageTitle}</h1>

                <div className="group relative flex items-center">
                  <button
                    type="button"
                    onClick={() => setIsTransferDialogOpen(true)}
                    className="inline-flex rounded-full border border-[#3b424b] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-[#d5dbdb] transition hover:border-[#ff9900] hover:text-white"
                  >
                    {department || "--"}
                  </button>

                  <span
                    className="pointer-events-none absolute left-1/2 top-full z-50 mt-2 -translate-x-1/2 rounded-md border border-[#454c55] bg-[#0f141a] px-2 py-1 text-xs font-medium text-[#d5dbdb] opacity-0 transition-opacity duration-150 group-hover:opacity-100">
                      Move patient
                    </span>
                </div>

                <span
                  className={`inline-flex rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] ${
                    patient?.is_discharged
                      ? "border-[#7f1d1d] bg-[#3b1010] text-[#fecaca]"
                      : "border-[#1f4d36] bg-[#0e2519] text-[#bbf7d0]"
                  }`}
                >
                    {patient?.is_discharged ? "Discharged" : "Admitted"}
                </span>
              </div>

              <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
                <button
                  type="button"
                  onClick={() => setIsEditDialogOpen(true)}
                  className="inline-flex w-fit px-0 py-0 text-[11px] font-semibold uppercase tracking-[0.16em] text-[#9dccff] transition hover:text-white"
                >
                  Edit patient
                </button>

                <Link
                  to={`/patients/${id}/diagnosis`}
                  className="inline-flex w-fit px-0 py-0 text-[11px] font-semibold uppercase tracking-[0.16em] text-[#ffcc80] transition hover:text-white"
                >
                  Open diagnosis page
                </Link>

                <Link
                  to={`/patients/${id}/admission-history`}
                  className="inline-flex w-fit px-0 py-0 text-[11px] font-semibold uppercase tracking-[0.16em] text-[#b8f5c8] transition hover:text-white"
                >
                  Admission history
                </Link>
              </div>

              <div className="mt-4 border-t border-[#2b3139] pt-4">
                <div className="grid gap-6 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-6">
                  {patientMetadata.map((item) => (
                    <div
                      key={item.label}
                      className={item.isWide ? "xl:col-span-2" : ""}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#879196]">
                          {item.label}
                        </p>
                        {item.label === "Phone Number" && <BackButton/>}
                      </div>
                      <p
                        className={`mt-1 text-base font-semibold text-white ${item.isWide ? "break-words whitespace-normal leading-relaxed" : ""}`}
                      >
                        {item.value}
                      </p>
                    </div>
                  ))}
                </div>

                {patient?.is_discharged && (
                  <div className="mt-6 rounded-2xl border border-[#6b1d1d] bg-[#241212] p-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[#fca5a5]">Discharge Summary</p>
                    <div className="mt-3 grid gap-3 sm:grid-cols-2">
                      <div>
                        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#bfa7a7]">Date</p>
                        <p className="mt-1 text-sm font-medium text-white">{formatDateTime(patient.discharge_date)}</p>
                      </div>
                      <div className="sm:col-span-2">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#bfa7a7]">Reason</p>
                        <p className="mt-1 text-sm font-medium text-white">{patient.discharge_reason || "--"}</p>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </header>

        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
          <div className="monitor-card rounded-[24px] p-5">
            <p className="text-xs uppercase tracking-[0.25em] text-[#879196]">Heart Rate</p>
            <p className="mt-3 text-3xl font-semibold text-[#ffb84d]">{latestDisplayedVital ? latestDisplayedVital.heart_rate : "--"}</p>
          </div>

          <div className="monitor-card rounded-[24px] p-5">
            <p className="text-xs uppercase tracking-[0.25em] text-[#879196]">O2 Saturation</p>
            <p
              className="mt-3 text-3xl font-semibold text-[#9dccff]">{latestDisplayedVital ? latestDisplayedVital.oxygen_saturation : "--"}</p>
          </div>

          <div className="monitor-card rounded-[24px] p-5">
            <p className="text-xs uppercase tracking-[0.25em] text-[#879196]">Temperature</p>
            <p className="mt-3 text-3xl font-semibold text-[#ffd699]">{latestDisplayedVital ? latestDisplayedVital.temperature : "--"}</p>
          </div>

          <div className="monitor-card rounded-[24px] p-5">
            <p className="text-xs uppercase tracking-[0.25em] text-[#879196]">Blood Pressure</p>
            <p className="mt-3 text-3xl font-semibold text-white">
              {latestDisplayedVital ? `${latestDisplayedVital.systolic_bp}/${latestDisplayedVital.diastolic_bp}` : "--"}
            </p>
          </div>

          <div className="monitor-card rounded-[24px] p-5">
            <p className="text-xs uppercase tracking-[0.25em] text-[#879196]">Medical History</p>
            <p className="mt-3 text-3xl font-semibold text-[#9dccff]"><CountValue value={medicalHistory.length}/></p>
          </div>
        </section>

        <section className="grid gap-6 xl:grid-cols-[1.5fr_0.9fr]">
          <div className="monitor-card rounded-[28px] p-6">
            <div className="mb-5 flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.3em] text-[#ff9900]">Medical History</p>
                <h2 className="mt-2 text-2xl font-semibold text-white">Patient Medical History</h2>
              </div>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setIsMedicalHistoryDialogOpen(true)}
                  className="console-button-secondary rounded-2xl px-4 py-2 text-sm font-semibold"
                >
                  Add Medical History
                </button>
              </div>
            </div>

            <div className="mt-5">
              <PaginationControls
                page={medicalHistoryPage}
                maxPage={maxMedicalHistoryPage}
                onPrevious={() => setMedicalHistoryPage((prev) => Math.max(1, prev - 1))}
                onNext={() => setMedicalHistoryPage((prev) => prev + 1)}
              />

              <ul className="space-y-3">
                {medicalHistory.length === 0 && (
                  <li className="rounded-2xl border border-[#3b424b] bg-[#151b22] px-4 py-5 text-sm text-[#b6bec9]">
                    {isLoadingMedicalHistory ? "Loading medical history..." : "No medical history recorded for this patient."}
                  </li>
                )}

                {medicalHistory.map((entry) => (
                  <li key={entry.id} className="rounded-2xl border border-[#3b424b] bg-[#151b22] px-4 py-4">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <p className="text-sm font-semibold text-white">{entry.condition_name}</p>
                        <p className="mt-1 text-xs uppercase tracking-[0.22em] text-[#ffcc80]">{formatHistoryType(entry.type)}</p>
                        {entry.description && (
                          <p className="mt-2 text-sm text-[#c4ccd5]">{entry.description}</p>
                        )}
                      </div>
                      <div className="text-right text-xs text-[#879196]">
                        <p>{entry.date ? formatDate(entry.date) : formatDateTime(entry.created_at)}</p>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <div className="grid gap-6">
            <div className="monitor-card rounded-[28px] p-6">
              <div className="mb-5 flex items-center justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.3em] text-[#ff9900]">Escalations</p>
                  <h2 className="mt-2 text-2xl font-semibold text-white">Patient Alerts</h2>
                </div>
              </div>

              <ul className="space-y-3">
                {alerts.length === 0 && (
                  <li className="rounded-2xl border border-[#3b424b] bg-[#151b22] px-4 py-5 text-sm text-[#b6bec9]">
                    This patient has no alerts.
                  </li>
                )}

                {previewAlerts.map((alert) => (
                  <li key={alert.id} className={`alert-item alert-${alert.severity}`}>
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-xs uppercase tracking-[0.28em] text-white/70">{alert.severity} severity</p>
                        <p className="mt-2 text-sm font-medium text-inherit">{alert.message}</p>
                      </div>

                      <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/70">
                        {new Date(alert.created_at || Date.now()).toLocaleTimeString()}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>

              {alerts.length > 3 && (
                <div className="mt-4">
                  <Link
                    className="console-button-secondary block rounded-2xl px-4 py-3 text-center text-sm font-semibold"
                    to={patient?.cnp
                      ? `/alerts?cnp=${encodeURIComponent(patient.cnp)}&patient=${encodeURIComponent(patientFullName)}`
                      : "/alerts"}
                  >
                    More
                  </Link>
                </div>
              )}
            </div>

            <div className="monitor-card rounded-[28px] p-6">
              <div className="mb-5">
                <p className="text-xs font-semibold uppercase tracking-[0.3em] text-[#ff9900]">Medication</p>
                <h2 className="mt-2 text-2xl font-semibold text-white">Administer Medication</h2>
              </div>

              <form className="space-y-4" onSubmit={handleMedicationSubmit}>
                <input
                  type="text"
                  value={medicationName}
                  onChange={(event) => setMedicationName(event.target.value)}
                  placeholder="Medication name"
                  className="console-input w-full rounded-2xl px-4 py-3 outline-none"
                  required
                />

                <input
                  type="text"
                  value={dosage}
                  onChange={(event) => setDosage(event.target.value)}
                  placeholder="Dosage"
                  className="console-input w-full rounded-2xl px-4 py-3 outline-none"
                  required
                />

                <button
                  type="submit"
                  disabled={!canSubmitMedication || isSubmittingMedication}
                  className="console-button-primary w-full rounded-2xl px-4 py-3 font-semibold disabled:cursor-not-allowed disabled:border-[#4d5661] disabled:bg-[#3b424b] disabled:text-[#b6bec9]"
                >
                  {isSubmittingMedication ? "Submitting..." : "Administer Medication"}
                </button>
              </form>
            </div>
          </div>
        </section>

        <section className="grid gap-6 xl:grid-cols-2">
          <div className="monitor-card rounded-[28px] p-6">
            <div className="mb-5 flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.3em] text-[#ff9900]">Conditions</p>
                <h2 className="mt-2 text-2xl font-semibold text-white">Patient Conditions</h2>
              </div>
              <button
                type="button"
                onClick={() => setIsConditionDialogOpen(true)}
                disabled={conditions.length === 0}
                className="console-button-secondary rounded-2xl px-4 py-2 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-60"
              >
                Add Condition
              </button>
            </div>

            <ul className="space-y-3">
              {patientConditions.length === 0 && (
                <li className="rounded-2xl border border-[#3b424b] bg-[#151b22] px-4 py-5 text-sm text-[#b6bec9]">
                  {isLoadingConditions ? "Loading conditions..." : "No conditions assigned to this patient."}
                </li>
              )}

              {patientConditions.map((condition) => (
                <li key={condition.id} className="rounded-2xl border border-[#3b424b] bg-[#151b22] px-4 py-4">
                  <p className="text-sm font-semibold text-white">{condition.name}</p>
                  {condition.description && (
                    <p className="mt-2 text-sm text-[#c4ccd5]">{condition.description}</p>
                  )}
                </li>
              ))}
            </ul>
          </div>

          <div className="monitor-card rounded-[28px] p-6">
            <div className="mb-5">
              <p className="text-xs font-semibold uppercase tracking-[0.3em] text-[#ff9900]">Allergies</p>
              <h2 className="mt-2 text-2xl font-semibold text-white">Patient Allergies</h2>
            </div>

            <form className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_180px_auto]" onSubmit={handleAllergySubmit}>
              <input
                type="text"
                value={allergyName}
                onChange={(event) => setAllergyName(event.target.value)}
                placeholder="Allergy name"
                className="console-input w-full rounded-2xl px-4 py-3 outline-none"
                required
              />

              <select
                value={allergySeverity}
                onChange={(event) => setAllergySeverity(event.target.value)}
                className="console-input w-full rounded-2xl px-4 py-3 outline-none"
              >
                <option value="mild">Mild</option>
                <option value="moderate">Moderate</option>
                <option value="severe">Severe</option>
              </select>

              <button
                type="submit"
                disabled={!canSubmitAllergy || isSubmittingAllergy}
                className="console-button-primary rounded-2xl px-4 py-3 font-semibold disabled:cursor-not-allowed disabled:border-[#4d5661] disabled:bg-[#3b424b] disabled:text-[#b6bec9]"
              >
                {isSubmittingAllergy ? "Adding..." : "Add"}
              </button>
            </form>

            <div className="mt-5">
              <PaginationControls
                page={allergiesPage}
                maxPage={maxAllergiesPage}
                onPrevious={() => setAllergiesPage((prev) => Math.max(1, prev - 1))}
                onNext={() => setAllergiesPage((prev) => prev + 1)}
              />

              <ul className="space-y-3">
                {allergies.length === 0 && (
                  <li className="rounded-2xl border border-[#3b424b] bg-[#151b22] px-4 py-5 text-sm text-[#b6bec9]">
                    {isLoadingAllergies ? "Loading allergies..." : "No allergies recorded for this patient."}
                  </li>
                )}

                {allergies.map((allergy) => (
                  <li key={allergy.id} className="rounded-2xl border border-[#3b424b] bg-[#151b22] px-4 py-4">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-white">{allergy.allergy_name}</p>
                        <p className="mt-1 text-xs uppercase tracking-[0.22em] text-[#879196]">{allergy.severity}</p>
                      </div>
                      <span className="text-xs text-[#879196]">{formatDateTime(allergy.created_at)}</span>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>
        <section className="grid gap-6">
          <div className="monitor-card rounded-[28px] p-6">
            <div className="mb-5 flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.3em] text-[#ff9900]">Vitals</p>
                <h2 className="mt-2 text-2xl font-semibold text-white">Vitals Timeline</h2>
              </div>
              <span className="console-chip rounded-full px-3 py-1 text-xs font-semibold">
                {vitals.length} visible
              </span>
            </div>

            <PaginationControls
              page={vitalsPage}
              maxPage={maxVitalsPage}
              onPrevious={() => setVitalsPage((prev) => Math.max(1, prev - 1))}
              onNext={() => setVitalsPage((prev) => prev + 1)}
            />

            <ul className="space-y-3">
              {vitals.length === 0 && (
                <li className="rounded-2xl border border-[#3b424b] bg-[#151b22] px-4 py-5 text-sm text-[#b6bec9]">
                  {isLoadingPatient ? "Loading patient view..." : "Waiting for patient vitals. Data will appear here when available."}
                </li>
              )}

              {paginatedVitals.map((v, index) => (
                <li key={`${v.recorded_at || v.time}-${index}`} className="rounded-2xl border border-[#3b424b] bg-[#151b22] p-4">
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:gap-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.25em] text-[#879196]">{v.time}</p>

                    <div className="grid flex-1 grid-cols-2 gap-3 sm:grid-cols-4">
                      <div className="monitor-panel rounded-2xl px-3 py-3">
                        <p className="text-xs uppercase tracking-[0.22em] text-[#879196]">HR</p>
                        <p className="mt-2 font-semibold text-[#ffb84d]">{v.heart_rate}</p>
                      </div>

                      <div className="monitor-panel rounded-2xl px-3 py-3">
                        <p className="text-xs uppercase tracking-[0.22em] text-[#879196]">O2</p>
                        <p className="mt-2 font-semibold text-[#9dccff]">{v.oxygen_saturation}</p>
                      </div>

                      <div className="monitor-panel rounded-2xl px-3 py-3">
                        <p className="text-xs uppercase tracking-[0.22em] text-[#879196]">Temp</p>
                        <p className="mt-2 font-semibold text-[#ffd699]">{v.temperature}</p>
                      </div>

                      <div className="monitor-panel rounded-2xl px-3 py-3">
                        <p className="text-xs uppercase tracking-[0.22em] text-[#879196]">BP</p>
                        <p className="mt-2 font-semibold text-white">{v.systolic_bp}/{v.diastolic_bp}</p>
                      </div>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </section>
      </div>

      <EditPatientDialog
        isOpen={isEditDialogOpen}
        isSubmitting={isSavingPatient}
        patient={patient}
        onClose={() => setIsEditDialogOpen(false)}
        onSubmit={handlePatientUpdate}
      />

      <DepartmentTransferDialog
        currentDepartment={department}
        isOpen={isTransferDialogOpen}
        isSubmitting={isUpdatingDepartment}
        onClose={() => setIsTransferDialogOpen(false)}
        onSubmit={handleDepartmentTransfer}
      />

      <MedicalHistoryDialog
        isOpen={isMedicalHistoryDialogOpen}
        isSubmitting={isSubmittingHistory}
        onClose={() => setIsMedicalHistoryDialogOpen(false)}
        onSubmit={handleMedicalHistorySubmit}
      />

      <PatientConditionDialog
        conditions={conditions.filter((condition) => !patientConditions.some((assignedCondition) => assignedCondition.id === condition.id))}
        isOpen={isConditionDialogOpen}
        isSubmitting={isSubmittingCondition}
        onClose={() => setIsConditionDialogOpen(false)}
        onSubmit={handlePatientConditionSubmit}
      />
    </div>
  )
}
