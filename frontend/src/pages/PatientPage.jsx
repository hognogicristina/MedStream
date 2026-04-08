import {useEffect, useRef, useState} from "react"
import BackButton from "../components/BackButton"
import CountValue from "../components/CountValue"
import {Link, useParams} from "react-router-dom"
import {api} from "../services/api"
import {createWebSocket} from "../services/ws"

export default function PatientPage() {
  const {id} = useParams()
  const pageSize = 5
  const [vitals, setVitals] = useState([])
  const [vitalsHistory, setVitalsHistory] = useState([])
  const [replayVitals, setReplayVitals] = useState([])
  const [alerts, setAlerts] = useState([])
  const [events, setEvents] = useState([])
  const [isReplaying, setIsReplaying] = useState(false)
  const [department, setDepartment] = useState("")
  const [isUpdatingDepartment, setIsUpdatingDepartment] = useState(false)
  const [departmentMessage, setDepartmentMessage] = useState("")
  const [departmentMessageIsError, setDepartmentMessageIsError] = useState(false)
  const [isLoadingPatient, setIsLoadingPatient] = useState(true)
  const [medicationName, setMedicationName] = useState("")
  const [dosage, setDosage] = useState("")
  const [isSubmittingMedication, setIsSubmittingMedication] = useState(false)
  const [medicationMessage, setMedicationMessage] = useState("")
  const [medicationMessageIsError, setMedicationMessageIsError] = useState(false)
  const [vitalsPage, setVitalsPage] = useState(1)
  const [alertsPage, setAlertsPage] = useState(1)
  const alertAudioRef = useRef(null)
  const replayIntervalRef = useRef(null)

  if (!alertAudioRef.current) {
    alertAudioRef.current = new Audio("/alert.mp3")
  }

  useEffect(() => {
    setVitals([])
    setVitalsHistory([])
    setReplayVitals([])
    setAlerts([])
    setEvents([])
    setIsReplaying(false)
    setDepartment("")
    setDepartmentMessage("")
    setDepartmentMessageIsError(false)
    setMedicationMessage("")
    setMedicationMessageIsError(false)
    setVitalsPage(1)
    setAlertsPage(1)

    if (replayIntervalRef.current) {
      clearInterval(replayIntervalRef.current)
      replayIntervalRef.current = null
    }
  }, [id])

  useEffect(() => {
    const loadPatient = async () => {
      setDepartmentMessage("")
      setDepartmentMessageIsError(false)
      setIsLoadingPatient(true)

      try {
        const response = await api.get(`/patients/${id}`)
        setDepartment(response.data.department)
      } catch {
        setDepartment("")
        setDepartmentMessageIsError(true)
        setDepartmentMessage("Unable to load patient department")
      } finally {
        setIsLoadingPatient(false)
      }
    }

    loadPatient()
  }, [id])

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

      if (replayIntervalRef.current) {
        clearInterval(replayIntervalRef.current)
      }
    }
  }, [id])

  const handleReplay = () => {
    if (replayIntervalRef.current) {
      clearInterval(replayIntervalRef.current)
    }

    if (vitalsHistory.length === 0) {
      return
    }

    setIsReplaying(true)
    setReplayVitals([])

    let index = 0

    replayIntervalRef.current = setInterval(() => {
      const vital = vitalsHistory[index]

      if (!vital) {
        clearInterval(replayIntervalRef.current)
        replayIntervalRef.current = null
        setIsReplaying(false)
        setReplayVitals([])
        return
      }

      setReplayVitals((prev) => [vital, ...prev])
      index += 1
    }, 800)
  }

  const handleDepartmentChange = async (event) => {
    const nextDepartment = event.target.value
    setDepartmentMessage("")
    setDepartmentMessageIsError(false)
    setIsUpdatingDepartment(true)

    try {
      const response = await api.patch(`/patients/${id}/department`, {
        department: nextDepartment,
      })

      setDepartment(response.data.department)
      setDepartmentMessage("Department updated")
      setDepartmentMessageIsError(false)
      setEvents((prev) => [
        {
          event_type: "department_updated",
          message: `Moved to ${response.data.department}`,
          timestamp: new Date().toLocaleTimeString(),
        },
        ...prev.slice(0, 9),
      ])
    } catch {
      setDepartmentMessageIsError(true)
      setDepartmentMessage("Unable to update department")
    } finally {
      setIsUpdatingDepartment(false)
    }
  }

  const handleMedicationSubmit = async (event) => {
    event.preventDefault()
    setMedicationMessage("")
    setMedicationMessageIsError(false)
    setIsSubmittingMedication(true)

    try {
      const response = await api.post(`/patients/${id}/medication`, {
        medication_name: medicationName,
        dosage,
      })

      setMedicationName("")
      setDosage("")
      setMedicationMessage("Medication administered")
      setMedicationMessageIsError(false)
      setEvents((prev) => [
        {
          event_type: "medication_administered",
          message: `Medication administered: ${response.data.medication_name} (${response.data.dosage})`,
          timestamp: response.data.timestamp,
        },
        ...prev.slice(0, 9),
      ])
    } catch {
      setMedicationMessageIsError(true)
      setMedicationMessage("Unable to administer medication")
    } finally {
      setIsSubmittingMedication(false)
    }
  }

  const displayedVitals = isReplaying ? replayVitals : vitals
  const latestDisplayedVital = displayedVitals[0]
  const paginatedVitals = displayedVitals.slice((vitalsPage - 1) * pageSize, vitalsPage * pageSize)
  const paginatedAlerts = alerts.slice((alertsPage - 1) * pageSize, alertsPage * pageSize)
  const maxVitalsPage = Math.max(1, Math.ceil(displayedVitals.length / pageSize))
  const maxAlertsPage = Math.max(1, Math.ceil(alerts.length / pageSize))

  useEffect(() => {
    if (vitalsPage > maxVitalsPage) {
      setVitalsPage(maxVitalsPage)
    }
  }, [vitalsPage, maxVitalsPage])

  useEffect(() => {
    if (alertsPage > maxAlertsPage) {
      setAlertsPage(maxAlertsPage)
    }
  }, [alertsPage, maxAlertsPage])

  return (
    <div className="app-shell min-h-screen px-4 py-6 text-slate-100 sm:px-6 lg:px-8">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
        <header className="console-topbar rounded-[24px] p-6 sm:p-8">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div className="space-y-3">
              <div className="flex items-start justify-between gap-4">
                <div className="flex flex-wrap items-center gap-3">
                  <p className="text-xs font-semibold uppercase tracking-[0.35em] text-[#ff9900]">Patient Monitoring</p>
                  <Link className="console-link text-sm font-semibold" to="/">
                    Home
                  </Link>
                </div>
                <BackButton/>
              </div>
              <div>
                <h1 className="mt-2 text-3xl font-semibold tracking-tight text-white sm:text-4xl">Patient Details: {id}</h1>
                <p className="mt-2 max-w-2xl text-sm text-[#b6bec9]">
                  Single-patient operational view for vitals, alerts, medication activity, and department assignment.
                </p>
              </div>
            </div>

            <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center">
              <div className="flex flex-col gap-2">
                <label className="text-xs font-semibold uppercase tracking-[0.25em] text-[#879196]" htmlFor="department">
                  Department
                </label>
                <select
                  id="department"
                  value={department}
                  onChange={handleDepartmentChange}
                  disabled={isUpdatingDepartment || isLoadingPatient}
                  className="console-input rounded-full px-4 py-2 text-sm font-medium outline-none disabled:cursor-not-allowed disabled:text-[#6b7280]"
                >
                  <option value="ER">ER</option>
                  <option value="ICU">ICU</option>
                  <option value="Cardiology">Cardiology</option>
                  <option value="Internal Medicine">Internal Medicine</option>
                  <option value="Neurology">Neurology</option>
                  <option value="Ward">Ward</option>
                </select>
                {departmentMessage && (
                  <p className={departmentMessageIsError ? "login-error" : "login-success"}>{departmentMessage}</p>
                )}
              </div>
              <div className="console-chip rounded-full px-4 py-2 text-sm font-medium">
                {isReplaying ? "Replay running" : "Live stream active"}
              </div>
              <button
                className="console-button-primary rounded-full px-5 py-2.5 text-sm font-semibold disabled:cursor-not-allowed disabled:border-[#4d5661] disabled:bg-[#3b424b] disabled:text-[#b6bec9]"
                onClick={handleReplay}
                disabled={vitalsHistory.length === 0 || isReplaying}
              >
                {isReplaying ? "Replaying..." : "Replay"}
              </button>
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
                <p className="text-xs font-semibold uppercase tracking-[0.3em] text-[#ff9900]">
                  {isReplaying ? "Replay Mode" : "Live Feed"}
                </p>
                <h2 className="mt-2 text-2xl font-semibold text-white">Vitals Timeline</h2>
              </div>
              <span className="console-chip rounded-full px-3 py-1 text-xs font-semibold">
                {displayedVitals.length} visible
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
              {displayedVitals.length === 0 && (
                <li className="rounded-2xl border border-[#3b424b] bg-[#151b22] px-4 py-5 text-sm text-[#b6bec9]">
                  {isLoadingPatient ? "Loading patient view..." : "Waiting for patient vitals. Live streaming data will appear here when available."}
                </li>
              )}
              {paginatedVitals.map((v, i) => (
                <li key={i} className="rounded-2xl border border-[#3b424b] bg-[#151b22] p-4">
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                    <div>
                      <p className="text-xs uppercase tracking-[0.25em] text-[#879196]">{v.time}</p>
                      <p className="mt-2 text-base font-semibold text-white">Patient {id} vital snapshot</p>
                    </div>
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
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
                <span className="console-chip-danger rounded-full px-3 py-1 text-xs font-semibold"><CountValue
                  value={alerts.length}/></span>
              </div>
              <div className="mb-4 flex items-center justify-between gap-3">
                <div className="console-chip rounded-full px-3 py-1 text-xs font-medium">
                  Page {alertsPage}
                </div>
                <div className="flex items-center gap-2">
                  <button
                    className="console-button-ghost rounded-full px-3 py-1.5 text-xs font-medium disabled:cursor-not-allowed disabled:border-[#31363f] disabled:text-[#6b7280]"
                    onClick={() => setAlertsPage((prev) => Math.max(1, prev - 1))}
                    disabled={alertsPage === 1}
                  >
                    Previous
                  </button>
                  <button
                    className="console-button-ghost rounded-full px-3 py-1.5 text-xs font-medium disabled:cursor-not-allowed disabled:border-[#31363f] disabled:text-[#6b7280]"
                    onClick={() => setAlertsPage((prev) => prev + 1)}
                    disabled={alertsPage >= maxAlertsPage}
                  >
                    Next
                  </button>
                </div>
              </div>
              <ul className="space-y-3">
                {alerts.length === 0 && (
                  <li className="rounded-2xl border border-[#3b424b] bg-[#151b22] px-4 py-5 text-sm text-[#b6bec9]">
                    No alert activity for this patient yet.
                  </li>
                )}
                {paginatedAlerts.map((a, i) => (
                  <li key={i} className={`alert-item alert-${a.severity}`}>
                    <p className="text-xs uppercase tracking-[0.25em] text-white/70">{a.severity} severity</p>
                    <p className="mt-2 text-sm font-medium text-inherit">{a.message}</p>
                  </li>
                ))}
              </ul>
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
                {medicationMessage && (
                  <p className={medicationMessageIsError ? "login-error" : "login-success"}>{medicationMessage}</p>
                )}
                <button
                  type="submit"
                  disabled={isSubmittingMedication}
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
                <span className="console-chip-success rounded-full px-3 py-1 text-xs font-semibold"><CountValue
                  value={events.length}/></span>
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
    </div>
  )
}
