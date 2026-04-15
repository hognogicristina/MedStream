import {useEffect, useRef, useState} from "react"
import {Link, useSearchParams} from "react-router-dom"
import BackButton from "../components/BackButton"
import CountValue from "../components/CountValue"
import DataTable from "../components/DataTable"
import {useNotifications} from "../components/NotificationProvider"
import {api} from "../services/api"
import {getErrorMessage, getResponseData} from "../services/apiMessages"
import {createWebSocket} from "../services/ws"
import {formatPatientFullName} from "../utils/patients"

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
  const [patientActivities, setPatientActivities] = useState([])
  const [isLoadingAlerts, setIsLoadingAlerts] = useState(true)
  const [isLoadingActivities, setIsLoadingActivities] = useState(false)
  const alertAudioRef = useRef(null)

  if (!alertAudioRef.current) {
    alertAudioRef.current = new Audio("/alert.mp3")
  }

  useEffect(() => {
    const loadAlerts = async () => {
      try {
        const [alertsResponse, patientsResponse] = await Promise.all([
          api.get("/alerts"),
          api.get("/patients?page=1&limit=100"),
        ])
        setAlerts(getResponseData(alertsResponse))
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

      setAlerts((prev) => [msg.data, ...prev.filter((alert) => alert.id !== msg.data.id)])
      alertAudioRef.current.currentTime = 0
      alertAudioRef.current.play().catch(() => {
      })
    })

    return () => socket.close()
  }, [])

  const patientNameById = Object.fromEntries(patients.map((patient) => [patient.id, formatPatientFullName(patient)]))
  const patientCnpById = Object.fromEntries(patients.map((patient) => [patient.id, patient.cnp]))
  const patientByCnp = Object.fromEntries(patients.map((patient) => [patient.cnp, patient]))
  const scopedCnp = searchParams.get("cnp") || ""
  const scopedPatientName = searchParams.get("patient") || ""
  const scopedPatient = scopedCnp ? patientByCnp[scopedCnp] : null
  const visibleAlerts = scopedCnp
    ? alerts.filter((alert) => patientCnpById[alert.patient_id] === scopedCnp)
    : alerts
  const severityCounts = {
    critical: visibleAlerts.filter((alert) => alert.severity === "critical").length,
    high: visibleAlerts.filter((alert) => alert.severity === "high").length,
    normal: visibleAlerts.filter((alert) => alert.severity === "normal").length,
  }

  useEffect(() => {
    if (!scopedPatient) {
      setPatientActivities([])
      return
    }

    const loadActivities = async () => {
      setIsLoadingActivities(true)
      try {
        const response = await api.get(`/patients/${scopedPatient.id}/activities`)
        const activities = getResponseData(response) || []
        const incoming = activities.filter(a => a.status === 'incoming')
        setPatientActivities(incoming)
      } catch (error) {
        notifyError(getErrorMessage(error))
      } finally {
        setIsLoadingActivities(false)
      }
    }

    loadActivities()
  }, [scopedPatient, notifyError])

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
              {scopedCnp && (
                <div className="mt-3 flex flex-wrap items-center gap-3">
                  <span className="console-chip rounded-full px-3 py-1 text-xs font-semibold">
                    Patient: {scopedPatient ? (
                      <Link to={`/patient/${scopedPatient.id}`} className="hover:underline text-inherit">{formatPatientFullName(scopedPatient)}</Link>
                    ) : (scopedPatientName || "Unknown patient")}
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
            key={`alerts-${scopedCnp || "all"}`}
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
                compare: (left, right) => new Date(left.created_at) - new Date(right.created_at),
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
                disabled: Boolean(scopedCnp),
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
            rowClassName={(alert) => `grid grid-cols-[0.9fr_1.2fr_1fr_2.2fr_1.1fr] gap-3 px-4 py-4 ${alert.severity === "critical" ? "bg-[rgba(93,22,31,0.24)]" : alert.severity === "high" ? "bg-[rgba(86,52,12,0.2)]" : "bg-[#151b22]"}`}
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

        {scopedCnp && (
          <section className="monitor-card rounded-[28px] p-6">
            <div className="mb-6">
              <p className="text-xs font-semibold uppercase tracking-[0.3em] text-[#ff9900]">Schedule</p>
              <h2 className="mt-2 text-2xl font-semibold text-white">Incoming Activities</h2>
            </div>
            
            {isLoadingActivities ? (
              <div className="rounded-2xl border border-[#3b424b] bg-[#151b22] px-4 py-5 text-sm text-[#b6bec9]">
                Loading activities...
              </div>
            ) : patientActivities.length === 0 ? (
              <div className="rounded-2xl border border-[#3b424b] bg-[#151b22] px-4 py-5 text-sm text-[#b6bec9]">
                No incoming activities for this patient.
              </div>
            ) : (
              <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {patientActivities.map(activity => (
                  <li key={activity.id} className="rounded-2xl border border-[#3b424b] bg-[#151b22] p-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[#ffcc80]">{activity.type}</p>
                    <p className="mt-2 text-sm font-semibold text-white">{activity.title}</p>
                    {activity.description && <p className="mt-2 text-sm text-[#b6bec9]">{activity.description}</p>}
                    <p className="mt-3 text-xs text-[#879196]">{new Date(activity.scheduled_at).toLocaleString()}</p>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}
      </div>
    </div>
  )
}
