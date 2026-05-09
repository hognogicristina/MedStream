import {useEffect, useMemo, useRef, useState} from "react"
import {Link, useSearchParams} from "react-router-dom"
import BackButton from "../components/BackButton.jsx"
import CountValue from "../components/CountValue.jsx"
import DataTable from "../components/DataTable.jsx"
import {useNotifications} from "../hooks/useNotifications.js"
import {getAlerts, getPatientAlerts, listPatients} from "../services/patientApi.js"
import {getErrorMessage, getResponseData} from "../services/apiMessages.js"
import {createWebSocket} from "../services/ws.js"
import {formatPatientFullName} from "../utils/patients.js"

const ALL_ALERTS_TITLE = "Alert System"
const PATIENT_TITLE_FALLBACK = "Alert System - Patient"

function normalizeTimestamp(value) {
  const timestamp = new Date(value).getTime()
  return Number.isFinite(timestamp) ? timestamp : 0
}

function compareNewestFirst(left, right) {
  const rightTime = normalizeTimestamp(right?.created_at)
  const leftTime = normalizeTimestamp(left?.created_at)
  if (rightTime !== leftTime) {
    return rightTime - leftTime
  }

  return Number(right?.id || 0) - Number(left?.id || 0)
}

function compareOldestFirst(left, right) {
  const leftTime = normalizeTimestamp(left?.created_at)
  const rightTime = normalizeTimestamp(right?.created_at)
  if (leftTime !== rightTime) {
    return leftTime - rightTime
  }

  return Number(left?.id || 0) - Number(right?.id || 0)
}

function buildPatientTitle(patient) {
  if (!patient) {
    return PATIENT_TITLE_FALLBACK
  }

  const fullName = formatPatientFullName(patient)
  if (!fullName || fullName.toLowerCase() === "unknown") {
    return PATIENT_TITLE_FALLBACK
  }

  return `Alert System - Patient: ${fullName}`
}

function formatDateTimeWithSeconds(value) {
  const date = new Date(value)
  if (!Number.isFinite(date.getTime())) {
    return "--"
  }
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(date)
}

export default function AlertsPage() {
  const {notifyError} = useNotifications()
  const [searchParams, setSearchParams] = useSearchParams()
  const [alerts, setAlerts] = useState([])
  const [patients, setPatients] = useState([])
  const [isLoadingAlerts, setIsLoadingAlerts] = useState(true)
  const [alertsError, setAlertsError] = useState("")
  const [flashAlertId, setFlashAlertId] = useState(null)
  const requestSerialRef = useRef(0)

  const scopedCnp = searchParams.get("cnp") || ""
  const scopedPatientIdRaw = searchParams.get("patientId")
  const scopedAlertIdRaw = searchParams.get("alertId")
  const scopedPatientId = scopedPatientIdRaw && /^\d+$/.test(scopedPatientIdRaw) ? Number(scopedPatientIdRaw) : null
  const scopedAlertId = scopedAlertIdRaw && /^\d+$/.test(scopedAlertIdRaw) ? Number(scopedAlertIdRaw) : null

  const patientById = useMemo(
    () => Object.fromEntries((Array.isArray(patients) ? patients : []).map((patient) => [patient.id, patient])),
    [patients],
  )
  const patientByCnp = useMemo(
    () => Object.fromEntries((Array.isArray(patients) ? patients : []).map((patient) => [patient.cnp, patient])),
    [patients],
  )

  const scopedPatient = scopedPatientId
    ? patientById[scopedPatientId]
    : (scopedCnp ? patientByCnp[scopedCnp] : null)

  useEffect(() => {
    if (!scopedPatientId && !scopedCnp) {
      document.title = ALL_ALERTS_TITLE
      return
    }

    document.title = buildPatientTitle(scopedPatient)
  }, [scopedCnp, scopedPatient, scopedPatientId])

  useEffect(() => {
    let isMounted = true
    const requestId = requestSerialRef.current + 1
    requestSerialRef.current = requestId

    const loadAlerts = async () => {
      setIsLoadingAlerts(true)
      setAlertsError("")

      try {
        const patientsPromise = listPatients()
        const alertsPromise = scopedPatientId ? getPatientAlerts(scopedPatientId) : getAlerts(scopedCnp ? scopedCnp : undefined)

        const [alertsResponse, patientsResponse] = await Promise.all([alertsPromise, patientsPromise])
        if (!isMounted || requestSerialRef.current !== requestId) {
          return
        }

        const nextAlerts = Array.isArray(getResponseData(alertsResponse)) ? getResponseData(alertsResponse) : []
        const nextPatients = Array.isArray(getResponseData(patientsResponse)) ? getResponseData(patientsResponse) : []

        setPatients(nextPatients)
        setAlerts(nextAlerts)
      } catch (error) {
        if (!isMounted || requestSerialRef.current !== requestId) {
          return
        }

        setAlerts([])
        setAlertsError(getErrorMessage(error) || "Unable to load alerts.")
        notifyError(getErrorMessage(error))
      } finally {
        if (isMounted && requestSerialRef.current === requestId) {
          setIsLoadingAlerts(false)
        }
      }
    }

    loadAlerts().then(() => {
    })

    return () => {
      isMounted = false
    }
  }, [notifyError, scopedCnp, scopedPatientId])

  useEffect(() => {
    const socket = createWebSocket((msg) => {
      if (msg.type !== "alert") {
        return
      }

      const nextAlert = msg.data
      const patientId = Number(nextAlert?.patient_id)
      if (!Number.isInteger(patientId)) {
        return
      }

      if (scopedPatientId && patientId !== scopedPatientId) {
        return
      }

      if (!scopedPatientId && scopedCnp) {
        const matchedPatient = patientById[patientId]
        if (!matchedPatient || String(matchedPatient.cnp || "") !== scopedCnp) {
          return
        }
      }

      setAlerts((prev) => [nextAlert, ...prev.filter((alert) => alert.id !== nextAlert.id)].sort(compareNewestFirst))
    })

    return () => socket.close()
  }, [patientById, scopedCnp, scopedPatientId])

  const patientNameById = useMemo(
    () => Object.fromEntries((Array.isArray(patients) ? patients : []).map((patient) => [patient.id, formatPatientFullName(patient)])),
    [patients],
  )
  const patientCnpById = useMemo(
    () => Object.fromEntries((Array.isArray(patients) ? patients : []).map((patient) => [patient.id, patient.cnp])),
    [patients],
  )
  const validPatientIds = useMemo(() => new Set((Array.isArray(patients) ? patients : []).map((patient) => patient.id)), [patients])

  const validAlerts = useMemo(
    () => (Array.isArray(alerts) ? alerts : []).filter((alert) => Number.isInteger(alert?.patient_id) && validPatientIds.has(alert.patient_id)),
    [alerts, validPatientIds],
  )

  const visibleAlerts = useMemo(() => {
    if (scopedPatientId) {
      return validAlerts.filter((alert) => alert.patient_id === scopedPatientId)
    }
    if (scopedCnp) {
      return validAlerts.filter((alert) => patientCnpById[alert.patient_id] === scopedCnp)
    }
    return validAlerts
  }, [patientCnpById, scopedCnp, scopedPatientId, validAlerts])

  const chronologicallySortedAlerts = useMemo(() => [...visibleAlerts].sort(compareNewestFirst), [visibleAlerts])

  const severityCounts = useMemo(
    () => ({
      critical: chronologicallySortedAlerts.filter((alert) => String(alert.severity || "").toLowerCase() === "critical").length,
      high: chronologicallySortedAlerts.filter((alert) => String(alert.severity || "").toLowerCase() === "high").length,
      normal: chronologicallySortedAlerts.filter((alert) => String(alert.severity || "").toLowerCase() === "normal").length,
    }),
    [chronologicallySortedAlerts],
  )

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
  }, [chronologicallySortedAlerts, isLoadingAlerts, scopedAlertId])

  return (
    <div className="app-shell min-h-screen px-4 py-6 text-[var(--text-primary)] sm:px-6 lg:px-8">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6">
        <header className="console-topbar rounded-[24px] p-6 sm:p-8">
          <div className="flex flex-col gap-3">
            <div className="flex items-start justify-between gap-4">
              <p className="text-xs font-semibold uppercase tracking-[0.35em] text-[#ff9900]">Alert Center</p>
              <BackButton/>
            </div>
            <div>
              <h1 className="text-3xl font-semibold tracking-tight text-[var(--text-primary)] sm:text-4xl">Alerts</h1>
              <p className="mt-2 max-w-2xl text-sm text-[var(--text-secondary)] sm:text-base">Live alert queue with filters, sort order, and paging.</p>
              {(scopedCnp || scopedPatientId) && (
                <div className="mt-3 flex flex-wrap items-center gap-3">
                  <span className="console-chip rounded-full px-3 py-1 text-xs font-semibold">
                    Patient: {scopedPatient ? (
                      <Link to={`/patient/${scopedPatient.id}`} className="hover:underline text-inherit">{formatPatientFullName(scopedPatient)}</Link>
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
              <p className="text-xs uppercase tracking-[0.22em] text-[var(--text-muted)]">Total Alerts</p>
              <p className="mt-2 text-2xl font-semibold text-[var(--text-primary)]"><CountValue value={visibleAlerts.length}/></p>
              <p className="mt-2 text-sm text-[var(--text-secondary)]">Full live dataset currently in memory.</p>
            </div>
            <div className="monitor-panel rounded-2xl p-4">
              <p className="text-xs uppercase tracking-[0.22em] text-[var(--text-muted)]">Critical</p>
              <p className="mt-2 text-2xl font-semibold text-[#ffb3bc]"><CountValue value={severityCounts.critical}/></p>
              <p className="mt-2 text-sm text-[var(--text-secondary)]">Highest priority alerts.</p>
            </div>
            <div className="monitor-panel rounded-2xl p-4">
              <p className="text-xs uppercase tracking-[0.22em] text-[var(--text-muted)]">High</p>
              <p className="mt-2 text-2xl font-semibold text-[#ffcf85]"><CountValue value={severityCounts.high}/></p>
              <p className="mt-2 text-sm text-[var(--text-secondary)]">Prompt review needed.</p>
            </div>
            <div className="monitor-panel rounded-2xl p-4">
              <p className="text-xs uppercase tracking-[0.22em] text-[var(--text-muted)]">Normal</p>
              <p className="mt-2 text-2xl font-semibold text-[var(--link)]"><CountValue value={severityCounts.normal}/></p>
              <p className="mt-2 text-sm text-[var(--text-secondary)]">Lower-severity signals.</p>
            </div>
          </div>

          {alertsError && !isLoadingAlerts ? (
            <div className="mb-6 rounded-2xl border border-[#5f2323] bg-[#281515] px-4 py-3 text-sm text-[#ffd7d7]">
              {alertsError}
            </div>
          ) : null}

          <DataTable
            key={`alerts-${scopedPatientId || scopedCnp || "all"}`}
            items={chronologicallySortedAlerts}
            loading={isLoadingAlerts}
            loadingMessage="Loading alert queue..."
            emptyMessage="No alerts match the current filters."
            pageSize={10}
            defaultSort="newest"
            controlsLayoutClassName="mb-6 grid gap-4 rounded-[24px] border border-[var(--border-primary)] bg-[var(--surface-2)] p-4 lg:grid-cols-[1fr_1fr_1fr_auto]"
            sortOptions={[
              {
                value: "newest",
                label: "Newest first",
                compare: compareNewestFirst,
              },
              {
                value: "oldest",
                label: "Oldest first",
                compare: compareOldestFirst,
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
                  const next = value.trim()
                  if (next === "") {
                    setSearchParams({})
                    return
                  }

                  if (next.length === 13 && /^\d{13}$/.test(next)) {
                    setSearchParams({cnp: next})
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
                className="grid grid-cols-[0.9fr_1.2fr_1fr_2.2fr_1.1fr] gap-3 border-b border-[var(--border-primary)] bg-[var(--surface-1)] px-4 py-3 text-xs font-semibold uppercase tracking-[0.22em] text-[var(--text-muted)]">
                <div>Severity</div>
                <div>CNP</div>
                <div>Patient</div>
                <div>Message</div>
                <div>Created</div>
              </div>
            )}
            rowClassName={(alert) => `alert-row-${alert.id} grid grid-cols-[0.9fr_1.2fr_1fr_2.2fr_1.1fr] gap-3 px-4 py-4 ${alert.severity === "critical" ? "alert-row-critical" : alert.severity === "high" ? "alert-row-high" : "alert-row-normal"} ${flashAlertId === alert.id ? "alert-row-flash" : ""}`}
            renderRow={(alert) => (
              <>
                <div>
                  <span
                    className={`alert-severity-chip inline-flex rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] ${alert.severity === "critical" ? "alert-severity-chip-critical" : alert.severity === "high" ? "alert-severity-chip-high" : "alert-severity-chip-normal"}`}>
                    {alert.severity}
                  </span>
                </div>
                <div className="text-sm font-semibold text-[var(--text-primary)]">{patientCnpById[alert.patient_id] || "--"}</div>
                <div className="text-sm text-[var(--text-secondary)]">{patientNameById[alert.patient_id] || "Unknown patient"}</div>
                <div className="text-sm text-[var(--text-primary)]">{alert.message}</div>
                <div className="text-sm text-[var(--text-secondary)]">{formatDateTimeWithSeconds(alert.created_at)}</div>
              </>
            )}
          />
        </section>
      </div>
    </div>
  )
}
