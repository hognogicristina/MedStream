import {useEffect, useState} from "react"
import {
  Box,
  Button,
  ColumnLayout,
  Container,
  ContentLayout,
  Header,
  SpaceBetween,
} from "@cloudscape-design/components"
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
    <SpaceBetween size="xxs" className="medstream-comparison-metric-card">
      <Box color="text-body-secondary" variant="awsui-key-label">{label}</Box>
      <div className="medstream-comparison-metric-value">{value}</div>
      <Box color="text-body-secondary" variant="small">{hint}</Box>
    </SpaceBetween>
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

  const exportComparisonMetrics = () => {
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
  }

  return (
    <ContentLayout>
      <div className="medstream-comparison-page">
        <SpaceBetween size="m">
        <div className="medstream-page-header">
          <BackButton fallbackTo="/dashboard"/>
          <div className="medstream-page-heading-row">
            <div>
              <h1 className="medstream-page-title">Streaming vs Batch</h1>
              <p>Compare low-latency stream processing with scheduled batch analytics.</p>
            </div>
            <Button iconName="download" onClick={exportComparisonMetrics}>Export</Button>
          </div>
        </div>

        {isLoading ? <LoadingSpinner/> : (
          <>
            <div className="medstream-dashboard-split">
              <div className="medstream-stretch-container">
                <Container header={<Header variant="h2" description="Immediate event handling and low-latency alerting.">Streaming</Header>}>
                  <ColumnLayout columns={2} variant="text-grid">
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
                  </ColumnLayout>
                </Container>
              </div>

              <div className="medstream-stretch-container">
                <Container header={<Header variant="h2" description="Periodic processing with delayed but broader analysis.">Batch</Header>}>
                  <div className="medstream-comparison-batch-metrics-grid">
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
                </Container>
              </div>
            </div>

            <div className="medstream-comparison-snapshots-spacer">
              <Container
                header={
                  <Header
                    variant="h2"
                    description="Streaming alerts update in real time, while batch totals move in delayed snapshots."
                  >
                    Streaming activity vs batch snapshots
                  </Header>
                }
              >
                <div className="medstream-comparison-chart-grid grid gap-6 lg:grid-cols-2">
                  <div className="medstream-chart-panel">
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

                  <div className="medstream-chart-panel">
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
              </Container>
            </div>
          </>
        )}
        </SpaceBetween>
      </div>
    </ContentLayout>
  )
}
