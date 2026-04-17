import {useCallback, useEffect, useState} from "react"
import {Link, useParams} from "react-router-dom"

import BackButton from "../components/BackButton"
import PatientAdmissionActionCard from "../components/PatientAdmissionActionCard"
import {useNotifications} from "../components/NotificationProvider"
import {usePatientAdmissionActions} from "../hooks/usePatientAdmissionActions"
import {useAuth} from "../auth/AuthContext"
import {api} from "../services/api"
import {getErrorMessage, getResponseData} from "../services/apiMessages"

function formatDateTime(value) {
  if (!value) {
    return "--"
  }

  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value))
}

function formatAdmissionType(value) {
  if (String(value).toLowerCase() === "readmission") {
    return "Readmission"
  }

  return value || "--"
}

export default function PatientAdmissionHistoryPage() {
  const {id} = useParams()
  const {notifyError, notifySuccess} = useNotifications()
  const {token} = useAuth()
  const pageSize = 8
  const [patient, setPatient] = useState(null)
  const [entries, setEntries] = useState([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [isLoading, setIsLoading] = useState(true)

  const loadPageData = useCallback(async (nextPage = page) => {
    setIsLoading(true)

    try {
      const [patientResponse, historyResponse] = await Promise.all([
        api.get(`/patients/${id}`),
        api.get(`/patients/${id}/admission-history?page=${nextPage}&page_size=${pageSize}`),
      ])

      setPatient(getResponseData(patientResponse))
      const historyData = getResponseData(historyResponse) || {}
      setEntries(historyData.items || [])
      setTotal(historyData.total || 0)
    } catch (error) {
      notifyError(getErrorMessage(error))
    } finally {
      setIsLoading(false)
    }
  }, [id, notifyError, page])

  useEffect(() => {
    loadPageData(page)
  }, [loadPageData, page])

  const maxPage = Math.max(1, Math.ceil(total / pageSize))

  useEffect(() => {
    if (page > maxPage) {
      setPage(maxPage)
    }
  }, [maxPage, page])

  const admissionActions = usePatientAdmissionActions({
    authHeaders: token ? {Authorization: `Bearer ${token}`} : {},
    patientId: id,
    onPatientChange: setPatient,
    onHistoryRefresh: async () => {
      await loadPageData(1)
      setPage(1)
    },
    notifyError,
    notifySuccess,
  })
  const {loadDischargeTypes} = admissionActions

  const patientName = patient ? `${patient.last_name} ${patient.first_name}`.trim() : "Patient"

  useEffect(() => {
    loadDischargeTypes().then(() => {})
  }, [loadDischargeTypes])

  return (
    <div className="app-shell min-h-screen px-4 py-6 text-slate-100 sm:px-6 lg:px-8">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
        <header className="console-topbar rounded-[24px] p-6 sm:p-8">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.35em] text-[#ff9900]">Admission History</p>
              <h1 className="mt-2 text-3xl font-semibold tracking-tight text-white sm:text-4xl">{patientName}</h1>
              <p className="mt-2 text-sm text-[#b6bec9]">Admission, discharge, and readmission activity for this patient.</p>
            </div>
            <BackButton/>
          </div>
        </header>

        <section className="grid gap-6 xl:grid-cols-[1.2fr_0.9fr]">
          <div className="monitor-card rounded-[28px] p-6">
            <div className="mb-5 flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.3em] text-[#ff9900]">Timeline</p>
                <h2 className="mt-2 text-2xl font-semibold text-white">Admissions and Discharges</h2>
              </div>
              <span className="console-chip rounded-full px-3 py-1 text-xs font-semibold">
                {total} total
              </span>
            </div>

            <div className="mb-4 flex items-center justify-between gap-3">
              <div className="console-chip rounded-full px-3 py-1 text-xs font-medium">
                Page {page}
              </div>

              <div className="flex items-center gap-2">
                <button
                  className="console-button-ghost rounded-full px-3 py-1.5 text-xs font-medium disabled:cursor-not-allowed disabled:border-[#31363f] disabled:text-[#6b7280]"
                  onClick={() => setPage((current) => Math.max(1, current - 1))}
                  disabled={page === 1}
                  type="button"
                >
                  Previous
                </button>
                <button
                  className="console-button-ghost rounded-full px-3 py-1.5 text-xs font-medium disabled:cursor-not-allowed disabled:border-[#31363f] disabled:text-[#6b7280]"
                  onClick={() => setPage((current) => current + 1)}
                  disabled={page >= maxPage}
                  type="button"
                >
                  Next
                </button>
              </div>
            </div>

            <ul className="space-y-3">
              {entries.length === 0 && (
                <li className="rounded-2xl border border-[#3b424b] bg-[#151b22] px-4 py-5 text-sm text-[#b6bec9]">
                  {isLoading ? "Loading admission history..." : "No admission history recorded for this patient."}
                </li>
              )}

              {entries.map((entry) => (
                <li key={entry.id} className="rounded-2xl border border-[#3b424b] bg-[#151b22] px-4 py-4">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="text-sm font-semibold text-white">{formatAdmissionType(entry.type)}</p>
                      <p className="mt-2 text-sm text-[#c4ccd5]">{entry.reason}</p>
                    </div>
                    <span className="text-xs text-[#879196]">{formatDateTime(entry.created_at)}</span>
                  </div>
                </li>
              ))}
            </ul>

            <div className="mt-4">
              <Link
                to={`/patient/${id}`}
                className="console-button-secondary block rounded-2xl px-4 py-3 text-center text-sm font-semibold"
              >
                Back to patient page
              </Link>
            </div>
          </div>

          <PatientAdmissionActionCard
            patient={patient}
            canManagePatient={Boolean(token)}
            dischargeReason={admissionActions.dischargeReason}
            dischargeType={admissionActions.dischargeType}
            dischargeTypes={admissionActions.dischargeTypes}
            readmitReason={admissionActions.readmitReason}
            onDischargeReasonChange={admissionActions.setDischargeReason}
            onDischargeTypeChange={admissionActions.setDischargeType}
            onReadmitReasonChange={admissionActions.setReadmitReason}
            onDischargeSubmit={admissionActions.handleDischargeSubmit}
            onReadmitSubmit={admissionActions.handleReadmitSubmit}
            isSubmittingDischarge={admissionActions.isSubmittingDischarge}
            isSubmittingReadmit={admissionActions.isSubmittingReadmit}
          />
        </section>
      </div>
    </div>
  )
}
