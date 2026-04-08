import {useEffect, useRef, useState} from "react"
import {Link} from "react-router-dom"
import CountValue from "../components/CountValue"
import {api} from "../services/api"
import { pushStoredEvent, readStoredEvents, subscribeToStoredEvents } from "../services/eventsFeed"
import {createWebSocket} from "../services/ws"
import VitalsChart from "../components/VitalsChart"
import { DEPARTMENTS, departmentHref } from "../constants/departments"

export default function Dashboard() {
    const livePageSize = 5
    const [vitals, setVitals] = useState([])
    const [visibleAlerts, setVisibleAlerts] = useState([])
    const [alertCount, setAlertCount] = useState(0)
    const [events, setEvents] = useState(() => readStoredEvents())
    const [visibleEvents, setVisibleEvents] = useState(() => readStoredEvents().slice(0, 2))
    const [stats, setStats] = useState([])
    const [batchStatus, setBatchStatus] = useState(null)
    const [patients, setPatients] = useState([])
    const [isLoadingDashboard, setIsLoadingDashboard] = useState(true)
    const [dashboardMessage, setDashboardMessage] = useState("")
    const [dashboardMessageIsError, setDashboardMessageIsError] = useState(false)
    const [newAlertIds, setNewAlertIds] = useState([])
    const alertAudioRef = useRef(null)
    const alertBufferRef = useRef([])
    const eventBufferRef = useRef(readStoredEvents())
    const alertHighlightTimeoutsRef = useRef([])

    if (!alertAudioRef.current) {
        alertAudioRef.current = new Audio("/alert.mp3")
    }

    const loadDashboardData = async () => {
        setDashboardMessage("")
        setDashboardMessageIsError(false)

        try {
            const [patientsRes, statsRes, batchStatusRes] = await Promise.all([
                api.get("/patients?page=1&limit=100"),
                api.get("/stats"),
                api.get("/stats/batch-status"),
            ])
            setPatients(patientsRes.data)
            setStats(statsRes.data)
            setBatchStatus(batchStatusRes.data)
        } catch {
            setDashboardMessageIsError(true)
            setDashboardMessage("Unable to load one or more dashboard data sources.")
        } finally {
            setIsLoadingDashboard(false)
        }
    }

    useEffect(() => {
        loadDashboardData()
    }, [])

    useEffect(() => {
        return subscribeToStoredEvents((nextEvents) => {
            setEvents(nextEvents)
            eventBufferRef.current = nextEvents
        })
    }, [])

    useEffect(() => {
        const intervalId = window.setInterval(async () => {
            try {
                const response = await api.get("/stats/batch-status")
                setBatchStatus(response.data)
            } catch {
            }
        }, 10000)

        return () => window.clearInterval(intervalId)
    }, [])

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
                alertBufferRef.current = [msg.data, ...alertBufferRef.current.filter((alert) => alert.id !== msg.data.id)].slice(0, 50)
                setAlertCount(alertBufferRef.current.length)
                alertAudioRef.current.currentTime = 0
                alertAudioRef.current.play().catch(() => {})
            }

            if (msg.type === "event") {
                const nextEvents = pushStoredEvent(msg.data)
                eventBufferRef.current = nextEvents
            }
        })

        const intervalId = window.setInterval(() => {
            const nextVisibleAlerts = alertBufferRef.current.slice(0, 3)
            const nextVisibleEvents = eventBufferRef.current.slice(0, 2)

            setVisibleAlerts((prev) => {
                const nextIds = new Set(nextVisibleAlerts.map((alert) => alert.id))
                const previousIds = new Set(prev.map((alert) => alert.id))
                const incomingIds = nextVisibleAlerts
                    .filter((alert) => !previousIds.has(alert.id))
                    .map((alert) => alert.id)

                if (incomingIds.length > 0) {
                    setNewAlertIds((current) => [...incomingIds, ...current.filter((id) => !incomingIds.includes(id))].slice(0, 5))

                    incomingIds.forEach((id) => {
                        const timeoutId = window.setTimeout(() => {
                            setNewAlertIds((current) => current.filter((currentId) => currentId !== id))
                        }, 1400)

                        alertHighlightTimeoutsRef.current.push(timeoutId)
                    })
                }

                return nextVisibleAlerts.filter((alert) => nextIds.has(alert.id))
            })

            setVisibleEvents(nextVisibleEvents)
        }, 2500)

        return () => {
            socket.close()
            window.clearInterval(intervalId)
            alertHighlightTimeoutsRef.current.forEach((timeoutId) => window.clearTimeout(timeoutId))
            alertHighlightTimeoutsRef.current = []
        }
    }, [])

    const latestVital = vitals[0]
    const previewAlerts = visibleAlerts.slice(0, 3)
    const previewEvents = visibleEvents.slice(0, 2)
    const recentVitals = vitals.slice(0, 5)
    const latestBatchRun = stats.reduce((latest, stat) => {
        if (!stat.computed_at) {
            return latest
        }

        if (!latest) {
            return stat.computed_at
        }

        return new Date(stat.computed_at) > new Date(latest) ? stat.computed_at : latest
    }, "")
    const patientsWithStats = stats.length
    const averageHeartRate = stats.length
        ? stats.reduce((sum, stat) => sum + stat.avg_heart_rate, 0) / stats.length
        : 0
    const averageTemperature = stats.length
        ? stats.reduce((sum, stat) => sum + stat.avg_temperature, 0) / stats.length
        : 0
    const averageOxygen = stats.length
        ? stats.reduce((sum, stat) => sum + stat.avg_oxygen, 0) / stats.length
        : 0
    const aggregateAlerts = stats.reduce((sum, stat) => sum + stat.alerts_count, 0)
    const batchStatusLabel = batchStatus?.last_run_status
        ? batchStatus.last_run_status.charAt(0).toUpperCase() + batchStatus.last_run_status.slice(1)
        : "Unknown"
    const lastSuccessfulBatchRun = batchStatus?.last_successful_run_at || latestBatchRun

    const currentPatientState = (() => {
        if (!latestVital) {
            return "Waiting for live telemetry"
        }

        if (latestVital.oxygen_saturation <= 90 || latestVital.heart_rate >= 125 || latestVital.temperature >= 39) {
            return "Critical live instability"
        }

        if (latestVital.oxygen_saturation <= 93 || latestVital.heart_rate >= 105 || latestVital.temperature >= 38) {
            return "Elevated live monitoring"
        }

        return "Stable live monitoring"
    })()

    const recentHeartRateAverage = recentVitals.length
        ? recentVitals.reduce((sum, vital) => sum + vital.heart_rate, 0) / recentVitals.length
        : 0
    const recentOxygenAverage = recentVitals.length
        ? recentVitals.reduce((sum, vital) => sum + vital.oxygen_saturation, 0) / recentVitals.length
        : 0
    const recentTemperatureAverage = recentVitals.length
        ? recentVitals.reduce((sum, vital) => sum + vital.temperature, 0) / recentVitals.length
        : 0
    const heartRateDelta = recentVitals.length >= 2 ? recentVitals[0].heart_rate - recentVitals[recentVitals.length - 1].heart_rate : 0
    const oxygenDelta = recentVitals.length >= 2 ? recentVitals[0].oxygen_saturation - recentVitals[recentVitals.length - 1].oxygen_saturation : 0
    const temperatureDelta = recentVitals.length >= 2 ? recentVitals[0].temperature - recentVitals[recentVitals.length - 1].temperature : 0
    const formatDelta = (value) => value > 0 ? `+${value.toFixed(1)}` : value.toFixed(1)

    return (
        <div className="app-shell min-h-screen px-4 py-6 text-slate-100 sm:px-6 lg:px-8">
            <div className="mx-auto flex w-full max-w-7xl flex-col gap-6">
                <header className="console-topbar rounded-[24px] p-6 sm:p-8">
                    <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
                        <div className="space-y-3">
                            <p className="console-eyebrow text-xs font-semibold uppercase tracking-[0.35em]">MedStream Console</p>
                            <div>
                                <h1 className="text-3xl font-semibold tracking-tight text-white sm:text-4xl">Hospital Monitoring Dashboard</h1>
                                <p className="mt-2 max-w-2xl text-sm text-[#b6bec9] sm:text-base">
                                    Operational overview for live clinical telemetry, admissions, department load, and alert escalation.
                                </p>
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                            <div className="monitor-panel rounded-2xl p-4">
                                <p className="text-xs uppercase tracking-[0.25em] text-[#879196]">Patients</p>
                                <p className="mt-3 text-3xl font-semibold text-white"><CountValue value={patients.length} /></p>
                            </div>
                            <div className="monitor-panel rounded-2xl p-4">
                                <p className="text-xs uppercase tracking-[0.25em] text-[#879196]">Alerts</p>
                                <p className="mt-3 text-3xl font-semibold text-[#ffb3bc]"><CountValue value={alertCount} /></p>
                            </div>
                            <div className="monitor-panel rounded-2xl p-4">
                                <p className="text-xs uppercase tracking-[0.25em] text-[#879196]">Events</p>
                                <p className="mt-3 text-3xl font-semibold text-[#9dccff]"><CountValue value={events.length} /></p>
                            </div>
                            <div className="monitor-panel rounded-2xl p-4 sm:col-span-2 lg:col-span-1">
                                <p className="text-xs uppercase tracking-[0.25em] text-[#879196]">Latest HR</p>
                                <p className="mt-3 text-3xl font-semibold text-[#ffb84d]">{latestVital ? latestVital.heart_rate : "--"}</p>
                            </div>
                        </div>
                    </div>
                </header>

                {dashboardMessage && (
                    <div className={dashboardMessageIsError ? "login-error" : "login-success"}>
                        {dashboardMessage}
                    </div>
                )}

                <section className="grid gap-6 xl:grid-cols-[1.65fr_1fr]">
                    <div className="monitor-card rounded-[28px] border border-[#ff9900]/30 p-6">
                        <div className="mb-6 flex flex-col gap-4">
                            <div>
                                <p className="text-xs font-semibold uppercase tracking-[0.3em] text-[#ff9900]">Live Monitoring</p>
                                <h2 className="mt-2 text-2xl font-semibold text-white">Live Vitals Stream</h2>
                            </div>
                            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                                <div className="monitor-panel rounded-2xl px-4 py-3">
                                    <p className="text-xs uppercase tracking-[0.25em] text-[#879196]">Heart Rate</p>
                                    <p className="mt-2 text-xl font-semibold text-[#ffb84d]">{latestVital ? latestVital.heart_rate : "--"}</p>
                                </div>
                                <div className="monitor-panel rounded-2xl px-4 py-3">
                                    <p className="text-xs uppercase tracking-[0.25em] text-[#879196]">O2 Sat</p>
                                    <p className="mt-2 text-xl font-semibold text-[#9dccff]">{latestVital ? latestVital.oxygen_saturation : "--"}</p>
                                </div>
                                <div className="monitor-panel rounded-2xl px-4 py-3">
                                    <p className="text-xs uppercase tracking-[0.25em] text-[#879196]">Temp</p>
                                    <p className="mt-2 text-xl font-semibold text-[#ffd699]">{latestVital ? latestVital.temperature : "--"}</p>
                                </div>
                                <div className="monitor-panel rounded-2xl px-4 py-3">
                                    <p className="text-xs uppercase tracking-[0.25em] text-[#879196]">Readings</p>
                                    <p className="mt-2 text-xl font-semibold text-white"><CountValue value={vitals.length} /></p>
                                </div>
                            </div>
                        </div>

                        <div className="mb-6 grid gap-3 md:grid-cols-3">
                            <div className="rounded-2xl border border-[#3b424b] bg-[#151b22] px-4 py-4">
                                <p className="text-xs uppercase tracking-[0.22em] text-[#879196]">Current Patient State</p>
                                <p className="mt-2 text-base font-semibold text-white">{currentPatientState}</p>
                            </div>
                            <div className="rounded-2xl border border-[#3b424b] bg-[#151b22] px-4 py-4">
                                <p className="text-xs uppercase tracking-[0.22em] text-[#879196]">Active Alerts</p>
                                <p className="mt-2 text-base font-semibold text-white"><CountValue value={alertCount} /></p>
                            </div>
                            <div className="rounded-2xl border border-[#3b424b] bg-[#151b22] px-4 py-4">
                                <p className="text-xs uppercase tracking-[0.22em] text-[#879196]">Stream Status</p>
                                <p className="mt-2 text-base font-semibold text-white">{latestVital ? "Connected" : "Waiting for feed"}</p>
                            </div>
                        </div>

                        {isLoadingDashboard ? (
                            <div className="rounded-2xl border border-[#3b424b] bg-[#151b22] px-4 py-10 text-center text-sm text-[#b6bec9]">
                                Loading real-time dashboard data...
                            </div>
                        ) : vitals.length === 0 ? (
                            <div className="rounded-2xl border border-[#3b424b] bg-[#151b22] px-4 py-10 text-center text-sm text-[#b6bec9]">
                                Waiting for streaming vitals. Keep the live backend running and telemetry will appear here.
                            </div>
                        ) : (
                            <div className="space-y-4">
                                <VitalsChart data={[...vitals].reverse()}/>
                                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                                    <div className="monitor-panel rounded-2xl px-4 py-4">
                                        <p className="text-xs uppercase tracking-[0.22em] text-[#879196]">HR Trend</p>
                                        <p className="mt-2 text-xl font-semibold text-white">{recentVitals.length ? recentHeartRateAverage.toFixed(1) : "--"}</p>
                                        <p className="mt-2 text-sm text-[#b6bec9]">{recentVitals.length ? `${formatDelta(heartRateDelta)} over last ${recentVitals.length} samples` : "Waiting for samples"}</p>
                                    </div>
                                    <div className="monitor-panel rounded-2xl px-4 py-4">
                                        <p className="text-xs uppercase tracking-[0.22em] text-[#879196]">O2 Trend</p>
                                        <p className="mt-2 text-xl font-semibold text-white">{recentVitals.length ? recentOxygenAverage.toFixed(1) : "--"}</p>
                                        <p className="mt-2 text-sm text-[#b6bec9]">{recentVitals.length ? `${formatDelta(oxygenDelta)} over last ${recentVitals.length} samples` : "Waiting for samples"}</p>
                                    </div>
                                    <div className="monitor-panel rounded-2xl px-4 py-4">
                                        <p className="text-xs uppercase tracking-[0.22em] text-[#879196]">Temp Trend</p>
                                        <p className="mt-2 text-xl font-semibold text-white">{recentVitals.length ? recentTemperatureAverage.toFixed(1) : "--"}</p>
                                        <p className="mt-2 text-sm text-[#b6bec9]">{recentVitals.length ? `${formatDelta(temperatureDelta)} over last ${recentVitals.length} samples` : "Waiting for samples"}</p>
                                    </div>
                                    <div className="monitor-panel rounded-2xl px-4 py-4">
                                        <p className="text-xs uppercase tracking-[0.22em] text-[#879196]">Latest BP</p>
                                        <p className="mt-2 text-xl font-semibold text-white">{latestVital ? `${latestVital.systolic_bp}/${latestVital.diastolic_bp}` : "--"}</p>
                                        <p className="mt-2 text-sm text-[#b6bec9]">{latestVital ? `Recorded at ${latestVital.time}` : "Waiting for samples"}</p>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>

                    <div className="grid gap-6">
                        <div className="monitor-card rounded-[28px] p-6">
                            <div className="mb-5 flex items-center justify-between">
                                <div>
                                    <p className="text-xs font-semibold uppercase tracking-[0.3em] text-[#ff9900]">Alerts</p>
                                    <h2 className="mt-2 text-2xl font-semibold text-white">Live Alert Preview</h2>
                                </div>
                            </div>
                            <div className="alert-widget-shell rounded-[24px] p-4">
                                <div className="mb-4 flex items-center justify-between gap-3">
                                    <span className="console-chip-danger rounded-full px-3 py-1 text-xs font-semibold"><CountValue value={alertCount} /></span>
                                </div>
                                <ul className="space-y-3">
                                    {alertCount === 0 && (
                                        <li className="rounded-2xl border border-[#3b424b] bg-[#151b22] px-4 py-5 text-sm text-[#b6bec9]">
                                            No active alerts in the current stream. This panel updates only from live vital events.
                                        </li>
                                    )}
                                    {previewAlerts.map((a, i) => (
                                        <li
                                            key={a.id}
                                            className={`alert-item alert-${a.severity} ${newAlertIds.includes(a.id) ? "alert-new" : ""}`}
                                        >
                                            <div className="flex items-start justify-between gap-3">
                                                <div>
                                                    <p className="text-xs uppercase tracking-[0.28em] text-white/70">{a.severity} severity</p>
                                                    <p className="mt-2 text-sm font-medium text-inherit">Patient {a.patient_id} - {a.message}</p>
                                                </div>
                                                <span className="rounded-full border border-white/10 bg-black/10 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-white/70">
                                                    Live
                                                </span>
                                            </div>
                                        </li>
                                    ))}
                                </ul>
                                {alertCount > 3 && (
                                    <div className="mt-4">
                                        <Link className="console-button-secondary block rounded-2xl px-4 py-3 text-center text-sm font-semibold" to="/alerts">
                                            Show more
                                        </Link>
                                    </div>
                                )}
                            </div>
                        </div>

                        <div className="monitor-card rounded-[28px] p-6">
                            <div className="mb-5 flex items-center justify-between">
                                <div>
                                    <p className="text-xs font-semibold uppercase tracking-[0.3em] text-[#ff9900]">Events</p>
                                    <h2 className="mt-2 text-2xl font-semibold text-white">Hospital Events</h2>
                                </div>
                                <span className="console-chip-success rounded-full px-3 py-1 text-xs font-semibold"><CountValue value={events.length} /></span>
                            </div>
                            <div className="alert-widget-shell rounded-[24px] p-4">
                                <div className="mb-4 flex items-center justify-between gap-3">
                                    <span className="console-chip-success rounded-full px-3 py-1 text-xs font-semibold"><CountValue value={events.length} /></span>
                                </div>
                                <ul className="space-y-3">
                                    {events.length === 0 && (
                                        <li className="rounded-2xl border border-[#3b424b] bg-[#151b22] px-4 py-5 text-sm text-[#b6bec9]">
                                            Waiting for live hospital events such as admissions, transfers, and treatment updates.
                                        </li>
                                    )}
                                    {previewEvents.map((event) => (
                                        <li key={event.id} className="rounded-2xl border border-[#3b424b] bg-[#1b2430] px-4 py-4">
                                            <div className="flex items-start justify-between gap-3">
                                                <div>
                                                    <p className="text-xs uppercase tracking-[0.25em] text-[#9dccff]">{new Date(event.timestamp).toLocaleTimeString()}</p>
                                                    <p className="mt-2 text-sm font-medium text-white">
                                                        {event.patient_id ? `Patient ${event.patient_id} | ` : ""}{event.message || event.event_type || "Hospital event"}
                                                    </p>
                                                    {event.event_type && (
                                                        <p className="mt-2 text-xs uppercase tracking-[0.22em] text-[#879196]">{event.event_type.replaceAll("_", " ")}</p>
                                                    )}
                                                </div>
                                                <span className="rounded-full border border-white/10 bg-black/10 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-white/70">
                                                    Live
                                                </span>
                                            </div>
                                        </li>
                                    ))}
                                </ul>
                                {events.length > 2 && (
                                    <div className="mt-4">
                                        <Link className="console-button-secondary block rounded-2xl px-4 py-3 text-center text-sm font-semibold" to="/events">
                                            Show more
                                        </Link>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </section>

                <section id="departments" className="monitor-card rounded-[28px] border border-[#9dccff]/25 p-6">
                    <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                        <div>
                            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-[#9dccff]">Department Analytics</p>
                            <h2 className="mt-2 text-2xl font-semibold text-white">Batch Analytics</h2>
                        </div>
                    </div>

                    <div className="mb-6 grid gap-3 lg:grid-cols-6">
                        <div className="monitor-panel rounded-2xl p-4">
                            <p className="text-xs uppercase tracking-[0.22em] text-[#879196]">Current Status</p>
                            <p className="mt-2 text-lg font-semibold text-white">{batchStatusLabel}</p>
                        </div>
                        <div className="monitor-panel rounded-2xl p-4">
                            <p className="text-xs uppercase tracking-[0.22em] text-[#879196]">Last Successful Run</p>
                            <p className="mt-2 text-lg font-semibold text-white">{lastSuccessfulBatchRun ? new Date(lastSuccessfulBatchRun).toLocaleTimeString() : "--"}</p>
                            <p className="mt-2 text-sm text-[#b6bec9]">{lastSuccessfulBatchRun ? new Date(lastSuccessfulBatchRun).toLocaleDateString() : "No successful batch run yet"}</p>
                        </div>
                        <div className="monitor-panel rounded-2xl p-4">
                            <p className="text-xs uppercase tracking-[0.22em] text-[#879196]">Avg HR</p>
                            <p className="mt-2 text-lg font-semibold text-white">{patientsWithStats ? averageHeartRate.toFixed(1) : "--"}</p>
                        </div>
                        <div className="monitor-panel rounded-2xl p-4">
                            <p className="text-xs uppercase tracking-[0.22em] text-[#879196]">Avg Temp</p>
                            <p className="mt-2 text-lg font-semibold text-white">{patientsWithStats ? averageTemperature.toFixed(1) : "--"}</p>
                        </div>
                            <div className="monitor-panel rounded-2xl p-4">
                                <p className="text-xs uppercase tracking-[0.22em] text-[#879196]">Aggregated Alerts</p>
                                <p className="mt-2 text-lg font-semibold text-white"><CountValue value={aggregateAlerts} /></p>
                            </div>
                    </div>

                    {!isLoadingDashboard && stats.length === 0 ? (
                        <div className="rounded-2xl border border-[#3b424b] bg-[#151b22] px-4 py-5 text-sm text-[#b6bec9]">
                            Batch analytics will appear after the scheduler completes at least one successful run.
                        </div>
                    ) : (
                        <div className="grid gap-4 lg:grid-cols-3">
                            {DEPARTMENTS.map((department) => (
                                <Link key={department} className="monitor-panel rounded-[24px] p-5" to={departmentHref(department)}>
                                    <p className="text-xs uppercase tracking-[0.25em] text-[#879196]">Department</p>
                                    <h3 className="mt-2 text-xl font-semibold text-white">{department}</h3>
                                </Link>
                            ))}
                        </div>
                    )}
                </section>
            </div>
        </div>
    )
}
