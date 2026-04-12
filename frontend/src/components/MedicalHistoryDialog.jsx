import {useEffect, useState} from "react"

export default function MedicalHistoryDialog({isOpen, isSubmitting, onClose, onSubmit}) {
  const [form, setForm] = useState({
    condition_name: "",
    description: "",
    type: "illness",
  })

  useEffect(() => {
    if (!isOpen) {
      return
    }

    setForm({
      condition_name: "",
      description: "",
      type: "illness",
    })
  }, [isOpen])

  if (!isOpen) {
    return null
  }

  return (
    <div className="console-modal-overlay">
      <div className="console-modal monitor-card rounded-[28px] p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-[#ff9900]">Patient Medical History</p>
            <h2 className="mt-2 text-2xl font-semibold text-white">Add Medical History</h2>
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
            onSubmit({
              condition_name: form.condition_name,
              description: form.description,
              type: form.type,
            })
          }}
        >
          <div className="login-field">
            <label className="login-label" htmlFor="medical-history-condition-name">Condition Name</label>
            <input
              id="medical-history-condition-name"
              type="text"
              value={form.condition_name}
              onChange={(event) => setForm((current) => ({...current, condition_name: event.target.value}))}
              className="login-input"
              placeholder="Example: Hypertension"
              required
            />
          </div>

          <div className="login-field">
            <label className="login-label" htmlFor="medical-history-type">Type</label>
            <select
              id="medical-history-type"
              value={form.type}
              onChange={(event) => setForm((current) => ({...current, type: event.target.value}))}
              className="login-input"
            >
              <option value="illness">Illness</option>
              <option value="surgery">Surgery</option>
              <option value="chronic">Chronic</option>
              <option value="injury">Injury</option>
            </select>
          </div>

          <div className="login-field">
            <label className="login-label" htmlFor="medical-history-description">Description</label>
            <textarea
              id="medical-history-description"
              value={form.description}
              onChange={(event) => setForm((current) => ({...current, description: event.target.value}))}
              className="login-input min-h-28"
              placeholder="Additional clinical context"
            />
          </div>

          <div className="flex justify-end">
            <button
              type="submit"
              disabled={!form.condition_name.trim() || isSubmitting}
              className="console-button-primary rounded-2xl px-5 py-3 text-sm font-semibold disabled:cursor-not-allowed disabled:border-[#4d5661] disabled:bg-[#3b424b] disabled:text-[#b6bec9]"
            >
              {isSubmitting ? "Saving..." : "Add Medical History"}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
