import { Link } from "react-router-dom"

export default function HomePage() {
  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-8 text-slate-100">
      <div className="monitor-card w-full max-w-2xl rounded-[28px] px-8 py-12 text-center sm:px-12">
        <p className="text-xs font-semibold uppercase tracking-[0.35em] text-cyan-300">Hospital Operations</p>
        <h1 className="mt-4 text-4xl font-semibold tracking-tight text-white sm:text-5xl">MedStream</h1>
        <p className="mx-auto mt-4 max-w-xl text-base text-slate-300 sm:text-lg">
          Real-time hospital monitoring system
        </p>
        <div className="mt-10 flex flex-col justify-center gap-4 sm:flex-row">
          <Link
            className="rounded-2xl bg-cyan-400 px-6 py-3 font-semibold text-slate-950 transition hover:bg-cyan-300"
            to="/login"
          >
            Login as Doctor
          </Link>
          <Link
            className="rounded-2xl border border-slate-600 bg-slate-900/70 px-6 py-3 font-semibold text-slate-100 transition hover:border-slate-500 hover:bg-slate-800"
            to="/dashboard"
          >
            View Dashboard
          </Link>
        </div>
      </div>
    </div>
  )
}
