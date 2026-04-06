import {useEffect, useRef, useState} from "react"
import {Link, useNavigate} from "react-router-dom"
import { useAuth } from "../auth/AuthContext"
import {api} from "../services/api"
import {createWebSocket} from "../services/ws"
import VitalsChart from "../components/VitalsChart"

export default function Dashboard() {
    const navigate = useNavigate()
    const { logout } = useAuth()
    const pageSize = 5
    const livePageSize = 5
    const [vitals, setVitals] = useState([])
    const [alerts, setAlerts] = useState([])
    const [events, setEvents] = useState([])
    const [stats, setStats] = useState([])
    const [patients, setPatients] = useState([])
    const alertAudioRef = useRef(null)
    const [page, setPage] = useState(1)
    const [alertsPage, setAlertsPage] = useState(1)
    const [patientForm, setPatientForm] = useState({
        first_name: "",
        last_name: "",
        cnp: "",
        birth_date: "",
        gender: "",
        department: "ER",
    })
    const [isCreatingPatient, setIsCreatingPatient] = useState(false)
    const [patientMessage, setPatientMessage] = useState("")
    const [patientMessageIsError, setPatientMessageIsError] = useState(false)

    if (!alertAudioRef.current) {
        alertAudioRef.current = new Audio("/alert.mp3")
    }

    const loadDashboardData = async (nextPage = page) => {
        const patientsRes = await api.get(`/patients?page=${nextPage}&limit=${pageSize}`)
        const statsRes = await api.get("/stats")
        setPatients(patientsRes.data)
        setStats(statsRes.data)
    }

    useEffect(() => {
        loadDashboardData(page)
    }, [page])

    useEffect(() => {
        const socket = createWebSocket((msg) => {
            if (msg.type === "vital") {
                setVitals((prev) => [
                    {
                        ...msg.data,
                        time: new Date().toLocaleTimeString(),
                    },
                    ...prev.slice(0, 20),
                ])
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

        return () => socket.close()
    }, [])

    const patientMap = Object.fromEntries(patients.map((patient) => [patient.id, patient]))
    const departments = ["ER", "ICU", "Ward"]
    const visibleStats = stats.filter((stat) => patientMap[stat.patient_id])
    const groupedStats = visibleStats.reduce((groups, stat) => {
        const patient = patientMap[stat.patient_id]
        const department = patient?.department || "Ward"

        if (!groups[department]) {
            groups[department] = []
        }

        groups[department].push(stat)
        return groups
    }, Object.fromEntries(departments.map((department) => [department, []])))

    const latestVital = vitals[0]
    const paginatedAlerts = alerts.slice((alertsPage - 1) * livePageSize, alertsPage * livePageSize)
    const maxAlertsPage = Math.max(1, Math.ceil(alerts.length / livePageSize))

    useEffect(() => {
        if (alertsPage > maxAlertsPage) {
            setAlertsPage(maxAlertsPage)
        }
    }, [alertsPage, maxAlertsPage])

    const handleLogout = () => {
        logout()
        navigate("/")
    }

    const handlePatientFormChange = (event) => {
        const { name, value } = event.target
        setPatientForm((prev) => ({
            ...prev,
            [name]: value,
        }))
    }

    const handleCreatePatient = async (event) => {
        event.preventDefault()
        setPatientMessage("")
        setPatientMessageIsError(false)
        setIsCreatingPatient(true)

        try {
            await api.post("/patients", patientForm)
            setPatientForm({
                first_name: "",
                last_name: "",
                cnp: "",
                birth_date: "",
                gender: "",
                department: "ER",
            })
            setPatientMessage("Patient created")

            if (page !== 1) {
                setPage(1)
            } else {
                await loadDashboardData(1)
            }
        } catch (error) {
            setPatientMessageIsError(true)
            setPatientMessage(error.response?.data?.detail || "Unable to create patient")
        } finally {
            setIsCreatingPatient(false)
        }
    }

    return (
        <div className="min-h-screen px-4 py-6 text-slate-100 sm:px-6 lg:px-8">
            <div className="mx-auto flex w-full max-w-7xl flex-col gap-6">
                <header className="monitor-card rounded-[28px] p-6 sm:p-8">
                    <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
                        <div className="space-y-3">
                            <p className="text-xs font-semibold uppercase tracking-[0.35em] text-cyan-300">MedStream Command Center</p>
                            <div>
                                <h1 className="text-3xl font-semibold tracking-tight text-white sm:text-4xl">Hospital Monitoring Dashboard</h1>
                                <p className="mt-2 max-w-2xl text-sm text-slate-300 sm:text-base">
                                    Live patient monitoring, alert escalation, and operational flow in a single view.
                                </p>
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                            <button
                                className="rounded-2xl border border-slate-700 bg-slate-900/80 p-4 text-left transition hover:border-slate-500 hover:bg-slate-800"
                                onClick={handleLogout}
                            >
                                <p className="text-xs uppercase tracking-[0.25em] text-slate-400">Session</p>
                                <p className="mt-3 text-lg font-semibold text-white">Logout</p>
                            </button>
                            <div className="monitor-panel rounded-2xl p-4">
                                <p className="text-xs uppercase tracking-[0.25em] text-slate-400">Live Patients</p>
                                <p className="mt-3 text-3xl font-semibold text-white">{patients.length}</p>
                            </div>
                            <div className="monitor-panel rounded-2xl p-4">
                                <p className="text-xs uppercase tracking-[0.25em] text-slate-400">Alerts</p>
                                <p className="mt-3 text-3xl font-semibold text-rose-300">{alerts.length}</p>
                            </div>
                            <div className="monitor-panel rounded-2xl p-4">
                                <p className="text-xs uppercase tracking-[0.25em] text-slate-400">Events</p>
                                <p className="mt-3 text-3xl font-semibold text-cyan-200">{events.length}</p>
                            </div>
                            <div className="monitor-panel rounded-2xl p-4 sm:col-span-2 lg:col-span-1">
                                <p className="text-xs uppercase tracking-[0.25em] text-slate-400">Latest HR</p>
                                <p className="mt-3 text-3xl font-semibold text-emerald-300">{latestVital ? latestVital.heart_rate : "--"}</p>
                            </div>
                        </div>
                    </div>
                </header>

                <section className="grid gap-6 xl:grid-cols-[1.65fr_1fr]">
                    <div className="monitor-card rounded-[28px] p-6">
                        <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                            <div>
                                <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-400">Real-Time Monitoring</p>
                                <h2 className="mt-2 text-2xl font-semibold text-white">Live Vitals Stream</h2>
                            </div>
                            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                                <div className="rounded-2xl bg-cyan-950/40 px-4 py-3">
                                    <p className="text-xs uppercase tracking-[0.25em] text-cyan-200/70">Heart Rate</p>
                                    <p className="mt-2 text-xl font-semibold text-cyan-50">{latestVital ? latestVital.heart_rate : "--"}</p>
                                </div>
                                <div className="rounded-2xl bg-emerald-950/40 px-4 py-3">
                                    <p className="text-xs uppercase tracking-[0.25em] text-emerald-200/70">O2 Sat</p>
                                    <p className="mt-2 text-xl font-semibold text-emerald-50">{latestVital ? latestVital.oxygen_saturation : "--"}</p>
                                </div>
                                <div className="rounded-2xl bg-amber-950/40 px-4 py-3">
                                    <p className="text-xs uppercase tracking-[0.25em] text-amber-200/70">Temp</p>
                                    <p className="mt-2 text-xl font-semibold text-amber-50">{latestVital ? latestVital.temperature : "--"}</p>
                                </div>
                                <div className="rounded-2xl bg-slate-800/70 px-4 py-3">
                                    <p className="text-xs uppercase tracking-[0.25em] text-slate-400">Readings</p>
                                    <p className="mt-2 text-xl font-semibold text-white">{vitals.length}</p>
                                </div>
                            </div>
                        </div>

                        <VitalsChart data={[...vitals].reverse()}/>
                    </div>

                    <div className="grid gap-6">
                        <div className="monitor-card rounded-[28px] p-6">
                            <div className="mb-5">
                                <p className="text-xs font-semibold uppercase tracking-[0.3em] text-cyan-300">Admissions</p>
                                <h2 className="mt-2 text-2xl font-semibold text-white">Add Patient</h2>
                            </div>
                            <form className="space-y-4" onSubmit={handleCreatePatient}>
                                <div className="grid gap-4 sm:grid-cols-2">
                                    <input
                                        type="text"
                                        name="first_name"
                                        value={patientForm.first_name}
                                        onChange={handlePatientFormChange}
                                        placeholder="First name"
                                        className="w-full rounded-2xl border border-slate-700 bg-slate-950/80 px-4 py-3 text-white outline-none transition focus:border-cyan-400"
                                        required
                                    />
                                    <input
                                        type="text"
                                        name="last_name"
                                        value={patientForm.last_name}
                                        onChange={handlePatientFormChange}
                                        placeholder="Last name"
                                        className="w-full rounded-2xl border border-slate-700 bg-slate-950/80 px-4 py-3 text-white outline-none transition focus:border-cyan-400"
                                        required
                                    />
                                </div>
                                <input
                                    type="text"
                                    name="cnp"
                                    value={patientForm.cnp}
                                    onChange={handlePatientFormChange}
                                    placeholder="CNP"
                                    className="w-full rounded-2xl border border-slate-700 bg-slate-950/80 px-4 py-3 text-white outline-none transition focus:border-cyan-400"
                                    required
                                />
                                <div className="grid gap-4 sm:grid-cols-3">
                                    <input
                                        type="date"
                                        name="birth_date"
                                        value={patientForm.birth_date}
                                        onChange={handlePatientFormChange}
                                        className="w-full rounded-2xl border border-slate-700 bg-slate-950/80 px-4 py-3 text-white outline-none transition focus:border-cyan-400"
                                        required
                                    />
                                    <select
                                        name="gender"
                                        value={patientForm.gender}
                                        onChange={handlePatientFormChange}
                                        className="w-full rounded-2xl border border-slate-700 bg-slate-950/80 px-4 py-3 text-white outline-none transition focus:border-cyan-400"
                                        required
                                    >
                                        <option value="">Gender</option>
                                        <option value="male">Male</option>
                                        <option value="female">Female</option>
                                    </select>
                                    <select
                                        name="department"
                                        value={patientForm.department}
                                        onChange={handlePatientFormChange}
                                        className="w-full rounded-2xl border border-slate-700 bg-slate-950/80 px-4 py-3 text-white outline-none transition focus:border-cyan-400"
                                        required
                                    >
                                        <option value="ER">ER</option>
                                        <option value="ICU">ICU</option>
                                        <option value="Ward">Ward</option>
                                    </select>
                                </div>
                                {patientMessage && (
                                    <p className={patientMessageIsError ? "login-error" : "login-success"}>
                                        {patientMessage}
                                    </p>
                                )}
                                <button
                                    type="submit"
                                    disabled={isCreatingPatient}
                                    className="w-full rounded-2xl bg-cyan-400 px-4 py-3 font-semibold text-slate-950 transition hover:bg-cyan-300 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-400"
                                >
                                    {isCreatingPatient ? "Creating patient..." : "Create Patient"}
                                </button>
                            </form>
                        </div>

                        <div className="monitor-card rounded-[28px] p-6">
                            <div className="mb-5 flex items-center justify-between">
                                <div>
                                    <p className="text-xs font-semibold uppercase tracking-[0.3em] text-rose-300">Escalations</p>
                                    <h2 className="mt-2 text-2xl font-semibold text-white">Alerts</h2>
                                </div>
                                <span className="rounded-full bg-rose-500/15 px-3 py-1 text-xs font-semibold text-rose-200">{alerts.length} recent</span>
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
                                        No active alerts in the current stream.
                                    </li>
                                )}
                                {paginatedAlerts.map((a, i) => (
                                    <li
                                        key={i}
                                        className={`alert-item alert-${a.severity}`}
                                    >
                                        <div className="flex items-start justify-between gap-3">
                                            <div>
                                                <p className="text-xs uppercase tracking-[0.28em] text-white/70">{a.severity} severity</p>
                                                <p className="mt-2 text-sm font-medium text-inherit">Patient {a.patient_id} - {a.message}</p>
                                            </div>
                                        </div>
                                    </li>
                                ))}
                            </ul>
                        </div>

                        <div className="monitor-card rounded-[28px] p-6">
                            <div className="mb-5 flex items-center justify-between">
                                <div>
                                    <p className="text-xs font-semibold uppercase tracking-[0.3em] text-cyan-300">Scenario Feed</p>
                                    <h2 className="mt-2 text-2xl font-semibold text-white">Hospital Events</h2>
                                </div>
                                <span className="rounded-full bg-cyan-500/15 px-3 py-1 text-xs font-semibold text-cyan-200">{events.length} recent</span>
                            </div>
                            <ul className="space-y-3">
                                {events.length === 0 && (
                                    <li className="rounded-2xl border border-slate-800 bg-slate-950/50 px-4 py-5 text-sm text-slate-400">
                                        Waiting for ambulance and transfer events.
                                    </li>
                                )}
                                {events.map((event, i) => (
                                    <li key={i} className="rounded-2xl border border-cyan-500/10 bg-cyan-950/20 px-4 py-4">
                                        <p className="text-xs uppercase tracking-[0.25em] text-cyan-200/70">{event.time}</p>
                                        <p className="mt-2 text-sm font-medium text-white">
                                            {event.patient_id ? `Patient ${event.patient_id} | ` : ""}{event.message || event.event_type || "Hospital event"}
                                        </p>
                                        {event.event_type && (
                                            <p className="mt-2 text-xs uppercase tracking-[0.22em] text-slate-400">{event.event_type.replaceAll("_", " ")}</p>
                                        )}
                                    </li>
                                ))}
                            </ul>
                        </div>
                    </div>
                </section>

                <section className="monitor-card rounded-[28px] p-6">
                    <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                        <div>
                            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-400">Department Operations</p>
                            <h2 className="mt-2 text-2xl font-semibold text-white">Batch Analytics by Department</h2>
                        </div>
                        <p className="max-w-2xl text-sm text-slate-400">
                            Historical patient averages grouped by unit while live monitoring continues above.
                        </p>
                    </div>

                    <div className="mb-6 flex items-center justify-between gap-3">
                        <div className="rounded-full bg-slate-900/80 px-4 py-2 text-sm font-medium text-slate-300">
                            Page {page}
                        </div>
                        <div className="flex items-center gap-3">
                            <button
                                className="rounded-full border border-slate-700 bg-slate-900 px-4 py-2 text-sm font-medium text-slate-200 transition hover:border-slate-500 hover:bg-slate-800 disabled:cursor-not-allowed disabled:border-slate-800 disabled:text-slate-500"
                                onClick={() => setPage((prev) => Math.max(1, prev - 1))}
                                disabled={page === 1}
                            >
                                Previous
                            </button>
                            <button
                                className="rounded-full border border-cyan-400/30 bg-cyan-500/10 px-4 py-2 text-sm font-medium text-cyan-200 transition hover:bg-cyan-500/20 disabled:cursor-not-allowed disabled:border-slate-800 disabled:bg-slate-900 disabled:text-slate-500"
                                onClick={() => setPage((prev) => prev + 1)}
                                disabled={patients.length < pageSize}
                            >
                                Next
                            </button>
                        </div>
                    </div>

                    <div className="grid gap-5 lg:grid-cols-3">
                        {departments.map((department) => (
                            <div key={department} className="monitor-panel rounded-[24px] p-5">
                                <div className="mb-4 flex items-center justify-between">
                                    <div>
                                        <p className="text-xs uppercase tracking-[0.25em] text-slate-500">Department</p>
                                        <h3 className="mt-2 text-xl font-semibold text-white">{department}</h3>
                                    </div>
                                    <span className="rounded-full bg-slate-800 px-3 py-1 text-xs font-semibold text-slate-300">
                                        {groupedStats[department].length} patients
                                    </span>
                                </div>

                                <ul className="space-y-3">
                                    {groupedStats[department].length === 0 && (
                                        <li className="rounded-2xl border border-slate-800 bg-slate-950/50 px-4 py-5 text-sm text-slate-500">
                                            No patient stats available.
                                        </li>
                                    )}
                                    {groupedStats[department].map((s, i) => (
                                        <li key={i} className="rounded-2xl border border-slate-800 bg-slate-950/60 p-4">
                                            <div className="flex items-start justify-between gap-3">
                                                <div>
                                                    <Link className="text-base font-semibold text-cyan-300 transition hover:text-cyan-200" to={`/patient/${s.patient_id}`}>
                                                        Patient {s.patient_id}
                                                    </Link>
                                                    <p className="mt-1 text-sm text-slate-400">
                                                        {patientMap[s.patient_id]?.first_name} {patientMap[s.patient_id]?.last_name}
                                                    </p>
                                                </div>
                                                <span className="rounded-full bg-rose-500/12 px-3 py-1 text-xs font-semibold text-rose-200">
                                                    {s.alerts_count} alerts
                                                </span>
                                            </div>
                                            <div className="mt-4 grid grid-cols-3 gap-3 text-sm">
                                                <div className="rounded-2xl bg-slate-900/80 px-3 py-3">
                                                    <p className="text-xs uppercase tracking-[0.22em] text-slate-500">Avg HR</p>
                                                    <p className="mt-2 font-semibold text-white">{s.avg_heart_rate.toFixed(1)}</p>
                                                </div>
                                                <div className="rounded-2xl bg-slate-900/80 px-3 py-3">
                                                    <p className="text-xs uppercase tracking-[0.22em] text-slate-500">Avg Temp</p>
                                                    <p className="mt-2 font-semibold text-white">{s.avg_temperature.toFixed(1)}</p>
                                                </div>
                                                <div className="rounded-2xl bg-slate-900/80 px-3 py-3">
                                                    <p className="text-xs uppercase tracking-[0.22em] text-slate-500">Avg O2</p>
                                                    <p className="mt-2 font-semibold text-white">{s.avg_oxygen.toFixed(1)}</p>
                                                </div>
                                            </div>
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        ))}
                    </div>
                </section>

                <section className="grid gap-6 lg:grid-cols-2">
                    <div className="monitor-card rounded-[28px] p-6">
                        <p className="text-xs font-semibold uppercase tracking-[0.3em] text-cyan-300">Streaming</p>
                        <h2 className="mt-2 text-2xl font-semibold text-white">Instant Clinical Signal</h2>
                        <p className="mt-4 text-sm leading-7 text-slate-300">
                            Streaming surfaces vital changes and alerts as they happen, helping operators react during arrivals, deterioration, and treatment.
                        </p>
                    </div>
                    <div className="monitor-card rounded-[28px] p-6">
                        <p className="text-xs font-semibold uppercase tracking-[0.3em] text-amber-300">Batch</p>
                        <h2 className="mt-2 text-2xl font-semibold text-white">Historical Department Context</h2>
                        <p className="mt-4 text-sm leading-7 text-slate-300">
                            Batch analytics summarize longer patient trends and department performance to support retrospective review and planning.
                        </p>
                    </div>
                </section>
            </div>
        </div>
    )
}
