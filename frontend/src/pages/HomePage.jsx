import {Link} from "react-router-dom"
import {useAuth} from "../components/AuthContext.jsx"

export default function HomePage() {
  const {isAuthenticated} = useAuth()

  return (
    <div className="app-shell auth-home-page">
      <header className="auth-home-topbar">
        <Link className="auth-home-brand" to="/">
          <span className="auth-home-brand-mark" aria-hidden="true">+</span>
          <span>MedStream</span>
        </Link>
        <nav className="auth-home-nav" aria-label="Public navigation">
          {isAuthenticated ? (
            <Link className="auth-link" to="/dashboard">Dashboard</Link>
          ) : (
            <>
              <Link className="auth-link" to="/login">Login</Link>
              <Link className="auth-home-primary-link" to="/register">Register</Link>
            </>
          )}
        </nav>
      </header>

      <main className="auth-home-main">
        <section className="auth-home-hero monitor-card">
          <div className="auth-home-copy">
            <p className="login-brand">Clinical monitoring console</p>
            <h1 className="login-title">MedStream patient monitoring and analytics</h1>
            <p className="login-subtitle">
              A compact console for real-time vitals, clinical alerts, batch analytics, and patient workflow review.
            </p>
            <div className="auth-home-actions">
              <Link className="login-button auth-home-button" to={isAuthenticated ? "/dashboard" : "/login"}>
                {isAuthenticated ? "Open dashboard" : "Doctor login"}
              </Link>
              {!isAuthenticated && (
                <Link className="console-button-secondary auth-home-button" to="/register">
                  Create account
                </Link>
              )}
            </div>
          </div>

          <div className="auth-home-summary">
            <div className="auth-metric">
              <p className="auth-metric-label">Streaming</p>
              <p className="auth-metric-value">Live vitals</p>
              <p className="auth-metric-copy">Patient measurements and alerts are reviewed from a single operational surface.</p>
            </div>
            <div className="auth-metric">
              <p className="auth-metric-label">Batch</p>
              <p className="auth-metric-value">Trend analytics</p>
              <p className="auth-metric-copy">Aggregated metrics support stable academic and clinical demonstrations.</p>
            </div>
            <div className="auth-metric">
              <p className="auth-metric-label">Safety</p>
              <p className="auth-metric-value">Critical alerts</p>
              <p className="auth-metric-copy">Critical states are labeled explicitly and never rely only on color.</p>
            </div>
          </div>
        </section>
      </main>
    </div>
  )
}
