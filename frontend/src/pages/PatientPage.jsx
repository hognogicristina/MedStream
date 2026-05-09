import {useCallback, useEffect, useMemo, useState} from "react"
import {Link, useParams} from "react-router-dom"
import {Bar, BarChart, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis} from "recharts"
import BackButton from "../components/BackButton.jsx"
import DepartmentTransferDialog from "../components/DepartmentTransferDialog.jsx"
import EditPatientDialog from "../components/EditPatientDialog.jsx"
import VitalsChart from "../components/VitalsChart.jsx"
import LoadingSpinner from "../components/LoadingSpinner.jsx"
import {useNotifications} from "../hooks/useNotifications.js"
import {
  getBatchMetrics,
  getPatient,
  getPatientAlerts,
  getPatientDoctors,
  getVitals,
  updatePatient,
  updatePatientDepartment,
} from "../services/patientApi.js"
import {assignPatientToDoctor, getCurrentDoctor, listDoctors, removePatientFromDoctor} from "../services/doctorApi.js"
import {getErrorMessage, getResponseData, getResponseMessage} from "../services/apiMessages.js"
import {createWebSocket} from "../services/ws.js"
import {formatPatientPhoneWithCode} from "../utils/patientPhone.js"
import {useAuth} from "../components/AuthContext.jsx"
import {normalizeAlertType, ALERT_TYPE_SHORT_LABEL} from "../utils/alerts.js"
import {useTheme} from "../components/ThemeContext.jsx"
import {getChartTheme} from "../utils/theme.js"

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

const MAX_VITAL_POINTS = 100
const ALERT_COLOR_BY_SEVERITY = {
  Critical: "#ef4444",
  High: "#f97316",
  Normal: "#3b82f6",
}
function AlertDistributionTooltip({active, payload, fullAlerts = [], patientId, chartTheme}) {
  if (!active || !Array.isArray(payload) || !payload.length) {
    return null
  }

  const row = payload[0]?.payload || {}
  const label = String(row.name || "")
  const count = Number(row.count || 0)
  const severity = label.toLowerCase()

  const uniqueTypes = [...new Set(
    fullAlerts
      .filter((alert) => String(alert.patient_id) === String(patientId))
      .filter((alert) => String(alert.severity || "").trim().toLowerCase() === severity)
      .map((alert) => normalizeAlertType(alert.type || alert.alert_type, alert.severity))
      .filter(Boolean),
  )]

  const typeLabels = uniqueTypes.map((type) => ALERT_TYPE_SHORT_LABEL[type] || type)
  const typesText = typeLabels.length ? typeLabels.join(", ") : "--"

  return (
    <div
      className="rounded-xl px-3 py-2 shadow-lg"
      style={{
        border: `1px solid ${chartTheme.tooltipBorder}`,
        backgroundColor: chartTheme.tooltipBg,
      }}
    >
      <p className="text-base font-bold text-[var(--text-primary)]">{label}: {count}</p>
      <p className="mt-1 text-sm font-medium text-[var(--text-secondary)]">Types: {typesText}</p>
    </div>
  )
}

export default function PatientPage() {
  const {notifyError, notifySuccess} = useNotifications()
  const {theme} = useTheme()
  const chartTheme = getChartTheme(theme)
  const {token} = useAuth()
  const {id} = useParams()
  const [currentDoctor, setCurrentDoctor] = useState(null)
  const [patient, setPatient] = useState(null)
  const [vitals, setVitals] = useState([])
  const [batchMetrics, setBatchMetrics] = useState(null)
  const [alerts, setAlerts] = useState(null)
  const [department, setDepartment] = useState("")
  const [isPatientNotFound, setIsPatientNotFound] = useState(false)
  const [isUpdatingDepartment, setIsUpdatingDepartment] = useState(false)
  const [isLoadingPatient, setIsLoadingPatient] = useState(true)
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false)
  const [isSavingPatient, setIsSavingPatient] = useState(false)
  const [isTransferDialogOpen, setIsTransferDialogOpen] = useState(false)
  const [doctors, setDoctors] = useState([])
  const [allDoctors, setAllDoctors] = useState([])
  const [isLoadingDoctors, setIsLoadingDoctors] = useState(true)
  const authHeaders = token ? {Authorization: `Bearer ${token}`} : {}

  useEffect(() => {
    setPatient(null)
    setVitals([])
    setBatchMetrics(null)
    setAlerts(null)
    setDepartment("")
    setIsPatientNotFound(false)
    setIsEditDialogOpen(false)
    setIsTransferDialogOpen(false)
  }, [id])

  useEffect(() => {
    const fetchMe = async () => {
      if (!token) return
      try {
        const res = await getCurrentDoctor({Authorization: `Bearer ${token}`})
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
    setIsPatientNotFound(false)

    try {
      const response = await getPatient(id)
      const patientData = getResponseData(response)
      setPatient(patientData)
      setDepartment(patientData.department)
      const [patientDoctorsResult, doctorsResult] = await Promise.allSettled([
        getPatientDoctors(id),
        listDoctors(),
      ])

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
      if (error?.response?.status === 404) {
        setIsPatientNotFound(true)
      } else {
        notifyError(getErrorMessage(error))
      }
    } finally {
      setIsLoadingPatient(false)
      setIsLoadingDoctors(false)
    }
  }, [id, notifyError])

  useEffect(() => {
    loadPatient().then(r => r)
  }, [loadPatient])

  useEffect(() => {
    if (isPatientNotFound) {
      return
    }

    const loadPatientVitals = async () => {
      try {
        const vitalsResponse = await getVitals(id, MAX_VITAL_POINTS)
        const patientVitals = (getResponseData(vitalsResponse) || [])
          .map((vital) => ({
            ...vital,
            recorded_at: vital.recorded_at || new Date().toISOString(),
          }))
        setVitals(patientVitals)
      } catch (error) {
        if (error?.response?.status === 404) {
          setIsPatientNotFound(true)
          return
        }
        notifyError(getErrorMessage(error))
      }
    }

    loadPatientVitals().then(r => r)
  }, [id, isPatientNotFound, notifyError])

  useEffect(() => {
    if (isPatientNotFound) {
      return
    }
    let active = true

    const loadPatientAlerts = async () => {
      try {
        const response = await getPatientAlerts(id)
        if (!active) {
          return
        }
        const nextAlerts = (getResponseData(response) || []).filter(
          (alert) => String(alert.patient_id) === String(id),
        )
        setAlerts(() => nextAlerts)
      } catch (error) {
        if (!active) {
          return
        }
        if (error?.response?.status === 404) {
          setIsPatientNotFound(true)
          return
        }
        setAlerts([])
        notifyError(getErrorMessage(error))
      }
    }

    loadPatientAlerts().then(r => r)

    return () => {
      active = false
    }
  }, [id, isPatientNotFound, notifyError])

  useEffect(() => {
    let active = true

    const loadBatchMetrics = async () => {
      try {
        const response = await getBatchMetrics()
        if (!active) {
          return
        }
        setBatchMetrics(getResponseData(response) || null)
      } catch (error) {
        if (!active) {
          return
        }
        notifyError(getErrorMessage(error))
      }
    }

    loadBatchMetrics().then(r => r)
    const intervalId = window.setInterval(() => {
      loadBatchMetrics().then(r => r)
    }, 30000)

    return () => {
      active = false
      window.clearInterval(intervalId)
    }
  }, [notifyError])

  useEffect(() => {
    if (isPatientNotFound) {
      return
    }
    const socket = createWebSocket((msg) => {
      if (String(msg.data?.patient_id) !== id) {
        return
      }

      if (msg.type === "vital") {
        const vital = {
          ...msg.data,
          recorded_at: msg.data.recorded_at || new Date().toISOString(),
        }

        setVitals((prev) => [vital, ...prev.filter((item) => item.recorded_at !== vital.recorded_at)].slice(0, MAX_VITAL_POINTS))
      }

      if (msg.type === "alert") {
        setAlerts((prev) => {
          const currentAlerts = Array.isArray(prev) ? prev : []
          const filtered = currentAlerts.filter((alert) => String(alert.patient_id) === String(id))
          return [msg.data, ...filtered.filter((alert) => alert.id !== msg.data?.id)]
        })
      }
    })

    return () => {
      socket.close()
    }
  }, [id, isPatientNotFound])

  const handleDepartmentTransfer = async ({department: nextDepartment, doctorId: nextDoctorId, reason}) => {
    setIsUpdatingDepartment(true)

    try {
      const response = await updatePatientDepartment(id, {
        department: nextDepartment,
        reason,
      }, authHeaders)

      const patientData = getResponseData(response)
      setDepartment(patientData.department)
      setPatient((current) => current ? {...current, department: patientData.department} : current)
      notifySuccess(getResponseMessage(response))
      setIsTransferDialogOpen(false)

      if (nextDoctorId) {
        try {
          await assignPatientToDoctor(nextDoctorId, id, authHeaders)
        } catch (e) {
          notifyError(getErrorMessage(e))
        }
      }

      const oldDepartmentDocs = doctors.filter(doc => doc.specialization === department)
      await Promise.allSettled(
        oldDepartmentDocs.map(async (doc) => {
          try {
            await removePatientFromDoctor(doc.id, id, authHeaders)
          } catch (e) {
            notifyError(getErrorMessage(e))
          }
        })
      )

      const doctorsResponse = await getPatientDoctors(id)
      setDoctors(getResponseData(doctorsResponse) || [])
    } catch (error) {
      notifyError(getErrorMessage(error))
    } finally {
      setIsUpdatingDepartment(false)
    }
  }

  const handlePatientUpdate = async (payload) => {
    setIsSavingPatient(true)

    try {
      const response = await updatePatient(id, payload, authHeaders)
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
      const assignResponse = await assignPatientToDoctor(currentDoctor.id, patient.id, authHeaders)
      notifySuccess(getResponseMessage(assignResponse))
      const response = await getPatientDoctors(id)
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
  const chartData = useMemo(
    () => [...vitals]
      .reverse()
      .map((vital) => ({
        time: formatDateTime(vital.recorded_at),
        heart_rate: vital.heart_rate,
        oxygen_saturation: vital.oxygen_saturation,
        temperature: vital.temperature,
      })),
    [vitals],
  )
  const alertDistributionData = useMemo(() => {
    if (!alerts) {
      return []
    }

    const scopedAlerts = alerts.filter((alert) => String(alert.patient_id) === String(id))
    const counts = {
      critical: scopedAlerts.filter((alert) => String(alert.severity || "").trim().toLowerCase() === "critical").length,
      high: scopedAlerts.filter((alert) => String(alert.severity || "").trim().toLowerCase() === "high").length,
      normal: scopedAlerts.filter((alert) => String(alert.severity || "").trim().toLowerCase() === "normal").length,
    }

    return [
      {name: "Critical", count: counts.critical},
      {name: "High", count: counts.high},
      {name: "Normal", count: counts.normal},
    ]
  }, [alerts, id])
  const averageHeartRate = Number.isFinite(batchMetrics?.avg_heart_rate) ? batchMetrics.avg_heart_rate.toFixed(1) : "--"
  const averageOxygen = Number.isFinite(batchMetrics?.avg_oxygen) ? batchMetrics.avg_oxygen.toFixed(1) : "--"
  const averageTemperature = Number.isFinite(batchMetrics?.avg_temperature) ? batchMetrics.avg_temperature.toFixed(1) : "--"
  const averageBloodPressure = (() => {
    const avgSystolic = batchMetrics?.avg_systolic_bp
    const avgDiastolic = batchMetrics?.avg_diastolic_bp
    if (Number.isFinite(avgSystolic) && Number.isFinite(avgDiastolic)) {
      return `${Math.round(avgSystolic)}/${Math.round(avgDiastolic)}`
    }

    return "--"
  })()

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

  if (isLoadingPatient) {
    return (
      <div className="app-shell min-h-screen px-4 py-6 text-[var(--text-primary)] sm:px-6 lg:px-8">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
          <LoadingSpinner/>
        </div>
      </div>
    )
  }

  if (isPatientNotFound) {
    return (
      <div className="app-shell min-h-screen px-4 py-6 text-[var(--text-primary)] sm:px-6 lg:px-8">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
          <div className="console-topbar rounded-3xl p-6 sm:p-8">
            <p className="text-xs font-semibold uppercase tracking-[0.35em] text-[#ff9900]">Patient Monitoring</p>
            <h1 className="mt-4 text-3xl font-semibold tracking-tight text-[var(--text-primary)] sm:text-4xl">Patient not found</h1>
            <p className="mt-2 text-sm text-[var(--text-secondary)]">This patient record does not exist or is no longer available.</p>
            <div className="mt-5">
              <Link
                to="/dashboard"
                className="inline-flex rounded-full border border-[var(--border-primary)] px-4 py-2 text-sm font-semibold text-[var(--text-primary)] transition hover:border-[#ff9900] hover:text-[var(--text-primary)]"
              >
                Back to dashboard
              </Link>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="app-shell min-h-screen px-4 py-6 text-[var(--text-primary)] sm:px-6 lg:px-8">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
        <header className="console-topbar rounded-3xl p-6 sm:p-8">
          <div className="space-y-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.35em] text-[#ff9900]">Patient Monitoring</p>
            </div>

            <div>
              <div className="mt-2 flex w-full items-start justify-between">
                <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                  <h1 className="text-4xl font-semibold tracking-tight text-[var(--text-primary)] sm:text-5xl">{pageTitle}</h1>

                  <div className="group relative flex items-center">
                    <button
                      type="button"
                      onClick={() => setIsTransferDialogOpen(true)}
                      disabled={!canEditPatientRecord}
                      className="inline-flex rounded-full border border-[var(--border-primary)] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--text-primary)] transition hover:border-[#ff9900] hover:text-[var(--text-primary)] disabled:cursor-not-allowed disabled:border-[var(--border-subtle)] disabled:bg-[var(--surface-3)] disabled:text-[var(--text-subtle)]"
                    >
                      {department || "--"}
                    </button>

                    <span
                      className="pointer-events-none absolute left-1/2 top-full z-50 mt-2 -translate-x-1/2 rounded-md border border-[var(--border-soft)] bg-[var(--surface-4)] px-2 py-1 text-xs font-medium text-[var(--text-primary)] opacity-0 transition-opacity duration-150 group-hover:opacity-100">
        Move patient
      </span>
                  </div>

                  <span
                    className={`inline-flex rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] ${
                      patient?.is_discharged
                        ? "status-pill status-pill-danger"
                        : "status-pill status-pill-success"
                    }`}
                  >
      {patient?.is_discharged ? "Discharged" : "Admitted"}
    </span>
                  {!isDoctorAssigned && currentDoctor && !isLoadingDoctors && (
                    <button
                      onClick={handleAssignToMe}
                      disabled={!canAssignToCurrentPatient || isPatientLocked}
                      className="inline-flex rounded-full border border-[var(--border-primary)] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--link)] transition hover:border-[var(--link)] hover:bg-[var(--surface-muted)] disabled:cursor-not-allowed disabled:border-[var(--border-subtle)] disabled:bg-[var(--surface-3)] disabled:text-[var(--text-subtle)]"
                    >
                      Assign to Me
                    </button>
                  )}
                  {isDoctorAssigned && currentDoctor && !isLoadingDoctors && (
                    <span
                      className="status-pill status-pill-success inline-flex rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em]">
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
                  className="inline-flex w-fit px-0 py-0 text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--link)] transition hover:text-[var(--text-primary)] disabled:cursor-not-allowed disabled:text-[var(--text-subtle)]"
                >
                  Edit patient
                </button>

                <Link
                  to={`/patients/${id}/medical-history`}
                  className="inline-flex w-fit px-0 py-0 text-[11px] font-semibold uppercase tracking-[0.16em] text-[#ffcc80] transition hover:text-[var(--text-primary)]"
                >
                  Clinical Records
                </Link>

                <Link
                  to={`/patients/${id}/admission-history`}
                  className="inline-flex w-fit px-0 py-0 text-[11px] font-semibold uppercase tracking-[0.16em] text-[#b8f5c8] transition hover:text-[var(--text-primary)]"
                >
                  Admission history
                </Link>

                <Link
                  to={`/patients/${id}/analysis`}
                  className="inline-flex w-fit px-0 py-0 text-[11px] font-semibold uppercase tracking-[0.16em] text-[#c084fc] transition hover:border-[#a855f7] hover:text-[#d8b4fe]"
                >
                  TREATMENT ANALYSIS
                </Link>
              </div>

              <div className="mt-4 border-t border-[var(--border-subtle)] pt-4">
                <div className="grid gap-6 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-6">
                  {patientMetadata.map((item) => (
                    <div
                      key={item.label}
                      className={item.isWide ? "xl:col-span-2" : ""}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--text-muted)]">
                          {item.label}
                        </p>
                        {item.label === "Phone Number"}
                      </div>
                      <p
                        className={`mt-1 text-base font-semibold text-[var(--text-primary)] ${item.isWide ? "wrap-break-word whitespace-normal leading-relaxed" : ""}`}
                      >
                        {item.value}
                      </p>
                    </div>
                  ))}
                </div>

                {patient?.is_discharged && (
                  <div className="discharge-summary-banner mt-6 rounded-2xl p-4">
                    <p className="discharge-summary-title text-xs font-semibold uppercase tracking-[0.24em]">Discharge Summary</p>
                    <div className="mt-3 grid gap-3 sm:grid-cols-2">
                      <div>
                        <p className="discharge-summary-label text-[11px] font-semibold uppercase tracking-[0.18em]">Date</p>
                        <p className="mt-1 text-sm font-medium text-[var(--text-primary)]">{formatDateTime(patient.discharge_date)}</p>
                      </div>
                      <div className="sm:col-span-2">
                        <p className="discharge-summary-label text-[11px] font-semibold uppercase tracking-[0.18em]">Reason</p>
                        <p className="mt-1 text-sm font-medium text-[var(--text-primary)]">{patient.discharge_reason || "--"}</p>
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
            <p className="text-xs uppercase tracking-[0.25em] text-[var(--text-muted)]">Heart Rate</p>
            <p className="mt-3 text-3xl font-semibold text-[#ffb84d]">{averageHeartRate}</p>
          </div>

          <div className="monitor-card rounded-3xl p-4">
            <p className="text-xs uppercase tracking-[0.25em] text-[var(--text-muted)]">O2 Saturation</p>
            <p className="mt-3 text-3xl font-semibold text-[var(--link)]">{averageOxygen}</p>
          </div>

          <div className="monitor-card rounded-3xl p-4">
            <p className="text-xs uppercase tracking-[0.25em] text-[var(--text-muted)]">Temperature</p>
            <p className="mt-3 text-3xl font-semibold text-[#ffd699]">{averageTemperature}</p>
          </div>

          <div className="monitor-card rounded-3xl p-4">
            <p className="text-xs uppercase tracking-[0.25em] text-[var(--text-muted)]">Blood Pressure</p>
            <p className="mt-3 text-3xl font-semibold text-[var(--text-primary)]">{averageBloodPressure}</p>
          </div>
        </section>

        <section className="grid gap-6 xl:grid-cols-[1.5fr_0.9fr]">
          <div className="monitor-card rounded-[28px] p-6">
            <div className="mb-5 flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.3em] text-[#ff9900]">Vitals</p>
                <h2 className="mt-2 text-2xl font-semibold text-[var(--text-primary)]">Vitals Timeline</h2>
              </div>
            </div>

            {chartData.length > 0 ? (
              <VitalsChart data={chartData}/>
            ) : (
              <div className="rounded-2xl border border-[var(--border-primary)] bg-[var(--surface-2)] px-4 py-5 text-sm text-[var(--text-secondary)]">
                No vital samples available for visualization.
              </div>
            )}
          </div>
          <div className="grid gap-6">
            <div className="monitor-card rounded-[28px] p-6">
              <div className="mb-5 flex items-center justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.3em] text-[#ff9900]">Escalations</p>
                  <h2 className="mt-2 text-2xl font-semibold text-[var(--text-primary)]">Patient Alerts</h2>
                </div>
              </div>

              <div className="h-64 rounded-2xl border border-[var(--border-primary)] bg-[var(--surface-2)] p-3">
                {alerts === null ? (
                  <div className="flex h-full items-center justify-center text-sm text-[var(--text-secondary)]">
                    Loading alerts...
                  </div>
                ) : alertDistributionData.length === 0 ? (
                  <div className="flex h-full items-center justify-center text-sm text-[var(--text-secondary)]">
                    No alerts available
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={alertDistributionData} margin={{top: 8, right: 8, left: 0, bottom: 6}}>
                      <XAxis dataKey="name" stroke={chartTheme.axis} tick={{fill: chartTheme.axisTickFill, fontSize: 12}}/>
                      <YAxis allowDecimals={false} stroke={chartTheme.axis} tick={{fill: chartTheme.axisTickFill, fontSize: 12}}/>
                      <Tooltip
                        content={<AlertDistributionTooltip fullAlerts={alerts || []} patientId={id} chartTheme={chartTheme}/>}
                      />
                      <Bar dataKey="count" radius={[8, 8, 0, 0]}>
                        {alertDistributionData.map((entry) => (
                          <Cell key={`alert-bar-${entry.name}`} fill={ALERT_COLOR_BY_SEVERITY[entry.name] || "#9ca3af"}/>
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </div>
              {patient?.cnp && (
                <div className="mt-4">
                  <Link
                    className="console-button-secondary block rounded-2xl px-4 py-3 text-center text-sm font-semibold"
                    to={`/alerts?cnp=${encodeURIComponent(patient.cnp)}&patient=${encodeURIComponent(patientFullName)}`}
                  >
                    View Alerts Feed
                  </Link>
                </div>
              )}
            </div>
          </div>
        </section>
      </div>
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
        allDoctors={allDoctors}
        onClose={() => setIsTransferDialogOpen(false)}
        onSubmit={handleDepartmentTransfer}
      />
    </div>
  )
}
