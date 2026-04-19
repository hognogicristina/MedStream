import {useEffect, useState} from "react"
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"
import {api} from "../services/api"
import {getErrorMessage, getResponseData} from "../services/apiMessages"

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
  const [metrics, setMetrics] = useState(null)
  const [alertsPage, setAlertsPage] = useState(1)
  const [recentAlerts, setRecentAlerts] = useState({items: [], total: 0, page: 1, page_size: ALERTS_PAGE_SIZE})
  const [history, setHistory] = useState([])
  const [error, setError] = useState("")

  useEffect(() => {
    let active = true

    const loadData = async () => {
      try {
        const [metricsResponse, alertsResponse] = await Promise.all([
          api.get("/metrics/streaming"),
          api.get("/metrics/streaming-alerts", {
            params: {
              page: alertsPage,
              page_size: ALERTS_PAGE_SIZE,
            },
          }),
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
        setError("")
        setHistory((current) => [
          ...current.slice(-(MAX_POINTS - 1)),
          {
            time: new Date().toLocaleTimeString([], {hour: "2-digit", minute: "2-digit", second: "2-digit"}),
            heart_rate: nextMetrics.avg_heart_rate,
          },
        ])
      } catch (loadError) {
        if (active) {
          setError(getErrorMessage(loadError))
        }
      }
    }

    loadData()
    const intervalId = window.setInterval(loadData, POLL_INTERVAL_MS)

    return () => {
      active = false
      window.clearInterval(intervalId)
    }
  }, [alertsPage])

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
          <p className="console-eyebrow text-xs font-semibold uppercase tracking-[0.35em]">Demo View</p>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight text-white sm:text-4xl">Streaming Metrics</h1>
          <p className="mt-3 max-w-3xl text-sm text-[#b6bec9] sm:text-base">
            Real-time data (updates every few seconds).
          </p>
          <div className="mt-4 rounded-2xl border border-[#2a3441] bg-[#11161c] px-4 py-4 text-sm leading-6 text-[#d5dbdb]">
            This view shows real-time patient monitoring data.
            <br/>
            Vitals and alerts are processed instantly as they are generated.
            <br/>
            This allows fast reaction, but values may fluctuate and are not always perfectly accurate.
          </div>
          {error ? <p className="mt-3 text-sm text-[#ffb3bc]">{error}</p> : null}
        </header>

        <section className="monitor-card rounded-[24px] p-6">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
            <MetricTile label="Avg Heart Rate" value={formatMetric(data.avg_heart_rate, " bpm")}/>
            <MetricTile label="Avg Oxygen" value={formatMetric(data.avg_oxygen, "%")}/>
            <MetricTile label="Avg Temperature" value={formatMetric(data.avg_temperature, " C")}/>
            <MetricTile label="Alerts Count" value={String(data.alerts ?? 0)}/>
            <MetricTile label="Execution Time" value={formatMetric(data.execution_time_ms, " ms")}/>
          </div>
        </section>

        <section className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
          <div className="monitor-card rounded-[24px] p-6">
            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-[#879196]">Live Trend</p>
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
      </div>
    </div>
  )
}
