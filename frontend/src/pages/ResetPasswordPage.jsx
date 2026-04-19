import {useMemo, useState} from "react"
import {Link, useNavigate, useSearchParams} from "react-router-dom"
import {useNotifications} from "../components/NotificationProvider"
import {api} from "../services/api"
import {getErrorMessage, getResponseMessage} from "../services/apiMessages"

export default function ResetPasswordPage() {
  const navigate = useNavigate()
  const {notifySuccess, notifyError} = useNotifications()
  const [searchParams] = useSearchParams()
  const token = useMemo(() => searchParams.get("token") || "", [searchParams])
  const [newPassword, setNewPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [message, setMessage] = useState("")
  const [isError, setIsError] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const canResetPassword = token.trim().length > 0 && newPassword.trim().length > 0 && confirmPassword.trim().length > 0

  const handleSubmit = async (event) => {
    event.preventDefault()
    if (!canResetPassword || isSubmitting) {
      return
    }
    setMessage("")
    setIsError(false)
    setIsSubmitting(true)

    try {
      const response = await api.post("/auth/reset-password", {
        token,
        new_password: newPassword,
        confirm_password: confirmPassword,
      })

      notifySuccess(getResponseMessage(response))
      navigate("/login", {
        state: {
          message: getResponseMessage(response),
        },
      })
    } catch (error) {
      setIsError(true)
      setMessage(getErrorMessage(error))
      notifyError(getErrorMessage(error))
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
            <h1 className="login-title">{"Reset Doctor Password"}</h1>
            <p className="login-subtitle">{"Complete the secure reset flow from the email you received."}</p>
            <div className="auth-metrics">
              <div className="auth-metric">
                <p className="auth-metric-label">Secure</p>
                <p className="auth-metric-value">Email-based reset link</p>
                <p className="auth-metric-copy">The reset token is validated on the backend before the password is changed.</p>
              </div>
              <div className="auth-metric">
                <p className="auth-metric-label">Security</p>
                <p className="auth-metric-value">New password required</p>
                <p className="auth-metric-copy">A successful reset invalidates the token and stores a new password hash.</p>
              </div>
            </div>
          </aside>

          <div className="auth-divider" aria-hidden="true"/>
          <div className="hidden lg:block w-px bg-[#2a3441] mx-6" />

          <div className="login-panel">
            <div className="login-header">
              <p className="login-brand">{"Recovery"}</p>
              <h1 className="login-title">{"Reset Password"}</h1>
              <p className="login-subtitle">{"Choose a new password for your account."}</p>
            </div>

            <form className="login-form" onSubmit={handleSubmit}>
              <div className="login-field">
                <label className="login-label" htmlFor="new_password">
                  {"New Password"}
                </label>
                <input
                  id="new_password"
                  type="password"
                  value={newPassword}
                  onChange={(event) => setNewPassword(event.target.value)}
                  className="login-input"
                  placeholder={"Example: MedstreamSecure123"}
                  required
                />
              </div>

              <div className="login-field">
                <label className="login-label" htmlFor="confirm_password">
                  {"Confirm Password"}
                </label>
                <input
                  id="confirm_password"
                  type="password"
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                  className="login-input"
                  placeholder={"Repeat your new password"}
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
                  disabled={!canResetPassword || isSubmitting}
                  className="login-button"
                >
                  {isSubmitting ? ("Resetting...") : ("Reset Password")}
                </button>

                <div className="flex items-center justify-between gap-3 text-sm">
                  <Link className="auth-link" to="/forgot-password">
                    {"Request another reset email"}
                  </Link>
                  <Link className="auth-link" to="/login">
                    {"Back to login"}
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
