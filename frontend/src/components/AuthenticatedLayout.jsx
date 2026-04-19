import {useEffect} from "react"
import {Outlet} from "react-router-dom"
import {useAuth} from "../auth/AuthContext"
import {useNotifications} from "./NotificationProvider"
import {api} from "../services/api"
import {getResponseData} from "../services/apiMessages"
import Navbar from "./Navbar"

export default function AuthenticatedLayout() {
  const {token} = useAuth()
  const {notifyError} = useNotifications()

  useEffect(() => {
    if (!token) {
      return
    }

    let isMounted = true

    const checkVerification = async () => {
      try {
        const response = await api.get("/doctors/me", {
          headers: {Authorization: `Bearer ${token}`},
        })

        if (!isMounted) {
          return
        }

        const doctor = getResponseData(response)
        if (doctor?.email_confirmed === false) {
          notifyError("Please verify your email.", 5000)
        }
      } catch {
      }
    }

    checkVerification()
    const intervalId = window.setInterval(checkVerification, 5 * 60 * 1000)

    return () => {
      isMounted = false
      window.clearInterval(intervalId)
    }
  }, [notifyError, token])

  return (
    <div className="min-h-screen">
      <Navbar/>
      <Outlet/>
    </div>
  )
}
