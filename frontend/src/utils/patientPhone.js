export const PATIENT_PHONE_COUNTRIES = [
  {code: "+40", label: "Romania (+40)", minLength: 9, maxLength: 9},
  {code: "+44", label: "United Kingdom (+44)", minLength: 10, maxLength: 10},
  {code: "+1", label: "United States (+1)", minLength: 10, maxLength: 10},
  {code: "+49", label: "Germany (+49)", minLength: 10, maxLength: 11},
  {code: "+33", label: "France (+33)", minLength: 9, maxLength: 9},
  {code: "+39", label: "Italy (+39)", minLength: 9, maxLength: 10},
]

const COUNTRY_CODE_MAP = Object.fromEntries(PATIENT_PHONE_COUNTRIES.map((country) => [country.code, country]))
const SORTED_COUNTRY_CODES = [...PATIENT_PHONE_COUNTRIES]
  .map((country) => country.code.replace("+", ""))
  .sort((left, right) => right.length - left.length)

export function sanitizePatientPhoneDigits(value) {
  return String(value || "").replace(/\D/g, "")
}

export function buildPatientPhoneNumber(countryCode, localNumber) {
  const sanitizedLocalNumber = sanitizePatientPhoneDigits(localNumber)

  if (!countryCode || !sanitizedLocalNumber) {
    return ""
  }

  return `${countryCode} ${sanitizedLocalNumber}`
}

function getCountryFromPhoneDigits(phoneDigits) {
  const matchedCode = SORTED_COUNTRY_CODES.find((code) => phoneDigits.startsWith(code))
  return matchedCode ? COUNTRY_CODE_MAP[`+${matchedCode}`] : null
}

export function normalizePatientPhoneNumber(value, fallbackCountryCode = "") {
  const raw = String(value || "").trim()

  if (!raw) {
    return ""
  }

  const normalizedRaw = raw.startsWith("00") ? `+${raw.slice(2)}` : raw

  if (normalizedRaw.startsWith("+")) {
    const phoneDigits = sanitizePatientPhoneDigits(normalizedRaw)
    const country = getCountryFromPhoneDigits(phoneDigits)

    if (!country) {
      return raw
    }

    return buildPatientPhoneNumber(country.code, phoneDigits.slice(country.code.length - 1))
  }

  if (!fallbackCountryCode) {
    return raw
  }

  return buildPatientPhoneNumber(fallbackCountryCode, normalizedRaw)
}

export function isValidPatientPhoneNumber(value, fallbackCountryCode = "") {
  const normalizedValue = normalizePatientPhoneNumber(value, fallbackCountryCode)
  const match = normalizedValue.match(/^(\+\d{1,3})\s(\d{6,14})$/)

  if (!match) {
    return false
  }

  const [, countryCode, localNumber] = match
  const country = COUNTRY_CODE_MAP[countryCode]

  if (!country) {
    return false
  }

  return localNumber.length >= country.minLength && localNumber.length <= country.maxLength
}

export function parsePatientPhoneNumber(value) {
  const normalizedValue = normalizePatientPhoneNumber(value)
  const match = normalizedValue.match(/^(\+\d{1,3})\s(\d{6,14})$/)

  if (!match) {
    return {
      countryCode: PATIENT_PHONE_COUNTRIES[0].code,
      localNumber: "",
      normalizedValue,
    }
  }

  return {
    countryCode: match[1],
    localNumber: match[2],
    normalizedValue,
  }
}

export function formatPatientPhoneNumber(value) {
  return normalizePatientPhoneNumber(value) || String(value || "").trim()
}
