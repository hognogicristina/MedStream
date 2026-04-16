import {useCallback, useEffect, useState} from "react"
import {useParams} from "react-router-dom"
import BackButton from "../components/BackButton"
import {useNotifications} from "../components/NotificationProvider"
import {api} from "../services/api"
import {getErrorMessage, getResponseData, getResponseMessage} from "../services/apiMessages"
import DataTable from "../components/DataTable"
import {useAuth} from "../auth/AuthContext"

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

  const [conditions, setConditions] = useState([])
  const [doctors, setDoctors] = useState([])
  const [showDoctorsModal, setShowDoctorsModal] = useState(false)

  const [showDialog, setShowDialog] = useState(null)
  const [editItem, setEditItem] = useState(null)

  const [diagnosisForm, setDiagnosisForm] = useState({diagnosis: "", notes: ""})
  const [medicationForm, setMedicationForm] = useState({name: "", dosage: ""})
  const [editMedicationForm, setEditMedicationForm] = useState({dosage: "", note: ""})
  const [allergyForm, setAllergyForm] = useState({name: "", severity: "mild"})
  const [conditionId, setConditionId] = useState("")
  const [editConditionForm, setEditConditionForm] = useState({status: "", notes: ""})

  const [isLoading, setIsLoading] = useState(true)
  const {token} = useAuth()
  const [currentDoctor, setCurrentDoctor] = useState(null)
  const [allergyOptions, setAllergyOptions] = useState([])
  const [medicationOptions, setMedicationOptions] = useState([])

  useEffect(() => {
    const loadMe = async () => {
      if (!token) return
      try {
        const res = await api.get("/doctors/me", {
          headers: {Authorization: `Bearer ${token}`}
        })
        setCurrentDoctor(getResponseData(res))
      } catch {
      }
    }

    loadMe()
  }, [token])

  const loadData = useCallback(async () => {
    setIsLoading(true)

    try {
      const [patientRes, historyRes, conditionsRes, doctorsRes] = await Promise.all([
        api.get(`/patients/${id}`),
        api.get(`/patients/${id}/medical-history`),
        api.get(`/patients/${id}/conditions`),
        api.get(`/patients/${id}/doctors`)
      ])

      const [diagnosisOptRes, allergyOptRes, medOptRes] = await Promise.all([
        api.get("/options/allergies"),
        api.get("/options/medications")
      ])

      setAllergyOptions(getResponseData(allergyOptRes) || [])
      setMedicationOptions(getResponseData(medOptRes) || [])

      setPatient(getResponseData(patientRes))
      setData(getResponseData(historyRes))
      setConditions(getResponseData(conditionsRes) || [])
      setDoctors(getResponseData(doctorsRes) || [])
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
      ...(data.diagnosis || []).map(i => ({...i, type: "diagnosis", label: i.diagnosis})),
      ...(data.medications || []).map(i => ({...i, type: "medication", label: i.name})),
      ...(data.allergies || []).map(i => ({...i, type: "allergy", label: i.allergy_name})),
      ...(data.conditions || []).map(i => ({...i, type: "condition", label: i.name, doctor_id: i.doctor_id || i.assignment?.doctor_id}))
    ]

    const filtered = filter === "all" ? mapped : mapped.filter(i => i.type === filter)

    return filtered.sort((a, b) => {
      const d1 = a.scheduled_at || a.created_at || a.diagnosed_at;
      const d2 = b.scheduled_at || b.created_at || b.diagnosed_at;
      return new Date(d2) - new Date(d1);
    })
  }

  const items = buildItems()

  const patientName = patient ? `${patient.last_name} ${patient.first_name}` : "Patient"

  const handleSubmit = async (type) => {
    try {
      let response

      if (!currentDoctor) {
        notifyError("Doctor not loaded yet")
        return
      }

      if (type === "diagnosis") {
        response = await api.post(`/patients/${id}/diagnosis`, {
          ...diagnosisForm,
          doctor_id: currentDoctor.id
        })
        setDiagnosisForm({diagnosis: "", notes: ""})
      }

      if (type === "medication") {
        response = await api.post(`/patients/${id}/medication`, {
          name: medicationForm.name,
          dosage: medicationForm.dosage,
          doctor_id: currentDoctor.id
        })
        setMedicationForm({name: "", dosage: ""})
      }

      if (type === "edit_medication") {
        response = await api.patch(`/patients/medications/${editItem.id}`, {
          dosage: editMedicationForm.dosage,
          note: editMedicationForm.note,
        })
        setEditMedicationForm({dosage: "", note: ""})
      }

      if (type === "allergy") {
        response = await api.post(`/patients/${id}/allergies`, {
          allergy_name: allergyForm.name,
          severity: allergyForm.severity,
          doctor_id: currentDoctor.id
        })
        setAllergyForm({name: "", severity: "mild"})
      }

      if (type === "condition") {
        response = await api.post(`/patients/${id}/conditions`, {
          condition_id: Number(conditionId)
        })
        setConditionId("")
      }

      if (type === "edit_condition") {
        response = await api.patch(`/patients/condition/${editItem.id}`, {
          status: editConditionForm.status,
          notes: editConditionForm.notes,
          doctor_id: currentDoctor.id
        })
        setEditConditionForm({status: "", notes: ""})
      }

      notifySuccess(getResponseMessage(response))
      setShowDialog(null)
      setEditItem(null)
      loadData()
    } catch
      (e) {
      notifyError(getErrorMessage(e))
    }
  }

  const openEdit = (item) => {
    setEditItem(item)
    if (item.type === "medication") {
      setEditMedicationForm({dosage: item.dosage, note: item.last_updated_note || ""})
      setShowDialog("edit_medication")
    } else if (item.type === "condition") {
      setEditConditionForm({status: item.status, notes: item.notes || ""})
      setShowDialog("edit_condition")
    } else {
      notifyError("Editing is only supported for medications and conditions.")
    }
  }

  return (
    <div className="app-shell min-h-screen px-4 py-6 text-slate-100">
      <div className="mx-auto max-w-6xl flex flex-col gap-6">

        <header className="console-topbar rounded-3xl p-6 sm:p-8">
          <div className="space-y-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.35em] text-[#ff9900]">Medical History</p>
            </div>

            <div>
              <div className="mt-2 flex w-full items-start justify-between">
                <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                  <h1 className="text-4xl font-semibold tracking-tight text-white sm:text-5xl">{patientName}</h1>
                </div>
                <BackButton/>
              </div>

              <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
                <button
                  type="button"
                  onClick={() => setShowDoctorsModal(true)}
                  className="inline-flex w-fit px-0 py-0 text-[11px] font-semibold uppercase tracking-[0.16em] text-[#9dccff] transition hover:text-white"
                >
                  View Assigned Doctors
                </button>
              </div>

              <div className="mt-4 border-t border-[#2b3139] pt-4 overflow-x-auto min-h-[70px] custom-scrollbar">
                <div className="flex items-center gap-3 w-full pb-2">
                  <select
                    value={filter}
                    onChange={e => setFilter(e.target.value)}
                    className="console-input flex-1 min-w-[180px] px-4 py-2 rounded-full text-sm font-semibold border border-[#3b424b] bg-transparent"
                  >
                    <option value="all">All Items</option>
                    <option value="diagnosis">Diagnosis</option>
                    <option value="medication">Medication</option>
                    <option value="allergy">Allergy</option>
                    <option value="condition">Condition</option>
                  </select>
                  <div className="h-6 w-px bg-[#3b424b] mx-2"></div>
                  <div className="flex items-center gap-3 flex-wrap">
                    <button onClick={() => setShowDialog("diagnosis")}
                            className="console-button-secondary rounded-full px-4 py-2 text-sm font-semibold transition whitespace-nowrap shrink-0 hover:!bg-[#ff9900] hover:!text-[#16191f] hover:!border-[#ff9900]">Add
                      Diagnosis
                    </button>
                    <button onClick={() => setShowDialog("medication")}
                            className="console-button-secondary rounded-full px-4 py-2 text-sm font-semibold transition whitespace-nowrap shrink-0 hover:!bg-[#ff9900] hover:!text-[#16191f] hover:!border-[#ff9900]">Add
                      Medication
                    </button>
                    <button onClick={() => setShowDialog("allergy")}
                            className="console-button-secondary rounded-full px-4 py-2 text-sm font-semibold transition whitespace-nowrap shrink-0 hover:!bg-[#ff9900] hover:!text-[#16191f] hover:!border-[#ff9900]">Add
                      Allergy
                    </button>
                    <button onClick={() => setShowDialog("condition")}
                            className="console-button-secondary rounded-full px-4 py-2 text-sm font-semibold transition whitespace-nowrap shrink-0 hover:!bg-[#ff9900] hover:!text-[#16191f] hover:!border-[#ff9900]">Add
                      Condition
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </header>

        <div className="monitor-card rounded-[28px] p-6 border border-[#3b424b] mt-6">
          <DataTable
            items={items}
            loading={isLoading}
            pageSize={8}
            emptyMessage="No medical history matches current filter."
            controlsLayoutClassName="hidden"
            shellClassName="space-y-3"
            bodyClassName="space-y-3"
            getItemKey={item => `${item.type}-${item.id}`}
            renderRow={item => {
              const involvedDoctorStr = item.doctor_id
                ? doctors.find(d => d.id === item.doctor_id)?.last_name || `--`
                : (item.doctor_ids?.length ? `${item.doctor_ids.length} Doctor(s)` : `--`);

              return (
                <div className="rounded-2xl border border-[#3b424b] bg-[#151b22] px-4 py-4 flex flex-col sm:flex-row justify-between gap-4">
                  <div className="max-w-xl">
                    <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[#ffcc80] mb-1">{item.type}</p>
                    <p className="text-sm font-semibold text-white">{item.label}</p>
                    {(item.description || item.notes || item.dosage) && (
                      <p className="text-sm text-[#b6bec9] mt-1">{item.description || item.notes || item.dosage}</p>
                    )}
                    {(item.last_updated_note || item.status_note) && (
                      <p className="text-xs text-[#879196] mt-2 italic shadow-inner bg-[#0f141a] px-3 py-2 rounded-md">Update
                        Note: {item.last_updated_note || item.status_note}</p>
                    )}
                    {(item.status || item.severity) && (
                      <span
                        className={`inline-block mt-3 px-2 py-0.5 rounded text-xs font-medium uppercase tracking-wider ${['severe', 'worsened', 'critical'].includes((item.status || item.severity).toLowerCase()) ? 'bg-[#3b1010] text-[#fecaca] border border-[#7f1d1d]' : 'bg-[#0e2519] text-[#bbf7d0] border border-[#1f4d36]'
                        }`}>
                        {item.status || item.severity}
                      </span>
                    )}
                  </div>

                  <div className="flex sm:flex-col justify-between sm:justify-end items-end gap-3 text-right">
                    <div>
                      <span
                        className="block text-xs uppercase tracking-wider text-[#879196] font-medium mb-1">Doc: {involvedDoctorStr}</span>
                      <span
                        className="block text-xs text-[#879196]">{formatDateTime(item.scheduled_at || item.created_at || item.diagnosed_at)}</span>
                    </div>

                    {['medication', 'condition'].includes(item.type) && (
                      <button
                        onClick={() => openEdit(item)}
                        className="console-button-secondary rounded-xl text-xs font-semibold px-3 py-1.5 transition mt-2"
                      >
                        Update
                      </button>
                    )}
                  </div>
                </div>
              )
            }}
          />
        </div>

        {showDialog && (
          <div className="console-modal-overlay">
            <div className="console-modal monitor-card rounded-[28px] p-6 w-full max-w-md space-y-3">

              <h2 className="text-xl text-white capitalize">
                {showDialog.startsWith("edit_") ? `Update ${showDialog.replace("edit_", "")}` : `Add ${showDialog}`}
              </h2>

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
                  <select
                    className="console-input w-full"
                    value={medicationForm.name}
                    onChange={e => setMedicationForm({...medicationForm, name: e.target.value})}
                  >
                    <option value="">Select medication</option>
                    {medicationOptions.map(m => (
                      <option key={m} value={m}>{m}</option>
                    ))}
                  </select>
                  <input className="console-input w-full"
                         placeholder="Dosage"
                         value={medicationForm.dosage}
                         onChange={e => setMedicationForm({...medicationForm, dosage: e.target.value})}/>
                </>
              )}

              {showDialog === "allergy" && (
                <>
                  <select
                    className="console-input w-full"
                    value={allergyForm.name}
                    onChange={e => setAllergyForm({...allergyForm, name: e.target.value})}
                  >
                    <option value="">Select allergy</option>
                    {allergyOptions.map(a => (
                      <option key={a} value={a}>{a}</option>
                    ))}
                  </select>
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

              {showDialog === "edit_medication" && (
                <>
                  <input className="console-input w-full"
                         placeholder="Pills/Day, ml, etc."
                         value={editMedicationForm.dosage}
                         onChange={e => setEditMedicationForm({...editMedicationForm, dosage: e.target.value})}/>
                  <textarea className="console-input w-full"
                            placeholder="Recent progress notes..."
                            value={editMedicationForm.note}
                            onChange={e => setEditMedicationForm({...editMedicationForm, note: e.target.value})}/>
                </>
              )}

              {showDialog === "edit_condition" && (
                <>
                  <input className="console-input w-full"
                         placeholder="Status: Stable, Worsened, etc."
                         value={editConditionForm.status}
                         onChange={e => setEditConditionForm({...editConditionForm, status: e.target.value})}/>
                  <textarea className="console-input w-full"
                            placeholder="Recent progress notes..."
                            value={editConditionForm.notes}
                            onChange={e => setEditConditionForm({...editConditionForm, notes: e.target.value})}/>
                </>
              )}
            </div>
          </div>
        )}

        {showDoctorsModal && (
          <div className="console-modal-overlay z-50">
            <div className="console-modal monitor-card rounded-[28px] p-6 w-[600px] max-w-full">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-semibold text-white">Assigned Doctors</h2>
                <button onClick={() => setShowDoctorsModal(false)}
                        className="console-button-secondary px-3 py-1.5 rounded-xl text-sm">Close
                </button>
              </div>
              <DataTable
                items={doctors}
                loading={isLoading}
                pageSize={100}
                controlsLayoutClassName="hidden"
                emptyMessage="No doctors are assigned."
                getItemKey={d => d.id}
                shellClassName="space-y-3"
                bodyClassName="space-y-3"
                renderRow={d => (
                  <div
                    className="rounded-2xl border border-[#3b424b] bg-[#151b22] px-4 py-3 flex flex-col sm:flex-row justify-between items-start sm:items-center">
                    <div>
                      <p className="text-sm font-semibold text-white">Dr. {d.first_name} {d.last_name}</p>
                      <p className="text-xs uppercase tracking-[0.2em] text-[#ffcc80] mt-1">{d.specialization}</p>
                    </div>
                    <p className="text-sm text-[#b6bec9] font-medium">{d.email}</p>
                  </div>
                )}
              />
            </div>
          </div>
        )}

      </div>
    </div>
  )
}