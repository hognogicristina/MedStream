import {useCallback, useEffect, useRef, useState} from "react"
import {useNavigate} from "react-router-dom"
import CountValue from "../components/CountValue.jsx"
import {useNotifications} from "../hooks/useNotifications.js"
import {getAlertDashboardSummary, listPatients} from "../services/patientApi.js"
import {listDoctors} from "../services/doctorApi.js"
import {getErrorMessage, getResponseData} from "../services/apiMessages.js"
import {createWebSocket} from "../services/ws.js"
import VitalsChart from "../components/VitalsChart.jsx"
import {formatPatientFullName} from "../utils/patients.js"

const MAX_PREVIEW_ALERTS = 7
const MAX_ALERTS = 60
const isCriticalHighAlert = (alert) => alert?.severity === "critical" || alert?.severity === "high"

const toAlertTimestamp = (alert) => {
  const time = new Date(alert?.created_at || 0).getTime()
  return Number.isFinite(time) ? time : 0
}

const normalizeCriticalHighAlerts = (alerts) => {
  if (!Array.isArray(alerts)) {
    return []
  }
  return alerts
    .filter((alert) => Number.isInteger(alert?.patient_id) && isCriticalHighAlert(alert))
    .sort((left, right) => toAlertTimestamp(right) - toAlertTimestamp(left))
}

const mergeAlertPreviews = (incomingAlerts, previousAlerts) => {
  const incoming = normalizeCriticalHighAlerts(incomingAlerts)
  const previous = normalizeCriticalHighAlerts(previousAlerts)
  if (!incoming.length) {
    return previous
  }

  const mostRecentIncoming = toAlertTimestamp(incoming[0])
  const mostRecentPrevious = previous.length ? toAlertTimestamp(previous[0]) : 0
  if (mostRecentIncoming < mostRecentPrevious) {
    return previous
  }

  const mergedById = new Map()
  ;[...incoming, ...previous].forEach((alert) => {
    if (!alert?.id) {
      return
    }
    const current = mergedById.get(alert.id)
    if (!current || toAlertTimestamp(alert) > toAlertTimestamp(current)) {
      mergedById.set(alert.id, alert)
    }
  })

  return Array.from(mergedById.values())
    .sort((left, right) => toAlertTimestamp(right) - toAlertTimestamp(left))
}

const areSameAlerts = (left, right) => {
  if (left === right) {
    return true
  }
  if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length) {
    return false
  }
  return left.every((item, index) => {
    const other = right[index]
    return item?.id === other?.id && toAlertTimestamp(item) === toAlertTimestamp(other)
  })
}

export default function DashboardPage() {
  const navigate = useNavigate()
  const {notifyError} = useNotifications()
  const [vitals, setVitals] = useState([])
  const [previewAlerts, setPreviewAlerts] = useState(null)
  const [totalAlerts, setTotalAlerts] = useState(0)
  const [doctorCount, setDoctorCount] = useState(0)
  const [patients, setPatients] = useState([])
  const [isLoadingDashboard, setIsLoadingDashboard] = useState(true)
  const [newAlertIds, setNewAlertIds] = useState([])
  const alertAudioRef = useRef(null)
  const alertHighlightTimeoutsRef = useRef([])

  const [chartData, setChartData] = useState([])

  const upsertPreviewAlerts = useCallback((incomingAlerts) => {
    setPreviewAlerts((prev) => {
      const next = mergeAlertPreviews(incomingAlerts, prev)
      const existing = Array.isArray(prev) ? prev : []
      const merged = [
        ...next,
        ...existing.filter((current) => !next.some((incoming) => incoming.id === current.id)),
      ]
        .sort((left, right) => toAlertTimestamp(right) - toAlertTimestamp(left))
        .slice(0, MAX_ALERTS)

      return areSameAlerts(existing, merged) ? prev : merged
    })
  }, [])

  if (!alertAudioRef.current) {
    alertAudioRef.current = new Audio("/alert.mp3")
  }

  const loadDashboardData = useCallback(async () => {
    try {
      const [patientsRes, alertsSummaryRes] = await Promise.all([
        listPatients({page: 1, limit: 100}),
        getAlertDashboardSummary(),
      ])

      setPatients(getResponseData(patientsRes))
      const summary = getResponseData(alertsSummaryRes)
      setTotalAlerts(Number(summary?.total_alerts || 0))
      upsertPreviewAlerts(summary?.preview_alerts)

    } catch (error) {
      notifyError(getErrorMessage(error))
    } finally {
      setIsLoadingDashboard(false)
    }
  }, [notifyError, upsertPreviewAlerts])

  useEffect(() => {
    loadDashboardData()
    const intervalId = window.setInterval(() => {
      loadDashboardData()
    }, 10000)
    return () => window.clearInterval(intervalId)
  }, [loadDashboardData])

  useEffect(() => {
    const loadDoctors = async () => {
      try {
        const response = await listDoctors()
        const data = getResponseData(response) || []
        setDoctorCount(Array.isArray(data) ? data.length : 0)
      } catch {
      }
    }

    loadDoctors().then(() => {
    })
  }, [])

  useEffect(() => {
    const socket = createWebSocket((msg) => {
      if (msg.type === "vital") {
        const v = msg.data

        setVitals((prev) => [
          {
            ...v,
            time: new Date().toLocaleTimeString(),
          },
          ...prev.slice(0, 20),
        ])

        setChartData((prev) => {
          const updated = [
            ...prev,
            {
              time: new Date().toLocaleTimeString(),
              heart_rate: v.heart_rate,
              oxygen_saturation: v.oxygen_saturation,
              temperature: v.temperature,
            },
          ]

          return updated.slice(-20)
        })
      }

      if (msg.type === "alert") {
        if (!msg.data?.patient_id) {
          return
        }
        setTotalAlerts((prev) => prev + 1)
        alertAudioRef.current.currentTime = 0
        alertAudioRef.current.play().catch(() => {
        })

        if (msg.data?.severity === "high" || msg.data?.severity === "critical") {
          setNewAlertIds((current) => [msg.data.id, ...current.filter((id) => id !== msg.data.id)].slice(0, 5))
          const timeoutId = window.setTimeout(() => {
            setNewAlertIds((current) => current.filter((currentId) => currentId !== msg.data.id))
          }, 1400)
          alertHighlightTimeoutsRef.current.push(timeoutId)

          upsertPreviewAlerts([msg.data])
        }
      }

    })

    return () => {
      socket.close()
      alertHighlightTimeoutsRef.current.forEach((timeoutId) => window.clearTimeout(timeoutId))
      alertHighlightTimeoutsRef.current = []
    }
  }, [upsertPreviewAlerts])

  const latestVital = vitals[0]
  const patientNameById = Object.fromEntries(patients.map((patient) => [patient.id, formatPatientFullName(patient)]))
  const validPatientIds = new Set(patients.map((patient) => patient.id))
  const visiblePreviewAlerts = (previewAlerts || []).filter((alert) => validPatientIds.has(alert.patient_id))
  const limitedVisiblePreviewAlerts = visiblePreviewAlerts.slice(0, MAX_PREVIEW_ALERTS)
  const alertCount = totalAlerts
  const recentVitals = vitals.slice(0, 5)

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
  const handleAlertClick = (alert) => {
    const patientId = Number(alert?.patient_id)
    const alertId = Number(alert?.id)
    if (!Number.isInteger(patientId) || patientId <= 0 || !Number.isInteger(alertId) || alertId <= 0) {
      return
    }
    navigate(`/alerts?patientId=${patientId}&alertId=${alertId}`)
  }

  return (
    <div className="app-shell min-h-screen px-4 py-6 text-slate-100 sm:px-6 lg:px-8">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6">
        <header className="console-topbar rounded-[24px] p-6 sm:p-8">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div className="space-y-3">
              <p className="console-eyebrow text-xs font-semibold uppercase tracking-[0.35em]">MedStream Console</p>
              <div>
                <h1 className="text-3xl font-semibold tracking-tight text-white sm:text-4xl">Hospital Monitoring
                  Dashboard</h1>
                <p className="mt-2 max-w-2xl text-sm text-[#b6bec9] sm:text-base">
                  Operational overview for clinical telemetry, admissions, department load, and alert escalation.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 lg:min-w-[36rem]">
              <div className="monitor-panel h-full min-h-[132px] rounded-2xl p-4">
                <p className="text-xs uppercase tracking-[0.25em] text-[#879196]">Patients</p>
                <p className="mt-3 text-3xl font-semibold text-white"><CountValue value={patients.length}/></p>
              </div>
              <div className="monitor-panel h-full min-h-[132px] rounded-2xl p-4">
                <p className="text-xs uppercase tracking-[0.25em] text-[#879196]">Alerts</p>
                <p className="mt-3 text-3xl font-semibold text-[#ffb3bc]"><CountValue tooltipLabel={String(alertCount)} value={alertCount}/>
                </p>
              </div>
              <div className="monitor-panel h-full min-h-[132px] rounded-2xl p-4">
                <p className="text-xs uppercase tracking-[0.25em] text-[#879196]">Doctors</p>
                <p className="mt-3 text-3xl font-semibold text-[#ffb84d]"><CountValue value={doctorCount}/></p>
              </div>
            </div>
          </div>
        </header>
        <section className="grid gap-6 xl:grid-cols-[1.65fr_1fr]">
          <div className="monitor-card rounded-[28px] border border-[#ff9900]/30 p-6">
            <div className="mb-6 flex flex-col gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.3em] text-[#ff9900]">Vitals Monitoring</p>
                <h2 className="mt-2 text-2xl font-semibold text-white">Vitals Overview</h2>
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
                  <p className="mt-2 text-xl font-semibold text-white"><CountValue value={vitals.length}/></p>
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
                <p className="mt-2 text-base font-semibold text-white"><CountValue tooltipLabel={String(alertCount)} value={alertCount}/>
                </p>
              </div>
              <div className="rounded-2xl border border-[#3b424b] bg-[#151b22] px-4 py-4">
                <p className="text-xs uppercase tracking-[0.22em] text-[#879196]">Feed Status</p>
                <p className="mt-2 text-base font-semibold text-white">{latestVital ? "Connected" : "Waiting for feed"}</p>
              </div>
            </div>

            {isLoadingDashboard ? (
              <div className="rounded-2xl border border-[#3b424b] bg-[#151b22] px-4 py-10 text-center text-sm text-[#b6bec9]">
                Loading dashboard data...
              </div>
            ) : vitals.length === 0 ? (
              <div className="rounded-2xl border border-[#3b424b] bg-[#151b22] px-4 py-10 text-center text-sm text-[#b6bec9]">
                Waiting for vitals. Keep the backend running and telemetry will appear here.
              </div>
            ) : (
              <div className="space-y-4">
                <VitalsChart data={chartData}/>
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                  <div className="monitor-panel rounded-2xl px-4 py-4">
                    <p className="text-xs uppercase tracking-[0.22em] text-[#879196]">HR Trend</p>
                    <p
                      className="mt-2 text-xl font-semibold text-white">{recentVitals.length ? recentHeartRateAverage.toFixed(1) : "--"}</p>
                    <p
                      className="mt-2 text-sm text-[#b6bec9]">{recentVitals.length ? `${formatDelta(heartRateDelta)} over last ${recentVitals.length} samples` : "Waiting for samples"}</p>
                  </div>
                  <div className="monitor-panel rounded-2xl px-4 py-4">
                    <p className="text-xs uppercase tracking-[0.22em] text-[#879196]">O2 Trend</p>
                    <p className="mt-2 text-xl font-semibold text-white">{recentVitals.length ? recentOxygenAverage.toFixed(1) : "--"}</p>
                    <p
                      className="mt-2 text-sm text-[#b6bec9]">{recentVitals.length ? `${formatDelta(oxygenDelta)} over last ${recentVitals.length} samples` : "Waiting for samples"}</p>
                  </div>
                  <div className="monitor-panel rounded-2xl px-4 py-4">
                    <p className="text-xs uppercase tracking-[0.22em] text-[#879196]">Temp Trend</p>
                    <p
                      className="mt-2 text-xl font-semibold text-white">{recentVitals.length ? recentTemperatureAverage.toFixed(1) : "--"}</p>
                    <p
                      className="mt-2 text-sm text-[#b6bec9]">{recentVitals.length ? `${formatDelta(temperatureDelta)} over last ${recentVitals.length} samples` : "Waiting for samples"}</p>
                  </div>
                  <div className="monitor-panel rounded-2xl px-4 py-4">
                    <p className="text-xs uppercase tracking-[0.22em] text-[#879196]">Latest BP</p>
                    <p
                      className="mt-2 text-xl font-semibold text-white">{latestVital ? `${latestVital.systolic_bp}/${latestVital.diastolic_bp}` : "--"}</p>
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
                  <h2 className="mt-2 text-2xl font-semibold text-white">Alert Preview</h2>
                </div>
              </div>
              <ul className="space-y-3">
                {previewAlerts === null && (
                  <li className="rounded-2xl border border-[#3b424b] bg-[#151b22] px-4 py-5 text-sm text-[#b6bec9]">
                    Loading alerts...
                  </li>
                )}
                {previewAlerts !== null && limitedVisiblePreviewAlerts.length === 0 && (
                  <li className="rounded-2xl border border-[#3b424b] bg-[#151b22] px-4 py-5 text-sm text-[#b6bec9]">
                    No critical or high alerts at the moment.
                  </li>
                )}
                {previewAlerts !== null && limitedVisiblePreviewAlerts.map((a) => (
                  <li
                    key={a.id}
                    onClick={() => handleAlertClick(a)}
                    className={`alert-item alert-${a.severity} ${newAlertIds.includes(a.id) ? "alert-new" : ""} hover:border-[#ff9900] transition-all duration-200 cursor-pointer`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-xs uppercase tracking-[0.28em] text-white/70">{a.severity} severity</p>
                        <p className="mt-2 text-sm font-medium text-inherit">
                          {patientNameById[a.patient_id]} - {a.message}
                        </p>
                      </div>
                      <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/70">
                        {new Date(a.created_at || Date.now()).toLocaleTimeString()}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
              <div className="mt-5">
                <button
                  type="button"
                  onClick={() => navigate("/alerts")}
                  className="console-button-secondary w-full rounded-2xl px-4 py-3 text-sm font-semibold"
                >
                  See more
                </button>
              </div>
            </div>

          </div>
        </section>
      </div>
    </div>
  )
}
