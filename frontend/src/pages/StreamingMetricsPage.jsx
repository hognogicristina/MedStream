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
import {getErrorMessage, getResponseData} from "../services/apiMessages.js"
import {downloadCSV} from "../utils/downloadCSV.js"
import {useNotifications} from "../hooks/useNotifications.js"
import AwsLineChart from "../components/AwsLineChart.jsx"
import BackButton from "../components/BackButton.jsx"
import LoadingSpinner from "../components/LoadingSpinner.jsx"

const POLL_INTERVAL_MS = 2500
const MAX_POINTS = 30
const ALERTS_PAGE_SIZE = 2
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
  const [metrics, setMetrics] = useState(null)
  const [comparison, setComparison] = useState(null)
  const [alertsPage, setAlertsPage] = useState(1)
  const [recentAlerts, setRecentAlerts] = useState({items: [], total: 0, page: 1, page_size: ALERTS_PAGE_SIZE})
  const [vitalsHistory, setVitalsHistory] = useState([])
  const [alertsRateHistory, setAlertsRateHistory] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [, setSeenAlertIds] = useState({})
  const [, setLastAlertTime] = useState(null)
  const [highlightedAlertsRateSeries, setHighlightedAlertsRateSeries] = useState(null)

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

        setVitalsHistory((current) => [
          ...current.slice(-(MAX_POINTS - 1)),
          {
            time: tickTime,
            heart_rate: nextMetrics.avg_heart_rate,
            oxygen_saturation: nextMetrics.avg_oxygen,
            temperature: nextMetrics.avg_temperature,
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

        {isLoading ? (
          <LoadingSpinner/>
        ) : (
          <Container>
            <div className="medstream-streaming-summary-grid">
              <MetricTile label="Alerts per Second" value={formatMetric(latestRatePoint.alerts_per_second)}/>
              <MetricTile label="Alerts per Minute" value={formatMetric(latestRatePoint.alerts_per_minute)}/>
              <MetricTile label="New Alerts (last tick)" value={String(latestRatePoint.new_alerts_tick ?? 0)}/>
              <MetricTile label="Live Alerts (window)" value={String(data.alerts ?? 0)}/>
              <MetricTile label="Avg Heart Rate" value={formatMetric(data.avg_heart_rate, " bpm")}/>
              <MetricTile label="Execution Time" value={formatMetric(data.execution_time_ms, " ms")}/>
            </div>
          </Container>
        )}

        {!isLoading && (
          <>
            <div className="medstream-dashboard-split">
              <div className="medstream-stretch-container">
                <Container
                  className="medstream-streaming-card"
                  fitHeight
                  header={
                    <Header
                      variant="h2"
                      description="Alerts are appended as soon as threshold checks trigger."
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
                <div className="medstream-alerts-rate-stack">
                  <Container
                    className="medstream-streaming-card"
                    fitHeight
                    header={
                      <Header variant="h2" description="Computed from newly observed alerts in a rolling 60-second window.">
                        Alerts per minute
                      </Header>
                    }
                  >
                    <div
                      className={[
                        "medstream-chart-panel medstream-alerts-rate-chart-panel",
                        highlightedAlertsRateSeries === "Alerts/Minute" ? "medstream-alerts-rate-chart-panel-active" : "",
                      ].filter(Boolean).join(" ")}
                    >
                      <AwsLineChart
                        ariaLabel="Alerts per minute"
                        data={alertsRateHistory}
                        highlightedSeriesTitle={highlightedAlertsRateSeries}
                        hideLegend
                        onHighlightedSeriesTitleChange={setHighlightedAlertsRateSeries}
                        series={[
                          {key: "alerts_per_minute", title: "Alerts/Minute", color: "#f97316", valueFormatter: (value) => `${value.toFixed(0)} alerts`},
                        ]}
                        xTitle="Time"
                        yDomain={[0, Math.max(1, ...alertsRateHistory.map((point) => Number(point.alerts_per_minute) || 0))]}
                        yTickFormatter={(value) => String(Math.round(value))}
                      />
                    </div>
                    <div
                      className="medstream-alerts-rate-legend"
                      role="toolbar"
                      aria-label="Legend"
                      onMouseLeave={() => setHighlightedAlertsRateSeries(null)}
                    >
                      <button
                        className={[
                          "medstream-alerts-rate-legend-item",
                          highlightedAlertsRateSeries === "Alerts/Minute" ? "medstream-alerts-rate-legend-item-active" : "",
                        ].filter(Boolean).join(" ")}
                        type="button"
                        aria-pressed={highlightedAlertsRateSeries === "Alerts/Minute"}
                        onBlur={() => setHighlightedAlertsRateSeries(null)}
                        onFocus={() => setHighlightedAlertsRateSeries("Alerts/Minute")}
                        onMouseEnter={() => setHighlightedAlertsRateSeries("Alerts/Minute")}
                      >
                        <span className="medstream-alerts-rate-legend-line" aria-hidden="true"/>
                        Alerts/Minute
                      </button>
                    </div>
                  </Container>
                </div>
              </div>
            </div>

            <div className="medstream-streaming-vitals-spacer">
              <Container
                header={
                  <Header
                    variant="h2"
                    description="Heart rate, oxygen saturation, and temperature context for alert generation in the streaming pipeline."
                  >
                    Vital signs trend
                  </Header>
                }
              >
                <div className="medstream-chart-panel">
                  <AwsLineChart
                    ariaLabel="Vital signs trend"
                    data={vitalsHistory}
                    series={[
                      {key: "heart_rate", title: "Heart Rate", color: "#60a5fa", valueFormatter: (value) => `${value.toFixed(0)} bpm`},
                      {key: "oxygen_saturation", title: "Oxygen Saturation", color: "#22c55e", valueFormatter: (value) => `${value.toFixed(0)}%`},
                      {key: "temperature", title: "Temperature", color: "#f97316", valueFormatter: (value) => `${value.toFixed(1)}°C`},
                    ]}
                    xTitle="Time"
                  />
                </div>
              </Container>
            </div>
          </>
        )}
      </SpaceBetween>
    </ContentLayout>
  )
}
