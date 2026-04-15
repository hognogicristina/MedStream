import {useEffect, useRef, useState} from "react"
import {NavLink, useLocation, useNavigate} from "react-router-dom"
import {useAuth} from "../auth/AuthContext"
import {getResponseData} from "../services/apiMessages.js";
import {api} from "../services/api";

function DepartmentsIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20" fill="none" className="h-5 w-5">
      <path
        d="M10 16.2 4.8 11.4a3.5 3.5 0 0 1 0-5 3.35 3.35 0 0 1 4.85.06L10 6.9l.35-.44a3.35 3.35 0 0 1 4.85-.06 3.5 3.5 0 0 1 0 5L10 16.2Z"
        stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M5.9 10h1.55l.95-1.6 1.35 3.1 1.15-2.15h3.2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"
            strokeLinejoin="round"/>
    </svg>
  )
}

function AlertIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20" fill="none" className="h-5 w-5">
      <path d="M10 4.5v6.5M10 14.5h.01M10 2.5l7 13H3l7-13Z" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"
            strokeLinejoin="round"/>
    </svg>
  )
}

function UserPlusIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20" fill="none" className="h-5 w-5">
      <path d="M14.5 7V3.5M12.75 5.25h3.5M5.5 15.5c0-2.1 1.9-3.5 4.5-3.5s4.5 1.4 4.5 3.5M10 10a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z"
            stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  )
}

function UserIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20" fill="none" className="h-5 w-5">
      <path d="M5.5 15.5c0-2.1 1.9-3.5 4.5-3.5s4.5 1.4 4.5 3.5M10 10a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z" stroke="currentColor" strokeWidth="1.7"
            strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  )
}

function NavTooltip({label, children}) {
  return (
    <div className="group relative flex items-center">
      {children}
      <span
        className="pointer-events-none absolute left-1/2 top-full z-50 mt-2 -translate-x-1/2 rounded-md border border-[#454c55] bg-[#0f141a] px-2 py-1 text-xs font-medium text-[#d5dbdb] opacity-0 transition-opacity duration-150 group-hover:opacity-100">
        {label}
      </span>
    </div>
  )
}

export default function Navbar() {
  const location = useLocation()
  const navigate = useNavigate()
  const {logout} = useAuth()
  const [openMenu, setOpenMenu] = useState("")
  const navRef = useRef(null)
  const [departments, setDepartments] = useState([])

  const handleLogout = () => {
    setOpenMenu("")
    logout()
    navigate("/")
  }

  const navLinkClassName = ({isActive}) =>
    `inline-flex h-11 w-11 items-center justify-center rounded-md ${isActive ? "console-button-primary" : "console-button-secondary"}`
  const departmentsActive = location.pathname.startsWith("/departments")
  const profileActive = location.pathname.startsWith("/profile")

  useEffect(() => {
    const handlePointerDown = (event) => {
      if (!navRef.current?.contains(event.target)) {
        setOpenMenu("")
      }
    }

    document.addEventListener("mousedown", handlePointerDown)

    return () => {
      document.removeEventListener("mousedown", handlePointerDown)
    }
  }, [])

  useEffect(() => {
    const loadDepartments = async () => {
      try {
        const res = await api.get("/departments")
        setDepartments(getResponseData(res))
      } catch {
      }
    }

    loadDepartments()
  }, [])

  return (
    <header className="sticky top-0 z-30 border-b border-[#3b424b] bg-[#16191f]">
      <div className="mx-auto flex w-full max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-4 sm:px-6 lg:px-8">
        <div className="flex items-center gap-4">
          <NavTooltip label={"Dashboard"}>
            <NavLink
              className={`text-xs font-semibold uppercase tracking-[0.35em] ${location.pathname === "/dashboard" ? "console-eyebrow" : "text-[#b6bec9]"}`}
              to="/dashboard">
              MedStream
            </NavLink>
          </NavTooltip>
        </div>

        <nav ref={navRef} className="flex flex-wrap items-center gap-2">

          <div className="relative flex items-center">
            <NavTooltip label={"Departments"}>
              <button
                type="button"
                aria-label={"Departments"}
                className={`inline-flex h-11 w-11 items-center justify-center rounded-md ${openMenu === "departments" ? "console-button-active" : departmentsActive ? "console-button-primary" : "console-button-secondary"}`}
                onClick={() => setOpenMenu((current) => current === "departments" ? "" : "departments")}
              >
                <DepartmentsIcon/>
                <span className="sr-only">{"Departments"}</span>
              </button>
            </NavTooltip>
            <div
              className={`absolute right-0 top-full z-40 mt-2 w-56 rounded-[16px] border border-[#3b424b] bg-[#161b22] p-2 ${openMenu === "departments" ? "pointer-events-auto opacity-100" : "pointer-events-none opacity-0"}`}>
              <div className="space-y-1 max-h-[200px] overflow-y-auto custom-scrollbar pr-1">
                {departments.map((department) => (
                  <NavLink
                    key={department}
                    className="block rounded-xl px-4 py-2 text-sm font-semibold text-[#d5dbdb] hover:bg-[#232f3e] hover:text-white"
                    to={`/departments/${encodeURIComponent(department)}`}
                    onClick={() => setOpenMenu("")}
                  >
                    {department}
                  </NavLink>
                ))}
              </div>
            </div>
          </div>

          <NavTooltip label={"Alerts"}>
            <NavLink aria-label={"Alerts"} className={navLinkClassName} to="/alerts">
              <AlertIcon/>
              <span className="sr-only">{"Alerts"}</span>
            </NavLink>
          </NavTooltip>

          <NavTooltip label={"Add Patient"}>
            <NavLink aria-label={"Add Patient"} className={navLinkClassName} to="/patients/new">
              <UserPlusIcon/>
              <span className="sr-only">{"Add Patient"}</span>
            </NavLink>
          </NavTooltip>

          <div className="relative flex items-center">
            <NavTooltip label={"Doctor Profile"}>
              <button
                type="button"
                aria-label={"Doctor Profile"}
                className={`inline-flex h-11 w-11 items-center justify-center rounded-md ${openMenu === "profile" ? "console-button-active" : profileActive ? "console-button-primary" : "console-button-secondary"}`}
                onClick={() => setOpenMenu((current) => current === "profile" ? "" : "profile")}
              >
                <UserIcon/>
                <span className="sr-only">{"Doctor Profile"}</span>
              </button>
            </NavTooltip>
            <div
              className={`absolute right-0 top-full z-40 mt-2 w-48 rounded-[16px] border border-[#3b424b] bg-[#161b22] p-2 ${openMenu === "profile" ? "pointer-events-auto opacity-100" : "pointer-events-none opacity-0"}`}>
              <div className="space-y-1">
                <NavLink
                  className="block rounded-xl px-4 py-2 text-sm font-semibold text-[#d5dbdb] hover:bg-[#232f3e] hover:text-white"
                  to="/profile"
                  onClick={() => setOpenMenu("")}
                >
                  {"Profile"}
                </NavLink>
                <button
                  className="block w-full rounded-xl px-4 py-2 text-left text-sm font-semibold text-[#d5dbdb] hover:bg-[#232f3e] hover:text-white"
                  onClick={handleLogout}
                >
                  {"Logout"}
                </button>
              </div>
            </div>
          </div>
        </nav>
      </div>
    </header>
  )
}
