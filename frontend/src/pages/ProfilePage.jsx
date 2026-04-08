import { useEffect, useState } from "react"
import BackButton from "../components/BackButton"
import { useAuth } from "../auth/AuthContext"
import { api } from "../services/api"

export default function ProfilePage() {
  const { token } = useAuth()
  const [doctor, setDoctor] = useState(null)
  const [isLoading, setIsLoading] = useState(true)
  const [message, setMessage] = useState("")

  useEffect(() => {
    const loadDoctor = async () => {
      if (!token) {
        setMessage("No authenticated doctor session is available.")
        setIsLoading(false)
        return
      }

      setMessage("")
      setIsLoading(true)

      try {
        const response = await api.get("/doctors/me", {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        })
        setDoctor(response.data)
      } catch (error) {
        setDoctor(null)
        setMessage(error.response?.data?.detail || "Unable to load doctor profile.")
      } finally {
        setIsLoading(false)
      }
    }

    loadDoctor()
  }, [token])

  return (
    <div className="app-shell min-h-screen px-4 py-6 text-slate-100 sm:px-6 lg:px-8">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
        <header className="console-topbar rounded-[24px] p-6 sm:p-8">
          <div className="flex flex-col gap-3">
            <div className="flex items-start justify-between gap-4">
              <p className="text-xs font-semibold uppercase tracking-[0.35em] text-[#ff9900]">Doctor Workspace</p>
              <BackButton />
            </div>
            <div>
              <h1 className="text-3xl font-semibold tracking-tight text-white sm:text-4xl">Doctor Profile</h1>
              <p className="mt-2 max-w-2xl text-sm text-[#b6bec9] sm:text-base">Current authenticated doctor record.</p>
            </div>
          </div>
        </header>

        {message && (
          <div className="login-error">{message}</div>
        )}

        <section className="monitor-card rounded-[28px] p-6">
          {isLoading ? (
            <div className="rounded-2xl border border-[#3b424b] bg-[#151b22] px-4 py-5 text-sm text-[#b6bec9]">
              Loading doctor profile...
            </div>
          ) : doctor ? (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
              <div className="monitor-panel rounded-[24px] p-5 lg:col-span-2">
                <p className="text-xs uppercase tracking-[0.25em] text-[#879196]">First Name</p>
                <p className="mt-3 text-2xl font-semibold text-white">{doctor.first_name}</p>
                <p className="mt-4 text-xs uppercase tracking-[0.25em] text-[#879196]">Last Name</p>
                <p className="mt-2 text-2xl font-semibold text-white">{doctor.last_name}</p>
              </div>

              <div className="monitor-panel rounded-[24px] p-5 lg:col-span-3">
                <p className="text-xs uppercase tracking-[0.25em] text-[#879196]">Email</p>
                <p className="mt-3 break-all text-lg font-semibold text-white">{doctor.email}</p>
                <div className="mt-5 grid gap-4 sm:grid-cols-2">
                  <div>
                    <p className="text-xs uppercase tracking-[0.25em] text-[#879196]">Specialization</p>
                    <p className="mt-2 text-xl font-semibold text-white">{doctor.specialization}</p>
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-[0.25em] text-[#879196]">License Number</p>
                    <p className="mt-2 text-xl font-semibold text-white">{doctor.license_number}</p>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="rounded-2xl border border-[#3b424b] bg-[#151b22] px-4 py-5 text-sm text-[#b6bec9]">
              No doctor profile information is available for this session.
            </div>
          )}
        </section>
      </div>
    </div>
  )
}
