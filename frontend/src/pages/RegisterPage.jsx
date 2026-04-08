import { useState } from "react"
import { Link, useNavigate } from "react-router-dom"
import { api } from "../services/api"

export default function RegisterPage() {
  const navigate = useNavigate()
  const [form, setForm] = useState({
    first_name: "",
    last_name: "",
    email: "",
    password: "",
    specialization: "",
    license_number: "",
  })
  const [message, setMessage] = useState("")
  const [isError, setIsError] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const handleChange = (event) => {
    const { name, value } = event.target
    setForm((prev) => ({ ...prev, [name]: value }))
  }

  const handleSubmit = async (event) => {
    event.preventDefault()
    setMessage("")
    setIsError(false)
    setIsSubmitting(true)

    try {
      await api.post("/register", form)
      navigate("/login", {
        state: {
          message: "Account created. Sign in to open the MedStream dashboard.",
        },
      })
    } catch (error) {
      setIsError(true)
      setMessage(error.response?.data?.detail || "Unable to create account")
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="app-shell login-page register-page">
      <div className="login-card monitor-card">
        <div className="login-layout">
          <aside className="login-aside">
            <div className="flex items-center justify-between gap-3">
              <p className="login-brand">MedStream Console</p>
              <Link className="auth-link" to="/">
                Back home
              </Link>
            </div>
            <h1 className="login-title">Create Doctor Account</h1>
            <p className="login-subtitle">Provision a clinician account for access to monitoring, alerts, and patient operations.</p>
            <div className="auth-metrics">
              <div className="auth-metric">
                <p className="auth-metric-label">Identity</p>
                <p className="auth-metric-value">Named clinician record</p>
                <p className="auth-metric-copy">First name, last name, email, specialization, and license are stored together.</p>
              </div>
              <div className="auth-metric">
                <p className="auth-metric-label">Outcome</p>
                <p className="auth-metric-value">Console-ready access</p>
                <p className="auth-metric-copy">Registration leads directly to the login flow for dashboard entry.</p>
              </div>
            </div>
          </aside>

          <div className="login-panel">
            <div className="login-header">
              <p className="login-brand">Registration</p>
              <h1 className="login-title">Doctor Registration</h1>
              <p className="login-subtitle">Enter account and professional details to activate console access.</p>
            </div>

            <form className="login-form" onSubmit={handleSubmit}>
              <div className="auth-section">
                <div className="auth-section-header">
                  <p className="auth-section-label">Account Details</p>
                  <p className="auth-section-copy">Basic identity and sign-in information.</p>
                </div>

                <div className="register-grid">
                  <div className="login-field">
                    <label className="login-label" htmlFor="first_name">
                      First Name
                    </label>
                    <input
                      id="first_name"
                      name="first_name"
                      type="text"
                      value={form.first_name}
                      onChange={handleChange}
                      className="login-input"
                      required
                    />
                  </div>

                  <div className="login-field">
                    <label className="login-label" htmlFor="last_name">
                      Last Name
                    </label>
                    <input
                      id="last_name"
                      name="last_name"
                      type="text"
                      value={form.last_name}
                      onChange={handleChange}
                      className="login-input"
                      required
                    />
                  </div>
                </div>

                <div className="login-field">
                  <label className="login-label" htmlFor="email">
                    Email
                  </label>
                  <input
                    id="email"
                    name="email"
                    type="email"
                    value={form.email}
                    onChange={handleChange}
                    className="login-input"
                    required
                  />
                </div>

                <div className="login-field">
                  <label className="login-label" htmlFor="password">
                    Password
                  </label>
                  <input
                    id="password"
                    name="password"
                    type="password"
                    value={form.password}
                    onChange={handleChange}
                    className="login-input"
                    required
                  />
                </div>
              </div>

              <div className="auth-section">
                <div className="auth-section-header">
                  <p className="auth-section-label">Professional Details</p>
                  <p className="auth-section-copy">Clinical role and license information.</p>
                </div>

                <div className="register-grid">
                  <div className="login-field">
                    <label className="login-label" htmlFor="specialization">
                      Specialization
                    </label>
                    <input
                      id="specialization"
                      name="specialization"
                      type="text"
                      value={form.specialization}
                      onChange={handleChange}
                      className="login-input"
                      required
                    />
                  </div>

                  <div className="login-field">
                    <label className="login-label" htmlFor="license_number">
                      License Number
                    </label>
                    <input
                      id="license_number"
                      name="license_number"
                      type="text"
                      value={form.license_number}
                      onChange={handleChange}
                      className="login-input"
                      required
                    />
                  </div>
                </div>
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
                  {isSubmitting ? "Creating account..." : "Create Account"}
                </button>

                <div className="flex items-center justify-between gap-3 text-sm">
                  <Link className="auth-link" to="/login">
                    Already have an account? Login
                  </Link>
                  <Link className="auth-link" to="/">
                    Return home
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
