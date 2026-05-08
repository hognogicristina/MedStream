function formatDateTime(value) {
  if (!value) {
    return "--"
  }
  const parsed = new Date(value)
  if (!Number.isFinite(parsed.getTime())) {
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
  }).format(parsed)
}

function formatVital(value) {
  const normalized = String(value || "").trim().toLowerCase()
  if (!normalized || normalized === "none") {
    return "None"
  }
  if (normalized === "heart_rate") {
    return "Heart rate"
  }
  if (normalized === "oxygen_saturation") {
    return "Oxygen saturation"
  }
  if (normalized === "temperature") {
    return "Temperature"
  }
  return normalized.replaceAll("_", " ")
}

function normalizeOutcome(value) {
  const normalized = String(value || "").trim().toLowerCase()
  if (normalized === "effective") {
    return "Effective"
  }
  if (normalized === "improving") {
    return "Improving"
  }
  if (normalized === "ineffective") {
    return "Ineffective"
  }
  return "Not available"
}

function StatTile({label, value, className = ""}) {
  return (
    <div className={`rounded-xl border px-3 py-2 ${className || "border-[#2a3441] bg-[#151b22]"}`}>
      <p className="text-[11px] uppercase tracking-[0.14em] text-[#9aa5b1]">{label}</p>
      <p className="mt-1 text-sm font-semibold text-white">{value}</p>
    </div>
  )
}

function outcomeClassName(value) {
  const normalized = normalizeOutcome(value)
  if (normalized === "Effective") {
    return "border-[#1f4f3a] bg-[#11251c]"
  }
  if (normalized === "Improving") {
    return "border-[#5d4a1f] bg-[#2a2111]"
  }
  if (normalized === "Ineffective") {
    return "border-[#5b2a2f] bg-[#2a1618]"
  }
  return "border-[#2f3c49] bg-[#15202b]"
}

function vitalClassName(value) {
  const normalized = String(value || "").trim().toLowerCase()
  if (normalized === "oxygen_saturation") {
    return "border-[#245267] bg-[#11232c]"
  }
  if (normalized === "heart_rate") {
    return "border-[#5b2a2f] bg-[#2a1618]"
  }
  if (normalized === "temperature") {
    return "border-[#5d3a20] bg-[#2a1b12]"
  }
  return "border-[#2f3c49] bg-[#15202b]"
}

function toSafeCount(value) {
  const numeric = Number(value)
  if (!Number.isFinite(numeric) || numeric < 0) {
    return 0
  }
  return Math.round(numeric)
}

function percentage(value, total) {
  if (!total) {
    return 0
  }
  return Math.max(0, Math.min(100, (value / total) * 100))
}

function responseInterpretation(score) {
  if (score >= 75) {
    return "Strong treatment response"
  }
  if (score >= 45) {
    return "Partial treatment response"
  }
  return "Limited treatment response"
}

export default function PostDischargeClinicalSummaryCard({summary, isLoading = false, compact = false}) {
  if (isLoading) {
    return (
      <section className="monitor-panel rounded-2xl border border-[#2a3441] px-4 py-4">
        <p className="text-sm text-[#b6bec9]">Loading post-discharge clinical summary...</p>
      </section>
    )
  }

  if (!summary) {
    return null
  }

  const status = String(summary.status || "").trim().toLowerCase()
  if (status === "not_available") {
    return null
  }

  const dischargeReason = summary.discharge_reason || "Not recorded."
  const finalOutcome = normalizeOutcome(summary.final_treatment_outcome)
  const problematicVital = formatVital(summary.most_problematic_vital)
  const generatedAt = formatDateTime(summary.generated_at)

  if (status === "pending") {
    return (
      <section className="monitor-panel overflow-hidden rounded-2xl border border-[#2a3441] bg-gradient-to-br from-[#121a22] to-[#0f141b] px-4 py-4">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="text-lg font-semibold text-white">Post-Discharge Clinical Summary</h3>
          <span className="rounded-full border border-[#3e4d5d] bg-[#18222d] px-2 py-0.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-[#c8d3dc]">
            Generated overview
          </span>
        </div>
        <p className="mt-2 text-sm text-[#b6bec9]">Historical clinical summary</p>
        <p className="mt-4 text-sm text-[#d5dbdb]">Clinical summary is being prepared.</p>
        <p className="mt-2 text-xs text-[#9aa5b1]">Discharge reason: {dischargeReason}</p>
      </section>
    )
  }

  const alertMetrics = summary.alert_metrics || {}
  const treatmentMetrics = summary.treatment_metrics || {}
  const effectiveCount = toSafeCount(treatmentMetrics.effective)
  const improvingCount = toSafeCount(treatmentMetrics.improving)
  const ineffectiveCount = toSafeCount(treatmentMetrics.ineffective)
  const totalTreatmentsRaw = toSafeCount(treatmentMetrics.total)
  const totalTreatments = totalTreatmentsRaw || (effectiveCount + improvingCount + ineffectiveCount)
  const effectivePct = percentage(effectiveCount, totalTreatments)
  const improvingPct = percentage(improvingCount, totalTreatments)
  const ineffectivePct = Math.max(0, 100 - effectivePct - improvingPct)
  const hasTreatmentData = totalTreatments > 0
  const responseScore = hasTreatmentData
    ? ((effectiveCount + (improvingCount * 0.5)) / totalTreatments) * 100
    : null
  const roundedResponseScore = responseScore == null ? null : Math.round(responseScore)
  const responseLabel = roundedResponseScore == null ? "Not enough treatment data" : `${roundedResponseScore}%`
  const responseInterpretationText = roundedResponseScore == null ? null : responseInterpretation(roundedResponseScore)

  return (
    <section className="monitor-panel overflow-hidden rounded-2xl border border-[#2a3441] bg-gradient-to-br from-[#131c25] via-[#111821] to-[#0e131a] px-4 py-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-lg font-semibold text-white">Post-Discharge Clinical Summary</h3>
        <span className="rounded-full border border-[#3e4d5d] bg-[#18222d] px-2 py-0.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-[#c8d3dc]">
          Generated overview
        </span>
      </div>
      <p className="mt-2 text-sm text-[#b6bec9]">Readmission overview</p>
      <p className="mt-3 text-xs text-[#9aa5b1]">Generated at: {generatedAt}</p>

      <div className="mt-4 rounded-xl border border-[#2a3441] bg-[#121922] p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#b6bec9]">Treatment Response Score</p>
          <span className="rounded-full border border-[#3e4d5d] bg-[#18222d] px-2 py-0.5 text-xs font-semibold text-[#d5dbdb]">
            {responseLabel}
          </span>
        </div>
        {responseInterpretationText ? (
          <p className="mt-2 text-sm text-[#cbd5de]">{responseInterpretationText}</p>
        ) : (
          <p className="mt-2 text-sm text-[#9aa5b1]">Not enough treatment data</p>
        )}
        <div className="mt-3 h-3 overflow-hidden rounded-full border border-[#2b3643] bg-[#0f151d]">
          <div className="flex h-full w-full">
            <div className="h-full bg-[#2f8f5a]" style={{width: `${effectivePct}%`}}/>
            <div className="h-full bg-[#b7882c]" style={{width: `${improvingPct}%`}}/>
            <div className="h-full bg-[#a64551]" style={{width: `${ineffectivePct}%`}}/>
          </div>
        </div>
        <div className="mt-3 grid gap-2 sm:grid-cols-3">
          <div className="rounded-lg border border-[#1f4f3a] bg-[#11251c] px-2 py-1.5 text-xs text-[#d5dbdb]">
            <span className="font-semibold text-[#9dd6b4]">Effective:</span> {effectiveCount}
          </div>
          <div className="rounded-lg border border-[#5d4a1f] bg-[#2a2111] px-2 py-1.5 text-xs text-[#d5dbdb]">
            <span className="font-semibold text-[#f4d38f]">Improving:</span> {improvingCount}
          </div>
          <div className="rounded-lg border border-[#5b2a2f] bg-[#2a1618] px-2 py-1.5 text-xs text-[#d5dbdb]">
            <span className="font-semibold text-[#f5a4ad]">Ineffective:</span> {ineffectiveCount}
          </div>
        </div>
      </div>

      <div className="mt-4 rounded-xl border border-[#2a3441] bg-[#121922] p-3">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#b6bec9]">Discharge Details</p>
        <div className="mt-3 grid gap-3 md:grid-cols-2">
          <StatTile label="Discharge reason" value={dischargeReason}/>
          <StatTile label="Discharge date" value={formatDateTime(summary.discharge_date)}/>
          <StatTile label="Final treatment outcome" value={finalOutcome} className={outcomeClassName(summary.final_treatment_outcome)}/>
          <StatTile label="Most monitored issue" value={problematicVital} className={vitalClassName(summary.most_problematic_vital)}/>
        </div>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-2">
        <div className="rounded-xl border border-[#2a3441] bg-[#121922] px-3 py-3">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#b6bec9]">Treatment Outcomes</p>
          <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
            <StatTile label="Total" value={totalTreatments}/>
            <StatTile label="Effective" value={effectiveCount} className="border-[#1f4f3a] bg-[#11251c]"/>
            <StatTile label="Improving" value={improvingCount} className="border-[#5d4a1f] bg-[#2a2111]"/>
            <StatTile label="Ineffective" value={ineffectiveCount} className="border-[#5b2a2f] bg-[#2a1618]"/>
          </div>
        </div>

        <div className="rounded-xl border border-[#2a3441] bg-[#121922] px-3 py-3">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#b6bec9]">Alert Profile</p>
          <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
            <StatTile label="Total" value={alertMetrics.total ?? 0}/>
            <StatTile label="Critical" value={alertMetrics.critical ?? 0} className="border-[#5b2a2f] bg-[#2a1618]"/>
            <StatTile label="High" value={alertMetrics.high ?? 0} className="border-[#5d3a20] bg-[#2a1b12]"/>
            <StatTile label={compact ? "Normalized" : "Normal / Stable"} value={alertMetrics.normal ?? 0} className="border-[#1f4f3a] bg-[#11251c]"/>
            <div className={compact ? "" : "col-span-2"}>
              <StatTile label="Normalized" value={alertMetrics.normalized ?? 0} className="border-[#1f4f3a] bg-[#11251c]"/>
            </div>
          </div>
        </div>
      </div>

      <div className="mt-4 rounded-xl border border-[#2a3441] bg-[#121922] px-3 py-3">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#b6bec9]">Clinical Summary</p>
        <p className="mt-2 text-sm leading-6 text-[#d5dbdb]">{summary.clinical_summary || "No clinical summary available."}</p>
      </div>

      <div className="mt-3 rounded-xl border border-[#2a3441] bg-[#121922] px-3 py-3">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#b6bec9]">Readmission Notes</p>
        <p className="mt-2 text-sm leading-6 text-[#d5dbdb]">{summary.readmission_notes || "No readmission notes available."}</p>
      </div>
    </section>
  )
}
