export const ROMANIA_PHONE_PLACEHOLDER = "0712345678"

export function normalizeRomanianPhoneNumber(value) {
  const digits = String(value || "").replace(/\D/g, "")

  if (!digits) {
    return ""
  }

  if (digits.startsWith("40") && digits.length === 11) {
    return `0${digits.slice(2)}`
  }

  return digits
}

export function isValidPatientPhoneNumber(phoneNumber) {
  return /^07\d{8}$/.test(normalizeRomanianPhoneNumber(phoneNumber))
}

export function buildPatientPhoneNumber(value) {
  const normalized = normalizeRomanianPhoneNumber(value)
  return isValidPatientPhoneNumber(normalized) ? normalized : normalized
}

export function formatPatientPhoneWithCode(phoneNumber) {
  return normalizeRomanianPhoneNumber(phoneNumber)
}
