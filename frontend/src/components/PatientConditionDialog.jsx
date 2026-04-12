import {useEffect, useState} from "react"

export default function PatientConditionDialog({conditions, isOpen, isSubmitting, onClose, onSubmit}) {
  const [conditionId, setConditionId] = useState("")

  useEffect(() => {
    if (!isOpen) {
      return
    }

    setConditionId(String(conditions[0]?.id || ""))
  }, [conditions, isOpen])

  if (!isOpen) {
    return null
  }

  return (
    <div className="console-modal-overlay">
      <div className="console-modal monitor-card rounded-[28px] p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-[#ff9900]">Patient Conditions</p>
            <h2 className="mt-2 text-2xl font-semibold text-white">Add Condition</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="console-button-secondary rounded-xl px-3 py-2 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-60"
          >
            Cancel
          </button>
        </div>

        <form
          className="mt-5 space-y-4"
          onSubmit={(event) => {
            event.preventDefault()
            onSubmit({condition_id: Number(conditionId)})
          }}
        >
          <div className="login-field">
            <label className="login-label" htmlFor="patient-condition-select">Condition</label>
            <select
              id="patient-condition-select"
              value={conditionId}
              onChange={(event) => setConditionId(event.target.value)}
              className="login-input"
              required
            >
              {conditions.map((condition) => (
                <option key={condition.id} value={condition.id}>
                  {condition.name}
                </option>
              ))}
            </select>
          </div>

          <div className="rounded-2xl border border-[#3b424b] bg-[#151b22] p-4">
            <p className="text-sm text-[#b6bec9]">
              {conditions.find((condition) => String(condition.id) === String(conditionId))?.description || "Select an available condition."}
            </p>
          </div>

          <div className="flex justify-end">
            <button
              type="submit"
              disabled={!conditionId || isSubmitting}
              className="console-button-primary rounded-2xl px-5 py-3 text-sm font-semibold disabled:cursor-not-allowed disabled:border-[#4d5661] disabled:bg-[#3b424b] disabled:text-[#b6bec9]"
            >
              {isSubmitting ? "Saving..." : "Add Condition"}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
