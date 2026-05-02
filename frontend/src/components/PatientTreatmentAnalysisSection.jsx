import {useCallback, useEffect, useMemo, useState} from "react"
import {Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis} from "recharts"
import {useNotifications} from "./useNotifications.js"
import {getErrorMessage, getResponseData} from "../services/apiMessages.js"
import {getPatient, getPatientTreatmentAnalysis} from "../services/patientApi.js"
import LoadingSpinner from "./LoadingSpinner.jsx"

const DEFAULT_OUTCOME_WINDOW_MS = 24 * 60 * 60 * 1000
const TIMELINE_BUCKET_MS = 6 * 60 * 60 * 1000
const ALERT_SEVERITY_SCORE = {
  critical: 4,
  high: 3,
  medium: 2,
  low: 1,
}

const toTimestamp = (value) => {
  const time = new Date(value).getTime()
  return Number.isFinite(time) ? time : null
}

const getSeverityScore = (severity) => ALERT_SEVERITY_SCORE[String(severity || "").trim().toLowerCase()] || 1

const deriveOutcomeFromAlertEvolution = ({beforeCount, afterCount, beforeSeverityScore, afterSeverityScore}) => {
  const alertsDecreased = afterCount < beforeCount
  const alertsWorsened = afterCount > beforeCount
  const severityImproved = afterSeverityScore < beforeSeverityScore
  const severityWorsened = afterSeverityScore > beforeSeverityScore
  const alertsPersisted = afterCount > 0 && afterCount === beforeCount

  if (alertsDecreased || severityImproved) {
    return "Effective"
  }

  if (alertsWorsened || severityWorsened || alertsPersisted) {
    return "Ineffective"
  }

  return "Effective"
}

export default function PatientTreatmentAnalysisSection({
  selectedPatientId = null,
  showSelectedPatientSummary = false,
}) {
  const {notifyError} = useNotifications()
  const [selectedPatient, setSelectedPatient] = useState(null)
  const [analysis, setAnalysis] = useState(null)
  const [isLoadingAnalysis, setIsLoadingAnalysis] = useState(true)

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

    const loadInitial = async () => {
      try {
        const patientResponse = await getPatient(selectedPatientId)
        const patientData = getResponseData(patientResponse)
        if (patientData) {
          setSelectedPatient({
            cnp: patientData.cnp,
            full_name: `${patientData.last_name} ${patientData.first_name}`.trim(),
          })
        }
      } catch (error) {
        notifyError(getErrorMessage(error))
      }

      await loadAnalysis(selectedPatientId)
    }

    loadInitial().then(() => {})
  }, [loadAnalysis, notifyError, selectedPatientId])

  const treatmentOutcomeHistory = useMemo(() => {
    const medications = analysis?.medications || []
    const alerts = (analysis?.alerts || [])
      .map((alert) => ({
        ...alert,
        time: toTimestamp(alert.created_at),
        severityScore: getSeverityScore(alert.severity),
      }))
      .filter((alert) => alert.time !== null)
      .sort((left, right) => left.time - right.time)

    const medicationsByTime = medications
      .map((medication) => ({...medication, time: toTimestamp(medication.prescribed_at)}))
      .filter((medication) => medication.time !== null)
      .sort((left, right) => left.time - right.time)

    return medicationsByTime.map((medication, index) => {
      const nextMedicationTime = medicationsByTime[index + 1]?.time ?? null
      const afterWindowEnd = nextMedicationTime && nextMedicationTime > medication.time
        ? nextMedicationTime
        : medication.time + DEFAULT_OUTCOME_WINDOW_MS
      const windowDuration = Math.max(DEFAULT_OUTCOME_WINDOW_MS, afterWindowEnd - medication.time)
      const beforeWindowStart = medication.time - windowDuration

      const beforeAlerts = alerts.filter((alert) => alert.time >= beforeWindowStart && alert.time < medication.time)
      const afterAlerts = alerts.filter((alert) => alert.time >= medication.time && alert.time < afterWindowEnd)

      const beforeCount = beforeAlerts.length
      const afterCount = afterAlerts.length
      const beforeSeverityScore = beforeAlerts.reduce((sum, alert) => sum + alert.severityScore, 0)
      const afterSeverityScore = afterAlerts.reduce((sum, alert) => sum + alert.severityScore, 0)

      return {
        medication,
        outcome: deriveOutcomeFromAlertEvolution({
          beforeCount,
          afterCount,
          beforeSeverityScore,
          afterSeverityScore,
        }),
      }
    })
  }, [analysis])

  const timelineData = useMemo(() => {
    const alerts = (analysis?.alerts || [])
      .map((alert) => ({
        time: toTimestamp(alert.created_at),
        severityScore: getSeverityScore(alert.severity),
      }))
      .filter((alert) => alert.time !== null)
      .sort((left, right) => left.time - right.time)

    if (!alerts.length) {
      const now = Date.now()
      const before = now - TIMELINE_BUCKET_MS
      return [
        {time: new Date(before).toISOString().slice(0, 16), effective: 1, ineffective: 0},
        {time: new Date(now).toISOString().slice(0, 16), effective: 1, ineffective: 0},
      ]
    }

    const bucketed = new Map()
    alerts.forEach((alert) => {
      const bucketStart = Math.floor(alert.time / TIMELINE_BUCKET_MS) * TIMELINE_BUCKET_MS
      const current = bucketed.get(bucketStart) || {count: 0, severityScore: 0}
      current.count += 1
      current.severityScore += alert.severityScore
      bucketed.set(bucketStart, current)
    })

    const sortedBuckets = Array.from(bucketed.keys()).sort((left, right) => left - right)
    let firstBucket = sortedBuckets[0]
    let lastBucket = sortedBuckets[sortedBuckets.length - 1]

    if (sortedBuckets.length === 1) {
      firstBucket -= TIMELINE_BUCKET_MS
      lastBucket += TIMELINE_BUCKET_MS
    }

    const timelineBuckets = []
    for (let bucketStart = firstBucket; bucketStart <= lastBucket; bucketStart += TIMELINE_BUCKET_MS) {
      timelineBuckets.push(bucketStart)
    }

    return timelineBuckets.map((bucketStart, index) => {
      const previousBucket = timelineBuckets[index - 1]
      const currentBucketStats = bucketed.get(bucketStart) || {count: 0, severityScore: 0}
      const previousBucketStats = previousBucket == null
        ? {count: 0, severityScore: 0}
        : (bucketed.get(previousBucket) || {count: 0, severityScore: 0})

      const outcome = index === 0
        ? (currentBucketStats.count > 0 ? "Ineffective" : "Effective")
        : deriveOutcomeFromAlertEvolution({
          beforeCount: previousBucketStats.count,
          afterCount: currentBucketStats.count,
          beforeSeverityScore: previousBucketStats.severityScore,
          afterSeverityScore: currentBucketStats.severityScore,
        })

      return {
        time: new Date(bucketStart).toISOString().slice(0, 16),
        effective: outcome === "Effective" ? 1 : 0,
        ineffective: outcome === "Ineffective" ? 1 : 0,
      }
    })
  }, [analysis])

  const medicationHistory = useMemo(() => {
    const medications = analysis?.medications || []
    const treatmentOutcomeByMedicationId = new Map(
      treatmentOutcomeHistory.map((entry) => [entry.medication.id, entry.outcome]),
    )

    return medications.map((medication) => {
      const relatedAlerts = medication.reasoning?.alerts || []
      const relatedDiagnoses = medication.reasoning?.diagnoses || []
      const relatedConditions = medication.reasoning?.conditions || []
      const outcome = treatmentOutcomeByMedicationId.get(medication.id) || (relatedAlerts.length ? "Ineffective" : "Effective")

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
        related_alerts: relatedAlerts,
        related_diagnoses: relatedDiagnoses,
        related_conditions: relatedConditions,
        outcome,
        reasonText,
      }
    })
  }, [analysis, treatmentOutcomeHistory])

  const formatDate = (value) => {
    const date = new Date(value)
    if (!Number.isFinite(date.getTime())) {
      return "--"
    }
    return new Intl.DateTimeFormat("en-GB", {day: "2-digit", month: "short", year: "numeric"}).format(date)
  }

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
          <div className="h-[320px] rounded-2xl border border-[#2a3441] bg-[#0f141a] p-3">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={timelineData}>
                <CartesianGrid stroke="#1f2937" strokeDasharray="3 3" />
                <XAxis dataKey="time" stroke="#879196" tick={{fontSize: 11}} />
                <YAxis stroke="#879196" tick={{fontSize: 11}} allowDecimals={false}/>
                <Tooltip
                  contentStyle={{
                    backgroundColor: "#111827",
                    border: "1px solid #334155",
                    borderRadius: "12px",
                    color: "#fff",
                  }}
                />
                <Area
                  type="monotone"
                  dataKey="effective"
                  stackId="1"
                  stroke="#22c55e"
                  fill="#22c55e"
                  fillOpacity={0.6}
                />
                <Area
                  type="monotone"
                  dataKey="ineffective"
                  stackId="1"
                  stroke="#ef4444"
                  fill="#ef4444"
                  fillOpacity={0.6}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          <div>
            <h3 className="text-xl font-semibold text-white">Treatment History & Clinical Reasoning</h3>
            <div className="mt-4 space-y-4">
              {medicationHistory.length ? medicationHistory.map((item, index) => (
                <div key={`${item.medication_name}-${item.created_at}-${index}`} className="monitor-panel rounded-2xl px-4 py-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <p className="text-sm font-semibold text-white">Medication: {item.medication_name || "--"}</p>
                    <p className="text-xs text-[#b6bec9]">Date: {formatDate(item.created_at)}</p>
                  </div>
                  <p className="mt-2 text-sm text-[#d5dbdb]">Dosage: {item.dosage || "--"}</p>
                  <p className="mt-1 text-sm text-[#d5dbdb]">Frequency: {item.frequency || "--"}</p>

                  <div className="mt-4 grid gap-3 md:grid-cols-2">
                    <div className="rounded-xl border border-[#2a3441] bg-[#151b22] p-3">
                      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#b6bec9]">Reason</p>
                      <p className="mt-2 text-sm text-white">{item.reasonText}</p>
                    </div>
                    <div className="rounded-xl border border-[#2a3441] bg-[#151b22] p-3">
                      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#b6bec9]">Outcome</p>
                      <p className={`mt-2 text-sm font-semibold ${item.outcome === "Effective" ? "text-[#22c55e]" : "text-[#ef4444]"}`}>
                        {item.outcome}
                      </p>
                    </div>
                  </div>

                  <div className="mt-3 grid gap-3 md:grid-cols-2">
                    <div className="rounded-xl border border-[#2a3441] bg-[#151b22] p-3">
                      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#b6bec9]">Alerts</p>
                      <p className="mt-2 text-sm text-white">{item.related_alerts.length ? item.related_alerts.join(", ") : "No linked alerts"}</p>
                    </div>
                    <div className="rounded-xl border border-[#2a3441] bg-[#151b22] p-3">
                      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#b6bec9]">Diagnosis</p>
                      <p className="mt-2 text-sm text-white">{item.related_diagnoses.length ? item.related_diagnoses.join(", ") : "No linked diagnosis"}</p>
                    </div>
                  </div>

                  <div className="mt-3 rounded-xl border border-[#2a3441] bg-[#151b22] p-3">
                    <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#b6bec9]">Conditions</p>
                    <p className="mt-2 text-sm text-white">{item.related_conditions.length ? item.related_conditions.join(", ") : "No linked conditions"}</p>
                  </div>
                </div>
              )) : (
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
