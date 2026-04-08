export const DEPARTMENTS = ["ER", "ICU", "Cardiology", "Internal Medicine", "Neurology", "Ward"]

export function departmentHref(name) {
  return `/departments/${encodeURIComponent(name)}`
}
