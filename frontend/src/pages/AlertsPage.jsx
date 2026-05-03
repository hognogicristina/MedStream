import {useEffect, useState} from "react"
import {Link, useSearchParams} from "react-router-dom"
import BackButton from "../components/BackButton.jsx"
import CountValue from "../components/CountValue.jsx"
import DataTable from "../components/DataTable.jsx"
import {useNotifications} from "../hooks/useNotifications.js"
import {getAlerts, listPatients} from "../services/patientApi.js"
import {getErrorMessage, getResponseData} from "../services/apiMessages.js"
import {createWebSocket} from "../services/ws.js"
import {formatPatientFullName} from "../utils/patients.js"

const SEVERITY_ORDER = {
  critical: 0,
  high: 1,
  normal: 2,
}

export default function AlertsPage() {
  const {notifyError} = useNotifications()
  const [searchParams, setSearchParams] = useSearchParams()
  const [alerts, setAlerts] = useState([])
  const [patients, setPatients] = useState([])
  const [isLoadingAlerts, setIsLoadingAlerts] = useState(true)
  const [flashAlertId, setFlashAlertId] = useState(null)

  useEffect(() => {
    const loadAlerts = async () => {
      try {
        const [alertsResponse, patientsResponse] = await Promise.all([
          getAlerts(),
          listPatients({page: 1, limit: 100}),
        ])
        const nextAlerts = Array.isArray(getResponseData(alertsResponse)) ? getResponseData(alertsResponse) : []
        setAlerts(nextAlerts)
        setPatients(getResponseData(patientsResponse))
      } catch (error) {
        notifyError(getErrorMessage(error))
      } finally {
        setIsLoadingAlerts(false)
      }
    }

    loadAlerts()
  }, [notifyError, searchParams])

  useEffect(() => {
    const socket = createWebSocket((msg) => {
      if (msg.type !== "alert") {
        return
      }

      if (!msg.data?.patient_id) {
        return
      }
      setAlerts((prev) => [msg.data, ...prev.filter((alert) => alert.id !== msg.data.id)])
    })

    return () => socket.close()
  }, [])

  const patientNameById = Object.fromEntries(patients.map((patient) => [patient.id, formatPatientFullName(patient)]))
  const patientCnpById = Object.fromEntries(patients.map((patient) => [patient.id, patient.cnp]))
  const patientByCnp = Object.fromEntries(patients.map((patient) => [patient.cnp, patient]))
  const patientById = Object.fromEntries(patients.map((patient) => [patient.id, patient]))
  const scopedCnp = searchParams.get("cnp") || ""
  const scopedPatientIdRaw = searchParams.get("patientId")
  const scopedAlertIdRaw = searchParams.get("alertId")
  const scopedPatientId = scopedPatientIdRaw && /^\d+$/.test(scopedPatientIdRaw) ? Number(scopedPatientIdRaw) : null
  const scopedAlertId = scopedAlertIdRaw && /^\d+$/.test(scopedAlertIdRaw) ? Number(scopedAlertIdRaw) : null
  const scopedPatient = scopedPatientId ? patientById[scopedPatientId] : (scopedCnp ? patientByCnp[scopedCnp] : null)
  const validPatientIds = new Set(patients.map((patient) => patient.id))
  const validAlerts = alerts.filter(
    (alert) => Number.isInteger(alert.patient_id) && validPatientIds.has(alert.patient_id) && Boolean(patientNameById[alert.patient_id]),
  )
  const visibleAlerts = scopedPatientId
    ? validAlerts.filter((alert) => alert.patient_id === scopedPatientId)
    : scopedCnp
      ? validAlerts.filter((alert) => patientCnpById[alert.patient_id] === scopedCnp)
      : validAlerts
  const severityCounts = {
    critical: visibleAlerts.filter((alert) => alert.severity === "critical").length,
    high: visibleAlerts.filter((alert) => alert.severity === "high").length,
    normal: visibleAlerts.filter((alert) => alert.severity === "normal").length,
  }

  useEffect(() => {
    if (!scopedAlertId) {
      return
    }
    setFlashAlertId(scopedAlertId)
    const timeoutId = window.setTimeout(() => setFlashAlertId(null), 1800)
    return () => window.clearTimeout(timeoutId)
  }, [scopedAlertId])

  useEffect(() => {
    if (!scopedAlertId || isLoadingAlerts) {
      return
    }
    const animationFrameId = window.requestAnimationFrame(() => {
      const row = document.querySelector(`.alert-row-${scopedAlertId}`)
      if (!row) {
        return
      }
      row.scrollIntoView({behavior: "smooth", block: "center"})
    })
    return () => window.cancelAnimationFrame(animationFrameId)
  }, [isLoadingAlerts, scopedAlertId, visibleAlerts])


  return (
    <div className="app-shell min-h-screen px-4 py-6 text-slate-100 sm:px-6 lg:px-8">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6">
        <header className="console-topbar rounded-[24px] p-6 sm:p-8">
          <div className="flex flex-col gap-3">
            <div className="flex items-start justify-between gap-4">
              <p className="text-xs font-semibold uppercase tracking-[0.35em] text-[#ff9900]">Alert Center</p>
              <BackButton/>
            </div>
            <div>
              <h1 className="text-3xl font-semibold tracking-tight text-white sm:text-4xl">Alerts</h1>
              <p className="mt-2 max-w-2xl text-sm text-[#b6bec9] sm:text-base">Live alert queue with filters, sort order, and paging.</p>
              {(scopedCnp || scopedPatientId) && (
                <div className="mt-3 flex flex-wrap items-center gap-3">
                  <span className="console-chip rounded-full px-3 py-1 text-xs font-semibold">
                    Patient: {scopedPatient ? (
                    <Link to={`/patient/${scopedPatient.id}`}
                          className="hover:underline text-inherit">{formatPatientFullName(scopedPatient)}</Link>
                  ) : "Unknown patient"}
                  </span>
                  <Link className="console-link text-sm font-semibold" to="/alerts">
                    Clear filter
                  </Link>
                </div>
              )}
            </div>
          </div>
        </header>
        <section className="monitor-card rounded-[28px] p-6">
          <div className="mb-6 grid gap-3 lg:grid-cols-4">
            <div className="monitor-panel rounded-2xl p-4">
              <p className="text-xs uppercase tracking-[0.22em] text-[#879196]">Total Alerts</p>
              <p className="mt-2 text-2xl font-semibold text-white"><CountValue value={visibleAlerts.length}/></p>
              <p className="mt-2 text-sm text-[#b6bec9]">Full live dataset currently in memory.</p>
            </div>
            <div className="monitor-panel rounded-2xl p-4">
              <p className="text-xs uppercase tracking-[0.22em] text-[#879196]">Critical</p>
              <p className="mt-2 text-2xl font-semibold text-[#ffb3bc]"><CountValue value={severityCounts.critical}/></p>
              <p className="mt-2 text-sm text-[#b6bec9]">Highest priority alerts.</p>
            </div>
            <div className="monitor-panel rounded-2xl p-4">
              <p className="text-xs uppercase tracking-[0.22em] text-[#879196]">High</p>
              <p className="mt-2 text-2xl font-semibold text-[#ffcf85]"><CountValue value={severityCounts.high}/></p>
              <p className="mt-2 text-sm text-[#b6bec9]">Prompt review needed.</p>
            </div>
            <div className="monitor-panel rounded-2xl p-4">
              <p className="text-xs uppercase tracking-[0.22em] text-[#879196]">Normal</p>
              <p className="mt-2 text-2xl font-semibold text-[#9dccff]"><CountValue value={severityCounts.normal}/></p>
              <p className="mt-2 text-sm text-[#b6bec9]">Lower-severity signals.</p>
            </div>
          </div>

          <DataTable
            key={`alerts-${scopedPatientId || scopedCnp || "all"}`}
            items={visibleAlerts}
            loading={isLoadingAlerts}
            loadingMessage="Loading alert queue..."
            emptyMessage="No alerts match the current filters."
            pageSize={10}
            defaultSort="newest"
            controlsLayoutClassName="mb-6 grid gap-4 rounded-[24px] border border-[#3b424b] bg-[#151b22] p-4 lg:grid-cols-[1fr_1fr_1fr_auto]"
            sortOptions={[
              {
                value: "newest",
                label: "Newest first",
                compare: (left, right) => {
                  if (scopedAlertId) {
                    if (left.id === scopedAlertId && right.id !== scopedAlertId) {
                      return -1
                    }
                    if (right.id === scopedAlertId && left.id !== scopedAlertId) {
                      return 1
                    }
                  }
                  const leftSeverity = SEVERITY_ORDER[left.severity] ?? 99
                  const rightSeverity = SEVERITY_ORDER[right.severity] ?? 99

                  if (leftSeverity !== rightSeverity) {
                    return leftSeverity - rightSeverity
                  }

                  return new Date(right.created_at) - new Date(left.created_at)
                },
              },
              {
                value: "oldest",
                label: "Oldest first",
                compare: (left, right) => {
                  if (scopedAlertId) {
                    if (left.id === scopedAlertId && right.id !== scopedAlertId) {
                      return -1
                    }
                    if (right.id === scopedAlertId && left.id !== scopedAlertId) {
                      return 1
                    }
                  }
                  return new Date(left.created_at) - new Date(right.created_at)
                },
              },
            ]}
            filters={[
              {
                id: "severityFilter",
                label: "Severity",
                type: "select",
                defaultValue: "all",
                options: [
                  {value: "all", label: "All severities"},
                  {value: "critical", label: "Critical"},
                  {value: "high", label: "High"},
                  {value: "normal", label: "Normal"},
                ],
                matches: (alert, value) => {
                  if (value === "all") {
                    return true
                  }

                  return String(alert.severity || "").toLowerCase() === String(value).toLowerCase()
                },
              },
              {
                id: "patientCnpFilter",
                label: "Patient CNP",
                type: "text",
                placeholder: "Filter by CNP",
                defaultValue: scopedCnp,
                disabled: Boolean(scopedPatientId),
                onChange: (value) => {
                  if (value.trim().length === 13 && /^\d{13}$/.test(value.trim())) {
                    setSearchParams({cnp: value.trim()})
                  }
                },
                matches: (alert, value) => {
                  const query = value.trim()

                  if (query === "") {
                    return true
                  }

                  return String(patientCnpById[alert.patient_id] || "").includes(query)
                },
              },
            ]}
            getItemKey={(alert) => alert.id}
            renderHeader={() => (
              <div
                className="grid grid-cols-[0.9fr_1.2fr_1fr_2.2fr_1.1fr] gap-3 border-b border-[#3b424b] bg-[#1b2430] px-4 py-3 text-xs font-semibold uppercase tracking-[0.22em] text-[#879196]">
                <div>Severity</div>
                <div>CNP</div>
                <div>Patient</div>
                <div>Message</div>
                <div>Created</div>
              </div>
            )}
            rowClassName={(alert) => `alert-row-${alert.id} grid grid-cols-[0.9fr_1.2fr_1fr_2.2fr_1.1fr] gap-3 px-4 py-4 ${alert.severity === "critical" ? "bg-[rgba(93,22,31,0.24)]" : alert.severity === "high" ? "bg-[rgba(86,52,12,0.2)]" : "bg-[#151b22]"} ${flashAlertId === alert.id ? "alert-row-flash" : ""}`}
            renderRow={(alert) => (
              <>
                <div>
                  <span
                    className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] ${alert.severity === "critical" ? "console-chip-danger" : alert.severity === "high" ? "console-chip-warm" : "console-chip-success"}`}>
                    {alert.severity}
                  </span>
                </div>
                <div className="text-sm font-semibold text-white">{patientCnpById[alert.patient_id] || "--"}</div>
                <div className="text-sm text-[#b6bec9]">{patientNameById[alert.patient_id] || "Unknown patient"}</div>
                <div className="text-sm text-white">{alert.message}</div>
                <div className="text-sm text-[#b6bec9]">{new Date(alert.created_at).toLocaleString()}</div>
              </>
            )}
          />
        </section>


      </div>
    </div>
  )
}
