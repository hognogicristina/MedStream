import {Link} from "react-router-dom"
import {useEffect, useRef, useState} from "react"
import {useLocation, useNavigate} from "react-router-dom"
import {useAuth} from "../auth/AuthContext"
import {useNotifications} from "../components/NotificationProvider"
import {api} from "../services/api"
import {getErrorMessage, getResponseData} from "../services/apiMessages"

export default function LoginPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const {login} = useAuth()
  const {notifySuccess} = useNotifications()
  const [identifier, setIdentifier] = useState("")
  const [password, setPassword] = useState("")
  const [feedback, setFeedback] = useState("")
  const [feedbackIsError, setFeedbackIsError] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const handledLocationKeyRef = useRef("")
  const isLoginValid = identifier.trim().length > 0 && password.trim().length > 0

  useEffect(() => {
    if (!location.state?.message) {
      return
    }

    if (handledLocationKeyRef.current === location.key) {
      return
    }

    handledLocationKeyRef.current = location.key
    notifySuccess(location.state.message)
    navigate(location.pathname, {replace: true, state: {}})
  }, [location.key, location.pathname, location.state, navigate, notifySuccess])

  const handleSubmit = async (event) => {
    event.preventDefault()
    if (!isLoginValid || isSubmitting) {
      return
    }
    setFeedback("")
    setFeedbackIsError(false)
    setIsSubmitting(true)

    try {
      const response = await api.post("/doctors/login", {
        identifier,
        password,
      })

      login(getResponseData(response).token)
      navigate("/dashboard")
    } catch (error) {
      setFeedbackIsError(true)
      setFeedback(getErrorMessage(error))
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="app-shell login-page login-page-centered">
      <div className="login-card monitor-card">
        <div className="login-layout">
          <aside className="login-aside">
            <div className="flex items-center justify-between gap-3">
              <p className="login-brand">MedStream Console</p>
              <Link className="auth-link" to="/">
                {"Back home"}
              </Link>
            </div>
            <h1 className="login-title">{"Doctor Access"}</h1>
            <p className="login-subtitle">{"Authenticate into the operations console to monitor vitals, review alerts, and manage patient workflows."}</p>
            <div className="auth-metrics">
              <div className="auth-metric">
                <p className="auth-metric-label">Workspace</p>
                <p className="auth-metric-value">Clinical Operations</p>
                <p className="auth-metric-copy">A single console for admissions, alerting, and patient review.</p>
              </div>
              <div className="auth-metric">
                <p className="auth-metric-label">Availability</p>
                <p className="auth-metric-value">Live Signal Feed</p>
                <p className="auth-metric-copy">Vitals and alerts continue updating while you work.</p>
              </div>
            </div>
          </aside>

          <div className="auth-divider" aria-hidden="true"/>
          <div className="hidden lg:block w-px bg-[#2a3441] mx-6"/>

          <div className="login-panel">
            <div className="login-header">
              <p className="login-brand">{"Sign In"}</p>
              <h1 className="login-title">{"Doctor Login"}</h1>
              <p className="login-subtitle">{"Secure access to the hospital monitoring console."}</p>
            </div>

            <form className="login-form" onSubmit={handleSubmit}>

              <div className="login-field">
                <input
                  id="identifier"
                  type="text"
                  value={identifier}
                  onChange={(event) => setIdentifier(event.target.value)}
                  className="login-input"
                  placeholder={"Enter your email or phone number"}
                  required
                />
              </div>

              <div className="login-field">
                <input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  className="login-input"
                  placeholder={"Enter your password"}
                  required
                />
              </div>

              <div className="flex items-center justify-between gap-3 text-sm">
                <Link className="auth-link" to="/forgot-password">
                  {"Forgot password?"}
                </Link>
                <Link className="auth-link" to="/recover-account">
                  {"Recover account"}
                </Link>
              </div>

              {feedback && (
                <p className={feedbackIsError ? "login-error" : "login-success"}>
                  {feedback}
                </p>
              )}

              <button
                type="submit"
                disabled={!isLoginValid || isSubmitting}
                className="login-button"
              >
                {isSubmitting ? ("Signing in...") : ("Login")}
              </button>

              <div className="flex items-center justify-between gap-3 text-sm">
                <Link className="auth-link" to="/register">
                  {"Need an account? Register"}
                </Link>
                <Link className="auth-link" to="/">
                  {"Return home"}
                </Link>
              </div>
            </form>
          </div>
        </div>
      </div>
    </div>
  )
}
