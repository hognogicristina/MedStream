import {useState} from "react"
import {Link, useNavigate} from "react-router-dom"
import {api} from "../services/api"

export default function ForgotPasswordPage() {
  const navigate = useNavigate()
  const [identifier, setIdentifier] = useState("")
  const [message, setMessage] = useState("")
  const [isError, setIsError] = useState(false)
  const [resetToken, setResetToken] = useState("")
  const [isSubmitting, setIsSubmitting] = useState(false)

  const handleSubmit = async (event) => {
    event.preventDefault()
    setMessage("")
    setIsError(false)
    setResetToken("")
    setIsSubmitting(true)

    try {
      const response = await api.post("/doctors/password-reset/request", {
        identifier,
      })

      setMessage("Password reset requested successfully. Use the generated token below to continue.")
      setResetToken(response.data.reset_token)
    } catch (error) {
      setIsError(true)
      setMessage(error.response?.data?.detail || "Unable to request password reset.")
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
                Back home
              </Link>
            </div>
            <h1 className="login-title">Password Recovery</h1>
            <p className="login-subtitle">Request a reset token using your doctor email or phone number, then continue to reset the account
              password.</p>
            <div className="auth-metrics">
              <div className="auth-metric">
                <p className="auth-metric-label">Identifier</p>
                <p className="auth-metric-value">Email or phone</p>
                <p className="auth-metric-copy">Use the doctor account identity that was registered in MedStream.</p>
              </div>
              <div className="auth-metric">
                <p className="auth-metric-label">Outcome</p>
                <p className="auth-metric-value">Reset token issued</p>
                <p className="auth-metric-copy">The backend simulates email and SMS delivery while also returning the token for local
                  development.</p>
              </div>
            </div>
          </aside>

          <div className="login-panel">
            <div className="login-header">
              <p className="login-brand">Recovery</p>
              <h1 className="login-title">Forgot Password</h1>
              <p className="login-subtitle">Request a password reset token to regain access.</p>
            </div>

            <form className="login-form" onSubmit={handleSubmit}>
              <div className="login-field">
                <label className="login-label" htmlFor="identifier">
                  Email or Phone
                </label>
                <input
                  id="identifier"
                  type="text"
                  value={identifier}
                  onChange={(event) => setIdentifier(event.target.value)}
                  className="login-input"
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
                    <p className="auth-section-label">Reset Token</p>
                    <p className="auth-section-copy break-all">{resetToken}</p>
                  </div>
                  <button
                    type="button"
                    className="console-button-primary w-full rounded-2xl px-4 py-3 font-semibold"
                    onClick={() => navigate("/reset-password", {state: {token: resetToken}})}
                  >
                    Continue to Reset Password
                  </button>
                </div>
              )}

              <div className="auth-actions">
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="login-button"
                >
                  {isSubmitting ? "Requesting..." : "Request Password Reset"}
                </button>

                <div className="flex items-center justify-between gap-3 text-sm">
                  <Link className="auth-link" to="/login">
                    Back to login
                  </Link>
                  <Link className="auth-link" to="/recover-account">
                    Recover account
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
