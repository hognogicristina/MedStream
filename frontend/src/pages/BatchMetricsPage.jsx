import {useEffect, useMemo, useRef, useState} from "react"
import {
  Box,
  Button,
  ColumnLayout,
  Container,
  ContentLayout,
  FormField,
  Header,
  Input,
  Multiselect,
  Pagination,
  Select,
  SpaceBetween,
  StatusIndicator,
  Table,
  Tabs,
} from "@cloudscape-design/components"
import {Bar, BarChart, CartesianGrid, Cell, LabelList, Pie, PieChart, ResponsiveContainer, Sector, Tooltip, XAxis, YAxis} from "recharts"
import {
  getBatchInsights,
  getBatchMetrics,
  getBatchSchedule,
  getBatchStatus,
  getMetricsComparison,
  runBatchNow,
  updateBatchSchedule,
} from "../services/patientApi.js"
import {getErrorMessage, getResponseData} from "../services/apiMessages.js"
import {downloadCSV} from "../utils/downloadCSV.js"
import {useNotifications} from "../hooks/useNotifications.js"
import BackButton from "../components/BackButton.jsx"
import LoadingSpinner from "../components/LoadingSpinner.jsx"
import {useTheme} from "../components/ThemeContext.jsx"
import {getChartTheme} from "../utils/theme.js"

const POLL_INTERVAL_MS = 30000
const STATUS_POLL_INTERVAL_MS = 2500
const PAGE_SIZE = 5
const AGGREGATION_WINDOW_MINUTES = 60
const WEEKDAY_OPTIONS = ["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY", "SUNDAY"]
const SCHEDULE_TYPE_OPTIONS = [
  {label: "Every X seconds", value: "seconds"},
  {label: "Every X minutes", value: "minutes"},
  {label: "Every X hours", value: "hours"},
  {label: "Daily at", value: "daily"},
  {label: "Weekly", value: "weekly"},
]

function getSelectedOption(options, value) {
  return options.find((option) => option.value === value) || null
}

const EMPTY_METRICS = {
  avg_heart_rate: 0,
  avg_oxygen: 0,
  avg_temperature: 0,
  alerts: 0,
  patients_count: 0,
  execution_time_ms: 0,
  timestamp: null,
  generated_discharge_summaries_count: 0,
  pending_discharge_summaries_count: 0,
}

const EMPTY_INSIGHTS = {
  patients_per_department: {items: [], total: 0, page: 1, page_size: PAGE_SIZE},
  top_diagnosis: {items: [], total: 0, page: 1, page_size: PAGE_SIZE},
  treatment_effectiveness: {effective: 0, improving: 0, ineffective: 0},
  medication_effectiveness: [],
}

const EMPTY_SCHEDULE = {
  type: "seconds",
  value: 30,
  time: "08:00",
  days: [],
  cron_expression: null,
  interval_seconds: 30,
}

const TREATMENT_CATEGORY_DESCRIPTION = {
  Effective: "Patients whose condition improved or remained clinically stable after treatment.",
  Improving: "Patients with partial recovery where at least one vital improved but unresolved issues remain.",
  Ineffective: "Patients whose condition showed no improvement or worsened after treatment.",
}
const OUTCOME_FILTER_IDS = ["effective", "improving", "ineffective"]

function formatBatchTimestamp(value) {
  if (!value) {
    return "No batch run yet"
  }

  return new Date(value).toLocaleString("en-GB", {timeZone: "Europe/Bucharest"})
}

function formatMetric(value, unit = "", hasData = false) {
  if (!hasData) {
    return "Not available"
  }

  const safeValue = Number.isFinite(value) ? value : 0
  return `${safeValue.toFixed(2)}${unit}`
}

function MetricTile({label, value, compact = false}) {
  return (
    <div className={compact ? "medstream-batch-metric-tile medstream-batch-metric-tile-compact" : "medstream-batch-metric-tile"}>
      <Box color="text-body-secondary" variant="awsui-key-label">{label}</Box>
      <div className="medstream-batch-metric-value">{value}</div>
    </div>
  )
}

function SimpleCasesTooltip({active, payload, chartTheme}) {
  if (!active || !Array.isArray(payload) || !payload.length) {
    return null
  }

  const row = payload[0]?.payload || {}
  const label = String(row.label || row.name || "")
  const value = Number.isFinite(Number(row.count)) ? row.count : (row.rawValue ?? row.value ?? 0)

  return (
    <div
      style={{
        backgroundColor: chartTheme.tooltipBg,
        border: `1px solid ${chartTheme.tooltipBorder}`,
        borderRadius: "12px",
        color: chartTheme.tooltipText,
        padding: "8px 10px",
        fontSize: "12px",
        fontWeight: 600,
      }}
    >
      {label}: {value}
    </div>
  )
}

function formatOutcomePercentage(value, total) {
  if (!total) {
    return "0%"
  }

  return `${((value / total) * 100).toFixed(0)}%`
}

function OverallOutcomeTooltip({active, payload, chartTheme, total}) {
  if (!active || !Array.isArray(payload) || !payload.length) {
    return null
  }

  const row = payload[0]?.payload || {}
  const value = Number(row.rawValue ?? row.value ?? 0)
  const percentage = formatOutcomePercentage(value, total)
  const lastUpdate = row.timestamp ? new Date(row.timestamp).toLocaleDateString("en-US", {month: "short", day: "numeric", year: "numeric"}) : "No batch run"

  return (
    <div
      className="medstream-overall-tooltip"
      style={{
        "--overall-tooltip-color": row.color,
        backgroundColor: chartTheme.tooltipBg,
        border: `1px solid ${chartTheme.tooltipBorder}`,
        color: chartTheme.tooltipText,
      }}
    >
      <div className="medstream-overall-tooltip-title">{row.name}</div>
      <div className="medstream-overall-tooltip-row">
        <span>Treatment count</span>
        <strong>{value}</strong>
      </div>
      <div className="medstream-overall-tooltip-row">
        <span>Percentage</span>
        <strong>{percentage}</strong>
      </div>
      <div className="medstream-overall-tooltip-row">
        <span>Last update on</span>
        <strong>{lastUpdate}</strong>
      </div>
    </div>
  )
}

function renderActivePieShape(props) {
  const {cx, cy, innerRadius, outerRadius, startAngle, endAngle, fill, payload} = props

  return (
    <g>
      <Sector
        cx={cx}
        cy={cy}
        innerRadius={innerRadius}
        outerRadius={outerRadius}
        startAngle={startAngle}
        endAngle={endAngle}
        fill={fill}
        stroke="none"
        strokeWidth={0}
      />
      <Sector
        cx={cx}
        cy={cy}
        innerRadius={outerRadius + 10}
        outerRadius={outerRadius + 14}
        startAngle={startAngle}
        endAngle={endAngle}
        fill={payload.color}
        stroke="none"
        strokeWidth={0}
      />
      {renderOverallPieLabel(props)}
    </g>
  )
}

function renderOverallPieLabel(props) {
  const {cx, cy, midAngle, outerRadius, percent, name, value} = props
  const RADIAN = Math.PI / 180
  const sin = Math.sin(-RADIAN * midAngle)
  const cos = Math.cos(-RADIAN * midAngle)
  const startX = cx + (outerRadius + 8) * cos
  const startY = cy + (outerRadius + 8) * sin
  const middleX = cx + (outerRadius + 34) * cos
  const middleY = cy + (outerRadius + 34) * sin
  const endX = middleX + (cos >= 0 ? 70 : -70)
  const textAnchor = cos >= 0 ? "start" : "end"
  const percentage = `${(percent * 100).toFixed(0)}%`

  return (
    <g className="medstream-overall-pie-label">
      <polyline points={`${startX},${startY} ${middleX},${middleY} ${endX},${middleY}`}/>
      <text x={endX + (cos >= 0 ? 8 : -8)} y={middleY - 8} textAnchor={textAnchor} className="medstream-overall-pie-label-name">
        {name}
      </text>
      <text x={endX + (cos >= 0 ? 8 : -8)} y={middleY + 18} textAnchor={textAnchor} className="medstream-overall-pie-label-value">
        {value} treatments, {percentage}
      </text>
    </g>
  )
}

function resolveLastRunStatus(batchProgress) {
  const normalizedStatus = (batchProgress.last_run_status || "").toLowerCase()
  const normalizedStage = (batchProgress.stage || "").toLowerCase()

  if (normalizedStatus && normalizedStatus !== "idle") {
    return normalizedStatus
  }
  if (normalizedStage.includes("failed")) {
    return "failed"
  }
  if (normalizedStage.includes("completed") || (!batchProgress.is_running && Number(batchProgress.progress) >= 100 && batchProgress.last_run)) {
    return "success"
  }
  if (batchProgress.is_running) {
    return "running"
  }
  return normalizedStatus || "idle"
}

function formatBatchRunState(batchProgress) {
  return batchProgress.is_running ? "Running" : "Idle"
}

function formatLastRunStatus(batchProgress) {
  const normalizedStatus = resolveLastRunStatus(batchProgress)

  if (!normalizedStatus) {
    return "Idle"
  }
  if (normalizedStatus === "success") {
    return "Success"
  }
  return normalizedStatus.charAt(0).toUpperCase() + normalizedStatus.slice(1)
}

function getLastRunStatusType(batchProgress) {
  const normalizedStatus = resolveLastRunStatus(batchProgress)

  if (normalizedStatus === "success") {
    return "success"
  }
  if (normalizedStatus === "failed") {
    return "error"
  }
  if (normalizedStatus === "running") {
    return "in-progress"
  }
  return "stopped"
}

function formatScheduleSummary(schedule) {
  if (!schedule) {
    return "No schedule configured"
  }

  const scheduleType = (schedule.type || "").toLowerCase()

  if (scheduleType === "seconds") {
    return `Runs every ${schedule.value || 1} second(s)`
  }
  if (scheduleType === "minutes") {
    return `Runs every ${schedule.value || 1} minute(s)`
  }
  if (scheduleType === "hours") {
    return `Runs every ${schedule.value || 1} hour(s)`
  }
  if (scheduleType === "daily") {
    return `Runs daily at ${schedule.time || "08:00"}`
  }
  if (scheduleType === "weekly") {
    const days = (schedule.days || []).map((day) => day.slice(0, 3)).join(", ") || "-"
    return `Runs weekly on ${days} at ${schedule.time || "08:00"}`
  }

  return schedule.cron_expression ? `Runs with custom schedule: ${schedule.cron_expression}` : "Custom schedule"
}

export default function BatchMetricsPage() {
  const {notifyError, notifySuccess} = useNotifications()
  const {theme} = useTheme()
  const chartTheme = getChartTheme(theme)
  const [metrics, setMetrics] = useState(null)
  const [insights, setInsights] = useState(null)
  const [comparison, setComparison] = useState(null)
  const [batchProgress, setBatchProgress] = useState({is_running: false, progress: 0, stage: "Idle", last_run: null})
  const [schedule, setSchedule] = useState(EMPTY_SCHEDULE)
  const [scheduleType, setScheduleType] = useState("seconds")
  const [scheduleValue, setScheduleValue] = useState("30")
  const [scheduleTime, setScheduleTime] = useState("08:00")
  const [scheduleDays, setScheduleDays] = useState([])
  const [isApplyingSchedule, setIsApplyingSchedule] = useState(false)
  const [departmentsPage, setDepartmentsPage] = useState(1)
  const [diagnosesPage, setDiagnosesPage] = useState(1)
  const [isRunningBatch, setIsRunningBatch] = useState(false)
  const [showRunStartedBanner, setShowRunStartedBanner] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [treatmentMode, setTreatmentMode] = useState("medication")
  const [selectedMedication, setSelectedMedication] = useState("")
  const [visibleOutcomeIds, setVisibleOutcomeIds] = useState(OUTCOME_FILTER_IDS)
  const [activeOutcomeId, setActiveOutcomeId] = useState("effective")
  const lastBatchTimestampRef = useRef(null)
  const hasLoadedInitialDataRef = useRef(false)

  const hasBatchData = Boolean(metrics?.timestamp)

  const syncScheduleForm = (nextSchedule) => {
    const safeSchedule = nextSchedule || EMPTY_SCHEDULE
    const nextType = (safeSchedule.type || "seconds").toLowerCase()
    setSchedule(safeSchedule)
    setScheduleType(nextType)
    setScheduleValue(String(safeSchedule.value || 1))
    setScheduleTime(safeSchedule.time || "08:00")
    setScheduleDays(safeSchedule.days || [])
  }

  useEffect(() => {
    let active = true

    const loadData = async (nextDepartmentsPage = departmentsPage, nextDiagnosesPage = diagnosesPage) => {
      if (!hasLoadedInitialDataRef.current) {
        setIsLoading(true)
      }
      try {
        const [metricsResponse, insightsResponse, scheduleResponse, comparisonResponse] = await Promise.all([
          getBatchMetrics(),
          getBatchInsights({
            page_size: PAGE_SIZE,
            departments_page: nextDepartmentsPage,
            diagnoses_page: nextDiagnosesPage,
          }),
          getBatchSchedule(),
          getMetricsComparison(),
        ])

        if (!active) {
          return
        }

        const nextMetrics = getResponseData(metricsResponse)
        const nextInsights = getResponseData(insightsResponse)
        const nextSchedule = getResponseData(scheduleResponse)
        const nextComparison = getResponseData(comparisonResponse)
        setComparison(nextComparison || null)

        if (nextMetrics?.timestamp) {
          const currentTimestamp = lastBatchTimestampRef.current
          const incomingTimestamp = nextMetrics.timestamp
          const shouldReplaceMetrics = !currentTimestamp || incomingTimestamp >= currentTimestamp

          if (shouldReplaceMetrics) {
            lastBatchTimestampRef.current = incomingTimestamp
            setMetrics(nextMetrics)
            if (nextInsights) {
              setInsights(nextInsights)
            }
          }
        } else {
          setInsights((current) => current || nextInsights || EMPTY_INSIGHTS)
        }

        syncScheduleForm(nextSchedule)
      } catch (loadError) {
        if (active) {
          notifyError(getErrorMessage(loadError), {duration: 5000})
        }
      } finally {
        if (active) {
          hasLoadedInitialDataRef.current = true
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
  }, [departmentsPage, diagnosesPage, notifyError])

  useEffect(() => {
    let active = true

    const loadBatchProgress = async () => {
      try {
        const response = await getBatchStatus()
        if (!active) {
          return
        }
        setBatchProgress(getResponseData(response))
      } catch (loadError) {
        void loadError
      }
    }

    loadBatchProgress()
    const intervalId = window.setInterval(loadBatchProgress, STATUS_POLL_INTERVAL_MS)

    return () => {
      active = false
      window.clearInterval(intervalId)
    }
  }, [])

  useEffect(() => {
    if (batchProgress.next_run_in_seconds == null) {
      return
    }

    const intervalId = window.setInterval(() => {
      setBatchProgress((current) => {
        if (current.is_running || current.next_run_in_seconds == null) {
          return current
        }

        return {
          ...current,
          next_run_in_seconds: Math.max(0, current.next_run_in_seconds - 1),
        }
      })
    }, 1000)

    return () => window.clearInterval(intervalId)
  }, [batchProgress.is_running, batchProgress.next_run_in_seconds])

  useEffect(() => {
    if (!showRunStartedBanner) {
      return undefined
    }

    const timeoutId = window.setTimeout(() => {
      setShowRunStartedBanner(false)
    }, 7000)

    return () => window.clearTimeout(timeoutId)
  }, [showRunStartedBanner])

  const refreshData = async (nextDepartmentsPage = departmentsPage, nextDiagnosesPage = diagnosesPage) => {
    const [metricsResponse, insightsResponse, batchStatusResponse, scheduleResponse] = await Promise.all([
      getBatchMetrics(),
      getBatchInsights({
        page_size: PAGE_SIZE,
        departments_page: nextDepartmentsPage,
        diagnoses_page: nextDiagnosesPage,
      }),
      getBatchStatus(),
      getBatchSchedule(),
    ])

    const nextMetrics = getResponseData(metricsResponse)
    const nextInsights = getResponseData(insightsResponse)

    if (nextMetrics?.timestamp) {
      lastBatchTimestampRef.current = nextMetrics.timestamp
      setMetrics(nextMetrics)
      setInsights(nextInsights)
    }

    setBatchProgress(getResponseData(batchStatusResponse))
    syncScheduleForm(getResponseData(scheduleResponse))
  }

  const handleApplySchedule = async () => {
    const payload = {type: scheduleType}

    if (scheduleType === "seconds" || scheduleType === "minutes" || scheduleType === "hours") {
      payload.value = Number(scheduleValue)
    } else if (scheduleType === "daily") {
      payload.time = scheduleTime
    } else if (scheduleType === "weekly") {
      payload.time = scheduleTime
      payload.days = scheduleDays
    }

    try {
      setIsApplyingSchedule(true)
      await updateBatchSchedule(payload)
      await refreshData()
      notifySuccess("Batch schedule updated.", {duration: 5000})
    } catch (scheduleError) {
      notifyError(getErrorMessage(scheduleError), {duration: 5000})
    } finally {
      setIsApplyingSchedule(false)
    }
  }

  const handleRunBatchNow = async () => {
    try {
      setIsRunningBatch(true)
      setShowRunStartedBanner(false)
      await runBatchNow()
      setBatchProgress((current) => ({
        ...current,
        is_running: true,
        last_run_status: "running",
        progress: Math.max(Number(current.progress) || 0, 10),
        stage: "Loading data",
      }))
      setShowRunStartedBanner(true)
      await new Promise((resolve) => window.setTimeout(resolve, 800))
      await refreshData()
    } catch (runError) {
      notifyError(getErrorMessage(runError), {duration: 5000})
    } finally {
      setIsRunningBatch(false)
    }
  }

  const toggleWeekday = (day) => {
    setScheduleDays((current) => (
      current.includes(day)
        ? current.filter((item) => item !== day)
        : [...current, day]
    ))
  }

  const data = metrics || EMPTY_METRICS
  const insightsData = insights || EMPTY_INSIGHTS
  const patientsPerDepartment = insightsData.patients_per_department
  const topDiagnosis = insightsData.top_diagnosis
  const treatmentEffectiveness = insightsData.treatment_effectiveness || {effective: 0, improving: 0, ineffective: 0}
  const medicationEffectiveness = useMemo(
    () => insightsData.medication_effectiveness || [],
    [insightsData.medication_effectiveness],
  )
  const progressLabel = formatBatchRunState(batchProgress)
  const departmentsTotalPages = Math.max(1, Math.ceil((patientsPerDepartment.total || 0) / PAGE_SIZE))
  const diagnosesTotalPages = Math.max(1, Math.ceil((topDiagnosis.total || 0) / PAGE_SIZE))
  const totalTreatments = treatmentEffectiveness.effective + treatmentEffectiveness.improving + treatmentEffectiveness.ineffective
  const overallEffectivenessData = useMemo(() => (
    totalTreatments > 0
      ? [
        {
          id: "effective",
          name: "Effective",
          value: treatmentEffectiveness.effective,
          rawValue: treatmentEffectiveness.effective,
          color: "var(--chart-outcome-effective)",
          timestamp: data.timestamp,
          description: TREATMENT_CATEGORY_DESCRIPTION.Effective,
        },
        {
          id: "improving",
          name: "Improving",
          value: treatmentEffectiveness.improving,
          rawValue: treatmentEffectiveness.improving,
          color: "var(--chart-outcome-improving)",
          timestamp: data.timestamp,
          description: TREATMENT_CATEGORY_DESCRIPTION.Improving,
        },
        {
          id: "ineffective",
          name: "Ineffective",
          value: treatmentEffectiveness.ineffective,
          rawValue: treatmentEffectiveness.ineffective,
          color: "var(--chart-outcome-ineffective)",
          timestamp: data.timestamp,
          description: TREATMENT_CATEGORY_DESCRIPTION.Ineffective,
        },
      ]
      : []
  ), [data.timestamp, totalTreatments, treatmentEffectiveness.effective, treatmentEffectiveness.improving, treatmentEffectiveness.ineffective])
  const visibleOutcomeData = useMemo(
    () => overallEffectivenessData.filter((entry) => visibleOutcomeIds.includes(entry.id)),
    [overallEffectivenessData, visibleOutcomeIds],
  )
  const visibleOutcomeChartData = useMemo(
    () => visibleOutcomeData.filter((entry) => entry.rawValue > 0),
    [visibleOutcomeData],
  )
  const outcomeFilterOptions = useMemo(
    () => overallEffectivenessData.map((entry) => ({
      label: entry.name,
      value: entry.id,
      labelContent: (
        <span className="medstream-overall-select-option">
          <span className="medstream-overall-legend-swatch" style={{backgroundColor: entry.color}}/>
          <span>{entry.name}</span>
        </span>
      ),
    })),
    [overallEffectivenessData],
  )
  const selectedOutcomeOptions = outcomeFilterOptions.filter((option) => visibleOutcomeIds.includes(option.value))
  const visibleOutcomeTotal = visibleOutcomeData.reduce((sum, entry) => sum + entry.rawValue, 0)
  const activeOutcomeIndex = visibleOutcomeChartData.findIndex((entry) => entry.id === activeOutcomeId)

  useEffect(() => {
    if (!medicationEffectiveness.length) {
      setSelectedMedication("")
      return
    }

    setSelectedMedication((current) => (
      current && medicationEffectiveness.some((item) => item.name === current)
        ? current
        : medicationEffectiveness[0].name
    ))
  }, [medicationEffectiveness])

  useEffect(() => {
    if (!visibleOutcomeChartData.length) {
      setActiveOutcomeId("")
      return
    }

    setActiveOutcomeId((current) => (
      current && visibleOutcomeChartData.some((entry) => entry.id === current)
        ? current
        : visibleOutcomeChartData[0].id
    ))
  }, [visibleOutcomeChartData])

  const selectedMedicationEffectiveness = medicationEffectiveness.find((item) => item.name === selectedMedication) || null
  const medicationSelectOptions = medicationEffectiveness.map((item) => ({label: item.name, value: item.name}))
  const medicationBarData = [
    {
      label: "Effective",
      count: selectedMedicationEffectiveness ? selectedMedicationEffectiveness.effective : 0,
      fill: "#22c55e",
      description: TREATMENT_CATEGORY_DESCRIPTION.Effective,
    },
    {
      label: "Improving",
      count: selectedMedicationEffectiveness ? selectedMedicationEffectiveness.improving : 0,
      fill: "#f59e0b",
      description: TREATMENT_CATEGORY_DESCRIPTION.Improving,
    },
    {
      label: "Ineffective",
      count: selectedMedicationEffectiveness ? selectedMedicationEffectiveness.ineffective : 0,
      fill: "#ef4444",
      description: TREATMENT_CATEGORY_DESCRIPTION.Ineffective,
    },
  ]

  const scheduleSummary = useMemo(() => formatScheduleSummary(schedule), [schedule])
  const effectivePercentage = totalTreatments ? (treatmentEffectiveness.effective / totalTreatments) * 100 : 0
  const improvingPercentage = totalTreatments ? (treatmentEffectiveness.improving / totalTreatments) * 100 : 0
  const ineffectivePercentage = totalTreatments ? (treatmentEffectiveness.ineffective / totalTreatments) * 100 : 0
  const lastRunStatusLabel = formatLastRunStatus(batchProgress)
  const lastRunStatusType = getLastRunStatusType(batchProgress)
  const batchRunState = progressLabel
  const batchRunTone = batchRunState.toLowerCase()

  const handleExportAllMetrics = () => {
    const exportTimestamp = new Date().toISOString()
    const batchTimestampIso = data.timestamp ? new Date(data.timestamp).toISOString() : ""
    const totalEventsProcessed = Number(comparison?.total_events) || 0
    const totalAlertsDetected = Number(comparison?.total_alerts) || Number(data.alerts) || 0
    const alertsPerMinute = AGGREGATION_WINDOW_MINUTES > 0
      ? totalAlertsDetected / AGGREGATION_WINDOW_MINUTES
      : 0
    const batchLatencyAvgSeconds = Number(comparison?.batch_latency_avg) || 0
    const rows = [
      [
        "timestamp",
        "batch_timestamp",
        "batch_duration_ms",
        "total_events_processed",
        "total_alerts_detected",
        "average_heart_rate",
        "alerts_per_minute",
        "batch_latency_avg_seconds",
        "aggregation_window_minutes",
      ],
      [
        exportTimestamp,
        batchTimestampIso,
        Number((Number(data.execution_time_ms) || 0).toFixed(2)),
        totalEventsProcessed,
        totalAlertsDetected,
        Number((Number(data.avg_heart_rate) || 0).toFixed(2)),
        Number(alertsPerMinute.toFixed(4)),
        Number(batchLatencyAvgSeconds.toFixed(4)),
        AGGREGATION_WINDOW_MINUTES,
      ],
      [],
      ["department", "patients"],
      ...patientsPerDepartment.items.map((entry) => [entry.department, entry.patients]),
      [],
      ["diagnosis", "patients"],
      ...topDiagnosis.items.map((entry) => [entry.name, entry.patients]),
      [],
      ["metric", "value"],
      ["overall_treatments_total", totalTreatments],
      ["overall_treatments_effective_count", treatmentEffectiveness.effective],
      ["overall_treatments_improving_count", treatmentEffectiveness.improving],
      ["overall_treatments_ineffective_count", treatmentEffectiveness.ineffective],
      ["overall_treatments_effective_percentage", Number(effectivePercentage.toFixed(2))],
      ["overall_treatments_improving_percentage", Number(improvingPercentage.toFixed(2))],
      ["overall_treatments_ineffective_percentage", Number(ineffectivePercentage.toFixed(2))],
      [],
      ["medication", "effective", "improving", "ineffective", "total"],
      ...medicationEffectiveness.map((item) => [
        item.name,
        item.effective,
        item.improving,
        item.ineffective,
        item.total,
      ]),
    ]
    downloadCSV("batch_all_metrics.csv", rows)
  }

  const handleExportSelectedMedication = () => {
    if (!selectedMedicationEffectiveness) {
      return
    }

    const medicationTotal = selectedMedicationEffectiveness.total || 0
    const medicationEffectivePercentage = medicationTotal ? (selectedMedicationEffectiveness.effective / medicationTotal) * 100 : 0
    const medicationImprovingPercentage = medicationTotal ? (selectedMedicationEffectiveness.improving / medicationTotal) * 100 : 0
    const medicationIneffectivePercentage = medicationTotal ? (selectedMedicationEffectiveness.ineffective / medicationTotal) * 100 : 0

    const rows = [
      ["MEDICATION_SUMMARY"],
      ["Field", "Value"],
      ["medication_name", selectedMedicationEffectiveness.name],
      ["total_patients", selectedMedicationEffectiveness.total_patients ?? 0],
      ["total_treatments", medicationTotal],
      ["effective_count", selectedMedicationEffectiveness.effective],
      ["improving_count", selectedMedicationEffectiveness.improving],
      ["ineffective_count", selectedMedicationEffectiveness.ineffective],
      ["effective_percentage", medicationEffectivePercentage.toFixed(2)],
      ["improving_percentage", medicationImprovingPercentage.toFixed(2)],
      ["ineffective_percentage", medicationIneffectivePercentage.toFixed(2)],
      [],
      ["DOSAGE_BREAKDOWN"],
      ["dosage", "frequency", "count"],
      ...((selectedMedicationEffectiveness.dosage_breakdown || []).map((entry) => [
        entry.dosage,
        entry.frequency,
        entry.count,
      ])),
      [],
      ["REASONING_SUMMARY"],
      ["metric", "count"],
      ["alert_triggered_count", selectedMedicationEffectiveness.alert_triggered_count ?? 0],
      ["diagnosis_triggered_count", selectedMedicationEffectiveness.diagnosis_triggered_count ?? 0],
      ["condition_triggered_count", selectedMedicationEffectiveness.condition_triggered_count ?? 0],
    ]

    downloadCSV(`${selectedMedicationEffectiveness.name.toLowerCase().replace(/\s+/g, "_")}_summary.csv`, rows)
  }

  if (isLoading) {
    return (
      <ContentLayout>
        <Container>
          <LoadingSpinner/>
        </Container>
      </ContentLayout>
    )
  }

  return (
    <ContentLayout>
      <div className="medstream-batch-metrics-page">
        <SpaceBetween size="m">
        <div className="medstream-page-header">
          <BackButton fallbackTo="/dashboard"/>
          <div className="medstream-page-heading-row">
            <div>
              <h1 className="medstream-page-title">Batch Metrics</h1>
              <p>Scheduled analytics, aggregate patient metrics, and treatment effectiveness.</p>
            </div>
            <Button iconName="download" onClick={handleExportAllMetrics}>Export</Button>
          </div>
          {showRunStartedBanner ? (
            <div className="medstream-batch-run-banner" role="status">
              <span className="medstream-batch-run-banner-icon" aria-hidden="true"/>
              <span className="medstream-batch-run-banner-content">
                <strong>Job run triggered</strong>
                <span>The job run was submitted successfully and execution status is updating.</span>
              </span>
              <button
                type="button"
                className="medstream-batch-run-banner-dismiss"
                onClick={() => setShowRunStartedBanner(false)}
                aria-label="Dismiss run started message"
              >
                x
              </button>
            </div>
          ) : null}
        </div>

        <div className="medstream-dashboard-split">
          <div className="medstream-stretch-container">
            <Container
              header={
                <Header variant="h2" description="Configure how often batch analytics should run.">
                  Scheduling
                </Header>
              }
            >
              <SpaceBetween size="m">
                <ColumnLayout columns={2} variant="text-grid">
                  <SpaceBetween size="xs">
                    <Box color="text-body-secondary" variant="awsui-key-label">Current schedule</Box>
                    <Box variant="h3">{scheduleSummary}</Box>
                  </SpaceBetween>
                  <FormField label="Run frequency">
                  <Select
                    selectedOption={getSelectedOption(SCHEDULE_TYPE_OPTIONS, scheduleType)}
                    onChange={({detail}) => setScheduleType(detail.selectedOption.value)}
                    options={SCHEDULE_TYPE_OPTIONS}
                    selectedAriaLabel="Selected run frequency"
                  />
                  </FormField>
                </ColumnLayout>

                {(scheduleType === "seconds" || scheduleType === "minutes" || scheduleType === "hours") ? (
                  <FormField label={scheduleType === "seconds" ? "Seconds" : scheduleType === "minutes" ? "Minutes" : "Hours"}>
                    <Input
                    type="number"
                    value={scheduleValue}
                    onChange={({detail}) => setScheduleValue(detail.value)}
                  />
                  </FormField>
                ) : null}

                {(scheduleType === "daily" || scheduleType === "weekly") ? (
                  <FormField label="Time">
                    <Input
                    value={scheduleTime}
                    onChange={({detail}) => setScheduleTime(detail.value)}
                    placeholder="08:00"
                  />
                  </FormField>
                ) : null}

                {scheduleType === "weekly" ? (
                  <SpaceBetween size="xs">
                    <Box color="text-body-secondary" variant="awsui-key-label">Days</Box>
                    <SpaceBetween direction="horizontal" size="xs">
                      {WEEKDAY_OPTIONS.map((day) => {
                    const isSelected = scheduleDays.includes(day)
                    return (
                          <Button
                        key={day}
                        onClick={() => toggleWeekday(day)}
                            variant={isSelected ? "primary" : "normal"}
                      >
                        {day.slice(0, 3)}
                          </Button>
                    )
                  })}
                    </SpaceBetween>
                  </SpaceBetween>
                ) : null}

                <SpaceBetween direction="horizontal" size="xs">
                  <Button
                onClick={handleApplySchedule}
                disabled={isApplyingSchedule}
              >
                {isApplyingSchedule ? "Applying..." : "Apply Schedule"}
                  </Button>
                  <Button
                    variant="primary"
                onClick={handleRunBatchNow}
                disabled={isRunningBatch}
              >
                {isRunningBatch ? "Running..." : "Run Batch Now"}
                  </Button>
                </SpaceBetween>
              </SpaceBetween>
            </Container>
          </div>

          <div className="medstream-stretch-container">
            <Container
              header={
                <Header variant="h2" description="Current batch execution stage and progress.">
                  Execution progress
                </Header>
              }
            >
              <SpaceBetween size="m">
                <ColumnLayout columns={4} variant="text-grid">
                  <SpaceBetween size="xs">
                    <Box color="text-body-secondary" variant="awsui-key-label">Status</Box>
                    <StatusIndicator type={lastRunStatusType}>
                      {lastRunStatusLabel}
                    </StatusIndicator>
                  </SpaceBetween>
                  <MetricTile label="Stage" value={batchProgress.stage || "Idle"}/>
                  <MetricTile
                    label="Next Run In"
                    value={
                      batchProgress.is_running
                        ? "Running now"
                        : batchProgress.next_run_in_seconds == null
                          ? "Not scheduled"
                          : `${batchProgress.next_run_in_seconds}s`
                    }
                  />
                  <MetricTile label="Last Run" value={formatBatchTimestamp(batchProgress.last_run)}/>
                </ColumnLayout>

                <div className={`medstream-batch-job-state medstream-batch-job-state-${batchRunTone}`}>
                  <div className="medstream-batch-job-state-indicator" aria-hidden="true">
                    {batchRunState === "Running" ? (
                      <span className="medstream-batch-job-spinner"/>
                    ) : (
                      <span className="medstream-batch-job-status-icon"/>
                    )}
                  </div>
                  <div className="medstream-batch-job-state-copy">
                    <strong>{batchRunState}</strong>
                  </div>
                </div>
              </SpaceBetween>
            </Container>
          </div>
        </div>

        <Container header={<Header variant="h2">Latest Metrics</Header>}>
          <div className="medstream-batch-latest-metrics-grid">
            <MetricTile compact label="Avg Heart Rate" value={formatMetric(data.avg_heart_rate, " bpm", hasBatchData)}/>
            <MetricTile compact label="Avg Oxygen" value={formatMetric(data.avg_oxygen, "%", hasBatchData)}/>
            <MetricTile compact label="Avg Temperature" value={formatMetric(data.avg_temperature, " C", hasBatchData)}/>
            <MetricTile compact label="Alerts Count" value={hasBatchData ? String(data.alerts ?? 0) : "Not available"}/>
            <MetricTile compact label="Execution Time" value={formatMetric(data.execution_time_ms, " ms", hasBatchData)}/>
          </div>
        </Container>

        <Container header={<Header variant="h2">Post-Discharge Clinical Summary</Header>}>
          <ColumnLayout columns={2} variant="text-grid">
            <MetricTile
              label="Generated Summaries"
              value={String(data.generated_discharge_summaries_count ?? 0)}
            />
            <MetricTile
              label="Pending Discharged Patients"
              value={String(data.pending_discharge_summaries_count ?? 0)}
            />
          </ColumnLayout>
        </Container>

        <div className="medstream-dashboard-split">
          <div className="medstream-stretch-container">
            <Container header={<Header variant="h2">Patients per Department</Header>}>
              <div className="medstream-simple-list-table">
                <Table
                  variant="borderless"
                  items={patientsPerDepartment.items || []}
                  trackBy="department"
                  empty={<Box color="text-body-secondary">No department snapshot available yet.</Box>}
                  columnDefinitions={[
                    {
                      id: "department",
                      header: "Department",
                      cell: (entry) => entry.department,
                    },
                    {
                      id: "patients",
                      header: "Patients",
                      cell: (entry) => `${entry.patients} patients`,
                    },
                  ]}
                />
              </div>

              <div className="mt-4 flex justify-end">
              <Pagination
                currentPageIndex={patientsPerDepartment.page || 1}
                pagesCount={departmentsTotalPages}
                onChange={({detail}) => setDepartmentsPage(detail.currentPageIndex)}
              />
              </div>
            </Container>
          </div>

          <div className="medstream-stretch-container">
            <Container header={<Header variant="h2">Top Diagnoses by Patient Count</Header>}>
              <div className="medstream-simple-list-table">
                <Table
                  variant="borderless"
                  items={topDiagnosis.items || []}
                  trackBy="name"
                  empty={<Box color="text-body-secondary">No diagnosis snapshot available yet.</Box>}
                  columnDefinitions={[
                    {
                      id: "diagnosis",
                      header: "Diagnosis",
                      cell: (diagnosis) => diagnosis.name,
                    },
                    {
                      id: "patients",
                      header: "Patients",
                      cell: (diagnosis) => `${diagnosis.patients} patients`,
                    },
                  ]}
                />
              </div>
              <div className="mt-2 flex justify-end">
              <Pagination
                currentPageIndex={topDiagnosis.page || 1}
                pagesCount={diagnosesTotalPages}
                onChange={({detail}) => setDiagnosesPage(detail.currentPageIndex)}
              />
              </div>
            </Container>
          </div>
        </div>

        <Container
          header={
            <Header
              variant="h2"
              actions={treatmentMode === "medication" && selectedMedication ? (
                <Button iconName="download" onClick={handleExportSelectedMedication}>Export medication</Button>
              ) : null}
            >
              Treatment Effectiveness
            </Header>
          }
        >
          <Tabs
            activeTabId={treatmentMode}
            onChange={({detail}) => setTreatmentMode(detail.activeTabId)}
            tabs={[
              {
                id: "medication",
                label: "Medication",
                content: (
                  <SpaceBetween size="m">
                    <Box color="text-body-secondary">
                      The chart shows treatment outcomes for the selected medication across all recorded treatment instances.
                    </Box>
                    <FormField label="Select medication">
                      <Select
                        selectedOption={getSelectedOption(medicationSelectOptions, selectedMedication)}
                        onChange={({detail}) => setSelectedMedication(detail.selectedOption.value)}
                        options={medicationSelectOptions}
                        placeholder={medicationEffectiveness.length ? "Select medication" : "No medication data available"}
                        selectedAriaLabel="Selected medication"
                        disabled={!medicationEffectiveness.length}
                      />
                    </FormField>
                    <div className="medstream-chart-panel">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={medicationBarData} margin={{top: 8, right: 10, left: 0, bottom: 8}}>
                          <CartesianGrid stroke={chartTheme.grid} strokeDasharray="3 3"/>
                          <XAxis dataKey="label" stroke={chartTheme.axis} tick={{fontSize: 11}}/>
                          <YAxis allowDecimals={false} stroke={chartTheme.axis} tick={{fontSize: 11}}/>
                          <Tooltip content={<SimpleCasesTooltip chartTheme={chartTheme}/>}/>
                          <Bar dataKey="count" radius={[8, 8, 0, 0]}>
                            <LabelList dataKey="count" position="top" fill={chartTheme.label} fontSize={12}/>
                            {medicationBarData.map((item) => (
                              <Cell key={item.label} fill={item.fill}/>
                            ))}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </SpaceBetween>
                ),
              },
              {
                id: "overall",
                label: "Overall",
                content: (
                  <SpaceBetween size="m">
                    <Box color="text-body-secondary">
                      This chart summarizes treatment outcomes across all medications and patients in the selected batch window.
                    </Box>
                    <div className="medstream-chart-panel medstream-overall-chart-panel">
                      {totalTreatments > 0 ? (
                        <>
                          <div className="medstream-overall-filter">
                            <FormField label="Filter displayed data">
                              <Multiselect
                                selectedOptions={selectedOutcomeOptions}
                                onChange={({detail}) => {
                                  setVisibleOutcomeIds(detail.selectedOptions.map((option) => option.value).filter(Boolean))
                                }}
                                options={outcomeFilterOptions}
                                placeholder="Filter data"
                                selectedAriaLabel="Selected"
                                deselectAriaLabel={(option) => `Remove ${option.label}`}
                                hideTokens
                                keepOpen
                              />
                            </FormField>
                          </div>

                          {visibleOutcomeChartData.length ? (
                            <div className="medstream-overall-pie" aria-label={`Overall treatment outcomes: ${visibleOutcomeTotal} visible treatments`}>
                              <ResponsiveContainer width="100%" height="100%">
                                <PieChart margin={{top: 58, right: 150, bottom: 56, left: 150}}>
                                  <Pie
                                    activeIndex={activeOutcomeIndex >= 0 ? activeOutcomeIndex : undefined}
                                    activeShape={renderActivePieShape}
                                    data={visibleOutcomeChartData}
                                    dataKey="value"
                                    nameKey="name"
                                    cx="50%"
                                    cy="58%"
                                    innerRadius={0}
                                    outerRadius={126}
                                    startAngle={90}
                                    endAngle={-270}
                                    paddingAngle={0}
                                    label={renderOverallPieLabel}
                                    labelLine={false}
                                    isAnimationActive={false}
                                    stroke="none"
                                    strokeWidth={0}
                                    onMouseEnter={(entry) => setActiveOutcomeId(entry.id)}
                                  >
                                    {visibleOutcomeChartData.map((entry) => (
                                      <Cell key={entry.id} fill={entry.color} stroke="none" strokeWidth={0}/>
                                    ))}
                                  </Pie>
                                  <Tooltip content={<OverallOutcomeTooltip chartTheme={chartTheme} total={visibleOutcomeTotal}/>}/>
                                </PieChart>
                              </ResponsiveContainer>
                            </div>
                          ) : (
                            <div className="medstream-overall-empty">
                              <Box color="text-body-secondary">No treatment data selected.</Box>
                            </div>
                          )}

                          <div className="medstream-overall-legend" aria-label="Overall treatment outcome legend">
                            {visibleOutcomeData.map((entry) => (
                              <div className="medstream-overall-legend-item" key={entry.id}>
                                <span className="medstream-overall-legend-swatch" style={{backgroundColor: entry.color}}/>
                                <span>{entry.name}</span>
                              </div>
                            ))}
                          </div>
                        </>
                      ) : (
                        <div className="medstream-overall-empty">
                          <Box color="text-body-secondary">No treatment data available yet.</Box>
                        </div>
                      )}
                    </div>
                  </SpaceBetween>
                ),
              },
            ]}
          />
        </Container>
        </SpaceBetween>
      </div>
    </ContentLayout>
  )
}
