import {useCallback, useState} from "react"

import {api} from "../services/patientApi.js"
import {getErrorMessage, getResponseData, getResponseMessage} from "../services/apiMessages.js"

export function usePatientAdmissionActions({authHeaders = {}, patientId, onPatientChange, onHistoryRefresh, notifyError, notifySuccess}) {
  const [dischargeReason, setDischargeReason] = useState("")
  const [dischargeType, setDischargeType] = useState("")
  const [dischargeTypes, setDischargeTypes] = useState([])
  const [readmitArrivalMethod, setReadmitArrivalMethod] = useState("self")
  const [isSubmittingDischarge, setIsSubmittingDischarge] = useState(false)
  const [isSubmittingReadmit, setIsSubmittingReadmit] = useState(false)

  const loadDischargeTypes = useCallback(async () => {
    try {
      const response = await api.get("/discharge-types")
      const nextTypes = getResponseData(response) || []
      setDischargeTypes(nextTypes)
      setDischargeType((current) => current || nextTypes[0] || "")
    } catch (error) {
      notifyError(getErrorMessage(error))
    }
  }, [notifyError])

  const handleDischargeSubmit = async (event) => {
    event.preventDefault()

    if (!dischargeReason.trim() || !dischargeType || isSubmittingDischarge) {
      return
    }

    setIsSubmittingDischarge(true)

    try {
      const response = await api.patch(`/patients/${patientId}/discharge`, {
        type: dischargeType,
        reason: dischargeReason,
      }, {
        headers: authHeaders,
      })
      onPatientChange(getResponseData(response))
      setDischargeReason("")
      setDischargeType((current) => current)
      await onHistoryRefresh?.()
      notifySuccess(getResponseMessage(response))
    } catch (error) {
      notifyError(getErrorMessage(error))
    } finally {
      setIsSubmittingDischarge(false)
    }
  }

  const handleReadmitSubmit = async (event) => {
    event.preventDefault()

    if (!readmitArrivalMethod || isSubmittingReadmit) {
      return
    }

    setIsSubmittingReadmit(true)

    try {
      const response = await api.post(`/patients/${patientId}/readmit`, {
        arrival_method: readmitArrivalMethod,
      }, {
        headers: authHeaders,
      })
      onPatientChange(getResponseData(response))
      setReadmitArrivalMethod("self")
      await onHistoryRefresh?.()
      notifySuccess(getResponseMessage(response))
    } catch (error) {
      notifyError(getErrorMessage(error))
    } finally {
      setIsSubmittingReadmit(false)
    }
  }

  return {
    dischargeReason,
    dischargeType,
    dischargeTypes,
    loadDischargeTypes,
    setDischargeReason,
    setDischargeType,
    readmitArrivalMethod,
    setReadmitArrivalMethod,
    isSubmittingDischarge,
    isSubmittingReadmit,
    handleDischargeSubmit,
    handleReadmitSubmit,
  }
}
