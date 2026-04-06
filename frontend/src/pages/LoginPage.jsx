import { useState } from "react"
import { useNavigate } from "react-router-dom"
import { useAuth } from "../auth/AuthContext"
import { api } from "../services/api"

export default function LoginPage() {
  const navigate = useNavigate()
  const { login } = useAuth()
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState("")
  const [isSubmitting, setIsSubmitting] = useState(false)

  const handleSubmit = async (event) => {
    event.preventDefault()
    setError("")
    setIsSubmitting(true)

    try {
      const response = await api.post("/doctors/login", {
        email,
        password,
      })

      login(response.data.token)
      navigate("/dashboard")
    } catch {
      setError("Invalid email or password")
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="login-page">
      <div className="login-card monitor-card">
        <div className="login-header">
          <p className="login-brand">MedStream</p>
          <h1 className="login-title">Doctor Login</h1>
          <p className="login-subtitle">Secure access to real-time hospital monitoring.</p>
        </div>

        <form className="login-form" onSubmit={handleSubmit}>
          <div className="login-field">
            <label className="login-label" htmlFor="email">
              Email
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
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
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="login-input"
              required
            />
          </div>

          {error && (
            <p className="login-error">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={isSubmitting}
            className="login-button"
          >
            {isSubmitting ? "Signing in..." : "Login"}
          </button>

          <Link className="auth-link" to="/register">
            Need an account? Register
          </Link>
        </form>
      </div>
    </div>
  )
}
