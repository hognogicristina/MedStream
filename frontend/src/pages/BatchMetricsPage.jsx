import {useEffect, useMemo, useState} from "react"
import {api} from "../services/api"
import {getErrorMessage, getResponseData} from "../services/apiMessages"

const POLL_INTERVAL_MS = 25000
const STATUS_POLL_INTERVAL_MS = 2500
const PAGE_SIZE = 5
const WEEKDAY_OPTIONS = ["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY", "SUNDAY"]
const CRON_DAY_TO_FULL = {
  MON: "MONDAY",
  TUE: "TUESDAY",
  WED: "WEDNESDAY",
  THU: "THURSDAY",
  FRI: "FRIDAY",
  SAT: "SATURDAY",
  SUN: "SUNDAY",
}

function formatBatchTimestamp(value) {
  if (!value) {
    return "No batch run yet"
  }

  return new Date(value).toLocaleString("en-GB", {timeZone: "Europe/Bucharest"})
}

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

function cronDayToLabel(day) {
  return day.charAt(0) + day.slice(1).toLowerCase()
}

function parseScheduleFromStatus(status) {
  if (!status?.cron_expression) {
    const seconds = Number(status?.interval_seconds || 0)
    if (seconds > 0 && seconds < 60) {
      return {
        type: "minutes",
        value: "1",
        time: "08:00",
        days: [],
        cron_expression: "",
        summary: `Runs every ${seconds} second${seconds === 1 ? "" : "s"}`,
      }
    }

    if (seconds >= 3600 && seconds % 3600 === 0) {
      return {
        type: "hours",
        value: String(seconds / 3600),
        time: "08:00",
        days: [],
        cron_expression: "",
        summary: `Runs every ${seconds / 3600} hour${seconds / 3600 === 1 ? "" : "s"}`,
      }
    }

    const minutes = Math.max(1, Math.round(seconds / 60))
    return {
      type: "minutes",
      value: String(minutes),
      time: "08:00",
      days: [],
      cron_expression: "",
      summary: `Runs every ${minutes} minute${minutes === 1 ? "" : "s"}`,
    }
  }

  const cron = status.cron_expression.trim()
  const parts = cron.split(/\s+/)
  if (parts.length === 5) {
    const [minute, hour, dayOfMonth, month, dayOfWeek] = parts
    const time = `${String(Number(hour)).padStart(2, "0")}:${String(Number(minute)).padStart(2, "0")}`

    if (dayOfMonth === "*" && month === "*" && dayOfWeek === "*") {
      return {
        type: "daily",
        value: "15",
        time,
        days: [],
        cron_expression: cron,
        summary: `Runs daily at ${time}`,
      }
    }

    if (dayOfMonth === "*" && month === "*" && dayOfWeek !== "*") {
      const days = dayOfWeek
        .split(",")
        .map((item) => item.trim().toUpperCase())
        .map((item) => CRON_DAY_TO_FULL[item] || item)
      return {
        type: "weekly",
        value: "15",
        time,
        days,
        cron_expression: cron,
        summary: `Runs on ${days.map(cronDayToLabel).join(", ")} at ${time}`,
      }
    }
  }

  return {
    type: "custom",
    value: "15",
    time: "08:00",
    days: [],
    cron_expression: cron,
    summary: `Runs with custom cron: ${cron}`,
  }
}

export default function BatchMetricsPage() {
  const [metrics, setMetrics] = useState(null)
  const [insights, setInsights] = useState(null)
  const [status, setStatus] = useState(null)
  const [batchProgress, setBatchProgress] = useState({is_running: false, progress: 0, stage: "Idle", last_run: null})
  const [progressDisplay, setProgressDisplay] = useState(0)
  const [scheduleType, setScheduleType] = useState("minutes")
  const [scheduleValue, setScheduleValue] = useState("15")
  const [scheduleTime, setScheduleTime] = useState("08:00")
  const [scheduleDays, setScheduleDays] = useState(["MONDAY", "WEDNESDAY"])
  const [customCron, setCustomCron] = useState("")
  const [isApplyingSchedule, setIsApplyingSchedule] = useState(false)
  const [isRunningBatch, setIsRunningBatch] = useState(false)
  const [departmentsPage, setDepartmentsPage] = useState(1)
  const [diagnosesPage, setDiagnosesPage] = useState(1)
  const [error, setError] = useState("")

  const syncScheduleForm = (nextStatus) => {
    const parsed = parseScheduleFromStatus(nextStatus)
    setScheduleType(parsed.type)
    setScheduleValue(parsed.value)
    setScheduleTime(parsed.time)
    setScheduleDays(parsed.days)
    setCustomCron(parsed.cron_expression)
  }

  useEffect(() => {
    let active = true

    const loadData = async (nextDepartmentsPage = departmentsPage, nextDiagnosesPage = diagnosesPage) => {
      try {
        const [metricsResponse, insightsResponse, statusResponse] = await Promise.all([
          api.get("/metrics/batch"),
          api.get("/metrics/batch-insights", {
            params: {
              page_size: PAGE_SIZE,
              departments_page: nextDepartmentsPage,
              diagnoses_page: nextDiagnosesPage,
            },
          }),
          api.get("/stats/batch-status"),
        ])

        if (!active) {
          return
        }

        setMetrics(getResponseData(metricsResponse))
        setInsights(getResponseData(insightsResponse))
        const nextStatus = getResponseData(statusResponse)
        setStatus(nextStatus)
        syncScheduleForm(nextStatus)
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
      } catch {
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
    const [metricsResponse, insightsResponse, statusResponse, batchStatusResponse] = await Promise.all([
      api.get("/metrics/batch"),
      api.get("/metrics/batch-insights", {
        params: {
          page_size: PAGE_SIZE,
          departments_page: nextDepartmentsPage,
          diagnoses_page: nextDiagnosesPage,
        },
      }),
      api.get("/stats/batch-status"),
      api.get("/batch/status"),
    ])

    setMetrics(getResponseData(metricsResponse))
    setInsights(getResponseData(insightsResponse))
    const nextStatus = getResponseData(statusResponse)
    setStatus(nextStatus)
    syncScheduleForm(nextStatus)
    setBatchProgress(getResponseData(batchStatusResponse))
  }

  const handleApplySchedule = async () => {
    const payload = {type: scheduleType}

    if (scheduleType === "minutes" || scheduleType === "hours") {
      payload.value = Number(scheduleValue)
    } else if (scheduleType === "daily") {
      payload.time = scheduleTime
    } else if (scheduleType === "weekly") {
      payload.time = scheduleTime
      payload.days = scheduleDays
    } else if (scheduleType === "custom") {
      payload.cron_expression = customCron.trim()
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

  const scheduleSummary = useMemo(() => parseScheduleFromStatus(status).summary, [status])

  const data = metrics ?? {
    avg_heart_rate: 0,
    avg_oxygen: 0,
    avg_temperature: 0,
    alerts: 0,
    execution_time_ms: 0,
  }
  const patientsPerDepartment = insights?.patients_per_department ?? {items: [], total: 0, page: 1, page_size: PAGE_SIZE}
  const topDiagnosis = insights?.top_diagnosis ?? {items: [], total: 0, page: 1, page_size: PAGE_SIZE}
  const progressLabel = batchProgress.is_running ? "Running" : "Idle"
  const departmentsTotalPages = Math.max(1, Math.ceil((patientsPerDepartment.total || 0) / PAGE_SIZE))
  const diagnosesTotalPages = Math.max(1, Math.ceil((topDiagnosis.total || 0) / PAGE_SIZE))

  return (
    <div className="app-shell min-h-screen px-4 py-6 text-slate-100 sm:px-6 lg:px-8">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6">
        <header className="console-topbar rounded-[24px] p-6 sm:p-8">
          <p className="console-eyebrow text-xs font-semibold uppercase tracking-[0.35em]">Demo View</p>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight text-white sm:text-4xl">Batch Metrics</h1>
          <p className="mt-3 max-w-3xl text-sm text-[#b6bec9] sm:text-base">
            Aggregated over last 5 minutes.
          </p>
          <div className="mt-4 rounded-2xl border border-[#2a3441] bg-[#11161c] px-4 py-4 text-sm leading-6 text-[#d5dbdb]">
            This view shows aggregated data computed over a time window (e.g., last 5 minutes).
            <br/>
            Batch processing analyzes large volumes of historical data, providing more stable and accurate insights.
          </div>
          {error ? <p className="mt-3 text-sm text-[#ffb3bc]">{error}</p> : null}
        </header>

        <section className="grid gap-6 xl:grid-cols-[1.05fr_0.95fr]">
          <div className="monitor-card rounded-[24px] p-6">
            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-[#879196]">Batch Control</p>
            <h2 className="mt-2 text-2xl font-semibold text-white">Scheduling</h2>

            <div className="mt-6 monitor-panel rounded-2xl px-4 py-4">
              <p className="text-xs uppercase tracking-[0.2em] text-[#879196]">Current Schedule</p>
              <p className="mt-2 text-lg font-semibold text-white">{scheduleSummary}</p>
              <p className="mt-1 text-sm text-[#b6bec9]">All timestamps are shown in Europe/Bucharest.</p>
            </div>

            <div className="mt-6 grid gap-3 sm:grid-cols-2">
              <label className="monitor-panel flex flex-col rounded-2xl px-4 py-3">
                <span className="text-xs uppercase tracking-[0.2em] text-[#879196]">Run Frequency</span>
                <select
                  className="mt-3 rounded-xl border border-[#4d5661] bg-[#161b22] px-3 py-2 text-sm font-semibold text-white outline-none"
                  value={scheduleType}
                  onChange={(event) => setScheduleType(event.target.value)}
                >
                  <option value="minutes">Every X minutes</option>
                  <option value="hours">Every X hours</option>
                  <option value="daily">Daily at</option>
                  <option value="weekly">Weekly</option>
                  <option value="custom">Custom (advanced)</option>
                </select>
              </label>

              {(scheduleType === "minutes" || scheduleType === "hours") ? (
                <label className="monitor-panel flex flex-col rounded-2xl px-4 py-3">
                  <span className="text-xs uppercase tracking-[0.2em] text-[#879196]">
                    {scheduleType === "minutes" ? "Minutes" : "Hours"}
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

              {scheduleType === "custom" ? (
                <label className="monitor-panel flex flex-col rounded-2xl px-4 py-3 sm:col-span-2">
                  <span className="text-xs uppercase tracking-[0.2em] text-[#879196]">Cron Schedule</span>
                  <input
                    type="text"
                    value={customCron}
                    onChange={(event) => setCustomCron(event.target.value)}
                    placeholder="*/5 * * * *"
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
            <MetricTile label="Avg Heart Rate" value={formatMetric(data.avg_heart_rate, " bpm")}/>
            <MetricTile label="Avg Oxygen" value={formatMetric(data.avg_oxygen, "%")}/>
            <MetricTile label="Avg Temperature" value={formatMetric(data.avg_temperature, " C")}/>
            <MetricTile label="Alerts Count" value={String(data.alerts ?? 0)}/>
            <MetricTile label="Execution Time" value={formatMetric(data.execution_time_ms, " ms")}/>
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
      </div>
    </div>
  )
}
