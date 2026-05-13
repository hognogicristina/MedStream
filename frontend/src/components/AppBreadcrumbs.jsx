import {useEffect, useMemo, useState} from "react"
import {useLocation, useNavigate} from "react-router-dom"
import {BreadcrumbGroup} from "@cloudscape-design/components"
import {getPatient} from "../services/patientApi.js"
import {getResponseData} from "../services/apiMessages.js"
import {formatPatientFullName} from "../utils/patients.js"

const ROUTE_LABELS = {
  "/dashboard": "Dashboard",
  "/patients/new": "Add Patient",
  "/alerts": "Alerts",
  "/profile": "My Profile",
  "/how-it-works": "How it works",
  "/metrics/streaming": "Streaming",
  "/metrics/batch": "Batch",
  "/metrics/comparison": "Comparison",
}

function getPatientIdFromPathname(pathname) {
  return pathname.match(/^\/patients\/(\d+)\/(?:diagnosis|medical-history|admission-history|analysis)$/)?.[1]
    || pathname.match(/^\/patient\/(\d+)$/)?.[1]
    || null
}

function buildBreadcrumbItems(pathname, patientName) {
  if (pathname === "/dashboard") {
    return [{text: "Dashboard", href: "/dashboard"}]
  }

  if (pathname.startsWith("/departments/")) {
    const department = decodeURIComponent(pathname.replace("/departments/", ""))
    return [
      {text: "Dashboard", href: "/dashboard"},
      {text: "Departments", href: "/dashboard"},
      {text: department, href: pathname},
    ]
  }

  if (pathname.startsWith("/metrics/")) {
    return [
      {text: "Dashboard", href: "/dashboard"},
      {text: "Metrics", href: "/metrics/streaming"},
      {text: ROUTE_LABELS[pathname] || "Metrics", href: pathname},
    ]
  }

  const patientSectionMatch = pathname.match(/^\/patients\/(\d+)\/(diagnosis|medical-history|admission-history|analysis)$/)
  if (patientSectionMatch) {
    const [, patientId, section] = patientSectionMatch
    const patientLabel = patientName ? `Patient: ${patientName}` : "Patient"
    const sectionLabel = {
      diagnosis: "Clinical Records",
      "medical-history": "Medical History",
      "admission-history": "Admission History",
      analysis: "Treatment Analysis",
    }[section]

    return [
      {text: "Dashboard", href: "/dashboard"},
      {text: patientLabel, href: `/patient/${patientId}`},
      {text: sectionLabel, href: pathname},
    ]
  }

  const patientMatch = pathname.match(/^\/patient\/(\d+)$/)
  if (patientMatch) {
    const patientLabel = patientName ? `Patient: ${patientName}` : "Patient"
    return [
      {text: "Dashboard", href: "/dashboard"},
      {text: patientLabel, href: pathname},
    ]
  }

  return [
    {text: "Dashboard", href: "/dashboard"},
    {text: ROUTE_LABELS[pathname] || "MedStream", href: pathname},
  ]
}

export default function AppBreadcrumbs({items}) {
  const location = useLocation()
  const navigate = useNavigate()
  const patientId = useMemo(() => getPatientIdFromPathname(location.pathname), [location.pathname])
  const [loadedPatientName, setLoadedPatientName] = useState({patientId: null, name: ""})

  useEffect(() => {
    if (!patientId || items) {
      return
    }

    let active = true

    const loadPatientName = async () => {
      try {
        const response = await getPatient(patientId)
        if (!active) {
          return
        }
        setLoadedPatientName({patientId, name: formatPatientFullName(getResponseData(response))})
      } catch {
        if (active) {
          setLoadedPatientName({patientId, name: ""})
        }
      }
    }

    loadPatientName()

    return () => {
      active = false
    }
  }, [items, patientId])

  const patientName = loadedPatientName.patientId === patientId ? loadedPatientName.name : ""

  const breadcrumbItems = useMemo(() => {
    const sourceItems = items || buildBreadcrumbItems(location.pathname, patientName)
    return sourceItems.map((item, index) => (
      index === sourceItems.length - 1 ? {...item, href: undefined} : item
    ))
  }, [items, location.pathname, patientName])

  return (
    <div className="medstream-breadcrumbs">
      <BreadcrumbGroup
        items={breadcrumbItems}
        ariaLabel="Breadcrumbs"
        onFollow={(event) => {
          event.preventDefault()
          const href = event.detail.href
          if (href) {
            navigate(href)
          }
        }}
      />
    </div>
  )
}
