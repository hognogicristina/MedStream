export const FALLBACK_API_MESSAGE = "Unexpected error occurred"

export function getResponseMessage(response) {
  return response?.data?.message || FALLBACK_API_MESSAGE
}

export function getResponseData(response) {
  return response?.data?.data
}

export function getErrorMessage(error) {
  return error?.response?.data?.message || FALLBACK_API_MESSAGE
}
