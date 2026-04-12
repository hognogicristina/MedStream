import {useEffect, useState} from "react"
import {
  buildPatientPhoneNumber,
  normalizeRomanianPhoneNumber,
  ROMANIA_PHONE_PLACEHOLDER,
} from "../utils/patientPhone"
import {getCityOptions, getCountyOptions} from "../utils/addressOptions"
import {buildPatientAddressForm, normalizePatientAddress} from "../utils/patientAddress"

const TOTAL_STEPS = 2

function buildPatientEditForm(patient) {
  return {
    first_name: patient?.first_name || "",
    last_name: patient?.last_name || "",
    gender: patient?.gender || "",
    birth_date: patient?.birth_date || "",
    cnp: patient?.cnp || "",
    arrival_method: patient?.arrival_method || "self",
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
  const [phoneNumber, setPhoneNumber] = useState("")

  useEffect(() => {
    if (!isOpen || !patient) {
      return
    }

    const resetTimer = window.setTimeout(() => {
      setStep(1)
      setForm(buildPatientEditForm(patient))
      setAddress(buildPatientAddressForm(patient.address))
      setPhoneNumber(normalizeRomanianPhoneNumber(patient.phone_number))
    }, 0)

    return () => window.clearTimeout(resetTimer)
  }, [isOpen, patient])

  if (!isOpen || !patient) {
    return null
  }

  const normalizedPhoneNumber = buildPatientPhoneNumber(phoneNumber)
  const normalizedCurrentValues = {
    first_name: form.first_name.trim(),
    last_name: form.last_name.trim(),
    gender: form.gender.trim(),
    birth_date: form.birth_date,
    cnp: form.cnp.trim(),
    arrival_method: form.arrival_method,
    phone_number: normalizedPhoneNumber,
    address: normalizePatientAddress(address),
  }
  const normalizedInitialValues = {
    first_name: (patient.first_name || "").trim(),
    last_name: (patient.last_name || "").trim(),
    gender: (patient.gender || "").trim(),
    birth_date: patient.birth_date || "",
    cnp: (patient.cnp || "").trim(),
    arrival_method: patient.arrival_method || "self",
    phone_number: normalizeRomanianPhoneNumber(patient.phone_number),
    address: normalizePatientAddress(patient.address),
  }

  const isDirty = Object.keys(normalizedInitialValues).some(
    (key) => JSON.stringify(normalizedInitialValues[key]) !== JSON.stringify(normalizedCurrentValues[key]),
  )
  const isStepOneValid = Boolean(
    normalizedCurrentValues.first_name
    && normalizedCurrentValues.last_name
    && normalizedCurrentValues.gender
    && normalizedCurrentValues.birth_date
    && normalizedCurrentValues.cnp
    && normalizedCurrentValues.arrival_method
    && normalizedCurrentValues.phone_number,
  )
  const isStepTwoValid = Boolean(
    normalizedCurrentValues.address.street
    && normalizedCurrentValues.address.number
    && normalizedCurrentValues.address.city
    && normalizedCurrentValues.address.county
    && normalizedCurrentValues.address.postal_code,
  )
  const canSubmit = isDirty && !isSubmitting

  const handleChange = (event) => {
    const {name, value} = event.target
    setForm((current) => ({...current, [name]: value}))
  }

  const handleAddressChange = (event) => {
    const {name, value} = event.target
    setAddress((current) => {
      if (name === "county") {
        return {...current, county: value, city: ""}
      }

      return {...current, [name]: value}
    })
  }

  const handleNext = () => {
    if (!isStepOneValid) {
      return
    }

    setStep(2)
  }

  const countyOptions = getCountyOptions()
  const cityOptions = getCityOptions(address.county)

  return (
    <div className="console-modal-overlay">
      <div className="console-modal monitor-card rounded-[28px] p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-[#ff9900]">{"Patient Record"}</p>
            <h2 className="mt-2 text-2xl font-semibold text-white">{"Edit Patient Details"}</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="console-button-secondary rounded-xl px-3 py-2 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-60"
          >
            {"Cancel"}
          </button>
        </div>

        <div className="mt-5 rounded-2xl border border-[#3b424b] bg-[#151b22] p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[#879196]">{"Current Patient"}</p>
              <p className="mt-2 text-lg font-semibold text-white">{patient.last_name} {patient.first_name}</p>
              <p className="mt-1 text-sm text-[#879196]">CNP: {patient.cnp}</p>
            </div>
            <div
              className="rounded-full border border-[#3b424b] px-4 py-2 text-xs font-semibold uppercase tracking-[0.22em] text-[#879196]">
              {"Step"} {step} / {TOTAL_STEPS}
            </div>
          </div>
        </div>

        <div className="mt-5 space-y-5">
          {step === 1 && (
            <div className="space-y-4">
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[#879196]">{"Basic Info"}</p>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="login-field">
                  <label className="login-label" htmlFor="edit-first-name">{"First Name"}</label>
                  <input id="edit-first-name" name="first_name" type="text" value={form.first_name} onChange={handleChange}
                         className="login-input" placeholder={"Example: Andrei"} required/>
                </div>
                <div className="login-field">
                  <label className="login-label" htmlFor="edit-last-name">{"Last Name"}</label>
                  <input id="edit-last-name" name="last_name" type="text" value={form.last_name} onChange={handleChange}
                         className="login-input" placeholder={"Example: Popescu"} required/>
                </div>
                <div className="login-field">
                  <label className="login-label" htmlFor="edit-gender">{"Gender"}</label>
                  <select id="edit-gender" name="gender" value={form.gender} onChange={handleChange} className="login-input" required>
                    <option value="">{"Gender"}</option>
                    <option value="male">{"Male"}</option>
                    <option value="female">{"Female"}</option>
                    <option value="other">{"Other"}</option>
                  </select>
                </div>
                <div className="login-field">
                  <label className="login-label" htmlFor="edit-birth-date">{"Birth Date"}</label>
                  <input id="edit-birth-date" name="birth_date" type="date" value={form.birth_date} onChange={handleChange}
                         className="login-input" required/>
                </div>
                <div className="login-field">
                  <label className="login-label" htmlFor="edit-cnp">CNP</label>
                  <input id="edit-cnp" name="cnp" type="text" value={form.cnp} onChange={handleChange} className="login-input"
                         placeholder={"Example: 6010101123451"} required/>
                </div>
                <div className="login-field">
                  <label className="login-label" htmlFor="edit-phone-number">{"Phone Number"}</label>
                  <input
                    id="edit-phone-number"
                    type="tel"
                    value={phoneNumber}
                    onChange={(event) => setPhoneNumber(event.target.value.replace(/\D/g, ""))}
                    placeholder={ROMANIA_PHONE_PLACEHOLDER}
                    className="login-input"
                    required
                  />
                </div>
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-4">
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[#879196]">{"Address"}</p>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="login-field">
                  <label className="login-label" htmlFor="edit-street">{"Street"}</label>
                  <input id="edit-street" type="text" name="street" value={address.street} onChange={handleAddressChange}
                         className="login-input" placeholder={"Example: Liberty Street"} required/>
                </div>
                <div className="login-field">
                  <label className="login-label" htmlFor="edit-number">{"Number"}</label>
                  <input id="edit-number" type="text" name="number" value={address.number} onChange={handleAddressChange}
                         className="login-input" placeholder={"Example: 12A"} required/>
                </div>
                <div className="login-field">
                  <label className="login-label" htmlFor="edit-apartment">{"Apartment"}</label>
                  <input id="edit-apartment" type="text" name="apartment" value={address.apartment} onChange={handleAddressChange}
                         className="login-input" placeholder={"Example: 24"}/>
                </div>
                <div className="login-field">
                  <label className="login-label" htmlFor="edit-city">{"City"}</label>
                  <select id="edit-city" name="city" value={address.city} onChange={handleAddressChange} className="login-input" required
                          disabled={cityOptions.length === 0}>
                    <option value="">{cityOptions.length === 0 ? ("Select county first") : ("Select city")}</option>
                    {cityOptions.map((city) => (
                      <option key={city} value={city}>
                        {city}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="login-field">
                  <label className="login-label" htmlFor="edit-county">{"County"}</label>
                  <select id="edit-county" name="county" value={address.county} onChange={handleAddressChange} className="login-input"
                          required>
                    <option value="">{"Select county"}</option>
                    {countyOptions.map((county) => (
                      <option key={county.name} value={county.name}>
                        {county.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="login-field">
                  <label className="login-label" htmlFor="edit-postal-code">{"Postal Code"}</label>
                  <input id="edit-postal-code" type="text" name="postal_code" value={address.postal_code}
                         onChange={(event) => handleAddressChange({
                           target: {
                             name: "postal_code",
                             value: event.target.value.replace(/\D/g, "")
                           }
                         })} className="login-input" placeholder="010101" required/>
                </div>
                <div className="login-field sm:col-span-2">
                  <label className="login-label" htmlFor="edit-country">{"Country"}</label>
                  <input id="edit-country" type="text" value={"Romania"} className="login-input" disabled/>
                </div>
              </div>
            </div>
          )}

          <div className="form-action-block">
            <div className="flex justify-end gap-3">
              {step > 1 && (
                <button
                  type="button"
                  onClick={() => setStep(1)}
                  disabled={isSubmitting}
                  className="console-button-secondary rounded-2xl px-4 py-3 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {"Previous"}
                </button>
              )}

              {step < TOTAL_STEPS ? (
                <button
                  type="button"
                  onClick={handleNext}
                  disabled={!isStepOneValid}
                  className="console-button-primary rounded-2xl px-4 py-3 text-sm font-semibold disabled:cursor-not-allowed disabled:border-[#4d5661] disabled:bg-[#3b424b] disabled:text-[#b6bec9]"
                >
                  {"Next"}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    if (!canSubmit || !isStepTwoValid) return
                    onSubmit(normalizedCurrentValues)
                  }}
                  disabled={!canSubmit || !isStepTwoValid}
                  className="console-button-primary rounded-2xl px-4 py-3 text-sm font-semibold disabled:cursor-not-allowed disabled:border-[#4d5661] disabled:bg-[#3b424b] disabled:text-[#b6bec9]"
                >
                  {isSubmitting ? "Saving..." : "Save Changes"}
                </button>
              )}
            </div>
            <p className="form-action-message">
              {step === 1
                ? ("Next opens the address page.")
                : ("Back returns to basic info.")}
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
