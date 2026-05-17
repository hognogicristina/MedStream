import {useEffect, useMemo, useState} from "react"
import {
  Box,
  Button,
  Container,
  ContentLayout,
  Header,
  SegmentedControl,
  SpaceBetween,
} from "@cloudscape-design/components"
import {
  getBatchMetrics,
  getMetricsComparison,
  getMetricsComparisonHistory,
  getStreamingMetrics,
} from "../services/patientApi.js"
import {getErrorMessage, getResponseData} from "../services/apiMessages.js"
import {downloadCSV} from "../utils/downloadCSV.js"
import {useNotifications} from "../hooks/useNotifications.js"
import AwsLineChart from "../components/AwsLineChart.jsx"
import BackButton from "../components/BackButton.jsx"
import LoadingSpinner from "../components/LoadingSpinner.jsx"
import {formatBucharestTime} from "../utils/time.js"

const POLL_INTERVAL_MS = 4000
const MAX_HISTORY_POINTS = 900
const HISTORY_LOOKBACK_SECONDS = 60 * 60
const STORAGE_KEYS = {
  throughputHistory: "medstream.streamingBatch.v2.throughputHistory",
  latencyHistory: "medstream.streamingBatch.v2.latencyHistory",
  chartTimeRange: "medstream.streamingBatch.v2.chartTimeRange",
}
const CHART_TIME_RANGE_OPTIONS = [
  {id: "1m", text: "1m", seconds: 60},
  {id: "3m", text: "3m", seconds: 3 * 60},
  {id: "5m", text: "5m", seconds: 5 * 60},
  {id: "15m", text: "15m", seconds: 15 * 60},
  {id: "1h", text: "1h", seconds: 60 * 60},
]
const THROUGHPUT_CHART_SERIES = [
  {key: "streaming_alerts_per_minute", title: "Streaming Alerts/minute", color: "#f97316", valueFormatter: (value) => `${value.toFixed(0)}`},
  {key: "batch_alerts_per_minute", title: "Batch Alerts/minute", color: "#60a5fa", valueFormatter: (value) => `${value.toFixed(2)}`},
]
const LATENCY_CHART_SERIES = [
  {key: "streaming_latency_ms", title: "Streaming Latency", color: "#f97316", valueFormatter: (value) => formatLatencyDuration(value)},
  {key: "batch_latency_ms", title: "Batch Latency Avg", color: "#60a5fa", valueFormatter: (value) => formatLatencyDuration(value)},
]

function formatFixed(value, digits = 2) {
  const safeValue = Number.isFinite(value) ? value : 0
  return safeValue.toFixed(digits)
}

function roundNumber(value, digits = 2) {
  const safeValue = Number(value)
  return Number.isFinite(safeValue) ? Number(safeValue.toFixed(digits)) : 0
}

function ratioOrBlank(numerator, denominator, digits = 4) {
  const safeNumerator = Number(numerator)
  const safeDenominator = Number(denominator)
  if (!Number.isFinite(safeNumerator) || !Number.isFinite(safeDenominator) || safeDenominator <= 0) {
    return ""
  }
  return roundNumber(safeNumerator / safeDenominator, digits)
}

function formatLatencyDuration(value) {
  const safeValue = Number.isFinite(value) ? value : 0
  if (safeValue >= 60000) {
    return `${formatFixed(safeValue / 60000, 2)} min`
  }
  if (safeValue >= 1000) {
    return `${formatFixed(safeValue / 1000, 2)} sec`
  }
  return `${formatFixed(safeValue, 2)} ms`
}

function toMillis(value) {
  const parsed = new Date(value).getTime()
  return Number.isFinite(parsed) ? parsed : null
}

function getStoredValue(key) {
  try {
    return window.localStorage.getItem(key)
  } catch {
    return null
  }
}

function setStoredValue(key, value) {
  try {
    window.localStorage.setItem(key, value)
  } catch {
    // Chart history is useful but non-critical when browser storage is unavailable.
  }
}

function normalizeHistoryPoint(point) {
  const timestampMs = toMillis(point?.time_iso)
  if (timestampMs == null) {
    return null
  }

  return {
    ...point,
    time_iso: new Date(timestampMs).toISOString(),
    time: formatBucharestTime(timestampMs),
  }
}

function normalizeHistory(points) {
  return (Array.isArray(points) ? points : [])
    .map(normalizeHistoryPoint)
    .filter(Boolean)
    .sort((a, b) => toMillis(a.time_iso) - toMillis(b.time_iso))
    .slice(-MAX_HISTORY_POINTS)
}

function mergeHistoryPoints(currentPoints, nextPoints) {
  const pointsByTimestamp = new Map()

  normalizeHistory(currentPoints).forEach((point) => {
    pointsByTimestamp.set(point.time_iso, point)
  })
  normalizeHistory(nextPoints).forEach((point) => {
    pointsByTimestamp.set(point.time_iso, point)
  })

  return normalizeHistory([...pointsByTimestamp.values()])
}

function loadStoredHistory(storageKey) {
  const storedValue = getStoredValue(storageKey)
  if (!storedValue) {
    return []
  }

  try {
    const parsed = JSON.parse(storedValue)
    return normalizeHistory(parsed)
  } catch {
    return []
  }
}

function loadStoredChartTimeRange() {
  const storedRangeId = getStoredValue(STORAGE_KEYS.chartTimeRange)
  return CHART_TIME_RANGE_OPTIONS.some((range) => range.id === storedRangeId) ? storedRangeId : "1m"
}

function padHistoryToWindow(points, selectedRange, nowMs) {
  if (!Array.isArray(points) || points.length === 0) {
    return []
  }

  const pointsWithTime = points
    .map((point) => ({point, time: toMillis(point?.time_iso)}))
    .filter(({time}) => time != null && Number.isFinite(time))
    .sort((a, b) => a.time - b.time)

  if (pointsWithTime.length === 0) {
    return []
  }

  const rangeStart = nowMs - (selectedRange.seconds * 1000)
  const inRange = pointsWithTime.filter(({time}) => time >= rangeStart && time <= nowMs)

  if (inRange.length === 0) {
    return []
  }

  return inRange.map(({point}) => point)
}

function filterHistoryByRange(points, rangeId) {
  const selectedRange = CHART_TIME_RANGE_OPTIONS.find((range) => range.id === rangeId) || CHART_TIME_RANGE_OPTIONS[0]
  if (!Array.isArray(points) || points.length === 0) {
    return []
  }

  const now = Date.now()
  const padded = padHistoryToWindow(points, selectedRange, now)
  const rangeStart = now - selectedRange.seconds * 1000
  const clamped = padded.filter((point) => {
    const pointTime = toMillis(point?.time_iso)
    return pointTime != null && pointTime >= rangeStart && pointTime <= now
  })

  return clamped
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
  const [comparison, setComparison] = useState(null)
  const [streamingMetricsSnapshot, setStreamingMetricsSnapshot] = useState(null)
  const [batchMetricsSnapshot, setBatchMetricsSnapshot] = useState(null)
  const [throughputHistory, setThroughputHistory] = useState(() => loadStoredHistory(STORAGE_KEYS.throughputHistory))
  const [latencyHistory, setLatencyHistory] = useState(() => loadStoredHistory(STORAGE_KEYS.latencyHistory))
  const [isLoading, setIsLoading] = useState(true)
  const [highlightedThroughputSeries, setHighlightedThroughputSeries] = useState(null)
  const [chartTimeRange, setChartTimeRange] = useState(loadStoredChartTimeRange)

  useEffect(() => {
    setStoredValue(STORAGE_KEYS.throughputHistory, JSON.stringify(throughputHistory.slice(-MAX_HISTORY_POINTS)))
  }, [throughputHistory])

  useEffect(() => {
    setStoredValue(STORAGE_KEYS.latencyHistory, JSON.stringify(latencyHistory.slice(-MAX_HISTORY_POINTS)))
  }, [latencyHistory])

  useEffect(() => {
    setStoredValue(STORAGE_KEYS.chartTimeRange, chartTimeRange)
  }, [chartTimeRange])

  useEffect(() => {
    let active = true
    let isFirstLoad = true

    const loadData = async () => {
      if (isFirstLoad) {
        setIsLoading(true)
      }

      try {
        const [comparisonResponse, streamingResponse, batchResponse, historyResponse] = await Promise.all([
          getMetricsComparison(),
          getStreamingMetrics(),
          getBatchMetrics(),
          getMetricsComparisonHistory({
            seconds: HISTORY_LOOKBACK_SECONDS,
            interval_seconds: Math.round(POLL_INTERVAL_MS / 1000),
          }),
        ])

        if (!active) {
          return
        }

        const nextComparison = getResponseData(comparisonResponse)
        const streamingMetrics = getResponseData(streamingResponse)
        const batchMetrics = getResponseData(batchResponse)
        const comparisonHistory = getResponseData(historyResponse)

        setComparison(nextComparison)
        setStreamingMetricsSnapshot(streamingMetrics || null)
        setBatchMetricsSnapshot(batchMetrics || null)
        setThroughputHistory(mergeHistoryPoints([], comparisonHistory?.throughput))
        setLatencyHistory(mergeHistoryPoints([], comparisonHistory?.latency))
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
    batch_total_events: 0,
    batch_total_alerts: 0,
    batch_events_per_second: 0,
    batch_alert_rate: 0,
  }

  const batchLatencyMinutes = (Number(data.batch_latency_avg) || 0) / 60
  const streamingLatencyMs = Number(streamingMetricsSnapshot?.execution_time_ms) || 0
  const rawStreamingEventToAlertLatencyMs = Number(data.streaming_latency_avg) || 0
  const batchLatencyMs = (Number(data.batch_latency_avg) || 0) * 1000
  const batchExecutionTimeMs = Number(batchMetricsSnapshot?.execution_time_ms) || 0
  const latestThroughputPoint = throughputHistory[throughputHistory.length - 1] || {}
  const latestLatencyPoint = latencyHistory[latencyHistory.length - 1] || {}
  const visibleThroughputHistory = useMemo(
    () => filterHistoryByRange(throughputHistory, chartTimeRange),
    [chartTimeRange, throughputHistory],
  )
  const visibleLatencyHistory = useMemo(
    () => filterHistoryByRange(latencyHistory, chartTimeRange),
    [chartTimeRange, latencyHistory],
  )
  const latestStreamingAlertsPerMinute = Number(latestThroughputPoint.streaming_alerts_per_minute) || 0
  const latestBatchAlertsPerMinute = Number(latestThroughputPoint.batch_alerts_per_minute) || 0
  const eventsPerSecond = Number(data.events_per_second) || 0
  const alertRate = Number(data.alert_rate) || 0
  const batchEventsPerSecond = Number(data.batch_events_per_second) || 0
  const batchAlertRate = Number(data.batch_alert_rate) || 0
  const batchTotalEvents = Number(data.batch_total_events) || 0
  const batchTotalAlerts = Number(data.batch_total_alerts) || 0
  const alertsPerSecondEstimate = eventsPerSecond * alertRate
  const batchSnapshotAgeSeconds = batchMetricsSnapshot?.timestamp
    ? Math.max(0, (Date.now() - new Date(batchMetricsSnapshot.timestamp).getTime()) / 1000)
    : ""
  const throughputChartYDomain = useMemo(() => [
    0,
    Math.max(
      1,
      ...visibleThroughputHistory.flatMap((point) => [
        Number(point.streaming_alerts_per_minute) || 0,
        Number(point.batch_alerts_per_minute) || 0,
      ]),
    ),
  ], [visibleThroughputHistory])
  const latencyChartYDomain = useMemo(() => [
    0,
    Math.max(
      1,
      ...visibleLatencyHistory.flatMap((point) => [
        Number(point.streaming_latency_ms) || 0,
        Number(point.batch_latency_ms) || 0,
      ]),
    ),
  ], [visibleLatencyHistory])

  const handleChartTimeRangeChange = ({detail}) => {
    const selectedRangeId = detail?.selectedId
      || detail?.selectedOption?.value
      || detail?.selectedOption?.id
      || detail?.value
      || chartTimeRange

    setChartTimeRange(selectedRangeId)
  }

  const renderChartTimeRangeControl = () => (
    <div className="medstream-comparison-chart-actions">
      <SegmentedControl
        selectedId={chartTimeRange}
        label="Chart time range"
        options={CHART_TIME_RANGE_OPTIONS.map(({id, text}) => ({id, text}))}
        onChange={handleChartTimeRangeChange}
      />
    </div>
  )

  const exportComparisonMetrics = () => {
    const exportTimestamp = new Date().toISOString()
    const selectedRange = CHART_TIME_RANGE_OPTIONS.find((range) => range.id === chartTimeRange)
    const throughputDifference = latestBatchAlertsPerMinute - latestStreamingAlertsPerMinute
    const latencyDifferenceMs = batchLatencyMs - streamingLatencyMs
    const executionTimeDifferenceMs = batchExecutionTimeMs - streamingLatencyMs
    const rows = [
      ["summary_metric", "value"],
      ["export_timestamp", exportTimestamp],
      ["chart_time_range", selectedRange?.text || chartTimeRange],
      ["latest_history_timestamp", latestThroughputPoint.time_iso || latestLatencyPoint.time_iso || ""],
      ["latest_streaming_alerts_per_minute", latestStreamingAlertsPerMinute],
      ["latest_batch_alerts_per_minute", latestBatchAlertsPerMinute],
      ["throughput_difference_batch_alerts_per_minute_minus_streaming_alerts_per_minute", throughputDifference],
      ["throughput_ratio_batch_to_streaming", ratioOrBlank(latestBatchAlertsPerMinute, latestStreamingAlertsPerMinute)],
      ["streaming_latency_ms", roundNumber(streamingLatencyMs)],
      ["batch_latency_avg_ms", roundNumber(batchLatencyMs)],
      ["batch_latency_avg_seconds", roundNumber(batchLatencyMs / 1000, 4)],
      ["batch_latency_avg_minutes", roundNumber(batchLatencyMinutes, 4)],
      ["latency_difference_batch_minus_streaming_ms", roundNumber(latencyDifferenceMs)],
      ["latency_ratio_batch_to_streaming", ratioOrBlank(batchLatencyMs, streamingLatencyMs)],
      ["raw_streaming_event_to_alert_latency_avg_ms", roundNumber(rawStreamingEventToAlertLatencyMs)],
      ["streaming_execution_time_ms", roundNumber(streamingLatencyMs)],
      ["batch_execution_time_ms", roundNumber(batchExecutionTimeMs)],
      ["execution_time_difference_batch_minus_streaming_ms", roundNumber(executionTimeDifferenceMs)],
      ["execution_time_ratio_batch_to_streaming", ratioOrBlank(batchExecutionTimeMs, streamingLatencyMs)],
      ["total_events_window", Number(data.total_events) || 0],
      ["total_alerts_window", Number(data.total_alerts) || 0],
      ["events_per_second", roundNumber(eventsPerSecond, 4)],
      ["events_per_minute", roundNumber(eventsPerSecond * 60, 4)],
      ["alert_rate", roundNumber(alertRate, 4)],
      ["alert_rate_percent", roundNumber(alertRate * 100, 2)],
      ["estimated_alerts_per_second", roundNumber(alertsPerSecondEstimate, 4)],
      ["estimated_alerts_per_minute", roundNumber(alertsPerSecondEstimate * 60, 4)],
      ["batch_total_events_window", batchTotalEvents],
      ["batch_total_alerts_window", batchTotalAlerts],
      ["batch_events_per_second", roundNumber(batchEventsPerSecond, 4)],
      ["batch_alert_rate", roundNumber(batchAlertRate, 4)],
      ["batch_alert_rate_percent", roundNumber(batchAlertRate * 100, 2)],
      ["streaming_avg_heart_rate", roundNumber(streamingMetricsSnapshot?.avg_heart_rate)],
      ["batch_avg_heart_rate", roundNumber(batchMetricsSnapshot?.avg_heart_rate)],
      ["streaming_avg_oxygen", roundNumber(streamingMetricsSnapshot?.avg_oxygen)],
      ["batch_avg_oxygen", roundNumber(batchMetricsSnapshot?.avg_oxygen)],
      ["streaming_avg_temperature", roundNumber(streamingMetricsSnapshot?.avg_temperature)],
      ["batch_avg_temperature", roundNumber(batchMetricsSnapshot?.avg_temperature)],
      ["batch_patients_count", Number(batchMetricsSnapshot?.patients_count) || 0],
      ["batch_generated_discharge_summaries_count", Number(batchMetricsSnapshot?.generated_discharge_summaries_count) || 0],
      ["batch_pending_discharge_summaries_count", Number(batchMetricsSnapshot?.pending_discharge_summaries_count) || 0],
      ["streaming_snapshot_timestamp", streamingMetricsSnapshot?.timestamp ? new Date(streamingMetricsSnapshot.timestamp).toISOString() : ""],
      ["batch_snapshot_timestamp", batchMetricsSnapshot?.timestamp ? new Date(batchMetricsSnapshot.timestamp).toISOString() : ""],
      ["batch_snapshot_age_seconds", batchSnapshotAgeSeconds === "" ? "" : roundNumber(batchSnapshotAgeSeconds, 1)],
      [],
      [
        "throughput_timestamp",
        "streaming_alerts_per_minute",
        "batch_alerts_per_minute",
        "difference_batch_minus_streaming",
        "ratio_batch_to_streaming",
        "batch_snapshot_timestamp",
      ],
      ...visibleThroughputHistory.map((point) => [
        point.time_iso || "",
        Number(point.streaming_alerts_per_minute) || 0,
        Number(point.batch_alerts_per_minute) || 0,
        (Number(point.batch_alerts_per_minute) || 0) - (Number(point.streaming_alerts_per_minute) || 0),
        ratioOrBlank(point.batch_alerts_per_minute, point.streaming_alerts_per_minute),
        point.batch_timestamp || "",
      ]),
      [],
      [
        "latency_timestamp",
        "streaming_latency_ms",
        "batch_latency_ms",
        "difference_batch_minus_streaming_ms",
        "ratio_batch_to_streaming",
      ],
      ...visibleLatencyHistory.map((point) => [
        point.time_iso || "",
        roundNumber(point.streaming_latency_ms),
        roundNumber(point.batch_latency_ms),
        roundNumber((Number(point.batch_latency_ms) || 0) - (Number(point.streaming_latency_ms) || 0)),
        ratioOrBlank(point.batch_latency_ms, point.streaming_latency_ms),
      ]),
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
                  <div className="medstream-comparison-metrics-grid">
                    <MetricCard
                      label="Streaming Latency"
                      value={formatLatencyDuration(streamingLatencyMs)}
                      hint="Streaming metric update time"
                    />
                    <MetricCard
                      label="Streaming Execution Time"
                      value={formatLatencyDuration(streamingLatencyMs)}
                      hint="Time spent updating streaming metrics"
                    />
                    <MetricCard
                      label="Events per Second"
                      value={formatFixed(Number(data.events_per_second) || 0, 4)}
                      hint="Recent ingestion rate"
                    />
                  </div>
                </Container>
              </div>

              <div className="medstream-stretch-container">
                <Container header={<Header variant="h2" description="Periodic processing with delayed but broader analysis.">Batch</Header>}>
                  <div className="medstream-comparison-metrics-grid">
                    <MetricCard
                      label="Batch Latency"
                      value={`${formatFixed(batchLatencyMinutes, 2)} min`}
                      hint="Event to latest batch output"
                    />
                    <MetricCard
                      label="Batch Execution Time"
                      value={formatLatencyDuration(batchExecutionTimeMs)}
                      hint="Time spent running latest batch job"
                    />
                    <MetricCard
                      label="Alert Rate"
                      value={`${formatFixed(batchAlertRate * 100, 2)}%`}
                      hint="Batch alerts as share of batch events"
                    />
                  </div>
                </Container>
              </div>
            </div>

            <div className="medstream-comparison-snapshots-spacer">
              <SpaceBetween size="m">
                <Container
                  header={
                    <Header
                      variant="h2"
                      description="Streaming and batch values are stored by the backend sampler, using comparable alerts-per-minute rates."
                      actions={renderChartTimeRangeControl()}
                    >
                      Streaming throughput vs batch runs
                    </Header>
                  }
                >
                  <div className="medstream-chart-panel medstream-throughput-chart-panel">
                    <AwsLineChart
                      ariaLabel="Streaming throughput vs batch runs"
                      data={visibleThroughputHistory}
                      highlightedSeriesTitle={highlightedThroughputSeries}
                      hideLegend
                      onHighlightedSeriesTitleChange={setHighlightedThroughputSeries}
                      series={THROUGHPUT_CHART_SERIES}
                      xTitle="Time"
                      yDomain={throughputChartYDomain}
                      yTickFormatter={(value) => String(Math.round(value))}
                    />
                  </div>
                </Container>
                <div
                  className="medstream-throughput-legend awsui_root_1kjc7_qgpiu_167"
                  role="toolbar"
                  aria-label="Legend"
                  onMouseLeave={() => setHighlightedThroughputSeries(null)}
                >
                  <div className="awsui_list_1kjc7_qgpiu_206">
                    {THROUGHPUT_CHART_SERIES.map((item, index) => {
                      const isHighlighted = highlightedThroughputSeries === item.title
                      const isDimmed = highlightedThroughputSeries && !isHighlighted

                      return (
                          <div
                            className={[
                              "awsui_marker_1kjc7_qgpiu_153",
                              "medstream-throughput-legend-item",
                              isHighlighted ? "awsui_marker--highlighted_1kjc7_qgpiu_255" : "",
                              isHighlighted ? "medstream-throughput-legend-item-active" : "",
                              isDimmed ? "awsui_marker--dimmed_1kjc7_qgpiu_252" : "",
                              isDimmed ? "medstream-throughput-legend-item-dimmed" : "",
                            ].filter(Boolean).join(" ")}
                          key={item.key}
                          role="button"
                          aria-pressed={isHighlighted}
                          tabIndex={index === 0 ? 0 : -1}
                          onBlur={() => setHighlightedThroughputSeries(null)}
                          onFocus={() => setHighlightedThroughputSeries(item.title)}
                          onMouseEnter={() => setHighlightedThroughputSeries(item.title)}
                        >
                          <span
                            className="awsui_marker_1isd1_1nqfm_145 awsui_marker--line_1isd1_1nqfm_185"
                            style={{backgroundColor: item.color}}
                            aria-hidden="true"
                          />
                          {" "}
                          {item.title}
                        </div>
                      )
                    })}
                  </div>
                </div>

                <Container
                  header={
                    <Header
                      variant="h2"
                      description="Average time from recorded event to streaming alert or latest batch output."
                      actions={renderChartTimeRangeControl()}
                    >
                      Latency trend
                    </Header>
                  }
                >
                  <div className="medstream-chart-panel">
                    <AwsLineChart
                      ariaLabel="Streaming latency"
                      data={visibleLatencyHistory}
                      series={LATENCY_CHART_SERIES}
                      xTitle="Time"
                      yDomain={latencyChartYDomain}
                      yTickFormatter={(value) => formatLatencyDuration(Number(value) || 0)}
                    />
                  </div>
                </Container>
              </SpaceBetween>
            </div>
          </>
        )}
        </SpaceBetween>
      </div>
    </ContentLayout>
  )
}
