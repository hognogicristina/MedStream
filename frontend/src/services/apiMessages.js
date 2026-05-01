const FALLBACK_API_ERROR_MESSAGE = "Something went wrong"

export function getResponseMessage(response) {
  return response?.data?.message || ""
}

export function getResponseData(response) {
  return response?.data?.data
}

export function getErrorMessage(error) {
  return error?.response?.data?.message || FALLBACK_API_ERROR_MESSAGE
}
