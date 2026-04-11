import {useState} from "react"
import {Link, useNavigate} from "react-router-dom"
import {api} from "../services/api"
import {getErrorMessage, getResponseData, getResponseMessage} from "../services/apiMessages"

export default function ForgotPasswordPage() {
  const navigate = useNavigate()
  const [identifier, setIdentifier] = useState("")
  const [message, setMessage] = useState("")
  const [isError, setIsError] = useState(false)
  const [resetToken, setResetToken] = useState("")
  const [isSubmitting, setIsSubmitting] = useState(false)
  const canRequestReset = identifier.trim().length > 0

  const handleSubmit = async (event) => {
    event.preventDefault()
    if (!canRequestReset || isSubmitting) {
      return
    }
    setMessage("")
    setIsError(false)
    setResetToken("")
    setIsSubmitting(true)

    try {
      const response = await api.post("/doctors/password-reset/request", {
        identifier,
      })

      setMessage(getResponseMessage(response))
      setResetToken(getResponseData(response).reset_token)
    } catch (error) {
      setIsError(true)
      setMessage(getErrorMessage(error))
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
            <h1 className="login-title">{"Password Recovery"}</h1>
            <p className="login-subtitle">{"Request a reset token using your doctor email or phone number, then continue to reset the account password."}</p>
            <div className="auth-metrics">
              <div className="auth-metric">
                <p className="auth-metric-label">Live</p>
                <p className="auth-metric-value">Continuous Tracking</p>
                <p className="auth-metric-copy">Every patient interaction is logged and displayed in real time.</p>
              </div>
              <div className="auth-metric">
                <p className="auth-metric-label">Scalable</p>
                <p className="auth-metric-value">Built to Grow</p>
                <p className="auth-metric-copy">The system is designed to handle increasing numbers of patients and data streams effortlessly.</p>
              </div>
            </div>
          </aside>

          <div className="auth-divider" aria-hidden="true"/>
          <div className="hidden lg:block w-px bg-[#2a3441] mx-6" />

          <div className="login-panel">
            <div className="login-header">
              <p className="login-brand">{"Recovery"}</p>
              <h1 className="login-title">{"Forgot Password"}</h1>
              <p className="login-subtitle">{"Request a password reset token to regain access."}</p>
            </div>

            <form className="login-form" onSubmit={handleSubmit}>
              <div className="login-field">
                <input
                  id="identifier"
                  type="text"
                  value={identifier}
                  onChange={(event) => setIdentifier(event.target.value)}
                  className="login-input"
                  placeholder={"Email address or phone number"}
                  required
                />
              </div>

              {message && (
                <p className={isError ? "login-error" : "login-success"}>
                  {message}
                </p>
              )}

              {resetToken && (
                <div className="auth-section">
                  <div className="auth-section-header">
                    <p className="auth-section-label">{"Reset Token"}</p>
                    <p className="auth-section-copy break-all">{resetToken}</p>
                  </div>
                  <button
                    type="button"
                    className="console-button-primary w-full rounded-2xl px-4 py-3 font-semibold"
                    onClick={() => navigate("/reset-password", {state: {token: resetToken}})}
                  >
                    {"Continue to Reset Password"}
                  </button>
                </div>
              )}

              <div className="auth-actions">
                <button
                  type="submit"
                  disabled={!canRequestReset || isSubmitting}
                  className="login-button"
                >
                  {isSubmitting ? ("Requesting...") : ("Request Password Reset")}
                </button>

                <div className="flex items-center justify-between gap-3 text-sm">
                  <Link className="auth-link" to="/login">
                    {"Back to login"}
                  </Link>
                  <Link className="auth-link" to="/recover-account">
                    {"Recover account"}
                  </Link>
                </div>
              </div>
            </form>
          </div>
        </div>
      </div>
    </div>
  )
}
