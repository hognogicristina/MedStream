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
