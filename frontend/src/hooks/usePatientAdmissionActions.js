import {useState} from "react"

import {api} from "../services/api"
import {getErrorMessage, getResponseData, getResponseMessage} from "../services/apiMessages"

export function usePatientAdmissionActions({patientId, onPatientChange, onHistoryRefresh, notifyError, notifySuccess}) {
  const [dischargeReason, setDischargeReason] = useState("")
  const [readmitReason, setReadmitReason] = useState("")
  const [isSubmittingDischarge, setIsSubmittingDischarge] = useState(false)
  const [isSubmittingReadmit, setIsSubmittingReadmit] = useState(false)

  const handleDischargeSubmit = async (event) => {
    event.preventDefault()

    if (!dischargeReason.trim() || isSubmittingDischarge) {
      return
    }

    setIsSubmittingDischarge(true)

    try {
      const response = await api.patch(`/patients/${patientId}/discharge`, {
        reason: dischargeReason,
      })
      onPatientChange(getResponseData(response))
      setDischargeReason("")
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

    if (!readmitReason.trim() || isSubmittingReadmit) {
      return
    }

    setIsSubmittingReadmit(true)

    try {
      const response = await api.post(`/patients/${patientId}/readmit`, {
        reason: readmitReason,
      })
      onPatientChange(getResponseData(response))
      setReadmitReason("")
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
    setDischargeReason,
    readmitReason,
    setReadmitReason,
    isSubmittingDischarge,
    isSubmittingReadmit,
    handleDischargeSubmit,
    handleReadmitSubmit,
  }
}
