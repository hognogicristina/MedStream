import {Button, Select} from "@cloudscape-design/components"

function getSelectedOption(options, value) {
  return options.find((option) => option.value === value) || null
}

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
  const arrivalMethodOptions = [
    {label: "Self", value: "self"},
    {label: "Ambulance", value: "ambulance"},
  ]
  const dischargeTypeOptions = dischargeTypes.map((type) => ({label: type, value: type}))

  return (
    <section className="monitor-card rounded-[28px] p-6">
      <div className="mb-5">
        <p className="text-xs font-semibold uppercase tracking-[0.3em] text-[#ff9900]">
          {patient?.is_discharged ? "Readmission" : "Discharge"}
        </p>
        <h2 className="mt-2 text-2xl font-semibold text-[var(--text-primary)]">
          {patient?.is_discharged ? "Readmit Patient" : "Discharge Patient"}
        </h2>
      </div>

      {patient?.is_discharged ? (
        <form className="space-y-4" onSubmit={onReadmitSubmit}>
          <div className="login-field">
            <label className="login-label" htmlFor="readmit-arrival-method">Arrival Method</label>
            <Select
              selectedOption={getSelectedOption(arrivalMethodOptions, readmitArrivalMethod)}
              onChange={({detail}) => onReadmitArrivalMethodChange(detail.selectedOption.value)}
              options={arrivalMethodOptions}
              selectedAriaLabel="Selected arrival method"
              disabled={!canManagePatient || isSubmittingReadmit}
            />
          </div>
          <p className="text-xs text-[var(--text-muted)]">
            Admission note is generated automatically from arrival method.
          </p>
          <Button
            formAction="submit"
            variant="primary"
            className="medstream-submit-button"
            disabled={!canSubmitReadmit || isSubmittingReadmit}
          >
            {isSubmittingReadmit ? "Submitting..." : "Readmit Patient"}
          </Button>
        </form>
      ) : (
        <form className="space-y-4" onSubmit={onDischargeSubmit}>
          <div className="login-field">
            <label className="login-label" htmlFor="discharge-type">Type</label>
            <Select
              selectedOption={getSelectedOption(dischargeTypeOptions, dischargeType)}
              onChange={({detail}) => onDischargeTypeChange(detail.selectedOption.value)}
              options={dischargeTypeOptions}
              placeholder="Select type"
              selectedAriaLabel="Selected discharge type"
              disabled={!canManagePatient || isSubmittingDischarge}
            />
          </div>
          <textarea
            value={dischargeReason}
            onChange={(event) => onDischargeReasonChange(event.target.value)}
            placeholder="Reason for discharge"
            className="console-input min-h-28 w-full rounded-2xl px-4 py-3 outline-none"
            disabled={!canManagePatient || isSubmittingDischarge}
            required
          />

          <Button
            formAction="submit"
            variant="primary"
            className="medstream-submit-button"
            disabled={!canSubmitDischarge || isSubmittingDischarge}
          >
            {isSubmittingDischarge ? "Submitting..." : "Discharge Patient"}
          </Button>
        </form>
      )}
    </section>
  )
}
