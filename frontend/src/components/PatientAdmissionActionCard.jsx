export default function PatientAdmissionActionCard({
  patient,
  dischargeReason,
  readmitReason,
  onDischargeReasonChange,
  onReadmitReasonChange,
  onDischargeSubmit,
  onReadmitSubmit,
  isSubmittingDischarge,
  isSubmittingReadmit,
}) {
  const canSubmitDischarge = dischargeReason.trim().length > 0 && !patient?.is_discharged
  const canSubmitReadmit = readmitReason.trim().length > 0 && Boolean(patient?.is_discharged)

  return (
    <section className="monitor-card rounded-[28px] p-6">
      <div className="mb-5">
        <p className="text-xs font-semibold uppercase tracking-[0.3em] text-[#ff9900]">
          {patient?.is_discharged ? "Readmission" : "Discharge"}
        </p>
        <h2 className="mt-2 text-2xl font-semibold text-white">
          {patient?.is_discharged ? "Readmit Patient" : "Discharge Patient"}
        </h2>
      </div>

      {patient?.is_discharged ? (
        <form className="space-y-4" onSubmit={onReadmitSubmit}>
          <textarea
            value={readmitReason}
            onChange={(event) => onReadmitReasonChange(event.target.value)}
            placeholder="Reason for readmission"
            className="console-input min-h-28 w-full rounded-2xl px-4 py-3 outline-none"
            required
          />

          <button
            type="submit"
            disabled={!canSubmitReadmit || isSubmittingReadmit}
            className="console-button-primary w-full rounded-2xl px-4 py-3 font-semibold disabled:cursor-not-allowed disabled:border-[#4d5661] disabled:bg-[#3b424b] disabled:text-[#b6bec9]"
          >
            {isSubmittingReadmit ? "Submitting..." : "Readmit Patient"}
          </button>
        </form>
      ) : (
        <form className="space-y-4" onSubmit={onDischargeSubmit}>
          <textarea
            value={dischargeReason}
            onChange={(event) => onDischargeReasonChange(event.target.value)}
            placeholder="Reason for discharge"
            className="console-input min-h-28 w-full rounded-2xl px-4 py-3 outline-none"
            required
          />

          <button
            type="submit"
            disabled={!canSubmitDischarge || isSubmittingDischarge}
            className="console-button-primary w-full rounded-2xl px-4 py-3 font-semibold disabled:cursor-not-allowed disabled:border-[#4d5661] disabled:bg-[#3b424b] disabled:text-[#b6bec9]"
          >
            {isSubmittingDischarge ? "Submitting..." : "Discharge Patient"}
          </button>
        </form>
      )}
    </section>
  )
}
