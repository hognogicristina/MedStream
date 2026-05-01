import {useEffect, useMemo, useState, useRef} from "react"
import {Link, useNavigate} from "react-router-dom"
import ActivityList from "../components/ActivityList.jsx"
import BackButton from "../components/BackButton.jsx"
import CountValue from "../components/CountValue.jsx"
import DataTable from "../components/DataTable.jsx"
import ActivityDialog from "../components/ActivityDialog.jsx"
import {useNotifications} from "../components/NotificationProvider.jsx"
import {useAuth} from "../components/AuthContext.jsx"
import {api} from "../services/doctorApi.js"
import {getErrorMessage, getResponseData, getResponseMessage} from "../services/apiMessages.js"
import {formatPatientFullName} from "../utils/patients.js"
import {buildPatientPhoneNumber, normalizeRomanianPhoneNumber, ROMANIA_PHONE_PLACEHOLDER} from "../utils/patientPhone.js"

const buildDoctorProfileForm = (doctor) => ({
  first_name: doctor?.first_name || "",
  last_name: doctor?.last_name || "",
  specialization: doctor?.specialization || "",
  license_number: doctor?.license_number || "",
  birth_date: doctor?.birth_date || "",
})

function normalizeActivity(activity, patientOptions = [], doctorOptions = []) {
  const patientIds = Array.isArray(activity.patient_ids) ? activity.patient_ids : []
  const doctorIds = Array.isArray(activity.doctor_ids) ? activity.doctor_ids : []
  const fallbackPatientsById = new Map(patientOptions.map((patient) => [patient.id, patient]))
  const fallbackDoctorsById = new Map(doctorOptions.map((doctor) => [doctor.id, doctor]))
  const patients = Array.isArray(activity.patients) && activity.patients.length > 0
    ? activity.patients
    : patientIds.map((patientId) => {
      const patient = fallbackPatientsById.get(patientId)
      return patient
        ? {id: patient.id, first_name: patient.first_name, last_name: patient.last_name}
        : null
    }).filter(Boolean)
  const doctors = Array.isArray(activity.doctors) && activity.doctors.length > 0
    ? activity.doctors
    : doctorIds.map((doctorId) => {
      const doctor = fallbackDoctorsById.get(doctorId)
      return doctor
        ? {id: doctor.id, first_name: doctor.first_name, last_name: doctor.last_name}
        : null
    }).filter(Boolean)

  return {
    ...activity,
    patient_ids: patientIds,
    doctor_ids: doctorIds,
    patients,
    doctors,
  }
}

export default function ProfilePage() {
  const navigate = useNavigate()
  const {notifyError, notifySuccess} = useNotifications()
  const {token, logout} = useAuth()
  const [doctor, setDoctor] = useState(null)
  const [patients, setPatients] = useState([])
  const [assignedPatients, setAssignedPatients] = useState([])
  const [activities, setActivities] = useState([])
  const [allDoctors, setAllDoctors] = useState([])
  const [departments, setDepartments] = useState([])
  const [activityTypes, setActivityTypes] = useState([])
  const [form, setForm] = useState({
    first_name: "",
    last_name: "",
    specialization: "",
    license_number: "",
    birth_date: "",
  })
  const [phoneNumber, setPhoneNumber] = useState("")
  const [emailInput, setEmailInput] = useState("")
  const [assignmentQuery, setAssignmentQuery] = useState("")
  const [isLoading, setIsLoading] = useState(true)
  const [isSavingProfile, setIsSavingProfile] = useState(false)
  const [isSavingEmail, setIsSavingEmail] = useState(false)
  const [isResendingVerification, setIsResendingVerification] = useState(false)
  const [isAssigningPatient, setIsAssigningPatient] = useState(false)
  const [removingPatientId, setRemovingPatientId] = useState(null)
  const [isTransferringPatient, setIsTransferringPatient] = useState(false)
  const [isLoadingTransferDoctors, setIsLoadingTransferDoctors] = useState(false)
  const [patientPendingRemoval, setPatientPendingRemoval] = useState(null)
  const [patientPendingTransfer, setPatientPendingTransfer] = useState(null)
  const [transferDoctorOptions, setTransferDoctorOptions] = useState([])
  const [selectedTransferDoctorId, setSelectedTransferDoctorId] = useState("")
  const [patientDoctorCounts, setPatientDoctorCounts] = useState({})
  const [isDeletingAccount, setIsDeletingAccount] = useState(false)
  const [showDeleteModal, setShowDeleteModal] = useState(false)
  const [isActivityDialogOpen, setIsActivityDialogOpen] = useState(false)
  const [isSubmittingActivity, setIsSubmittingActivity] = useState(false)
  const [activityDialogMode, setActivityDialogMode] = useState("create")
  const [selectedActivity, setSelectedActivity] = useState(null)
  const [activityPendingCancellation, setActivityPendingCancellation] = useState(null)
  const [isAssignDropdownOpen, setIsAssignDropdownOpen] = useState(false)
  const assignInputRef = useRef(null)
  const [activityPage, setActivityPage] = useState(1)
  const ACTIVITY_PAGE_SIZE = 2
  const paginatedActivities = useMemo(() => {
    const start = (activityPage - 1) * ACTIVITY_PAGE_SIZE
    return activities.slice(start, start + ACTIVITY_PAGE_SIZE)
  }, [activities, activityPage])
  const totalActivityPages = Math.ceil(activities.length / ACTIVITY_PAGE_SIZE)

  const authHeaders = useMemo(() => ({
    Authorization: `Bearer ${token}`,
  }), [token])
  const hasAssignedPatients = assignedPatients.length > 0
  const isOnlyDoctorInDepartment = Boolean(
    doctor
    && allDoctors.filter((item) => item.is_active && item.specialization === doctor.specialization).length <= 1,
  )

  const loadAssignedDoctorCounts = async (patientsList) => {
    if (!Array.isArray(patientsList) || patientsList.length === 0) {
      setPatientDoctorCounts({})
      return
    }

    const entries = await Promise.all(patientsList.map(async (patient) => {
      try {
        const response = await api.get(`/patients/${patient.id}/doctors`)
        const doctorsList = getResponseData(response) || []
        return [patient.id, doctorsList.length]
      } catch {
        return [patient.id, 0]
      }
    }))

    setPatientDoctorCounts(Object.fromEntries(entries))
  }

  useEffect(() => {
    const loadWorkspace = async () => {
      if (!token) {
        setIsLoading(false)
        return
      }

      setIsLoading(true)

      try {
        const doctorResponse = await api.get("/doctors/me", {
          headers: authHeaders,
        })
        const currentDoctor = getResponseData(doctorResponse)
        const [assignedPatientsResponse, patientsResponse, activitiesResponse, doctorsResponse, departmentsResponse, activityTypesResponse] = await Promise.all([
          api.get(`/doctors/${currentDoctor.id}/patients`),
          api.get("/patients?page=1&limit=100"),
          api.get(`/doctors/${currentDoctor.id}/activities`),
          api.get("/doctors"),
          api.get("/departments"),
          api.get("/options/activities"),
        ])

        const assignedPatientsData = getResponseData(assignedPatientsResponse) || []
        const patientsData = getResponseData(patientsResponse) || []
        const doctorsData = getResponseData(doctorsResponse) || []
        const normalizedActivities = (getResponseData(activitiesResponse) || []).map((activity) => normalizeActivity(activity, patientsData, doctorsData))

        setDoctor(currentDoctor)
        setAssignedPatients(assignedPatientsData)
        setPatients(patientsData)
        setActivities(normalizedActivities)
        setAllDoctors(doctorsData)
        setDepartments(getResponseData(departmentsResponse) || [])
        setActivityTypes(getResponseData(activityTypesResponse) || [])
        setForm(buildDoctorProfileForm(currentDoctor))
        setPhoneNumber(normalizeRomanianPhoneNumber(currentDoctor.phone_number))
        setEmailInput(currentDoctor.pending_email || currentDoctor.email || "")
        await loadAssignedDoctorCounts(assignedPatientsData)
      } catch (error) {
        setDoctor(null)
        setAssignedPatients([])
        setPatientDoctorCounts({})
        setPatients([])
        setActivities([])
        setAllDoctors([])
        setDepartments([])
        setActivityTypes([])
        notifyError(getErrorMessage(error))
      } finally {
        setIsLoading(false)
      }
    }

    loadWorkspace()
  }, [authHeaders, notifyError, token])

  const availablePatients = patients.filter(
    (patient) => !assignedPatients.some((assignedPatient) => assignedPatient.id === patient.id),
  )
  const filteredAssignedPatients = availablePatients.filter(
    (patient) =>
      patient.department === doctor?.specialization
      && patient.is_discharged === false
  )
  const activityPatients = assignedPatients.filter((patient) => patient.department === doctor?.specialization)
  const activityDoctors = allDoctors.filter((item) => item.specialization === doctor?.specialization)
  const isProfileFormValid = Boolean(
    form.first_name.trim()
    && form.last_name.trim()
    && form.specialization.trim()
    && form.license_number.trim()
    && form.birth_date
  )
  const initialProfileForm = buildDoctorProfileForm(doctor)
  const normalizedPhoneNumber = buildPatientPhoneNumber(phoneNumber)
  const initialPhoneNumber = normalizeRomanianPhoneNumber(doctor?.phone_number)
  const isProfileDirty = Object.keys(initialProfileForm).some((key) => form[key] !== initialProfileForm[key]) || normalizedPhoneNumber !== initialPhoneNumber
  const displayedEmail = doctor?.pending_email || doctor?.email || ""
  const isPendingEmail = Boolean(doctor?.pending_email) || doctor?.email_confirmed === false
  const isEmailDirty = emailInput.trim() && emailInput.trim() !== displayedEmail
  const shouldShowResendVerification = Boolean(doctor?.email_confirmed === false && doctor?.email_verification_expired === true)
  const normalizedAssignmentQuery = assignmentQuery.trim().toLowerCase()
  const assignmentSuggestions = filteredAssignedPatients
    .filter((patient) => {
      if (!normalizedAssignmentQuery) {
        return true
      }

      const patientName = formatPatientFullName(patient).toLowerCase()
      return patient.cnp.toLowerCase().includes(normalizedAssignmentQuery) || patientName.includes(normalizedAssignmentQuery)
    })
    .slice(0, 8)
  const selectedPatient = filteredAssignedPatients.find((patient) => {
    const patientName = formatPatientFullName(patient)
    const normalizedPatientName = patientName.toLowerCase()
    const optionLabel = `${patient.cnp} | ${patientName}`.toLowerCase()
    return (
      patient.cnp === assignmentQuery.trim()
      || normalizedPatientName === normalizedAssignmentQuery
      || optionLabel === normalizedAssignmentQuery
    )
  })

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (assignInputRef.current && !assignInputRef.current.contains(event.target)) {
        setIsAssignDropdownOpen(false)
      }
    }
    document.addEventListener("mousedown", handleClickOutside)
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [])

  const handleActivitySubmit = async (payload) => {
    if (!doctor || isSubmittingActivity) {
      return
    }

    setIsSubmittingActivity(true)

    try {
      const response = activityDialogMode === "edit" && selectedActivity
        ? await api.patch(`/doctors/${doctor.id}/activities/${selectedActivity.id}`, payload, {
          headers: authHeaders,
        })
        : await api.post(`/doctors/${doctor.id}/activities`, payload, {
          headers: authHeaders,
        })
      const nextActivity = normalizeActivity(getResponseData(response), patients, allDoctors)
      setActivities((current) => [...current.filter((item) => item.id !== nextActivity.id), nextActivity].sort((left, right) => new Date(left.scheduled_at) - new Date(right.scheduled_at)))
      setIsActivityDialogOpen(false)
      setSelectedActivity(null)
      setActivityPendingCancellation(null)
      notifySuccess(getResponseMessage(response))
    } catch (error) {
      notifyError(getErrorMessage(error))
    } finally {
      setIsSubmittingActivity(false)
    }
  }

  const handleActivityEdit = (activity) => {
    if (activity.status === "canceled") {
      return
    }

    setActivityDialogMode("edit")
    setSelectedActivity(activity)
    setIsActivityDialogOpen(true)
  }

  const handleCancelActivity = async () => {
    if (!doctor || !activityPendingCancellation || isSubmittingActivity) {
      return
    }

    setIsSubmittingActivity(true)

    try {
      const response = await api.patch(`/doctors/${doctor.id}/activities/${activityPendingCancellation.id}`, {
        status: "canceled",
      }, {
        headers: authHeaders,
      })
      const nextActivity = normalizeActivity(getResponseData(response), patients, allDoctors)
      setActivities((current) => [...current.filter((item) => item.id !== nextActivity.id), nextActivity].sort((left, right) => new Date(left.scheduled_at) - new Date(right.scheduled_at)))
      setActivityPendingCancellation(null)
      notifySuccess(getResponseMessage(response))
    } catch (error) {
      notifyError(getErrorMessage(error))
    } finally {
      setIsSubmittingActivity(false)
    }
  }

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
        birth_date: form.birth_date || null,
        phone_number: normalizedPhoneNumber || null,
      }

      const response = await api.patch("/doctors/me", payload, {
        headers: authHeaders,
      })

      const doctorData = getResponseData(response)
      setDoctor(doctorData)
      setForm(buildDoctorProfileForm(doctorData))
      setPhoneNumber(normalizeRomanianPhoneNumber(doctorData.phone_number))
      notifySuccess(getResponseMessage(response))
    } catch (error) {
      notifyError(getErrorMessage(error))
    } finally {
      setIsSavingProfile(false)
    }
  }

  const handleEmailUpdate = async (event) => {
    event.preventDefault()
    if (!doctor || !isEmailDirty || isSavingEmail) {
      return
    }

    setIsSavingEmail(true)

    try {
      const response = await api.patch("/doctors/me/email", {email: emailInput.trim()}, {
        headers: authHeaders,
      })
      const doctorData = getResponseData(response)
      setDoctor(doctorData)
      setEmailInput(doctorData.pending_email || doctorData.email || "")
      notifySuccess(getResponseMessage(response))
    } catch (error) {
      notifyError(getErrorMessage(error))
    } finally {
      setIsSavingEmail(false)
    }
  }

  const handleResendVerification = async () => {
    if (!doctor || !shouldShowResendVerification || isResendingVerification) {
      return
    }

    setIsResendingVerification(true)
    try {
      const response = await api.post("/auth/resend-verification", null, {
        headers: authHeaders,
      })
      notifySuccess(getResponseMessage(response))
    } catch (error) {
      notifyError(getErrorMessage(error))
    } finally {
      setIsResendingVerification(false)
    }
  }

  const handleAssignPatient = async (event) => {
    event.preventDefault()
    if (!doctor || !selectedPatient) {
      return
    }

    setIsAssigningPatient(true)

    try {
      const response = await api.post(`/doctors/${doctor.id}/patients/${selectedPatient.id}`, null, {
        headers: authHeaders,
      })
      const nextAssignedPatients = getResponseData(response) || []
      setAssignedPatients(nextAssignedPatients)
      await loadAssignedDoctorCounts(nextAssignedPatients)
      setAssignmentQuery("")
      notifySuccess(getResponseMessage(response))
    } catch (error) {
      notifyError(getErrorMessage(error))
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
      const response = await api.delete(`/doctors/${doctor.id}/patients/${patientId}`, {
        headers: authHeaders,
      })
      const nextAssignedPatients = getResponseData(response) || []
      setAssignedPatients(nextAssignedPatients)
      await loadAssignedDoctorCounts(nextAssignedPatients)
      setPatientPendingRemoval(null)
      notifySuccess(getResponseMessage(response))
    } catch (error) {
      notifyError(getErrorMessage(error))
    } finally {
      setRemovingPatientId(null)
    }
  }

  const openTransferDialog = async (patient) => {
    if (!doctor || !patient) {
      return
    }

    setPatientPendingTransfer(patient)
    setSelectedTransferDoctorId("")
    setTransferDoctorOptions([])
    setIsLoadingTransferDoctors(true)

    try {
      const response = await api.get("/doctors/available", {
        params: {
          department: patient.department,
          exclude_doctor_id: doctor.id,
        },
        headers: authHeaders,
      })
      setTransferDoctorOptions(getResponseData(response) || [])
    } catch (error) {
      setPatientPendingTransfer(null)
      notifyError(getErrorMessage(error))
    } finally {
      setIsLoadingTransferDoctors(false)
    }
  }

  const handleTransferPatient = async () => {
    if (!doctor || !patientPendingTransfer || !selectedTransferDoctorId || isTransferringPatient) {
      return
    }

    setIsTransferringPatient(true)
    try {
      const response = await api.post(
        `/patients/${patientPendingTransfer.id}/transfer`,
        {
          from_doctor_id: doctor.id,
          to_doctor_id: Number(selectedTransferDoctorId),
        },
        {
          headers: authHeaders,
        },
      )
      const updatedPatient = getResponseData(response)
      const nextAssignedPatients = assignedPatients.map((patient) => (
        patient.id === updatedPatient.id ? updatedPatient : patient
      ))
      setAssignedPatients(nextAssignedPatients)
      await loadAssignedDoctorCounts(nextAssignedPatients)
      setPatientPendingTransfer(null)
      notifySuccess(getResponseMessage(response))
    } catch (error) {
      notifyError(getErrorMessage(error))
    } finally {
      setIsTransferringPatient(false)
    }
  }

  const handleDeleteAccount = async () => {
    if (!doctor || isOnlyDoctorInDepartment) {
      return
    }

    setIsDeletingAccount(true)

    try {
      const response = await api.delete(`/doctors/${doctor.id}`, {
        headers: authHeaders,
      })
      setDoctor(getResponseData(response))
      setAssignedPatients([])
      setPatientDoctorCounts({})
      notifySuccess(getResponseMessage(response))
      setShowDeleteModal(false)
      logout()
      navigate("/")
    } catch (error) {
      notifyError(getErrorMessage(error))
      setIsDeletingAccount(false)
    }
  }

  useEffect(() => {
    setActivityPage(1)
  }, [activities])

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
                <h1 className="text-3xl font-semibold tracking-tight text-white sm:text-4xl">{"Doctor Control Panel"}</h1>
                <p
                  className="mt-2 max-w-2xl text-sm text-[#b6bec9] sm:text-base">{"Manage profile details, patient assignments, and account status from one workspace."}</p>
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
                  <p className="mt-3 text-lg font-semibold text-white"><CountValue value={filteredAssignedPatients.length}/></p>
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
          <section className="grid gap-6">
            <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
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

                <DataTable
                  items={assignedPatients}
                  loading={isLoading}
                  emptyMessage="No patients are currently assigned to this doctor."
                  pageSize={3}
                  controlsLayoutClassName="hidden"
                  getItemKey={(patient) => patient.id}
                  shellClassName="space-y-3"
                  bodyClassName="space-y-3"
                  renderRow={(patient) => (
                    <div className="rounded-2xl border border-[#3b424b] bg-[#151b22] p-4">
                      <div className="flex flex-col gap-4">
                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            <Link className="console-link text-base font-semibold transition" to={`/patient/${patient.id}`}>
                              {formatPatientFullName(patient)}
                            </Link>
                            {patient.is_discharged && (
                              <span className="rounded-full border border-[#a33a45] bg-[#3a1f25] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-[#ffd8dc]">
                                Discharged
                              </span>
                            )}
                          </div>
                          <p className="mt-2 text-xs uppercase tracking-[0.22em] text-[#879196]">{patient.department}</p>
                          <p className="mt-2 text-sm text-[#b6bec9]">{patient.cnp}</p>
                        </div>
                        {(() => {
                          const hasCount = Object.prototype.hasOwnProperty.call(patientDoctorCounts, patient.id)
                          const assignedDoctorCount = hasCount ? patientDoctorCounts[patient.id] : 2
                          const shouldTransfer = assignedDoctorCount <= 1
                          return (
                            <button
                              type="button"
                              onClick={() => {
                                if (shouldTransfer) {
                                  openTransferDialog(patient)
                                  return
                                }
                                setPatientPendingRemoval(patient)
                              }}
                              disabled={removingPatientId === patient.id || isTransferringPatient}
                              className="console-button-secondary w-max rounded-2xl px-4 py-2 text-sm font-semibold disabled:cursor-not-allowed disabled:border-[#4d5661] disabled:bg-[#3b424b] disabled:text-[#b6bec9]"
                            >
                              {shouldTransfer ? "Transfer Patient" : (removingPatientId === patient.id ? "Removing..." : "Remove Patient")}
                            </button>
                          )
                        })()}
                      </div>
                    </div>
                  )}
                />
              </section>

              <section className="monitor-card rounded-[28px] p-6">
                <div className="mb-6 flex items-center justify-between gap-4">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.3em] text-[#ff9900]">Activities</p>
                    <h2 className="mt-2 text-2xl font-semibold text-white">Upcoming Activities</h2>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setActivityDialogMode("create")
                      setSelectedActivity(null)
                      setIsActivityDialogOpen(true)
                    }}
                    disabled={activityPatients.length === 0}
                    className="console-button-secondary rounded-2xl px-4 py-2 text-sm font-semibold disabled:cursor-not-allowed disabled:border-[#4d5661] disabled:bg-[#3b424b] disabled:text-[#b6bec9]"
                  >
                    Add Activity
                  </button>
                </div>

                <ActivityList
                  activities={paginatedActivities}
                  emptyMessage="No future activities are scheduled for this doctor."
                  isLoading={isLoading}
                  loadingMessage="Loading doctor activities..."
                  onCancel={(activity) => setActivityPendingCancellation(activity)}
                  onEdit={handleActivityEdit}
                />
                {totalActivityPages > 1 && (
                  <div className="flex items-center justify-between mt-4">
                    <button
                      onClick={() => setActivityPage((p) => Math.max(1, p - 1))}
                      disabled={activityPage === 1}
                      className="console-button-secondary px-4 py-2 rounded-xl text-sm"
                    >
                      Previous
                    </button>

                    <span className="text-sm text-[#b6bec9]">
      Page {activityPage} of {totalActivityPages}
    </span>

                    <button
                      onClick={() => setActivityPage((p) => Math.min(totalActivityPages, p + 1))}
                      disabled={activityPage === totalActivityPages}
                      className="console-button-secondary px-4 py-2 rounded-xl text-sm"
                    >
                      Next
                    </button>
                  </div>
                )}
              </section>
            </div>

            <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
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
                             className="login-input" placeholder="Example: Elena" required/>
                    </div>
                    <div className="login-field">
                      <label className="login-label" htmlFor="last_name">Last Name</label>
                      <input id="last_name" name="last_name" type="text" value={form.last_name} onChange={handleFormChange}
                             className="login-input" placeholder="Example: Popescu" required/>
                    </div>
                  </div>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="login-field">
                      <label className="login-label" htmlFor="specialization">Specialization</label>
                      <select id="specialization" name="specialization" value={form.specialization} onChange={handleFormChange}
                              className="login-input" required disabled={hasAssignedPatients}>
                        <option value="">Select specialization</option>
                        {departments.map((department) => (
                          <option key={department} value={department}>{department}</option>
                        ))}
                      </select>
                    </div>
                    <div className="login-field">
                      <label className="login-label" htmlFor="license_number">License Number</label>
                      <input id="license_number" name="license_number" type="text" value={form.license_number} onChange={handleFormChange}
                             className="login-input" placeholder="Example: DOC-20458" required/>
                    </div>
                  </div>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="login-field">
                      <label className="login-label" htmlFor="doctor-birth-date">Birth Date</label>
                      <input id="doctor-birth-date" name="birth_date" type="date" value={form.birth_date} onChange={handleFormChange}
                             className="login-input" required/>
                    </div>
                    <div className="login-field">
                      <label className="login-label" htmlFor="doctor-phone-number">{"Phone Number"}</label>
                      <input
                        id="doctor-phone-number"
                        type="tel"
                        value={phoneNumber}
                        onChange={(event) => setPhoneNumber(event.target.value.replace(/\D/g, ""))}
                        className="login-input"
                        placeholder={ROMANIA_PHONE_PLACEHOLDER}
                      />
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
                <div className="mb-6">
                  <p className="text-xs font-semibold uppercase tracking-[0.3em] text-[#ff9900]">Assignment</p>
                  <h2 className="mt-2 text-2xl font-semibold text-white">Assign Patient</h2>
                </div>

                <form className="space-y-4" onSubmit={handleAssignPatient}>
                  <div className="login-field relative" ref={assignInputRef}>
                    <label className="login-label" htmlFor="assigned_patient">Patient CNP or Full Name</label>
                    <input
                      id="assigned_patient"
                      type="text"
                      value={assignmentQuery}
                      onChange={(event) => {
                        setAssignmentQuery(event.target.value)
                        setIsAssignDropdownOpen(true)
                      }}
                      onFocus={() => setIsAssignDropdownOpen(true)}
                      className="login-input"
                      placeholder="Example: 6010101123451 or Popescu Andrei"
                      autoComplete="off"
                      disabled={filteredAssignedPatients.length === 0 || isAssigningPatient}
                    />

                    {isAssignDropdownOpen && assignmentSuggestions.length > 0 && (
                      <div
                        className="w-full mt-2 max-h-40 overflow-y-auto rounded-xl border border-[#3b424b] bg-[#161b22] py-2 custom-scrollbar">
                        {assignmentSuggestions.map((patient) => (
                          <div
                            key={patient.id}
                            className="cursor-pointer px-4 py-2 hover:bg-[#232f3e] text-sm text-[#d5dbdb]"
                            onClick={() => {
                              setAssignmentQuery(`${patient.cnp} | ${formatPatientFullName(patient)}`)
                              setIsAssignDropdownOpen(false)
                            }}
                          >
                            <span className="font-semibold text-white">{patient.cnp}</span>
                            <span className="text-[#879196]"> | {formatPatientFullName(patient)}</span>
                          </div>
                        ))}
                      </div>
                    )}

                    <p className="mt-2 text-xs text-[#879196]">
                      Start with CNP or full name. Suggestions show both identifiers together.
                    </p>
                  </div>

                  <button
                    type="submit"
                    disabled={!selectedPatient || isAssigningPatient}
                    className="console-button-primary w-full rounded-2xl px-4 py-3 font-semibold disabled:cursor-not-allowed disabled:border-[#4d5661] disabled:bg-[#3b424b] disabled:text-[#b6bec9]"
                  >
                    {isAssigningPatient ? "Assigning..." : "Assign Patient"}
                  </button>
                </form>
              </section>


              <section className="monitor-card rounded-[28px] p-6">
                <div className="mb-6">
                  <p className="text-xs font-semibold uppercase tracking-[0.3em] text-[#ff9900]">Email</p>
                  <h2 className="mt-2 text-2xl font-semibold text-white">Account Email</h2>
                </div>

                <form className="space-y-4" onSubmit={handleEmailUpdate}>
                  <div className="login-field">
                    <label className="login-label" htmlFor="doctor-email">Email</label>
                    <input
                      id="doctor-email"
                      type="email"
                      value={emailInput}
                      onChange={(event) => setEmailInput(event.target.value)}
                      className={`login-input ${isPendingEmail ? "border-[#a33a45] text-[#ffd8dc]" : ""}`}
                      placeholder="Example: doctor@medstream.local"
                      required
                    />
                  </div>

                  {isPendingEmail && (
                    <p className="text-sm text-[#ffb3bc]">
                      Email not confirmed yet. Current confirmed login email remains {doctor.email}.
                    </p>
                  )}

                  <div className="flex justify-end">
                    <button
                      type="submit"
                      disabled={!isEmailDirty || isSavingEmail}
                      className="console-button-primary rounded-2xl px-5 py-3 text-sm font-semibold disabled:cursor-not-allowed disabled:border-[#4d5661] disabled:bg-[#3b424b] disabled:text-[#b6bec9]"
                    >
                      {isSavingEmail ? "Sending confirmation..." : "Update Email"}
                    </button>
                  </div>
                </form>

                {shouldShowResendVerification && (
                  <div className="mt-4 flex justify-end">
                    <button
                      type="button"
                      onClick={handleResendVerification}
                      disabled={isResendingVerification}
                      className="console-button-secondary rounded-2xl px-5 py-3 text-sm font-semibold disabled:cursor-not-allowed disabled:border-[#4d5661] disabled:bg-[#3b424b] disabled:text-[#b6bec9]"
                    >
                      {isResendingVerification ? "Resending..." : "Resend Verification Email"}
                    </button>
                  </div>
                )}
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
                    onClick={() => {
                      if (!isOnlyDoctorInDepartment) {
                        setShowDeleteModal(true)
                      }
                    }}
                    disabled={isDeletingAccount || isOnlyDoctorInDepartment}
                    title={isOnlyDoctorInDepartment ? "You are the only doctor in this department. Account cannot be deleted." : ""}
                    className="w-full rounded-2xl border border-[#a33a45] bg-[#3a1f25] px-4 py-3 text-sm font-semibold text-[#ffd8dc] transition hover:bg-[#47262d] disabled:cursor-not-allowed disabled:border-[#4d5661] disabled:bg-[#3b424b] disabled:text-[#b6bec9]"
                  >
                    {isDeletingAccount ? "Deactivating..." : "Delete Account"}
                  </button>
                  {isOnlyDoctorInDepartment && (
                    <p className="text-xs text-[#ffb3bc]">
                      You are the only doctor in this department. Account cannot be deleted.
                    </p>
                  )}
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
                  This action deactivates the doctor account and automatically reassigns your patients to another doctor from the same department.
                </p>
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

        {patientPendingTransfer && (
          <div className="console-modal-overlay">
            <div className="console-modal monitor-card rounded-[28px] p-6">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.3em] text-[#ff9900]">Patient Assignment</p>
                  <h2 className="mt-2 text-2xl font-semibold text-white">Transfer Assigned Patient</h2>
                </div>
                <button
                  type="button"
                  onClick={() => setPatientPendingTransfer(null)}
                  disabled={isTransferringPatient}
                  className="console-button-secondary rounded-xl px-3 py-2 text-sm font-semibold"
                >
                  Cancel
                </button>
              </div>

              <div className="mt-5 rounded-2xl border border-[#3b424b] bg-[#151b22] p-4">
                <p className="text-sm text-[#d5dbdb]">
                  Select another doctor from {patientPendingTransfer.department} to transfer {formatPatientFullName(patientPendingTransfer)}.
                </p>
                <p className="mt-2 text-sm text-[#879196]">CNP: {patientPendingTransfer.cnp}</p>
              </div>

              <div className="mt-5">
                <label className="login-label" htmlFor="transfer-doctor">Available Doctors</label>
                <select
                  id="transfer-doctor"
                  value={selectedTransferDoctorId}
                  onChange={(event) => setSelectedTransferDoctorId(event.target.value)}
                  disabled={isLoadingTransferDoctors || isTransferringPatient || transferDoctorOptions.length === 0}
                  className="login-input mt-2"
                >
                  <option value="">
                    {isLoadingTransferDoctors
                      ? "Loading doctors..."
                      : transferDoctorOptions.length > 0
                        ? "Select a doctor"
                        : "No available doctors"}
                  </option>
                  {transferDoctorOptions.map((item) => (
                    <option key={item.id} value={item.id}>
                      Dr. {item.first_name} {item.last_name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="mt-6 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setPatientPendingTransfer(null)}
                  disabled={isTransferringPatient}
                  className="console-button-secondary rounded-2xl px-4 py-3 text-sm font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleTransferPatient}
                  disabled={!selectedTransferDoctorId || isTransferringPatient || transferDoctorOptions.length === 0}
                  className="rounded-2xl border border-[#34506b] bg-[#1d2f3f] px-4 py-3 text-sm font-semibold text-[#cce6ff] transition hover:bg-[#22394d] disabled:cursor-not-allowed disabled:border-[#4d5661] disabled:bg-[#3b424b] disabled:text-[#b6bec9]"
                >
                  {isTransferringPatient ? "Transferring..." : "Confirm Transfer"}
                </button>
              </div>
            </div>
          </div>
        )}

        {patientPendingRemoval && (
          <div className="console-modal-overlay">
            <div className="console-modal monitor-card rounded-[28px] p-6">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.3em] text-[#ff9900]">Patient Assignment</p>
                  <h2 className="mt-2 text-2xl font-semibold text-white">Remove Assigned Patient</h2>
                </div>
                <button
                  type="button"
                  onClick={() => setPatientPendingRemoval(null)}
                  className="console-button-secondary rounded-xl px-3 py-2 text-sm font-semibold"
                >
                  Cancel
                </button>
              </div>

              <div className="mt-5 rounded-2xl border border-[#3b424b] bg-[#151b22] p-4">
                <p className="text-sm text-[#d5dbdb]">
                  Remove {formatPatientFullName(patientPendingRemoval)} from this doctor&apos;s assigned patient list?
                </p>
                <p className="mt-2 text-sm text-[#879196]">CNP: {patientPendingRemoval.cnp}</p>
              </div>

              <div className="mt-6 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setPatientPendingRemoval(null)}
                  className="console-button-secondary rounded-2xl px-4 py-3 text-sm font-semibold"
                >
                  Keep Patient
                </button>
                <button
                  type="button"
                  onClick={() => handleRemovePatient(patientPendingRemoval.id)}
                  disabled={removingPatientId === patientPendingRemoval.id}
                  className="rounded-2xl border border-[#a33a45] bg-[#3a1f25] px-4 py-3 text-sm font-semibold text-[#ffd8dc] transition hover:bg-[#47262d] disabled:cursor-not-allowed disabled:border-[#4d5661] disabled:bg-[#3b424b] disabled:text-[#b6bec9]"
                >
                  {removingPatientId === patientPendingRemoval.id ? "Removing..." : "Yes, Remove Patient"}
                </button>
              </div>
            </div>
          </div>
        )}

        {activityPendingCancellation && (
          <div className="console-modal-overlay z-50">
            <div className="console-modal monitor-card rounded-[28px] p-6 w-full max-w-md">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.3em] text-[#ff9900]">Activities</p>
                <h2 className="mt-2 text-2xl font-semibold text-white">Cancel Activity</h2>
                <p className="mt-3 text-sm text-[#b6bec9]">Are you sure you want to cancel this activity?</p>
              </div>

              <div className="mt-6 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setActivityPendingCancellation(null)}
                  disabled={isSubmittingActivity}
                  className="console-button-secondary rounded-2xl px-4 py-3 text-sm font-semibold"
                >
                  Keep Activity
                </button>
                <button
                  type="button"
                  onClick={handleCancelActivity}
                  disabled={isSubmittingActivity}
                  className="rounded-2xl border border-[#a33a45] bg-[#3a1f25] px-4 py-3 text-sm font-semibold text-[#ffd8dc] transition hover:bg-[#47262d] disabled:cursor-not-allowed disabled:border-[#4d5661] disabled:bg-[#3b424b] disabled:text-[#b6bec9]"
                >
                  {isSubmittingActivity ? "Canceling..." : "Yes, Cancel Activity"}
                </button>
              </div>
            </div>
          </div>
        )}

        {isActivityDialogOpen && (
          <ActivityDialog
            activity={selectedActivity}
            activityTypes={activityTypes}
            currentDoctorId={doctor?.id}
            doctors={activityDoctors}
            isOpen={isActivityDialogOpen}
            isSubmitting={isSubmittingActivity}
            mode={activityDialogMode}
            onClose={() => {
              setIsActivityDialogOpen(false)
              setSelectedActivity(null)
            }}
            onSubmit={handleActivitySubmit}
            patients={activityPatients}
          />
        )}
      </div>
    </div>
  )
}
