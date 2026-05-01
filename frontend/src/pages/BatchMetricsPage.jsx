import {useEffect, useMemo, useRef, useState} from "react"
import {
  Cell,
  Bar,
  BarChart,
  CartesianGrid,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"
import {api} from "../services/api.js"
import {getErrorMessage, getResponseData} from "../services/apiMessages.js"
import {downloadCSV} from "../utils/downloadCSV.js"

const POLL_INTERVAL_MS = 30000
const STATUS_POLL_INTERVAL_MS = 2500
const PAGE_SIZE = 5
const WEEKDAY_OPTIONS = ["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY", "SUNDAY"]

const EMPTY_METRICS = {
  avg_heart_rate: 0,
  avg_oxygen: 0,
  avg_temperature: 0,
  alerts: 0,
  patients_count: 0,
  execution_time_ms: 0,
  timestamp: null,
}

const EMPTY_INSIGHTS = {
  patients_per_department: {items: [], total: 0, page: 1, page_size: PAGE_SIZE},
  top_diagnosis: {items: [], total: 0, page: 1, page_size: PAGE_SIZE},
  medication_distribution: [],
  treatment_effectiveness: {effective: 0, ineffective: 0},
}

const EMPTY_SCHEDULE = {
  type: "seconds",
  value: 30,
  time: "08:00",
  days: [],
  cron_expression: null,
  interval_seconds: 30,
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
  const [metrics, setMetrics] = useState(null)
  const [insights, setInsights] = useState(null)
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
  const [error, setError] = useState("")
  const [isRunningBatch, setIsRunningBatch] = useState(false)
  const lastBatchTimestampRef = useRef(null)

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
      try {
        const [metricsResponse, insightsResponse, scheduleResponse] = await Promise.all([
          api.get("/metrics/batch"),
          api.get("/metrics/batch-insights", {
            params: {
              page_size: PAGE_SIZE,
              departments_page: nextDepartmentsPage,
              diagnoses_page: nextDiagnosesPage,
            },
          }),
          api.get("/batch/schedule"),
        ])

        if (!active) {
          return
        }

        const nextMetrics = getResponseData(metricsResponse)
        const nextInsights = getResponseData(insightsResponse)
        const nextSchedule = getResponseData(scheduleResponse)

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
        setError("")
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
  }, [departmentsPage, diagnosesPage])

  useEffect(() => {
    let active = true

    const loadBatchProgress = async () => {
      try {
        const response = await api.get("/batch/status")
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
      api.get("/metrics/batch"),
      api.get("/metrics/batch-insights", {
        params: {
          page_size: PAGE_SIZE,
          departments_page: nextDepartmentsPage,
          diagnoses_page: nextDiagnosesPage,
        },
      }),
      api.get("/batch/status"),
      api.get("/batch/schedule"),
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
      await api.post("/batch/schedule", payload)
      await refreshData()
      setError("")
    } catch (scheduleError) {
      setError(getErrorMessage(scheduleError))
    } finally {
      setIsApplyingSchedule(false)
    }
  }

  const handleRunBatchNow = async () => {
    try {
      setIsRunningBatch(true)
      await api.post("/batch/run")
      await new Promise((resolve) => window.setTimeout(resolve, 800))
      await refreshData()
      setError("")
    } catch (runError) {
      setError(getErrorMessage(runError))
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
  const medicationDistribution = useMemo(() => insightsData.medication_distribution || [], [insightsData])
  const treatmentEffectiveness = insightsData.treatment_effectiveness || {effective: 0, ineffective: 0}
  const progressLabel = batchProgress.is_running ? "Running" : "Idle"
  const departmentsTotalPages = Math.max(1, Math.ceil((patientsPerDepartment.total || 0) / PAGE_SIZE))
  const diagnosesTotalPages = Math.max(1, Math.ceil((topDiagnosis.total || 0) / PAGE_SIZE))

  const medicationDistributionTop = useMemo(
    () => [...medicationDistribution]
      .sort((left, right) => right.count - left.count)
      .slice(0, 12),
    [medicationDistribution],
  )
  const effectivenessDonutData = [
    {name: "Effective", value: Number(treatmentEffectiveness.effective) || 0, color: "#22c55e"},
    {name: "Ineffective", value: Number(treatmentEffectiveness.ineffective) || 0, color: "#f97316"},
  ]
  const effectivenessTotal = effectivenessDonutData.reduce((total, item) => total + item.value, 0)

  const scheduleSummary = useMemo(() => formatScheduleSummary(schedule), [schedule])

  return (
    <div className="app-shell min-h-screen px-4 py-6 text-slate-100 sm:px-6 lg:px-8">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6">
        <header className="console-topbar rounded-[24px] p-6 sm:p-8">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0 max-w-full flex-1">
              <p className="console-eyebrow text-xs font-semibold uppercase tracking-[0.35em]">
                Demo View
              </p>

              <h1 className="mt-3 text-3xl font-semibold tracking-tight text-white sm:text-4xl">
                Batch Metrics
              </h1>

              <p className="mt-3 text-[#b6bec9]">
                This view shows aggregated data computed over a time window (e.g., last 5 minutes).
                Batch processing analyzes large volumes of historical data, providing more stable and accurate insights.
              </p>

              {error ? <p className="mt-3 text-sm text-[#ffb3bc]">{error}</p> : null}
            </div>

            <button
              type="button"
              title="Download all metrics"
              aria-label="Download all metrics"
              className="console-button-primary self-start shrink-0 rounded-xl p-3 text-sm font-semibold"
              onClick={() => {
                const rows = [
                  ["Section", "Metric", "Value"],
                  ["Batch Snapshot", "Avg Heart Rate", data.avg_heart_rate],
                  ["Batch Snapshot", "Avg Oxygen", data.avg_oxygen],
                  ["Batch Snapshot", "Avg Temperature", data.avg_temperature],
                  ["Batch Snapshot", "Alerts", data.alerts],
                  ["Batch Snapshot", "Execution Time (ms)", data.execution_time_ms],
                  ["Department Insights", "Department", "Patients"],
                  ...patientsPerDepartment.items.map((entry) => ["Department Insights", entry.department, entry.patients]),
                  ["Diagnosis Insights", "Diagnosis", "Patients"],
                  ...topDiagnosis.items.map((entry) => ["Diagnosis Insights", entry.name, entry.patients]),
                  ["Medication Distribution", "Medication", "Count"],
                  ...medicationDistributionTop.map((entry) => ["Medication Distribution", entry.name, entry.count]),
                  ["Treatment Effectiveness", "Segment", "Count"],
                  ["Treatment Effectiveness", "Effective", treatmentEffectiveness.effective || 0],
                  ["Treatment Effectiveness", "Ineffective", treatmentEffectiveness.ineffective || 0],
                ]
                downloadCSV("batch_all_metrics.csv", rows)
              }}
            >
              <DownloadIcon/>
            </button>
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
                    <p className="text-sm font-semibold text-white">{diagnosis.name}</p>
                    <div className="rounded-full border border-[#4d5661] bg-[#232f3e] px-3 py-1 text-xs font-semibold text-[#d5dbdb]">
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
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-[#879196]">Treatment Insights</p>
          <h2 className="mt-2 text-2xl font-semibold text-white">Medication Distribution & Effectiveness</h2>
          <p className="mt-2 text-sm text-[#b6bec9]">
            Top medications by treatment count and overall outcome trend.
          </p>

          <div className="mt-6 flex flex-col gap-6 xl:flex-row">
            <div className="min-w-0 flex-1">
              <p className="text-xs uppercase tracking-[0.2em] text-[#879196]">Medication Distribution (Top 12)</p>
              <div className="mt-3 h-[360px] rounded-2xl border border-[#2a3441] bg-[#0f141a] p-3">
                {medicationDistributionTop.length ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={medicationDistributionTop} layout="vertical" margin={{top: 8, right: 12, left: 12, bottom: 8}}>
                      <CartesianGrid stroke="#1f2937" strokeDasharray="3 3" horizontal={false}/>
                      <XAxis type="number" stroke="#879196" tick={{fontSize: 11}} allowDecimals={false}/>
                      <YAxis type="category" dataKey="name" width={130} stroke="#879196" tick={{fontSize: 11}}/>
                      <Tooltip
                        contentStyle={{
                          backgroundColor: "#111827",
                          border: "1px solid #334155",
                          borderRadius: "12px",
                          color: "#fff",
                        }}
                      />
                      <Bar dataKey="count" name="Treatments" fill="#22c55e" radius={[0, 8, 8, 0]}/>
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="flex h-full items-center justify-center text-sm text-[#b6bec9]">
                    No medication distribution data available.
                  </div>
                )}
              </div>
            </div>

            <div className="w-full xl:w-[320px]">
              <p className="text-xs uppercase tracking-[0.2em] text-[#879196]">Overall Treatment Effectiveness</p>
              <div className="mt-3 h-[360px] rounded-2xl border border-[#2a3441] bg-[#0f141a] p-3">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={effectivenessDonutData}
                      dataKey="value"
                      nameKey="name"
                      innerRadius={72}
                      outerRadius={105}
                      paddingAngle={2}
                      stroke="none"
                    >
                      {effectivenessDonutData.map((segment) => (
                        <Cell key={segment.name} fill={segment.color}/>
                      ))}
                    </Pie>
                    <Tooltip
                      formatter={(value) => {
                        const safeValue = Number(value) || 0
                        const percentage = effectivenessTotal > 0 ? Math.round((safeValue / effectivenessTotal) * 100) : 0
                        return [`${safeValue} (${percentage}%)`, "Count"]
                      }}
                      contentStyle={{
                        backgroundColor: "#111827",
                        border: "1px solid #334155",
                        borderRadius: "12px",
                        color: "#fff",
                      }}
                    />
                    <text x="50%" y="46%" textAnchor="middle" className="fill-[#b6bec9] text-[11px] uppercase tracking-[0.2em]">
                      Treatment
                    </text>
                    <text x="50%" y="53%" textAnchor="middle" className="fill-[#b6bec9] text-[11px] uppercase tracking-[0.2em]">
                      Effectiveness
                    </text>
                    <text x="50%" y="64%" textAnchor="middle" className="fill-white text-lg font-semibold">
                      {effectivenessTotal > 0 ? `${Math.round((effectivenessDonutData[0].value / effectivenessTotal) * 100)}%` : "0%"}
                    </text>
                  </PieChart>
                </ResponsiveContainer>
                <div className="mt-2 flex items-center justify-center gap-4 text-xs text-[#b6bec9]">
                  <span className="inline-flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full bg-[#22c55e]"/>Effective</span>
                  <span className="inline-flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full bg-[#f97316]"/>Ineffective</span>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="monitor-card rounded-[24px] p-6">
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-[#879196]">What is Batch Processing?</p>
          <h2 className="mt-2 text-2xl font-semibold text-white">What is Batch Processing?</h2>

          <div className="mt-4 space-y-4 text-sm leading-6 text-[#b6bec9]">
            <p>
              Batch processing means the system collects data over a period of time and processes it at configured
              intervals instead of handling every event instantly. It is designed for analytics, aggregation,
              and stable insights rather than immediate reactions.
            </p>

            <p>
              Unlike streaming, which updates in real time, batch runs periodically based on the selected schedule
              (seconds, minutes, hours, daily, or weekly). This makes trends easier to understand and reduces
              short-term noise in measurements.
            </p>

            <div className="rounded-xl border border-[#2a3441] bg-[#11161c] p-4">
              <p className="mb-2 font-semibold text-white">What does Batch do in MedStream?</p>
              <ul className="list-disc space-y-1 pl-5">
                <li>Aggregates vitals collected over time windows</li>
                <li>Computes average heart rate, oxygen, and temperature</li>
                <li>Counts alert volume and active patient coverage</li>
                <li>Generates department and diagnosis insights</li>
                <li>Evaluates medication efficiency over batch windows</li>
              </ul>
            </div>
          </div>
        </section>
      </div>
    </div>
  )
}
