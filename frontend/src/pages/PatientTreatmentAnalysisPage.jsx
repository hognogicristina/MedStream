import {useEffect, useState} from "react"
import {useParams} from "react-router-dom"
import BackButton from "../components/BackButton.jsx"
import PatientTreatmentAnalysisSection from "../components/PatientTreatmentAnalysisSection.jsx"
import {useNotifications} from "../components/useNotifications.js"
import {getErrorMessage, getResponseData} from "../services/apiMessages.js"
import {getPatient} from "../services/patientApi.js"
import LoadingSpinner from "../components/LoadingSpinner.jsx"

export default function PatientTreatmentAnalysisPage() {
  const {id} = useParams()
  const {notifyError} = useNotifications()
  const [patientName, setPatientName] = useState("Patient")
  const [isLoading, setIsLoading] = useState(true)
  const patientId = Number(id)

  useEffect(() => {
    if (!Number.isFinite(patientId)) {
      return
    }

    let active = true

    const loadPatient = async () => {
      setIsLoading(true)
      try {
        const response = await getPatient(patientId)
        const patient = getResponseData(response)
        if (!active || !patient) {
          return
        }

        const fullName = `${patient.last_name || ""} ${patient.first_name || ""}`.trim()
        setPatientName(fullName || "Patient")
      } catch (error) {
        if (active) {
          notifyError(getErrorMessage(error))
        }
      } finally {
        if (active) {
          setIsLoading(false)
        }
      }
    }

    loadPatient().then(() => {})

    return () => {
      active = false
    }
  }, [notifyError, patientId])

  return (
    <div className="app-shell min-h-screen px-4 py-6 text-slate-100 sm:px-6 lg:px-8">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
        <header className="console-topbar rounded-[24px] p-6 sm:p-8">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.35em] text-[#ff9900]">Patient View</p>
              <h1 className="mt-2 text-3xl font-semibold tracking-tight text-white sm:text-4xl">{patientName}</h1>
              <p className="mt-2 text-sm text-[#b6bec9]">
                Timeline and reasoning for patient medications, alerts, diagnosis, and conditions.
              </p>
            </div>
            <BackButton/>
          </div>
        </header>

        {isLoading ? <LoadingSpinner/> : (
          <PatientTreatmentAnalysisSection
            selectedPatientId={patientId}
            showSelectedPatientSummary={false}
          />
        )}
      </div>
    </div>
  )
}
