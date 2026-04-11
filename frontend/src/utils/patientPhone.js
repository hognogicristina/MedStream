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

export function buildPatientPhoneNumber(value) {
  return normalizeRomanianPhoneNumber(value)
}

export function formatPatientPhoneWithCode(phoneNumber) {
  return normalizeRomanianPhoneNumber(phoneNumber)
}
