export const ALERT_SEVERITY_ORDER = {
  critical: 0,
  high: 1,
  normal: 2,
}

export const ALERT_TYPE_COLOR_MAP = {
  heart_rate_high: "#f59e0b",
  heart_rate_critical: "#ef4444",
  heart_rate_normalized: "#22c55e",
  heart_rate_normal: "#22c55e",
  heart_rate_stable: "#22c55e",
  oxygen_low: "#f59e0b",
  oxygen_critical: "#ef4444",
  oxygen_normalized: "#22c55e",
  oxygen_normal: "#22c55e",
  oxygen_stable: "#22c55e",
  temperature_high: "#f59e0b",
  temperature_critical: "#ef4444",
  temperature_normalized: "#22c55e",
  temperature_normal: "#22c55e",
  temperature_stable: "#22c55e",
}

export const ALERT_TYPE_SHORT_LABEL = {
  heart_rate_high: "HR High",
  heart_rate_critical: "HR Critical",
  heart_rate_normalized: "HR Normalized",
  heart_rate_normal: "HR Normal",
  heart_rate_stable: "HR Stable",
  oxygen_low: "O2 Low",
  oxygen_critical: "O2 Critical",
  oxygen_normalized: "O2 Normalized",
  oxygen_normal: "O2 Normal",
  oxygen_stable: "O2 Stable",
  temperature_high: "Temp High",
  temperature_critical: "Temp Critical",
  temperature_normalized: "Temp Normalized",
  temperature_normal: "Temp Normal",
  temperature_stable: "Temp Stable",
}

export function normalizeAlertType(type, severity) {
  const normalizedType = String(type || "").trim().toLowerCase()
  const normalizedSeverity = String(severity || "").trim().toLowerCase()

  if (
    normalizedType.endsWith("_high")
    || normalizedType.endsWith("_critical")
    || normalizedType.endsWith("_low")
    || normalizedType.endsWith("_normalized")
    || normalizedType.endsWith("_normal")
    || normalizedType.endsWith("_stable")
  ) {
    return normalizedType
  }

  if (normalizedType === "heart_rate") {
    return normalizedSeverity === "critical" ? "heart_rate_critical" : "heart_rate_high"
  }

  if (normalizedType === "oxygen" || normalizedType === "oxygen_saturation") {
    return normalizedSeverity === "critical" ? "oxygen_critical" : "oxygen_low"
  }

  if (normalizedType === "temperature") {
    return normalizedSeverity === "critical" ? "temperature_critical" : "temperature_high"
  }

  if (normalizedType === "status" || normalizedType === "normal vitals") {
    return "heart_rate_normalized"
  }

  return normalizedType
}

export function alertTypeToVital(type) {
  const normalizedType = String(type || "").trim().toLowerCase()
  if (normalizedType === "heart_rate" || normalizedType.startsWith("heart_rate_")) {
    return "heartRate"
  }
  if (normalizedType === "oxygen" || normalizedType === "oxygen_saturation" || normalizedType.startsWith("oxygen_")) {
    return "oxygen"
  }
  if (normalizedType === "temperature" || normalizedType.startsWith("temperature_")) {
    return "temperature"
  }
  return null
}

export function isNormalizedAlertType(type) {
  const normalizedType = String(type || "").trim().toLowerCase()
  return normalizedType.endsWith("_normalized") || normalizedType.endsWith("_normal") || normalizedType.endsWith("_stable")
}

export function getAlertSeverityLevel(alert = {}) {
  const severity = String(alert?.severity || "").trim().toLowerCase()
  if (severity === "critical") {
    return "critical"
  }
  if (severity === "high" || severity === "warning") {
    return "high"
  }
  return "normal"
}
