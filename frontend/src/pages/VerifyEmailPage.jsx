import {useEffect, useState} from "react"
import {Link, useNavigate, useSearchParams} from "react-router-dom"
import {api} from "../services/api"
import {getErrorMessage, getResponseMessage} from "../services/apiMessages"

export default function VerifyEmailPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const [message, setMessage] = useState("")
  const [isError, setIsError] = useState(false)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    const token = searchParams.get("token")

    if (!token) {
      setMessage("Verification token is missing.")
      setIsError(true)
      setIsLoading(false)
      return
    }

    let active = true

    const verify = async () => {
      try {
        const response = await api.get("/auth/verify-email", {
          params: {token},
        })

        if (!active) {
          return
        }

        setMessage(getResponseMessage(response))
        setIsError(false)
      } catch (error) {
        if (!active) {
          return
        }

        setMessage(getErrorMessage(error))
        setIsError(true)
      } finally {
        if (active) {
          setIsLoading(false)
        }
      }
    }

    verify()

    return () => {
      active = false
    }
  }, [searchParams])

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
            <h1 className="login-title">{"Email Verification"}</h1>
            <p className="login-subtitle">{"Confirm your doctor account email using the secure verification link."}</p>
          </aside>

          <div className="auth-divider" aria-hidden="true"/>
          <div className="hidden lg:block w-px bg-[#2a3441] mx-6"/>

          <div className="login-panel">
            <div className="login-header">
              <p className="login-brand">{"Verification"}</p>
              <h1 className="login-title">{"Verify Email"}</h1>
              <p className="login-subtitle">{"Your verification request is being processed."}</p>
            </div>

            <div className="login-form">
              <p className={isLoading ? "login-success" : isError ? "login-error" : "login-success"}>
                {isLoading ? "Verifying email..." : message}
              </p>

              <div className="auth-actions">
                <button
                  type="button"
                  className="login-button"
                  onClick={() => navigate("/login")}
                >
                  {"Go to Login"}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
