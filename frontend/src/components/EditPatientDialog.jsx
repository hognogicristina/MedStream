import {useEffect, useState} from "react"
import {
  buildPatientPhoneNumber,
  formatPatientPhoneNumber,
  isValidPatientPhoneNumber,
  parsePatientPhoneNumber,
  PATIENT_PHONE_COUNTRIES,
} from "../utils/patientPhone"

export default function EditPatientDialog({
  isOpen,
  isSubmitting,
  patient,
  onClose,
  onSubmit,
}) {
  const [form, setForm] = useState({
    first_name: "",
    last_name: "",
  })
  const [phoneCountryCode, setPhoneCountryCode] = useState(PATIENT_PHONE_COUNTRIES[0].code)
  const [phoneLocalNumber, setPhoneLocalNumber] = useState("")

  useEffect(() => {
    if (!isOpen || !patient) {
      return
    }

    const parsedPhoneNumber = parsePatientPhoneNumber(patient.phone_number)
    setForm({
      first_name: patient.first_name || "",
      last_name: patient.last_name || "",
    })
    setPhoneCountryCode(parsedPhoneNumber.countryCode)
    setPhoneLocalNumber(parsedPhoneNumber.localNumber)
  }, [isOpen, patient])

  if (!isOpen || !patient) {
    return null
  }

  const normalizedInitialValues = {
    first_name: (patient.first_name || "").trim(),
    last_name: (patient.last_name || "").trim(),
    phone_number: formatPatientPhoneNumber(patient.phone_number),
  }
  const normalizedPhoneNumber = buildPatientPhoneNumber(phoneCountryCode, phoneLocalNumber)
  const normalizedCurrentValues = {
    first_name: form.first_name.trim(),
    last_name: form.last_name.trim(),
    phone_number: normalizedPhoneNumber,
  }
  const isDirty = Object.keys(normalizedInitialValues).some(
    (key) => normalizedInitialValues[key] !== normalizedCurrentValues[key],
  )
  const isValid = normalizedCurrentValues.first_name.length > 0
    && normalizedCurrentValues.last_name.length > 0
    && isValidPatientPhoneNumber(normalizedCurrentValues.phone_number)
    && isDirty
    && !isSubmitting

  const handleChange = (event) => {
    const {name, value} = event.target
    setForm((current) => ({
      ...current,
      [name]: value,
    }))
  }

  const handleSubmit = (event) => {
    event.preventDefault()

    if (!isValid) {
      return
    }

    onSubmit(normalizedCurrentValues)
  }

  return (
    <div className="console-modal-overlay">
      <div className="console-modal monitor-card rounded-[28px] p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-[#ff9900]">Patient Record</p>
            <h2 className="mt-2 text-2xl font-semibold text-white">Edit Patient Details</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="console-button-secondary rounded-xl px-3 py-2 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-60"
          >
            Cancel
          </button>
        </div>

        <div className="mt-5 rounded-2xl border border-[#3b424b] bg-[#151b22] p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[#879196]">Current Patient</p>
          <p className="mt-2 text-lg font-semibold text-white">{patient.last_name} {patient.first_name}</p>
          <p className="mt-1 text-sm text-[#879196]">CNP: {patient.cnp}</p>
        </div>

        <form className="mt-5 space-y-4" onSubmit={handleSubmit}>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="login-field">
              <label className="login-label" htmlFor="edit-first-name">First Name</label>
              <input
                id="edit-first-name"
                name="first_name"
                type="text"
                value={form.first_name}
                onChange={handleChange}
                className="login-input"
                required
              />
            </div>
            <div className="login-field">
              <label className="login-label" htmlFor="edit-last-name">Last Name</label>
              <input
                id="edit-last-name"
                name="last_name"
                type="text"
                value={form.last_name}
                onChange={handleChange}
                className="login-input"
                required
              />
            </div>
          </div>

          <div className="login-field">
            <label className="login-label" htmlFor="edit-phone-number">Phone Number</label>
            <div className="grid gap-3 sm:grid-cols-[220px_minmax(0,1fr)]">
              <select
                value={phoneCountryCode}
                onChange={(event) => setPhoneCountryCode(event.target.value)}
                className="login-input"
                aria-label="Phone country code"
              >
                {PATIENT_PHONE_COUNTRIES.map((country) => (
                  <option key={country.code} value={country.code}>
                    {country.label}
                  </option>
                ))}
              </select>
              <input
                id="edit-phone-number"
                type="tel"
                value={phoneLocalNumber}
                onChange={(event) => setPhoneLocalNumber(event.target.value.replace(/\D/g, ""))}
                placeholder="Phone number"
                className="login-input"
                required
              />
            </div>
          </div>

          <div className="flex justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="console-button-secondary rounded-2xl px-4 py-3 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-60"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!isValid}
              className="console-button-primary rounded-2xl px-4 py-3 text-sm font-semibold disabled:cursor-not-allowed disabled:border-[#4d5661] disabled:bg-[#3b424b] disabled:text-[#b6bec9]"
            >
              {isSubmitting ? "Saving..." : "Save Changes"}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
