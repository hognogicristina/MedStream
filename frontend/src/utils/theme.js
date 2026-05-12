export const THEME_DARK = "dark"

const CHART_THEME_DARK = {
  cardBg: "#0f141a",
  cardBorder: "#2a3441",
  grid: "#1f2937",
  axis: "#6b7280",
  axisTickFill: "#b6bec9",
  tooltipBg: "#0f172a",
  tooltipBorder: "#334155",
  tooltipText: "#ffffff",
  lineContrast: "#e5e7eb",
  lineDotStroke: "#0f141a",
  reference: "#385269",
  pieStroke: "#0b1220",
  label: "#d5dbdb",
}

const CHART_THEME_LIGHT = {
  cardBg: "#f8fafc",
  cardBorder: "#dce4ee",
  grid: "#d9e2ec",
  axis: "#475569",
  axisTickFill: "#334155",
  tooltipBg: "#ffffff",
  tooltipBorder: "#cbd5e1",
  tooltipText: "#0f172a",
  lineContrast: "#0f172a",
  lineDotStroke: "#f8fafc",
  reference: "#94a3b8",
  pieStroke: "#e2e8f0",
  label: "#334155",
}

export function getChartTheme(theme) {
  return theme === "light" ? CHART_THEME_LIGHT : CHART_THEME_DARK
}
