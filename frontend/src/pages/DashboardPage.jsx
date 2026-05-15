import {useCallback, useEffect, useMemo, useRef, useState} from "react"
import {useNavigate} from "react-router-dom"
import {
  Box,
  Button,
  ColumnLayout,
  Container,
  ContentLayout,
  Header,
  SpaceBetween,
  StatusIndicator,
  Table,
  Tabs,
} from "@cloudscape-design/components"
import CountValue from "../components/CountValue.jsx"
import {useNotifications} from "../hooks/useNotifications.js"
import {getAlertDashboardSummary, listPatients} from "../services/patientApi.js"
import {listDoctors} from "../services/doctorApi.js"
import {getErrorMessage, getResponseData} from "../services/apiMessages.js"
import {createWebSocket} from "../services/ws.js"
import VitalsChart from "../components/VitalsChart.jsx"
import {formatPatientFullName} from "../utils/patients.js"
import LoadingSpinner from "../components/LoadingSpinner.jsx"

const MAX_PREVIEW_ALERTS = 4
const MAX_ALERTS = 60
const isCriticalHighAlert = (alert) => alert?.severity === "critical" || alert?.severity === "high"

const toAlertTimestamp = (alert) => {
  const time = new Date(alert?.created_at || 0).getTime()
  return Number.isFinite(time) ? time : 0
}

const normalizeCriticalHighAlerts = (alerts) => {
  if (!Array.isArray(alerts)) {
    return []
  }
  return alerts
    .filter((alert) => Number.isInteger(alert?.patient_id) && isCriticalHighAlert(alert))
    .sort((left, right) => toAlertTimestamp(right) - toAlertTimestamp(left))
}

const mergeAlertPreviews = (incomingAlerts, previousAlerts) => {
  const incoming = normalizeCriticalHighAlerts(incomingAlerts)
  const previous = normalizeCriticalHighAlerts(previousAlerts)
  if (!incoming.length) {
    return previous
  }

  const mostRecentIncoming = toAlertTimestamp(incoming[0])
  const mostRecentPrevious = previous.length ? toAlertTimestamp(previous[0]) : 0
  if (mostRecentIncoming < mostRecentPrevious) {
    return previous
  }

  const mergedById = new Map()
  ;[...incoming, ...previous].forEach((alert) => {
    if (!alert?.id) {
      return
    }
    const current = mergedById.get(alert.id)
    if (!current || toAlertTimestamp(alert) > toAlertTimestamp(current)) {
      mergedById.set(alert.id, alert)
    }
  })

  return Array.from(mergedById.values())
    .sort((left, right) => toAlertTimestamp(right) - toAlertTimestamp(left))
}

const areSameAlerts = (left, right) => {
  if (left === right) {
    return true
  }
  if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length) {
    return false
  }
  return left.every((item, index) => {
    const other = right[index]
    return item?.id === other?.id && toAlertTimestamp(item) === toAlertTimestamp(other)
  })
}

function getSeverityType(severity) {
  if (severity === "critical") {
    return "error"
  }
  if (severity === "high") {
    return "warning"
  }
  return "success"
}

export default function DashboardPage() {
  const navigate = useNavigate()
  const {notifyError} = useNotifications()
  const [vitals, setVitals] = useState([])
  const [previewAlerts, setPreviewAlerts] = useState(null)
  const [totalAlerts, setTotalAlerts] = useState(0)
  const [patients, setPatients] = useState([])
  const [doctors, setDoctors] = useState([])
  const [isLoadingDashboard, setIsLoadingDashboard] = useState(true)
  const alertAudioRef = useRef(null)
  const [chartData, setChartData] = useState([])

  const upsertPreviewAlerts = useCallback((incomingAlerts) => {
    setPreviewAlerts((prev) => {
      const next = mergeAlertPreviews(incomingAlerts, prev)
      const existing = Array.isArray(prev) ? prev : []
      const merged = [
        ...next,
        ...existing.filter((current) => !next.some((incoming) => incoming.id === current.id)),
      ]
        .sort((left, right) => toAlertTimestamp(right) - toAlertTimestamp(left))
        .slice(0, MAX_ALERTS)

      return areSameAlerts(existing, merged) ? prev : merged
    })
  }, [])

  if (!alertAudioRef.current) {
    alertAudioRef.current = new Audio("/alert.mp3")
  }

  const loadDashboardData = useCallback(async () => {
    try {
      const [patientsRes, doctorsRes, alertsSummaryRes] = await Promise.all([
        listPatients({page: 1, limit: 100}),
        listDoctors(),
        getAlertDashboardSummary(),
      ])

      setPatients(getResponseData(patientsRes))
      setDoctors(getResponseData(doctorsRes) || [])
      const summary = getResponseData(alertsSummaryRes)
      setTotalAlerts(Number(summary?.total_alerts || 0))
      upsertPreviewAlerts(summary?.preview_alerts)
    } catch (error) {
      notifyError(getErrorMessage(error))
    } finally {
      setIsLoadingDashboard(false)
    }
  }, [notifyError, upsertPreviewAlerts])

  useEffect(() => {
    loadDashboardData()
    const intervalId = window.setInterval(() => {
      loadDashboardData()
    }, 10000)
    return () => window.clearInterval(intervalId)
  }, [loadDashboardData])

  useEffect(() => {
    const socket = createWebSocket((msg) => {
      if (msg.type === "vital") {
        const v = msg.data

        setVitals((prev) => [
          {
            ...v,
            time: new Date().toLocaleTimeString(),
          },
          ...prev.slice(0, 20),
        ])

        setChartData((prev) => {
          const updated = [
            ...prev,
            {
              time: new Date().toLocaleTimeString(),
              heart_rate: v.heart_rate,
              oxygen_saturation: v.oxygen_saturation,
              temperature: v.temperature,
            },
          ]

          return updated.slice(-20)
        })
      }

      if (msg.type === "alert") {
        if (!msg.data?.patient_id) {
          return
        }
        setTotalAlerts((prev) => prev + 1)
        alertAudioRef.current.currentTime = 0
        alertAudioRef.current.play().catch(() => {
        })

        if (msg.data?.severity === "high" || msg.data?.severity === "critical") {
          upsertPreviewAlerts([msg.data])
        }
      }
    })

    return () => {
      socket.close()
    }
  }, [upsertPreviewAlerts])

  const latestVital = vitals[0]
  const patientNameById = Object.fromEntries(patients.map((patient) => [patient.id, formatPatientFullName(patient)]))
  const validPatientIds = new Set(patients.map((patient) => patient.id))
  const visiblePreviewAlerts = (previewAlerts || []).filter((alert) => validPatientIds.has(alert.patient_id))
  const limitedVisiblePreviewAlerts = visiblePreviewAlerts.slice(0, MAX_PREVIEW_ALERTS)
  const recentVitals = vitals.slice(0, 5)

  const criticalAlerts = useMemo(
    () => visiblePreviewAlerts.filter((alert) => alert?.severity === "critical").length,
    [visiblePreviewAlerts],
  )

  const averageHeartRate = recentVitals.length
    ? (recentVitals.reduce((sum, vital) => sum + vital.heart_rate, 0) / recentVitals.length).toFixed(1)
    : "--"
  const recentOxygenAverage = recentVitals.length
    ? (recentVitals.reduce((sum, vital) => sum + vital.oxygen_saturation, 0) / recentVitals.length).toFixed(1)
    : "--"
  const recentTemperatureAverage = recentVitals.length
    ? (recentVitals.reduce((sum, vital) => sum + vital.temperature, 0) / recentVitals.length).toFixed(1)
    : "--"
  const heartRateDelta = recentVitals.length >= 2 ? recentVitals[0].heart_rate - recentVitals[recentVitals.length - 1].heart_rate : 0
  const oxygenDelta = recentVitals.length >= 2 ? recentVitals[0].oxygen_saturation - recentVitals[recentVitals.length - 1].oxygen_saturation : 0
  const temperatureDelta = recentVitals.length >= 2 ? recentVitals[0].temperature - recentVitals[recentVitals.length - 1].temperature : 0
  const formatDelta = (value) => value > 0 ? `+${value.toFixed(1)}` : value.toFixed(1)

  const patientStatusById = useMemo(() => {
    const map = new Map()
    visiblePreviewAlerts.forEach((alert) => {
      const current = map.get(alert.patient_id)
      if (alert.severity === "critical") {
        map.set(alert.patient_id, "critical")
      } else if (!current && alert.severity === "high") {
        map.set(alert.patient_id, "warning")
      }
    })
    return map
  }, [visiblePreviewAlerts])

  const patientRows = patients.slice(0, 10).map((patient) => {
    const severity = patientStatusById.get(patient.id) || "normal"
    return {
      ...patient,
      fullName: formatPatientFullName(patient),
      clinicalStatus: severity,
    }
  })

  if (isLoadingDashboard) {
    return (
      <ContentLayout>
        <SpaceBetween size="m">
          <div className="medstream-page-header">
            <h1 className="medstream-page-title">MedStream Dashboard</h1>
            <p>Real-time patient monitoring and batch analytics overview</p>
          </div>
          <LoadingSpinner text="Loading dashboard data..."/>
        </SpaceBetween>
      </ContentLayout>
    )
  }

  return (
    <ContentLayout>
      <SpaceBetween size="m">
        <div className="medstream-page-header">
          <h1 className="medstream-page-title">MedStream Dashboard</h1>
          <p>Real-time patient monitoring and batch analytics overview</p>
        </div>

        <Container>
          <ColumnLayout columns={4} variant="text-grid">
            <SpaceBetween size="xs">
              <Box color="text-body-secondary" variant="awsui-key-label">Active patients</Box>
              <Box variant="h2"><CountValue value={patients.length}/></Box>
            </SpaceBetween>
            <SpaceBetween size="xs">
              <Box color="text-body-secondary" variant="awsui-key-label">Critical alerts</Box>
              <Box variant="h2"><CountValue value={criticalAlerts}/></Box>
            </SpaceBetween>
            <SpaceBetween size="xs">
              <Box color="text-body-secondary" variant="awsui-key-label">Total doctors</Box>
              <Box variant="h2"><CountValue value={doctors.length}/></Box>
            </SpaceBetween>
            <SpaceBetween size="xs">
              <Box color="text-body-secondary" variant="awsui-key-label">Total alerts tracked</Box>
              <Box variant="h2"><CountValue value={totalAlerts}/></Box>
            </SpaceBetween>
          </ColumnLayout>
        </Container>

        <div className="medstream-dashboard-split">
          <div className="medstream-stretch-container">
            <Container
              header={<Header variant="h2">Live patient monitoring</Header>}
            >
              <SpaceBetween size="m">
                {isLoadingDashboard ? (
                  <Box color="text-body-secondary">Loading dashboard data...</Box>
                ) : (
                  <VitalsChart data={chartData}/>
                )}
                <div className="medstream-vitals-insights">
                  <ColumnLayout columns={4} variant="text-grid">
                    <SpaceBetween size="xxs">
                      <Box color="text-body-secondary" variant="awsui-key-label">HR trend</Box>
                      <Box variant="h3"><span className="medstream-vital-primary">{averageHeartRate}</span></Box>
                      <Box color="text-body-secondary" variant="small">{formatDelta(heartRateDelta)} over last {recentVitals.length || 0} samples</Box>
                    </SpaceBetween>
                    <SpaceBetween size="xxs">
                      <Box color="text-body-secondary" variant="awsui-key-label">O2 trend</Box>
                      <Box variant="h3"><span className="medstream-vital-primary">{recentOxygenAverage}</span></Box>
                      <Box color="text-body-secondary" variant="small">{formatDelta(oxygenDelta)} over last {recentVitals.length || 0} samples</Box>
                    </SpaceBetween>
                    <SpaceBetween size="xxs">
                      <Box color="text-body-secondary" variant="awsui-key-label">Temp trend</Box>
                      <Box variant="h3"><span className="medstream-vital-primary">{recentTemperatureAverage}</span></Box>
                      <Box color="text-body-secondary" variant="small">{formatDelta(temperatureDelta)} over last {recentVitals.length || 0} samples</Box>
                    </SpaceBetween>
                    <SpaceBetween size="xxs">
                      <Box color="text-body-secondary" variant="awsui-key-label">Latest BP</Box>
                      <Box variant="h3"><span className="medstream-vital-primary">{latestVital ? `${latestVital.systolic_bp}/${latestVital.diastolic_bp}` : "--"}</span></Box>
                      <Box color="text-body-secondary" variant="small">
                        {latestVital ? `Recorded at ${latestVital.time}` : "Waiting for samples"}
                      </Box>
                    </SpaceBetween>
                  </ColumnLayout>
                </div>
              </SpaceBetween>
            </Container>
          </div>

          <div className="medstream-stretch-container">
            <Container
              header={<Header variant="h2" actions={<Button onClick={() => navigate("/alerts")}>View all</Button>}>Latest alerts</Header>}
            >
              <SpaceBetween size="xs">
                {previewAlerts === null && <Box color="text-body-secondary">Loading alerts...</Box>}
                {previewAlerts !== null && limitedVisiblePreviewAlerts.length === 0 && (
                  <Box color="text-body-secondary">No critical or high alerts at the moment.</Box>
                )}
                {previewAlerts !== null && limitedVisiblePreviewAlerts.map((alert) => (
                  <Container key={alert.id} fitHeight>
                    <SpaceBetween size="xxs">
                      <Box variant="small">
                        <StatusIndicator type={getSeverityType(alert.severity)}>
                          {alert.severity === "critical" ? "Critical" : "Warning"}
                        </StatusIndicator>
                      </Box>
                      <Box variant="small">{patientNameById[alert.patient_id] || `Patient #${alert.patient_id}`}</Box>
                      <Box color="text-body-secondary" variant="small">{alert.message}</Box>
                      <Box color="text-body-secondary" variant="small">{new Date(alert.created_at || Date.now()).toLocaleString()}</Box>
                    </SpaceBetween>
                  </Container>
                ))}
              </SpaceBetween>
            </Container>
          </div>
        </div>

        <Container header={<Header variant="h2">Patients</Header>}>
          <div className="medstream-column-divider-table">
            <Table
              variant="borderless"
              items={patientRows}
              trackBy="id"
              empty={<Box color="text-body-secondary">No patients available.</Box>}
              columnDefinitions={[
                {
                  id: "name",
                  header: "Patient",
                  cell: (item) => item.fullName,
                },
                {
                  id: "status",
                  header: "Status",
                  cell: (item) => {
                    if (item.clinicalStatus === "critical") {
                      return <StatusIndicator type="error">Critical</StatusIndicator>
                    }
                    if (item.clinicalStatus === "warning") {
                      return <StatusIndicator type="warning">Warning</StatusIndicator>
                    }
                    return <StatusIndicator type="success">Normal</StatusIndicator>
                  },
                },
                {
                  id: "cnp",
                  header: "CNP",
                  cell: (item) => item.cnp,
                },
                {
                  id: "actions",
                  header: "Actions",
                  cell: (item) => <Button variant="inline-link" onClick={() => navigate(`/patient/${item.id}`)}>Open</Button>,
                },
              ]}
            />
          </div>
        </Container>

        <Container>
          <Tabs
            tabs={[
              {
                id: "streaming",
                label: "Streaming overview",
                content: (
                  <SpaceBetween size="xs">
                    <Box variant="h3">Streaming overview</Box>
                    <Box color="text-body-secondary">Live telemetry and alerts update continuously through the streaming pipeline.</Box>
                    <Button onClick={() => navigate("/metrics/streaming")}>Open streaming metrics</Button>
                  </SpaceBetween>
                ),
              },
              {
                id: "batch",
                label: "Batch analytics",
                content: (
                  <SpaceBetween size="xs">
                    <Box variant="h3">Batch analytics</Box>
                    <Box color="text-body-secondary">Batch jobs aggregate longer windows for trend reliability and treatment insights.</Box>
                    <Button onClick={() => navigate("/metrics/batch")}>Open batch analytics</Button>
                  </SpaceBetween>
                ),
              },
              {
                id: "comparison",
                label: "Streaming vs Batch",
                content: (
                  <SpaceBetween size="xs">
                    <Box variant="h3">Streaming vs Batch</Box>
                    <Box color="text-body-secondary">Compare responsiveness and aggregate quality between low-latency and periodic processing.</Box>
                    <Button onClick={() => navigate("/metrics/comparison")}>Open comparison</Button>
                  </SpaceBetween>
                ),
              },
              {
                id: "how",
                label: "How it works",
                content: (
                  <SpaceBetween size="xs">
                    <Box variant="h3">How it works</Box>
                    <Box color="text-body-secondary">Patient vitals are ingested in real time for immediate alerting, then reprocessed in batch for broader analytics and validation.</Box>
                    <Button onClick={() => navigate("/how-it-works")}>Open how it works</Button>
                  </SpaceBetween>
                ),
              },
            ]}
          />
        </Container>
      </SpaceBetween>
    </ContentLayout>
  )
}
