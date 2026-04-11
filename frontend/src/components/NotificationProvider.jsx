import {createContext, useCallback, useContext, useEffect, useMemo, useRef, useState} from "react"

const NotificationContext = createContext(null)

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

  const showNotification = useCallback(({message, type = "success", duration = 3600}) => {
    if (!message) {
      return
    }

    const id = `notification-${nextIdRef.current += 1}`

    setNotifications((current) => [...current, {id, message, type}])

    const timeoutId = window.setTimeout(() => {
      dismissNotification(id)
    }, duration)

    timeoutIdsRef.current.set(id, timeoutId)
  }, [dismissNotification])

  const contextValue = useMemo(() => ({
    notify: showNotification,
    notifySuccess(message, duration) {
      showNotification({message, type: "success", duration})
    },
    notifyError(message, duration) {
      showNotification({message, type: "error", duration})
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
              <p className="notification-toast-label">{notification.type === "error" ? "Error" : "Success"}</p>
              <p className="notification-toast-message">{notification.message}</p>
            </div>
            <button
              type="button"
              onClick={() => dismissNotification(notification.id)}
              className="notification-toast-dismiss"
              aria-label="Dismiss notification"
            >
              Close
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
