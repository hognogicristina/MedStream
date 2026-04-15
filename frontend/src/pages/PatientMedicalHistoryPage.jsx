import {useCallback, useEffect, useState} from "react"
import {useParams} from "react-router-dom"
import BackButton from "../components/BackButton"
import {useNotifications} from "../components/NotificationProvider"
import {api} from "../services/api"
import {getErrorMessage, getResponseData, getResponseMessage} from "../services/apiMessages"
import DataTable from "../components/DataTable"

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
  const [activityForm, setActivityForm] = useState({title: "", description: "", type: "appointment", scheduled_at: "", doctor_ids: []})

  const [isLoading, setIsLoading] = useState(true)

  const loadData = useCallback(async () => {
    setIsLoading(true)

    try {
      const [patientRes, historyRes, conditionsRes, doctorsRes] = await Promise.all([
        api.get(`/patients/${id}`),
        api.get(`/patients/${id}/medical-history`),
        api.get(`/patients/${id}/conditions`),
        api.get(`/patients/${id}/doctors`)
      ])

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
      ...(data.activities || []).map(i => ({...i, type: "activity", label: i.title})),
      ...(data.diagnosis || []).map(i => ({...i, type: "diagnosis", label: i.diagnosis})),
      ...(data.medications || []).map(i => ({...i, type: "medication", label: i.name})),
      ...(data.allergies || []).map(i => ({...i, type: "allergy", label: i.allergy_name})),
      ...(data.conditions || []).map(i => ({...i, type: "condition", label: i.name})),
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

      if (type === "diagnosis") {
        response = await api.post(`/patients/${id}/diagnosis`, diagnosisForm)
        setDiagnosisForm({diagnosis: "", notes: ""})
      }

      if (type === "medication") {
        response = await api.post(`/patients/${id}/medication`, {
          name: medicationForm.name,
          dosage: medicationForm.dosage,
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
        })
        setAllergyForm({name: "", severity: "mild"})
      }

      if (type === "condition") {
        response = await api.post(`/patients/${id}/conditions`, {
          condition_id: Number(conditionId),
        })
        setConditionId("")
      }

      if (type === "edit_condition") {
        response = await api.patch(`/patients/condition/${editItem.id}`, {
          status: editConditionForm.status,
          notes: editConditionForm.notes,
        })
        setEditConditionForm({status: "", notes: ""})
      }

      if (type === "activity") {
        if (activityForm.doctor_ids.length === 0) {
          notifyError("Select at least one doctor.")
          return
        }
        const mainDoctorId = activityForm.doctor_ids[0]
        response = await api.post(`/doctors/${mainDoctorId}/activities`, {
            title: activityForm.title,
            description: activityForm.description,
            type: activityForm.type,
            scheduled_at: activityForm.scheduled_at,
            doctor_ids: activityForm.doctor_ids,
            patient_ids: [Number(id)],
        })
        setActivityForm({title: "", description: "", type: "appointment", scheduled_at: "", doctor_ids: []})
      }

      notifySuccess(getResponseMessage(response))
      setShowDialog(null)
      setEditItem(null)
      loadData()
    } catch (e) {
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

              <div className="mt-4 border-t border-[#2b3139] pt-4">
                <div className="flex flex-wrap items-center gap-2">
                  <select
                    value={filter}
                    onChange={e => {
                       setFilter(e.target.value)
                    }}
                    className="console-input w-auto min-w-[140px] px-4 py-2 rounded-full text-sm font-semibold border border-[#3b424b] bg-transparent"
                  >
                    <option value="all">All Items</option>
                    <option value="diagnosis">Diagnosis</option>
                    <option value="medication">Medication</option>
                    <option value="allergy">Allergy</option>
                    <option value="condition">Condition</option>
                    <option value="activity">Activity</option>
                  </select>
                  <div className="h-6 w-px bg-[#3b424b] mx-2"></div>
                  <button onClick={() => setShowDialog("activity")} className="console-button-secondary rounded-full px-4 py-2 text-sm font-semibold transition hover:bg-opacity-80">Add Activity</button>
                  <button onClick={() => setShowDialog("diagnosis")} className="console-button-secondary rounded-full px-4 py-2 text-sm font-semibold transition hover:bg-opacity-80">Add Diagnosis</button>
                  <button onClick={() => setShowDialog("medication")} className="console-button-secondary rounded-full px-4 py-2 text-sm font-semibold transition hover:bg-opacity-80">Add Medication</button>
                  <button onClick={() => setShowDialog("allergy")} className="console-button-secondary rounded-full px-4 py-2 text-sm font-semibold transition hover:bg-opacity-80">Add Allergy</button>
                  <button onClick={() => setShowDialog("condition")} className="console-button-secondary rounded-full px-4 py-2 text-sm font-semibold transition hover:bg-opacity-80">Add Condition</button>
                </div>
              </div>
            </div>
          </div>
        </header>

        {/* LIST */}
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
                    <p className="text-xs text-[#879196] mt-2 italic shadow-inner bg-[#0f141a] px-3 py-2 rounded-md">Update Note: {item.last_updated_note || item.status_note}</p>
                  )}
                  {(item.status || item.severity) && (
                    <span className={`inline-block mt-3 px-2 py-0.5 rounded text-xs font-medium uppercase tracking-wider ${
                       ['severe', 'worsened', 'critical'].includes((item.status || item.severity).toLowerCase()) ? 'bg-[#3b1010] text-[#fecaca] border border-[#7f1d1d]' : 'bg-[#0e2519] text-[#bbf7d0] border border-[#1f4d36]'
                    }`}>
                       {item.status || item.severity}
                    </span>
                  )}
                </div>

                <div className="flex sm:flex-col justify-between sm:justify-end items-end gap-3 text-right">
                  <div>
                    <span className="block text-xs uppercase tracking-wider text-[#879196] font-medium mb-1">Doc: {involvedDoctorStr}</span>
                    <span className="block text-xs text-[#879196]">{formatDateTime(item.scheduled_at || item.created_at || item.diagnosed_at)}</span>
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
            )}}
          />
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

              {showDialog === "activity" && (
                <>
                  <input className="console-input w-full"
                         placeholder="Activity Title"
                         value={activityForm.title}
                         onChange={e => setActivityForm({...activityForm, title: e.target.value})}/>
                  <textarea className="console-input w-full"
                         placeholder="Activity Description"
                         value={activityForm.description}
                         onChange={e => setActivityForm({...activityForm, description: e.target.value})}/>
                  <select className="console-input w-full"
                          value={activityForm.type}
                          onChange={e => setActivityForm({...activityForm, type: e.target.value})}>
                     <option value="appointment">Appointment</option>
                     <option value="intervention">Intervention</option>
                     <option value="surgery">Surgery</option>
                  </select>
                  <label className="text-sm text-[#b6bec9]">Scheduled Datetime</label>
                  <input className="console-input w-full" type="datetime-local"
                         value={activityForm.scheduled_at}
                         onChange={e => setActivityForm({...activityForm, scheduled_at: e.target.value})}/>
                  
                  <div className="flex flex-col gap-2 max-h-40 overflow-y-auto custom-scrollbar">
                     <span className="text-sm text-[#ff9900]">Involved Doctors</span>
                     {doctors.length === 0 && <p className="text-sm text-[#b6bec9]">No doctors assigned to patient. Cannot create activity.</p>}
                     {doctors.map(d => (
                       <label key={d.id} className="flex gap-2 items-center text-sm font-medium">
                          <input type="checkbox" checked={activityForm.doctor_ids.includes(d.id)}
                            onChange={(e) => {
                               const ids = new Set(activityForm.doctor_ids);
                               if (e.target.checked) ids.add(d.id); else ids.delete(d.id);
                               setActivityForm({...activityForm, doctor_ids: Array.from(ids)});
                            }}
                          />
                          {d.first_name} {d.last_name} - {d.specialization}
                       </label>
                     ))}
                  </div>
                </>
              )}

              <div className="flex gap-2 pt-2">
                <button onClick={() => handleSubmit(showDialog)} disabled={showDialog === 'activity' && activityForm.doctor_ids.length === 0} className="console-button-primary w-full px-4 py-2 rounded-xl text-sm font-semibold disabled:opacity-50">
                  Save
                </button>
                <button onClick={() => {setShowDialog(null); setEditItem(null);}} className="console-button-secondary w-full px-4 py-2 rounded-xl text-sm font-semibold">
                  Cancel
                </button>
              </div>

            </div>
          </div>
        )}

        {showDoctorsModal && (
           <div className="console-modal-overlay z-50">
             <div className="console-modal monitor-card rounded-[28px] p-6 w-[600px] max-w-full">
               <div className="flex items-center justify-between mb-4">
                 <h2 className="text-xl font-semibold text-white">Assigned Doctors</h2>
                 <button onClick={() => setShowDoctorsModal(false)} className="console-button-secondary px-3 py-1.5 rounded-xl text-sm">Close</button>
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
                    <div className="rounded-2xl border border-[#3b424b] bg-[#151b22] px-4 py-3 flex flex-col sm:flex-row justify-between items-start sm:items-center">
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