import {useEffect, useState} from "react"
import {Link, useNavigate, useSearchParams} from "react-router-dom"
import {resendVerificationEmail, verifyEmailToken} from "../services/authApi.js"
import {getErrorMessage, getResponseMessage} from "../services/apiMessages.js"
import {VERIFICATION_LINK_EXPIRED_MESSAGE} from "../services/appMessages.js"

export default function VerifyEmailPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const token = searchParams.get("token")
  const [message, setMessage] = useState("")
  const [isError, setIsError] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [showResendButton, setShowResendButton] = useState(false)
  const [isResending, setIsResending] = useState(false)

  useEffect(() => {
    let active = true

    const verify = async () => {
      try {
        const response = await verifyEmailToken(token)

        if (!active) {
          return
        }

        setMessage(getResponseMessage(response))
        setIsError(false)
        setShowResendButton(false)
        window.setTimeout(() => {
          navigate("/dashboard")
        }, 1200)
      } catch (error) {
        if (!active) {
          return
        }

        const nextMessage = getErrorMessage(error)
        setMessage(nextMessage)
        setIsError(true)
        setShowResendButton(nextMessage === VERIFICATION_LINK_EXPIRED_MESSAGE)
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
  }, [navigate, token])

  const handleResend = async () => {
    if (isResending || !showResendButton) {
      return
    }

    setIsResending(true)
    try {
      const response = await resendVerificationEmail({token})
      setIsError(false)
      setShowResendButton(false)
      setMessage(getResponseMessage(response))
    } catch (error) {
      setMessage(getErrorMessage(error))
      setIsError(true)
    } finally {
      setIsResending(false)
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
                {isLoading ? "Loading..." : message}
              </p>

              <div className="auth-actions">
                {showResendButton && (
                  <button
                    type="button"
                    className="login-button"
                    disabled={isResending}
                    onClick={handleResend}
                  >
                    {isResending ? "Sending..." : "Resend verification email"}
                  </button>
                )}
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
