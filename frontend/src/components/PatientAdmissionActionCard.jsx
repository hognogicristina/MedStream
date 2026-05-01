export default function PatientAdmissionActionCard({
  patient,
  canManagePatient = true,
  dischargeReason,
  dischargeType,
  dischargeTypes = [],
  readmitArrivalMethod,
  onDischargeReasonChange,
  onDischargeTypeChange,
  onReadmitArrivalMethodChange,
  onDischargeSubmit,
  onReadmitSubmit,
  isSubmittingDischarge,
  isSubmittingReadmit,
}) {
  const canSubmitDischarge = canManagePatient && dischargeReason.trim().length > 0 && Boolean(dischargeType) && !patient?.is_discharged
  const canSubmitReadmit = canManagePatient && Boolean(readmitArrivalMethod) && Boolean(patient?.is_discharged)

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
          <div className="login-field">
            <label className="login-label" htmlFor="readmit-arrival-method">Arrival Method</label>
            <select
              id="readmit-arrival-method"
              value={readmitArrivalMethod}
              onChange={(event) => onReadmitArrivalMethodChange(event.target.value)}
              className="login-input"
              required
              disabled={!canManagePatient || isSubmittingReadmit}
            >
              <option value="self">Self</option>
              <option value="ambulance">Ambulance</option>
            </select>
          </div>
          <p className="text-xs text-[#879196]">
            Admission note is generated automatically from arrival method.
          </p>
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
          <div className="login-field">
            <label className="login-label" htmlFor="discharge-type">Type</label>
            <select
              id="discharge-type"
              value={dischargeType}
              onChange={(event) => onDischargeTypeChange(event.target.value)}
              className="login-input"
              disabled={!canManagePatient || isSubmittingDischarge}
              required
            >
              <option value="">Select type</option>
              {dischargeTypes.map((type) => (
                <option key={type} value={type}>{type}</option>
              ))}
            </select>
          </div>
          <textarea
            value={dischargeReason}
            onChange={(event) => onDischargeReasonChange(event.target.value)}
            placeholder="Reason for discharge"
            className="console-input min-h-28 w-full rounded-2xl px-4 py-3 outline-none"
            disabled={!canManagePatient || isSubmittingDischarge}
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
