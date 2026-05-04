import {useEffect, useState} from "react"
import {
  getMetricsComparison,
  getStreamingAlerts,
  getStreamingMetrics,
} from "../services/patientApi.js"
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"
import {getErrorMessage, getResponseData} from "../services/apiMessages.js"
import {downloadCSV} from "../utils/downloadCSV.js"
import {useNotifications} from "../hooks/useNotifications.js"
import BackButton from "../components/BackButton.jsx"
import LoadingSpinner from "../components/LoadingSpinner.jsx"

const POLL_INTERVAL_MS = 2500
const MAX_POINTS = 30
const ALERTS_PAGE_SIZE = 3
const ALERTS_TELEMETRY_SIZE = 10
const ALERTS_WINDOW_SECONDS = 60

function formatMetric(value, unit = "") {
  const safeValue = Number.isFinite(value) ? value : 0
  return `${safeValue.toFixed(2)}${unit}`
}

function MetricTile({label, value}) {
  return (
    <div className="monitor-panel rounded-2xl px-4 py-3">
      <p className="text-xs uppercase tracking-[0.2em] text-[#879196]">{label}</p>
      <p className="mt-2 text-lg font-semibold text-white">{value}</p>
    </div>
  )
}

function DownloadIcon() {
  return (
    <svg aria-hidden="true" className="h-4 w-4" fill="none" viewBox="0 0 24 24">
      <path d="M12 3v11m0 0 4-4m-4 4-4-4M5 21h14" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2"/>
    </svg>
  )
}

function formatAlertTime(value) {
  if (!value) {
    return "Unknown time"
  }

  return new Date(value).toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    timeZone: "Europe/Bucharest",
  })
}

function toMillis(value) {
  const parsed = new Date(value).getTime()
  return Number.isFinite(parsed) ? parsed : null
}

export default function StreamingMetricsPage() {
  const {notifyError} = useNotifications()
  const [metrics, setMetrics] = useState(null)
  const [comparison, setComparison] = useState(null)
  const [alertsPage, setAlertsPage] = useState(1)
  const [recentAlerts, setRecentAlerts] = useState({items: [], total: 0, page: 1, page_size: ALERTS_PAGE_SIZE})
  const [heartRateHistory, setHeartRateHistory] = useState([])
  const [alertsRateHistory, setAlertsRateHistory] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [seenAlertIds, setSeenAlertIds] = useState({})
  const [lastAlertTime, setLastAlertTime] = useState(null)

  useEffect(() => {
    let active = true
    let isFirstLoad = true

    const loadData = async () => {
      if (isFirstLoad) {
        setIsLoading(true)
      }
      try {
        const [metricsResponse, alertsResponse, telemetryAlertsResponse, comparisonResponse] = await Promise.all([
          getStreamingMetrics(),
          getStreamingAlerts(alertsPage, ALERTS_PAGE_SIZE),
          getStreamingAlerts(1, ALERTS_TELEMETRY_SIZE),
          getMetricsComparison(),
        ])

        if (!active) {
          return
        }

        const nextMetrics = getResponseData(metricsResponse)
        const nextAlerts = getResponseData(alertsResponse)
        const telemetryAlerts = getResponseData(telemetryAlertsResponse)
        const nextComparison = getResponseData(comparisonResponse)
        setComparison(nextComparison || null)
        const totalPages = Math.max(1, Math.ceil((nextAlerts.total || 0) / ALERTS_PAGE_SIZE))

        if (alertsPage > totalPages) {
          setAlertsPage(totalPages)
          return
        }

        setMetrics(nextMetrics)
        setRecentAlerts(nextAlerts)

        const tickTime = new Date().toLocaleTimeString([], {hour: "2-digit", minute: "2-digit", second: "2-digit"})

        setHeartRateHistory((current) => [
          ...current.slice(-(MAX_POINTS - 1)),
          {
            time: tickTime,
            heart_rate: nextMetrics.avg_heart_rate,
          },
        ])

        const telemetryItems = Array.isArray(telemetryAlerts.items) ? telemetryAlerts.items : []
        const newestAlert = telemetryItems[0]
        if (newestAlert?.created_at) {
          setLastAlertTime(newestAlert.created_at)
        }

        setSeenAlertIds((currentSeen) => {
          const nextSeen = {...currentSeen}
          const nowMs = Date.now()
          const windowStartMs = nowMs - ALERTS_WINDOW_SECONDS * 1000
          let newAlerts = 0

          telemetryItems.forEach((alert) => {
            if (alert?.id == null) {
              return
            }
            const createdAtMs = toMillis(alert.created_at)
            if (createdAtMs == null) {
              return
            }
            const key = String(alert.id)
            if (!nextSeen[key]) {
              nextSeen[key] = createdAtMs
              newAlerts += 1
            }
          })

          Object.keys(nextSeen).forEach((key) => {
            if ((nextSeen[key] || 0) < windowStartMs) {
              delete nextSeen[key]
            }
          })

          const activeCount = Object.keys(nextSeen).length
          const perSecond = activeCount / ALERTS_WINDOW_SECONDS
          const perMinute = activeCount

          setAlertsRateHistory((current) => [
            ...current.slice(-(MAX_POINTS - 1)),
            {
              time: tickTime,
              alerts_per_second: Number(perSecond.toFixed(3)),
              alerts_per_minute: perMinute,
              new_alerts_tick: newAlerts,
            },
          ])

          return nextSeen
        })
      } catch (loadError) {
        if (active) {
          notifyError(getErrorMessage(loadError), {duration: 5000})
        }
      } finally {
        if (active) {
          setIsLoading(false)
          isFirstLoad = false
        }
      }
    }

    loadData()
    const intervalId = window.setInterval(loadData, POLL_INTERVAL_MS)

    return () => {
      active = false
      window.clearInterval(intervalId)
    }
  }, [alertsPage, notifyError])

  const data = metrics ?? {
    avg_heart_rate: 0,
    avg_oxygen: 0,
    avg_temperature: 0,
    alerts: 0,
    execution_time_ms: 0,
  }

  const latestRatePoint = alertsRateHistory[alertsRateHistory.length - 1] || {
    alerts_per_second: 0,
    alerts_per_minute: 0,
    new_alerts_tick: 0,
  }

  const alertsTotalPages = Math.max(1, Math.ceil((recentAlerts.total || 0) / ALERTS_PAGE_SIZE))

  return (
    <div className="app-shell min-h-screen px-4 py-6 text-slate-100 sm:px-6 lg:px-8">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6">
        <header className="console-topbar rounded-[24px] p-6 sm:p-8">
          <div className="flex flex-col gap-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="console-eyebrow text-xs font-semibold uppercase tracking-[0.35em]">Demo View</p>
                <h1 className="mt-3 text-3xl font-semibold tracking-tight text-white sm:text-4xl">Streaming Alert Processing</h1>
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  title="Download all metrics"
                  aria-label="Download all metrics"
                  className="console-button-primary self-start shrink-0 rounded-xl p-3 text-sm font-semibold"
                  onClick={() => {
                    const exportTimestamp = new Date().toISOString()
                    const totalEvents = Number(comparison?.total_events) || 0
                    const totalAlerts = Number(comparison?.total_alerts) || Number(data.alerts) || 0
                    const alertsPerSecond = Number(comparison?.events_per_second) > 0
                      ? (Number(comparison?.alert_rate) || 0) * Number(comparison?.events_per_second)
                      : Number(latestRatePoint.alerts_per_second) || 0
                    const alertsPerMinute = alertsPerSecond * 60
                    const alertRate = totalEvents > 0 ? totalAlerts / totalEvents : 0
                    const streamingLatencyAvgMs = Number(comparison?.streaming_latency_avg) || 0
                    const rows = [
                      [
                        "timestamp",
                        "total_events",
                        "total_alerts",
                        "alerts_per_second",
                        "alerts_per_minute",
                        "alert_rate",
                        "streaming_latency_avg_ms",
                      ],
                      [
                        exportTimestamp,
                        totalEvents,
                        totalAlerts,
                        Number(alertsPerSecond.toFixed(4)),
                        Number(alertsPerMinute.toFixed(2)),
                        Number(alertRate.toFixed(4)),
                        Number(streamingLatencyAvgMs.toFixed(2)),
                      ],
                      [],
                      ["recent_alert_id", "recent_alert_patient_id", "recent_alert_type", "recent_alert_severity", "recent_alert_message", "recent_alert_created_at"],
                      ...(recentAlerts.items || []).map((alert) => [
                        alert.id,
                        alert.patient_id,
                        alert.alert_type,
                        alert.severity,
                        alert.message,
                        alert.created_at ? new Date(alert.created_at).toISOString() : "",
                      ]),
                    ]
                    downloadCSV("streaming_all_metrics.csv", rows)
                  }}
                >
                  <DownloadIcon/>
                </button>
                <BackButton fallbackTo="/dashboard"/>
              </div>
            </div>
            <p className="mt-4 text-[#b6bec9]">
              This view prioritizes live alert processing. You can see throughput changing in real time,
              new alerts appearing immediately, and processing latency indicators updating every poll cycle.
            </p>
          </div>
        </header>

        <section className="monitor-card rounded-[24px] p-6">
          {isLoading ? <LoadingSpinner/> : (
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-6">
              <MetricTile label="Alerts per Second" value={formatMetric(latestRatePoint.alerts_per_second)}/>
              <MetricTile label="Alerts per Minute" value={formatMetric(latestRatePoint.alerts_per_minute)}/>
              <MetricTile label="New Alerts (last tick)" value={String(latestRatePoint.new_alerts_tick ?? 0)}/>
              <MetricTile label="Live Alerts (window)" value={String(data.alerts ?? 0)}/>
              <MetricTile label="Avg Heart Rate" value={formatMetric(data.avg_heart_rate, " bpm")}/>
              <MetricTile label="Execution Time" value={formatMetric(data.execution_time_ms, " ms")}/>
            </div>
          )}
        </section>

        {!isLoading && (
          <>
            <section className="grid gap-6 xl:grid-cols-[1.35fr_0.65fr]">
              <div className="monitor-card rounded-[24px] p-6">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.3em] text-[#ff9900]">Primary Signal</p>
                    <h2 className="mt-2 text-2xl font-semibold text-white">Streaming Alert Feed</h2>
                  </div>
                  <div className="rounded-full border border-[#4d5661] bg-[#232f3e] px-3 py-1 text-xs font-semibold text-[#d5dbdb]">
                    Last alert: {formatAlertTime(lastAlertTime)}
                  </div>
                </div>
                <p className="mt-2 text-sm text-[#b6bec9]">
                  Alerts are appended as soon as threshold checks trigger. This is the fastest view of abnormal vitals.
                </p>

                <div className="mt-6 space-y-3">
                  {recentAlerts.items?.length ? recentAlerts.items.map((alert) => (
                    <div key={alert.id} className="monitor-panel rounded-2xl px-4 py-3">
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <p className="text-sm font-semibold text-white">{alert.message}</p>
                          <p className="mt-1 text-xs uppercase tracking-[0.2em] text-[#879196]">
                            {alert.alert_type} | Patient #{alert.patient_id} | {formatAlertTime(alert.created_at)}
                          </p>
                        </div>
                        <div className="rounded-full border border-[#4d5661] bg-[#232f3e] px-3 py-1 text-xs font-semibold text-[#d5dbdb]">
                          {alert.severity}
                        </div>
                      </div>
                    </div>
                  )) : (
                    <div className="monitor-panel rounded-2xl px-4 py-6 text-sm text-[#b6bec9]">
                      No alerts in the current feed.
                    </div>
                  )}
                </div>

                <div className="mt-6 flex items-center justify-between gap-3">
                  <button
                    type="button"
                    className="console-button-secondary rounded-xl px-4 py-2 text-sm font-semibold"
                    disabled={(recentAlerts.page || 1) <= 1}
                    onClick={() => setAlertsPage((current) => Math.max(1, current - 1))}
                  >
                    Previous
                  </button>
                  <p className="text-sm text-[#b6bec9]">
                    Page {recentAlerts.page || 1} of {alertsTotalPages}
                  </p>
                  <button
                    type="button"
                    className="console-button-secondary rounded-xl px-4 py-2 text-sm font-semibold"
                    disabled={(recentAlerts.page || 1) >= alertsTotalPages}
                    onClick={() => setAlertsPage((current) => Math.min(alertsTotalPages, current + 1))}
                  >
                    Next
                  </button>
                </div>
              </div>

              <div className="monitor-card rounded-[24px] p-6">
                <p className="text-xs font-semibold uppercase tracking-[0.3em] text-[#879196]">Live Throughput</p>
                <h2 className="mt-2 text-2xl font-semibold text-white">Alerts per Minute</h2>
                <p className="mt-2 text-sm text-[#b6bec9]">
                  Throughput is computed from newly observed alerts in the rolling 60-second window.
                </p>

                <div className="mt-6 h-[280px] rounded-2xl border border-[#2a3441] bg-[#0f141a] p-4">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={alertsRateHistory}>
                      <CartesianGrid stroke="#1f2937" strokeDasharray="3 3" vertical={false}/>
                      <XAxis dataKey="time" stroke="#6b7280" tick={{fontSize: 11}} minTickGap={20}/>
                      <YAxis stroke="#6b7280" tick={{fontSize: 11}} domain={[0, "auto"]}/>
                      <Tooltip
                        contentStyle={{
                          backgroundColor: "#0f172a",
                          border: "1px solid #334155",
                          borderRadius: "12px",
                          color: "#fff",
                        }}
                      />
                      <Line type="monotone" dataKey="alerts_per_minute" name="Alerts/Minute" stroke="#f97316" strokeWidth={3} dot={false}/>
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </section>

            <section className="monitor-card rounded-[24px] p-6">
              <p className="text-xs font-semibold uppercase tracking-[0.3em] text-[#879196]">
                Supporting Signal
              </p>
              <h2 className="mt-2 text-2xl font-semibold text-white">
                Vital Signs Trend (Heart Rate)
              </h2>
              <p className="mt-2 text-sm text-[#b6bec9]">
                Displays the evolution of patient vitals over time, providing context for alert generation in the streaming pipeline.
              </p>

              <div className="mt-6 h-[250px] rounded-2xl border border-[#2a3441] bg-[#0f141a] p-4">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={heartRateHistory}>
                    <CartesianGrid stroke="#1f2937" strokeDasharray="3 3" vertical={false}/>
                    <XAxis dataKey="time" stroke="#6b7280" tick={{fontSize: 11}} minTickGap={24}/>
                    <YAxis stroke="#6b7280" tick={{fontSize: 11}} domain={["auto", "auto"]}/>
                    <Tooltip
                      contentStyle={{
                        backgroundColor: "#0f172a",
                        border: "1px solid #334155",
                        borderRadius: "12px",
                        color: "#fff",
                      }}
                    />
                    <Line type="monotone" dataKey="heart_rate" stroke="#60a5fa" strokeWidth={2} dot={false}/>
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </section>

            <section className="monitor-card rounded-[24px] p-6">
              <p className="text-xs font-semibold uppercase tracking-[0.3em] text-[#879196]">Understanding Streaming Processing</p>
              <h2 className="mt-2 text-2xl font-semibold text-white">How this page works</h2>

              <div className="mt-4 space-y-4 text-sm text-[#b6bec9] leading-6">
                <p>
                  This page represents the <strong>streaming (real-time) processing layer</strong> of the system.
                  Data is processed immediately as it is generated, without waiting for accumulation.
                </p>

                <p>
                  Patient vitals such as heart rate, oxygen level, and temperature are continuously ingested,
                  analyzed, and displayed in near real-time. This allows instant visibility into patient conditions.
                </p>

                <div className="rounded-xl border border-[#2a3441] bg-[#11161c] p-4">
                  <p className="font-semibold text-white mb-2">What you are seeing:</p>
                  <ul className="list-disc pl-5 space-y-1">
                    <li>Live averages updated every few seconds</li>
                    <li>A continuously updating heart rate trend</li>
                    <li>A real-time alert feed triggered by abnormal values</li>
                    <li>Execution time of streaming computations</li>
                  </ul>
                </div>

                <div className="rounded-xl border border-[#2a3441] bg-[#11161c] p-4">
                  <p className="font-semibold text-white mb-2">Why streaming processing matters:</p>
                  <ul className="list-disc pl-5 space-y-1">
                    <li>Enables immediate detection of critical conditions</li>
                    <li>Supports real-time monitoring systems (e.g., ICU dashboards)</li>
                    <li>Allows instant reaction to anomalies (alerts)</li>
                  </ul>
                </div>

                <div className="rounded-xl border border-[#2a3441] bg-[#11161c] p-4">
                  <p className="font-semibold text-white mb-2">Technical flow:</p>
                  <ul className="list-disc pl-5 space-y-1">
                    <li>Data is produced continuously (simulated sensors or real inputs)</li>
                    <li>Events are sent through a streaming platform (Kafka)</li>
                    <li>A streaming processor consumes and processes events in real-time</li>
                    <li>Alerts are generated instantly when thresholds are exceeded</li>
                    <li>Results are exposed via API and updated in the UI every few seconds</li>
                  </ul>
                </div>

                <div className="rounded-xl border border-[#2a3441] bg-[#11161c] p-4">
                  <p className="font-semibold text-white mb-2">Trade-offs:</p>
                  <ul className="list-disc pl-5 space-y-1">
                    <li>Very low latency (near instant updates)</li>
                    <li>Higher variability (values may fluctuate)</li>
                    <li>Less suitable for deep historical analysis</li>
                    <li>More complex infrastructure (event streaming systems)</li>
                  </ul>
                </div>

                <p>
                  This layer complements batch processing: streaming provides <strong>speed and reactivity</strong>,
                  while batch provides <strong>accuracy and deeper insights</strong>.
                </p>
              </div>
            </section>
          </>
        )}
      </div>
    </div>
  )
}
