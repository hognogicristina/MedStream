import {Outlet, useLocation} from "react-router-dom"
import Navbar from "./Navbar.jsx"
import {useCallback, useEffect, useMemo, useState} from "react"
import {useAuth} from "./AuthContext.jsx"
import {resendVerificationEmail} from "../services/authApi.js"
import {getCurrentDoctor} from "../services/doctorApi.js"
import {getErrorMessage, getResponseData, getResponseMessage} from "../services/apiMessages.js"
import {useNotifications} from "./NotificationProvider.jsx"

const EMAIL_NOT_VERIFIED_WARNING = "Your email is not verified. Please verify your email."
const EMAIL_WARNING_INTERVAL_MS = 15000

export default function AuthenticatedLayout() {
  const location = useLocation()
  const {token} = useAuth()
  const {notifyError, notifySuccess, notifyWarning} = useNotifications()
  const [doctor, setDoctor] = useState(null)
  const [isResending, setIsResending] = useState(false)

  const authHeaders = useMemo(() => token ? {Authorization: `Bearer ${token}`} : undefined, [token])

  useEffect(() => {
    if (!authHeaders) {
      setDoctor(null)
      return
    }

    let active = true
    const loadDoctor = async () => {
      try {
        const response = await getCurrentDoctor(authHeaders)
        if (!active) {
          return
        }
        setDoctor(getResponseData(response))
      } catch (error) {
        void error
      }
    }

    loadDoctor()

    return () => {
      active = false
    }
  }, [authHeaders, location.pathname])

  const showResend = Boolean(doctor?.email_confirmed === false && doctor?.email_verification_expired)

  const handleResend = useCallback(async () => {
    if (!authHeaders || isResending || !showResend) {
      return
    }

    setIsResending(true)
    try {
      const response = await resendVerificationEmail({headers: authHeaders})
      notifySuccess(getResponseMessage(response))
      const doctorResponse = await getCurrentDoctor(authHeaders)
      setDoctor(getResponseData(doctorResponse))
    } catch (error) {
      notifyError(getErrorMessage(error))
    } finally {
      setIsResending(false)
    }
  }, [authHeaders, isResending, notifyError, notifySuccess, showResend])

  useEffect(() => {
    if (!doctor || doctor.email_confirmed) {
      return
    }

    const intervalId = window.setInterval(() => {
      notifyWarning(
        EMAIL_NOT_VERIFIED_WARNING,
        EMAIL_WARNING_INTERVAL_MS - 1000,
        {
          dedupeKey: "email-not-verified-warning",
          actionLabel: showResend ? (isResending ? "Sending..." : "Resend email") : "",
          onAction: showResend && !isResending ? handleResend : null,
        },
      )
    }, EMAIL_WARNING_INTERVAL_MS)

    return () => {
      window.clearInterval(intervalId)
    }
  }, [doctor?.email_confirmed, handleResend, isResending, notifyWarning, showResend])

  return (
    <div className="min-h-screen">
      <Navbar/>
      <Outlet/>
    </div>
  )
}
