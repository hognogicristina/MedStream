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
      <div className="activity-empty-state">
        {emptyMessage}
      </div>
    )
  }

  return (
    <ul className="activity-list">
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
            className={`activity-card ${isCanceled ? "activity-card-canceled" : ""}`}
          >
            <div className="activity-card-body">
              <div className="activity-card-header">
                <div>
                  <p className="activity-card-type">{activity.type}</p>
                  <p className={`activity-card-title ${isCanceled ? "activity-card-title-canceled" : ""}`}>
                    {activity.title}
                  </p>
                </div>
                <div className="activity-card-actions">
                  <span
                    className={`activity-status-pill ${
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
                      className={`${isReadOnly ? "activity-action-muted" : "console-button-secondary"} activity-edit-button`}
                    >
                      Edit
                    </button>
                  )}
                </div>
              </div>
              {activity.description && <p className={`activity-card-description ${isCanceled ? "activity-card-description-canceled" : ""}`}>{activity.description}</p>}
              <div className={`activity-card-meta ${isCanceled ? "activity-card-meta-canceled" : ""}`}>
                <p>{formatDateTime(activity.scheduled_at)}</p>
                <p>Doctors: {formatPersonNames(activity.doctors, "Dr. ")}</p>
                <p>Patients: {formatPersonNames(activity.patients)}</p>
              </div>
              {onCancel && (
                <div className="activity-card-cancel-row">
                  <button
                    type="button"
                    onClick={() => canCancel && onCancel(activity)}
                    disabled={!canCancel}
                    className={isReadOnly ? "activity-action-muted" : "activity-action-danger"}
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
