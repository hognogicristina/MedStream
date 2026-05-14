import {useEffect, useMemo, useState} from "react"
import {useNavigate, useParams} from "react-router-dom"
import {
  Box,
  Button,
  ColumnLayout,
  Container,
  ContentLayout,
  Header,
  Pagination,
  Select,
  SpaceBetween,
  StatusIndicator,
  Table,
} from "@cloudscape-design/components"
import CountValue from "../components/CountValue.jsx"
import {useNotifications} from "../hooks/useNotifications.js"
import {getAlerts, getBatchStatusStats, getDepartments, getStats, listPatients} from "../services/patientApi.js"
import {getErrorMessage, getResponseData} from "../services/apiMessages.js"
import {formatPatientFullName} from "../utils/patients.js"
import {alertTypeToVital, getAlertSeverityLevel, normalizeAlertType} from "../utils/alerts.js"

const PAGE_SIZE = 10

const SEVERITY_FILTERS = [
  {value: "all", label: "All patients"},
  {value: "critical", label: "Critical alerts present"},
  {value: "high", label: "Warning alerts present"},
  {value: "normal", label: "Normal alerts present"},
]

const STATUS_FILTERS = [
  {value: "all", label: "All statuses"},
  {value: "admitted", label: "Admitted"},
  {value: "discharged", label: "Discharged"},
]

const SORT_OPTIONS = [
  {value: "status_then_name", label: "Admitted first, then name"},
  {value: "patient_name", label: "Patient name"},
  {value: "avg_heart_rate", label: "Average heart rate"},
  {value: "avg_oxygen", label: "Average O2"},
  {value: "avg_temperature", label: "Average temperature"},
  {value: "alerts_count", label: "Alerts count"},
]

function getPatientDisplayName(patient) {
  if (!patient) {
    return "Unknown patient"
  }
  const explicitFullName = String(patient.full_name || "").trim()
  if (explicitFullName) {
    return explicitFullName
  }
  const firstName = String(patient.first_name || "").trim()
  const lastName = String(patient.last_name || "").trim()
  const firstLast = `${firstName} ${lastName}`.trim()
  if (firstLast) {
    return firstLast
  }
  return formatPatientFullName(patient)
}

function comparePatientsByStatusThenName(leftPatient, rightPatient) {
  const leftStatusRank = leftPatient?.is_discharged ? 1 : 0
  const rightStatusRank = rightPatient?.is_discharged ? 1 : 0
  if (leftStatusRank !== rightStatusRank) {
    return leftStatusRank - rightStatusRank
  }

  return getPatientDisplayName(leftPatient).localeCompare(getPatientDisplayName(rightPatient), undefined, {sensitivity: "base"})
}

function getSelectedOption(options, value) {
  return options.find((option) => option.value === value) || (value ? {label: value, value} : options[0])
}

function getStrongestSeverity(alertSummary) {
  if (alertSummary.severities.has("critical")) {
    return "critical"
  }
  if (alertSummary.severities.has("high")) {
    return "high"
  }
  if (alertSummary.severities.has("normal")) {
    return "normal"
  }
  return "none"
}

function buildCurrentAlertSummary(patientAlerts) {
  const latestByVital = {}
  const sortedAlerts = [...patientAlerts].sort((left, right) => {
    const leftTime = new Date(left.created_at || 0).getTime()
    const rightTime = new Date(right.created_at || 0).getTime()
    if (leftTime !== rightTime) {
      return leftTime - rightTime
    }
    return (left.id || 0) - (right.id || 0)
  })

  sortedAlerts.forEach((alert) => {
    const vital = getAlertVital(alert)
    latestByVital[vital || "unknown"] = alert
  })

  return {
    count: patientAlerts.length,
    severities: new Set(Object.values(latestByVital).map((alert) => getAlertSeverityLevel(alert))),
  }
}

function renderAlertStatus(alertSummary) {
  const severity = getStrongestSeverity(alertSummary)
  if (severity === "critical") {
    return <StatusIndicator type="error">Critical</StatusIndicator>
  }
  if (severity === "high") {
    return <StatusIndicator type="warning">Warning</StatusIndicator>
  }
  if (severity === "normal") {
    return <StatusIndicator type="success">Normal</StatusIndicator>
  }
  return <StatusIndicator type="info">No alerts</StatusIndicator>
}

function getAlertVital(alert) {
  const normalizedType = normalizeAlertType(alert?.alert_type || alert?.type, alert?.severity)
  const vital = alertTypeToVital(normalizedType)
  if (vital) {
    return vital
  }

  const message = String(alert?.message || "").toLowerCase()
  if (message.includes("heart") || message.includes("bpm")) {
    return "heartRate"
  }
  if (message.includes("oxygen") || message.includes("o2")) {
    return "oxygen"
  }
  if (message.includes("temperature") || message.includes("temp")) {
    return "temperature"
  }
  return "unknown"
}

function formatVitalName(vital) {
  if (vital === "heartRate") {
    return "Heart rate"
  }
  if (vital === "oxygen") {
    return "Oxygen"
  }
  if (vital === "temperature") {
    return "Temperature"
  }
  return "--"
}

export default function DepartmentPage() {
  const navigate = useNavigate()
  const {notifyError} = useNotifications()
  const {name} = useParams()
  const departmentName = decodeURIComponent(name || "")
  const [patients, setPatients] = useState([])
  const [stats, setStats] = useState([])
  const [alerts, setAlerts] = useState([])
  const [batchStatus, setBatchStatus] = useState(null)
  const [isLoading, setIsLoading] = useState(true)
  const [departments, setDepartments] = useState([])
  const [severityFilter, setSeverityFilter] = useState("all")
  const [statusFilter, setStatusFilter] = useState("all")
  const [sortOrder, setSortOrder] = useState("status_then_name")
  const [currentPage, setCurrentPage] = useState(1)

  useEffect(() => {
    const loadDepartments = async () => {
      try {
        const res = await getDepartments()
        const data = getResponseData(res)
        setDepartments(Array.isArray(data) ? data : [])
      } catch (error) {
        notifyError(getErrorMessage(error))
      }
    }

    loadDepartments()
  }, [notifyError])

  useEffect(() => {
    const loadDepartmentData = async () => {
      setIsLoading(true)

      try {
        const [patientsRes, statsRes, alertsRes, batchStatusRes] = await Promise.all([
          listPatients({
            department: departmentName,
            alert_presence: severityFilter,
            status: statusFilter,
          }),
          getStats(),
          getAlerts(),
          getBatchStatusStats(),
        ])

        const filteredPatients = getResponseData(patientsRes).filter((patient) => patient.department === departmentName)
        const patientIds = new Set(filteredPatients.map((patient) => patient.id))
        const filteredStats = getResponseData(statsRes).filter((stat) => patientIds.has(stat.patient_id))
        const filteredAlerts = getResponseData(alertsRes).filter((alert) => patientIds.has(alert.patient_id))

        setPatients(filteredPatients)
        setStats(filteredStats)
        setAlerts(filteredAlerts)
        setBatchStatus(getResponseData(batchStatusRes))
      } catch (error) {
        notifyError(getErrorMessage(error))
      } finally {
        setIsLoading(false)
      }
    }

    loadDepartmentData()
  }, [departmentName, notifyError, severityFilter, statusFilter])

  useEffect(() => {
    setCurrentPage(1)
  }, [departmentName, severityFilter, statusFilter, sortOrder])

  const departmentOptions = departments.map((department) => ({
    label: department,
    value: department,
  }))

  const statsMap = useMemo(() => Object.fromEntries(stats.map((stat) => [stat.patient_id, stat])), [stats])
  const alertSummaryMap = useMemo(() => {
    const groupedAlerts = alerts.reduce((accumulator, alert) => {
      accumulator[alert.patient_id] = accumulator[alert.patient_id] || []
      accumulator[alert.patient_id].push(alert)
      return accumulator
    }, {})

    return Object.fromEntries(
      Object.entries(groupedAlerts).map(([patientId, patientAlerts]) => [
        patientId,
        buildCurrentAlertSummary(patientAlerts),
      ]),
    )
  }, [alerts])

  const averageHeartRate = stats.length ? stats.reduce((sum, stat) => sum + stat.avg_heart_rate, 0) / stats.length : 0
  const averageTemperature = stats.length ? stats.reduce((sum, stat) => sum + stat.avg_temperature, 0) / stats.length : 0
  const averageOxygen = stats.length ? stats.reduce((sum, stat) => sum + stat.avg_oxygen, 0) / stats.length : 0
  const aggregateAlerts = stats.reduce((sum, stat) => sum + stat.alerts_count, 0)
  const batchStatusLabel = batchStatus?.last_run_status
    ? batchStatus.last_run_status.charAt(0).toUpperCase() + batchStatus.last_run_status.slice(1)
    : "Unknown"
  const lastSuccessfulBatchRun = batchStatus?.last_successful_run_at

  const rows = useMemo(() => patients.map((patient) => {
    const stat = statsMap[patient.id]
    const alertSummary = alertSummaryMap[patient.id] || {
      count: 0,
      severities: new Set(),
    }

    return {
      patient,
      stat,
      alertSummary,
      displayName: getPatientDisplayName(patient),
    }
  }), [alertSummaryMap, patients, statsMap])

  const criticalPatientsCount = rows.filter(({alertSummary}) => alertSummary.severities.has("critical")).length
  const highAlertPatientsCount = rows.filter(({alertSummary}) => alertSummary.severities.has("high")).length
  const mostProblematicVital = (() => {
    const vitalCounts = alerts
      .filter((alert) => ["critical", "high"].includes(String(alert.severity || "").toLowerCase()))
      .reduce((accumulator, alert) => {
        const vital = getAlertVital(alert)
        if (vital === "unknown") {
          return accumulator
        }
        accumulator[vital] = (accumulator[vital] || 0) + 1
        return accumulator
      }, {})

    const [vital] = Object.entries(vitalCounts).sort((left, right) => right[1] - left[1])[0] || []
    return formatVitalName(vital)
  })()

  const filteredRows = rows.filter(({patient, alertSummary}) => {
    const severityMatches = (() => {
      if (severityFilter === "all") return true
      if (severityFilter === "any") return alertSummary.count > 0
      if (severityFilter === "none") return alertSummary.count === 0
      return alertSummary.severities.has(severityFilter)
    })()

    const statusMatches = (() => {
      if (statusFilter === "all") return true
      if (statusFilter === "admitted") return !patient.is_discharged
      if (statusFilter === "discharged") return patient.is_discharged === true
      return true
    })()

    return severityMatches && statusMatches
  })

  const sortedRows = [...filteredRows].sort((left, right) => {
    if (sortOrder === "patient_name") {
      return left.displayName.localeCompare(right.displayName, undefined, {sensitivity: "base"})
    }
    if (sortOrder === "avg_heart_rate") {
      return (right.stat?.avg_heart_rate ?? -1) - (left.stat?.avg_heart_rate ?? -1)
    }
    if (sortOrder === "avg_oxygen") {
      return (right.stat?.avg_oxygen ?? -1) - (left.stat?.avg_oxygen ?? -1)
    }
    if (sortOrder === "avg_temperature") {
      return (right.stat?.avg_temperature ?? -1) - (left.stat?.avg_temperature ?? -1)
    }
    if (sortOrder === "alerts_count") {
      return (right.stat?.alerts_count ?? right.alertSummary.count ?? 0) - (left.stat?.alerts_count ?? left.alertSummary.count ?? 0)
    }
    return comparePatientsByStatusThenName(left.patient, right.patient)
  })

  const pagesCount = Math.max(1, Math.ceil(sortedRows.length / PAGE_SIZE))
  const paginatedRows = sortedRows.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE)

  useEffect(() => {
    if (currentPage > pagesCount) {
      setCurrentPage(pagesCount)
    }
  }, [currentPage, pagesCount])

  return (
    <ContentLayout>
      <SpaceBetween size="m">
        <div className="medstream-page-header">
          <h1 className="medstream-page-title">{departmentName}</h1>
          <p>Department patients and batch analytics overview</p>
        </div>

        <Container>
          <ColumnLayout columns={4} variant="text-grid">
            <SpaceBetween size="xs">
              <Box color="text-body-secondary" variant="awsui-key-label">Patients</Box>
              <Box variant="h2"><CountValue value={patients.length}/></Box>
            </SpaceBetween>
            <SpaceBetween size="xs">
              <Box color="text-body-secondary" variant="awsui-key-label">Batch status</Box>
              <StatusIndicator type={batchStatusLabel.toLowerCase() === "success" ? "success" : "info"}>{batchStatusLabel}</StatusIndicator>
            </SpaceBetween>
            <SpaceBetween size="xs">
              <Box color="text-body-secondary" variant="awsui-key-label">Average heart rate</Box>
              <Box variant="h2">{stats.length ? averageHeartRate.toFixed(1) : "--"}</Box>
            </SpaceBetween>
            <SpaceBetween size="xs">
              <Box color="text-body-secondary" variant="awsui-key-label">Average oxygen</Box>
              <Box variant="h2">{stats.length ? averageOxygen.toFixed(1) : "--"}</Box>
            </SpaceBetween>
            <SpaceBetween size="xs">
              <Box color="text-body-secondary" variant="awsui-key-label">Average temperature</Box>
              <Box variant="h2">{stats.length ? averageTemperature.toFixed(1) : "--"}</Box>
            </SpaceBetween>
            <SpaceBetween size="xs">
              <Box color="text-body-secondary" variant="awsui-key-label">Critical patients</Box>
              <Box variant="h2"><CountValue value={criticalPatientsCount}/></Box>
            </SpaceBetween>
            <SpaceBetween size="xs">
              <Box color="text-body-secondary" variant="awsui-key-label">High alert patients</Box>
              <Box variant="h2"><CountValue value={highAlertPatientsCount}/></Box>
            </SpaceBetween>
            <SpaceBetween size="xs">
              <Box color="text-body-secondary" variant="awsui-key-label">Most problematic vital</Box>
              <Box variant="h2">{mostProblematicVital}</Box>
            </SpaceBetween>
          </ColumnLayout>
        </Container>

        <Container header={<Header variant="h2">Department controls</Header>}>
          <div className="medstream-controls-grid">
            <Select
              selectedOption={getSelectedOption(departmentOptions, departmentName)}
              options={departmentOptions}
              selectedAriaLabel="Selected department"
              placeholder="Select department"
              onChange={({detail}) => {
                if (detail.selectedOption.value) {
                  navigate(`/departments/${encodeURIComponent(detail.selectedOption.value)}`)
                }
              }}
            />
            <Select
              selectedOption={getSelectedOption(SEVERITY_FILTERS, severityFilter)}
              options={SEVERITY_FILTERS}
              selectedAriaLabel="Selected alert presence"
              onChange={({detail}) => setSeverityFilter(detail.selectedOption.value || "all")}
            />
            <Select
              selectedOption={getSelectedOption(STATUS_FILTERS, statusFilter)}
              options={STATUS_FILTERS}
              selectedAriaLabel="Selected patient status"
              onChange={({detail}) => setStatusFilter(detail.selectedOption.value || "all")}
            />
            <Select
              selectedOption={getSelectedOption(SORT_OPTIONS, sortOrder)}
              options={SORT_OPTIONS}
              selectedAriaLabel="Selected sort order"
              onChange={({detail}) => setSortOrder(detail.selectedOption.value || "status_then_name")}
            />
          </div>
        </Container>

        <Container>
          <ColumnLayout columns={3} variant="text-grid">
            <SpaceBetween size="xs">
              <Box color="text-body-secondary" variant="awsui-key-label">Last successful batch run</Box>
              <Box variant="h3">{lastSuccessfulBatchRun ? new Date(lastSuccessfulBatchRun).toLocaleTimeString() : "--"}</Box>
              <Box color="text-body-secondary">{lastSuccessfulBatchRun ? new Date(lastSuccessfulBatchRun).toLocaleDateString() : "No successful run yet"}</Box>
            </SpaceBetween>
            <SpaceBetween size="xs">
              <Box color="text-body-secondary" variant="awsui-key-label">Alerts</Box>
              <Box variant="h3"><CountValue value={aggregateAlerts}/></Box>
              <Box color="text-body-secondary">Aggregated alerts in this department.</Box>
            </SpaceBetween>
            <SpaceBetween size="xs">
              <Box color="text-body-secondary" variant="awsui-key-label">Filtered rows</Box>
              <Box variant="h3"><CountValue value={sortedRows.length}/></Box>
              <Box color="text-body-secondary">Patients matching current filters.</Box>
            </SpaceBetween>
          </ColumnLayout>
        </Container>

        <Container
          header={
            <Header
              variant="h2"
              actions={
              <Pagination
                currentPageIndex={currentPage}
                pagesCount={pagesCount}
                onChange={({detail}) => setCurrentPage(detail.currentPageIndex)}
              />
              }
            >
              Patients
            </Header>
          }
        >
          <div className="medstream-column-divider-table">
            <Table
              variant="borderless"
              items={paginatedRows}
              loading={isLoading}
              loadingText="Loading department analytics"
              empty={<Box color="text-body-secondary">{patients.length === 0 ? `No patients are currently assigned to ${departmentName}.` : "No department patients match the current filters."}</Box>}
              columnDefinitions={[
                {
                  id: "patient",
                  header: "Patient",
                  cell: ({patient, displayName}) => (
                    <Button variant="inline-link" onClick={() => navigate(`/patient/${patient.id}`)}>{displayName}</Button>
                  ),
                },
                {
                  id: "status",
                  header: "Status",
                  cell: ({patient}) => patient.is_discharged
                    ? <StatusIndicator type="stopped">Discharged</StatusIndicator>
                    : <StatusIndicator type="success">Admitted</StatusIndicator>,
                },
                {
                  id: "alerts",
                  header: "Alerts",
                  cell: ({alertSummary}) => renderAlertStatus(alertSummary),
                },
                {
                  id: "alertCount",
                  header: "Alert count",
                  cell: ({stat, alertSummary}) => <CountValue value={stat?.alerts_count ?? alertSummary.count}/>,
                },
                {
                  id: "heartRate",
                  header: "Avg HR",
                  cell: ({stat}) => stat ? stat.avg_heart_rate.toFixed(1) : "--",
                },
                {
                  id: "temperature",
                  header: "Avg Temp",
                  cell: ({stat}) => stat ? stat.avg_temperature.toFixed(1) : "--",
                },
                {
                  id: "oxygen",
                  header: "Avg O2",
                  cell: ({stat}) => stat ? stat.avg_oxygen.toFixed(1) : "--",
                },
                {
                  id: "snapshot",
                  header: "Snapshot",
                  cell: ({stat}) => stat?.computed_at ? new Date(stat.computed_at).toLocaleTimeString() : "--",
                },
              ]}
            />
          </div>
        </Container>
      </SpaceBetween>
    </ContentLayout>
  )
}
