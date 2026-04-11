import {useEffect, useRef, useState} from "react"
import BackButton from "../components/BackButton"
import CountValue from "../components/CountValue"
import DepartmentTransferDialog from "../components/DepartmentTransferDialog"
import EditPatientDialog from "../components/EditPatientDialog"
import {useNotifications} from "../components/NotificationProvider"
import {useParams, Link} from "react-router-dom"
import {api} from "../services/api"
import {createWebSocket} from "../services/ws"
import {formatPatientPhoneNumber} from "../utils/patientPhone"
import {formatPatientAddress} from "../utils/patientAddress"

export default function PatientPage() {
  const {notifyError, notifySuccess} = useNotifications()
  const {id} = useParams()
  const pageSize = 5
  const [patient, setPatient] = useState(null)
  const [vitals, setVitals] = useState([])
  const [vitalsHistory, setVitalsHistory] = useState([])
  const [alerts, setAlerts] = useState([])
  const [events, setEvents] = useState([])
  const [department, setDepartment] = useState("")
  const [isUpdatingDepartment, setIsUpdatingDepartment] = useState(false)
  const [isLoadingPatient, setIsLoadingPatient] = useState(true)
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false)
  const [isSavingPatient, setIsSavingPatient] = useState(false)
  const [isTransferDialogOpen, setIsTransferDialogOpen] = useState(false)
  const [medicationName, setMedicationName] = useState("")
  const [dosage, setDosage] = useState("")
  const [isSubmittingMedication, setIsSubmittingMedication] = useState(false)
  const [vitalsPage, setVitalsPage] = useState(1)
  const alertAudioRef = useRef(null)
  const canSubmitMedication = medicationName.trim().length > 0 && dosage.trim().length > 0

  if (!alertAudioRef.current) {
    alertAudioRef.current = new Audio("/alert.mp3")
  }

  useEffect(() => {
    setPatient(null)
    setVitals([])
    setVitalsHistory([])
    setAlerts([])
    setEvents([])
    setDepartment("")
    setVitalsPage(1)
    setIsEditDialogOpen(false)
    setIsTransferDialogOpen(false)
  }, [id])

  useEffect(() => {
    const loadPatient = async () => {
      setIsLoadingPatient(true)

      try {
        const response = await api.get(`/patients/${id}`)
        setPatient(response.data)
        setDepartment(response.data.department)
      } catch {
        setPatient(null)
        setDepartment("")
        notifyError("Unable to load patient department")
      } finally {
        setIsLoadingPatient(false)
      }
    }

    loadPatient()
  }, [id, notifyError])

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

      if (msg.type === "event") {
        setEvents((prev) => [msg.data, ...prev.slice(0, 9)])
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

      setDepartment(response.data.department)
      setPatient((current) => current ? {...current, department: response.data.department} : current)
      notifySuccess("Department transfer recorded")
      setIsTransferDialogOpen(false)
    } catch {
      notifyError("Unable to update department")
    } finally {
      setIsUpdatingDepartment(false)
    }
  }

  const handlePatientUpdate = async (payload) => {
    setIsSavingPatient(true)

    try {
      const response = await api.patch(`/patients/${id}`, payload)
      setPatient(response.data)
      setDepartment(response.data.department)
      notifySuccess("Patient details updated")
      setIsEditDialogOpen(false)
    } catch (error) {
      notifyError(error.response?.data?.detail || "Unable to update patient details")
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
      notifySuccess("Medication administered")
    } catch {
      notifyError("Unable to administer medication")
    } finally {
      setIsSubmittingMedication(false)
    }
  }

  const latestDisplayedVital = vitals[0]
  const paginatedVitals = vitals.slice((vitalsPage - 1) * pageSize, vitalsPage * pageSize)
  const maxVitalsPage = Math.max(1, Math.ceil(vitals.length / pageSize))
  const previewAlerts = alerts.slice(0, 3)
  const patientFullName = patient ? `${patient.last_name} ${patient.first_name}`.trim() : ""
  const pageTitle = patientFullName || (isLoadingPatient ? "Loading patient..." : "Patient")
  const patientBirthDate = patient?.birth_date
    ? new Intl.DateTimeFormat("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    }).format(new Date(patient.birth_date))
    : "--"
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
  const patientMetadata = [
    {label: "CNP", value: patient?.cnp || "--"},
    {label: "Birth Date", value: patientBirthDate},
    {label: "Age", value: patientAge},
    {label: "Gender", value: patient?.gender || "--"},
    {label: "Phone Number", value: patient?.phone_number ? formatPatientPhoneNumber(patient.phone_number) : "--"},
  ]
  const patientAddress = patient?.address ? formatPatientAddress(patient.address) : ""

  useEffect(() => {
    if (vitalsPage > maxVitalsPage) {
      setVitalsPage(maxVitalsPage)
    }
  }, [vitalsPage, maxVitalsPage])

  return (
    <div className="app-shell min-h-screen px-4 py-6 text-slate-100 sm:px-6 lg:px-8">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
        <header className="console-topbar rounded-[24px] p-6 sm:p-8">
          <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-start">
            <div className="space-y-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.35em] text-[#ff9900]">Patient Monitoring</p>
              </div>
              <div>
                <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2">
                  <h1 className="text-4xl font-semibold tracking-tight text-white sm:text-5xl">{pageTitle}</h1>
                  <button
                    type="button"
                    onClick={() => setIsTransferDialogOpen(true)}
                    className="inline-flex rounded-full border border-[#3b424b] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-[#d5dbdb] transition hover:border-[#ff9900] hover:text-white"
                  >
                    {department || "--"}
                  </button>
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
                  <button
                    type="button"
                    onClick={() => setIsEditDialogOpen(true)}
                    className="inline-flex w-fit px-0 py-0 text-[11px] font-semibold uppercase tracking-[0.16em] text-[#9dccff] transition hover:text-white"
                  >
                    Edit patient
                  </button>
                </div>
                <div className="mt-4 border-t border-[#2b3139] pt-4">
                  <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
                  {patientMetadata.map((item) => (
                    <div key={item.label} className="flex min-w-[96px] flex-col justify-center">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#879196]">{item.label}</p>
                        <p className="mt-1 text-base font-semibold text-white">{item.value}</p>
                    </div>
                  ))}
                  </div>
                  <div className="mt-4 border-t border-[#2b3139] pt-4">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#879196]">Address</p>
                    <p className="mt-1 text-base font-semibold text-white">{patientAddress || "--"}</p>
                  </div>
                </div>
              </div>
            </div>

            <div className="flex justify-start lg:justify-end lg:pt-1">
              <BackButton/>
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
            <p className="text-xs uppercase tracking-[0.25em] text-[#879196]">History</p>
            <p className="mt-3 text-3xl font-semibold text-[#9dccff]"><CountValue value={vitalsHistory.length}/></p>
          </div>
        </section>

        <section className="grid gap-6 xl:grid-cols-[1.5fr_0.9fr]">
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
            <div className="mb-4 flex items-center justify-between gap-3">
              <div className="console-chip rounded-full px-3 py-1 text-xs font-medium">
                Page {vitalsPage}
              </div>
              <div className="flex items-center gap-2">
                <button
                  className="console-button-ghost rounded-full px-3 py-1.5 text-xs font-medium disabled:cursor-not-allowed disabled:border-[#31363f] disabled:text-[#6b7280]"
                  onClick={() => setVitalsPage((prev) => Math.max(1, prev - 1))}
                  disabled={vitalsPage === 1}
                >
                  Previous
                </button>
                <button
                  className="console-button-ghost rounded-full px-3 py-1.5 text-xs font-medium disabled:cursor-not-allowed disabled:border-[#31363f] disabled:text-[#6b7280]"
                  onClick={() => setVitalsPage((prev) => prev + 1)}
                  disabled={vitalsPage >= maxVitalsPage}
                >
                  Next
                </button>
              </div>
            </div>
            <ul className="space-y-3">
              {vitals.length === 0 && (
                <li className="rounded-2xl border border-[#3b424b] bg-[#151b22] px-4 py-5 text-sm text-[#b6bec9]">
                  {isLoadingPatient ? "Loading patient view..." : "Waiting for patient vitals. Data will appear here when available."}
                </li>
              )}
              {paginatedVitals.map((v, i) => (
                <li key={i} className="rounded-2xl border border-[#3b424b] bg-[#151b22] p-4">
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:gap-4">
                    <div>
                      <p className="rounded-full border border-[#31363f] bg-[#10151c] px-3 py-1 text-xs font-semibold uppercase tracking-[0.25em] text-[#879196]">
                        {v.time}
                      </p>
                    </div>
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
                    No alert activity for this patient yet.
                  </li>
                )}
                {previewAlerts.map((alert) => (
                  <li key={alert.id} className={`alert-item alert-${alert.severity}`}>
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-xs uppercase tracking-[0.28em] text-white/70">{alert.severity} severity</p>
                        <p className="mt-2 text-sm font-medium text-inherit">{alert.message}</p>
                      </div>
                      <span className="rounded-full border border-white/10 bg-black/10 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-white/70">
                        {new Date(alert.created_at || Date.now()).toLocaleTimeString()}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
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

            <div className="monitor-card rounded-[28px] p-6">
              <div className="mb-5 flex items-center justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.3em] text-[#ff9900]">Event Feed</p>
                  <h2 className="mt-2 text-2xl font-semibold text-white">Patient Events</h2>
                </div>
              </div>
              <ul className="space-y-3">
                {events.length === 0 && (
                  <li className="rounded-2xl border border-[#3b424b] bg-[#151b22] px-4 py-5 text-sm text-[#b6bec9]">
                    No patient events yet.
                  </li>
                )}
                {events.map((event, i) => (
                  <li key={i} className="rounded-2xl border border-[#3b424b] bg-[#1b2430] px-4 py-4">
                    <p className="text-xs uppercase tracking-[0.25em] text-[#9dccff]">{event.time || event.timestamp}</p>
                    <p className="mt-2 text-sm font-medium text-white">{event.message || event.event_type || "Patient event"}</p>
                  </li>
                ))}
              </ul>
            </div>
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
    </div>
  )
}
