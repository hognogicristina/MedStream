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
      navigate("/login")
    } catch (error) {
      setIsError(true)
      setMessage(error.response?.data?.detail || "Unable to create account")
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="login-page">
      <div className="login-card monitor-card">
        <div className="login-header">
          <p className="login-brand">MedStream</p>
          <h1 className="login-title">Doctor Registration</h1>
          <p className="login-subtitle">Create a doctor account to access the hospital monitoring dashboard.</p>
        </div>

        <form className="login-form" onSubmit={handleSubmit}>
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

          {message && (
            <p className={isError ? "login-error" : "login-success"}>
              {message}
            </p>
          )}

          <button
            type="submit"
            disabled={isSubmitting}
            className="login-button"
          >
            {isSubmitting ? "Creating account..." : "Create Account"}
          </button>

          <Link className="auth-link" to="/login">
            Already have an account? Login
          </Link>
        </form>
      </div>
    </div>
  )
}
