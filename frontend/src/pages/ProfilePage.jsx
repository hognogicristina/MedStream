import {useEffect, useMemo, useState} from "react"
import {Link, useNavigate} from "react-router-dom"
import BackButton from "../components/BackButton"
import CountValue from "../components/CountValue"
import {useNotifications} from "../components/NotificationProvider"
import {useAuth} from "../auth/AuthContext"
import {api} from "../services/api"
import {formatPatientFullName} from "../utils/patients"

const buildDoctorProfileForm = (doctor) => ({
  first_name: doctor?.first_name || "",
  last_name: doctor?.last_name || "",
  specialization: doctor?.specialization || "",
  license_number: doctor?.license_number || "",
  phone_number: doctor?.phone_number || "",
})

export default function ProfilePage() {
  const navigate = useNavigate()
  const {notifyError, notifySuccess} = useNotifications()
  const {token, logout} = useAuth()
  const [doctor, setDoctor] = useState(null)
  const [patients, setPatients] = useState([])
  const [assignedPatients, setAssignedPatients] = useState([])
  const [form, setForm] = useState({
    first_name: "",
    last_name: "",
    specialization: "",
    license_number: "",
    phone_number: "",
  })
  const [selectedPatientId, setSelectedPatientId] = useState("")
  const [isLoading, setIsLoading] = useState(true)
  const [isSavingProfile, setIsSavingProfile] = useState(false)
  const [isAssigningPatient, setIsAssigningPatient] = useState(false)
  const [removingPatientId, setRemovingPatientId] = useState(null)
  const [isDeletingAccount, setIsDeletingAccount] = useState(false)
  const [showDeleteModal, setShowDeleteModal] = useState(false)
  const [removePatientAssignmentsOnDelete, setRemovePatientAssignmentsOnDelete] = useState(false)

  const authHeaders = useMemo(() => ({
    Authorization: `Bearer ${token}`,
  }), [token])

  useEffect(() => {
    const loadWorkspace = async () => {
      if (!token) {
        notifyError("No authenticated doctor session is available.")
        setIsLoading(false)
        return
      }

      setIsLoading(true)

      try {
        const doctorResponse = await api.get("/doctors/me", {
          headers: authHeaders,
        })
        const currentDoctor = doctorResponse.data
        const [assignedPatientsResponse, patientsResponse] = await Promise.all([
          api.get(`/doctors/${currentDoctor.id}/patients`),
          api.get("/patients?page=1&limit=100"),
        ])

        setDoctor(currentDoctor)
        setAssignedPatients(assignedPatientsResponse.data)
        setPatients(patientsResponse.data)
        setForm(buildDoctorProfileForm(currentDoctor))
      } catch (error) {
        setDoctor(null)
        setAssignedPatients([])
        setPatients([])
        notifyError(error.response?.data?.detail || "Unable to load doctor workspace.")
      } finally {
        setIsLoading(false)
      }
    }

    loadWorkspace()
  }, [authHeaders, notifyError, token])

  const availablePatients = patients.filter(
    (patient) => !assignedPatients.some((assignedPatient) => assignedPatient.id === patient.id),
  )
  const isProfileFormValid = Boolean(
    form.first_name.trim()
    && form.last_name.trim()
    && form.specialization.trim()
    && form.license_number.trim(),
  )
  const initialProfileForm = buildDoctorProfileForm(doctor)
  const isProfileDirty = Object.keys(initialProfileForm).some((key) => form[key] !== initialProfileForm[key])

  const handleFormChange = (event) => {
    const {name, value} = event.target
    setForm((current) => ({
      ...current,
      [name]: value,
    }))
  }

  const handleProfileUpdate = async (event) => {
    event.preventDefault()
    if (!doctor || !isProfileFormValid || !isProfileDirty || isSavingProfile) {
      return
    }

    setIsSavingProfile(true)

    try {
      const payload = {
        first_name: form.first_name,
        last_name: form.last_name,
        specialization: form.specialization,
        license_number: form.license_number,
        phone_number: form.phone_number.trim() || null,
      }

      const response = await api.patch("/doctors/me", payload, {
        headers: authHeaders,
      })

      setDoctor(response.data)
      setForm(buildDoctorProfileForm(response.data))
      notifySuccess("Doctor profile updated.")
    } catch (error) {
      notifyError(error.response?.data?.detail || "Unable to update doctor profile.")
    } finally {
      setIsSavingProfile(false)
    }
  }

  const handleAssignPatient = async (event) => {
    event.preventDefault()
    if (!doctor || !selectedPatientId) {
      return
    }

    setIsAssigningPatient(true)

    try {
      const response = await api.post(`/doctors/${doctor.id}/patients/${selectedPatientId}`)
      setAssignedPatients(response.data)
      setSelectedPatientId("")
      notifySuccess("Patient assigned to doctor.")
    } catch (error) {
      notifyError(error.response?.data?.detail || "Unable to assign patient.")
    } finally {
      setIsAssigningPatient(false)
    }
  }

  const handleRemovePatient = async (patientId) => {
    if (!doctor) {
      return
    }

    setRemovingPatientId(patientId)

    try {
      const response = await api.delete(`/doctors/${doctor.id}/patients/${patientId}`)
      setAssignedPatients(response.data)
      notifySuccess("Patient removed from doctor.")
    } catch (error) {
      notifyError(error.response?.data?.detail || "Unable to remove patient.")
    } finally {
      setRemovingPatientId(null)
    }
  }

  const handleDeleteAccount = async () => {
    if (!doctor) {
      return
    }

    setIsDeletingAccount(true)

    try {
      const response = await api.delete(`/doctors/${doctor.id}`, {
        data: {
          remove_patient_assignments: removePatientAssignmentsOnDelete,
        },
      })
      setDoctor(response.data)
      if (removePatientAssignmentsOnDelete) {
        setAssignedPatients([])
      }
      notifySuccess("Doctor account deactivated.")
      setShowDeleteModal(false)
      logout()
      navigate("/")
    } catch (error) {
      notifyError(error.response?.data?.detail || "Unable to deactivate doctor account.")
      setIsDeletingAccount(false)
    }
  }

  return (
    <div className="app-shell min-h-screen px-4 py-6 text-slate-100 sm:px-6 lg:px-8">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6">
        <header className="console-topbar rounded-[24px] p-6 sm:p-8">
          <div className="flex flex-col gap-4">
            <div className="flex items-start justify-between gap-4">
              <p className="text-xs font-semibold uppercase tracking-[0.35em] text-[#ff9900]">Doctor Workspace</p>
              <BackButton/>
            </div>
            <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <h1 className="text-3xl font-semibold tracking-tight text-white sm:text-4xl">Doctor Control Panel</h1>
                <p className="mt-2 max-w-2xl text-sm text-[#b6bec9] sm:text-base">Manage profile details, patient assignments, and account
                  status from one workspace.</p>
              </div>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                <div className="monitor-panel rounded-2xl p-4">
                  <p className="text-xs uppercase tracking-[0.25em] text-[#879196]">Status</p>
                  <p className="mt-3 text-lg font-semibold text-white">{doctor ? (doctor.is_active ? "Active" : "Inactive") : "--"}</p>
                </div>
                <div className="monitor-panel rounded-2xl p-4">
                  <p className="text-xs uppercase tracking-[0.25em] text-[#879196]">Assigned</p>
                  <p className="mt-3 text-lg font-semibold text-white"><CountValue value={assignedPatients.length}/></p>
                </div>
                <div className="monitor-panel rounded-2xl p-4 sm:col-span-2 lg:col-span-1">
                  <p className="text-xs uppercase tracking-[0.25em] text-[#879196]">Available</p>
                  <p className="mt-3 text-lg font-semibold text-white"><CountValue value={availablePatients.length}/></p>
                </div>
              </div>
            </div>
          </div>
        </header>

        {isLoading ? (
          <section className="monitor-card rounded-[28px] p-6">
            <div className="rounded-2xl border border-[#3b424b] bg-[#151b22] px-4 py-5 text-sm text-[#b6bec9]">
              Loading doctor workspace...
            </div>
          </section>
        ) : doctor ? (
          <section className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
            <div className="grid gap-6">
              <section className="monitor-card rounded-[28px] p-6">
                <div className="mb-6 flex items-center justify-between gap-4">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.3em] text-[#ff9900]">Profile</p>
                    <h2 className="mt-2 text-2xl font-semibold text-white">Editable Doctor Info</h2>
                  </div>
                  <span
                    className={`rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] ${doctor.is_active ? "console-chip-success" : "console-chip-danger"}`}>
                    {doctor.is_active ? "Active" : "Inactive"}
                  </span>
                </div>

                <form className="space-y-5" onSubmit={handleProfileUpdate}>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="login-field">
                      <label className="login-label" htmlFor="first_name">First Name</label>
                      <input id="first_name" name="first_name" type="text" value={form.first_name} onChange={handleFormChange}
                             className="login-input" required/>
                    </div>
                    <div className="login-field">
                      <label className="login-label" htmlFor="last_name">Last Name</label>
                      <input id="last_name" name="last_name" type="text" value={form.last_name} onChange={handleFormChange}
                             className="login-input" required/>
                    </div>
                  </div>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="login-field">
                      <label className="login-label" htmlFor="specialization">Specialization</label>
                      <input id="specialization" name="specialization" type="text" value={form.specialization} onChange={handleFormChange}
                             className="login-input" required/>
                    </div>
                    <div className="login-field">
                      <label className="login-label" htmlFor="license_number">License Number</label>
                      <input id="license_number" name="license_number" type="text" value={form.license_number} onChange={handleFormChange}
                             className="login-input" required/>
                    </div>
                  </div>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="login-field">
                      <label className="login-label" htmlFor="phone_number">Phone Number</label>
                      <input id="phone_number" name="phone_number" type="text" value={form.phone_number} onChange={handleFormChange}
                             className="login-input" placeholder="Optional phone number"/>
                    </div>
                    <div className="login-field">
                      <label className="login-label" htmlFor="email">Email</label>
                      <input id="email" type="email" value={doctor.email} className="login-input opacity-70" disabled/>
                    </div>
                  </div>

                  <div className="flex justify-end">
                    <button type="submit" disabled={!isProfileFormValid || !isProfileDirty || isSavingProfile}
                            className="console-button-primary rounded-2xl px-5 py-3 text-sm font-semibold disabled:cursor-not-allowed disabled:border-[#4d5661] disabled:bg-[#3b424b] disabled:text-[#b6bec9]">
                      {isSavingProfile ? "Updating..." : "Update Profile"}
                    </button>
                  </div>
                </form>
              </section>

              <section className="monitor-card rounded-[28px] p-6">
                <div className="mb-6 flex items-center justify-between gap-4">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.3em] text-[#ff9900]">Patients</p>
                    <h2 className="mt-2 text-2xl font-semibold text-white">Assigned Patients</h2>
                  </div>
                  <span className="console-chip rounded-full px-3 py-1 text-xs font-semibold">
                    <CountValue value={assignedPatients.length}/>
                  </span>
                </div>

                <ul className="space-y-3">
                  {assignedPatients.length === 0 && (
                    <li className="rounded-2xl border border-[#3b424b] bg-[#151b22] px-4 py-5 text-sm text-[#b6bec9]">
                      No patients are currently assigned to this doctor.
                    </li>
                  )}
                  {assignedPatients.map((patient) => (
                    <li key={patient.id} className="rounded-2xl border border-[#3b424b] bg-[#151b22] p-4">
                      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                        <div>
                          <Link className="console-link text-base font-semibold transition" to={`/patient/${patient.id}`}>
                            {formatPatientFullName(patient)}
                          </Link>
                          <p className="mt-2 text-xs uppercase tracking-[0.22em] text-[#879196]">{patient.department}</p>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleRemovePatient(patient.id)}
                          disabled={removingPatientId === patient.id}
                          className="console-button-secondary rounded-2xl px-4 py-2.5 text-sm font-semibold disabled:cursor-not-allowed disabled:border-[#4d5661] disabled:bg-[#3b424b] disabled:text-[#b6bec9]"
                        >
                          {removingPatientId === patient.id ? "Removing..." : "Remove Patient"}
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              </section>
            </div>

            <div className="grid gap-6">
              <section className="monitor-card rounded-[28px] p-6">
                <div className="mb-6">
                  <p className="text-xs font-semibold uppercase tracking-[0.3em] text-[#ff9900]">Assignment</p>
                  <h2 className="mt-2 text-2xl font-semibold text-white">Assign Patient</h2>
                </div>

                <form className="space-y-4" onSubmit={handleAssignPatient}>
                  <div className="login-field">
                    <label className="login-label" htmlFor="assigned_patient">Available Patient</label>
                    <select id="assigned_patient" value={selectedPatientId} onChange={(event) => setSelectedPatientId(event.target.value)}
                            className="login-input" disabled={availablePatients.length === 0 || isAssigningPatient}>
                      <option value="">Select patient</option>
                      {availablePatients.map((patient) => (
                        <option key={patient.id} value={patient.id}>
                          {formatPatientFullName(patient)} | {patient.department}
                        </option>
                      ))}
                    </select>
                  </div>

                  <button
                    type="submit"
                    disabled={!selectedPatientId || isAssigningPatient}
                    className="console-button-primary w-full rounded-2xl px-4 py-3 font-semibold disabled:cursor-not-allowed disabled:border-[#4d5661] disabled:bg-[#3b424b] disabled:text-[#b6bec9]"
                  >
                    {isAssigningPatient ? "Assigning..." : "Assign Patient"}
                  </button>
                </form>
              </section>

              <section className="monitor-card rounded-[28px] p-6">
                <div className="mb-6">
                  <p className="text-xs font-semibold uppercase tracking-[0.3em] text-[#ff9900]">Account</p>
                  <h2 className="mt-2 text-2xl font-semibold text-white">Account Status</h2>
                </div>

                <div className="space-y-4">
                  <div className="rounded-2xl border border-[#3b424b] bg-[#151b22] p-4">
                    <p className="text-xs uppercase tracking-[0.22em] text-[#879196]">Current State</p>
                    <p
                      className="mt-2 text-lg font-semibold text-white">{doctor.is_active ? "Active doctor account" : "Inactive doctor account"}</p>
                    <p className="mt-2 text-sm text-[#b6bec9]">
                      {doctor.deleted_at ? `Deactivated at ${new Date(doctor.deleted_at).toLocaleString()}` : "Account is available for normal login and patient management."}
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={() => setShowDeleteModal(true)}
                    disabled={isDeletingAccount}
                    className="w-full rounded-2xl border border-[#a33a45] bg-[#3a1f25] px-4 py-3 text-sm font-semibold text-[#ffd8dc] transition hover:bg-[#47262d] disabled:cursor-not-allowed disabled:border-[#4d5661] disabled:bg-[#3b424b] disabled:text-[#b6bec9]"
                  >
                    {isDeletingAccount ? "Deactivating..." : "Delete Account"}
                  </button>
                </div>
              </section>
            </div>
          </section>
        ) : (
          <section className="monitor-card rounded-[28px] p-6">
            <div className="rounded-2xl border border-[#3b424b] bg-[#151b22] px-4 py-5 text-sm text-[#b6bec9]">
              No doctor workspace information is available for this session.
            </div>
          </section>
        )}

        {showDeleteModal && (
          <div className="console-modal-overlay">
            <div className="console-modal monitor-card rounded-[28px] p-6">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.3em] text-[#ff9900]">Account Deactivation</p>
                  <h2 className="mt-2 text-2xl font-semibold text-white">Deactivate Doctor Account</h2>
                </div>
                <button
                  type="button"
                  onClick={() => setShowDeleteModal(false)}
                  className="console-button-secondary rounded-xl px-3 py-2 text-sm font-semibold"
                >
                  Cancel
                </button>
              </div>

              <div className="mt-5 rounded-2xl border border-[#3b424b] bg-[#151b22] p-4">
                <p className="text-sm text-[#d5dbdb]">
                  This action deactivates the doctor account. The doctor record remains in MedStream and can be restored later.
                </p>
              </div>

              <div className="mt-5 space-y-3">
                <label
                  className={`block rounded-2xl border px-4 py-4 ${!removePatientAssignmentsOnDelete ? "border-[#ff9900] bg-[#1b2430]" : "border-[#3b424b] bg-[#151b22]"}`}>
                  <div className="flex items-start gap-3">
                    <input
                      type="radio"
                      name="patient_assignment_strategy"
                      checked={!removePatientAssignmentsOnDelete}
                      onChange={() => setRemovePatientAssignmentsOnDelete(false)}
                      className="mt-1"
                    />
                    <div>
                      <p className="text-sm font-semibold text-white">Keep patient assignments</p>
                      <p className="mt-1 text-sm text-[#b6bec9]">Assigned patients remain linked to this inactive doctor.</p>
                    </div>
                  </div>
                </label>

                <label
                  className={`block rounded-2xl border px-4 py-4 ${removePatientAssignmentsOnDelete ? "border-[#ff9900] bg-[#1b2430]" : "border-[#3b424b] bg-[#151b22]"}`}>
                  <div className="flex items-start gap-3">
                    <input
                      type="radio"
                      name="patient_assignment_strategy"
                      checked={removePatientAssignmentsOnDelete}
                      onChange={() => setRemovePatientAssignmentsOnDelete(true)}
                      className="mt-1"
                    />
                    <div>
                      <p className="text-sm font-semibold text-white">Remove all patient assignments</p>
                      <p className="mt-1 text-sm text-[#b6bec9]">All doctor-patient links will be removed before the account is
                        deactivated.</p>
                    </div>
                  </div>
                </label>
              </div>

              <div className="mt-6 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setShowDeleteModal(false)}
                  className="console-button-secondary rounded-2xl px-4 py-3 text-sm font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleDeleteAccount}
                  disabled={isDeletingAccount}
                  className="rounded-2xl border border-[#a33a45] bg-[#3a1f25] px-4 py-3 text-sm font-semibold text-[#ffd8dc] transition hover:bg-[#47262d] disabled:cursor-not-allowed disabled:border-[#4d5661] disabled:bg-[#3b424b] disabled:text-[#b6bec9]"
                >
                  {isDeletingAccount ? "Deactivating..." : "Confirm"}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
