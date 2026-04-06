import { useEffect, useRef, useState } from "react"
import { Link, useNavigate, useParams } from "react-router-dom"
import { useAuth } from "../auth/AuthContext"
import { api } from "../services/api"
import { createWebSocket } from "../services/ws"

export default function PatientPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { logout } = useAuth()
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
  const [isLoadingPatient, setIsLoadingPatient] = useState(true)
  const [medicationName, setMedicationName] = useState("")
  const [dosage, setDosage] = useState("")
  const [isSubmittingMedication, setIsSubmittingMedication] = useState(false)
  const [medicationMessage, setMedicationMessage] = useState("")
  const [vitalsPage, setVitalsPage] = useState(1)
  const [alertsPage, setAlertsPage] = useState(1)
  const alertAudioRef = useRef(null)
  const replayIntervalRef = useRef(null)

  if (!alertAudioRef.current) {
    alertAudioRef.current = new Audio("/alert.mp3")
  }

  useEffect(() => {
    const loadPatient = async () => {
      setDepartmentMessage("")
      setIsLoadingPatient(true)

      try {
        const response = await api.get(`/patients/${id}`)
        setDepartment(response.data.department)
      } catch {
        setDepartment("")
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
        alertAudioRef.current.play().catch(() => {})
      }

      if (msg.type === "event") {
        setEvents((prev) => [
          {
            ...msg.data,
            time: new Date().toLocaleTimeString(),
          },
          ...prev.slice(0, 9),
        ])
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
    const previousDepartment = department

    setDepartment(nextDepartment)
    setDepartmentMessage("")
    setIsUpdatingDepartment(true)

    try {
      const response = await api.patch(`/patients/${id}/department`, {
        department: nextDepartment,
      })

      setDepartment(response.data.department)
      setDepartmentMessage("Department updated")
    } catch {
      setDepartment(previousDepartment)
      setDepartmentMessage("Unable to update department")
    } finally {
      setIsUpdatingDepartment(false)
    }
  }

  const handleMedicationSubmit = async (event) => {
    event.preventDefault()
    setMedicationMessage("")
    setIsSubmittingMedication(true)

    try {
      await api.post(`/patients/${id}/medication`, {
        medication_name: medicationName,
        dosage,
      })

      setMedicationName("")
      setDosage("")
      setMedicationMessage("Medication administered")
    } catch {
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

  const handleLogout = () => {
    logout()
    navigate("/")
  }

  return (
    <div className="min-h-screen px-4 py-6 text-slate-100 sm:px-6 lg:px-8">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
        <header className="monitor-card rounded-[28px] p-6 sm:p-8">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div className="space-y-3">
              <Link className="inline-flex items-center rounded-full border border-cyan-400/25 bg-cyan-500/10 px-4 py-2 text-sm font-medium text-cyan-200 transition hover:bg-cyan-500/15" to="/dashboard">
                Back to dashboard
              </Link>
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.35em] text-cyan-300">Patient Monitoring</p>
                <h1 className="mt-2 text-3xl font-semibold tracking-tight text-white sm:text-4xl">Patient Details: {id}</h1>
                <p className="mt-2 max-w-2xl text-sm text-slate-300">
                  Live single-patient stream with alerting and replay for timeline review.
                </p>
              </div>
            </div>

            <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center">
              <button
                className="rounded-full border border-slate-700 bg-slate-900/80 px-4 py-2 text-sm font-medium text-slate-300 transition hover:border-slate-500 hover:bg-slate-800"
                onClick={handleLogout}
              >
                Logout
              </button>
              <div className="flex flex-col gap-2">
                <label className="text-xs font-semibold uppercase tracking-[0.25em] text-slate-400" htmlFor="department">
                  Department
                </label>
                <select
                  id="department"
                  value={department}
                  onChange={handleDepartmentChange}
                  disabled={isUpdatingDepartment || isLoadingPatient}
                  className="rounded-full border border-slate-700 bg-slate-950/80 px-4 py-2 text-sm font-medium text-white outline-none transition focus:border-cyan-400 disabled:cursor-not-allowed disabled:text-slate-500"
                >
                  <option value="ER">ER</option>
                  <option value="ICU">ICU</option>
                  <option value="Ward">Ward</option>
                </select>
                {departmentMessage && (
                  <p className="text-xs text-slate-400">{departmentMessage}</p>
                )}
              </div>
              <div className="rounded-full bg-slate-900/80 px-4 py-2 text-sm font-medium text-slate-300">
                {isReplaying ? "Replay running" : "Live stream active"}
              </div>
              <button
                className="rounded-full bg-cyan-400 px-5 py-2.5 text-sm font-semibold text-slate-950 transition hover:bg-cyan-300 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-400"
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
            <p className="text-xs uppercase tracking-[0.25em] text-slate-400">Heart Rate</p>
            <p className="mt-3 text-3xl font-semibold text-rose-300">{latestDisplayedVital ? latestDisplayedVital.heart_rate : "--"}</p>
          </div>
          <div className="monitor-card rounded-[24px] p-5">
            <p className="text-xs uppercase tracking-[0.25em] text-slate-400">O2 Saturation</p>
            <p className="mt-3 text-3xl font-semibold text-emerald-300">{latestDisplayedVital ? latestDisplayedVital.oxygen_saturation : "--"}</p>
          </div>
          <div className="monitor-card rounded-[24px] p-5">
            <p className="text-xs uppercase tracking-[0.25em] text-slate-400">Temperature</p>
            <p className="mt-3 text-3xl font-semibold text-amber-300">{latestDisplayedVital ? latestDisplayedVital.temperature : "--"}</p>
          </div>
          <div className="monitor-card rounded-[24px] p-5">
            <p className="text-xs uppercase tracking-[0.25em] text-slate-400">Blood Pressure</p>
            <p className="mt-3 text-3xl font-semibold text-white">
              {latestDisplayedVital ? `${latestDisplayedVital.systolic_bp}/${latestDisplayedVital.diastolic_bp}` : "--"}
            </p>
          </div>
          <div className="monitor-card rounded-[24px] p-5">
            <p className="text-xs uppercase tracking-[0.25em] text-slate-400">History</p>
            <p className="mt-3 text-3xl font-semibold text-cyan-200">{vitalsHistory.length}</p>
          </div>
        </section>

        <section className="grid gap-6 xl:grid-cols-[1.5fr_0.9fr]">
          <div className="monitor-card rounded-[28px] p-6">
            <div className="mb-5 flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.3em] text-cyan-300">
                  {isReplaying ? "Replay Mode" : "Live Feed"}
                </p>
                <h2 className="mt-2 text-2xl font-semibold text-white">Vitals Timeline</h2>
              </div>
              <span className="rounded-full bg-slate-800 px-3 py-1 text-xs font-semibold text-slate-300">
                {displayedVitals.length} visible
              </span>
            </div>
            <div className="mb-4 flex items-center justify-between gap-3">
              <div className="rounded-full bg-slate-900/80 px-3 py-1 text-xs font-medium text-slate-300">
                Page {vitalsPage}
              </div>
              <div className="flex items-center gap-2">
                <button
                  className="rounded-full border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs font-medium text-slate-200 transition hover:border-slate-500 hover:bg-slate-800 disabled:cursor-not-allowed disabled:border-slate-800 disabled:text-slate-500"
                  onClick={() => setVitalsPage((prev) => Math.max(1, prev - 1))}
                  disabled={vitalsPage === 1}
                >
                  Previous
                </button>
                <button
                  className="rounded-full border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs font-medium text-slate-200 transition hover:border-slate-500 hover:bg-slate-800 disabled:cursor-not-allowed disabled:border-slate-800 disabled:text-slate-500"
                  onClick={() => setVitalsPage((prev) => prev + 1)}
                  disabled={vitalsPage >= maxVitalsPage}
                >
                  Next
                </button>
              </div>
            </div>
            <ul className="space-y-3">
              {displayedVitals.length === 0 && (
                <li className="rounded-2xl border border-slate-800 bg-slate-950/50 px-4 py-5 text-sm text-slate-400">
                  Waiting for patient vitals.
                </li>
              )}
              {paginatedVitals.map((v, i) => (
                <li key={i} className="rounded-2xl border border-slate-800 bg-slate-950/60 p-4">
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                    <div>
                      <p className="text-xs uppercase tracking-[0.25em] text-slate-500">{v.time}</p>
                      <p className="mt-2 text-base font-semibold text-white">Patient {id} vital snapshot</p>
                    </div>
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                      <div className="rounded-2xl bg-slate-900/80 px-3 py-3">
                        <p className="text-xs uppercase tracking-[0.22em] text-slate-500">HR</p>
                        <p className="mt-2 font-semibold text-rose-300">{v.heart_rate}</p>
                      </div>
                      <div className="rounded-2xl bg-slate-900/80 px-3 py-3">
                        <p className="text-xs uppercase tracking-[0.22em] text-slate-500">O2</p>
                        <p className="mt-2 font-semibold text-emerald-300">{v.oxygen_saturation}</p>
                      </div>
                      <div className="rounded-2xl bg-slate-900/80 px-3 py-3">
                        <p className="text-xs uppercase tracking-[0.22em] text-slate-500">Temp</p>
                        <p className="mt-2 font-semibold text-amber-300">{v.temperature}</p>
                      </div>
                      <div className="rounded-2xl bg-slate-900/80 px-3 py-3">
                        <p className="text-xs uppercase tracking-[0.22em] text-slate-500">BP</p>
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
                  <p className="text-xs font-semibold uppercase tracking-[0.3em] text-rose-300">Escalations</p>
                  <h2 className="mt-2 text-2xl font-semibold text-white">Patient Alerts</h2>
                </div>
                <span className="rounded-full bg-rose-500/12 px-3 py-1 text-xs font-semibold text-rose-200">{alerts.length} recent</span>
              </div>
              <div className="mb-4 flex items-center justify-between gap-3">
                <div className="rounded-full bg-slate-900/80 px-3 py-1 text-xs font-medium text-slate-300">
                  Page {alertsPage}
                </div>
                <div className="flex items-center gap-2">
                  <button
                    className="rounded-full border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs font-medium text-slate-200 transition hover:border-slate-500 hover:bg-slate-800 disabled:cursor-not-allowed disabled:border-slate-800 disabled:text-slate-500"
                    onClick={() => setAlertsPage((prev) => Math.max(1, prev - 1))}
                    disabled={alertsPage === 1}
                  >
                    Previous
                  </button>
                  <button
                    className="rounded-full border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs font-medium text-slate-200 transition hover:border-slate-500 hover:bg-slate-800 disabled:cursor-not-allowed disabled:border-slate-800 disabled:text-slate-500"
                    onClick={() => setAlertsPage((prev) => prev + 1)}
                    disabled={alertsPage >= maxAlertsPage}
                  >
                    Next
                  </button>
                </div>
              </div>
              <ul className="space-y-3">
                {alerts.length === 0 && (
                  <li className="rounded-2xl border border-slate-800 bg-slate-950/50 px-4 py-5 text-sm text-slate-400">
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
                <p className="text-xs font-semibold uppercase tracking-[0.3em] text-cyan-300">Medication</p>
                <h2 className="mt-2 text-2xl font-semibold text-white">Administer Medication</h2>
              </div>
              <form className="space-y-4" onSubmit={handleMedicationSubmit}>
                <input
                  type="text"
                  value={medicationName}
                  onChange={(event) => setMedicationName(event.target.value)}
                  placeholder="Medication name"
                  className="w-full rounded-2xl border border-slate-700 bg-slate-950/80 px-4 py-3 text-white outline-none transition focus:border-cyan-400"
                  required
                />
                <input
                  type="text"
                  value={dosage}
                  onChange={(event) => setDosage(event.target.value)}
                  placeholder="Dosage"
                  className="w-full rounded-2xl border border-slate-700 bg-slate-950/80 px-4 py-3 text-white outline-none transition focus:border-cyan-400"
                  required
                />
                {medicationMessage && (
                  <p className="text-sm text-slate-400">{medicationMessage}</p>
                )}
                <button
                  type="submit"
                  disabled={isSubmittingMedication}
                  className="w-full rounded-2xl bg-cyan-400 px-4 py-3 font-semibold text-slate-950 transition hover:bg-cyan-300 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-400"
                >
                  {isSubmittingMedication ? "Submitting..." : "Administer Medication"}
                </button>
              </form>
            </div>

            <div className="monitor-card rounded-[28px] p-6">
              <div className="mb-5 flex items-center justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.3em] text-cyan-300">Event Feed</p>
                  <h2 className="mt-2 text-2xl font-semibold text-white">Patient Events</h2>
                </div>
                <span className="rounded-full bg-cyan-500/12 px-3 py-1 text-xs font-semibold text-cyan-200">{events.length} recent</span>
              </div>
              <ul className="space-y-3">
                {events.length === 0 && (
                  <li className="rounded-2xl border border-slate-800 bg-slate-950/50 px-4 py-5 text-sm text-slate-400">
                    No patient events yet.
                  </li>
                )}
                {events.map((event, i) => (
                  <li key={i} className="rounded-2xl border border-cyan-500/10 bg-cyan-950/20 px-4 py-4">
                    <p className="text-xs uppercase tracking-[0.25em] text-cyan-200/70">{event.time || event.timestamp}</p>
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
