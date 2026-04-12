import {useEffect, useState} from "react"

export default function DoctorActivityDialog({isOpen, isSubmitting, onClose, onSubmit}) {
  const [form, setForm] = useState({
    type: "appointment",
    title: "",
    description: "",
    scheduled_at: "",
  })

  useEffect(() => {
    if (!isOpen) {
      return
    }

    setForm({
      type: "appointment",
      title: "",
      description: "",
      scheduled_at: "",
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
            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-[#ff9900]">Future Activities</p>
            <h2 className="mt-2 text-2xl font-semibold text-white">Add Activity</h2>
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
            onSubmit(form)
          }}
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="login-field">
              <label className="login-label" htmlFor="doctor-activity-type">Type</label>
              <select
                id="doctor-activity-type"
                value={form.type}
                onChange={(event) => setForm((current) => ({...current, type: event.target.value}))}
                className="login-input"
              >
                <option value="appointment">Appointment</option>
                <option value="intervention">Intervention</option>
                <option value="surgery">Surgery</option>
              </select>
            </div>

            <div className="login-field">
              <label className="login-label" htmlFor="doctor-activity-scheduled-at">Scheduled Date</label>
              <input
                id="doctor-activity-scheduled-at"
                type="datetime-local"
                value={form.scheduled_at}
                onChange={(event) => setForm((current) => ({...current, scheduled_at: event.target.value}))}
                className="login-input"
                required
              />
            </div>
          </div>

          <div className="login-field">
            <label className="login-label" htmlFor="doctor-activity-title">Title</label>
            <input
              id="doctor-activity-title"
              type="text"
              value={form.title}
              onChange={(event) => setForm((current) => ({...current, title: event.target.value}))}
              className="login-input"
              placeholder="Example: ICU intervention review"
              required
            />
          </div>

          <div className="login-field">
            <label className="login-label" htmlFor="doctor-activity-description">Description</label>
            <textarea
              id="doctor-activity-description"
              value={form.description}
              onChange={(event) => setForm((current) => ({...current, description: event.target.value}))}
              className="login-input min-h-28"
              placeholder="Optional details"
            />
          </div>

          <div className="flex justify-end">
            <button
              type="submit"
              disabled={!form.title.trim() || !form.scheduled_at || isSubmitting}
              className="console-button-primary rounded-2xl px-5 py-3 text-sm font-semibold disabled:cursor-not-allowed disabled:border-[#4d5661] disabled:bg-[#3b424b] disabled:text-[#b6bec9]"
            >
              {isSubmitting ? "Saving..." : "Add Activity"}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
