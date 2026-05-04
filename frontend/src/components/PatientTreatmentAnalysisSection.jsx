import {useCallback, useEffect, useMemo, useState} from "react"
import {Area, AreaChart, CartesianGrid, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis} from "recharts"
import {useNotifications} from "../hooks/useNotifications.js"
import {getErrorMessage, getResponseData} from "../services/apiMessages.js"
import {getPatient, getPatientTreatmentAnalysis} from "../services/patientApi.js"
import {createWebSocket} from "../services/ws.js"
import LoadingSpinner from "./LoadingSpinner.jsx"

const ALERT_HISTORY_PAGE_SIZE = 5
const ALERT_TYPE_COLOR_MAP = {
  heart_rate: "#F43F5E",
  oxygen_saturation: "#3B82F6",
  oxygen: "#06B6D4",
  temperature: "#F97316",
  status: "#22C55E",
}
const VITAL_TYPE_ALIASES = {
  heartRate: ["heart_rate"],
  oxygen: ["oxygen_saturation", "oxygen"],
  temperature: ["temperature"],
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
  return new Intl.DateTimeFormat("en-GB", {day: "2-digit", month: "short", year: "numeric"}).format(date)
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
    day: "numeric",
    month: "short",
  }).format(date)
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
          point.outcome === "effective"
            ? "text-[#22c55e]"
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

const normalizeTreatmentAlert = (alert) => {
  const normalizedType = String(alert?.type || alert?.alert_type || "").trim().toLowerCase()
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

  const loadAnalysis = useCallback(async (patientId) => {
    setIsLoadingAnalysis(true)
    try {
      const response = await getPatientTreatmentAnalysis(patientId)
      setAnalysis(getResponseData(response) || null)
    } catch (error) {
      setAnalysis(null)
      notifyError(getErrorMessage(error))
    } finally {
      setIsLoadingAnalysis(false)
    }
  }, [notifyError])

  useEffect(() => {
    if (!selectedPatientId) {
      return
    }
    setShowFullAlertHistory(false)
    setAlertHistoryPage(1)
    setMedicationPage(1)

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
    if (!selectedPatientId) {
      return
    }

    const socket = createWebSocket((msg) => {
      if (msg.type !== "alert") {
        return
      }

      if (String(msg.data?.patient_id) !== String(selectedPatientId)) {
        return
      }

      loadAnalysis(selectedPatientId).then(() => {
      })
    })

    return () => {
      socket.close()
    }
  }, [loadAnalysis, selectedPatientId])

  const parsedAlerts = useMemo(() => {
    return (analysis?.alerts || [])
      .map((alert) => normalizeTreatmentAlert(alert))
      .filter((alert) => alert.time !== null)
      .sort((left, right) => right.time - left.time)
  }, [analysis])

  const treatmentOutcomeTimeline = useMemo(() => {
    const medicationsAscending = [...(analysis?.medications || [])]
      .sort((left, right) => {
        const leftTime = toTimestamp(left.prescribed_at) ?? 0
        const rightTime = toTimestamp(right.prescribed_at) ?? 0
        if (leftTime !== rightTime) {
          return leftTime - rightTime
        }
        return Number(left.id || 0) - Number(right.id || 0)
      })
    return medicationsAscending.map((medication, index) => {
      const normalizedOutcome = String(medication.outcome || "").trim().toLowerCase()
      const outcome = normalizedOutcome === "effective" ? "effective" : "ineffective"
      const color = outcome === "effective" ? "#22c55e" : "#ef4444"
      return {
        treatmentIndex: index + 1,
        medicationId: medication.id,
        medicationName: medication.name,
        medicationTimeLabel: formatDate(medication.prescribed_at),
        decisionTimeLabel: medication.prescribed_at ? formatTime(medication.prescribed_at) : "",
        previousAlertType: medication.previous_alert?.alert_type || "--",
        previousAlertSeverity: medication.previous_alert?.severity || "--",
        previousAlertTimeLabel: medication.previous_alert?.created_at ? formatDate(medication.previous_alert.created_at) : "--",
        outcome,
        outcomeValue: outcome === "effective" ? 1 : -1,
        outcomeColor: color,
      }
    })
  }, [analysis])

  const treatmentTimelineEvaluation = useMemo(() => {
    const latestAlert = parsedAlerts[0] || null
    const latestByVital = (vitalKey, options = {}) => {
      const vitalTypes = VITAL_TYPE_ALIASES[vitalKey] || []
      const minTime = options.minTime ?? null
      return parsedAlerts.find((alert) => (
        vitalTypes.includes(alert.type)
        && alert.value != null
        && (minTime == null || alert.time > minTime)
      )) || null
    }

    const latestHeartRate = latestByVital("heartRate")
    const latestOxygen = latestByVital("oxygen")
    const latestTemperature = latestByVital("temperature")

    const lastStable = parsedAlerts.find(
      (alert) => alert.type === "status" || alert.severity === "normal",
    ) || null

    const lastStableVitals = getStatusVitals(lastStable)
    const latestHeartRateAfterStable = latestByVital("heartRate", {minTime: lastStable?.time ?? null})
    const latestOxygenAfterStable = latestByVital("oxygen", {minTime: lastStable?.time ?? null})
    const latestTemperatureAfterStable = latestByVital("temperature", {minTime: lastStable?.time ?? null})

    const finalValues = {
      heartRate: latestHeartRateAfterStable?.value ?? lastStableVitals.heartRate ?? latestHeartRate?.value ?? null,
      oxygen: latestOxygenAfterStable?.value ?? lastStableVitals.oxygen ?? latestOxygen?.value ?? null,
      temperature: latestTemperatureAfterStable?.value ?? lastStableVitals.temperature ?? latestTemperature?.value ?? null,
    }

    const finalTreatmentOutcome = treatmentOutcomeTimeline.length
      ? treatmentOutcomeTimeline[treatmentOutcomeTimeline.length - 1].outcome
      : "ineffective"
    const outcome = finalTreatmentOutcome

    const lastUpdated = latestAlert?.created_at ? formatAlertLastUpdated(latestAlert.created_at) : "--"

    return {
      outcome,
      latestAlertSummary: {
        ...finalValues,
        lastUpdated,
        usingStableHeartRateFallback: lastStableVitals.heartRate != null && latestHeartRateAfterStable == null,
        usingStableOxygenFallback: lastStableVitals.oxygen != null && latestOxygenAfterStable == null,
        usingStableTemperatureFallback: lastStableVitals.temperature != null && latestTemperatureAfterStable == null,
        summary: "Values start from the latest stable snapshot and are overridden by newer alerts per vital.",
      },
    }
  }, [parsedAlerts, treatmentOutcomeTimeline])

  const medicationHistory = useMemo(() => {
    const medications = analysis?.medications || []

    return medications.map((medication) => {
      const relatedAlerts = medication.reasoning?.alerts || []
      const relatedDiagnoses = medication.reasoning?.diagnoses || []
      const relatedConditions = medication.reasoning?.conditions || []
      const timelineEntry = treatmentOutcomeTimeline.find((item) => item.medicationId === medication.id)
      const outcome = timelineEntry?.outcome || "ineffective"

      let reasonText = "Prescribed based on current clinical assessment."
      if (relatedAlerts.length && relatedDiagnoses.length) {
        reasonText = "Prescribed due to abnormal vital signs (alerts) and to treat diagnosed condition."
      } else if (relatedAlerts.length) {
        reasonText = "Prescribed due to abnormal vital signs (alerts)."
      } else if (relatedDiagnoses.length) {
        reasonText = "Prescribed to treat diagnosed condition."
      }

      return {
        medication_name: medication.name,
        dosage: medication.dosage,
        frequency: medication.frequency,
        created_at: medication.prescribed_at,
        updated_at: medication.updated_at,
        notes: medication.notes || "",
        modified_by: medication.modified_by || "",
        related_alerts: relatedAlerts,
        related_diagnoses: relatedDiagnoses,
        related_conditions: relatedConditions,
        outcome,
        reasonText,
        treatment_index: timelineEntry?.treatmentIndex || null,
        alert_after_treatment: timelineEntry
          ? `${timelineEntry.nextAlertType} (${timelineEntry.nextAlertSeverity}) on ${timelineEntry.nextAlertTimeLabel}`
          : "--",
        alert_before_treatment: timelineEntry
          ? `${timelineEntry.previousAlertType} (${timelineEntry.previousAlertSeverity}) on ${timelineEntry.previousAlertTimeLabel}`
          : "--",
      }
    }).sort((left, right) => {
      const leftTime = toTimestamp(left.updated_at || left.created_at) ?? 0
      const rightTime = toTimestamp(right.updated_at || right.created_at) ?? 0
      if (leftTime !== rightTime) {
        return rightTime - leftTime
      }
      return String(right.medication_name || "").localeCompare(String(left.medication_name || ""))
    })
  }, [analysis, treatmentOutcomeTimeline])

  const totalMedicationPages = Math.max(1, medicationHistory.length)
  const displayedMedication = medicationHistory.length ? medicationHistory[Math.max(0, medicationPage - 1)] : null

  const latestAlertSummary = treatmentTimelineEvaluation.latestAlertSummary
  const finalOutcome = treatmentTimelineEvaluation.outcome
  const hasInconsistentDischarge = Boolean(selectedPatient?.is_discharged) && finalOutcome !== "effective"
  const outcomeTextClass = (outcome) => (
    outcome === "effective"
      ? "text-[#22c55e]"
      : "text-[#ef4444]"
  )

  const fullAlertHistory = useMemo(() => {
    return (analysis?.alerts || [])
      .map((alert) => ({...alert, time: toTimestamp(alert.created_at)}))
      .filter((alert) => alert.time !== null)
      .sort((left, right) => right.time - left.time)
      .map((alert) => ({
        type: alert.alert_type,
        message: alert.message,
        date: formatDate(alert.created_at),
      }))
  }, [analysis])

  const totalAlertHistoryPages = Math.max(1, Math.ceil(fullAlertHistory.length / ALERT_HISTORY_PAGE_SIZE))
  const paginatedAlertHistory = useMemo(() => {
    const start = (alertHistoryPage - 1) * ALERT_HISTORY_PAGE_SIZE
    const end = alertHistoryPage * ALERT_HISTORY_PAGE_SIZE
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
              <AreaChart data={treatmentOutcomeTimeline}>
                <defs>
                  <linearGradient id="treatmentOutcomeFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#22c55e" stopOpacity={0.42}/>
                    <stop offset="50%" stopColor="#22c55e" stopOpacity={0.32}/>
                    <stop offset="50%" stopColor="#ef4444" stopOpacity={0.32}/>
                    <stop offset="100%" stopColor="#ef4444" stopOpacity={0.42}/>
                  </linearGradient>
                  <linearGradient id="treatmentOutcomeStroke" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#22c55e"/>
                    <stop offset="100%" stopColor="#ef4444"/>
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="#1f2937" strokeDasharray="3 3"/>
                <XAxis dataKey="treatmentIndex" stroke="#879196" tick={{fontSize: 11}}/>
                <YAxis
                  stroke="#879196"
                  tick={{fontSize: 11}}
                  allowDecimals={false}
                  domain={[-1, 1]}
                  ticks={[-1, 0, 1]}
                />
                <ReferenceLine y={0} stroke="#6b7280" strokeDasharray="4 4"/>
                <Tooltip content={<TreatmentOutcomeTooltip/>}/>
                <Area
                  type="monotone"
                  dataKey="outcomeValue"
                  name="Outcome"
                  stroke="url(#treatmentOutcomeStroke)"
                      fill="url(#treatmentOutcomeFill)"
                      strokeWidth={3}
                      isAnimationActive={true}
                      animationDuration={420}
                      dot={({cx, cy, payload}) => (
                    <circle
                      cx={cx}
                      cy={cy}
                      r={4}
                      fill={payload?.outcomeValue > 0 ? "#22c55e" : "#ef4444"}
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
                Inconsistency detected: patient is discharged but the final treatment outcome is ineffective.
              </div>
            ) : null}
            <div className="mt-4 space-y-4">
              {displayedMedication ? (
                <div className="monitor-panel rounded-2xl px-4 py-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <p className="text-sm font-semibold text-white">Medication: {displayedMedication.medication_name || "--"}</p>
                    <p
                      className="text-xs text-[#b6bec9]">Date: {formatDate(displayedMedication.updated_at || displayedMedication.created_at)}</p>
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
                    <span className="text-xs text-[#b6bec9]">{medicationPage} / {totalMedicationPages}</span>
                    <button
                      type="button"
                      onClick={() => setMedicationPage((page) => Math.min(totalMedicationPages, page + 1))}
                      disabled={medicationPage >= totalMedicationPages}
                      className="rounded-lg border border-[#2a3441] px-3 py-1 text-xs font-semibold text-[#d5dbdb] disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      Next
                    </button>
                  </div>

                  <div className="mt-4 grid gap-3 md:grid-cols-2">
                    <div className="rounded-xl border border-[#2a3441] bg-[#151b22] p-3">
                      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#b6bec9]">Reason</p>
                      <p className="mt-2 text-sm text-white">{displayedMedication.reasonText}</p>
                    </div>
                    <div className="rounded-xl border border-[#2a3441] bg-[#151b22] p-3">
                      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#b6bec9]">Outcome</p>
                      <p className={`mt-2 text-sm font-semibold ${outcomeTextClass(displayedMedication.outcome)}`}>
                        {displayedMedication.outcome}
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
                        <div
                          className={`rounded-lg border px-3 py-2 ${latestAlertSummary.usingStableHeartRateFallback ? "border-[#1d3f2d] bg-[#0e2519]" : "border-[#2a3441] bg-[#11161c]"}`}>
                          <p className="text-[11px] uppercase tracking-[0.14em] text-[#9aa5b1]">Heart Rate</p>
                          <p className={`mt-1 text-sm font-semibold ${
                            latestAlertSummary.usingStableHeartRateFallback
                              ? "text-[#22C55E]"
                              : latestAlertSummary.heartRate != null && latestAlertSummary.heartRate > 120
                                ? "text-[#ef4444]"
                                : "text-white"
                          }`}>
                            {latestAlertSummary.heartRate != null ? `${latestAlertSummary.heartRate} bpm` : "--"}
                          </p>
                          {latestAlertSummary.usingStableHeartRateFallback ? (
                            <p className="mt-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-[#22C55E]">Stable</p>
                          ) : null}
                        </div>
                        <div
                          className={`rounded-lg border px-3 py-2 ${latestAlertSummary.usingStableOxygenFallback ? "border-[#1d3f2d] bg-[#0e2519]" : "border-[#2a3441] bg-[#11161c]"}`}>
                          <p className="text-[11px] uppercase tracking-[0.14em] text-[#9aa5b1]">Oxygen</p>
                          <p className={`mt-1 text-sm font-semibold ${
                            latestAlertSummary.usingStableOxygenFallback
                              ? "text-[#22C55E]"
                              : latestAlertSummary.oxygen != null && latestAlertSummary.oxygen < 90
                                ? "text-[#f97316]"
                                : "text-white"
                          }`}>
                            {latestAlertSummary.oxygen != null ? `${latestAlertSummary.oxygen}%` : "--"}
                          </p>
                          {latestAlertSummary.usingStableOxygenFallback ? (
                            <p className="mt-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-[#22C55E]">Stable</p>
                          ) : null}
                        </div>
                        <div
                          className={`rounded-lg border px-3 py-2 ${latestAlertSummary.usingStableTemperatureFallback ? "border-[#1d3f2d] bg-[#0e2519]" : "border-[#2a3441] bg-[#11161c]"}`}>
                          <p className="text-[11px] uppercase tracking-[0.14em] text-[#9aa5b1]">Temperature</p>
                          <p className={`mt-1 text-sm font-semibold ${
                            latestAlertSummary.usingStableTemperatureFallback
                              ? "text-[#22C55E]"
                              : latestAlertSummary.temperature != null && latestAlertSummary.temperature > 39
                                ? "text-[#ef4444]"
                                : "text-white"
                          }`}>
                            {latestAlertSummary.temperature != null ? `${latestAlertSummary.temperature}°C` : "--"}
                          </p>
                          {latestAlertSummary.usingStableTemperatureFallback ? (
                            <p className="mt-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-[#22C55E]">Stable</p>
                          ) : null}
                        </div>
                      </div>
                      <p className="mt-3 text-sm text-[#d5dbdb]">{latestAlertSummary.summary}</p>
                      {fullAlertHistory.length ? (
                        <div className="mt-3">
                          <button
                            type="button"
                            onClick={() => {
                              setShowFullAlertHistory((current) => {
                                const next = !current
                                if (next) {
                                  setAlertHistoryPage(1)
                                }
                                return next
                              })
                            }}
                            className="text-xs font-semibold uppercase tracking-[0.14em] text-[#9dccff] transition hover:text-[#c5e4ff]"
                          >
                            {showFullAlertHistory ? "Hide full history" : "View full history"}
                          </button>
                          {showFullAlertHistory ? (
                            <div className="mt-2 space-y-2">
                              {paginatedAlertHistory.map((alert, index) => (
                                <div
                                  key={`${alert.type}-${alert.date}-${index}`}
                                  className="rounded-lg border border-[#2a3441] bg-[#11161c] px-3 py-2"
                                >
                                  <div className="flex items-start justify-between gap-3 text-sm">
                                    <div className="flex items-start gap-2">
                                      <span
                                        className="font-semibold capitalize"
                                        style={{color: ALERT_TYPE_COLOR_MAP[alert.type] || "#d5dbdb"}}
                                      >
                                        {String(alert.type || "").replace(/_/g, " ")}
                                      </span>
                                      <span className="text-[#d5dbdb]">{alert.message}</span>
                                    </div>
                                    <span className="whitespace-nowrap text-xs text-[#879196]">({alert.date})</span>
                                  </div>
                                </div>
                              ))}
                              {fullAlertHistory.length > ALERT_HISTORY_PAGE_SIZE ? (
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
                      <p
                        className="mt-2 text-sm text-white">{displayedMedication.related_diagnoses.length ? displayedMedication.related_diagnoses.join(", ") : "No linked diagnosis"}</p>
                    </div>
                  </div>

                  <div className="mt-3 rounded-xl border border-[#2a3441] bg-[#151b22] p-3">
                    <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#b6bec9]">Conditions</p>
                    <p
                      className="mt-2 text-sm text-white">{displayedMedication.related_conditions.length ? displayedMedication.related_conditions.join(", ") : "No linked conditions"}</p>
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
