import {useMemo} from "react"
import {useLocation, useNavigate} from "react-router-dom"
import {
  Box,
  Button,
  Input,
  SideNavigation,
  SpaceBetween,
  StatusIndicator,
  TopNavigation,
} from "@cloudscape-design/components"
import {useAuth} from "./AuthContext.jsx"
import {useTheme} from "./ThemeContext.jsx"

const NAV_ITEMS = [
  {type: "link", text: "Dashboard", href: "/dashboard"},
  {type: "link", text: "Live Monitoring", href: "/metrics/streaming"},
  {type: "link", text: "Patients", href: "/patients/new"},
  {type: "link", text: "Alerts", href: "/alerts"},
  {type: "link", text: "Batch Analytics", href: "/metrics/batch"},
  {type: "link", text: "Streaming vs Batch", href: "/metrics/comparison"},
  {type: "link", text: "How it works", href: "/metrics/comparison"},
]

function resolveActiveHref(pathname) {
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
  if (pathname.startsWith("/patients/new") || pathname.startsWith("/patient/") || pathname.startsWith("/patients/")) {
    return "/patients/new"
  }
  return "/dashboard"
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
      search={
        <Input
          placeholder="Search patients or alerts"
          type="search"
          disabled
          ariaLabel="Search"
        />
      }
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

export function AppSideNavigation() {
  const navigate = useNavigate()
  const location = useLocation()

  const activeHref = useMemo(() => resolveActiveHref(location.pathname), [location.pathname])

  return (
    <SideNavigation
      activeHref={activeHref}
      header={{href: "/dashboard", text: "Navigation"}}
      items={NAV_ITEMS}
      onFollow={(event) => {
        event.preventDefault()
        const href = event.detail.href
        if (href) {
          navigate(href)
        }
      }}
    />
  )
}

export function AppNavigationFooter() {
  return (
    <SpaceBetween size="xs">
      <Box color="text-body-secondary" fontSize="body-s">Clinical dashboard</Box>
      <StatusIndicator type="success">System connected</StatusIndicator>
      <Button variant="inline-link" href="/alerts">View all alerts</Button>
    </SpaceBetween>
  )
}
