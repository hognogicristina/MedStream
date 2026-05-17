import LoadingSpinner from "./LoadingSpinner.jsx"
import {formatBucharestDateTime} from "../utils/time.js"

function formatDateTime(value) {
  return formatBucharestDateTime(value)
}

function formatPersonNames(items, prefix = "") {
  if (!items || items.length === 0) {
    return "--"
  }

  return items.map((item) => `${prefix}${item.first_name} ${item.last_name}`).join(", ")
}

export default function ActivityList({
                                       activities,
                                       canManageActivity,
                                       emptyMessage,
                                       isLoading,
                                       loadingMessage,
                                       onCancel,
                                       onEdit,
                                     }) {
  if (isLoading) {
    return <LoadingSpinner text={loadingMessage}/>
  }

  if (activities.length === 0) {
    return (
      <div className="rounded-2xl border border-[var(--border-primary)] bg-[var(--surface-2)] px-4 py-5 text-sm text-[var(--text-secondary)]">
        {emptyMessage}
      </div>
    )
  }

  return (
    <ul className="space-y-3">
      {activities.map((activity) => {
        const isCanceled = activity.status === "canceled"
        const isCompleted = activity.status === "completed"
        const isIncoming = activity.status === "incoming"
        const hasPermission = canManageActivity ? canManageActivity(activity) : true
        const isReadOnly = isCanceled || isCompleted
        const canEdit = Boolean(onEdit) && !isReadOnly && hasPermission
        const canCancel = Boolean(onCancel) && !isReadOnly && hasPermission

        return (
          <li
            key={activity.id}
            className={`rounded-2xl border p-4 ${isCanceled ? "activity-card-canceled" : "border-[var(--border-primary)] bg-[var(--surface-2)]"}`}
          >
            <div className="flex flex-col gap-3">
              <div className="flex justify-between items-start gap-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[#ffcc80]">{activity.type}</p>
                  <p className={`mt-1 text-sm font-semibold ${isCanceled ? "text-[var(--text-secondary)]" : "text-[var(--text-primary)]"}`}>
                    {activity.title}
                  </p>
                </div>
                <div className="flex items-start gap-2">
                  <span
                    className={`activity-status-pill inline-flex rounded-full border px-2 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] ${
                      isCanceled
                        ? "activity-status-pill-canceled"
                        : isIncoming
                          ? "activity-status-pill-incoming"
                          : "activity-status-pill-completed"
                    }`}
                  >
                    {activity.status}
                  </span>
                  {onEdit && (
                    <button
                      type="button"
                      onClick={() => canEdit && onEdit(activity)}
                      disabled={!canEdit}
                      className={`${isReadOnly ? "activity-action-muted" : "console-button-secondary"} rounded-xl px-3 py-2 text-xs font-semibold disabled:cursor-not-allowed disabled:opacity-60 disabled:border-[var(--border-strong)] disabled:bg-[var(--border-primary)] disabled:text-[var(--text-secondary)]`}
                    >
                      Edit
                    </button>
                  )}
                </div>
              </div>
              {activity.description && <p className={`text-sm ${isCanceled ? "text-[var(--text-muted)]" : "text-[var(--text-secondary)]"}`}>{activity.description}</p>}
              <div className={`space-y-1 text-xs ${isCanceled ? "text-[var(--text-subtle)]" : "text-[var(--text-muted)]"}`}>
                <p>{formatDateTime(activity.scheduled_at)}</p>
                <p>Doctors: {formatPersonNames(activity.doctors, "Dr. ")}</p>
                <p>Patients: {formatPersonNames(activity.patients)}</p>
              </div>
              {onCancel && (
                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={() => canCancel && onCancel(activity)}
                    disabled={!canCancel}
                    className={`${isReadOnly ? "activity-action-muted" : "activity-action-danger"} rounded-2xl border px-4 py-2 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-60 disabled:border-[var(--border-strong)] disabled:bg-[var(--border-primary)] disabled:text-[var(--text-secondary)]`}
                  >
                    Cancel Activity
                  </button>
                </div>
              )}
            </div>
          </li>
        )
      })}
    </ul>
  )
}
