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
import {getBatchMetrics, getMetricsComparison, getStreamingMetrics} from "../services/patientApi.js"
import {getErrorMessage, getResponseData} from "../services/apiMessages.js"
import {downloadCSV} from "../utils/downloadCSV.js"
import {useNotifications} from "../hooks/useNotifications.js"
import BackButton from "../components/BackButton.jsx"
import LoadingSpinner from "../components/LoadingSpinner.jsx"
import {useTheme} from "../components/ThemeContext.jsx"
import {getChartTheme} from "../utils/theme.js"

const POLL_INTERVAL_MS = 4000
const MAX_HISTORY_POINTS = 30

function formatFixed(value, digits = 2) {
  const safeValue = Number.isFinite(value) ? value : 0
  return safeValue.toFixed(digits)
}

function MetricCard({label, value, hint}) {
  return (
    <div className="monitor-panel rounded-2xl px-4 py-4">
      <p className="text-xs uppercase tracking-[0.2em] text-[var(--text-muted)]">{label}</p>
      <p className="mt-2 text-2xl font-semibold text-[var(--text-primary)]">{value}</p>
      <p className="mt-1 text-xs text-[var(--text-secondary)]">{hint}</p>
    </div>
  )
}

function SectionHeader({title, subtitle, accentClass = "text-[var(--text-muted)]"}) {
  return (
    <div>
      <p className={`text-xs font-semibold uppercase tracking-[0.3em] ${accentClass}`}>{title}</p>
      <p className="mt-2 text-sm text-[var(--text-secondary)]">{subtitle}</p>
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

export default function StreamingBatchPage() {
  const {notifyError} = useNotifications()
  const {theme} = useTheme()
  const chartTheme = getChartTheme(theme)
  const [comparison, setComparison] = useState(null)
  const [streamingMetricsSnapshot, setStreamingMetricsSnapshot] = useState(null)
  const [batchMetricsSnapshot, setBatchMetricsSnapshot] = useState(null)
  const [history, setHistory] = useState([])
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    let active = true
    let isFirstLoad = true

    const loadData = async () => {
      if (isFirstLoad) {
        setIsLoading(true)
      }

      try {
        const [comparisonResponse, streamingResponse, batchResponse] = await Promise.all([
          getMetricsComparison(),
          getStreamingMetrics(),
          getBatchMetrics(),
        ])

        if (!active) {
          return
        }

        const nextComparison = getResponseData(comparisonResponse)
        const streamingMetrics = getResponseData(streamingResponse)
        const batchMetrics = getResponseData(batchResponse)

        setComparison(nextComparison)
        setStreamingMetricsSnapshot(streamingMetrics || null)
        setBatchMetricsSnapshot(batchMetrics || null)
        setHistory((current) => [
          ...current.slice(-(MAX_HISTORY_POINTS - 1)),
          {
            time_iso: new Date().toISOString(),
            time: new Date().toLocaleTimeString([], {hour: "2-digit", minute: "2-digit", second: "2-digit"}),
            streaming_alerts: streamingMetrics.alerts ?? 0,
            batch_alerts: batchMetrics.alerts ?? 0,
          },
        ])
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
  }, [notifyError])

  const data = comparison ?? {
    streaming_latency_avg: 0,
    batch_latency_avg: 0,
    total_events: 0,
    total_alerts: 0,
    events_per_second: 0,
    alert_rate: 0,
  }

  const batchLatencyMinutes = (Number(data.batch_latency_avg) || 0) / 60

  return (
    <div className="app-shell min-h-screen px-4 py-6 text-[var(--text-primary)] sm:px-6 lg:px-8">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6">
        <header className="console-topbar rounded-[24px] p-6 sm:p-8">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="console-eyebrow text-xs font-semibold uppercase tracking-[0.35em]">Demo View</p>
              <h1 className="mt-3 text-3xl font-semibold tracking-tight text-[var(--text-primary)] sm:text-4xl">Streaming vs Batch</h1>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                title="Download metrics"
                aria-label="Download metrics"
                className="console-button-primary self-start shrink-0 rounded-xl p-3 text-sm font-semibold"
                onClick={() => {
                  const exportTimestamp = new Date().toISOString()
                  const streamingLatencyMs = Number(data.streaming_latency_avg) || 0
                  const batchLatencyMs = (Number(data.batch_latency_avg) || 0) * 1000
                  const latencyDifferenceMs = batchLatencyMs - streamingLatencyMs
                  const responsivenessRatio = streamingLatencyMs > 0
                    ? batchLatencyMs / streamingLatencyMs
                    : 0
                  const rows = [
                    [
                      "timestamp",
                      "streaming_latency_avg_ms",
                      "batch_latency_avg_ms",
                      "total_events",
                      "total_alerts",
                      "alert_rate",
                      "events_per_second",
                      "latency_difference_ms",
                      "responsiveness_ratio",
                      "streaming_snapshot_timestamp",
                      "batch_snapshot_timestamp",
                    ],
                    [
                      exportTimestamp,
                      Number(streamingLatencyMs.toFixed(2)),
                      Number(batchLatencyMs.toFixed(2)),
                      Number(data.total_events) || 0,
                      Number(data.total_alerts) || 0,
                      Number((Number(data.alert_rate) || 0).toFixed(4)),
                      Number((Number(data.events_per_second) || 0).toFixed(4)),
                      Number(latencyDifferenceMs.toFixed(2)),
                      Number(responsivenessRatio.toFixed(4)),
                      streamingMetricsSnapshot?.timestamp ? new Date(streamingMetricsSnapshot.timestamp).toISOString() : "",
                      batchMetricsSnapshot?.timestamp ? new Date(batchMetricsSnapshot.timestamp).toISOString() : "",
                    ],
                    [],
                    ["history_timestamp", "streaming_alerts_window", "batch_alerts_total"],
                    ...history.map((point) => [point.time_iso || "", point.streaming_alerts, point.batch_alerts]),
                  ]
                  downloadCSV("streaming_batch_comparison.csv", rows)
                }}
              >
                <DownloadIcon/>
              </button>
              <BackButton fallbackTo="/dashboard"/>
            </div>
          </div>
          <div className="w-full">
            <p className="mt-4 text-[var(--text-secondary)]">
              This view compares real-time streaming data with batch-processed results.
              Streaming is fast and responsive, while batch is slower but more accurate.
              This demonstrates the trade-off between speed and accuracy in data processing systems.
            </p>

            <p className="mt-2 text-sm text-[var(--text-secondary)]">
              Each metric displays the current value and the difference compared to the other processing model.
              Positive values indicate that streaming is higher, while negative values indicate that batch results are higher.
            </p>

          </div>
        </header>

        {isLoading ? <LoadingSpinner/> : (
          <>
            <section className="monitor-card rounded-[24px] p-6">
              <div className="grid gap-6 lg:grid-cols-2">
                <div className="space-y-3">
                  <SectionHeader
                    title="Streaming (Real-Time Alerts)"
                    subtitle="Immediate event handling and low-latency alerting."
                    accentClass="text-[#ff9900]"
                  />
                  <div className="grid gap-3 sm:grid-cols-2">
                    <MetricCard
                      label="Streaming Latency"
                      value={`${formatFixed(Number(data.streaming_latency_avg) || 0, 2)} ms`}
                      hint="Event to alert in streaming pipeline"
                    />
                    <MetricCard
                      label="Events per Second"
                      value={formatFixed(Number(data.events_per_second) || 0, 4)}
                      hint="Recent ingestion rate"
                    />
                  </div>
                </div>

                <div className="space-y-3">
                  <SectionHeader
                    title="Batch (Delayed Analytics)"
                    subtitle="Periodic processing with delayed but broader analysis."
                    accentClass="text-[var(--link)]"
                  />
                  <div className="grid gap-3 sm:grid-cols-3">
                    <MetricCard
                      label="Batch Latency"
                      value={`${formatFixed(batchLatencyMinutes, 2)} min`}
                      hint="Event to latest batch output"
                    />
                    <MetricCard
                      label="Total Alerts"
                      value={String(data.total_alerts ?? 0)}
                      hint="Alerts in comparison window"
                    />
                    <MetricCard
                      label="Alert Rate"
                      value={`${formatFixed((Number(data.alert_rate) || 0) * 100, 2)}%`}
                      hint="Alerts as share of total events"
                    />
                  </div>
                </div>
              </div>
            </section>

            <section className="monitor-card rounded-[24px] p-6">
              <p className="text-xs font-semibold uppercase tracking-[0.3em] text-[var(--text-muted)]">Time Behavior</p>
              <h2 className="mt-2 text-2xl font-semibold text-[var(--text-primary)]">Streaming Activity vs Batch Snapshots</h2>
              <p className="mt-2 text-sm text-[var(--text-secondary)]">
                Orange updates represent real-time streaming alerts. Blue updates represent periodic batch snapshot totals, so changes
                appear in delayed steps.
              </p>

              <div className="mt-6 grid gap-6 lg:grid-cols-2">
                <div className="h-[260px] rounded-2xl border p-4" style={{borderColor: chartTheme.cardBorder, backgroundColor: chartTheme.cardBg}}>
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={history}>
                      <CartesianGrid stroke={chartTheme.grid} strokeDasharray="3 3" vertical={false}/>
                      <XAxis dataKey="time" stroke={chartTheme.axis} tick={{fontSize: 11}} minTickGap={24}/>
                      <YAxis stroke={chartTheme.axis} tick={{fontSize: 11}} domain={["auto", "auto"]}/>
                      <Tooltip
                        contentStyle={{
                          backgroundColor: chartTheme.tooltipBg,
                          border: `1px solid ${chartTheme.tooltipBorder}`,
                          borderRadius: "12px",
                          color: chartTheme.tooltipText,
                        }}
                      />
                      <Line type="monotone" dataKey="streaming_alerts" name="Streaming Alerts" stroke="#f97316" strokeWidth={3}
                            dot={false}/>
                    </LineChart>
                  </ResponsiveContainer>
                </div>

                <div className="h-[260px] rounded-2xl border p-4" style={{borderColor: chartTheme.cardBorder, backgroundColor: chartTheme.cardBg}}>
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={history}>
                      <CartesianGrid stroke={chartTheme.grid} strokeDasharray="3 3" vertical={false}/>
                      <XAxis dataKey="time" stroke={chartTheme.axis} tick={{fontSize: 11}} minTickGap={24}/>
                      <YAxis stroke={chartTheme.axis} tick={{fontSize: 11}} domain={["auto", "auto"]}/>
                      <Tooltip
                        contentStyle={{
                          backgroundColor: chartTheme.tooltipBg,
                          border: `1px solid ${chartTheme.tooltipBorder}`,
                          borderRadius: "12px",
                          color: chartTheme.tooltipText,
                        }}
                      />
                      <Line type="monotone" dataKey="batch_alerts" name="Batch Alerts (Delayed)" stroke="#60a5fa" strokeWidth={3}
                            dot={false}/>
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </section>

            <section className="monitor-card rounded-[24px] p-6">
              <p className="text-xs font-semibold uppercase tracking-[0.3em] text-[var(--text-muted)]">Understanding the Comparison</p>
              <h2 className="mt-2 text-2xl font-semibold text-[var(--text-primary)]">Streaming vs Batch Processing</h2>

              <div className="mt-4 space-y-4 text-sm text-[var(--text-secondary)] leading-6">
                <p>
                  This page provides a direct comparison between <strong>streaming (real-time)</strong> processing
                  and <strong>batch (periodic)</strong> processing using the same underlying data.
                </p>

                <p>
                  Both systems operate on identical patient data, but process it differently:
                  streaming processes events instantly, while batch processes accumulated data over a time window.
                </p>

                <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-3)] p-4">
                  <p className="font-semibold text-[var(--text-primary)] mb-2">Streaming (Real-Time)</p>
                  <ul className="list-disc pl-5 space-y-1">
                    <li>Processes data immediately as it arrives</li>
                    <li>Very low latency (near-instant updates)</li>
                    <li>Values fluctuate more due to real-time noise</li>
                    <li>Ideal for alerts and monitoring</li>
                  </ul>
                </div>

                <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-3)] p-4">
                  <p className="font-semibold text-[var(--text-primary)] mb-2">Batch Processing</p>
                  <ul className="list-disc pl-5 space-y-1">
                    <li>Processes data periodically (e.g., every few minutes)</li>
                    <li>Higher latency but more stable results</li>
                    <li>Aggregates larger datasets</li>
                    <li>Ideal for analytics and reporting</li>
                  </ul>
                </div>

                <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-3)] p-4">
                  <p className="font-semibold text-[var(--text-primary)] mb-2">Key Insight</p>
                  <p>
                    Streaming prioritizes <strong>speed</strong>, while batch prioritizes <strong>accuracy</strong>.
                    The difference values shown on this page highlight how real-time metrics can deviate
                    from aggregated results.
                  </p>
                </div>
              </div>
            </section>
          </>
        )}
      </div>
    </div>
  )
}
