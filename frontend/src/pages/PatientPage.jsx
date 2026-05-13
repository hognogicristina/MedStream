import {useCallback, useEffect, useMemo, useState} from "react"
import {useNavigate, useParams} from "react-router-dom"
import {Bar, BarChart, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis} from "recharts"
import {
  Alert,
  Badge,
  Box,
  Button,
  ButtonDropdown,
  ColumnLayout,
  Container,
  ContentLayout,
  Header,
  SpaceBetween,
  StatusIndicator,
} from "@cloudscape-design/components"
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
import AppBreadcrumbs from "../components/AppBreadcrumbs.jsx"
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
  const navigate = useNavigate()
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
    {label: "Address", value: patientStreetAddress || "--"},
  ]

  const handlePatientAction = ({detail}) => {
    if (detail.id === "edit") {
      setIsEditDialogOpen(true)
    }
    if (detail.id === "move") {
      setIsTransferDialogOpen(true)
    }
    if (detail.id === "clinical-records") {
      navigate(`/patients/${id}/medical-history`)
    }
    if (detail.id === "admission-history") {
      navigate(`/patients/${id}/admission-history`)
    }
    if (detail.id === "treatment-analysis") {
      navigate(`/patients/${id}/analysis`)
    }
  }

  const actionButtons = (
    <ButtonDropdown
      items={[
        {id: "edit", text: "Edit patient details", disabled: !canEditPatientRecord},
        {id: "move", text: "Transfer patient", disabled: !canEditPatientRecord},
        {id: "clinical-records", text: "Clinical records"},
        {id: "admission-history", text: "Admission history"},
        {id: "treatment-analysis", text: "Treatment analysis"},
      ]}
      onItemClick={handlePatientAction}
    >
      Actions
    </ButtonDropdown>
  )

  if (isLoadingPatient) {
    return (
      <ContentLayout>
        <Container>
          <LoadingSpinner/>
        </Container>
      </ContentLayout>
    )
  }

  if (isPatientNotFound) {
    return (
      <ContentLayout>
        <SpaceBetween size="m">
        <div className="medstream-page-header">
          <AppBreadcrumbs/>
          <div className="medstream-page-heading-row">
            <div>
              <h1 className="medstream-page-title">Patient not found</h1>
              <p>This patient record does not exist or is no longer available.</p>
            </div>
          </div>
        </div>
          <Alert type="error" header="Patient record unavailable">
            The requested patient could not be loaded.
          </Alert>
        </SpaceBetween>
      </ContentLayout>
    )
  }

  return (
    <ContentLayout>
      <SpaceBetween size="m">
        <div className="medstream-page-header">
          <AppBreadcrumbs/>
          <div className="medstream-page-heading-row">
            <div>
              <h1 className="medstream-page-title">{pageTitle}</h1>
              <p>Patient Monitoring</p>
              <div className="medstream-page-filter-row">
                <StatusIndicator type={patient?.is_discharged ? "stopped" : "success"}>
                  {patient?.is_discharged ? "Discharged" : "Admitted"}
                </StatusIndicator>
                <StatusIndicator type={isDoctorAssigned ? "success" : "pending"}>
                  {isDoctorAssigned ? "Assigned" : "Unassigned"}
                </StatusIndicator>
                <span
                  className="medstream-department-tooltip"
                  tabIndex={0}
                  aria-label="Department where this patient is currently admitted"
                  data-tooltip="Department where this patient is currently admitted"
                >
                  <span className="medstream-department-badge">
                    <Badge color="blue">{department || "--"}</Badge>
                  </span>
                </span>
              </div>
            </div>
          </div>
        </div>

        <Container>
          <ColumnLayout columns={4} variant="text-grid">
            <SpaceBetween size="xs">
              <Box color="text-body-secondary" variant="awsui-key-label">Heart rate</Box>
              <Box variant="h2">{averageHeartRate}</Box>
            </SpaceBetween>
            <SpaceBetween size="xs">
              <Box color="text-body-secondary" variant="awsui-key-label">O2 saturation</Box>
              <Box variant="h2">{averageOxygen}</Box>
            </SpaceBetween>
            <SpaceBetween size="xs">
              <Box color="text-body-secondary" variant="awsui-key-label">Temperature</Box>
              <Box variant="h2">{averageTemperature}</Box>
            </SpaceBetween>
            <SpaceBetween size="xs">
              <Box color="text-body-secondary" variant="awsui-key-label">Blood pressure</Box>
              <Box variant="h2">{averageBloodPressure}</Box>
            </SpaceBetween>
          </ColumnLayout>
        </Container>

        <Container
          header={
            <Header
              variant="h2"
              description="Identity, department, contact, and admission details."
              actions={actionButtons}
            >
              Patient details
            </Header>
          }
        >
          <SpaceBetween size="m">
            {!isDoctorAssigned && currentDoctor && !isLoadingDoctors && (
              <Alert
                type="info"
                action={
                  <Button
                    onClick={handleAssignToMe}
                    disabled={!canAssignToCurrentPatient || isPatientLocked}
                  >
                    Assign to me
                  </Button>
                }
              >
                This patient is not assigned to you.
              </Alert>
            )}

            <div className="medstream-patient-details-grid">
              {patientMetadata.map((item) => (
                <SpaceBetween size="xxs" key={item.label}>
                  <Box color="text-body-secondary" variant="awsui-key-label">{item.label}</Box>
                  <div className="medstream-patient-detail-value">
                    <p className="medstream-patient-detail-text">{item.value}</p>
                  </div>
                </SpaceBetween>
              ))}
            </div>

            {patient?.is_discharged && (
              <Alert type="info" header="Discharge summary">
                Date: {formatDateTime(patient.discharge_date)}. Reason: {patient.discharge_reason || "--"}
              </Alert>
            )}
          </SpaceBetween>
        </Container>

        <div className="medstream-dashboard-split">
          <div className="medstream-stretch-container">
            <Container header={<Header variant="h2">Vitals timeline</Header>}>
              {chartData.length > 0 ? (
                <VitalsChart data={chartData}/>
              ) : (
                <Box color="text-body-secondary">No vital samples available for visualization.</Box>
              )}
            </Container>
          </div>

          <div className="medstream-stretch-container">
            <Container
              className="medstream-alerts-container"
              fitHeight
              header={
                <Header
                  variant="h2"
                  actions={patient?.cnp ? <Button onClick={() => navigate(`/alerts?cnp=${encodeURIComponent(patient.cnp)}&patient=${encodeURIComponent(patientFullName)}`)}>View alerts feed</Button> : null}
                >
                  Patient alerts
                </Header>
              }
            >
              <div className="medstream-chart-panel medstream-alert-chart-panel">
                {alerts === null ? (
                  <Box color="text-body-secondary">Loading alerts...</Box>
                ) : alertDistributionData.length === 0 ? (
                  <Box color="text-body-secondary">No alerts available.</Box>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={alertDistributionData} margin={{top: 4, right: 4, left: -16, bottom: 0}}>
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
            </Container>
          </div>
        </div>
      </SpaceBetween>

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
    </ContentLayout>
  )
}
