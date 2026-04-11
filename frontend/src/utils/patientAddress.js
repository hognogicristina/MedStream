export function buildEmptyPatientAddress() {
  return {
    street: "",
    number: "",
    apartment: "",
    city: "",
    state: "",
    postal_code: "",
    country: "",
  }
}

export function buildPatientAddressForm(address) {
  return {
    street: address?.street || "",
    number: address?.number || "",
    apartment: address?.apartment || "",
    city: address?.city || "",
    state: address?.state || "",
    postal_code: address?.postal_code || "",
    country: address?.country || "",
  }
}

export function normalizePatientAddress(address) {
  return {
    street: String(address?.street || "").trim(),
    number: String(address?.number || "").trim(),
    apartment: String(address?.apartment || "").trim(),
    city: String(address?.city || "").trim(),
    state: String(address?.state || "").trim(),
    postal_code: String(address?.postal_code || "").trim(),
    country: String(address?.country || "").trim(),
  }
}

export function isValidPatientAddress(address) {
  const normalizedAddress = normalizePatientAddress(address)
  return Boolean(
    normalizedAddress.street
    && normalizedAddress.number
    && normalizedAddress.city
    && normalizedAddress.state
    && normalizedAddress.postal_code
    && normalizedAddress.country,
  )
}

export function formatPatientAddress(address) {
  const normalizedAddress = normalizePatientAddress(address)

  if (!isValidPatientAddress(normalizedAddress)) {
    return ""
  }

  const lineOne = `${normalizedAddress.street} ${normalizedAddress.number}`.trim()
  const apartment = normalizedAddress.apartment ? `Apt ${normalizedAddress.apartment}` : ""
  const lineTwo = [
    normalizedAddress.city,
    normalizedAddress.state,
    normalizedAddress.postal_code,
    normalizedAddress.country,
  ].filter(Boolean).join(", ")

  return [lineOne, apartment, lineTwo].filter(Boolean).join(" | ")
}
