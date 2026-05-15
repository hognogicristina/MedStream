import {useCallback, useEffect, useMemo, useState} from "react"
import {Link, useNavigate} from "react-router-dom"
import {
  Alert,
  Badge,
  Box,
  Button,
  ColumnLayout,
  Container,
  ContentLayout,
  Header,
  Modal,
  Pagination,
  Select,
  SpaceBetween,
  StatusIndicator,
} from "@cloudscape-design/components"
import CountValue from "../components/CountValue.jsx"
import DataTable from "../components/DataTable.jsx"
import ActivityDialog from "../components/ActivityDialog.jsx"
import LoadingSpinner from "../components/LoadingSpinner.jsx"
import AppBreadcrumbs from "../components/AppBreadcrumbs.jsx"
import AwsDatePicker from "../components/AwsDatePicker.jsx"
import HoverTextDropdown from "../components/HoverTextDropdown.jsx"
import InfoHelp from "../components/InfoHelp.jsx"
import {useNotifications} from "../hooks/useNotifications.js"
import {useAuth} from "../components/AuthContext.jsx"
import {resendVerificationEmail} from "../services/authApi.js"
import {
  assignPatientToDoctor,
  createDoctorActivity,
  deactivateDoctor,
  getAvailableDoctors,
  getCurrentDoctor,
  getDoctorActivities,
  getDoctorPatients,
  listDoctors,
  removePatientFromDoctor,
  updateCurrentDoctor,
  updateCurrentDoctorEmail,
  updateDoctorActivity,
} from "../services/doctorApi.js"
import {
  getActivityOptions,
  getDepartments,
  getPatientActivities,
  getPatientDoctors,
  listPatients,
  searchPatientsByCnp,
  transferPatient
} from "../services/patientApi.js"
import {getErrorMessage, getResponseData, getResponseMessage} from "../services/apiMessages.js"
import {formatPatientFullName} from "../utils/patients.js"
import {buildPatientPhoneNumber, normalizeRomanianPhoneNumber, ROMANIA_PHONE_PLACEHOLDER} from "../utils/patientPhone.js"
import {getTodayIsoDate, isIsoDateInRange} from "../utils/date.js"

const buildDoctorProfileForm = (doctor) => ({
  first_name: doctor?.first_name || "",
  last_name: doctor?.last_name || "",
  specialization: doctor?.specialization || "",
  license_number: doctor?.license_number || "",
  birth_date: doctor?.birth_date || "",
})

function getSelectedOption(options, value) {
  return options.find((option) => String(option.value) === String(value)) || null
}

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

function toEpoch(value) {
  const time = value ? new Date(value).getTime() : Number.NaN
  return Number.isFinite(time) ? time : 0
}

function sortActivitiesByStatus(items) {
  const statusRank = {
    incoming: 1,
    completed: 2,
    canceled: 3,
  }

  return [...items].sort((left, right) => {
    const leftRank = statusRank[left.status] ?? 99
    const rightRank = statusRank[right.status] ?? 99

    if (leftRank !== rightRank) {
      return leftRank - rightRank
    }

    if (left.status === "incoming") {
      const leftTime = toEpoch(left.scheduled_at || left.created_at)
      const rightTime = toEpoch(right.scheduled_at || right.created_at)
      if (leftTime !== rightTime) {
        return leftTime - rightTime
      }
      return (left.id || 0) - (right.id || 0)
    }

    if (left.status === "completed") {
      const leftTime = toEpoch(left.completed_at || left.updated_at || left.created_at)
      const rightTime = toEpoch(right.completed_at || right.updated_at || right.created_at)
      if (leftTime !== rightTime) {
        return rightTime - leftTime
      }
      return (right.id || 0) - (left.id || 0)
    }

    if (left.status === "canceled") {
      const leftTime = toEpoch(left.canceled_at || left.updated_at || left.created_at)
      const rightTime = toEpoch(right.canceled_at || right.updated_at || right.created_at)
      if (leftTime !== rightTime) {
        return rightTime - leftTime
      }
      return (right.id || 0) - (left.id || 0)
    }

    return (left.id || 0) - (right.id || 0)
  })
}

function sortAssignedPatients(items) {
  const statusRank = (patient) => patient?.is_discharged ? 1 : 0

  return items
    .map((patient, index) => ({patient, index}))
    .sort((left, right) => {
      const leftStatusRank = statusRank(left.patient)
      const rightStatusRank = statusRank(right.patient)
      if (leftStatusRank !== rightStatusRank) {
        return leftStatusRank - rightStatusRank
      }

      const leftName = formatPatientFullName(left.patient).trim()
      const rightName = formatPatientFullName(right.patient).trim()
      const nameComparison = leftName.localeCompare(rightName, "ro", {sensitivity: "base"})
      if (nameComparison !== 0) {
        return nameComparison
      }

      const leftId = Number(left.patient?.id || 0)
      const rightId = Number(right.patient?.id || 0)
      if (leftId !== rightId) {
        return leftId - rightId
      }

      return left.index - right.index
    })
    .map((entry) => entry.patient)
}

function formatActivityDateTime(value) {
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

function formatActivityPeople(items, prefix = "") {
  if (!items || items.length === 0) {
    return "--"
  }

  return items.map((item) => `${prefix}${item.first_name} ${item.last_name}`).join(", ")
}

function getActivityStatusType(status) {
  if (status === "completed") {
    return "success"
  }
  if (status === "canceled") {
    return "stopped"
  }
  if (status === "incoming") {
    return "pending"
  }
  return "info"
}

function getActivityStatusColor(status) {
  return status === "incoming" ? "yellow" : undefined
}

function formatActivityStatus(status) {
  if (!status) {
    return "--"
  }

  return `${status.charAt(0).toUpperCase()}${status.slice(1)}`
}

export default function ProfilePage() {
  const EMAIL_VERIFICATION_STATUS_POLL_MS = 30000
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
  const [isCheckingTransferActivities, setIsCheckingTransferActivities] = useState(false)
  const [showTransferActivityConfirmation, setShowTransferActivityConfirmation] = useState(false)
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
  const [activityPage, setActivityPage] = useState(1)
  const activityPageSize = assignedPatients.length >= 4 ? 2 : 1
  const paginatedActivities = useMemo(() => {
    const start = (activityPage - 1) * activityPageSize
    return activities.slice(start, start + activityPageSize)
  }, [activities, activityPage, activityPageSize])
  const totalActivityPages = Math.ceil(activities.length / activityPageSize)

  const authHeaders = useMemo(() => ({
    Authorization: `Bearer ${token}`,
  }), [token])
  const hasIncomingActivities = activities.some((activity) => activity.status === "incoming")
  const hasAdmittedAssignedPatients = assignedPatients.some((patient) => !patient.is_discharged)
  const hasCurrentDepartmentReplacement = Boolean(
    doctor
    && allDoctors.some((item) => item.is_active && item.specialization === doctor.specialization && item.id !== doctor.id),
  )
  const isSpecializationChangeBlocked = Boolean(
    doctor
    && (hasIncomingActivities || hasAdmittedAssignedPatients || !hasCurrentDepartmentReplacement),
  )
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
        const response = await getPatientDoctors(patient.id)
        const doctorsList = getResponseData(response) || []
        return [patient.id, doctorsList.length]
      } catch {
        return [patient.id, 0]
      }
    }))

    setPatientDoctorCounts(Object.fromEntries(entries))
  }

  const refreshAssignedPatients = async (doctorId) => {
    if (!doctorId) {
      setAssignedPatients([])
      setPatientDoctorCounts({})
      return []
    }

    const assignedPatientsResponse = await getDoctorPatients(doctorId)
    const nextAssignedPatients = sortAssignedPatients(getResponseData(assignedPatientsResponse) || [])
    setAssignedPatients(nextAssignedPatients)
    await loadAssignedDoctorCounts(nextAssignedPatients)
    return nextAssignedPatients
  }

  const refetchActivities = async (doctorId) => {
    if (!doctorId) {
      setActivities([])
      return []
    }

    const activitiesResponse = await getDoctorActivities(doctorId)
    const nextActivities = (getResponseData(activitiesResponse) || []).map((activity) =>
      normalizeActivity(activity, patients, allDoctors),
    )
    setActivities(sortActivitiesByStatus(nextActivities))
    return nextActivities
  }

  const refetchDoctorProfile = useCallback(async () => {
    const response = await getCurrentDoctor(authHeaders)
    const doctorData = getResponseData(response)
    setDoctor((current) => ({...(current || {}), ...doctorData}))
    return doctorData
  }, [authHeaders])

  useEffect(() => {
    const loadWorkspace = async () => {
      if (!token) {
        setIsLoading(false)
        return
      }

      setIsLoading(true)

      try {
        const doctorResponse = await getCurrentDoctor(authHeaders)
        const currentDoctor = getResponseData(doctorResponse)
        const [assignedPatientsResponse, patientsResponse, activitiesResponse, doctorsResponse, departmentsResponse, activityTypesResponse] = await Promise.all([
          getDoctorPatients(currentDoctor.id),
          listPatients({page: 1, limit: 100}),
          getDoctorActivities(currentDoctor.id),
          listDoctors(),
          getDepartments(),
          getActivityOptions(),
        ])

        const assignedPatientsData = sortAssignedPatients(getResponseData(assignedPatientsResponse) || [])
        const patientsData = getResponseData(patientsResponse) || []
        const doctorsData = getResponseData(doctorsResponse) || []
        const normalizedActivities = (getResponseData(activitiesResponse) || []).map((activity) => normalizeActivity(activity, patientsData, doctorsData))

        setDoctor(currentDoctor)
        setAssignedPatients(assignedPatientsData)
        setPatients(patientsData)
        setActivities(sortActivitiesByStatus(normalizedActivities))
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
  const departmentOptions = departments.map((department) => ({label: department, value: department}))
  const maxBirthDate = getTodayIsoDate()
  const transferDoctorSelectOptions = transferDoctorOptions.map((item) => ({
    label: `Dr. ${item.first_name} ${item.last_name}`,
    value: String(item.id),
  }))
  const isProfileFormValid = Boolean(
    form.first_name.trim()
    && form.last_name.trim()
    && form.specialization.trim()
    && form.license_number.trim()
    && isIsoDateInRange(form.birth_date, {max: maxBirthDate})
  )
  const initialProfileForm = buildDoctorProfileForm(doctor)
  const normalizedPhoneNumber = buildPatientPhoneNumber(phoneNumber)
  const initialPhoneNumber = normalizeRomanianPhoneNumber(doctor?.phone_number)
  const isProfileDirty = Object.keys(initialProfileForm).some((key) => form[key] !== initialProfileForm[key]) || normalizedPhoneNumber !== initialPhoneNumber
  const displayedEmail = doctor?.pending_email || doctor?.email || ""
  const isEmailUnverified = doctor?.email_confirmed === false
  const isPendingEmail = Boolean(doctor?.pending_email) || doctor?.email_confirmed === false
  const isEmailDirty = emailInput.trim() && emailInput.trim() !== displayedEmail
  const shouldShowResendVerification = Boolean(doctor?.email_confirmed === false && doctor?.email_verification_expired === true)
  const normalizedAssignmentQuery = assignmentQuery.trim().toLowerCase()
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
  const matchingAssignmentSuggestions = filteredAssignedPatients.filter((patient) => {
    if (!normalizedAssignmentQuery || selectedPatient) {
      return true
    }

    const patientName = formatPatientFullName(patient).toLowerCase()
    return patient.cnp.toLowerCase().includes(normalizedAssignmentQuery) || patientName.includes(normalizedAssignmentQuery)
  })
  const assignmentSuggestions = selectedPatient ? filteredAssignedPatients : matchingAssignmentSuggestions

  useEffect(() => {
    if (!doctor || doctor.email_confirmed) {
      return
    }

    const pollId = window.setInterval(async () => {
      try {
        await refetchDoctorProfile()
      } catch (error) {
        void error
      }
    }, EMAIL_VERIFICATION_STATUS_POLL_MS)

    return () => {
      window.clearInterval(pollId)
    }
  }, [doctor, refetchDoctorProfile])

  const handleActivitySubmit = async (payload) => {
    if (!doctor || isSubmittingActivity) {
      return
    }

    setIsSubmittingActivity(true)

    try {
      const response = activityDialogMode === "edit" && selectedActivity
        ? await updateDoctorActivity(doctor.id, selectedActivity.id, payload, authHeaders)
        : await createDoctorActivity(doctor.id, payload, authHeaders)
      const nextActivity = normalizeActivity(getResponseData(response), patients, allDoctors)
      setActivities((current) => sortActivitiesByStatus([...current.filter((item) => item.id !== nextActivity.id), nextActivity]))
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
    if (activity.status === "canceled" || activity.status === "completed") {
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
    if (activityPendingCancellation.status === "completed") {
      return
    }

    setIsSubmittingActivity(true)

    try {
      const response = await updateDoctorActivity(doctor.id, activityPendingCancellation.id, {
        status: "canceled",
      }, authHeaders)
      const nextActivity = normalizeActivity(getResponseData(response), patients, allDoctors)
      setActivities((current) => sortActivitiesByStatus([...current.filter((item) => item.id !== nextActivity.id), nextActivity]))
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

      const response = await updateCurrentDoctor(payload, authHeaders)

      const doctorData = getResponseData(response)
      setDoctor(doctorData)
      setForm(buildDoctorProfileForm(doctorData))
      setPhoneNumber(normalizeRomanianPhoneNumber(doctorData.phone_number))
      const [doctorsResponse] = await Promise.all([
        listDoctors(),
        refreshAssignedPatients(doctorData.id),
        refetchActivities(doctorData.id),
      ])
      setAllDoctors(getResponseData(doctorsResponse) || [])
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
      const response = await updateCurrentDoctorEmail({email: emailInput.trim()}, authHeaders)
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
      const response = await resendVerificationEmail({headers: authHeaders})
      await refetchDoctorProfile()
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
      if (selectedPatient?.cnp) {
        try {
          await searchPatientsByCnp(selectedPatient.cnp)
        } catch (error) {
          void error
        }
      }
      const response = await assignPatientToDoctor(doctor.id, selectedPatient.id, authHeaders)
      const nextAssignedPatients = sortAssignedPatients(getResponseData(response) || [])
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
      const response = await removePatientFromDoctor(doctor.id, patientId, authHeaders)
      const nextAssignedPatients = sortAssignedPatients(getResponseData(response) || [])
      setAssignedPatients(nextAssignedPatients)
      await loadAssignedDoctorCounts(nextAssignedPatients)
      await refetchActivities(doctor.id)
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

    setShowTransferActivityConfirmation(false)
    setPatientPendingTransfer(patient)
    setSelectedTransferDoctorId("")
    setTransferDoctorOptions([])
    setIsLoadingTransferDoctors(true)

    try {
      const response = await getAvailableDoctors(patient.department, doctor.id, authHeaders)
      setTransferDoctorOptions(getResponseData(response) || [])
    } catch (error) {
      setPatientPendingTransfer(null)
      notifyError(getErrorMessage(error))
    } finally {
      setIsLoadingTransferDoctors(false)
    }
  }

  const closeTransferDialog = () => {
    setPatientPendingTransfer(null)
    setSelectedTransferDoctorId("")
    setTransferDoctorOptions([])
    setShowTransferActivityConfirmation(false)
    setIsCheckingTransferActivities(false)
  }

  const executePatientTransfer = async () => {
    if (!doctor || !patientPendingTransfer || !selectedTransferDoctorId || isTransferringPatient) {
      return
    }

    setIsTransferringPatient(true)
    try {
      const response = await transferPatient(
        patientPendingTransfer.id,
        {
          from_doctor_id: doctor.id,
          to_doctor_id: Number(selectedTransferDoctorId),
        },
        authHeaders,
      )
      await refreshAssignedPatients(doctor.id)
      await refetchActivities(doctor.id)
      closeTransferDialog()
      notifySuccess(getResponseMessage(response))
    } catch (error) {
      notifyError(getErrorMessage(error))
    } finally {
      setIsTransferringPatient(false)
    }
  }

  const handleTransferPatient = async () => {
    if (!patientPendingTransfer || !selectedTransferDoctorId || isTransferringPatient || isCheckingTransferActivities) {
      return
    }

    setIsCheckingTransferActivities(true)
    try {
      const activitiesResponse = await getPatientActivities(patientPendingTransfer.id)
      const patientActivities = getResponseData(activitiesResponse) || []
      const hasIncomingActivities = patientActivities.some((activity) => activity.status === "incoming")

      if (hasIncomingActivities) {
        setShowTransferActivityConfirmation(true)
        return
      }

      await executePatientTransfer()
    } catch (error) {
      notifyError(getErrorMessage(error))
    } finally {
      setIsCheckingTransferActivities(false)
    }
  }

  const handleConfirmTransferPatient = async () => {
    if (isTransferringPatient) {
      return
    }
    await executePatientTransfer()
  }

  const handleDeleteAccount = async () => {
    if (!doctor || isOnlyDoctorInDepartment) {
      return
    }

    setIsDeletingAccount(true)

    try {
      const response = await deactivateDoctor(doctor.id, authHeaders)
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
  }, [activities, activityPageSize])

  return (
    <>
      <ContentLayout>
        <SpaceBetween size="m">
          <div className="medstream-page-header">
            <AppBreadcrumbs/>
            <div className="medstream-page-heading-row">
              <div>
                <h1 className="medstream-page-title">Doctor Control Panel</h1>
                <p>Manage profile details, patient assignments, and account status from one workspace.</p>
                <div className="medstream-page-filter-row">
                  <StatusIndicator type={doctor ? (doctor.is_active ? "success" : "stopped") : "pending"}>
                    {doctor ? (doctor.is_active ? "Active" : "Inactive") : "--"}
                  </StatusIndicator>
                  <StatusIndicator type={isEmailUnverified || isPendingEmail ? "pending" : "success"}>
                    {isEmailUnverified || isPendingEmail ? "Email pending" : "Email verified"}
                  </StatusIndicator>
                  <span className="medstream-department-badge">
                    <Badge color="blue">{doctor?.specialization || "No specialization"}</Badge>
                  </span>
                </div>
              </div>
            </div>
          </div>

          {isLoading ? (
            <LoadingSpinner/>
          ) : doctor ? (
            <SpaceBetween size="l">
              <Container>
                <ColumnLayout columns={4} variant="text-grid">
                  <SpaceBetween size="xs">
                    <Box color="text-body-secondary" variant="awsui-key-label">Account status</Box>
                    <Box variant="h2">{doctor.is_active ? "Active" : "Inactive"}</Box>
                  </SpaceBetween>
                  <SpaceBetween size="xs">
                    <Box color="text-body-secondary" variant="awsui-key-label">Assigned patients</Box>
                    <Box variant="h2"><CountValue value={assignedPatients.length}/></Box>
                  </SpaceBetween>
                  <SpaceBetween size="xs">
                    <Box color="text-body-secondary" variant="awsui-key-label">Available patients</Box>
                    <Box variant="h2"><CountValue value={filteredAssignedPatients.length}/></Box>
                  </SpaceBetween>
                  <SpaceBetween size="xs">
                    <Box color="text-body-secondary" variant="awsui-key-label">Incoming activities</Box>
                    <Box variant="h2"><CountValue value={activities.filter((activity) => activity.status === "incoming").length}/></Box>
                  </SpaceBetween>
                </ColumnLayout>
              </Container>

              <div className="medstream-dashboard-split">
                <div className="medstream-stretch-container">
                  <Container
                    header={
                      <Header
                        variant="h2"
                        description="Patients currently assigned to this doctor."
                        counter={`(${assignedPatients.length})`}
                      >
                        Assigned patients
                      </Header>
                    }
                  >
                    <DataTable
                      items={assignedPatients}
                      loading={isLoading}
                      emptyMessage="No patients are currently assigned to this doctor."
                      pageSize={4}
                      controlsLayoutClassName="hidden"
                      getItemKey={(patient) => patient.id}
                      shellClassName="medstream-profile-list-shell"
                      bodyClassName="medstream-profile-list"
                      renderRow={(patient) => (
                        <div className="medstream-profile-list-row">
                          <div className="medstream-profile-row-main">
                            <div>
                              <div className="flex flex-wrap items-center gap-2">
                                <Link className="console-link text-base font-semibold transition" to={`/patient/${patient.id}`}>
                                  {formatPatientFullName(patient)}
                                </Link>
                                {patient.is_discharged && (
                                  <StatusIndicator type="stopped">Discharged</StatusIndicator>
                                )}
                              </div>
                              <p className="medstream-profile-row-meta">{patient.department}</p>
                              <p className="mt-1 text-sm text-[var(--text-secondary)]">{patient.cnp}</p>
                            </div>
                            {(() => {
                              const hasCount = Object.prototype.hasOwnProperty.call(patientDoctorCounts, patient.id)
                              const assignedDoctorCount = hasCount ? patientDoctorCounts[patient.id] : 2
                              const shouldTransfer = assignedDoctorCount <= 1
                              return (
                                <Button
                                  onClick={() => {
                                    if (shouldTransfer) {
                                      openTransferDialog(patient)
                                      return
                                    }
                                    setPatientPendingRemoval(patient)
                                  }}
                                  disabled={removingPatientId === patient.id || isTransferringPatient}
                                >
                                  {shouldTransfer ? "Transfer patient" : (removingPatientId === patient.id ? "Removing..." : "Remove patient")}
                                </Button>
                              )
                            })()}
                          </div>
                        </div>
                      )}
                    />
                  </Container>
                </div>

                <div className="medstream-stretch-container">
                  <Container
                    header={
                      <Header
                        variant="h2"
                        description="Upcoming work linked to your assigned patients."
                        actions={
                          <Button
                            onClick={() => {
                              setActivityDialogMode("create")
                              setSelectedActivity(null)
                              setIsActivityDialogOpen(true)
                            }}
                            disabled={activityPatients.length === 0}
                          >
                            Add activity
                          </Button>
                        }
                      >
                        Upcoming activities
                      </Header>
                    }
                  >
                    <SpaceBetween size="xs">
                      {isLoading ? (
                        <Box color="text-body-secondary">Loading doctor activities...</Box>
                      ) : paginatedActivities.length === 0 ? (
                        <Box color="text-body-secondary">No future activities are scheduled for this doctor.</Box>
                      ) : (
                        paginatedActivities.map((activity) => {
                          const isCanceled = activity.status === "canceled"
                          const isCompleted = activity.status === "completed"
                          const isReadOnly = isCanceled || isCompleted
                          const canEdit = !isReadOnly
                          const canCancel = !isReadOnly

                          return (
                            <Container key={activity.id} fitHeight>
                              <SpaceBetween size="xxs">
                                <Box variant="small">
                                  <StatusIndicator
                                    type={getActivityStatusType(activity.status)}
                                    colorOverride={getActivityStatusColor(activity.status)}
                                  >
                                    {formatActivityStatus(activity.status)}
                                  </StatusIndicator>
                                </Box>
                                <Box variant="h3">{activity.title}</Box>
                                <Box color="text-body-secondary" variant="small">{activity.type}</Box>
                                {activity.description && (
                                  <Box color="text-body-secondary" variant="small">{activity.description}</Box>
                                )}
                                <Box color="text-body-secondary" variant="small">{formatActivityDateTime(activity.scheduled_at)}</Box>
                                <Box color="text-body-secondary" variant="small">
                                  Doctors: {formatActivityPeople(activity.doctors, "Dr. ")}
                                </Box>
                                <Box color="text-body-secondary" variant="small">
                                  Patients: {formatActivityPeople(activity.patients)}
                                </Box>
                                <div className="medstream-profile-activity-actions">
                                  <Button
                                    onClick={() => canEdit && handleActivityEdit(activity)}
                                    disabled={!canEdit}
                                  >
                                    Edit
                                  </Button>
                                  <Button
                                    onClick={() => canCancel && setActivityPendingCancellation(activity)}
                                    disabled={!canCancel}
                                  >
                                    Cancel activity
                                  </Button>
                                </div>
                              </SpaceBetween>
                            </Container>
                          )
                        })
                      )}
                    </SpaceBetween>
                    {totalActivityPages > 1 && (
                      <div className="medstream-profile-pagination">
                        <Pagination
                          currentPageIndex={activityPage}
                          pagesCount={totalActivityPages}
                          onChange={({detail}) => setActivityPage(detail.currentPageIndex)}
                        />
                      </div>
                    )}
                  </Container>
                </div>
              </div>

              <div className="medstream-profile-settings-grid">
                <div className="medstream-stretch-container">
                  <Container
                    header={
                      <Header
                        variant="h2"
                        description="Identity, specialization, license, and contact details."
                      >
                        Editable doctor info
                      </Header>
                    }
                  >
                    <form className="medstream-form" onSubmit={handleProfileUpdate}>
                      <div className="medstream-form-grid">
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
                        <div className="login-field">
                          <span className="medstream-label-with-help">
                            <label className="login-label" htmlFor="specialization">Specialization</label>
                            <InfoHelp
                              ariaLabel="specialization help"
                              title="Specialization changes"
                              body={[
                                "Specialization cannot be changed while incoming activities exist or you still have admitted assigned patients.",
                                "A replacement active doctor must remain in the current department before your specialization changes.",
                              ]}
                              footer="This keeps patients and activities assigned to a doctor in the matching department."
                            />
                          </span>
                          <Select
                            selectedOption={getSelectedOption(departmentOptions, form.specialization)}
                            onChange={({detail}) => handleFormChange({target: {name: "specialization", value: detail.selectedOption.value}})}
                            options={departmentOptions}
                            placeholder="Select specialization"
                            selectedAriaLabel="Selected specialization"
                            disabled={isSpecializationChangeBlocked}
                          />
                        </div>
                        <div className="login-field">
                          <label className="login-label" htmlFor="license_number">License Number</label>
                          <input id="license_number" name="license_number" type="text" value={form.license_number} onChange={handleFormChange}
                                 className="login-input" placeholder="Example: DOC-20458" required/>
                        </div>
                        <div className="login-field">
                          <label className="login-label" htmlFor="doctor-birth-date">Birth Date</label>
                          <AwsDatePicker
                            id="doctor-birth-date"
                            name="birth_date"
                            value={form.birth_date}
                            onChange={(value) => handleFormChange({target: {name: "birth_date", value}})}
                            className="login-input"
                            max={maxBirthDate}
                            required
                          />
                        </div>
                        <div className="login-field">
                          <label className="login-label" htmlFor="doctor-phone-number">Phone Number</label>
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

                      <div className="medstream-form-actions">
                        <Button
                          formAction="submit"
                          variant="primary"
                          className="medstream-submit-button"
                          disabled={!isProfileFormValid || !isProfileDirty || isSavingProfile}
                        >
                          {isSavingProfile ? "Updating..." : "Update profile"}
                        </Button>
                      </div>
                    </form>
                  </Container>
                </div>

                <div className="medstream-stretch-container">
                  <Container
                    header={
                      <Header variant="h2" description="Assign an admitted patient from your specialization.">
                        Assign patient
                      </Header>
                    }
                  >
                    <form className="medstream-form" onSubmit={handleAssignPatient}>
                      <div className="login-field relative">
                        <label className="login-label" htmlFor="assigned_patient">Patient CNP or Full Name</label>
                        <input
                          id="assigned_patient"
                          type="text"
                          value={assignmentQuery}
                          onChange={(event) => setAssignmentQuery(event.target.value)}
                          className="login-input"
                          placeholder="Example: 6010101123451 or Popescu Andrei"
                          autoComplete="off"
                          disabled={filteredAssignedPatients.length === 0 || isAssigningPatient}
                        />

                        {assignmentSuggestions.length > 0 && (
                          <div className="medstream-profile-suggestions custom-scrollbar">
                            {assignmentSuggestions.map((patient) => {
                              const isSelectedSuggestion = selectedPatient?.id === patient.id
                              return (
                                <button
                                  type="button"
                                  key={patient.id}
                                  className={`medstream-profile-suggestion ${isSelectedSuggestion ? "medstream-profile-suggestion-selected" : ""}`}
                                  aria-current={isSelectedSuggestion ? "true" : undefined}
                                  onClick={() => {
                                    setAssignmentQuery(`${patient.cnp} | ${formatPatientFullName(patient)}`)
                                  }}
                                >
                                  <span className="font-semibold text-[var(--text-primary)]">{patient.cnp}</span>
                                  <span className="text-[var(--text-muted)]"> | {formatPatientFullName(patient)}</span>
                                </button>
                              )
                            })}
                          </div>
                        )}

                        <p className="mt-2 text-xs text-[var(--text-muted)]">
                          Start with CNP or full name. Suggestions show both identifiers together.
                        </p>
                      </div>

                      <div className="medstream-form-actions">
                        <Button
                          formAction="submit"
                          variant="primary"
                          className="medstream-submit-button"
                          disabled={!selectedPatient || isAssigningPatient}
                        >
                          {isAssigningPatient ? "Assigning..." : "Assign patient"}
                        </Button>
                      </div>
                    </form>
                  </Container>
                </div>

                <div className="medstream-stretch-container">
                  <Container
                    header={
                      <Header
                        variant="h2"
                        description="Email used for login and verification."
                      >
                        Account email
                      </Header>
                    }
                  >
                    <form className="medstream-form" onSubmit={handleEmailUpdate}>
                      {isPendingEmail && (
                        <Alert type="warning">
                          Email not confirmed yet.
                        </Alert>
                      )}
                      <div className="login-field">
                        <label className="login-label" htmlFor="doctor-email">Email</label>
                        <input
                          id="doctor-email"
                          type="email"
                          value={emailInput}
                          onChange={(event) => setEmailInput(event.target.value)}
                          className="login-input"
                          placeholder="Example: doctor@medstream.local"
                          required
                        />
                      </div>

                      <div className="medstream-form-actions medstream-profile-actions">
                        {shouldShowResendVerification && (
                          <button
                            type="button"
                            onClick={handleResendVerification}
                            disabled={isResendingVerification}
                            className="console-button-secondary rounded-lg px-5 py-3 text-sm font-semibold disabled:cursor-not-allowed disabled:border-[var(--border-strong)] disabled:bg-[var(--border-primary)] disabled:text-[var(--text-secondary)]"
                          >
                            {isResendingVerification ? "Resending..." : "Resend email"}
                          </button>
                        )}
                        <Button
                          formAction="submit"
                          variant="primary"
                          className="medstream-submit-button"
                          disabled={!isEmailDirty || isSavingEmail}
                        >
                          {isSavingEmail ? "Sending confirmation..." : "Update email"}
                        </Button>
                      </div>
                    </form>
                  </Container>
                </div>

                <div className="medstream-stretch-container">
                  <Container
                    header={
                      <Header variant="h2" description="Deactivate the current doctor account when policy allows it.">
                        <span className="medstream-transfer-title">
                          <span>Account status</span>
                          <InfoHelp
                            ariaLabel="account status help"
                            title="Account deactivation"
                            body={[
                              "The account cannot be deactivated if you are the only active doctor in your department or if incoming activities are still assigned.",
                              "When allowed, deactivation reassigns currently assigned patients to another doctor from the same department.",
                            ]}
                            footer="Resolve incoming activities and keep department coverage before deleting the account."
                          />
                        </span>
                      </Header>
                    }
                  >
                    <SpaceBetween size="m">
                      <ColumnLayout columns={2} variant="text-grid">
                        <SpaceBetween size="xs">
                          <Box color="text-body-secondary" variant="awsui-key-label">Current state</Box>
                          <Box variant="h3">{doctor.is_active ? "Active doctor account" : "Inactive doctor account"}</Box>
                        </SpaceBetween>
                        <SpaceBetween size="xs">
                          <Box color="text-body-secondary" variant="awsui-key-label">Deactivated at</Box>
                          <Box>{doctor.deleted_at ? new Date(doctor.deleted_at).toLocaleString() : "--"}</Box>
                        </SpaceBetween>
                      </ColumnLayout>

                      {(isOnlyDoctorInDepartment || hasIncomingActivities) && (
                        <Alert type="warning">
                          {isOnlyDoctorInDepartment
                            ? "You are the only doctor in this department. Account cannot be deleted."
                            : "Cannot modify account while there are incoming activities."}
                        </Alert>
                      )}

                      <HoverTextDropdown
                        content={
                          isOnlyDoctorInDepartment
                            ? "You are the only doctor in this department. Account cannot be deleted."
                            : hasIncomingActivities
                              ? "Cannot modify account while there are incoming activities."
                              : ""
                        }
                      >
                        <Button
                          variant="primary"
                          className="medstream-submit-button"
                          onClick={() => {
                            if (!isOnlyDoctorInDepartment && !hasIncomingActivities) {
                              setShowDeleteModal(true)
                            }
                          }}
                          disabled={isDeletingAccount || isOnlyDoctorInDepartment || hasIncomingActivities}
                        >
                          {isDeletingAccount ? "Deactivating..." : "Delete account"}
                        </Button>
                      </HoverTextDropdown>
                    </SpaceBetween>
                  </Container>
                </div>
              </div>
            </SpaceBetween>
          ) : (
            <Container>
              <Alert type="error" header="Doctor workspace unavailable">
                No doctor workspace information is available for this session.
              </Alert>
            </Container>
          )}
        </SpaceBetween>
      </ContentLayout>

        {showDeleteModal && (
          <Modal
            visible={showDeleteModal}
            onDismiss={isDeletingAccount ? undefined : () => setShowDeleteModal(false)}
            size="medium"
            header={
              <Header
                variant="h2"
                description="Deactivate this account and reassign all currently assigned patients."
              >
                Deactivate doctor account
              </Header>
            }
            footer={
              <Box float="right">
                <SpaceBetween direction="horizontal" size="xs">
                  <Button
                    className="medstream-cancel-button"
                    onClick={() => setShowDeleteModal(false)}
                    disabled={isDeletingAccount}
                  >
                    Cancel
                  </Button>
                  <Button
                    variant="primary"
                    className="medstream-submit-button"
                    onClick={handleDeleteAccount}
                    disabled={isDeletingAccount}
                  >
                    {isDeletingAccount ? "Deactivating..." : "Confirm"}
                  </Button>
                </SpaceBetween>
              </Box>
            }
          >
            <div className="medstream-modal-summary">
              This action deactivates the doctor account and automatically reassigns your patients to another doctor from the same
              department.
            </div>
          </Modal>
        )}

        {patientPendingTransfer && (
          <Modal
            visible={Boolean(patientPendingTransfer)}
            onDismiss={isTransferringPatient ? undefined : closeTransferDialog}
            size="medium"
            header={
              <Header
                variant="h2"
                description={showTransferActivityConfirmation ? "Confirm transfer and activity reassignment." : "Choose another doctor from the same department."}
              >
                <span className="medstream-transfer-title">
                  <span>Transfer assigned patient</span>
                  <InfoHelp
                    ariaLabel="assigned patient transfer help"
                    title="Before you transfer"
                    body={[
                      "Use this when you are the only doctor assigned to the patient. The patient must be moved to another doctor before you can be removed from their care team.",
                      "If incoming activities exist, related activities are checked before confirming the transfer.",
                    ]}
                    footer="Existing activities may be canceled and reassigned."
                  />
                </span>
              </Header>
            }
            footer={
              <Box float="right">
                {!showTransferActivityConfirmation ? (
                  <SpaceBetween direction="horizontal" size="xs">
                    <Button
                      className="medstream-cancel-button"
                      onClick={closeTransferDialog}
                      disabled={isTransferringPatient}
                    >
                      Cancel
                    </Button>
                    <Button
                      variant="primary"
                      className="medstream-submit-button"
                      onClick={handleTransferPatient}
                      disabled={!selectedTransferDoctorId || isTransferringPatient || isCheckingTransferActivities || transferDoctorOptions.length === 0}
                    >
                      {isTransferringPatient ? "Transferring..." : (isCheckingTransferActivities ? "Checking..." : "Transfer")}
                    </Button>
                  </SpaceBetween>
                ) : (
                  <SpaceBetween direction="horizontal" size="xs">
                    <Button
                      className="medstream-cancel-button"
                      onClick={() => setShowTransferActivityConfirmation(false)}
                      disabled={isTransferringPatient}
                    >
                      Cancel
                    </Button>
                    <Button
                      variant="primary"
                      className="medstream-submit-button"
                      onClick={handleConfirmTransferPatient}
                      disabled={isTransferringPatient}
                    >
                      {isTransferringPatient ? "Transferring..." : "Confirm Transfer"}
                    </Button>
                  </SpaceBetween>
                )}
              </Box>
            }
          >
            {!showTransferActivityConfirmation ? (
              <SpaceBetween size="m">
                <div className="medstream-modal-summary">
                  <p>
                    Select another doctor from {patientPendingTransfer.department} to transfer {formatPatientFullName(patientPendingTransfer)}.
                  </p>
                  <p>CNP: {patientPendingTransfer.cnp}</p>
                </div>

                <div className="login-field" data-aws-input-clear-ignore>
                  <label className="login-label" htmlFor="transfer-doctor">Available Doctors</label>
                  <Select
                    selectedOption={getSelectedOption(transferDoctorSelectOptions, selectedTransferDoctorId)}
                    onChange={({detail}) => setSelectedTransferDoctorId(detail.selectedOption.value)}
                    options={transferDoctorSelectOptions}
                    placeholder={
                      isLoadingTransferDoctors
                        ? "Loading doctors..."
                        : transferDoctorOptions.length > 0
                          ? "Select a doctor"
                          : "No available doctors"
                    }
                    selectedAriaLabel="Selected transfer doctor"
                    disabled={isLoadingTransferDoctors || isTransferringPatient || transferDoctorOptions.length === 0}
                  />
                </div>
              </SpaceBetween>
            ) : (
              <div className="medstream-modal-summary">
                <p>Are you sure you want to transfer this patient?</p>
                <p>Existing activities will be canceled and reassigned.</p>
              </div>
            )}
          </Modal>
        )}

        {patientPendingRemoval && (
          <Modal
            visible={Boolean(patientPendingRemoval)}
            onDismiss={removingPatientId === patientPendingRemoval.id ? undefined : () => setPatientPendingRemoval(null)}
            size="medium"
            header={
              <Header
                variant="h2"
                description="Remove the patient from this doctor's assigned list."
              >
                <span className="medstream-transfer-title">
                  <span>Remove assigned patient</span>
                  <InfoHelp
                    ariaLabel="assigned patient removal help"
                    title="Before you remove"
                    body={[
                      "Removing a patient only removes this doctor from the assigned list.",
                      "If this doctor is the last assigned doctor, the app requires a transfer instead so the patient keeps a responsible doctor.",
                    ]}
                    footer="Incoming activities can block removal until they are resolved."
                  />
                </span>
              </Header>
            }
            footer={
              <Box float="right">
                <SpaceBetween direction="horizontal" size="xs">
                  <Button
                    className="medstream-cancel-button"
                    onClick={() => setPatientPendingRemoval(null)}
                    disabled={removingPatientId === patientPendingRemoval.id}
                  >
                    Cancel
                  </Button>
                  <HoverTextDropdown content={hasIncomingActivities ? "Cannot modify patients while there are incoming activities." : ""}>
                    <Button
                      variant="primary"
                      className="medstream-submit-button"
                      onClick={() => handleRemovePatient(patientPendingRemoval.id)}
                      disabled={hasIncomingActivities || removingPatientId === patientPendingRemoval.id}
                    >
                      {removingPatientId === patientPendingRemoval.id ? "Removing..." : "Yes, Remove Patient"}
                    </Button>
                  </HoverTextDropdown>
                </SpaceBetween>
              </Box>
            }
          >
            <div className="medstream-modal-summary">
              <p>Remove {formatPatientFullName(patientPendingRemoval)} from this doctor&apos;s assigned patient list?</p>
              <p>CNP: {patientPendingRemoval.cnp}</p>
            </div>
          </Modal>
        )}

        {activityPendingCancellation && (
          <Modal
            visible={Boolean(activityPendingCancellation)}
            onDismiss={isSubmittingActivity ? undefined : () => setActivityPendingCancellation(null)}
            size="small"
            header={
              <Header
                variant="h2"
                description="This action marks the activity as canceled."
              >
                Cancel activity
              </Header>
            }
            footer={
              <Box float="right">
                <SpaceBetween direction="horizontal" size="xs">
                  <Button
                    className="medstream-cancel-button"
                    onClick={() => setActivityPendingCancellation(null)}
                    disabled={isSubmittingActivity}
                  >
                    Cancel
                  </Button>
                  <Button
                    variant="primary"
                    className="medstream-submit-button"
                    onClick={handleCancelActivity}
                    disabled={isSubmittingActivity}
                  >
                    {isSubmittingActivity ? "Canceling..." : "Yes, Cancel Activity"}
                  </Button>
                </SpaceBetween>
              </Box>
            }
          >
            <Box color="text-body-secondary">Are you sure you want to cancel this activity?</Box>
          </Modal>
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
    </>
  )
}
