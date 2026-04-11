import {Link} from "react-router-dom"
import {useAuth} from "../auth/AuthContext"

export default function HomePage() {
  const {isAuthenticated} = useAuth()

  return (
    <div className="app-shell flex min-h-screen items-center justify-center px-4 py-8 text-slate-100">
      <div className="monitor-card w-full max-w-5xl rounded-[24px] overflow-hidden">
        <div className="grid lg:grid-cols-[1.15fr_0.85fr]">
          <div className="border-b border-[#3b424b] bg-[#1b2430] px-8 py-12 lg:border-b-0 lg:border-r lg:px-12">
            <p className="console-eyebrow text-xs font-semibold uppercase tracking-[0.32em]">{"Operations Console"}</p>
            <h1 className="mt-4 text-4xl font-semibold tracking-tight text-white sm:text-5xl">MedStream Console</h1>
            <p className="mt-4 max-w-2xl text-base text-[#b6bec9] sm:text-lg">
              {"Hospital monitoring presented as a structured operations workspace with live vitals, alerts, admissions, and patient movement in one console."}
            </p>
            <div className="mt-8 grid gap-4 sm:grid-cols-3">
              <div className="monitor-panel rounded-[18px] p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[#879196]">{"Monitoring"}</p>
              <p className="mt-3 text-lg font-semibold text-white">{"Live streams"}</p>
            </div>
            <div className="monitor-panel rounded-[18px] p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[#879196]">{"Alerting"}</p>
              <p className="mt-3 text-lg font-semibold text-white">{"Instant escalation"}</p>
            </div>
            <div className="monitor-panel rounded-[18px] p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[#879196]">{"Operations"}</p>
              <p className="mt-3 text-lg font-semibold text-white">{"Department flow"}</p>
            </div>
          </div>
        </div>
          <div className="px-8 py-12 lg:px-10">
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs font-semibold uppercase tracking-[0.28em] text-[#879196]">{"Start Session"}</p>
              <div className="flex items-center gap-2">
                <Link className="console-link text-sm font-semibold" to="/">
                  {"Home"}
                </Link>
                {!isAuthenticated && (
                  <Link className="console-link text-sm font-semibold" to="/login">
                    {"Doctor login"}
                  </Link>
                )}
              </div>
            </div>
            <h2 className="mt-3 text-3xl font-semibold text-white">{"Choose an entry point"}</h2>
            <p className="mt-3 text-sm leading-7 text-[#b6bec9]">
              {"Access the operations dashboard, authenticate as a doctor, and move into live monitoring without leaving the MedStream workflow."}
            </p>
            <div className="mt-8 flex flex-col gap-4">
              <Link
                className="console-button-primary rounded-xl px-6 py-3 text-center"
                to={isAuthenticated ? "/dashboard" : "/login"}
              >
                {isAuthenticated ? ("Open Monitoring Dashboard") : ("Login as Doctor")}
              </Link>
              <Link
                className="console-button-secondary rounded-xl px-6 py-3 text-center font-semibold"
                to={isAuthenticated ? "/dashboard" : "/register"}
              >
                {isAuthenticated ? ("Go to Patient Operations") : ("Create Doctor Account")}
              </Link>
              <Link
                className="console-link text-sm font-semibold"
                to={isAuthenticated ? "/login" : "/register"}
              >
                {isAuthenticated ? ("Switch account") : ("New to MedStream? Register")}
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
