export const ROMANIA_COUNTRY = "Romania"

export function buildEmptyPatientAddress() {
  return {
    street: "",
    number: "",
    apartment: "",
    city: "",
    county: "",
    postal_code: "",
  }
}

export function buildPatientAddressForm(address) {
  return {
    street: address?.street || "",
    number: address?.number || "",
    apartment: address?.apartment || "",
    city: address?.city || "",
    county: address?.county || "",
    postal_code: address?.postal_code || "",
  }
}

export function normalizePatientAddress(address) {
  return {
    street: String(address?.street || "").trim(),
    number: String(address?.number || "").trim(),
    apartment: String(address?.apartment || "").trim(),
    city: String(address?.city || "").trim(),
    county: String(address?.county || "").trim(),
    postal_code: String(address?.postal_code || "").replace(/\D/g, ""),
  }
}

export function formatPatientAddress(address) {
  const normalizedAddress = normalizePatientAddress(address)

  if (
    !normalizedAddress.street
    || !normalizedAddress.number
    || !normalizedAddress.city
    || !normalizedAddress.county
    || !normalizedAddress.postal_code
  ) {
    return ""
  }

  return [
    `${normalizedAddress.street} ${normalizedAddress.number}`.trim(),
    normalizedAddress.apartment ? `Ap. ${normalizedAddress.apartment}` : "",
    normalizedAddress.city,
    normalizedAddress.county,
    normalizedAddress.postal_code,
    ROMANIA_COUNTRY,
  ].filter(Boolean).join(", ")
}
