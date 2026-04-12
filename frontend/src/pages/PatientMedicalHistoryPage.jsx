import {useCallback, useEffect, useState} from "react"
import {useParams} from "react-router-dom"
import BackButton from "../components/BackButton"
import {useNotifications} from "../components/NotificationProvider"
import {api} from "../services/api"
import {getErrorMessage, getResponseData, getResponseMessage} from "../services/apiMessages"

function formatDateTime(value) {
  if (!value) return "--"

  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value))
}

export default function PatientMedicalHistoryPage() {
  const {id} = useParams()
  const {notifyError, notifySuccess} = useNotifications()

  const [patient, setPatient] = useState(null)
  const [data, setData] = useState(null)

  const [filter, setFilter] = useState("all")
  const [page, setPage] = useState(1)
  const pageSize = 8

  const [conditions, setConditions] = useState([])

  const [showDialog, setShowDialog] = useState(null)

  const [diagnosisForm, setDiagnosisForm] = useState({diagnosis: "", notes: ""})
  const [medicationForm, setMedicationForm] = useState({name: "", dosage: ""})
  const [allergyForm, setAllergyForm] = useState({name: "", severity: "mild"})
  const [conditionId, setConditionId] = useState("")

  const [isLoading, setIsLoading] = useState(true)

  const loadData = useCallback(async () => {
    setIsLoading(true)

    try {
      const [patientRes, historyRes, conditionsRes] = await Promise.all([
        api.get(`/patients/${id}`),
        api.get(`/patients/${id}/medical-history`),
        api.get(`/patients/${id}/conditions`)
      ])

      setPatient(getResponseData(patientRes))
      setData(getResponseData(historyRes))
      setConditions(getResponseData(conditionsRes) || [])
    } catch (error) {
      notifyError(getErrorMessage(error))
    } finally {
      setIsLoading(false)
    }
  }, [id, notifyError])

  useEffect(() => {
    loadData()
  }, [loadData])

  const buildItems = () => {
    if (!data) return []

    const mapped = [
      ...data.diagnosis.map(i => ({...i, type: "diagnosis", label: i.diagnosis})),
      ...data.medications.map(i => ({...i, type: "medication", label: i.medication_name})),
      ...data.allergies.map(i => ({...i, type: "allergy", label: i.allergy_name})),
      ...data.conditions.map(i => ({...i, type: "condition", label: i.name})),
    ]

    const filtered = filter === "all" ? mapped : mapped.filter(i => i.type === filter)

    return filtered.sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
  }

  const items = buildItems()

  const paginatedItems = items.slice((page - 1) * pageSize, page * pageSize)
  const maxPage = Math.max(1, Math.ceil(items.length / pageSize))

  const patientName = patient ? `${patient.last_name} ${patient.first_name}` : "Patient"

  const handleSubmit = async (type) => {
    try {
      let response

      if (type === "diagnosis") {
        response = await api.post(`/patients/${id}/diagnosis`, diagnosisForm)
        setDiagnosisForm({diagnosis: "", notes: ""})
      }

      if (type === "medication") {
        response = await api.post(`/patients/${id}/medication`, {
          medication_name: medicationForm.name,
          dosage: medicationForm.dosage,
        })
        setMedicationForm({name: "", dosage: ""})
      }

      if (type === "allergy") {
        response = await api.post(`/patients/${id}/allergies`, {
          allergy_name: allergyForm.name,
          severity: allergyForm.severity,
        })
        setAllergyForm({name: "", severity: "mild"})
      }

      if (type === "condition") {
        response = await api.post(`/patients/${id}/conditions`, {
          condition_id: Number(conditionId),
        })
        setConditionId("")
      }

      notifySuccess(getResponseMessage(response))
      setShowDialog(null)
      loadData()
    } catch (e) {
      notifyError(getErrorMessage(e))
    }
  }

  return (
    <div className="app-shell min-h-screen px-4 py-6 text-slate-100">
      <div className="mx-auto max-w-6xl flex flex-col gap-6">

        <header className="console-topbar rounded-3xl p-6 flex justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.35em] text-[#ff9900]">Medical History</p>
            <h1 className="mt-2 text-3xl text-white">{patientName}</h1>
          </div>
          <BackButton/>
        </header>

        {/* CONTROLS */}
        <div className="flex justify-between items-center gap-4">

          <select
            value={filter}
            onChange={e => {
              setFilter(e.target.value)
              setPage(1)
            }}
            className="console-input px-4 py-2 rounded-xl"
          >
            <option value="all">All</option>
            <option value="diagnosis">Diagnosis</option>
            <option value="medication">Medication</option>
            <option value="allergy">Allergy</option>
            <option value="condition">Condition</option>
          </select>

          <div className="flex gap-2">
            <button onClick={() => setShowDialog("diagnosis")} className="console-button-primary px-4 py-2 rounded-xl">+ Diagnosis</button>
            <button onClick={() => setShowDialog("medication")} className="console-button-primary px-4 py-2 rounded-xl">+ Medication
            </button>
            <button onClick={() => setShowDialog("allergy")} className="console-button-primary px-4 py-2 rounded-xl">+ Allergy</button>
            <button onClick={() => setShowDialog("condition")} className="console-button-primary px-4 py-2 rounded-xl">+ Condition</button>
          </div>

        </div>

        {/* LIST */}
        <div className="monitor-card rounded-2xl p-6">
          <ul className="space-y-3">

            {paginatedItems.length === 0 && (
              <li>{isLoading ? "Loading..." : "No data"}</li>
            )}

            {paginatedItems.map((item, i) => (
              <li key={i} className="rounded-2xl border border-[#3b424b] bg-[#151b22] px-4 py-4 flex justify-between">
                <div>
                  <p className="text-xs text-[#879196] uppercase">{item.type}</p>
                  <p className="text-white font-semibold">{item.label}</p>
                </div>

                <div className="flex flex-col items-end gap-2">
                  <span className="text-xs text-[#879196]">{formatDateTime(item.created_at)}</span>
                  <button className="console-button-secondary text-xs px-3 py-1">
                    Modify
                  </button>
                </div>
              </li>
            ))}

          </ul>

          {/* PAGINATION */}
          <div className="flex justify-between mt-4">
            <button
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page === 1}
              className="console-button-ghost px-3 py-1 rounded-full"
            >
              Previous
            </button>

            <span className="text-sm">Page {page}</span>

            <button
              onClick={() => setPage(p => Math.min(maxPage, p + 1))}
              disabled={page >= maxPage}
              className="console-button-ghost px-3 py-1 rounded-full"
            >
              Next
            </button>
          </div>

        </div>

        {/* DIALOG */}
        {showDialog && (
          <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
            <div className="monitor-card p-6 rounded-2xl w-full max-w-md space-y-3">

              <h2 className="text-xl text-white capitalize">Add {showDialog}</h2>

              {showDialog === "diagnosis" && (
                <>
                  <input className="console-input w-full"
                         placeholder="Diagnosis"
                         value={diagnosisForm.diagnosis}
                         onChange={e => setDiagnosisForm({...diagnosisForm, diagnosis: e.target.value})}/>
                  <textarea className="console-input w-full"
                            placeholder="Notes"
                            value={diagnosisForm.notes}
                            onChange={e => setDiagnosisForm({...diagnosisForm, notes: e.target.value})}/>
                </>
              )}

              {showDialog === "medication" && (
                <>
                  <input className="console-input w-full"
                         placeholder="Name"
                         value={medicationForm.name}
                         onChange={e => setMedicationForm({...medicationForm, name: e.target.value})}/>
                  <input className="console-input w-full"
                         placeholder="Dosage"
                         value={medicationForm.dosage}
                         onChange={e => setMedicationForm({...medicationForm, dosage: e.target.value})}/>
                </>
              )}

              {showDialog === "allergy" && (
                <>
                  <input className="console-input w-full"
                         placeholder="Name"
                         value={allergyForm.name}
                         onChange={e => setAllergyForm({...allergyForm, name: e.target.value})}/>
                </>
              )}

              {showDialog === "condition" && (
                <select className="console-input w-full"
                        value={conditionId}
                        onChange={e => setConditionId(e.target.value)}>
                  <option value="">Select condition</option>
                  {conditions.map(c => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              )}

              <div className="flex gap-2 pt-2">
                <button onClick={() => handleSubmit(showDialog)} className="console-button-primary w-full">
                  Save
                </button>
                <button onClick={() => setShowDialog(null)} className="console-button-secondary w-full">
                  Cancel
                </button>
              </div>

            </div>
          </div>
        )}

      </div>
    </div>
  )
}