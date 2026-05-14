import {useEffect, useState} from "react"
import {
  Box,
  Button,
  Container,
  ContentLayout,
  Header,
  Pagination,
  SpaceBetween,
  StatusIndicator,
} from "@cloudscape-design/components"
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
import {useTheme} from "../components/ThemeContext.jsx"
import {getChartTheme} from "../utils/theme.js"

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
    <div className="medstream-streaming-summary-tile">
      <Box color="text-body-secondary" variant="awsui-key-label">{label}</Box>
      <div className="medstream-streaming-summary-value">{value}</div>
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

function toMillis(value) {
  const parsed = new Date(value).getTime()
  return Number.isFinite(parsed) ? parsed : null
}

export default function StreamingMetricsPage() {
  const {notifyError} = useNotifications()
  const {theme} = useTheme()
  const chartTheme = getChartTheme(theme)
  const [metrics, setMetrics] = useState(null)
  const [comparison, setComparison] = useState(null)
  const [alertsPage, setAlertsPage] = useState(1)
  const [recentAlerts, setRecentAlerts] = useState({items: [], total: 0, page: 1, page_size: ALERTS_PAGE_SIZE})
  const [heartRateHistory, setHeartRateHistory] = useState([])
  const [alertsRateHistory, setAlertsRateHistory] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [, setSeenAlertIds] = useState({})
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

  const exportStreamingMetrics = () => {
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
  }

  return (
    <ContentLayout>
      <SpaceBetween size="m">
        <div className="medstream-page-header">
          <BackButton fallbackTo="/dashboard"/>
          <div className="medstream-page-heading-row">
            <div>
              <h1 className="medstream-page-title">Streaming Alert Processing</h1>
              <p>Live alert throughput, recent alerts, and low-latency vital trends.</p>
            </div>
            <Button iconName="download" onClick={exportStreamingMetrics}>Export</Button>
          </div>
        </div>

        <Container>
          {isLoading ? (
            <LoadingSpinner/>
          ) : (
            <div className="medstream-streaming-summary-grid">
              <MetricTile label="Alerts per Second" value={formatMetric(latestRatePoint.alerts_per_second)}/>
              <MetricTile label="Alerts per Minute" value={formatMetric(latestRatePoint.alerts_per_minute)}/>
              <MetricTile label="New Alerts (last tick)" value={String(latestRatePoint.new_alerts_tick ?? 0)}/>
              <MetricTile label="Live Alerts (window)" value={String(data.alerts ?? 0)}/>
              <MetricTile label="Avg Heart Rate" value={formatMetric(data.avg_heart_rate, " bpm")}/>
              <MetricTile label="Execution Time" value={formatMetric(data.execution_time_ms, " ms")}/>
            </div>
          )}
        </Container>

        {!isLoading && (
          <>
            <div className="medstream-dashboard-split">
              <div className="medstream-stretch-container">
                <Container
                  header={
                    <Header
                      variant="h2"
                      description="Alerts are appended as soon as threshold checks trigger."
                      actions={<StatusIndicator type={lastAlertTime ? "success" : "pending"}>Last alert: {formatAlertTime(lastAlertTime)}</StatusIndicator>}
                    >
                      Streaming alert feed
                    </Header>
                  }
                >
                  <SpaceBetween size="xs">
                  {recentAlerts.items?.length ? recentAlerts.items.map((alert) => (
                    <Container key={alert.id} fitHeight>
                      <SpaceBetween size="xxs">
                        <Box variant="small">
                          <StatusIndicator type={alert.severity === "critical" ? "error" : alert.severity === "high" ? "warning" : "success"}>
                            {alert.severity}
                          </StatusIndicator>
                        </Box>
                        <Box variant="small">{alert.message}</Box>
                        <Box color="text-body-secondary" variant="small">
                            {alert.alert_type} | Patient #{alert.patient_id} | {formatAlertTime(alert.created_at)}
                        </Box>
                      </SpaceBetween>
                    </Container>
                  )) : (
                    <Box color="text-body-secondary">No alerts in the current feed.</Box>
                  )}
                  </SpaceBetween>

                  <div className="mt-4 flex justify-end">
                  <Pagination
                    currentPageIndex={recentAlerts.page || 1}
                    pagesCount={alertsTotalPages}
                    onChange={({detail}) => setAlertsPage(detail.currentPageIndex)}
                  />
                  </div>
                </Container>
              </div>

              <div className="medstream-stretch-container">
                <Container
                  header={
                    <Header variant="h2" description="Computed from newly observed alerts in a rolling 60-second window.">
                      Alerts per minute
                    </Header>
                  }
                >
                <div className="medstream-chart-panel">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={alertsRateHistory}>
                      <CartesianGrid stroke={chartTheme.grid} strokeDasharray="3 3" vertical={false}/>
                      <XAxis dataKey="time" stroke={chartTheme.axis} tick={{fontSize: 11}} minTickGap={20}/>
                      <YAxis stroke={chartTheme.axis} tick={{fontSize: 11}} domain={[0, "auto"]}/>
                      <Tooltip
                        contentStyle={{
                          backgroundColor: chartTheme.tooltipBg,
                          border: `1px solid ${chartTheme.tooltipBorder}`,
                          borderRadius: "12px",
                          color: chartTheme.tooltipText,
                        }}
                      />
                      <Line type="monotone" dataKey="alerts_per_minute" name="Alerts/Minute" stroke="#f97316" strokeWidth={3} dot={false}/>
                    </LineChart>
                  </ResponsiveContainer>
                </div>
                </Container>
              </div>
            </div>

            <div className="medstream-streaming-vitals-spacer">
              <Container
                header={
                  <Header
                    variant="h2"
                    description="Heart-rate context for alert generation in the streaming pipeline."
                  >
                    Vital signs trend
                  </Header>
                }
              >
                <div className="medstream-chart-panel">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={heartRateHistory}>
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
                      <Line type="monotone" dataKey="heart_rate" stroke="#60a5fa" strokeWidth={2} dot={false}/>
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </Container>
            </div>
          </>
        )}
      </SpaceBetween>
    </ContentLayout>
  )
}
