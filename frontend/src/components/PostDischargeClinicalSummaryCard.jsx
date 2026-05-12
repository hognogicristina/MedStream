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
    <div className={`rounded-xl border px-3 py-2 ${className || "border-[var(--border-subtle)] bg-[var(--surface-2)]"}`}>
      <p className="text-[11px] uppercase tracking-[0.14em] text-[var(--text-muted)]">{label}</p>
      <p className="mt-1 text-sm font-semibold text-[var(--text-primary)]">{value}</p>
    </div>
  )
}

function outcomeClassName(value) {
  const normalized = normalizeOutcome(value)
  if (normalized === "Effective") {
    return "status-surface status-surface-success"
  }
  if (normalized === "Improving") {
    return "status-surface status-surface-warning"
  }
  if (normalized === "Ineffective") {
    return "status-surface status-surface-danger"
  }
  return "status-surface status-surface-neutral"
}

function vitalClassName(value) {
  const normalized = String(value || "").trim().toLowerCase()
  if (normalized === "oxygen_saturation") {
    return "status-surface status-surface-info"
  }
  if (normalized === "heart_rate") {
    return "status-surface status-surface-danger"
  }
  if (normalized === "temperature") {
    return "status-surface status-surface-warning"
  }
  return "status-surface status-surface-neutral"
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
      <section className="monitor-panel rounded-2xl border border-[var(--border-subtle)] px-4 py-4">
        <p className="text-sm text-[var(--text-secondary)]">Loading post-discharge clinical summary...</p>
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
      <section className="monitor-panel overflow-hidden rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-2)] px-4 py-4">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="text-lg font-semibold text-[var(--text-primary)]">Post-Discharge Clinical Summary</h3>
          <span className="rounded-full border border-[var(--border-soft)] bg-[var(--surface-3)] px-2 py-0.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--text-secondary)]">
            Generated overview
          </span>
        </div>
        <p className="mt-2 text-sm text-[var(--text-secondary)]">Historical clinical summary</p>
        <p className="mt-4 text-sm text-[var(--text-primary)]">Clinical summary is being prepared.</p>
        <p className="mt-2 text-xs text-[var(--text-muted)]">Discharge reason: {dischargeReason}</p>
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
    <section className="monitor-panel overflow-hidden rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-2)] px-4 py-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-lg font-semibold text-[var(--text-primary)]">Post-Discharge Clinical Summary</h3>
        <span className="rounded-full border border-[var(--border-soft)] bg-[var(--surface-3)] px-2 py-0.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--text-secondary)]">
          Generated overview
        </span>
      </div>
      <p className="mt-2 text-sm text-[var(--text-secondary)]">Readmission overview</p>
      <p className="mt-3 text-xs text-[var(--text-muted)]">Generated at: {generatedAt}</p>

      <div className="mt-4 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-3)] p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--text-secondary)]">Treatment Response Score</p>
          <span className="rounded-full border border-[var(--border-soft)] bg-[var(--surface-3)] px-2 py-0.5 text-xs font-semibold text-[var(--text-primary)]">
            {responseLabel}
          </span>
        </div>
        {responseInterpretationText ? (
          <p className="mt-2 text-sm text-[var(--text-secondary)]">{responseInterpretationText}</p>
        ) : (
          <p className="mt-2 text-sm text-[var(--text-muted)]">Not enough treatment data</p>
        )}
        <div className="mt-3 h-3 overflow-hidden rounded-full border border-[var(--border-subtle)] bg-[var(--surface-4)]">
          <div className="flex h-full w-full">
            <div className="h-full bg-[#2f8f5a]" style={{width: `${effectivePct}%`}}/>
            <div className="h-full bg-[#b7882c]" style={{width: `${improvingPct}%`}}/>
            <div className="h-full bg-[#a64551]" style={{width: `${ineffectivePct}%`}}/>
          </div>
        </div>
        <div className="mt-3 grid gap-2 sm:grid-cols-3">
          <div className="rounded-lg border border-[#1f4f3a] bg-[#11251c] px-2 py-1.5 text-xs text-[var(--text-primary)]">
            <span className="font-semibold text-[#9dd6b4]">Effective:</span> {effectiveCount}
          </div>
          <div className="rounded-lg border border-[#5d4a1f] bg-[#2a2111] px-2 py-1.5 text-xs text-[var(--text-primary)]">
            <span className="font-semibold text-[#f4d38f]">Improving:</span> {improvingCount}
          </div>
          <div className="rounded-lg border border-[#5b2a2f] bg-[#2a1618] px-2 py-1.5 text-xs text-[var(--text-primary)]">
            <span className="font-semibold text-[#f5a4ad]">Ineffective:</span> {ineffectiveCount}
          </div>
        </div>
      </div>

      <div className="mt-4 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-3)] p-3">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--text-secondary)]">Discharge Details</p>
        <div className="mt-3 grid gap-3 md:grid-cols-2">
          <StatTile label="Discharge reason" value={dischargeReason}/>
          <StatTile label="Discharge date" value={formatDateTime(summary.discharge_date)}/>
          <StatTile label="Final treatment outcome" value={finalOutcome} className={outcomeClassName(summary.final_treatment_outcome)}/>
          <StatTile label="Most monitored issue" value={problematicVital} className={vitalClassName(summary.most_problematic_vital)}/>
        </div>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-2">
        <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-3)] px-3 py-3">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--text-secondary)]">Treatment Outcomes</p>
          <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
            <StatTile label="Total" value={totalTreatments}/>
            <StatTile label="Effective" value={effectiveCount} className="status-surface status-surface-success"/>
            <StatTile label="Improving" value={improvingCount} className="status-surface status-surface-warning"/>
            <StatTile label="Ineffective" value={ineffectiveCount} className="status-surface status-surface-danger"/>
          </div>
        </div>

        <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-3)] px-3 py-3">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--text-secondary)]">Alert Profile</p>
          <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
            <StatTile label="Total" value={alertMetrics.total ?? 0}/>
            <StatTile label="Critical" value={alertMetrics.critical ?? 0} className="status-surface status-surface-danger"/>
            <StatTile label="High" value={alertMetrics.high ?? 0} className="status-surface status-surface-warning"/>
            <StatTile label={compact ? "Normalized" : "Normal / Stable"} value={alertMetrics.normal ?? 0} className="status-surface status-surface-success"/>
            <div className={compact ? "" : "col-span-2"}>
              <StatTile label="Normalized" value={alertMetrics.normalized ?? 0} className="status-surface status-surface-success"/>
            </div>
          </div>
        </div>
      </div>

      <div className="mt-4 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-3)] px-3 py-3">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--text-secondary)]">Clinical Summary</p>
        <p className="mt-2 text-sm leading-6 text-[var(--text-primary)]">{summary.clinical_summary || "No clinical summary available."}</p>
      </div>

      <div className="mt-3 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-3)] px-3 py-3">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--text-secondary)]">Readmission Notes</p>
        <p className="mt-2 text-sm leading-6 text-[var(--text-primary)]">{summary.readmission_notes || "No readmission notes available."}</p>
      </div>
    </section>
  )
}
