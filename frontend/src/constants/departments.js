export function departmentHref(name) {
  return `/departments/${encodeURIComponent(name)}`
}

export function formatDepartmentLabel(name) {
  return name
}
