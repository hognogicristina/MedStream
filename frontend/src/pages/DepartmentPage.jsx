import {useEffect, useState} from "react"
import BackButton from "../components/BackButton.jsx"
import CountValue from "../components/CountValue.jsx"
import {useNotifications} from "../components/useNotifications.js"
import {Link, useParams} from "react-router-dom"
import DataTable from "../components/DataTable.jsx"
import {getAlerts, getBatchStatusStats, getDepartments, getStats, listPatients} from "../services/patientApi.js"
import {getErrorMessage, getResponseData} from "../services/apiMessages.js"
import {formatPatientFullName} from "../utils/patients.js"

const SEVERITY_FILTERS = [
  {value: "all", label: "All patients"},
  {value: "critical", label: "Critical alerts present"},
  {value: "high", label: "High alerts present"},
  {value: "normal", label: "Normal alerts present"},
  {value: "any", label: "Any alerts present"},
  {value: "none", label: "No alerts present"},
]

export default function DepartmentPage() {
  const {notifyError} = useNotifications()
  const {name} = useParams()
  const departmentName = decodeURIComponent(name || "")
  const [patients, setPatients] = useState([])
  const [stats, setStats] = useState([])
  const [alerts, setAlerts] = useState([])
  const [batchStatus, setBatchStatus] = useState(null)
  const [isLoading, setIsLoading] = useState(true)
  const [departments, setDepartments] = useState([])

  useEffect(() => {
    const loadDepartments = async () => {
      try {
        const res = await getDepartments()
        setDepartments(getResponseData(res))
      } catch (error) {
        notifyError(getErrorMessage(error))
      }
    }

    loadDepartments()
  }, [notifyError])

  useEffect(() => {
    const loadDepartmentData = async () => {
      setIsLoading(true)

      try {
        const [patientsRes, statsRes, alertsRes, batchStatusRes] = await Promise.all([
          listPatients({page: 1, limit: 100}),
          getStats(),
          getAlerts(),
          getBatchStatusStats(),
        ])

        const filteredPatients = getResponseData(patientsRes).filter((patient) => patient.department === departmentName)
        const patientIds = new Set(filteredPatients.map((patient) => patient.id))
        const filteredStats = getResponseData(statsRes).filter((stat) => patientIds.has(stat.patient_id))
        const filteredAlerts = getResponseData(alertsRes).filter((alert) => patientIds.has(alert.patient_id))

        setPatients(filteredPatients)
        setStats(filteredStats)
        setAlerts(filteredAlerts)
        setBatchStatus(getResponseData(batchStatusRes))
      } catch (error) {
        notifyError(getErrorMessage(error))
      } finally {
        setIsLoading(false)
      }
    }

    loadDepartmentData()
  }, [departmentName, notifyError])

  const statsMap = Object.fromEntries(stats.map((stat) => [stat.patient_id, stat]))
  const alertSummaryMap = alerts.reduce((accumulator, alert) => {
    const current = accumulator[alert.patient_id] || {
      count: 0,
      severities: new Set(),
    }

    current.count += 1
    current.severities.add(alert.severity)
    accumulator[alert.patient_id] = current
    return accumulator
  }, {})
  const averageHeartRate = stats.length ? stats.reduce((sum, stat) => sum + stat.avg_heart_rate, 0) / stats.length : 0
  const averageTemperature = stats.length ? stats.reduce((sum, stat) => sum + stat.avg_temperature, 0) / stats.length : 0
  const averageOxygen = stats.length ? stats.reduce((sum, stat) => sum + stat.avg_oxygen, 0) / stats.length : 0
  const aggregateAlerts = stats.reduce((sum, stat) => sum + stat.alerts_count, 0)
  const batchStatusLabel = batchStatus?.last_run_status
    ? batchStatus.last_run_status.charAt(0).toUpperCase() + batchStatus.last_run_status.slice(1)
    : "Unknown"
  const lastSuccessfulBatchRun = batchStatus?.last_successful_run_at
  const rows = patients.map((patient) => {
    const stat = statsMap[patient.id]
    const alertSummary = alertSummaryMap[patient.id] || {
      count: 0,
      severities: new Set(),
    }

    return {
      patient,
      stat,
      alertSummary,
    }
  })

  return (
    <div className="app-shell min-h-screen px-4 py-6 text-slate-100 sm:px-6 lg:px-8">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
        <header className="console-topbar rounded-[24px] p-6 sm:p-8">
          <div className="flex flex-col gap-4">
            <div className="flex items-start justify-between gap-4">
              <p className="text-xs font-semibold uppercase tracking-[0.35em] text-[#9dccff]">Department Analytics</p>
              <BackButton/>
            </div>
            <div>
              <h1 className="text-3xl font-semibold tracking-tight text-white sm:text-4xl">{departmentName}</h1>
              <p className="mt-2 max-w-2xl text-sm text-[#b6bec9] sm:text-base">Department patients and analytics.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              {departments.map((department) => (
                <Link
                  key={department}
                  className={`rounded-full px-4 py-2 text-sm font-semibold ${
                    department === departmentName
                      ? "console-button-primary"
                      : "console-button-secondary"
                  }`}
                  to={`/departments/${encodeURIComponent(department)}`}
                >
                  {department}
                </Link>
              ))}
            </div>
          </div>
        </header>
        <section className="monitor-card rounded-[28px] border border-[#9dccff]/25 p-6">
          <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.3em] text-[#9dccff]">Department Summary</p>
              <h2 className="mt-2 text-2xl font-semibold text-white">{departmentName}</h2>
            </div>
            <div className="console-chip rounded-full px-4 py-2 text-sm font-medium">
              <CountValue value={patients.length}/> patients
            </div>
          </div>

          <div className="mb-6 grid gap-3 lg:grid-cols-5">
            <div className="monitor-panel rounded-2xl p-4">
              <p className="text-xs uppercase tracking-[0.22em] text-[#879196]">Current Status</p>
              <p className="mt-2 text-lg font-semibold text-white">{batchStatusLabel}</p>
              <p className="mt-2 text-sm text-[#b6bec9]">Shared analytics status for this department.</p>
            </div>
            <div className="monitor-panel rounded-2xl p-4">
              <p className="text-xs uppercase tracking-[0.22em] text-[#879196]">Last Successful Run</p>
              <p
                className="mt-2 text-lg font-semibold text-white">{lastSuccessfulBatchRun ? new Date(lastSuccessfulBatchRun).toLocaleTimeString() : "--"}</p>
              <p
                className="mt-2 text-sm text-[#b6bec9]">{lastSuccessfulBatchRun ? new Date(lastSuccessfulBatchRun).toLocaleDateString() : "No successful run yet"}</p>
            </div>
            <div className="monitor-panel rounded-2xl p-4">
              <p className="text-xs uppercase tracking-[0.22em] text-[#879196]">Avg HR</p>
              <p className="mt-2 text-lg font-semibold text-white">{stats.length ? averageHeartRate.toFixed(1) : "--"}</p>
              <p className="mt-2 text-sm text-[#b6bec9]">Department average heart rate.</p>
            </div>
            <div className="monitor-panel rounded-2xl p-4">
              <p className="text-xs uppercase tracking-[0.22em] text-[#879196]">Avg Temp</p>
              <p className="mt-2 text-lg font-semibold text-white">{stats.length ? averageTemperature.toFixed(1) : "--"}</p>
              <p className="mt-2 text-sm text-[#b6bec9]">Department average temperature.</p>
            </div>
            <div className="monitor-panel rounded-2xl p-4">
              <p className="text-xs uppercase tracking-[0.22em] text-[#879196]">Avg O2</p>
              <p className="mt-2 text-lg font-semibold text-white">{stats.length ? averageOxygen.toFixed(1) : "--"}</p>
              <p className="mt-2 text-sm text-[#b6bec9]"><CountValue value={aggregateAlerts}/> aggregated alerts in this department.</p>
            </div>
          </div>

          <DataTable
            items={rows}
            loading={isLoading}
            loadingMessage="Loading department analytics..."
            emptyMessage={patients.length === 0 ? `No patients are currently assigned to ${departmentName}.` : "No department patients match the current filters."}
            pageSize={10}
            defaultSort="patient_name"
            controlsLayoutClassName="mb-6 grid gap-4 rounded-[24px] border border-[#3b424b] bg-[#151b22] p-4 lg:grid-cols-[1fr_1fr_1fr_auto]"
            sortOptions={[
              {
                value: "patient_name",
                label: "By patient name",
                compare: (left, right) => formatPatientFullName(left.patient).localeCompare(formatPatientFullName(right.patient)),
              },
              {
                value: "avg_heart_rate",
                label: "By average heart rate",
                compare: (left, right) => (right.stat?.avg_heart_rate ?? -1) - (left.stat?.avg_heart_rate ?? -1),
              },
              {
                value: "alerts_count",
                label: "By alerts count",
                compare: (left, right) => (right.stat?.alerts_count ?? right.alertSummary.count ?? 0) - (left.stat?.alerts_count ?? left.alertSummary.count ?? 0),
              },
            ]}
            filters={[
              {
                id: "severityPresenceFilter",
                label: "Alert Presence",
                type: "select",
                defaultValue: "all",
                options: SEVERITY_FILTERS,
                matches: ({alertSummary}, value) => {
                  if (value === "all") {
                    return true
                  }

                  if (value === "any") {
                    return alertSummary.count > 0
                  }

                  if (value === "none") {
                    return alertSummary.count === 0
                  }

                  return alertSummary.severities.has(value)
                },
              },
              {
                id: "statusFilter",
                label: "Status",
                type: "select",
                defaultValue: "all",
                options: [
                  {value: "all", label: "All patients"},
                  {value: "admitted", label: "Admitted"},
                  {value: "discharged", label: "Discharged"},
                ],
                matches: ({patient}, value) => {
                  if (value === "all") return true
                  if (value === "admitted") return !patient.is_discharged
                  if (value === "discharged") return patient.is_discharged === true
                  return true
                },
              }
            ]}
            getItemKey={(row) => row.patient.id}
            shellClassName="space-y-3"
            bodyClassName="space-y-3"
            renderRow={({patient, stat, alertSummary}) => {
              const strongestSeverity = alertSummary.severities.has("critical")
                ? "critical"
                : alertSummary.severities.has("high")
                  ? "high"
                  : alertSummary.severities.has("normal")
                    ? "normal"
                    : ""

              return (
                <div className="rounded-2xl border border-[#3b424b] bg-[#151b22] p-4">
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div>
                      <Link className="console-link text-base font-semibold transition" to={`/patient/${patient.id}`}>
                        {formatPatientFullName(patient)}
                      </Link>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {strongestSeverity && (
                        <span
                          className={`rounded-full px-3 py-1 text-xs font-semibold ${strongestSeverity === "critical" ? "console-chip-danger" : strongestSeverity === "high" ? "console-chip-warm" : "console-chip-success"}`}>
                          {strongestSeverity} alert presence
                        </span>
                      )}
                    </div>
                  </div>
                  {stat ? (
                    <div className="mt-4">
                      <p className="text-xs uppercase tracking-[0.22em] text-[#879196]">
                        Snapshot from {new Date(stat.computed_at).toLocaleTimeString()}
                      </p>
                      <div className="mt-3 grid grid-cols-3 gap-3 text-sm">
                        <div className="monitor-panel rounded-2xl px-3 py-3">
                          <p className="text-xs uppercase tracking-[0.22em] text-[#879196]">Avg HR</p>
                          <p className="mt-2 font-semibold text-white">{stat.avg_heart_rate.toFixed(1)}</p>
                        </div>
                        <div className="monitor-panel rounded-2xl px-3 py-3">
                          <p className="text-xs uppercase tracking-[0.22em] text-[#879196]">Avg Temp</p>
                          <p className="mt-2 font-semibold text-white">{stat.avg_temperature.toFixed(1)}</p>
                        </div>
                        <div className="monitor-panel rounded-2xl px-3 py-3">
                          <p className="text-xs uppercase tracking-[0.22em] text-[#879196]">Avg O2</p>
                          <p className="mt-2 font-semibold text-white">{stat.avg_oxygen.toFixed(1)}</p>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <p className="mt-4 text-sm text-[#b6bec9]">
                      Stats will appear after the system processes vitals for this patient.
                    </p>
                  )}
                </div>
              )
            }}
          />
        </section>
      </div>
    </div>
  )
}
