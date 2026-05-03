import {useCallback, useEffect, useState} from "react"
import {useParams} from "react-router-dom"
import BackButton from "../components/BackButton.jsx"
import LoadingSpinner from "../components/LoadingSpinner.jsx"
import {useNotifications} from "../components/useNotifications.js"
import {createPatientDiagnosis, getPatient, getPatientDiagnosis} from "../services/patientApi.js"
import {getErrorMessage, getResponseData, getResponseMessage} from "../services/apiMessages.js"

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

export default function PatientDiagnosisPage() {
  const {id} = useParams()
  const {notifyError, notifySuccess} = useNotifications()
  const pageSize = 5
  const [patient, setPatient] = useState(null)
  const [diagnosisEntries, setDiagnosisEntries] = useState([])
  const [diagnosisTotal, setDiagnosisTotal] = useState(0)
  const [diagnosisPage, setDiagnosisPage] = useState(1)
  const [form, setForm] = useState({
    diagnosis: "",
    notes: "",
  })
  const [isLoading, setIsLoading] = useState(true)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const loadPageData = useCallback(async (page = diagnosisPage) => {
    setIsLoading(true)

    try {
      const [patientResponse, diagnosisResponse] = await Promise.all([
        getPatient(id),
        getPatientDiagnosis(id, page, pageSize),
      ])

      setPatient(getResponseData(patientResponse))
      const diagnosisData = getResponseData(diagnosisResponse) || {}
      setDiagnosisEntries(diagnosisData.items || [])
      setDiagnosisTotal(diagnosisData.total || 0)
    } catch (error) {
      notifyError(getErrorMessage(error))
    } finally {
      setIsLoading(false)
    }
  }, [diagnosisPage, id, notifyError])

  useEffect(() => {
    loadPageData(diagnosisPage).then(r => r)
  }, [diagnosisPage, loadPageData])

  const handleChange = (event) => {
    const {name, value} = event.target
    setForm((current) => ({...current, [name]: value}))
  }

  const handleSubmit = async (event) => {
    event.preventDefault()

    if (!form.diagnosis.trim() || isSubmitting) {
      return
    }

    setIsSubmitting(true)

    try {
      const response = await createPatientDiagnosis(id, {
        diagnosis: form.diagnosis,
        notes: form.notes.trim() || null,
      })
      setForm({
        diagnosis: "",
        notes: "",
      })
      await loadPageData(1)
      setDiagnosisPage(1)
      notifySuccess(getResponseMessage(response))
    } catch (error) {
      notifyError(getErrorMessage(error))
    } finally {
      setIsSubmitting(false)
    }
  }

  const patientName = patient ? `${patient.last_name} ${patient.first_name}`.trim() : "Patient"
  const maxDiagnosisPage = Math.max(1, Math.ceil(diagnosisTotal / pageSize))

  useEffect(() => {
    if (diagnosisPage > maxDiagnosisPage) {
      setDiagnosisPage(maxDiagnosisPage)
    }
  }, [diagnosisPage, maxDiagnosisPage])

  return (
    <div className="app-shell min-h-screen px-4 py-6 text-slate-100 sm:px-6 lg:px-8">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
        <header className="console-topbar rounded-3xl p-6 sm:p-8">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.35em] text-[#ff9900]">Diagnosis</p>
              <h1 className="mt-2 text-3xl font-semibold tracking-tight text-white sm:text-4xl">{patientName}</h1>
              <p className="mt-2 text-sm text-[#b6bec9]">Structured diagnosis entries for this patient.</p>
            </div>
            <BackButton/>
          </div>
        </header>

        {isLoading ? <LoadingSpinner/> : (
        <section className="grid gap-6 xl:grid-cols-[0.95fr_1.25fr]">
          <div className="monitor-card rounded-[28px] p-6">
            <div className="mb-5">
              <p className="text-xs font-semibold uppercase tracking-[0.3em] text-[#ff9900]">Add Diagnosis</p>
              <h2 className="mt-2 text-2xl font-semibold text-white">New Entry</h2>
            </div>

            <form className="space-y-4" onSubmit={handleSubmit}>
              <input
                type="text"
                name="diagnosis"
                value={form.diagnosis}
                onChange={handleChange}
                placeholder="Diagnosis"
                className="console-input w-full rounded-2xl px-4 py-3 outline-none"
                required
              />

              <textarea
                name="notes"
                value={form.notes}
                onChange={handleChange}
                placeholder="Notes"
                className="console-input min-h-28 w-full rounded-2xl px-4 py-3 outline-none"
              />

              <button
                type="submit"
                disabled={!form.diagnosis.trim() || isSubmitting}
                className="console-button-primary w-full rounded-2xl px-4 py-3 font-semibold disabled:cursor-not-allowed disabled:border-[#4d5661] disabled:bg-[#3b424b] disabled:text-[#b6bec9]"
              >
                {isSubmitting ? "Saving..." : "Add Diagnosis"}
              </button>
            </form>
          </div>

          <div className="monitor-card rounded-[28px] p-6">
            <div className="mb-5 flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.3em] text-[#ff9900]">Entries</p>
                <h2 className="mt-2 text-2xl font-semibold text-white">Diagnosis Timeline</h2>
              </div>
              <span className="console-chip rounded-full px-3 py-1 text-xs font-semibold">
                {diagnosisTotal} total
              </span>
            </div>

            <div className="mb-4 flex items-center justify-between gap-3">
              <div className="console-chip rounded-full px-3 py-1 text-xs font-medium">
                Page {diagnosisPage}
              </div>

              <div className="flex items-center gap-2">
                <button
                  className="console-button-ghost rounded-full px-3 py-1.5 text-xs font-medium disabled:cursor-not-allowed disabled:border-[#31363f] disabled:text-[#6b7280]"
                  onClick={() => setDiagnosisPage((prev) => Math.max(1, prev - 1))}
                  disabled={diagnosisPage === 1}
                  type="button"
                >
                  Previous
                </button>

                <button
                  className="console-button-ghost rounded-full px-3 py-1.5 text-xs font-medium disabled:cursor-not-allowed disabled:border-[#31363f] disabled:text-[#6b7280]"
                  onClick={() => setDiagnosisPage((prev) => prev + 1)}
                  disabled={diagnosisPage >= maxDiagnosisPage}
                  type="button"
                >
                  Next
                </button>
              </div>
            </div>

            <ul className="space-y-3">
              {diagnosisEntries.length === 0 && (
                <li className="rounded-2xl border border-[#3b424b] bg-[#151b22] px-4 py-5 text-sm text-[#b6bec9]">
                  {isLoading ? "Loading diagnosis entries..." : "No diagnosis entries recorded for this patient."}
                </li>
              )}

              {diagnosisEntries.map((entry) => (
                <li key={entry.id} className="rounded-2xl border border-[#3b424b] bg-[#151b22] px-4 py-4">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="text-sm font-semibold text-white">{entry.diagnosis}</p>
                      {entry.notes && (
                        <p className="mt-2 text-sm text-[#c4ccd5]">{entry.notes}</p>
                      )}
                    </div>
                    <span className="text-xs text-[#879196]">{formatDateTime(entry.updated_at || entry.created_at)}</span>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </section>
        )}
      </div>
    </div>
  )
}
