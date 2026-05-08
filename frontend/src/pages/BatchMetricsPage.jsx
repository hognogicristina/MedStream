import {useEffect, useMemo, useRef, useState} from "react"
import {Bar, BarChart, CartesianGrid, Cell, LabelList, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis} from "recharts"
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

const POLL_INTERVAL_MS = 30000
const STATUS_POLL_INTERVAL_MS = 2500
const PAGE_SIZE = 5
const AGGREGATION_WINDOW_MINUTES = 60
const WEEKDAY_OPTIONS = ["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY", "SUNDAY"]

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

function MetricTile({label, value}) {
  return (
    <div className="monitor-panel rounded-2xl px-4 py-3">
      <p className="text-xs uppercase tracking-[0.2em] text-[#879196]">{label}</p>
      <p className="mt-2 text-lg font-semibold text-white">{value}</p>
    </div>
  )
}

function SimpleCasesTooltip({active, payload}) {
  if (!active || !Array.isArray(payload) || !payload.length) {
    return null
  }

  const row = payload[0]?.payload || {}
  const label = String(row.label || row.name || "")
  const value = Number.isFinite(Number(row.count)) ? row.count : (row.rawValue ?? row.value ?? 0)

  return (
    <div
      style={{
        backgroundColor: "#111827",
        border: "1px solid #334155",
        borderRadius: "12px",
        color: "#fff",
        padding: "8px 10px",
        fontSize: "12px",
        fontWeight: 600,
      }}
    >
      {label}: {value}
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

function getStageProgress(progress, stage, isRunning) {
  if (!isRunning && progress >= 100) {
    return 100
  }

  const normalizedStage = (stage || "").toLowerCase()
  if (normalizedStage.includes("loading")) {
    return Math.max(progress, 10)
  }
  if (normalizedStage.includes("aggregating")) {
    return Math.max(progress, 40)
  }
  if (normalizedStage.includes("computing")) {
    return Math.max(progress, 70)
  }
  if (normalizedStage.includes("finalizing") || normalizedStage.includes("completed")) {
    return Math.max(progress, 100)
  }
  return progress
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
  const [metrics, setMetrics] = useState(null)
  const [insights, setInsights] = useState(null)
  const [comparison, setComparison] = useState(null)
  const [batchProgress, setBatchProgress] = useState({is_running: false, progress: 0, stage: "Idle", last_run: null})
  const [progressDisplay, setProgressDisplay] = useState(0)
  const [schedule, setSchedule] = useState(EMPTY_SCHEDULE)
  const [scheduleType, setScheduleType] = useState("seconds")
  const [scheduleValue, setScheduleValue] = useState("30")
  const [scheduleTime, setScheduleTime] = useState("08:00")
  const [scheduleDays, setScheduleDays] = useState([])
  const [isApplyingSchedule, setIsApplyingSchedule] = useState(false)
  const [departmentsPage, setDepartmentsPage] = useState(1)
  const [diagnosesPage, setDiagnosesPage] = useState(1)
  const [isRunningBatch, setIsRunningBatch] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [treatmentMode, setTreatmentMode] = useState("medication")
  const [selectedMedication, setSelectedMedication] = useState("")
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
    const nextProgress = getStageProgress(batchProgress.progress, batchProgress.stage, batchProgress.is_running)

    if (batchProgress.is_running) {
      setProgressDisplay(nextProgress)
      return
    }

    if (nextProgress >= 100) {
      setProgressDisplay(100)
      const timeoutId = window.setTimeout(() => {
        setProgressDisplay(0)
      }, 1200)
      return () => window.clearTimeout(timeoutId)
    }

    setProgressDisplay(0)
  }, [batchProgress])

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
      await runBatchNow()
      await new Promise((resolve) => window.setTimeout(resolve, 800))
      await refreshData()
      notifySuccess("Batch run started successfully.", {duration: 5000})
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
  const progressLabel = batchProgress.is_running ? "Running" : "Idle"
  const departmentsTotalPages = Math.max(1, Math.ceil((patientsPerDepartment.total || 0) / PAGE_SIZE))
  const diagnosesTotalPages = Math.max(1, Math.ceil((topDiagnosis.total || 0) / PAGE_SIZE))
  const totalTreatments = treatmentEffectiveness.effective + treatmentEffectiveness.improving + treatmentEffectiveness.ineffective
  const overallEffectivenessData = totalTreatments > 0
    ? [
      {
        name: "Effective",
        value: treatmentEffectiveness.effective,
        rawValue: treatmentEffectiveness.effective,
        color: "#22c55e",
      },
      {
        name: "Improving",
        value: treatmentEffectiveness.improving,
        rawValue: treatmentEffectiveness.improving,
        color: "#f59e0b",
      },
      {
        name: "Ineffective",
        value: treatmentEffectiveness.ineffective,
        rawValue: treatmentEffectiveness.ineffective,
        color: "#ef4444",
      },
    ]
    : []

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

  const selectedMedicationEffectiveness = medicationEffectiveness.find((item) => item.name === selectedMedication) || null
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
      <div className="app-shell min-h-screen px-4 py-6 text-slate-100 sm:px-6 lg:px-8">
        <div className="mx-auto flex w-full max-w-7xl flex-col gap-6">
          <LoadingSpinner/>
        </div>
      </div>
    )
  }

  return (
    <div className="app-shell min-h-screen px-4 py-6 text-slate-100 sm:px-6 lg:px-8">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6">
        <header className="console-topbar rounded-[24px] p-6 sm:p-8">
          <div className="flex flex-col gap-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="console-eyebrow text-xs font-semibold uppercase tracking-[0.35em]">
                  Demo View
                </p>

                <h1 className="mt-3 text-3xl font-semibold tracking-tight text-white sm:text-4xl">
                  Batch Metrics
                </h1>
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  title="Download all metrics"
                  aria-label="Download all metrics"
                  className="console-button-primary self-start shrink-0 rounded-xl p-3 text-sm font-semibold"
                  onClick={handleExportAllMetrics}
                >
                  <DownloadIcon/>
                </button>
                <BackButton fallbackTo="/dashboard"/>
              </div>
            </div>
            <p className="mt-4 text-[#b6bec9]">
              This view shows aggregated data computed over a time window (e.g., last 5 minutes).
              Batch processing analyzes large volumes of historical data, providing more stable and accurate insights.
            </p>
          </div>
        </header>

        <section className="grid gap-6 xl:grid-cols-[1.05fr_0.95fr]">
          <div className="monitor-card rounded-[24px] p-6">
            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-[#879196]">Batch Control</p>
            <h2 className="mt-2 text-2xl font-semibold text-white">Scheduling</h2>
            <p className="mt-2 text-sm text-[#b6bec9]">
              Configure how often batch analytics should run. All timestamps are shown in Europe/Bucharest.
            </p>

            <div className="mt-6 monitor-panel rounded-2xl px-4 py-4">
              <p className="text-xs uppercase tracking-[0.2em] text-[#879196]">Current Schedule</p>
              <p className="mt-2 text-lg font-semibold text-white">{scheduleSummary}</p>
            </div>

            <div className="mt-6 grid gap-3 sm:grid-cols-2">
              <label className="monitor-panel flex flex-col rounded-2xl px-4 py-3">
                <span className="text-xs uppercase tracking-[0.2em] text-[#879196]">Run Frequency</span>
                <select
                  className="mt-3 rounded-xl border border-[#4d5661] bg-[#161b22] px-3 py-2 text-sm font-semibold text-white outline-none"
                  value={scheduleType}
                  onChange={(event) => setScheduleType(event.target.value)}
                >
                  <option value="seconds">Every X seconds</option>
                  <option value="minutes">Every X minutes</option>
                  <option value="hours">Every X hours</option>
                  <option value="daily">Daily at</option>
                  <option value="weekly">Weekly</option>
                </select>
              </label>

              {(scheduleType === "seconds" || scheduleType === "minutes" || scheduleType === "hours") ? (
                <label className="monitor-panel flex flex-col rounded-2xl px-4 py-3">
                  <span className="text-xs uppercase tracking-[0.2em] text-[#879196]">
                    {scheduleType === "seconds" ? "Seconds" : scheduleType === "minutes" ? "Minutes" : "Hours"}
                  </span>
                  <input
                    type="number"
                    min="1"
                    value={scheduleValue}
                    onChange={(event) => setScheduleValue(event.target.value)}
                    className="mt-3 rounded-xl border border-[#4d5661] bg-[#161b22] px-3 py-2 text-sm font-semibold text-white outline-none"
                  />
                </label>
              ) : null}

              {(scheduleType === "daily" || scheduleType === "weekly") ? (
                <label className="monitor-panel flex flex-col rounded-2xl px-4 py-3">
                  <span className="text-xs uppercase tracking-[0.2em] text-[#879196]">Time</span>
                  <input
                    type="time"
                    value={scheduleTime}
                    onChange={(event) => setScheduleTime(event.target.value)}
                    className="mt-3 rounded-xl border border-[#4d5661] bg-[#161b22] px-3 py-2 text-sm font-semibold text-white outline-none"
                  />
                </label>
              ) : null}
            </div>

            {scheduleType === "weekly" ? (
              <div className="mt-3 monitor-panel rounded-2xl px-4 py-4">
                <p className="text-xs uppercase tracking-[0.2em] text-[#879196]">Days</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {WEEKDAY_OPTIONS.map((day) => {
                    const isSelected = scheduleDays.includes(day)
                    return (
                      <button
                        key={day}
                        type="button"
                        onClick={() => toggleWeekday(day)}
                        className={`rounded-full px-3 py-2 text-xs font-semibold transition ${
                          isSelected
                            ? "border border-[#ff9900] bg-[#2b2217] text-[#ffd08a]"
                            : "border border-[#4d5661] bg-[#161b22] text-[#d5dbdb]"
                        }`}
                      >
                        {day.slice(0, 3)}
                      </button>
                    )
                  })}
                </div>
              </div>
            ) : null}

            <div className="mt-6 flex flex-wrap gap-3">
              <button
                type="button"
                className="console-button-secondary rounded-xl px-4 py-3 text-sm font-semibold"
                onClick={handleApplySchedule}
                disabled={isApplyingSchedule}
              >
                {isApplyingSchedule ? "Applying..." : "Apply Schedule"}
              </button>
              <button
                type="button"
                className="console-button-primary rounded-xl px-4 py-3 text-sm font-semibold"
                onClick={handleRunBatchNow}
                disabled={isRunningBatch}
              >
                {isRunningBatch ? "Running..." : "Run Batch Now"}
              </button>
            </div>
          </div>

          <div className="monitor-card rounded-[24px] p-6">
            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-[#879196]">Batch Job Status</p>
            <h2 className="mt-2 text-2xl font-semibold text-white">Execution Progress</h2>
            <p className="mt-2 text-sm text-[#b6bec9]">
              The batch job executes in stages (loading, aggregating, computing, finalizing),
              each representing a phase of data processing.
            </p>

            <div className="mt-6 grid gap-3 sm:grid-cols-2">
              <div className="monitor-panel rounded-2xl px-4 py-3">
                <p className="text-xs uppercase tracking-[0.2em] text-[#879196]">Status</p>
                <p className="mt-2 text-lg font-semibold text-white">{progressLabel}</p>
              </div>
              <div className="monitor-panel rounded-2xl px-4 py-3">
                <p className="text-xs uppercase tracking-[0.2em] text-[#879196]">Stage</p>
                <p className="mt-2 text-sm font-semibold text-white">{batchProgress.stage || "Idle"}</p>
              </div>
              <div className="monitor-panel rounded-2xl px-4 py-3">
                <p className="text-xs uppercase tracking-[0.2em] text-[#879196]">Next Run In</p>
                <p className="mt-2 text-sm font-semibold text-white">
                  {batchProgress.is_running
                    ? "Running now"
                    : batchProgress.next_run_in_seconds == null
                      ? "Not scheduled"
                      : `${batchProgress.next_run_in_seconds}s`}
                </p>
              </div>
              <div className="monitor-panel rounded-2xl px-4 py-3">
                <p className="text-xs uppercase tracking-[0.2em] text-[#879196]">Last Run</p>
                <p className="mt-2 text-sm font-semibold text-white">
                  {formatBatchTimestamp(batchProgress.last_run)}
                </p>
              </div>
            </div>

            <div className="mt-6 monitor-panel rounded-2xl px-4 py-4">
              <div className="flex items-center justify-between gap-4">
                <p className="text-xs uppercase tracking-[0.2em] text-[#879196]">Progress</p>
                <p className="text-sm font-semibold text-white">{progressDisplay}%</p>
              </div>
              <div className="mt-3 h-3 rounded-full bg-[#0f141a]">
                <div
                  className="h-3 rounded-full bg-[#ff9900] transition-all duration-500 ease-out"
                  style={{width: `${progressDisplay}%`}}
                />
              </div>
            </div>
          </div>
        </section>

        <section className="monitor-card rounded-[24px] p-6">
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-[#879196]">Batch Snapshot</p>
          <h2 className="mt-2 text-2xl font-semibold text-white">Latest Metrics</h2>

          <div className="mt-6 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
            <MetricTile label="Avg Heart Rate" value={formatMetric(data.avg_heart_rate, " bpm", hasBatchData)}/>
            <MetricTile label="Avg Oxygen" value={formatMetric(data.avg_oxygen, "%", hasBatchData)}/>
            <MetricTile label="Avg Temperature" value={formatMetric(data.avg_temperature, " C", hasBatchData)}/>
            <MetricTile label="Alerts Count" value={hasBatchData ? String(data.alerts ?? 0) : "Not available"}/>
            <MetricTile label="Execution Time" value={formatMetric(data.execution_time_ms, " ms", hasBatchData)}/>
          </div>

          <div className="mt-6 rounded-2xl border border-[#2a3441] bg-[#11161c] p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[#879196]">Post-Discharge Clinical Summary</p>
            <div className="mt-3 grid gap-3 md:grid-cols-2">
              <MetricTile
                label="Generated Summaries"
                value={String(data.generated_discharge_summaries_count ?? 0)}
              />
              <MetricTile
                label="Pending Discharged Patients"
                value={String(data.pending_discharge_summaries_count ?? 0)}
              />
            </div>
          </div>
        </section>

        <section className="grid gap-6 lg:grid-cols-2">
          <div className="monitor-card rounded-[24px] p-6">
            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-[#879196]">Batch Insight</p>
            <h2 className="mt-2 text-2xl font-semibold text-white">Patients per Department</h2>

            <div className="mt-6 space-y-3">
              {patientsPerDepartment.items?.length ? patientsPerDepartment.items.map((entry) => (
                <div key={entry.department} className="monitor-panel rounded-2xl px-4 py-3">
                  <div className="flex items-center justify-between gap-4">
                    <p className="text-sm font-semibold text-white">{entry.department}</p>
                    <div className="rounded-full border border-[#4d5661] bg-[#232f3e] px-3 py-1 text-xs font-semibold text-[#d5dbdb]">
                      {entry.patients} patients
                    </div>
                  </div>
                </div>
              )) : (
                <div className="monitor-panel rounded-2xl px-4 py-6 text-sm text-[#b6bec9]">
                  No department snapshot available yet.
                </div>
              )}
            </div>

            <div className="mt-6 flex items-center justify-between gap-3">
              <button
                type="button"
                className="console-button-secondary rounded-xl px-4 py-2 text-sm font-semibold"
                disabled={patientsPerDepartment.page <= 1}
                onClick={() => setDepartmentsPage((current) => Math.max(1, current - 1))}
              >
                Previous
              </button>
              <p className="text-sm text-[#b6bec9]">
                Page {patientsPerDepartment.page || 1} of {departmentsTotalPages}
              </p>
              <button
                type="button"
                className="console-button-secondary rounded-xl px-4 py-2 text-sm font-semibold"
                disabled={(patientsPerDepartment.page || 1) >= departmentsTotalPages}
                onClick={() => setDepartmentsPage((current) => Math.min(departmentsTotalPages, current + 1))}
              >
                Next
              </button>
            </div>
          </div>

          <div className="monitor-card rounded-[24px] p-6">
            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-[#879196]">Batch Insight</p>
            <h2 className="mt-2 text-2xl font-semibold text-white">Top Diagnosis</h2>

            <div className="mt-6 space-y-3">
              {topDiagnosis.items?.length ? topDiagnosis.items.map((diagnosis) => (
                <div key={diagnosis.name} className="monitor-panel rounded-2xl px-4 py-3">
                  <div className="flex items-center justify-between gap-4">
                    <div className="group relative flex flex-1 min-w-0 items-center">
                      <p className="flex-1 min-w-0 truncate text-sm font-semibold text-white">
                        {diagnosis.name}
                      </p>
                      <span
                        className="pointer-events-none absolute left-1/2 top-full z-50 mt-2 -translate-x-1/2 rounded-md border border-[#454c55] bg-[#0f141a] px-2 py-1 text-xs font-medium text-[#d5dbdb] opacity-0 transition-opacity duration-150 group-hover:opacity-100">
                        {diagnosis.name}
                      </span>
                    </div>
                    <div
                      className="shrink-0 w-[110px] text-center rounded-full border border-[#4d5661] bg-[#232f3e] px-3 py-1 text-xs font-semibold text-[#d5dbdb]">
                      {diagnosis.patients} patients
                    </div>
                  </div>
                </div>
              )) : (
                <div className="monitor-panel rounded-2xl px-4 py-6 text-sm text-[#b6bec9]">
                  No diagnosis snapshot available yet.
                </div>
              )}
            </div>

            <div className="mt-6 flex items-center justify-between gap-3">
              <button
                type="button"
                className="console-button-secondary rounded-xl px-4 py-2 text-sm font-semibold"
                disabled={topDiagnosis.page <= 1}
                onClick={() => setDiagnosesPage((current) => Math.max(1, current - 1))}
              >
                Previous
              </button>
              <p className="text-sm text-[#b6bec9]">
                Page {topDiagnosis.page || 1} of {diagnosesTotalPages}
              </p>
              <button
                type="button"
                className="console-button-secondary rounded-xl px-4 py-2 text-sm font-semibold"
                disabled={(topDiagnosis.page || 1) >= diagnosesTotalPages}
                onClick={() => setDiagnosesPage((current) => Math.min(diagnosesTotalPages, current + 1))}
              >
                Next
              </button>
            </div>
          </div>
        </section>

        <section className="monitor-card rounded-[24px] p-6">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.3em] text-[#879196]">Treatment Analysis</p>
              <h2 className="mt-2 text-2xl font-semibold text-white">Treatment Effectiveness</h2>
            </div>
            {treatmentMode === "medication" && selectedMedication ? (
              <button
                type="button"
                title="Export selected medication data"
                aria-label="Export selected medication data"
                className="console-button-primary self-start shrink-0 rounded-xl p-3 text-sm font-semibold"
                onClick={handleExportSelectedMedication}
              >
                <DownloadIcon/>
              </button>
            ) : null}
          </div>

          <div className="mt-5 inline-flex rounded-xl border border-[#2a3441] bg-[#11161c] p-1">
            <button
              type="button"
              onClick={() => setTreatmentMode("medication")}
              className={`rounded-lg px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] transition ${
                treatmentMode === "medication"
                  ? "bg-[#232f3e] text-white"
                  : "text-[#b6bec9] hover:text-white"
              }`}
            >
              Medication
            </button>
            <button
              type="button"
              onClick={() => setTreatmentMode("overall")}
              className={`rounded-lg px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] transition ${
                treatmentMode === "overall"
                  ? "bg-[#232f3e] text-white"
                  : "text-[#b6bec9] hover:text-white"
              }`}
            >
              Overall
            </button>
          </div>

          {treatmentMode === "medication" ? (
            <div className="mt-6 space-y-5">
              <div className="rounded-xl border border-[#2a3441] bg-[#11161c] p-4">
                <p className="text-sm font-semibold text-white">What this chart measures</p>
                <p className="mt-2 text-sm text-[#b6bec9]">
                  The chart shows treatment outcomes for the selected medication across all recorded treatment instances.
                </p>
                <div className="mt-3 grid gap-2">
                  {medicationBarData.map((item) => (
                    <div key={`explain-${item.label}`} className="rounded-lg border border-[#2a3441] bg-[#151b22] px-3 py-2">
                      <p className="text-xs font-semibold uppercase tracking-[0.16em]" style={{color: item.fill}}>
                        {item.label}: {item.count}
                      </p>
                      <p className="mt-1 text-xs text-[#b6bec9]">{item.description}</p>
                    </div>
                  ))}
                </div>
              </div>

              <div className="monitor-panel rounded-2xl p-4">
                <label htmlFor="medication-select" className="text-xs uppercase tracking-[0.2em] text-[#879196]">
                  Select medication
                </label>
                <select
                  id="medication-select"
                  className="mt-3 w-full rounded-xl border border-[#4d5661] bg-[#161b22] px-3 py-2 text-sm font-semibold text-white outline-none"
                  value={selectedMedication}
                  onChange={(event) => setSelectedMedication(event.target.value)}
                  disabled={!medicationEffectiveness.length}
                >
                  {medicationEffectiveness.length
                    ? medicationEffectiveness.map((item) => (
                      <option key={item.name} value={item.name}>{item.name}</option>
                    ))
                    : <option value="">No medication data available</option>}
                </select>
              </div>

              <div className="h-[280px] rounded-2xl border border-[#2a3441] bg-[#0f141a] p-3">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={medicationBarData} margin={{top: 8, right: 10, left: 0, bottom: 8}}>
                    <CartesianGrid stroke="#1f2937" strokeDasharray="3 3"/>
                    <XAxis dataKey="label" stroke="#879196" tick={{fontSize: 11}}/>
                    <YAxis allowDecimals={false} stroke="#879196" tick={{fontSize: 11}}/>
                    <Tooltip content={<SimpleCasesTooltip/>}/>
                    <Bar dataKey="count" radius={[8, 8, 0, 0]}>
                      <LabelList dataKey="count" position="top" fill="#d5dbdb" fontSize={12}/>
                      {medicationBarData.map((item) => (
                        <Cell key={item.label} fill={item.fill}/>
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          ) : (
            <div className="mt-6 rounded-2xl border border-[#2a3441] bg-[#0f141a] p-3">
              <div className="mb-3 rounded-xl border border-[#2a3441] bg-[#11161c] p-4">
                <p className="text-sm font-semibold text-white">What this chart measures</p>
                <p className="mt-2 text-sm text-[#b6bec9]">
                  This chart summarizes treatment outcomes across all medications and patients in the selected batch window.
                </p>
              </div>
              <div className="h-[300px]">
                {totalTreatments > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={overallEffectivenessData}
                        dataKey="value"
                        nameKey="name"
                        outerRadius={112}
                        startAngle={90}
                        endAngle={-270}
                        paddingAngle={4}
                        stroke="#0b1220"
                        strokeWidth={2}
                      >
                        {overallEffectivenessData.map((entry) => (
                          <Cell key={entry.name} fill={entry.color}/>
                        ))}
                      </Pie>
                      <Tooltip
                        content={<SimpleCasesTooltip/>}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="flex h-full items-center justify-center text-sm text-[#b6bec9]">
                    No treatment data available yet.
                  </div>
                )}
              </div>
              <div className="mt-3 flex items-center justify-center gap-5 text-sm text-[#b6bec9]">
                <span className="inline-flex items-center gap-2">
                  <span className="h-2.5 w-2.5 rounded-full bg-[#22c55e]"/>
                  Effective: {treatmentEffectiveness.effective}
                </span>
                <span className="inline-flex items-center gap-2">
                  <span className="h-2.5 w-2.5 rounded-full bg-[#f59e0b]"/>
                  Improving: {treatmentEffectiveness.improving}
                </span>
                <span className="inline-flex items-center gap-2">
                  <span className="h-2.5 w-2.5 rounded-full bg-[#ef4444]"/>
                  Ineffective: {treatmentEffectiveness.ineffective}
                </span>
              </div>
            </div>
          )}
        </section>

        <section className="monitor-card rounded-[24px] p-6">
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-[#879196]">Understanding Batch Processing</p>
          <h2 className="mt-2 text-2xl font-semibold text-white">How Batch Processing Works</h2>

          <div className="mt-4 space-y-4 text-sm text-[#b6bec9] leading-6">
            <p>
              This page represents the batch processing layer of the system. Data is collected over time and processed in intervals rather
              than instantly.
            </p>

            <p>
              Instead of reacting to each event individually, batch processing aggregates data across multiple patients and time windows to
              generate more stable and reliable insights.
            </p>

            <div className="rounded-xl border border-[#2a3441] bg-[#11161c] p-4">
              <p className="font-semibold text-white mb-2">What you are seeing:</p>
              <ul className="list-disc pl-5 space-y-1">
                <li>Aggregated metrics computed over a time window</li>
                <li>Stable averages across multiple patients</li>
                <li>Reduced noise compared to real-time values</li>
                <li>Summary insights derived from historical data</li>
              </ul>
            </div>

            <div className="rounded-xl border border-[#2a3441] bg-[#11161c] p-4">
              <p className="font-semibold text-white mb-2">Why batch processing matters:</p>
              <ul className="list-disc pl-5 space-y-1">
                <li>Provides more accurate and consistent results</li>
                <li>Enables long-term trend analysis</li>
                <li>Helps evaluate treatment effectiveness</li>
                <li>Supports reporting and decision-making</li>
              </ul>
            </div>

            <div className="rounded-xl border border-[#2a3441] bg-[#11161c] p-4">
              <p className="font-semibold text-white mb-2">Technical flow:</p>
              <ul className="list-disc pl-5 space-y-1">
                <li>Data is collected over time (streaming layer)</li>
                <li>Events are accumulated into a dataset</li>
                <li>Batch jobs process the dataset periodically</li>
                <li>Metrics and insights are computed</li>
                <li>Results are exposed via API and visualized</li>
              </ul>
            </div>

            <div className="rounded-xl border border-[#2a3441] bg-[#11161c] p-4">
              <p className="font-semibold text-white mb-2">Trade-offs:</p>
              <ul className="list-disc pl-5 space-y-1">
                <li>Higher latency (results are delayed)</li>
                <li>More stable and reliable outputs</li>
                <li>Better suited for analytics than monitoring</li>
                <li>Requires scheduled execution</li>
              </ul>
            </div>

            <p>
              This layer complements streaming processing: batch provides accuracy and deeper insights, while streaming provides speed and
              real-time visibility.
            </p>
          </div>
        </section>
      </div>
    </div>
  )
}
