import {useEffect, useState} from "react"
import {useParams} from "react-router-dom"
import {
  Badge,
  Box,
  Container,
  ContentLayout,
  Header,
  SpaceBetween,
  StatusIndicator,
} from "@cloudscape-design/components"
import AppBreadcrumbs from "../components/AppBreadcrumbs.jsx"
import LoadingSpinner from "../components/LoadingSpinner.jsx"
import PostDischargeClinicalSummaryCard from "../components/PostDischargeClinicalSummaryCard.jsx"
import PatientAssignmentStatus from "../components/PatientAssignmentStatus.jsx"
import {useNotifications} from "../hooks/useNotifications.js"
import {getErrorMessage, getResponseData} from "../services/apiMessages.js"
import {getPatient, getPatientPostDischargeSummary} from "../services/patientApi.js"

export default function PatientPostDischargeSummaryPage() {
  const {id} = useParams()
  const {notifyError} = useNotifications()
  const [patient, setPatient] = useState(null)
  const [summary, setSummary] = useState(null)
  const [isLoading, setIsLoading] = useState(true)
  const patientId = Number(id)

  useEffect(() => {
    if (!Number.isFinite(patientId)) {
      setIsLoading(false)
      return
    }

    let active = true

    const loadPageData = async () => {
      setIsLoading(true)
      try {
        const [patientResult, summaryResult] = await Promise.allSettled([
          getPatient(patientId),
          getPatientPostDischargeSummary(patientId),
        ])

        if (!active) {
          return
        }

        if (patientResult.status === "fulfilled") {
          setPatient(getResponseData(patientResult.value))
        } else {
          notifyError(getErrorMessage(patientResult.reason))
        }

        if (summaryResult.status === "fulfilled") {
          setSummary(getResponseData(summaryResult.value) || null)
        } else {
          setSummary(null)
        }
      } catch (error) {
        if (active) {
          setSummary(null)
          notifyError(getErrorMessage(error))
        }
      } finally {
        if (active) {
          setIsLoading(false)
        }
      }
    }

    loadPageData()

    return () => {
      active = false
    }
  }, [notifyError, patientId])

  const patientName = patient ? `${patient.last_name || ""} ${patient.first_name || ""}`.trim() || "Patient" : "Patient"
  const patientStatusText = patient?.is_discharged ? "Discharged" : "Admitted"
  const summaryStatus = String(summary?.status || "").trim().toLowerCase()
  const hasSummary = summaryStatus === "ready" || summaryStatus === "pending"
  const summaryStatusText = summaryStatus === "ready" ? "Ready" : summaryStatus === "pending" ? "Preparing" : "Unavailable"
  const summaryStatusType = summaryStatus === "ready" ? "success" : summaryStatus === "pending" ? "pending" : "stopped"

  return (
    <ContentLayout>
      <SpaceBetween size="m">
        <div className="medstream-page-header">
          <AppBreadcrumbs/>
          <div className="medstream-page-heading-row">
            <div>
              <h1 className="medstream-page-title">{patientName}</h1>
              <p>Post-Discharge Clinical Summary</p>
              <div className="medstream-page-filter-row">
                <StatusIndicator type={patient?.is_discharged ? "stopped" : "success"}>
                  {patientStatusText}
                </StatusIndicator>
                <PatientAssignmentStatus patientId={patientId}/>
                <span className="medstream-department-badge">
                  <Badge color="blue">{patient?.department || "--"}</Badge>
                </span>
              </div>
            </div>
          </div>
        </div>

        {isLoading ? (
          <LoadingSpinner/>
        ) : hasSummary ? (
          <SpaceBetween size="l">
            <Container
              header={
                <Header
                  variant="h2"
                  description="Discharge state, summary generation status, and patient context."
                >
                  Summary status
                </Header>
              }
            >
              <div className="post-discharge-fit-grid">
                <SpaceBetween size="xxs">
                  <Box color="text-body-secondary" variant="awsui-key-label">Patient status</Box>
                  <div className="post-discharge-page-status-value">{patientStatusText}</div>
                </SpaceBetween>
                <SpaceBetween size="xxs">
                  <Box color="text-body-secondary" variant="awsui-key-label">Summary status</Box>
                  <div className="post-discharge-page-status-value">
                    <StatusIndicator type={summaryStatusType}>{summaryStatusText}</StatusIndicator>
                  </div>
                </SpaceBetween>
                <SpaceBetween size="xxs">
                  <Box color="text-body-secondary" variant="awsui-key-label">Department</Box>
                  <div className="post-discharge-page-status-value">{patient?.department || "--"}</div>
                </SpaceBetween>
                <SpaceBetween size="xxs">
                  <Box color="text-body-secondary" variant="awsui-key-label">Patient ID</Box>
                  <div className="post-discharge-page-status-value">{patientId}</div>
                </SpaceBetween>
              </div>
            </Container>

            <PostDischargeClinicalSummaryCard summary={summary}/>
          </SpaceBetween>
        ) : (
          <Container
            header={<Header variant="h2">Post-Discharge Clinical Summary</Header>}
          >
            <Box color="text-body-secondary">
              No post-discharge clinical summary is available for this patient.
            </Box>
          </Container>
        )}
      </SpaceBetween>
    </ContentLayout>
  )
}
