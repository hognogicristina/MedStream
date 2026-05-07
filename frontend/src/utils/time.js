export function formatAlertFriendlyTime(value) {
  const date = new Date(value)
  if (!Number.isFinite(date.getTime())) {
    return "--"
  }

  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(date)
}
