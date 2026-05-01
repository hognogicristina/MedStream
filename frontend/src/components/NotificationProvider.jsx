/* eslint-disable react-refresh/only-export-components */
import {createContext, useCallback, useContext, useEffect, useMemo, useRef, useState} from "react"

const NotificationContext = createContext(null)
const DEFAULT_NOTIFICATION_DURATION = 4000
const MAX_NOTIFICATIONS = 4

export function NotificationProvider({children}) {
  const [notifications, setNotifications] = useState([])
  const timeoutIdsRef = useRef(new Map())
  const nextIdRef = useRef(0)

  useEffect(() => () => {
    timeoutIdsRef.current.forEach((timeoutId) => window.clearTimeout(timeoutId))
    timeoutIdsRef.current.clear()
  }, [])

  const dismissNotification = useCallback((id) => {
    const timeoutId = timeoutIdsRef.current.get(id)

    if (timeoutId) {
      window.clearTimeout(timeoutId)
      timeoutIdsRef.current.delete(id)
    }

    setNotifications((current) => current.filter((notification) => notification.id !== id))
  }, [])

  const showNotification = useCallback(({
    message,
    type = "success",
    duration = DEFAULT_NOTIFICATION_DURATION,
    actionLabel = "",
    onAction = null,
    dedupeKey = "",
  }) => {
    if (!message) {
      return
    }

    const nextDedupeKey = dedupeKey || `${type}:${message}`
    let isDuplicate = false
    let createdNotificationId = ""
    setNotifications((current) => {
      isDuplicate = current.some((notification) => notification.dedupeKey === nextDedupeKey)
      if (isDuplicate) {
        return current
      }
      createdNotificationId = `notification-${nextIdRef.current += 1}`
      return [...current, {
        id: createdNotificationId,
        message,
        type,
        actionLabel,
        onAction,
        dedupeKey: nextDedupeKey,
      }].slice(-MAX_NOTIFICATIONS)
    })

    if (isDuplicate) {
      return
    }
    if (!createdNotificationId) {
      return
    }

    if (duration > 0) {
      const timeoutId = window.setTimeout(() => {
        dismissNotification(createdNotificationId)
      }, duration)

      timeoutIdsRef.current.set(createdNotificationId, timeoutId)
    }
  }, [dismissNotification])

  const contextValue = useMemo(() => ({
    notify: showNotification,
    notifySuccess(message, duration) {
      showNotification({message, type: "success", duration})
    },
    notifyError(message, duration) {
      showNotification({message, type: "error", duration})
    },
    notifyWarning(message, duration, options = {}) {
      showNotification({message, type: "warning", duration, ...options})
    },
    dismissNotification,
  }), [dismissNotification, showNotification])

  return (
    <NotificationContext.Provider value={contextValue}>
      {children}
      <div className="notification-stack" aria-live="polite" aria-atomic="true">
        {notifications.map((notification) => (
          <div
            key={notification.id}
            className={`notification-toast notification-toast-${notification.type}`}
            role="status"
          >
            <div>
              <p className="notification-toast-label">
                {notification.type === "error" ? "Error" : notification.type === "warning" ? "Warning" : "Success"}
              </p>
              <p className="notification-toast-message">{notification.message}</p>
              {notification.actionLabel && typeof notification.onAction === "function" && (
                <button
                  type="button"
                  className="notification-toast-action"
                  onClick={notification.onAction}
                >
                  {notification.actionLabel}
                </button>
              )}
            </div>
            <button
              type="button"
              onClick={() => dismissNotification(notification.id)}
              className="notification-toast-dismiss"
              aria-label="Dismiss notification"
            >
              ×
            </button>
          </div>
        ))}
      </div>
    </NotificationContext.Provider>
  )
}

export function useNotifications() {
  const context = useContext(NotificationContext)

  if (!context) {
    throw new Error("useNotifications must be used within a NotificationProvider")
  }

  return context
}
