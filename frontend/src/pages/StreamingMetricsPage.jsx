import {useEffect, useState} from "react"
import {
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
import {useNotifications} from "../components/useNotifications.js"
import BackButton from "../components/BackButton.jsx"
import LoadingSpinner from "../components/LoadingSpinner.jsx"

const POLL_INTERVAL_MS = 2500
const MAX_POINTS = 20
const ALERTS_PAGE_SIZE = 3

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

export default function StreamingMetricsPage() {
  const {notifyError} = useNotifications()
  const [metrics, setMetrics] = useState(null)
  const [alertsPage, setAlertsPage] = useState(1)
  const [recentAlerts, setRecentAlerts] = useState({items: [], total: 0, page: 1, page_size: ALERTS_PAGE_SIZE})
  const [history, setHistory] = useState([])
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    let active = true

    const loadData = async () => {
      if (metrics === null) {
        setIsLoading(true)
      }
      try {
        const [metricsResponse, alertsResponse] = await Promise.all([
          getStreamingMetrics(),
          getStreamingAlerts(alertsPage, ALERTS_PAGE_SIZE),
        ])

        if (!active) {
          return
        }

        const nextMetrics = getResponseData(metricsResponse)
        const nextAlerts = getResponseData(alertsResponse)
        const totalPages = Math.max(1, Math.ceil((nextAlerts.total || 0) / ALERTS_PAGE_SIZE))

        if (alertsPage > totalPages) {
          setAlertsPage(totalPages)
          return
        }

        setMetrics(nextMetrics)
        setRecentAlerts(nextAlerts)
        setHistory((current) => [
          ...current.slice(-(MAX_POINTS - 1)),
          {
            time: new Date().toLocaleTimeString([], {hour: "2-digit", minute: "2-digit", second: "2-digit"}),
            heart_rate: nextMetrics.avg_heart_rate,
          },
        ])
      } catch (loadError) {
        if (active) {
          notifyError(getErrorMessage(loadError), {duration: 5000})
        }
      } finally {
        if (active) {
          setIsLoading(false)
        }
      }
    }

    loadData()
    const intervalId = window.setInterval(loadData, POLL_INTERVAL_MS)

    return () => {
      active = false
      window.clearInterval(intervalId)
    }
  }, [alertsPage, metrics, notifyError])

  const data = metrics ?? {
    avg_heart_rate: 0,
    avg_oxygen: 0,
    avg_temperature: 0,
    alerts: 0,
    execution_time_ms: 0,
  }
  const alertsTotalPages = Math.max(1, Math.ceil((recentAlerts.total || 0) / ALERTS_PAGE_SIZE))

  return (
    <div className="app-shell min-h-screen px-4 py-6 text-slate-100 sm:px-6 lg:px-8">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6">
        <header className="console-topbar rounded-[24px] p-6 sm:p-8">
          <div className="flex flex-col gap-4">
            <div className="flex justify-end gap-2">
              <button
                type="button"
                title="Download all metrics"
                aria-label="Download all metrics"
                className="console-button-primary self-start shrink-0 rounded-xl p-3 text-sm font-semibold"
                onClick={() => {
                  const rows = [
                    ["Section", "Metric", "Value"],
                    ["Streaming Snapshot", "Avg Heart Rate", data.avg_heart_rate],
                    ["Streaming Snapshot", "Avg Oxygen", data.avg_oxygen],
                    ["Streaming Snapshot", "Avg Temperature", data.avg_temperature],
                    ["Streaming Snapshot", "Alerts Count", data.alerts],
                    ["Streaming Snapshot", "Execution Time (ms)", data.execution_time_ms],
                    ["Recent Alerts", "Alert ID", "Patient ID", "Type", "Severity", "Message", "Created At"],
                    ...(recentAlerts.items || []).map((alert) => [
                      "Recent Alerts",
                      alert.id,
                      alert.patient_id,
                      alert.alert_type,
                      alert.severity,
                      alert.message,
                      alert.created_at,
                    ]),
                    ["Heart Rate Trend", "Time", "Avg Heart Rate"],
                    ...history.map((point) => ["Heart Rate Trend", point.time, point.heart_rate]),
                  ]
                  downloadCSV("streaming_all_metrics.csv", rows)
                }}
              >
                <DownloadIcon/>
              </button>
              <BackButton fallbackTo="/dashboard"/>
            </div>
            <div className="w-full">
              <p className="console-eyebrow text-xs font-semibold uppercase tracking-[0.35em]">Demo View</p>
              <h1 className="mt-3 text-3xl font-semibold tracking-tight text-white sm:text-4xl">Streaming Metrics</h1>
              <p className="mt-3 w-full text-sm text-[#b6bec9]">
                This view shows real-time patient monitoring data.
                Vitals and alerts are processed instantly as they are generated.
                This allows fast reaction, but values may fluctuate and are not always perfectly accurate.
                Data is refreshed every ~2.5 seconds using polling, simulating a real-time monitoring system.
              </p>
            </div>
          </div>
        </header>

        <section className="monitor-card rounded-[24px] p-6">
          {isLoading ? <LoadingSpinner/> : (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
            <MetricTile label="Avg Heart Rate" value={formatMetric(data.avg_heart_rate, " bpm")}/>
            <MetricTile label="Avg Oxygen" value={formatMetric(data.avg_oxygen, "%")}/>
            <MetricTile label="Avg Temperature" value={formatMetric(data.avg_temperature, " C")}/>
            <MetricTile label="Alerts Count" value={String(data.alerts ?? 0)}/>
            <MetricTile label="Execution Time" value={formatMetric(data.execution_time_ms, " ms")}/>
          </div>
          )}
        </section>

        {!isLoading && (
        <>
        <section className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
          <div className="monitor-card rounded-[24px] p-6">
            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-[#879196]">Live Trend</p>
            <p className="mt-2 text-sm text-[#b6bec9]">
              This chart shows the evolution of the average heart rate over time.
              Each point represents a real-time snapshot, illustrating how values fluctuate continuously.
            </p>
            <h2 className="mt-2 text-2xl font-semibold text-white">Average Heart Rate</h2>

            <div className="mt-6 h-[280px] rounded-2xl border border-[#2a3441] bg-[#0f141a] p-4">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={history}>
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
                  <Line type="monotone" dataKey="heart_rate" stroke="#f97316" strokeWidth={3} dot={false}/>
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="monitor-card rounded-[24px] p-6">
            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-[#879196]">Latest Alerts</p>
            <h2 className="mt-2 text-2xl font-semibold text-white">Streaming Alert Feed</h2>
            <p className="mt-2 text-sm text-[#b6bec9]">
              Alerts are triggered instantly when predefined thresholds are exceeded
              (e.g., abnormal heart rate or oxygen levels). This demonstrates real-time anomaly detection.
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
