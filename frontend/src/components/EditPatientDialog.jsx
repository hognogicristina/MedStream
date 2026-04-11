import {useEffect, useState} from "react"
import {DEPARTMENTS} from "../constants/departments"
import {
  buildPatientPhoneNumber,
  formatPatientPhoneNumber,
  getPatientPhoneCountryOptionLabel,
  isValidPatientPhoneNumber,
  parsePatientPhoneNumber,
  PATIENT_PHONE_COUNTRIES,
} from "../utils/patientPhone"
import {buildPatientAddressForm, formatPatientAddress, isValidPatientAddress, normalizePatientAddress} from "../utils/patientAddress"

const TOTAL_STEPS = 3

function buildPatientEditForm(patient) {
  return {
    first_name: patient?.first_name || "",
    last_name: patient?.last_name || "",
    gender: patient?.gender || "",
    birth_date: patient?.birth_date || "",
    cnp: patient?.cnp || "",
    department: patient?.department || DEPARTMENTS[0],
  }
}

export default function EditPatientDialog({
  isOpen,
  isSubmitting,
  patient,
  onClose,
  onSubmit,
}) {
  const [step, setStep] = useState(1)
  const [form, setForm] = useState(buildPatientEditForm())
  const [address, setAddress] = useState(buildPatientAddressForm())
  const [phoneCountryCode, setPhoneCountryCode] = useState(PATIENT_PHONE_COUNTRIES[0].code)
  const [phoneLocalNumber, setPhoneLocalNumber] = useState("")

  useEffect(() => {
    if (!isOpen || !patient) {
      return
    }

    const parsedPhoneNumber = parsePatientPhoneNumber(patient.phone_number)
    setStep(1)
    setForm(buildPatientEditForm(patient))
    setAddress(buildPatientAddressForm(patient.address))
    setPhoneCountryCode(parsedPhoneNumber.countryCode)
    setPhoneLocalNumber(parsedPhoneNumber.localNumber)
  }, [isOpen, patient])

  if (!isOpen || !patient) {
    return null
  }

  const normalizedPhoneNumber = buildPatientPhoneNumber(phoneCountryCode, phoneLocalNumber)
  const normalizedInitialValues = {
    ...buildPatientEditForm(patient),
    first_name: (patient.first_name || "").trim(),
    last_name: (patient.last_name || "").trim(),
    cnp: (patient.cnp || "").trim(),
    phone_number: formatPatientPhoneNumber(patient.phone_number),
    address: normalizePatientAddress(patient.address),
  }
  const normalizedCurrentValues = {
    first_name: form.first_name.trim(),
    last_name: form.last_name.trim(),
    gender: form.gender.trim(),
    birth_date: form.birth_date,
    cnp: form.cnp.trim(),
    department: form.department,
    phone_number: normalizedPhoneNumber,
    address: normalizePatientAddress(address),
  }
  const isDirty = Object.keys(normalizedInitialValues).some(
    (key) => JSON.stringify(normalizedInitialValues[key]) !== JSON.stringify(normalizedCurrentValues[key]),
  )

  const isStepOneValid = Boolean(
    normalizedCurrentValues.first_name
    && normalizedCurrentValues.last_name
    && normalizedCurrentValues.gender
    && normalizedCurrentValues.birth_date
    && /^\d{13}$/.test(normalizedCurrentValues.cnp),
  )
  const isStepTwoValid = Boolean(
    isValidPatientPhoneNumber(normalizedCurrentValues.phone_number)
    && isValidPatientAddress(normalizedCurrentValues.address),
  )
  const isStepThreeValid = Boolean(normalizedCurrentValues.department)
  const canGoNext = (step === 1 && isStepOneValid) || (step === 2 && isStepTwoValid)
  const canSubmit = isStepOneValid && isStepTwoValid && isStepThreeValid && isDirty && !isSubmitting

  const handleChange = (event) => {
    const {name, value} = event.target
    setForm((current) => ({
      ...current,
      [name]: value,
    }))
  }

  const handleAddressChange = (event) => {
    const {name, value} = event.target
    setAddress((current) => ({
      ...current,
      [name]: value,
    }))
  }

  const handleNext = () => {
    if (!canGoNext) {
      return
    }

    setStep((current) => Math.min(TOTAL_STEPS, current + 1))
  }

  const handlePrevious = () => {
    setStep((current) => Math.max(1, current - 1))
  }

  const handleSubmit = (event) => {
    event.preventDefault()

    if (!canSubmit) {
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
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[#879196]">Current Patient</p>
              <p className="mt-2 text-lg font-semibold text-white">{patient.last_name} {patient.first_name}</p>
              <p className="mt-1 text-sm text-[#879196]">CNP: {patient.cnp}</p>
              <p className="mt-1 text-sm text-[#879196]">{formatPatientAddress(patient.address) || "Address not available"}</p>
            </div>
            <div className="rounded-full border border-[#3b424b] px-4 py-2 text-xs font-semibold uppercase tracking-[0.22em] text-[#879196]">
              Step {step} / {TOTAL_STEPS}
            </div>
          </div>
        </div>

        <form className="mt-5 space-y-5" onSubmit={handleSubmit}>
          {step === 1 && (
            <div className="space-y-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[#879196]">Basic Info</p>
              </div>
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
                <div className="login-field">
                  <label className="login-label" htmlFor="edit-gender">Gender</label>
                  <select
                    id="edit-gender"
                    name="gender"
                    value={form.gender}
                    onChange={handleChange}
                    className="login-input"
                    required
                  >
                    <option value="">Select gender</option>
                    <option value="male">Male</option>
                    <option value="female">Female</option>
                  </select>
                </div>
                <div className="login-field">
                  <label className="login-label" htmlFor="edit-birth-date">Birth Date</label>
                  <input
                    id="edit-birth-date"
                    name="birth_date"
                    type="date"
                    value={form.birth_date}
                    onChange={handleChange}
                    className="login-input"
                    required
                  />
                </div>
                <div className="login-field sm:col-span-2">
                  <label className="login-label" htmlFor="edit-cnp">CNP</label>
                  <input
                    id="edit-cnp"
                    name="cnp"
                    type="text"
                    value={form.cnp}
                    onChange={handleChange}
                    className="login-input"
                    placeholder="13-digit CNP"
                    required
                  />
                </div>
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[#879196]">Contact</p>
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
                        {getPatientPhoneCountryOptionLabel(country)}
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
                <p className="mt-2 text-xs text-[#879196]">Stored as {normalizedPhoneNumber || `${phoneCountryCode} ...`}</p>
              </div>

              <div className="rounded-2xl border border-[#3b424b] bg-[#151b22] p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[#879196]">Address</p>
                <div className="mt-4 grid gap-4 sm:grid-cols-2">
                  <input type="text" name="street" value={address.street} onChange={handleAddressChange} placeholder="Street" className="login-input" required />
                  <input type="text" name="number" value={address.number} onChange={handleAddressChange} placeholder="Number" className="login-input" required />
                  <input type="text" name="apartment" value={address.apartment} onChange={handleAddressChange} placeholder="Apartment (optional)" className="login-input" />
                  <input type="text" name="city" value={address.city} onChange={handleAddressChange} placeholder="City" className="login-input" required />
                  <input type="text" name="state" value={address.state} onChange={handleAddressChange} placeholder="County / State" className="login-input" required />
                  <input type="text" name="postal_code" value={address.postal_code} onChange={handleAddressChange} placeholder="Postal code" className="login-input" required />
                  <input type="text" name="country" value={address.country} onChange={handleAddressChange} placeholder="Country" className="login-input sm:col-span-2" required />
                </div>
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[#879196]">Other</p>
              </div>
              <div className="login-field">
                <label className="login-label" htmlFor="edit-department">Department</label>
                <select
                  id="edit-department"
                  name="department"
                  value={form.department}
                  onChange={handleChange}
                  className="login-input"
                  required
                >
                  {DEPARTMENTS.map((department) => (
                    <option key={department} value={department}>
                      {department}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          )}

          <div className="flex justify-end gap-3">
            <button
              type="button"
              onClick={step === 1 ? onClose : handlePrevious}
              disabled={isSubmitting}
              className="console-button-secondary rounded-2xl px-4 py-3 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-60"
            >
              {step === 1 ? "Cancel" : "Previous"}
            </button>
            {step < TOTAL_STEPS ? (
              <button
                type="button"
                onClick={handleNext}
                disabled={!canGoNext || isSubmitting}
                className="console-button-primary rounded-2xl px-4 py-3 text-sm font-semibold disabled:cursor-not-allowed disabled:border-[#4d5661] disabled:bg-[#3b424b] disabled:text-[#b6bec9]"
              >
                Next
              </button>
            ) : (
              <button
                type="submit"
                disabled={!canSubmit}
                className="console-button-primary rounded-2xl px-4 py-3 text-sm font-semibold disabled:cursor-not-allowed disabled:border-[#4d5661] disabled:bg-[#3b424b] disabled:text-[#b6bec9]"
              >
                {isSubmitting ? "Saving..." : "Save Changes"}
              </button>
            )}
          </div>
        </form>
      </div>
    </div>
  )
}
