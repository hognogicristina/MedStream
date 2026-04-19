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

const POLL_INTERVAL_MS = 4000
const MAX_HISTORY_POINTS = 24

function formatMetric(value, unit = "") {
  const safeValue = Number.isFinite(value) ? value : 0
  return `${safeValue.toFixed(2)}${unit}`
}

function formatDifference(streamingValue, batchValue, unit = "") {
  const diff = (streamingValue || 0) - (batchValue || 0)
  const prefix = diff > 0 ? "+" : ""
  return `${prefix}${diff.toFixed(2)}${unit}`
}

function ComparisonCard({title, data, differences, accentClass}) {
  const metrics = [
    {label: "Avg Heart Rate", value: formatMetric(data.avg_heart_rate, " bpm"), diff: differences.avg_heart_rate},
    {label: "Avg Oxygen", value: formatMetric(data.avg_oxygen, "%"), diff: differences.avg_oxygen},
    {label: "Avg Temperature", value: formatMetric(data.avg_temperature, " C"), diff: differences.avg_temperature},
    {label: "Alerts Count", value: String(data.alerts ?? 0), diff: differences.alerts},
    {label: "Execution Time", value: formatMetric(data.execution_time_ms, " ms"), diff: differences.execution_time_ms},
  ]

  return (
    <section className="monitor-card rounded-[24px] p-6">
      <div className="flex items-center justify-between">
        <div>
          <p className={`text-xs font-semibold uppercase tracking-[0.3em] ${accentClass}`}>{title}</p>
          <h2 className="mt-2 text-2xl font-semibold text-white">{title} Metrics</h2>
        </div>
      </div>

      <div className="mt-6 space-y-3">
        {metrics.map((metric) => (
          <div key={metric.label} className="monitor-panel rounded-2xl px-4 py-3">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs uppercase tracking-[0.2em] text-[#879196]">{metric.label}</p>
                <p className="mt-2 text-lg font-semibold text-white">{metric.value}</p>
              </div>
              <div className="rounded-full border border-[#4d5661] bg-[#232f3e] px-3 py-1 text-xs font-semibold text-[#d5dbdb]">
                {metric.diff}
              </div>
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}

export default function StreamingBatchPage() {
  const [comparison, setComparison] = useState(null)
  const [history, setHistory] = useState([])
  const [error, setError] = useState("")

  useEffect(() => {
    let active = true

    const loadComparison = async () => {
      try {
        const response = await api.get("/metrics/comparison")
        const data = getResponseData(response)

        if (!active) {
          return
        }

        setComparison(data)
        setError("")
        setHistory((current) => [
          ...current.slice(-(MAX_HISTORY_POINTS - 1)),
          {
            time: new Date().toLocaleTimeString([], {hour: "2-digit", minute: "2-digit", second: "2-digit"}),
            streaming: data.streaming.avg_heart_rate,
            batch: data.batch.avg_heart_rate,
          },
        ])
      } catch (loadError) {
        if (active) {
          setError(getErrorMessage(loadError))
        }
      }
    }

    loadComparison()
    const intervalId = window.setInterval(loadComparison, POLL_INTERVAL_MS)

    return () => {
      active = false
      window.clearInterval(intervalId)
    }
  }, [])

  const streaming = comparison?.streaming ?? {
    avg_heart_rate: 0,
    avg_oxygen: 0,
    avg_temperature: 0,
    alerts: 0,
    execution_time_ms: 0,
  }
  const batch = comparison?.batch ?? streaming

  const differences = {
    avg_heart_rate: formatDifference(streaming.avg_heart_rate, batch.avg_heart_rate, " bpm"),
    avg_oxygen: formatDifference(streaming.avg_oxygen, batch.avg_oxygen, "%"),
    avg_temperature: formatDifference(streaming.avg_temperature, batch.avg_temperature, " C"),
    alerts: formatDifference(streaming.alerts, batch.alerts),
    execution_time_ms: formatDifference(streaming.execution_time_ms, batch.execution_time_ms, " ms"),
  }

  return (
    <div className="app-shell min-h-screen px-4 py-6 text-slate-100 sm:px-6 lg:px-8">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6">
        <header className="console-topbar rounded-[24px] p-6 sm:p-8">
          <p className="console-eyebrow text-xs font-semibold uppercase tracking-[0.35em]">Demo View</p>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight text-white sm:text-4xl">Streaming vs Batch</h1>
          <p className="mt-3 max-w-3xl text-sm text-[#b6bec9] sm:text-base">
            Compare live rolling metrics with batch-style metrics over the last 5 minutes. Refresh interval: 4 seconds.
          </p>
          <div className="mt-4 rounded-2xl border border-[#2a3441] bg-[#11161c] px-4 py-4 text-sm leading-6 text-[#d5dbdb]">
            This view compares real-time streaming data with batch-processed results.
            <br/>
            Streaming is fast and responsive, while batch is slower but more accurate.
            <br/>
            This demonstrates the trade-off between speed and accuracy in data processing systems.
          </div>
          {error ? <p className="mt-3 text-sm text-[#ffb3bc]">{error}</p> : null}
        </header>

        <section className="grid gap-6 lg:grid-cols-2">
          <ComparisonCard title="Streaming" data={streaming} differences={differences} accentClass="text-[#ff9900]"/>
          <ComparisonCard title="Batch" data={batch} differences={differences} accentClass="text-[#9dccff]"/>
        </section>

        <section className="monitor-card rounded-[24px] p-6">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.3em] text-[#879196]">Avg Heart Rate Trend</p>
              <h2 className="mt-2 text-2xl font-semibold text-white">Last {history.length} Polls</h2>
            </div>
          </div>

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
                <Line type="monotone" dataKey="streaming" stroke="#f97316" strokeWidth={3} dot={false}/>
                <Line type="monotone" dataKey="batch" stroke="#60a5fa" strokeWidth={3} dot={false}/>
              </LineChart>
            </ResponsiveContainer>
          </div>
        </section>
      </div>
    </div>
  )
}
