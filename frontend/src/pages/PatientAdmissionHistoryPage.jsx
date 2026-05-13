import {useCallback, useEffect, useState} from "react"
import {Link, useParams} from "react-router-dom"
import {Pagination} from "@cloudscape-design/components"

import BackButton from "../components/BackButton.jsx"
import LoadingSpinner from "../components/LoadingSpinner.jsx"
import PatientAdmissionActionCard from "../components/PatientAdmissionActionCard.jsx"
import PostDischargeClinicalSummaryCard from "../components/PostDischargeClinicalSummaryCard.jsx"
import {useNotifications} from "../hooks/useNotifications.js"
import {usePatientAdmissionActions} from "../hooks/usePatientAdmissionActions.js"
import {useAuth} from "../components/AuthContext.jsx"
import {getPatient, getPatientAdmissionHistory, getPatientPostDischargeSummary} from "../services/patientApi.js"
import {getErrorMessage, getResponseData} from "../services/apiMessages.js"

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
    second: "2-digit",
    hour12: false,
  }).format(new Date(value))
}

function formatAdmissionType(value) {
  if (String(value).toLowerCase() === "admission") {
    return "Admission"
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
  const [postDischargeSummary, setPostDischargeSummary] = useState(null)

  const loadPageData = useCallback(async (nextPage = page) => {
    setIsLoading(true)

    try {
      const [patientResponse, historyResponse] = await Promise.all([
        getPatient(id),
        getPatientAdmissionHistory(id, nextPage, pageSize),
      ])

      setPatient(getResponseData(patientResponse))
      const historyData = getResponseData(historyResponse) || {}
      setEntries(historyData.items || [])
      setTotal(historyData.total || 0)

      try {
        const summaryResponse = await getPatientPostDischargeSummary(id)
        setPostDischargeSummary(getResponseData(summaryResponse) || null)
      } catch (summaryError) {
        void summaryError
        setPostDischargeSummary(null)
      }
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
    loadDischargeTypes().then(() => {
    })
  }, [loadDischargeTypes])

  return (
    <div className="app-shell min-h-screen px-4 py-6 text-[var(--text-primary)] sm:px-6 lg:px-8">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
        <header className="console-topbar rounded-[24px] p-6 sm:p-8">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.35em] text-[#ff9900]">Admission History</p>
              <h1 className="mt-2 text-3xl font-semibold tracking-tight text-[var(--text-primary)] sm:text-4xl">{patientName}</h1>
              <p className="mt-2 text-sm text-[var(--text-secondary)]">Admission, discharge, and readmission activity for this patient.</p>
            </div>
            <BackButton/>
          </div>
        </header>

        {isLoading ? <LoadingSpinner/> : (
          <>
            <section className="grid gap-6 xl:grid-cols-[1.2fr_0.9fr]">
              <div className="monitor-card rounded-[28px] p-6">
              <div className="mb-5 flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.3em] text-[#ff9900]">Timeline</p>
                  <h2 className="mt-2 text-2xl font-semibold text-[var(--text-primary)]">Admissions and Discharges</h2>
                </div>
                <span className="console-chip rounded-full px-3 py-1 text-xs font-semibold">
                {total} total
              </span>
              </div>

              <div className="mb-4 flex justify-end">
                <Pagination
                  currentPageIndex={page}
                  pagesCount={maxPage}
                  onChange={({detail}) => setPage(detail.currentPageIndex)}
                />
              </div>

              <ul className="space-y-3">
                {entries.length === 0 && (
                  <li className="rounded-2xl border border-[var(--border-primary)] bg-[var(--surface-2)] px-4 py-5 text-sm text-[var(--text-secondary)]">
                    {isLoading ? "Loading admission history..." : "No admission history recorded for this patient."}
                  </li>
                )}

                {entries.map((entry) => (
                  <li key={entry.id} className="rounded-2xl border border-[var(--border-primary)] bg-[var(--surface-2)] px-4 py-4">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <p className="text-sm font-semibold text-[var(--text-primary)]">{formatAdmissionType(entry.type)}</p>
                        <p className="mt-2 text-sm text-[var(--text-secondary)]">{entry.note || entry.reason || "--"}</p>
                      </div>
                      <span className="text-xs text-[var(--text-muted)]">{formatDateTime(entry.created_at)}</span>
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
                readmitArrivalMethod={admissionActions.readmitArrivalMethod}
                onDischargeReasonChange={admissionActions.setDischargeReason}
                onDischargeTypeChange={admissionActions.setDischargeType}
                onReadmitArrivalMethodChange={admissionActions.setReadmitArrivalMethod}
                onDischargeSubmit={admissionActions.handleDischargeSubmit}
                onReadmitSubmit={admissionActions.handleReadmitSubmit}
                isSubmittingDischarge={admissionActions.isSubmittingDischarge}
                isSubmittingReadmit={admissionActions.isSubmittingReadmit}
              />
            </section>

            {["ready", "pending"].includes(String(postDischargeSummary?.status || "").trim().toLowerCase()) ? (
              <PostDischargeClinicalSummaryCard summary={postDischargeSummary}/>
            ) : null}
          </>
        )}
      </div>
    </div>
  )
}
