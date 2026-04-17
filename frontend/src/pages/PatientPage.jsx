import {useCallback, useEffect, useRef, useState} from "react"
import {Link, useParams} from "react-router-dom"
import BackButton from "../components/BackButton"
import ActivityList from "../components/ActivityList"
import DepartmentTransferDialog from "../components/DepartmentTransferDialog"
import EditPatientDialog from "../components/EditPatientDialog"
import PatientActivityDialog from "../components/PatientActivityDialog"
import {usePatientAdmissionActions} from "../hooks/usePatientAdmissionActions"
import {useNotifications} from "../components/NotificationProvider"
import {api} from "../services/api"
import {getErrorMessage, getResponseData, getResponseMessage} from "../services/apiMessages"
import {createWebSocket} from "../services/ws"
import {formatPatientPhoneWithCode} from "../utils/patientPhone"
import {useAuth} from "../auth/AuthContext"

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

function formatDate(value) {
  if (!value) {
    return "--"
  }

  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(value))
}

function formatArrivalMethod(value) {
  if (value === "ambulance") {
    return "Ambulance"
  }

  if (value === "self") {
    return "Self"
  }

  return value || "--"
}

function normalizeActivity(activity, patientId) {
  const patientIds = Array.isArray(activity.patient_ids) ? activity.patient_ids : []
  const doctorIds = Array.isArray(activity.doctor_ids) ? activity.doctor_ids : []
  const patients = Array.isArray(activity.patients) ? activity.patients : []
  const doctors = Array.isArray(activity.doctors) ? activity.doctors : []

  return {
    ...activity,
    patient_ids: patientIds,
    doctor_ids: doctorIds,
    patients,
    doctors,
    belongsToPatient: patientIds.map(String).includes(String(patientId)) || String(activity.patient_id || "") === String(patientId),
  }
}

function PaginationControls({page, maxPage, onPrevious, onNext}) {
  return (
    <div className="mb-4 flex items-center justify-between gap-3">
      <div className="console-chip rounded-full px-3 py-1 text-xs font-medium">
        Page {page}
      </div>

      <div className="flex items-center gap-2">
        <button
          className="console-button-ghost rounded-full px-3 py-1.5 text-xs font-medium disabled:cursor-not-allowed disabled:border-[#31363f] disabled:text-[#6b7280]"
          onClick={onPrevious}
          disabled={page === 1}
          type="button"
        >
          Previous
        </button>

        <button
          className="console-button-ghost rounded-full px-3 py-1.5 text-xs font-medium disabled:cursor-not-allowed disabled:border-[#31363f] disabled:text-[#6b7280]"
          onClick={onNext}
          disabled={page >= maxPage}
          type="button"
        >
          Next
        </button>
      </div>
    </div>
  )
}

export default function PatientPage() {
  const {notifyError, notifySuccess} = useNotifications()
  const {token} = useAuth()
  const {id} = useParams()
  const pageSize = 5
  const [currentDoctor, setCurrentDoctor] = useState(null)
  const [patient, setPatient] = useState(null)
  const [vitals, setVitals] = useState([])
  const [alerts, setAlerts] = useState([])
  const [department, setDepartment] = useState("")
  const [isUpdatingDepartment, setIsUpdatingDepartment] = useState(false)
  const [isLoadingPatient, setIsLoadingPatient] = useState(true)
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false)
  const [isSavingPatient, setIsSavingPatient] = useState(false)
  const [isTransferDialogOpen, setIsTransferDialogOpen] = useState(false)
  const [vitalsPage, setVitalsPage] = useState(1)
  const [doctors, setDoctors] = useState([])
  const [allDoctors, setAllDoctors] = useState([])
  const [isLoadingDoctors, setIsLoadingDoctors] = useState(true)
  const [patientActivities, setPatientActivities] = useState([])
  const [isLoadingActivities, setIsLoadingActivities] = useState(true)
  const [activityLoadError, setActivityLoadError] = useState("")
  const [isSavingActivity, setIsSavingActivity] = useState(false)
  const [activityDialogMode, setActivityDialogMode] = useState("create")
  const [selectedActivity, setSelectedActivity] = useState(null)
  const [activityPendingCancellation, setActivityPendingCancellation] = useState(null)
  const alertAudioRef = useRef(null)
  const [showActivityDialog, setShowActivityDialog] = useState(false)
  const [activityTypes, setActivityTypes] = useState([])
  const authHeaders = token ? {Authorization: `Bearer ${token}`} : {}
  const admissionActions = usePatientAdmissionActions({
    authHeaders,
    patientId: id,
    onPatientChange: setPatient,
    notifyError,
    notifySuccess,
  })
  const {loadDischargeTypes} = admissionActions

  if (!alertAudioRef.current) {
    alertAudioRef.current = new Audio("/alert.mp3")
  }

  useEffect(() => {
    setPatient(null)
    setVitals([])
    setAlerts([])
    setDepartment("")
    setVitalsPage(1)
    setIsEditDialogOpen(false)
    setIsTransferDialogOpen(false)
    setPatientActivities([])
    setActivityLoadError("")
    setShowActivityDialog(false)
    setSelectedActivity(null)
    setActivityPendingCancellation(null)
  }, [id])

  useEffect(() => {
    const fetchMe = async () => {
      if (!token) return
      try {
        const res = await api.get("/doctors/me", {
          headers: {Authorization: `Bearer ${token}`}
        })
        setCurrentDoctor(getResponseData(res))
      } catch (error) {
        console.error("Failed to load current doctor", error)
      }
    }
    fetchMe()
  }, [token])

  const loadPatient = useCallback(async () => {
    setIsLoadingPatient(true)
    setIsLoadingDoctors(true)
    setIsLoadingActivities(true)
    setActivityLoadError("")

    try {
      const response = await api.get(`/patients/${id}`)
      const patientData = getResponseData(response)
      setPatient(patientData)
      setDepartment(patientData.department)
      const [typesResult, activitiesResult, patientDoctorsResult, doctorsResult] = await Promise.allSettled([
        api.get("/options/activities"),
        api.get(`/patients/${id}/activities`),
        api.get(`/patients/${id}/doctors`),
        api.get("/doctors"),
      ])

      if (typesResult.status === "fulfilled") {
        setActivityTypes(getResponseData(typesResult.value) || [])
      } else {
        setActivityTypes([])
        notifyError(getErrorMessage(typesResult.reason))
      }

      if (activitiesResult.status === "fulfilled") {
        const activities = (getResponseData(activitiesResult.value) || [])
          .map((activity) => normalizeActivity(activity, id))
          .filter((activity) => activity.belongsToPatient)
          .sort((left, right) => new Date(left.scheduled_at) - new Date(right.scheduled_at))

        setPatientActivities(activities)
        setActivityLoadError("")
      } else {
        setPatientActivities([])
        setActivityLoadError(getErrorMessage(activitiesResult.reason))
        notifyError(getErrorMessage(activitiesResult.reason))
      }

      if (patientDoctorsResult.status === "fulfilled") {
        setDoctors(getResponseData(patientDoctorsResult.value) || [])
      } else {
        setDoctors([])
        notifyError(getErrorMessage(patientDoctorsResult.reason))
      }

      if (doctorsResult.status === "fulfilled") {
        setAllDoctors(getResponseData(doctorsResult.value) || [])
      } else {
        setAllDoctors([])
        notifyError(getErrorMessage(doctorsResult.reason))
      }

    } catch (error) {
      setPatient(null)
      setDepartment("")
      notifyError(getErrorMessage(error))
    } finally {
      setIsLoadingPatient(false)
      setIsLoadingDoctors(false)
      setIsLoadingActivities(false)
    }
  }, [id, notifyError])

  const openActivityDialog = () => {
    if (!currentDoctor || !canManagePatientActivities) return
    setActivityDialogMode("create")
    setSelectedActivity(null)
    setShowActivityDialog(true)
  }

  useEffect(() => {
    loadPatient().then(r => r)
  }, [loadPatient])

  useEffect(() => {
    const socket = createWebSocket((msg) => {
      if (String(msg.data?.patient_id) !== id) {
        return
      }

      if (msg.type === "vital") {
        const vital = {
          ...msg.data,
          time: new Date().toLocaleTimeString(),
        }

        setVitals((prev) => [vital, ...prev.slice(0, 20)])
      }

      if (msg.type === "alert") {
        setAlerts((prev) => [msg.data, ...prev.slice(0, 10)])
        alertAudioRef.current.currentTime = 0
        alertAudioRef.current.play().catch(() => {
        })
      }
    })

    return () => {
      socket.close()
    }
  }, [id])

  const handleDepartmentTransfer = async ({department: nextDepartment, reason}) => {
    setIsUpdatingDepartment(true)

    try {
      const response = await api.patch(`/patients/${id}/department`, {
        department: nextDepartment,
        reason,
      }, {
        headers: authHeaders,
      })

      const patientData = getResponseData(response)
      setDepartment(patientData.department)
      setPatient((current) => current ? {...current, department: patientData.department} : current)
      notifySuccess(getResponseMessage(response))
      setIsTransferDialogOpen(false)
    } catch (error) {
      notifyError(getErrorMessage(error))
    } finally {
      setIsUpdatingDepartment(false)
    }
  }

  const handlePatientUpdate = async (payload) => {
    setIsSavingPatient(true)

    try {
      const response = await api.patch(`/patients/${id}`, payload, {
        headers: authHeaders,
      })
      const patientData = getResponseData(response)
      setPatient(patientData)
      setDepartment(patientData.department)
      notifySuccess(getResponseMessage(response))
      setIsEditDialogOpen(false)
    } catch (error) {
      notifyError(getErrorMessage(error))
    } finally {
      setIsSavingPatient(false)
    }
  }

  const handleAssignToMe = async () => {
    if (!currentDoctor || !patient || currentDoctor.specialization !== patient.department) return

    try {
      const assignResponse = await api.post(`/doctors/${currentDoctor.id}/patients/${patient.id}`, null, {
        headers: authHeaders,
      })
      notifySuccess(getResponseMessage(assignResponse))
      const response = await api.get(`/patients/${id}/doctors`)
      setDoctors(getResponseData(response) || [])
    } catch (error) {
      notifyError(getErrorMessage(error))
    }
  }

  const isDoctorAssigned = currentDoctor && doctors.some(d => d.id === currentDoctor.id)
  const canAssignToCurrentPatient = currentDoctor && patient && currentDoctor.specialization === patient.department
  const isPatientLocked = Boolean(patient?.is_discharged)
  const canManagePatient = Boolean(isDoctorAssigned && currentDoctor)
  const canEditPatientRecord = Boolean(canManagePatient && !isPatientLocked)
  const canManagePatientActivities = Boolean(canEditPatientRecord && patient && currentDoctor.specialization === patient.department)
  const latestDisplayedVital = vitals[0]
  const paginatedVitals = vitals.slice((vitalsPage - 1) * pageSize, vitalsPage * pageSize)
  const maxVitalsPage = Math.max(1, Math.ceil(vitals.length / pageSize))
  const previewAlerts = alerts.slice(0, 3)
  const patientFullName = patient ? `${patient.last_name} ${patient.first_name}`.trim() : ""
  const pageTitle = patientFullName || (isLoadingPatient ? "Loading patient..." : "Patient")
  const patientBirthDate = patient?.birth_date ? formatDate(patient.birth_date) : "--"

  const patientAge = patient?.birth_date
    ? (() => {
      const today = new Date()
      const birthDate = new Date(patient.birth_date)
      let age = today.getFullYear() - birthDate.getFullYear()
      const monthDelta = today.getMonth() - birthDate.getMonth()

      if (monthDelta < 0 || (monthDelta === 0 && today.getDate() < birthDate.getDate())) {
        age -= 1
      }

      return `${age} yrs`
    })()
    : "--"

  const patientStreetAddress = patient?.address
    ? [
      `${patient.address.street || ""} ${patient.address.number || ""}`.trim(),
      patient.address.apartment ? `Apt ${patient.address.apartment}` : "",
      patient.address.city || "",
    ].filter(Boolean).join(", ")
    : ""
  const patientCountry = patient?.address?.country || "--"
  const patientCounty = patient?.address?.county || "--"

  const patientMetadata = [
    {label: "CNP", value: patient?.cnp || "--"},
    {label: "Birth Date", value: patientBirthDate},
    {label: "Age", value: patientAge},
    {label: "Gender", value: patient?.gender || "--"},
    {label: "Pregnant", value: patient?.is_pregnant ? "Yes" : "No"},
    {label: "Arrival Method", value: formatArrivalMethod(patient?.arrival_method)},
    {label: "Phone Number", value: patient?.phone_number ? formatPatientPhoneWithCode(patient.phone_number) : "--"},
    {label: "Country", value: patientCountry},
    {label: "County", value: patientCounty},
    {label: "Address", value: patientStreetAddress || "--", isWide: true},
  ]

  useEffect(() => {
    if (vitalsPage > maxVitalsPage) {
      setVitalsPage(maxVitalsPage)
    }
  }, [maxVitalsPage, vitalsPage])

  useEffect(() => {
    loadDischargeTypes().then(() => {
    })
  }, [id, loadDischargeTypes])

  const upsertActivity = (activity) => {
    const normalizedActivity = normalizeActivity(activity, id)

    setPatientActivities((current) => {
      const nextActivities = current.filter((item) => item.id !== normalizedActivity.id)
      nextActivities.push(normalizedActivity)
      return nextActivities.sort((left, right) => new Date(left.scheduled_at) - new Date(right.scheduled_at))
    })
  }

  const handleActivitySubmit = async (payload) => {
    if (!currentDoctor || isSavingActivity) {
      return
    }

    setIsSavingActivity(true)

    try {
      const response = activityDialogMode === "edit" && selectedActivity
        ? await api.patch(`/activities/${selectedActivity.id}`, payload, {
          headers: authHeaders,
        })
        : await api.post("/activities", payload, {
          headers: authHeaders,
        })

      upsertActivity(getResponseData(response))
      setShowActivityDialog(false)
      setSelectedActivity(null)
      setActivityPendingCancellation(null)
      notifySuccess(getResponseMessage(response))
    } catch (e) {
      notifyError(getErrorMessage(e))
    } finally {
      setIsSavingActivity(false)
    }
  }

  const handleActivityEdit = (activity) => {
    if (!canManagePatientActivities || !activity.doctor_ids?.includes(currentDoctor?.id) || activity.status === "canceled") {
      return
    }
    setActivityDialogMode("edit")
    setSelectedActivity(activity)
    setShowActivityDialog(true)
  }

  const handleCancelActivity = async () => {
    if (!activityPendingCancellation || isSavingActivity) {
      return
    }

    setIsSavingActivity(true)

    try {
      const response = await api.patch(`/activities/${activityPendingCancellation.id}`, {
        status: "canceled",
      }, {
        headers: authHeaders,
      })

      upsertActivity(getResponseData(response))
      setActivityPendingCancellation(null)
      notifySuccess(getResponseMessage(response))
    } catch (error) {
      notifyError(getErrorMessage(error))
    } finally {
      setIsSavingActivity(false)
    }
  }

  const departmentDoctors = allDoctors.filter(
    d => d.specialization === patient?.department
  )
  const patientActivityOptions = patient ? [{...patient, isCurrent: true}] : []
  const canCurrentDoctorManageActivity = (activity) => Boolean(
    currentDoctor?.id
    && activity.doctor_ids?.includes(currentDoctor.id)
    && !patient?.is_discharged
    && currentDoctor.specialization === patient?.department
  )

  return (
    <div className="app-shell min-h-screen px-4 py-6 text-slate-100 sm:px-6 lg:px-8">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
        <header className="console-topbar rounded-3xl p-6 sm:p-8">
          <div className="space-y-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.35em] text-[#ff9900]">Patient Monitoring</p>
            </div>

            <div>
              <div className="mt-2 flex w-full items-start justify-between">
                <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                  <h1 className="text-4xl font-semibold tracking-tight text-white sm:text-5xl">{pageTitle}</h1>

                  <div className="group relative flex items-center">
                    <button
                      type="button"
                      onClick={() => setIsTransferDialogOpen(true)}
                      disabled={!canEditPatientRecord}
                      className="inline-flex rounded-full border border-[#3b424b] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-[#d5dbdb] transition hover:border-[#ff9900] hover:text-white disabled:cursor-not-allowed disabled:border-[#31363f] disabled:bg-[#10151c] disabled:text-[#6b7280]"
                    >
                      {department || "--"}
                    </button>

                    <span
                      className="pointer-events-none absolute left-1/2 top-full z-50 mt-2 -translate-x-1/2 rounded-md border border-[#454c55] bg-[#0f141a] px-2 py-1 text-xs font-medium text-[#d5dbdb] opacity-0 transition-opacity duration-150 group-hover:opacity-100">
        Move patient
      </span>
                  </div>

                  <span
                    className={`inline-flex rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] ${
                      patient?.is_discharged
                        ? "border-[#7f1d1d] bg-[#3b1010] text-[#fecaca]"
                        : "border-[#1f4d36] bg-[#0e2519] text-[#bbf7d0]"
                    }`}
                  >
      {patient?.is_discharged ? "Discharged" : "Admitted"}
    </span>
                  {!isDoctorAssigned && currentDoctor && !isLoadingDoctors && (
                    <button
                      onClick={handleAssignToMe}
                      disabled={!canAssignToCurrentPatient || isPatientLocked}
                      className="inline-flex rounded-full border border-[#3b424b] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-[#9dccff] transition hover:border-[#9dccff] hover:bg-[#15202b] disabled:cursor-not-allowed disabled:border-[#31363f] disabled:bg-[#10151c] disabled:text-[#6b7280]"
                    >
                      Assign to Me
                    </button>
                  )}
                  {isDoctorAssigned && currentDoctor && !isLoadingDoctors && (
                    <span
                      className="inline-flex rounded-full border border-[#1f4d36] bg-[#0e2519] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-[#bbf7d0]">
                     Assigned
                   </span>
                  )}
                </div>

                <BackButton/>
              </div>

              <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
                <button
                  type="button"
                  onClick={() => canEditPatientRecord && setIsEditDialogOpen(true)}
                  disabled={!canEditPatientRecord}
                  className="inline-flex w-fit px-0 py-0 text-[11px] font-semibold uppercase tracking-[0.16em] text-[#9dccff] transition hover:text-white disabled:cursor-not-allowed disabled:text-[#6b7280]"
                >
                  Edit patient
                </button>

                <Link
                  to={`/patients/${id}/medical-history`}
                  className="inline-flex w-fit px-0 py-0 text-[11px] font-semibold uppercase tracking-[0.16em] text-[#ffcc80] transition hover:text-white"
                >
                  Clinical Records
                </Link>

                <Link
                  to={`/patients/${id}/admission-history`}
                  className="inline-flex w-fit px-0 py-0 text-[11px] font-semibold uppercase tracking-[0.16em] text-[#b8f5c8] transition hover:text-white"
                >
                  Admission history
                </Link>
              </div>

              <div className="mt-4 border-t border-[#2b3139] pt-4">
                <div className="grid gap-6 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-6">
                  {patientMetadata.map((item) => (
                    <div
                      key={item.label}
                      className={item.isWide ? "xl:col-span-2" : ""}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#879196]">
                          {item.label}
                        </p>
                        {item.label === "Phone Number"}
                      </div>
                      <p
                        className={`mt-1 text-base font-semibold text-white ${item.isWide ? "wrap-break-word whitespace-normal leading-relaxed" : ""}`}
                      >
                        {item.value}
                      </p>
                    </div>
                  ))}
                </div>

                {patient?.is_discharged && (
                  <div className="mt-6 rounded-2xl border border-[#6b1d1d] bg-[#241212] p-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[#fca5a5]">Discharge Summary</p>
                    <div className="mt-3 grid gap-3 sm:grid-cols-2">
                      <div>
                        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#bfa7a7]">Date</p>
                        <p className="mt-1 text-sm font-medium text-white">{formatDateTime(patient.discharge_date)}</p>
                      </div>
                      <div className="sm:col-span-2">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#bfa7a7]">Reason</p>
                        <p className="mt-1 text-sm font-medium text-white">{patient.discharge_reason || "--"}</p>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </header>

        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <div className="monitor-card rounded-3xl p-4">
            <p className="text-xs uppercase tracking-[0.25em] text-[#879196]">Heart Rate</p>
            <p className="mt-3 text-3xl font-semibold text-[#ffb84d]">{latestDisplayedVital ? latestDisplayedVital.heart_rate : "--"}</p>
          </div>

          <div className="monitor-card rounded-3xl p-4">
            <p className="text-xs uppercase tracking-[0.25em] text-[#879196]">O2 Saturation</p>
            <p
              className="mt-3 text-3xl font-semibold text-[#9dccff]">{latestDisplayedVital ? latestDisplayedVital.oxygen_saturation : "--"}</p>
          </div>

          <div className="monitor-card rounded-3xl p-4">
            <p className="text-xs uppercase tracking-[0.25em] text-[#879196]">Temperature</p>
            <p className="mt-3 text-3xl font-semibold text-[#ffd699]">{latestDisplayedVital ? latestDisplayedVital.temperature : "--"}</p>
          </div>

          <div className="monitor-card rounded-3xl p-4">
            <p className="text-xs uppercase tracking-[0.25em] text-[#879196]">Blood Pressure</p>
            <p className="mt-3 text-3xl font-semibold text-white">
              {latestDisplayedVital ? `${latestDisplayedVital.systolic_bp}/${latestDisplayedVital.diastolic_bp}` : "--"}
            </p>
          </div>
        </section>

        <section className="grid gap-6 xl:grid-cols-[1.5fr_0.9fr]">
          <div className="monitor-card rounded-[28px] p-6">
            <div className="mb-5 flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.3em] text-[#ff9900]">Vitals</p>
                <h2 className="mt-2 text-2xl font-semibold text-white">Vitals Timeline</h2>
              </div>
              <span className="console-chip rounded-full px-3 py-1 text-xs font-semibold">
                {vitals.length} visible
              </span>
            </div>

            <PaginationControls
              page={vitalsPage}
              maxPage={maxVitalsPage}
              onPrevious={() => setVitalsPage((prev) => Math.max(1, prev - 1))}
              onNext={() => setVitalsPage((prev) => prev + 1)}
            />

            <ul className="space-y-3">
              {vitals.length === 0 && (
                <li className="rounded-2xl border border-[#3b424b] bg-[#151b22] px-4 py-5 text-sm text-[#b6bec9]">
                  {isLoadingPatient ? "Loading patient view..." : "Waiting for patient vitals. Data will appear here when available."}
                </li>
              )}

              {paginatedVitals.map((v, index) => (
                <li key={`${v.recorded_at || v.time}-${index}`} className="rounded-2xl border border-[#3b424b] bg-[#151b22] p-4">
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:gap-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.25em] text-[#879196]">{v.time}</p>

                    <div className="grid flex-1 grid-cols-2 gap-3 sm:grid-cols-4">
                      <div className="monitor-panel rounded-2xl px-3 py-3">
                        <p className="text-xs uppercase tracking-[0.22em] text-[#879196]">HR</p>
                        <p className="mt-2 font-semibold text-[#ffb84d]">{v.heart_rate}</p>
                      </div>

                      <div className="monitor-panel rounded-2xl px-3 py-3">
                        <p className="text-xs uppercase tracking-[0.22em] text-[#879196]">O2</p>
                        <p className="mt-2 font-semibold text-[#9dccff]">{v.oxygen_saturation}</p>
                      </div>

                      <div className="monitor-panel rounded-2xl px-3 py-3">
                        <p className="text-xs uppercase tracking-[0.22em] text-[#879196]">Temp</p>
                        <p className="mt-2 font-semibold text-[#ffd699]">{v.temperature}</p>
                      </div>

                      <div className="monitor-panel rounded-2xl px-3 py-3">
                        <p className="text-xs uppercase tracking-[0.22em] text-[#879196]">BP</p>
                        <p className="mt-2 font-semibold text-white">{v.systolic_bp}/{v.diastolic_bp}</p>
                      </div>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </div>
          <div className="grid gap-6">
            <div className="monitor-card rounded-[28px] p-6">
              <div className="mb-5 flex items-center justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.3em] text-[#ff9900]">Escalations</p>
                  <h2 className="mt-2 text-2xl font-semibold text-white">Patient Alerts</h2>
                </div>
              </div>

              <ul className="space-y-3">
                {alerts.length === 0 && (
                  <li className="rounded-2xl border border-[#3b424b] bg-[#151b22] px-4 py-5 text-sm text-[#b6bec9]">
                    This patient has no alerts.
                  </li>
                )}

                {previewAlerts.map((alert) => (
                  <li key={alert.id} className={`alert-item alert-${alert.severity}`}>
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-xs uppercase tracking-[0.28em] text-white/70">{alert.severity} severity</p>
                        <p className="mt-2 text-sm font-medium text-inherit">{alert.message}</p>
                      </div>

                      <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/70">
                        {new Date(alert.created_at || Date.now()).toLocaleTimeString()}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>

              {alerts.length > 3 && (
                <div className="mt-4">
                  <Link
                    className="console-button-secondary block rounded-2xl px-4 py-3 text-center text-sm font-semibold"
                    to={patient?.cnp
                      ? `/alerts?cnp=${encodeURIComponent(patient.cnp)}&patient=${encodeURIComponent(patientFullName)}`
                      : "/alerts"}
                  >
                    More
                  </Link>
                </div>
              )}
            </div>

            <div className="monitor-card rounded-[28px] p-6">
              <div className="mb-5 flex items-center justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.3em] text-[#ff9900]">Schedule</p>
                  <h2 className="mt-2 text-2xl font-semibold text-white">Patient Activities</h2>
                </div>
                <button
                  onClick={openActivityDialog}
                  disabled={!canManagePatientActivities}
                  className="console-button-secondary rounded-full px-3 py-1 text-xs font-semibold disabled:cursor-not-allowed disabled:border-[#4d5661] disabled:bg-[#3b424b] disabled:text-[#b6bec9]"
                >
                  Add Activity
                </button>
              </div>

              {activityLoadError ? (
                <div className="rounded-2xl border border-[#3b424b] bg-[#151b22] px-4 py-5 text-sm text-[#b6bec9]">
                  {activityLoadError}
                </div>
              ) : (
                <ActivityList
                  activities={patientActivities}
                  canManageActivity={canCurrentDoctorManageActivity}
                  emptyMessage="No activities exist for this patient."
                  isLoading={isLoadingActivities}
                  loadingMessage="Loading patient activities..."
                  onCancel={(activity) => setActivityPendingCancellation(activity)}
                  onEdit={handleActivityEdit}
                />
              )}
            </div>
          </div>
        </section>
      </div>

      {showActivityDialog && (
        <PatientActivityDialog
          activity={selectedActivity}
          activityTypes={activityTypes}
          currentDoctorId={currentDoctor?.id}
          doctors={departmentDoctors}
          isOpen={showActivityDialog}
          isSubmitting={isSavingActivity}
          mode={activityDialogMode}
          onClose={() => {
            setShowActivityDialog(false)
            setSelectedActivity(null)
          }}
          onSubmit={handleActivitySubmit}
          patients={patientActivityOptions}
          patientSelectionMode="hidden"
        />
      )}

      {activityPendingCancellation && (
        <div className="console-modal-overlay z-50">
          <div className="console-modal monitor-card rounded-[28px] p-6 w-full max-w-md">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.3em] text-[#ff9900]">Patient Activities</p>
              <h2 className="mt-2 text-2xl font-semibold text-white">Cancel Activity</h2>
              <p className="mt-3 text-sm text-[#b6bec9]">Are you sure you want to cancel this activity?</p>
            </div>

            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setActivityPendingCancellation(null)}
                disabled={isSavingActivity}
                className="console-button-secondary rounded-2xl px-4 py-3 text-sm font-semibold"
              >
                Keep Activity
              </button>
              <button
                type="button"
                onClick={handleCancelActivity}
                disabled={isSavingActivity}
                className="rounded-2xl border border-[#a33a45] bg-[#3a1f25] px-4 py-3 text-sm font-semibold text-[#ffd8dc] transition hover:bg-[#47262d] disabled:cursor-not-allowed disabled:border-[#4d5661] disabled:bg-[#3b424b] disabled:text-[#b6bec9]"
              >
                {isSavingActivity ? "Canceling..." : "Yes, Cancel Activity"}
              </button>
            </div>
          </div>
        </div>
      )}

      <EditPatientDialog
        isOpen={isEditDialogOpen}
        isSubmitting={isSavingPatient}
        patient={patient}
        onClose={() => setIsEditDialogOpen(false)}
        onSubmit={handlePatientUpdate}
      />

      <DepartmentTransferDialog
        currentDepartment={department}
        isOpen={isTransferDialogOpen}
        isSubmitting={isUpdatingDepartment}
        onClose={() => setIsTransferDialogOpen(false)}
        onSubmit={handleDepartmentTransfer}
      />
    </div>
  )
}
