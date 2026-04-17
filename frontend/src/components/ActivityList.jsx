function formatDateTime(value) {
  if (!value) {
    return "--"
  }

  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value))
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
    return (
      <div className="rounded-2xl border border-[#3b424b] bg-[#151b22] px-4 py-5 text-sm text-[#b6bec9]">
        {loadingMessage}
      </div>
    )
  }

  if (activities.length === 0) {
    return (
      <div className="rounded-2xl border border-[#3b424b] bg-[#151b22] px-4 py-5 text-sm text-[#b6bec9]">
        {emptyMessage}
      </div>
    )
  }

  return (
    <ul className="space-y-3">
      {activities.map((activity) => {
        const isCanceled = activity.status === "canceled"
        const isIncoming = activity.status === "incoming"
        const hasPermission = canManageActivity ? canManageActivity(activity) : true
        const canEdit = Boolean(onEdit) && !isCanceled && hasPermission
        const canCancel = Boolean(onCancel) && !isCanceled && hasPermission

        return (
          <li
            key={activity.id}
            className={`rounded-2xl border p-4 ${isCanceled ? "border-[#4d5661] bg-[#10151b] opacity-65" : "border-[#3b424b] bg-[#151b22]"}`}
          >
            <div className="flex flex-col gap-3">
              <div className="flex justify-between items-start gap-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[#ffcc80]">{activity.type}</p>
                  <p className="mt-1 text-sm font-semibold text-white">{activity.title}</p>
                </div>
                <div className="flex items-start gap-2">
                  <span
                    className={`inline-flex rounded-full border px-2 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] ${
                      isCanceled
                        ? "border-[#5b616b] bg-[#1a2028] text-[#b6bec9]"
                        : isIncoming
                          ? "border-[#8b6914] bg-[#2d2208] text-[#ffd76b]"
                          : "border-[#1f4d36] bg-[#0e2519] text-[#bbf7d0]"
                    }`}
                  >
                    {activity.status}
                  </span>
                  {onEdit && (
                    <button
                      type="button"
                      onClick={() => canEdit && onEdit(activity)}
                      disabled={!canEdit}
                      className="console-button-secondary rounded-xl px-3 py-2 text-xs font-semibold disabled:cursor-not-allowed disabled:border-[#4d5661] disabled:bg-[#3b424b] disabled:text-[#b6bec9]"
                    >
                      Edit
                    </button>
                  )}
                </div>
              </div>
              {activity.description && <p className="text-sm text-[#b6bec9]">{activity.description}</p>}
              <div className="space-y-1 text-xs text-[#879196]">
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
                    className="rounded-2xl border border-[#a33a45] bg-[#3a1f25] px-4 py-2 text-sm font-semibold text-[#ffd8dc] transition hover:bg-[#47262d] disabled:cursor-not-allowed disabled:border-[#4d5661] disabled:bg-[#3b424b] disabled:text-[#b6bec9]"
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
