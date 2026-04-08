import {useState} from "react"
import {Link} from "react-router-dom"
import {api} from "../services/api"

export default function RecoverAccountPage() {
  const [identifier, setIdentifier] = useState("")
  const [message, setMessage] = useState("")
  const [isError, setIsError] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const handleSubmit = async (event) => {
    event.preventDefault()
    setMessage("")
    setIsError(false)
    setIsSubmitting(true)

    try {
      await api.post("/doctors/password-reset/request", {
        identifier,
      })
    } catch {
    } finally {
      setMessage("If an account exists, a recovery link was sent")
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
            <h1 className="login-title">Account Recovery</h1>
            <p className="login-subtitle">Request an account recovery link using the doctor email or phone number associated with
              MedStream.</p>
            <div className="auth-metrics">
              <div className="auth-metric">
                <p className="auth-metric-label">Identifier</p>
                <p className="auth-metric-value">Email or phone</p>
                <p className="auth-metric-copy">Use the doctor account identity already registered in MedStream.</p>
              </div>
              <div className="auth-metric">
                <p className="auth-metric-label">Outcome</p>
                <p className="auth-metric-value">Recovery link sent</p>
                <p className="auth-metric-copy">The request follows the same single-step flow as password recovery.</p>
              </div>
            </div>
          </aside>

          <div className="login-panel">
            <div className="login-header">
              <p className="login-brand">Recovery</p>
              <h1 className="login-title">Recover Account</h1>
              <p className="login-subtitle">Enter email or phone to start account recovery.</p>
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

              <div className="auth-actions">
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="login-button"
                >
                  {isSubmitting ? "Requesting..." : "Recover Account"}
                </button>

                <div className="flex items-center justify-between gap-3 text-sm">
                  <Link className="auth-link" to="/login">
                    Back to login
                  </Link>
                  <Link className="auth-link" to="/forgot-password">
                    Forgot password?
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
