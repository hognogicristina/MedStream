import { useEffect, useRef, useState } from "react"
import BackButton from "../components/BackButton"
import CountValue from "../components/CountValue"
import DataTable from "../components/DataTable"
import { api } from "../services/api"
import { createWebSocket } from "../services/ws"

const SEVERITY_ORDER = {
  critical: 0,
  high: 1,
  normal: 2,
}

export default function AlertsPage() {
  const [alerts, setAlerts] = useState([])
  const [isLoadingAlerts, setIsLoadingAlerts] = useState(true)
  const [message, setMessage] = useState("")
  const alertAudioRef = useRef(null)

  if (!alertAudioRef.current) {
    alertAudioRef.current = new Audio("/alert.mp3")
  }

  useEffect(() => {
    const loadAlerts = async () => {
      setMessage("")

      try {
        const response = await api.get("/alerts")
        setAlerts(response.data)
      } catch {
        setMessage("Unable to load alerts.")
      } finally {
        setIsLoadingAlerts(false)
      }
    }

    loadAlerts()
  }, [])

  useEffect(() => {
    const socket = createWebSocket((msg) => {
      if (msg.type !== "alert") {
        return
      }

      setAlerts((prev) => [msg.data, ...prev.filter((alert) => alert.id !== msg.data.id)])
      alertAudioRef.current.currentTime = 0
      alertAudioRef.current.play().catch(() => {})
    })

    return () => socket.close()
  }, [])

  const severityCounts = {
    critical: alerts.filter((alert) => alert.severity === "critical").length,
    high: alerts.filter((alert) => alert.severity === "high").length,
    normal: alerts.filter((alert) => alert.severity === "normal").length,
  }

  return (
    <div className="app-shell min-h-screen px-4 py-6 text-slate-100 sm:px-6 lg:px-8">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6">
        <header className="console-topbar rounded-[24px] p-6 sm:p-8">
          <div className="flex flex-col gap-3">
            <div className="flex items-start justify-between gap-4">
              <p className="text-xs font-semibold uppercase tracking-[0.35em] text-[#ff9900]">Alert Center</p>
              <BackButton />
            </div>
            <div>
              <h1 className="text-3xl font-semibold tracking-tight text-white sm:text-4xl">Alerts</h1>
              <p className="mt-2 max-w-2xl text-sm text-[#b6bec9] sm:text-base">Live alert queue with filters, sort order, and paging.</p>
            </div>
          </div>
        </header>

        {message && (
          <div className="login-error">{message}</div>
        )}

        <section className="monitor-card rounded-[28px] p-6">
          <div className="mb-6 grid gap-3 lg:grid-cols-4">
            <div className="monitor-panel rounded-2xl p-4">
              <p className="text-xs uppercase tracking-[0.22em] text-[#879196]">Total Alerts</p>
              <p className="mt-2 text-2xl font-semibold text-white"><CountValue value={alerts.length} /></p>
              <p className="mt-2 text-sm text-[#b6bec9]">Full live dataset currently in memory.</p>
            </div>
            <div className="monitor-panel rounded-2xl p-4">
              <p className="text-xs uppercase tracking-[0.22em] text-[#879196]">Critical</p>
              <p className="mt-2 text-2xl font-semibold text-[#ffb3bc]"><CountValue value={severityCounts.critical} /></p>
              <p className="mt-2 text-sm text-[#b6bec9]">Highest priority alerts.</p>
            </div>
            <div className="monitor-panel rounded-2xl p-4">
              <p className="text-xs uppercase tracking-[0.22em] text-[#879196]">High</p>
              <p className="mt-2 text-2xl font-semibold text-[#ffcf85]"><CountValue value={severityCounts.high} /></p>
              <p className="mt-2 text-sm text-[#b6bec9]">Prompt review needed.</p>
            </div>
            <div className="monitor-panel rounded-2xl p-4">
              <p className="text-xs uppercase tracking-[0.22em] text-[#879196]">Normal</p>
              <p className="mt-2 text-2xl font-semibold text-[#9dccff]"><CountValue value={severityCounts.normal} /></p>
              <p className="mt-2 text-sm text-[#b6bec9]">Lower-severity signals.</p>
            </div>
          </div>

          <DataTable
            items={alerts}
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
                  { value: "all", label: "All severities" },
                  { value: "critical", label: "Critical" },
                  { value: "high", label: "High" },
                  { value: "normal", label: "Normal" },
                ],
                matches: (alert, value) => {
                  if (value === "all") {
                    return true
                  }

                  return String(alert.severity || "").toLowerCase() === String(value).toLowerCase()
                },
              },
              {
                id: "patientIdFilter",
                label: "Patient ID",
                type: "text",
                placeholder: "Filter by patient id",
                matches: (alert, value) => value.trim() === "" || String(alert.patient_id).includes(value.trim()),
              },
            ]}
            getItemKey={(alert) => alert.id}
            renderHeader={() => (
              <div className="grid grid-cols-[0.9fr_0.8fr_1fr_2.2fr_1.1fr] gap-3 border-b border-[#3b424b] bg-[#1b2430] px-4 py-3 text-xs font-semibold uppercase tracking-[0.22em] text-[#879196]">
                <div>Severity</div>
                <div>Patient</div>
                <div>Type</div>
                <div>Message</div>
                <div>Created</div>
              </div>
            )}
            rowClassName={(alert) => `grid grid-cols-[0.9fr_0.8fr_1fr_2.2fr_1.1fr] gap-3 px-4 py-4 ${alert.severity === "critical" ? "bg-[rgba(93,22,31,0.24)]" : alert.severity === "high" ? "bg-[rgba(86,52,12,0.2)]" : "bg-[#151b22]"}`}
            renderRow={(alert) => (
              <>
                <div>
                  <span className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] ${alert.severity === "critical" ? "console-chip-danger" : alert.severity === "high" ? "console-chip-warm" : "console-chip-success"}`}>
                    {alert.severity}
                  </span>
                </div>
                <div className="text-sm font-semibold text-white">{alert.patient_id}</div>
                <div className="text-sm text-[#b6bec9]">{alert.alert_type.replaceAll("_", " ")}</div>
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
