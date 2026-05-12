import {useEffect, useMemo, useState} from "react"
import {useLocation, useNavigate} from "react-router-dom"
import {
  Button,
  SideNavigation,
  TopNavigation,
} from "@cloudscape-design/components"
import {useAuth} from "./AuthContext.jsx"
import {useTheme} from "./ThemeContext.jsx"
import {getResponseData} from "../services/apiMessages.js"
import {getDepartments} from "../services/patientApi.js"

function resolveActiveHref(pathname) {
  if (pathname.startsWith("/departments/")) {
    return pathname
  }
  if (pathname.startsWith("/metrics/streaming")) {
    return "/metrics/streaming"
  }
  if (pathname.startsWith("/metrics/batch")) {
    return "/metrics/batch"
  }
  if (pathname.startsWith("/metrics/comparison")) {
    return "/metrics/comparison"
  }
  if (pathname.startsWith("/alerts")) {
    return "/alerts"
  }
  if (pathname.startsWith("/how-it-works")) {
    return "/how-it-works"
  }
  if (pathname.startsWith("/patients/new") || pathname.startsWith("/patient/") || pathname.startsWith("/patients/")) {
    return "/patients/new"
  }
  return "/dashboard"
}

const RAIL_ITEMS = [
  {label: "Dashboard", href: "/dashboard", iconName: "settings"},
  {label: "Departments", href: "/departments", iconName: "folder"},
  {label: "Add Patient", href: "/patients/new", iconName: "user-profile"},
  {label: "Alerts", href: "/alerts", iconName: "notification"},
  {label: "Metrics", href: "/metrics/streaming", iconName: "gen-ai"},
]

function createNavigationItems(departments) {
  return [
    {type: "link", text: "Dashboard", href: "/dashboard"},
    {
      type: "section",
      text: "Departments",
      defaultExpanded: false,
      items: departments.map((department) => ({
        type: "link",
        text: department,
        href: `/departments/${encodeURIComponent(department)}`,
      })),
    },
    {type: "link", text: "Add Patient", href: "/patients/new"},
    {type: "link", text: "Alerts", href: "/alerts"},
    {
      type: "section",
      text: "Metrics",
      defaultExpanded: false,
      items: [
        {type: "link", text: "Live Monitoring", href: "/metrics/streaming"},
        {type: "link", text: "Batch Analytics", href: "/metrics/batch"},
        {type: "link", text: "Streaming vs Batch", href: "/metrics/comparison"},
      ],
    },
    {type: "link", text: "How it works", href: "/how-it-works"},
  ]
}

export function AppTopNavigation() {
  const navigate = useNavigate()
  const {logout} = useAuth()
  const {theme, toggleTheme} = useTheme()

  return (
    <TopNavigation
      identity={{
        href: "/dashboard",
        title: "MedStream",
        logo: {src: "/medstream-icon-small.svg", alt: "MedStream"},
      }}
      utilities={[
        {
          type: "button",
          text: theme === "light" ? "Light" : "Dark",
          onClick: toggleTheme,
        },
        {
          type: "menu-dropdown",
          text: "Account",
          items: [
            {id: "profile", text: "Profile"},
            {id: "logout", text: "Sign out"},
          ],
          onItemClick: ({detail}) => {
            if (detail.id === "profile") {
              navigate("/profile")
            }
            if (detail.id === "logout") {
              logout()
              navigate("/")
            }
          },
        },
      ]}
      i18nStrings={{
        searchIconAriaLabel: "Search",
        searchDismissIconAriaLabel: "Close search",
        overflowMenuTriggerText: "More",
        overflowMenuTitleText: "All",
      }}
    />
  )
}

export function AppSideNavigation({onCollapse}) {
  const navigate = useNavigate()
  const location = useLocation()
  const [departments, setDepartments] = useState([])

  const activeHref = useMemo(() => resolveActiveHref(location.pathname), [location.pathname])
  const navItems = useMemo(() => createNavigationItems(departments), [departments])

  useEffect(() => {
    let active = true

    const loadDepartments = async () => {
      try {
        const response = await getDepartments()
        if (!active) {
          return
        }
        const data = getResponseData(response)
        setDepartments(Array.isArray(data) ? data : [])
      } catch (error) {
        void error
      }
    }

    loadDepartments()

    return () => {
      active = false
    }
  }, [])

  return (
    <div className="medstream-sidebar-panel">
      <div className="medstream-sidebar-header">
        <span className="medstream-sidebar-title">Navigation</span>
        <Button iconName="angle-left" variant="icon" ariaLabel="Collapse navigation" onClick={onCollapse}/>
      </div>
      <SideNavigation
        activeHref={activeHref}
        items={navItems}
        onFollow={(event) => {
          event.preventDefault()
          const href = event.detail.href
          if (href === "/departments") {
            return
          }
          if (href) {
            navigate(href)
          }
        }}
      />
    </div>
  )
}

export function AppIconRail({onOpen}) {
  const navigate = useNavigate()
  const location = useLocation()
  const activeHref = useMemo(() => resolveActiveHref(location.pathname), [location.pathname])

  return (
    <div className="medstream-icon-rail">
      <Button
        variant="icon"
        iconName="angle-right"
        ariaLabel="Open navigation"
        onClick={onOpen}
      />
      {RAIL_ITEMS.map((item) => (
        <Button
          key={item.href}
          variant={activeHref === item.href ? "primary" : "icon"}
          iconName={item.iconName}
          ariaLabel={item.label}
          onClick={() => navigate(item.href)}
        />
      ))}
    </div>
  )
}
