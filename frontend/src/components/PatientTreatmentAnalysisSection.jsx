import {useCallback, useEffect, useMemo, useRef, useState} from "react"
import {Area, AreaChart, CartesianGrid, ReferenceArea, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis} from "recharts"
import {useNotifications} from "../hooks/useNotifications.js"
import {getErrorMessage, getResponseData} from "../services/apiMessages.js"
import {getPatient, getPatientTreatmentAnalysis} from "../services/patientApi.js"
import {createWebSocket} from "../services/ws.js"
import LoadingSpinner from "./LoadingSpinner.jsx"
import {alertTypeToVital, getAlertSeverityLevel, isNormalizedAlertType, normalizeAlertType} from "../utils/alerts.js"
import {formatAlertFriendlyTime} from "../utils/time.js"

const DIAGNOSIS_PAGE_SIZE_COLLAPSED = 1
const DIAGNOSIS_PAGE_SIZE_EXPANDED = 3
const CONDITION_PAGE_SIZE = 3
const ALERT_HISTORY_EXPANDED_PAGE_SIZE = 4
const OUTCOME_CONFIG = {
  Effective: {value: 2, color: "#22c55e"},
  Improving: {value: 1, color: "#f59e0b"},
  Ineffective: {value: 0, color: "#ef4444"},
}

function normalizeOutcomeLabel(value) {
  const normalized = String(value || "").trim().toLowerCase()
  if (normalized === "effective") {
    return "Effective"
  }
  if (normalized === "improving") {
    return "Improving"
  }
  return "Ineffective"
}

const toTimestamp = (value) => {
  const time = new Date(value).getTime()
  return Number.isFinite(time) ? time : null
}

function formatDate(value) {
  const date = new Date(value)
  if (!Number.isFinite(date.getTime())) {
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
  }).format(date)
}

function formatTime(value) {
  const date = new Date(value)
  if (!Number.isFinite(date.getTime())) {
    return ""
  }
  return date.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  })
}

function formatAlertLastUpdated(value) {
  const date = new Date(value)
  if (!Number.isFinite(date.getTime())) {
    return "--"
  }
  return new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    day: "numeric",
    month: "short",
    hour12: false,
  }).format(date)
}

function compareAlertsNewestFirst(left, right) {
  const leftTime = toTimestamp(left?.created_at) ?? 0
  const rightTime = toTimestamp(right?.created_at) ?? 0
  if (rightTime !== leftTime) {
    return rightTime - leftTime
  }
  return Number(right?.id || 0) - Number(left?.id || 0)
}

function getTreatmentEventTimestamp(treatment) {
  return treatment?.timestamp || treatment?.prescribed_at || treatment?.created_at || treatment?.updated_at || null
}

function compareTreatmentsAscending(left, right) {
  const leftTime = toTimestamp(getTreatmentEventTimestamp(left)) ?? 0
  const rightTime = toTimestamp(getTreatmentEventTimestamp(right)) ?? 0
  if (leftTime !== rightTime) {
    return leftTime - rightTime
  }

  const leftId = Number(left?.id || 0)
  const rightId = Number(right?.id || 0)
  if (leftId !== rightId) {
    return leftId - rightId
  }

  const actionPriority = {add: 0, modify: 1}
  const leftAction = actionPriority[String(left?.action || "").trim().toLowerCase()] ?? 0
  const rightAction = actionPriority[String(right?.action || "").trim().toLowerCase()] ?? 0
  return leftAction - rightAction
}

function getLatestSummaryStylesBySeverity(severity) {
  if (severity === "critical") {
    return {
      card: "border-[#4e1d26] bg-[#1c1217]",
      value: "text-[#ff8fa1]",
      time: "text-[#ffb3bc]",
    }
  }
  if (severity === "high") {
    return {
      card: "border-[#4b351a] bg-[#1d1710]",
      value: "text-[#ffcf85]",
      time: "text-[#ffd9a3]",
    }
  }
  return {
    card: "border-[#214a34] bg-[#10241a]",
    value: "text-[#8fe1b1]",
    time: "text-[#b9ebcf]",
  }
}

function getLatestSummaryNeutralStyles() {
  return {
    card: "border-[#2a3441] bg-[#151b22]",
    value: "text-white",
    time: "text-[#b6bec9]",
  }
}

function hasRealVitalData(value) {
  if (value == null) {
    return false
  }
  if (typeof value === "number") {
    return Number.isFinite(value)
  }
  const text = String(value).trim()
  return text !== "" && text !== "--" && text.toLowerCase() !== "null" && text.toLowerCase() !== "undefined"
}

function getHistoryStylesBySeverity(severity) {
  if (severity === "critical") {
    return {
      label: "text-[#ff8fa1]",
    }
  }
  if (severity === "high") {
    return {
      label: "text-[#f6b26b]",
    }
  }
  return {
    label: "text-[#7fb8ff]",
  }
}

function renderHistoryMessageWithColoredLabel(message, labelClassName) {
  const text = String(message || "--")
  const separatorIndex = text.indexOf(":")
  if (separatorIndex <= 0) {
    return <span className="text-[#d5dbdb]">{text}</span>
  }

  const label = text.slice(0, separatorIndex)
  const rest = text.slice(separatorIndex)
  return (
    <>
      <span className={labelClassName}>{label}</span>
      <span className="text-[#d5dbdb]">{rest}</span>
    </>
  )
}

function formatAlertValue(value) {
  if (!Number.isFinite(value)) {
    return "--"
  }
  return Number.isInteger(value) ? String(value) : value.toFixed(1)
}

function buildCleanAlertHistoryLabel(alert) {
  const parsed = extractVitalsFromMessage(alert.message)
  const vitalKey = alertTypeToVital(alert.type)

  if (vitalKey === "heartRate") {
    const value = Number.isFinite(alert.value) ? alert.value : parsed.heartRate
    return `Heart Rate: ${formatAlertValue(value)} bpm`
  }
  if (vitalKey === "oxygen") {
    const value = Number.isFinite(alert.value) ? alert.value : parsed.oxygen
    return `Oxygen: ${formatAlertValue(value)}%`
  }
  if (vitalKey === "temperature") {
    const value = Number.isFinite(alert.value) ? alert.value : parsed.temperature
    return `Temperature: ${formatAlertValue(value)}°C`
  }
  return String(alert.message || "--")
}

function TreatmentOutcomeTooltip({active, payload}) {
  if (!active || !payload?.length) {
    return null
  }
  const point = payload[0]?.payload
  if (!point) {
    return null
  }

  return (
    <div className="rounded-xl border border-[#334155] bg-[#111827] p-3 text-xs text-white">
      <p className="font-semibold">Treatment #{point.treatmentIndex}</p>
      <p
        className={`mt-1 font-semibold ${
          point.outcome === "Effective"
            ? "text-[#22c55e]"
            : point.outcome === "Improving"
              ? "text-[#f59e0b]"
              : "text-[#ef4444]"
        }`}
      >
        Outcome: {point.outcome}
      </p>
      {point.decisionTimeLabel ? <p className="mt-1 text-[#d5dbdb]">Time: {point.decisionTimeLabel}</p> : null}
    </div>
  )
}

const extractVitalsFromMessage = (message) => {
  const text = String(message || "")
  const hrMatch = text.match(/HR\s*(-?\d+(?:\.\d+)?)/i)
  const o2Match = text.match(
    /(?:SpO2\s*|oxygen.*?:\s*)(\d+(?:\.\d+)?)/i,
  )
  const tempMatch = text.match(/Temp\s*(-?\d+(?:\.\d+)?)/i)
  return {
    heartRate: hrMatch ? Number(hrMatch[1]) : null,
    oxygen: o2Match ? Number(o2Match[1]) : null,
    temperature: tempMatch ? Number(tempMatch[1]) : null,
  }
}

const getAlertIdentityKey = (alert = {}) => {
  const idPart = alert?.id != null ? `id:${String(alert.id)}` : ""
  const patientPart = String(alert?.patient_id ?? alert?.patientId ?? alert?.patient ?? "")
  const typePart = String(alert?.alert_type ?? alert?.type ?? "").trim().toLowerCase()
  const createdAtPart = String(alert?.created_at ?? alert?.createdAt ?? "")
  const messagePart = String(alert?.message ?? "").trim()
  const valuePart = String(alert?.value ?? "")
  return idPart || [patientPart, typePart, createdAtPart, messagePart, valuePart].join("|")
}

const upsertAlertsNewestFirst = (currentAlerts = [], incomingAlert) => {
  const normalizedCurrent = Array.isArray(currentAlerts) ? currentAlerts : []
  const dedupeMap = new Map(normalizedCurrent.map((alert) => [getAlertIdentityKey(alert), alert]))
  dedupeMap.set(getAlertIdentityKey(incomingAlert), incomingAlert)
  return Array.from(dedupeMap.values()).sort(compareAlertsNewestFirst)
}

const dedupeAlertsNewestFirst = (alerts = []) => {
  const sorted = [...(Array.isArray(alerts) ? alerts : [])].sort(compareAlertsNewestFirst)
  const seenKeys = new Set()
  return sorted.filter((alert) => {
    const key = getAlertIdentityKey(alert)
    if (seenKeys.has(key)) {
      return false
    }
    seenKeys.add(key)
    return true
  })
}

const getMessagePatientId = (msg = {}) => {
  const candidateIds = [
    msg?.data?.patient_id,
    msg?.data?.patientId,
    msg?.data?.patient?.id,
    msg?.data?.payload?.patient_id,
    msg?.data?.payload?.patientId,
    msg?.patient_id,
    msg?.patientId,
  ]
  const matched = candidateIds.find((id) => id != null && String(id).trim() !== "")
  return matched == null ? null : String(matched)
}

const getIncomingAlertPayload = (msg = {}) => {
  const payload = msg?.data?.alert || msg?.data?.payload?.alert || msg?.data || msg?.alert || null
  if (!payload || typeof payload !== "object") {
    return null
  }
  return payload
}

const isAlertRelatedMessage = (msg = {}) => {
  const normalizedType = String(msg?.type || "").trim().toLowerCase()
  if (normalizedType.includes("alert")) {
    return true
  }
  const payload = getIncomingAlertPayload(msg)
  if (!payload) {
    return false
  }
  return Boolean(payload.alert_type || payload.type || payload.severity)
}

const normalizeTreatmentAlert = (alert) => {
  const normalizedType = normalizeAlertType(alert?.alert_type || alert?.type, alert?.severity)
  const normalizedSeverity = String(alert?.severity || "").trim().toLowerCase()
  const numericValue = Number(alert?.value)
  const oxygenValue =
    alert?.vitals?.oxygen != null
      ? Number(alert.vitals.oxygen)
      : null

  return {
    ...alert,
    type: normalizedType,
    severity: normalizedSeverity,
    time: toTimestamp(alert?.created_at),
    value: Number.isFinite(numericValue) ? numericValue : null,
    vitals: {
      heartRate: Number.isFinite(Number(alert?.vitals?.heartRate)) ? Number(alert?.vitals?.heartRate) : null,
      oxygen: Number.isFinite(oxygenValue) ? oxygenValue : null,
      temperature: Number.isFinite(Number(alert?.vitals?.temperature)) ? Number(alert?.vitals?.temperature) : null,
    },
  }
}

const getStatusVitals = (alert) => {
  if (!alert) {
    return {heartRate: null, oxygen: null, temperature: null}
  }
  const parsedFromMessage = extractVitalsFromMessage(alert.message)
  return {
    heartRate: alert.vitals?.heartRate ?? parsedFromMessage.heartRate,
    oxygen: alert.vitals?.oxygen ?? parsedFromMessage.oxygen,
    temperature: alert.vitals?.temperature ?? parsedFromMessage.temperature,
  }
}

export default function PatientTreatmentAnalysisSection({
                                                          selectedPatientId = null,
                                                          showSelectedPatientSummary = false,
                                                        }) {
  const {notifyError} = useNotifications()
  const [selectedPatient, setSelectedPatient] = useState(null)
  const [analysis, setAnalysis] = useState(null)
  const [isLoadingAnalysis, setIsLoadingAnalysis] = useState(true)
  const [showFullAlertHistory, setShowFullAlertHistory] = useState(false)
  const [alertHistoryPage, setAlertHistoryPage] = useState(1)
  const [medicationPage, setMedicationPage] = useState(1)
  const [diagnosisPage, setDiagnosisPage] = useState(1)
  const [conditionPage, setConditionPage] = useState(1)
  const analysisRefetchDebounceRef = useRef(null)

  const loadAnalysis = useCallback(async (patientId, options = {}) => {
    const {isBackground = false} = options
    if (!isBackground) {
      setIsLoadingAnalysis(true)
    }
    try {
      const response = await getPatientTreatmentAnalysis(patientId)
      const responseData = getResponseData(response) || null
      if (!responseData) {
        setAnalysis(null)
      } else {
        setAnalysis({
          ...responseData,
          alerts: dedupeAlertsNewestFirst(responseData.alerts || []),
        })
      }
    } catch (error) {
      if (!isBackground) {
        setAnalysis(null)
        notifyError(getErrorMessage(error))
      }
    } finally {
      if (!isBackground) {
        setIsLoadingAnalysis(false)
      }
    }
  }, [notifyError])

  useEffect(() => {
    if (!selectedPatientId) {
      return
    }
    setShowFullAlertHistory(false)
    setAlertHistoryPage(1)
    setMedicationPage(1)
    setDiagnosisPage(1)
    setConditionPage(1)

    const loadInitial = async () => {
      try {
        const patientResponse = await getPatient(selectedPatientId)
        const patientData = getResponseData(patientResponse)
        if (patientData) {
          setSelectedPatient({
            cnp: patientData.cnp,
            full_name: `${patientData.last_name} ${patientData.first_name}`.trim(),
            is_discharged: Boolean(patientData.is_discharged),
          })
        }
      } catch (error) {
        notifyError(getErrorMessage(error))
      }

      await loadAnalysis(selectedPatientId)
    }

    loadInitial().then(() => {
    })
  }, [loadAnalysis, notifyError, selectedPatientId])

  useEffect(() => {
    return () => {
      if (analysisRefetchDebounceRef.current) {
        window.clearTimeout(analysisRefetchDebounceRef.current)
        analysisRefetchDebounceRef.current = null
      }
    }
  }, [])

  useEffect(() => {
    if (!selectedPatientId) {
      return
    }

    const scheduleBackgroundAnalysisRefresh = () => {
      if (analysisRefetchDebounceRef.current) {
        window.clearTimeout(analysisRefetchDebounceRef.current)
      }
      analysisRefetchDebounceRef.current = window.setTimeout(() => {
        analysisRefetchDebounceRef.current = null
        loadAnalysis(selectedPatientId, {isBackground: true}).then(() => {
        })
      }, 500)
    }

    const socket = createWebSocket((msg) => {
      if (!isAlertRelatedMessage(msg)) {
        return
      }

      const messagePatientId = getMessagePatientId(msg)
      if (messagePatientId == null || String(messagePatientId) !== String(selectedPatientId)) {
        return
      }

      const incomingAlert = getIncomingAlertPayload(msg)
      if (!incomingAlert) {
        scheduleBackgroundAnalysisRefresh()
        return
      }

      setAnalysis((currentAnalysis) => {
        const base = currentAnalysis || {}
        const incomingAlertWithPatient = {
          ...incomingAlert,
          patient_id: incomingAlert.patient_id ?? incomingAlert.patientId ?? messagePatientId,
          created_at: incomingAlert.created_at || incomingAlert.createdAt || new Date().toISOString(),
        }

        return {
          ...base,
          alerts: upsertAlertsNewestFirst(base.alerts || [], incomingAlertWithPatient),
        }
      })
      setAlertHistoryPage(1)
      scheduleBackgroundAnalysisRefresh()
    })

    return () => {
      if (analysisRefetchDebounceRef.current) {
        window.clearTimeout(analysisRefetchDebounceRef.current)
        analysisRefetchDebounceRef.current = null
      }
      socket.close()
    }
  }, [loadAnalysis, selectedPatientId])

  const parsedAlerts = useMemo(() => {
    return dedupeAlertsNewestFirst(analysis?.alerts || [])
      .map((alert) => normalizeTreatmentAlert(alert))
      .filter((alert) => alert.time !== null)
      .sort((left, right) => compareAlertsNewestFirst(left, right))
  }, [analysis])

  const normalizedTreatments = useMemo(() => {
    const medicationsAscending = [...(analysis?.medications || [])].sort(compareTreatmentsAscending)
    return medicationsAscending.map((medication, index) => {
      const relatedAlerts = medication.reasoning?.alerts || []
      const relatedDiagnoses = medication.reasoning?.diagnoses || []
      const relatedConditions = medication.reasoning?.conditions || []
      const outcome = normalizeOutcomeLabel(medication.outcome)
      const outcomeConfig = OUTCOME_CONFIG[outcome] || OUTCOME_CONFIG.Ineffective
      const actionTime = getTreatmentEventTimestamp(medication)

      let reasonText = "Prescribed based on current clinical assessment."
      if (relatedAlerts.length && relatedDiagnoses.length) {
        reasonText = "Prescribed due to abnormal vital signs (alerts) and to treat diagnosed condition."
      } else if (relatedAlerts.length) {
        reasonText = "Prescribed due to abnormal vital signs (alerts)."
      } else if (relatedDiagnoses.length) {
        reasonText = "Prescribed to treat diagnosed condition."
      }

      return {
        id: medication.id,
        action: medication.action || "add",
        treatment_index: index + 1,
        medication_name: medication.name || "--",
        dosage: medication.dosage,
        frequency: medication.frequency,
        created_at: medication.created_at || medication.prescribed_at,
        updated_at: medication.updated_at,
        timestamp: actionTime,
        displayed_date: formatDate(actionTime || medication.updated_at || medication.created_at),
        outcome,
        outcomeValue: outcomeConfig.value,
        notes: medication.notes || "",
        modified_by: medication.modified_by || "",
        related_alerts: relatedAlerts,
        related_diagnoses: relatedDiagnoses,
        related_conditions: relatedConditions,
        reasonText,
        previous_alert: medication.previous_alert || null,
        selected_vital_source: medication.selected_vital_source || null,
        selected_vital_timestamp: medication.selected_vital_timestamp || null,
        selected_vital: medication.selected_vital || null,
        evaluation_start: medication.evaluation_start || null,
        evaluation_end: medication.evaluation_end || null,
        evaluated_vital_timestamp: medication.evaluated_vital_timestamp || null,
        evaluated_vital: medication.evaluated_vital || null,
        outcome_reason: medication.outcome_reason || null,
        outcome_evidence: medication.outcome_evidence || null,
      }
    })
  }, [analysis])

  const chartData = useMemo(() => {
    return normalizedTreatments.map((treatment) => ({
      treatmentIndex: treatment.treatment_index,
      medicationId: treatment.id,
      medicationName: treatment.medication_name,
      medication: treatment.medication_name,
      time: treatment.displayed_date,
      decisionTimeLabel: treatment.timestamp ? formatTime(treatment.timestamp) : "",
      previousAlertType: treatment.previous_alert?.alert_type || "--",
      previousAlertSeverity: treatment.previous_alert?.severity || "--",
      previousAlertTimeLabel: treatment.previous_alert?.created_at ? formatDate(treatment.previous_alert.created_at) : "--",
      outcome: treatment.outcome,
      outcomeValue: treatment.outcomeValue,
      outcomeColor: (OUTCOME_CONFIG[treatment.outcome] || OUTCOME_CONFIG.Ineffective).color,
    }))
  }, [normalizedTreatments])

  const treatmentTimelineEvaluation = useMemo(() => {
    const latestAlert = parsedAlerts[0] || null
    const latestByVital = (vitalKey, options = {}) => {
      const minTime = options.minTime ?? null
      return parsedAlerts.find((alert) => (
        alertTypeToVital(alert.type) === vitalKey
        && alert.value != null
        && (minTime == null || alert.time > minTime)
      )) || null
    }

    const latestHeartRate = latestByVital("heartRate")
    const latestOxygen = latestByVital("oxygen")
    const latestTemperature = latestByVital("temperature")

    const latestNormalizedByVital = (vitalKey) => parsedAlerts.find((alert) => (
      alertTypeToVital(alert.type) === vitalKey
      && isNormalizedAlertType(alert.type)
    )) || null

    const latestHeartRateNormalized = latestNormalizedByVital("heartRate")
    const latestOxygenNormalized = latestNormalizedByVital("oxygen")
    const latestTemperatureNormalized = latestNormalizedByVital("temperature")

    const heartRateNormalizedVitals = getStatusVitals(latestHeartRateNormalized)
    const oxygenNormalizedVitals = getStatusVitals(latestOxygenNormalized)
    const temperatureNormalizedVitals = getStatusVitals(latestTemperatureNormalized)

    const finalValues = {
      heartRate: latestHeartRate?.value ?? heartRateNormalizedVitals.heartRate ?? null,
      oxygen: latestOxygen?.value ?? oxygenNormalizedVitals.oxygen ?? null,
      temperature: latestTemperature?.value ?? temperatureNormalizedVitals.temperature ?? null,
    }

    const latestVitalAlerts = {
      heartRate: latestHeartRate || latestHeartRateNormalized || null,
      oxygen: latestOxygen || latestOxygenNormalized || null,
      temperature: latestTemperature || latestTemperatureNormalized || null,
    }

    const finalTreatmentOutcome = chartData.length
      ? chartData[chartData.length - 1].outcome
      : "Ineffective"
    const outcome = finalTreatmentOutcome

    const lastUpdated = latestAlert?.created_at ? formatAlertLastUpdated(latestAlert.created_at) : "--"

    return {
      outcome,
      latestAlertSummary: {
        ...finalValues,
        lastUpdated,
        latestVitalAlerts,
        summary: "Values use vital-specific normalized events and are overridden by newer alerts for that same vital.",
      },
    }
  }, [chartData, parsedAlerts])

  const medicationHistory = useMemo(
    () => [...normalizedTreatments].reverse(),
    [normalizedTreatments],
  )

  const diagnosisStatusDetails = useMemo(() => {
    return [...(analysis?.diagnoses || [])]
      .sort((left, right) => {
        const leftTime = toTimestamp(left?.created_at) ?? 0
        const rightTime = toTimestamp(right?.created_at) ?? 0
        if (rightTime !== leftTime) {
          return rightTime - leftTime
        }
        return Number(right?.id || 0) - Number(left?.id || 0)
      })
  }, [analysis])

  const conditionStatusDetails = useMemo(() => {
    return [...(analysis?.conditions || [])]
      .sort((left, right) => {
        const leftTime = toTimestamp(left?.updated_at || left?.diagnosed_at) ?? 0
        const rightTime = toTimestamp(right?.updated_at || right?.diagnosed_at) ?? 0
        if (rightTime !== leftTime) {
          return rightTime - leftTime
        }
        return Number(right?.id || 0) - Number(left?.id || 0)
      })
  }, [analysis])
  const diagnosisPageSize = showFullAlertHistory ? DIAGNOSIS_PAGE_SIZE_EXPANDED : DIAGNOSIS_PAGE_SIZE_COLLAPSED
  const totalDiagnosisPages = Math.max(1, Math.ceil(diagnosisStatusDetails.length / diagnosisPageSize))
  const totalConditionPages = Math.max(1, Math.ceil(conditionStatusDetails.length / CONDITION_PAGE_SIZE))
  const paginatedDiagnosisStatusDetails = useMemo(() => {
    const start = (diagnosisPage - 1) * diagnosisPageSize
    const end = diagnosisPage * diagnosisPageSize
    return diagnosisStatusDetails.slice(start, end)
  }, [diagnosisPage, diagnosisPageSize, diagnosisStatusDetails])
  const paginatedConditionStatusDetails = useMemo(() => {
    const start = (conditionPage - 1) * CONDITION_PAGE_SIZE
    const end = conditionPage * CONDITION_PAGE_SIZE
    return conditionStatusDetails.slice(start, end)
  }, [conditionPage, conditionStatusDetails])

  const totalMedicationPages = Math.max(1, medicationHistory.length)
  const displayedMedication = medicationHistory.length ? medicationHistory[Math.max(0, medicationPage - 1)] : null

  const latestAlertSummary = treatmentTimelineEvaluation.latestAlertSummary
  const finalOutcome = treatmentTimelineEvaluation.outcome
  const selectedTreatmentOutcome = displayedMedication?.outcome || "--"
  const hasInconsistentDischarge = Boolean(selectedPatient?.is_discharged) && finalOutcome !== "Effective"
  const outcomeTextClass = (outcome) => (
    outcome === "Effective"
      ? "text-[#22c55e]"
      : outcome === "Improving"
        ? "text-[#f59e0b]"
        : "text-[#ef4444]"
  )

  const fullAlertHistory = useMemo(() => {
    return dedupeAlertsNewestFirst(analysis?.alerts || [])
      .map((alert) => normalizeTreatmentAlert(alert))
      .map((alert) => ({...alert, time: toTimestamp(alert.created_at)}))
      .filter((alert) => alert.time !== null)
      .sort((left, right) => compareAlertsNewestFirst(left, right))
      .map((alert) => ({
        id: alert.id,
        type: alert.type,
        value: alert.value,
        message: buildCleanAlertHistoryLabel(alert),
        severity: String(alert.severity || "").trim().toLowerCase(),
        createdAt: alert.created_at,
        date: formatDate(alert.created_at),
      }))
  }, [analysis])

  const totalAlertHistoryPages = Math.max(1, Math.ceil(fullAlertHistory.length / ALERT_HISTORY_EXPANDED_PAGE_SIZE))
  const paginatedAlertHistory = useMemo(() => {
    const start = (alertHistoryPage - 1) * ALERT_HISTORY_EXPANDED_PAGE_SIZE
    const end = alertHistoryPage * ALERT_HISTORY_EXPANDED_PAGE_SIZE
    return fullAlertHistory.slice(start, end)
  }, [alertHistoryPage, fullAlertHistory])

  useEffect(() => {
    if (alertHistoryPage > totalAlertHistoryPages) {
      setAlertHistoryPage(totalAlertHistoryPages)
    }
  }, [alertHistoryPage, totalAlertHistoryPages])

  useEffect(() => {
    if (medicationPage > totalMedicationPages) {
      setMedicationPage(totalMedicationPages)
    }
  }, [medicationPage, totalMedicationPages])
  useEffect(() => {
    if (diagnosisPage > totalDiagnosisPages) {
      setDiagnosisPage(1)
    }
  }, [diagnosisPage, totalDiagnosisPages])
  useEffect(() => {
    if (conditionPage > totalConditionPages) {
      setConditionPage(totalConditionPages)
    }
  }, [conditionPage, totalConditionPages])

  return (
    <section className="monitor-card rounded-[24px] p-6">
      <p className="text-xs font-semibold uppercase tracking-[0.3em] text-[#879196]">Treatment Insights</p>
      <h2 className="mt-2 text-2xl font-semibold text-white">Patient Treatment Analysis</h2>
      {showSelectedPatientSummary && selectedPatient ? (
        <p className="mt-2 text-sm text-[#b6bec9]">{selectedPatient.cnp} - {selectedPatient.full_name}</p>
      ) : null}

      {isLoadingAnalysis ? (
        <LoadingSpinner/>
      ) : null}

      {!isLoadingAnalysis && !analysis ? (
        <div className="mt-6 rounded-2xl border border-[#2a3441] bg-[#11161c] px-4 py-6 text-sm text-[#b6bec9]">
          Patient treatment analysis is not available.
        </div>
      ) : null}

      {!isLoadingAnalysis && analysis ? (
        <div className="mt-6 space-y-6">
          <div>
            <h3 className="text-xl font-semibold text-white">Treatment Timeline</h3>
          </div>
          <div className="h-[320px] rounded-2xl border border-[#2a3441] bg-[#0f141a] p-3">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData} margin={{top: 10, right: 12, left: 8, bottom: 4}}>
                <defs>
                  <linearGradient id="treatmentOutcomeFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#22c55e" stopOpacity={0.26}/>
                    <stop offset="50%" stopColor="#f59e0b" stopOpacity={0.2}/>
                    <stop offset="100%" stopColor="#ef4444" stopOpacity={0.2}/>
                  </linearGradient>
                </defs>
                <ReferenceArea y1={0} y2={0.66} fill="#ef4444" fillOpacity={0.14} strokeOpacity={0}/>
                <ReferenceArea y1={0.66} y2={1.33} fill="#f59e0b" fillOpacity={0.11} strokeOpacity={0}/>
                <ReferenceArea y1={1.33} y2={2} fill="#22c55e" fillOpacity={0.11} strokeOpacity={0}/>
                <CartesianGrid stroke="#1f2937" strokeDasharray="3 3"/>
                <XAxis dataKey="treatmentIndex" stroke="#879196" tick={{fontSize: 11}}/>
                <YAxis
                  stroke="#879196"
                  tick={{fontSize: 11}}
                  allowDecimals={false}
                  domain={[0, 2]}
                  ticks={[0, 1, 2]}
                  tickFormatter={(value) => {
                    if (value === 2) {
                      return "Effective"
                    }
                    if (value === 1) {
                      return "Improving"
                    }
                    return "Ineffective"
                  }}
                />
                <ReferenceLine y={1} stroke="#385269" strokeDasharray="4 4"/>
                <Tooltip content={<TreatmentOutcomeTooltip/>}/>
                <Area
                  type="monotone"
                  dataKey="outcomeValue"
                  name="Outcome"
                  stroke="#e5e7eb"
                  fill="url(#treatmentOutcomeFill)"
                  strokeWidth={3}
                  isAnimationActive={true}
                  animationDuration={460}
                  activeDot={{r: 6, stroke: "#0f141a", strokeWidth: 2}}
                  dot={({cx, cy, payload}) => (
                    <circle
                      cx={cx}
                      cy={cy}
                      r={4}
                      fill={payload?.outcomeColor || "#ef4444"}
                      stroke="#0f141a"
                      strokeWidth={1}
                    />
                  )}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          <div>
            <h3 className="text-xl font-semibold text-white">Treatment Summary & Clinical Reasoning</h3>
            {hasInconsistentDischarge ? (
              <div className="mt-3 rounded-xl border border-[#7f1d1d] bg-[#2b1212] px-3 py-2 text-sm text-[#fecaca]">
                Inconsistency detected: patient is discharged but the final treatment outcome is not Effective.
              </div>
            ) : null}
            <div className="mt-4 space-y-4">
              {displayedMedication ? (
                <div className="monitor-panel rounded-2xl px-4 py-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <p className="text-sm font-semibold text-white">Medication: {displayedMedication.medication_name || "--"}</p>
                    <p
                      className="text-xs text-[#b6bec9]">Date: {displayedMedication.displayed_date}</p>
                  </div>
                  <p className="mt-2 text-sm text-[#d5dbdb]">Dosage: {displayedMedication.dosage || "--"}</p>
                  <p className="mt-1 text-sm text-[#d5dbdb]">Frequency: {displayedMedication.frequency || "--"}</p>
                  {displayedMedication.notes ? (
                    <p className="mt-1 text-sm text-[#d5dbdb]">Notes: {displayedMedication.notes}</p>
                  ) : null}
                  {displayedMedication.modified_by ? (
                    <p className="mt-1 text-sm text-[#d5dbdb]">Modified by doctor: {displayedMedication.modified_by}</p>
                  ) : null}
                  <div className="mt-3 flex items-center justify-between">
                    <button
                      type="button"
                      onClick={() => setMedicationPage((page) => Math.max(1, page - 1))}
                      disabled={medicationPage === 1}
                      className="rounded-lg border border-[#2a3441] px-3 py-1 text-xs font-semibold text-[#d5dbdb] disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      Previous
                    </button>
                    <span className="text-xs text-[#b6bec9]">
                      {medicationPage} / {totalMedicationPages}
                    </span>
                    <button
                      type="button"
                      onClick={() => setMedicationPage((page) => Math.min(totalMedicationPages, page + 1))}
                      disabled={medicationPage >= totalMedicationPages}
                      className="rounded-lg border border-[#2a3441] px-3 py-1 text-xs font-semibold text-[#d5dbdb] disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      Next
                    </button>
                  </div>

                  <div className="mt-4 grid gap-3 md:grid-cols-3">
                    <div className="rounded-xl border border-[#2a3441] bg-[#151b22] p-3">
                      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#b6bec9]">Reason</p>
                      <p className="mt-2 text-sm text-white">{displayedMedication.reasonText}</p>
                    </div>
                    <div className="rounded-xl border border-[#2a3441] bg-[#151b22] p-3">
                      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#b6bec9]">Selected Treatment Outcome</p>
                      <p className={`mt-2 text-sm font-semibold ${outcomeTextClass(selectedTreatmentOutcome)}`}>
                        {selectedTreatmentOutcome}
                      </p>
                    </div>
                    <div className="rounded-xl border border-[#2a3441] bg-[#151b22] p-3">
                      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#b6bec9]">Final Treatment Outcome</p>
                      <p className={`mt-2 text-sm font-semibold ${outcomeTextClass(finalOutcome)}`}>
                        {finalOutcome}
                      </p>
                    </div>
                  </div>

                  <div className="mt-3 grid gap-3 md:grid-cols-2">
                    <div className="rounded-xl border border-[#2a3441] bg-[#151b22] p-3">
                      <div className="flex items-start justify-between gap-3">
                        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#b6bec9]">Latest Alert Summary</p>
                        <p className="text-[11px] text-[#879196]">Last update: {latestAlertSummary.lastUpdated}</p>
                      </div>
                      <div className="mt-2 grid gap-2 sm:grid-cols-3">
                        {(() => {
                          const heartRateHasData = hasRealVitalData(latestAlertSummary.heartRate)
                          const heartRateSeverity = getAlertSeverityLevel(latestAlertSummary.latestVitalAlerts.heartRate)
                          const heartRateStyles = heartRateHasData
                            ? getLatestSummaryStylesBySeverity(heartRateSeverity)
                            : getLatestSummaryNeutralStyles()
                          return (
                        <div
                          className={`rounded-lg border px-3 py-2 ${heartRateStyles.card}`}>
                          <p className="text-[11px] uppercase tracking-[0.14em] text-[#9aa5b1]">Heart Rate</p>
                          <p className={`mt-1 text-sm font-semibold ${heartRateStyles.value}`}>
                            {latestAlertSummary.heartRate != null ? `${latestAlertSummary.heartRate} bpm` : "--"}
                          </p>
                          <p className={`mt-1 text-[10px] font-semibold tracking-[0.08em] ${heartRateStyles.time}`}>
                            {formatAlertFriendlyTime(latestAlertSummary.latestVitalAlerts.heartRate?.created_at)}
                          </p>
                        </div>
                          )
                        })()}
                        {(() => {
                          const oxygenHasData = hasRealVitalData(latestAlertSummary.oxygen)
                          const oxygenSeverity = getAlertSeverityLevel(latestAlertSummary.latestVitalAlerts.oxygen)
                          const oxygenStyles = oxygenHasData
                            ? getLatestSummaryStylesBySeverity(oxygenSeverity)
                            : getLatestSummaryNeutralStyles()
                          return (
                        <div
                          className={`rounded-lg border px-3 py-2 ${oxygenStyles.card}`}>
                          <p className="text-[11px] uppercase tracking-[0.14em] text-[#9aa5b1]">Oxygen</p>
                          <p className={`mt-1 text-sm font-semibold ${oxygenStyles.value}`}>
                            {latestAlertSummary.oxygen != null ? `${latestAlertSummary.oxygen}%` : "--"}
                          </p>
                          <p className={`mt-1 text-[10px] font-semibold tracking-[0.08em] ${oxygenStyles.time}`}>
                            {formatAlertFriendlyTime(latestAlertSummary.latestVitalAlerts.oxygen?.created_at)}
                          </p>
                        </div>
                          )
                        })()}
                        {(() => {
                          const temperatureHasData = hasRealVitalData(latestAlertSummary.temperature)
                          const temperatureSeverity = getAlertSeverityLevel(latestAlertSummary.latestVitalAlerts.temperature)
                          const temperatureStyles = temperatureHasData
                            ? getLatestSummaryStylesBySeverity(temperatureSeverity)
                            : getLatestSummaryNeutralStyles()
                          return (
                        <div
                          className={`rounded-lg border px-3 py-2 ${temperatureStyles.card}`}>
                          <p className="text-[11px] uppercase tracking-[0.14em] text-[#9aa5b1]">Temperature</p>
                          <p className={`mt-1 text-sm font-semibold ${temperatureStyles.value}`}>
                            {latestAlertSummary.temperature != null ? `${latestAlertSummary.temperature}°C` : "--"}
                          </p>
                          <p className={`mt-1 text-[10px] font-semibold tracking-[0.08em] ${temperatureStyles.time}`}>
                            {formatAlertFriendlyTime(latestAlertSummary.latestVitalAlerts.temperature?.created_at)}
                          </p>
                        </div>
                          )
                        })()}
                      </div>
                      <p className="mt-3 text-sm text-[#d5dbdb]">{latestAlertSummary.summary}</p>
                      {fullAlertHistory.length ? (
                        <div className="mt-3">
                          <button
                            type="button"
                            onClick={() => {
                              setShowFullAlertHistory((current) => {
                                const next = !current
                                setAlertHistoryPage(1)
                                return next
                              })
                            }}
                            className="text-xs font-semibold uppercase tracking-[0.14em] text-[#9dccff] transition hover:text-[#c5e4ff]"
                          >
                            {showFullAlertHistory ? "Hide Full History" : "View Full History"}
                          </button>
                          {showFullAlertHistory ? (
                            <div className="mt-2 divide-y divide-[#26303d]">
                              {paginatedAlertHistory.map((alert, index) => (
                                (() => {
                                  const historySeverity = getAlertSeverityLevel(alert)
                                  const historyStyles = getHistoryStylesBySeverity(historySeverity)
                                  return (
                                    <div
                                      key={`${alert.id || index}-${alert.type}-${alert.date}`}
                                      className="py-2"
                                    >
                                      <div className="flex items-start justify-between gap-3 text-sm">
                                        <div className="flex items-start gap-2">
                                          {renderHistoryMessageWithColoredLabel(alert.message, historyStyles.label)}
                                        </div>
                                        <span className="whitespace-nowrap text-xs font-semibold text-[#d5dbdb]">
                                          {formatAlertFriendlyTime(alert.createdAt)}
                                        </span>
                                      </div>
                                    </div>
                                  )
                                })()
                              ))}
                              {fullAlertHistory.length > ALERT_HISTORY_EXPANDED_PAGE_SIZE ? (
                                <div className="mt-3 flex items-center justify-between">
                                  <button
                                    type="button"
                                    onClick={() => setAlertHistoryPage((page) => Math.max(1, page - 1))}
                                    disabled={alertHistoryPage === 1}
                                    className="rounded-lg border border-[#2a3441] px-3 py-1 text-xs font-semibold text-[#d5dbdb] disabled:cursor-not-allowed disabled:opacity-40"
                                  >
                                    Prev
                                  </button>
                                  <span className="text-xs text-[#b6bec9]">Page {alertHistoryPage}</span>
                                  <button
                                    type="button"
                                    onClick={() => setAlertHistoryPage((page) => Math.min(totalAlertHistoryPages, page + 1))}
                                    disabled={alertHistoryPage >= totalAlertHistoryPages}
                                    className="rounded-lg border border-[#2a3441] px-3 py-1 text-xs font-semibold text-[#d5dbdb] disabled:cursor-not-allowed disabled:opacity-40"
                                  >
                                    Next
                                  </button>
                                </div>
                              ) : null}
                            </div>
                          ) : null}
                        </div>
                      ) : (
                        <p className="mt-3 text-sm text-white">No linked alerts</p>
                      )}
                    </div>
                    <div className="rounded-xl border border-[#2a3441] bg-[#151b22] p-3">
                      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#b6bec9]">Diagnosis</p>
                      {diagnosisStatusDetails.length ? (
                        <div className="mt-2 divide-y divide-[#26303d]">
                          {paginatedDiagnosisStatusDetails.map((diagnosis) => (
                            <div key={diagnosis.id} className="py-2">
                              <p className="text-sm font-semibold text-white">{diagnosis.diagnosis}</p>
                              <p className="mt-1 text-xs text-[#b6bec9]">Status: {diagnosis.status || "--"}</p>
                              {diagnosis.status_note ? <p className="mt-1 text-xs text-[#d5dbdb]">{diagnosis.status_note}</p> : null}
                              {diagnosis.notes ? <p className="mt-1 text-xs text-[#9aa5b1]">{diagnosis.notes}</p> : null}
                              {diagnosis.modified_by ? <p className="mt-1 text-xs text-[#d5dbdb]">Modified by doctor: {diagnosis.modified_by}</p> : null}
                            </div>
                          ))}
                          {diagnosisStatusDetails.length > diagnosisPageSize ? (
                            <div className="mt-3 flex items-center justify-between">
                              <button
                                type="button"
                                onClick={() => setDiagnosisPage((page) => Math.max(1, page - 1))}
                                disabled={diagnosisPage === 1}
                                className="rounded-lg border border-[#2a3441] px-3 py-1 text-xs font-semibold text-[#d5dbdb] disabled:cursor-not-allowed disabled:opacity-40"
                              >
                                Prev
                              </button>
                              <span className="text-xs text-[#b6bec9]">Page {diagnosisPage}</span>
                              <button
                                type="button"
                                onClick={() => setDiagnosisPage((page) => Math.min(totalDiagnosisPages, page + 1))}
                                disabled={diagnosisPage >= totalDiagnosisPages}
                                className="rounded-lg border border-[#2a3441] px-3 py-1 text-xs font-semibold text-[#d5dbdb] disabled:cursor-not-allowed disabled:opacity-40"
                              >
                                Next
                              </button>
                            </div>
                          ) : null}
                        </div>
                      ) : (
                        <p className="mt-2 text-sm text-white">
                          {displayedMedication.related_diagnoses.length ? displayedMedication.related_diagnoses.join(", ") : "No linked diagnosis"}
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="mt-3 p-1">
                    <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#b6bec9]">Conditions</p>
                    {conditionStatusDetails.length ? (
                      <div className="mt-2 divide-y divide-[#26303d]">
                        {paginatedConditionStatusDetails.map((condition) => (
                          <div key={condition.id} className="py-2">
                            <p className="text-sm font-semibold text-white">{condition.name}</p>
                            <p className="mt-1 text-xs text-[#b6bec9]">Status: {condition.status || "--"}</p>
                            {condition.notes ? <p className="mt-1 text-xs text-[#d5dbdb]">{condition.notes}</p> : null}
                            {condition.modified_by ? <p className="mt-1 text-xs text-[#d5dbdb]">Modified by doctor: {condition.modified_by}</p> : null}
                          </div>
                        ))}
                        {conditionStatusDetails.length > CONDITION_PAGE_SIZE ? (
                          <div className="mt-3 flex items-center justify-between">
                            <button
                              type="button"
                              onClick={() => setConditionPage((page) => Math.max(1, page - 1))}
                              disabled={conditionPage === 1}
                              className="rounded-lg border border-[#2a3441] px-3 py-1 text-xs font-semibold text-[#d5dbdb] disabled:cursor-not-allowed disabled:opacity-40"
                            >
                              Prev
                            </button>
                            <span className="text-xs text-[#b6bec9]">Page {conditionPage}</span>
                            <button
                              type="button"
                              onClick={() => setConditionPage((page) => Math.min(totalConditionPages, page + 1))}
                              disabled={conditionPage >= totalConditionPages}
                              className="rounded-lg border border-[#2a3441] px-3 py-1 text-xs font-semibold text-[#d5dbdb] disabled:cursor-not-allowed disabled:opacity-40"
                            >
                              Next
                            </button>
                          </div>
                        ) : null}
                      </div>
                    ) : (
                      <p className="mt-2 text-sm text-white">
                        {displayedMedication.related_conditions.length ? displayedMedication.related_conditions.join(", ") : "No linked conditions"}
                      </p>
                    )}
                  </div>
                </div>
              ) : (
                <div className="monitor-panel rounded-2xl px-4 py-4 text-sm text-[#b6bec9]">
                  No treatment history available.
                </div>
              )}
            </div>
          </div>

        </div>
      ) : null}
    </section>
  )
}
