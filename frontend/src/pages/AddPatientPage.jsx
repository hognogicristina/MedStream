import {useEffect, useState} from "react"
import BackButton from "../components/BackButton"
import {useNotifications} from "../components/NotificationProvider"
import {Link, useNavigate} from "react-router-dom"
import {api} from "../services/api"
import {getErrorMessage, getResponseData} from "../services/apiMessages"
import {buildPatientPhoneNumber, ROMANIA_PHONE_PLACEHOLDER} from "../utils/patientPhone"
import {getCityOptions, getCountyOptions} from "../utils/addressOptions"
import {buildEmptyPatientAddress, normalizePatientAddress} from "../utils/patientAddress"

const TOTAL_STEPS = 2

export default function AddPatientPage() {
  const navigate = useNavigate()
  const {notifyError} = useNotifications()
  const [step, setStep] = useState(1)
  const [form, setForm] = useState({
    first_name: "",
    last_name: "",
    cnp: "",
    birth_date: "",
    gender: "",
    department: "ER",
    arrival_method: "self",
  })
  const [address, setAddress] = useState(buildEmptyPatientAddress())
  const [phoneNumber, setPhoneNumber] = useState("")
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [departments, setDepartments] = useState([])


  const normalizedPhoneNumber = buildPatientPhoneNumber(phoneNumber)
  const isStepOneValid = Boolean(
    form.first_name.trim()
    && form.last_name.trim()
    && form.cnp.trim()
    && form.birth_date
    && form.gender.trim()
    && form.department.trim()
    && normalizedPhoneNumber.trim(),
  )
  const isStepTwoValid = Boolean(
    address.street.trim()
    && address.number.trim()
    && address.city.trim()
    && address.county.trim()
    && address.postal_code.trim(),
  )

  const handleChange = (event) => {
    const {name, value} = event.target
    setForm((prev) => ({...prev, [name]: value}))
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

  const countyOptions = getCountyOptions()
  const cityOptions = getCityOptions(address.county)

  const handleSubmit = async (event) => {
    event.preventDefault()

    if (step < TOTAL_STEPS) {
      if (isStepOneValid && !isSubmitting) setStep(2)
      return
    }

    if (!isStepOneValid || !isStepTwoValid || isSubmitting) {
      return
    }

    setIsSubmitting(true)

    try {
      const response = await api.post("/patients", {
        ...form,
        phone_number: normalizedPhoneNumber,
        address: normalizePatientAddress(address),
      })
      navigate(`/patient/${getResponseData(response).id}`)
    } catch (error) {
      notifyError(getErrorMessage(error))
    } finally {
      setIsSubmitting(false)
    }
  }

  useEffect(() => {
    const loadDepartments = async () => {
      try {
        const res = await api.get("/departments")
        setDepartments(getResponseData(res))
      } catch (error) {
        notifyError(getErrorMessage(error))
      }
    }

    loadDepartments()
  }, [notifyError])

  useEffect(() => {
    if (departments.length > 0 && !form.department) {
      setForm((prev) => ({
        ...prev,
        department: departments[0],
      }))
    }
  }, [departments])

  return (
    <div className="app-shell min-h-screen px-4 py-6 text-slate-100 sm:px-6 lg:px-8">
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
        <header className="console-topbar rounded-[24px] p-6 sm:p-8">
          <div className="flex flex-col gap-3">
            <div className="flex items-start justify-between gap-4">
              <p className="text-xs font-semibold uppercase tracking-[0.35em] text-[#ff9900]">{"Patient Intake"}</p>
              <BackButton/>
            </div>
            <div>
              <h1 className="text-3xl font-semibold tracking-tight text-white sm:text-4xl">{"Add Patient"}</h1>
              <p className="mt-2 max-w-2xl text-sm text-[#b6bec9] sm:text-base">{"Create a patient admission record."}</p>
            </div>
          </div>
        </header>

        <section className="monitor-card rounded-[28px] p-6">
          <div className="mb-5 flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.3em] text-[#ff9900]">{"Admission Form"}</p>
              <h2 className="mt-2 text-2xl font-semibold text-white">{"Create Patient Record"}</h2>
            </div>
            <div
              className="rounded-full border border-[#3b424b] px-4 py-2 text-xs font-semibold uppercase tracking-[0.22em] text-[#879196]">
              {"Step"} {step} / {TOTAL_STEPS}
            </div>
          </div>

          <form className="space-y-5" onSubmit={handleSubmit}>
            {step === 1 && (
              <div className="space-y-4">
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[#879196]">{"Basic Info"}</p>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="login-field">
                    <label className="login-label" htmlFor="patient-first-name">{"First Name"}</label>
                    <input id="patient-first-name" type="text" name="first_name" value={form.first_name} onChange={handleChange}
                           placeholder={"Example: Andrei"} className="login-input" required/>
                  </div>
                  <div className="login-field">
                    <label className="login-label" htmlFor="patient-last-name">{"Last Name"}</label>
                    <input id="patient-last-name" type="text" name="last_name" value={form.last_name} onChange={handleChange}
                           placeholder={"Example: Popescu"} className="login-input" required/>
                  </div>
                  <div className="login-field">
                    <label className="login-label" htmlFor="patient-gender">{"Gender"}</label>
                    <select id="patient-gender" name="gender" value={form.gender} onChange={handleChange} className="login-input" required>
                      <option value="">{"Gender"}</option>
                      <option value="male">{"Male"}</option>
                      <option value="female">{"Female"}</option>
                      <option value="other">{"Other"}</option>
                    </select>
                  </div>
                  <div className="login-field">
                    <label className="login-label" htmlFor="patient-birth-date">{"Birth Date"}</label>
                    <input id="patient-birth-date" type="date" name="birth_date" value={form.birth_date} onChange={handleChange}
                           className="login-input" required/>
                  </div>
                  <div className="login-field">
                    <label className="login-label" htmlFor="patient-cnp">CNP</label>
                    <input id="patient-cnp" type="text" name="cnp" value={form.cnp} onChange={handleChange}
                           placeholder={"Example: 6010101123451"} className="login-input" required/>
                  </div>
                  <div className="login-field">
                    <label className="login-label" htmlFor="patient-phone-number">{"Phone Number"}</label>
                    <input id="patient-phone-number" type="tel" value={phoneNumber}
                           onChange={(event) => setPhoneNumber(event.target.value.replace(/\D/g, ""))}
                           placeholder={ROMANIA_PHONE_PLACEHOLDER} className="login-input" required/>
                  </div>
                  <div className="login-field">
                    <label className="login-label" htmlFor="patient-department">{"Department"}</label>
                    <select id="patient-department" name="department" value={form.department} onChange={handleChange}
                            className="login-input" required>
                      {departments.map((department) => (
                        <option key={department} value={department}>
                          {department}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="login-field">
                    <label className="login-label" htmlFor="patient-arrival-method">{"Arrival Method"}</label>
                    <select
                      id="patient-arrival-method"
                      name="arrival_method"
                      value={form.arrival_method}
                      onChange={handleChange}
                      className="login-input"
                      required
                    >
                      <option value="self">{"Self"}</option>
                      <option value="ambulance">{"Ambulance"}</option>
                    </select>
                  </div>
                </div>
              </div>
            )}

            {step === 2 && (
              <div className="space-y-4">
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[#879196]">{"Address"}</p>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="login-field">
                    <label className="login-label" htmlFor="add-street">{"Street"}</label>
                    <input id="add-street" type="text" name="street" value={address.street} onChange={handleAddressChange}
                           placeholder={"Example: Liberty Street"} className="login-input" required/>
                  </div>
                  <div className="login-field">
                    <label className="login-label" htmlFor="add-number">{"Number"}</label>
                    <input id="add-number" type="text" name="number" value={address.number} onChange={handleAddressChange}
                           placeholder={"Example: 12A"} className="login-input" required/>
                  </div>
                  <div className="login-field">
                    <label className="login-label" htmlFor="add-apartment">{"Apartment"}</label>
                    <input id="add-apartment" type="text" name="apartment" value={address.apartment} onChange={handleAddressChange}
                           placeholder={"Example: 24"} className="login-input"/>
                  </div>
                  <div className="login-field">
                    <label className="login-label" htmlFor="add-county">{"County"}</label>
                    <select id="add-county" name="county" value={address.county} onChange={handleAddressChange} className="login-input"
                            required disabled={countyOptions.length === 0}>
                      <option value="">{"Select county"}</option>
                      {countyOptions.map((county) => (
                        <option key={county.name} value={county.name}>
                          {county.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="login-field">
                    <label className="login-label" htmlFor="add-city">{"City"}</label>
                    <select id="add-city" name="city" value={address.city} onChange={handleAddressChange} className="login-input" required
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
                    <label className="login-label" htmlFor="add-postal-code">{"Postal Code"}</label>
                    <input id="add-postal-code" type="text" name="postal_code" value={address.postal_code}
                           onChange={(event) => handleAddressChange({
                             target: {
                               name: "postal_code",
                               value: event.target.value.replace(/\D/g, "")
                             }
                           })} placeholder="010101" className="login-input" required/>
                  </div>
                  <div className="login-field sm:col-span-2">
                    <label className="login-label" htmlFor="add-country">{"Country"}</label>
                    <input id="add-country" type="text" value={"Romania"} className="login-input" disabled/>
                  </div>
                </div>
              </div>
            )}

            <div className="form-action-block">
              <div className="flex flex-col gap-3 sm:flex-row sm:justify-end">
                {step > 1 ? (
                  <button type="button" onClick={() => setStep(1)} disabled={isSubmitting}
                          className="console-button-secondary rounded-2xl px-4 py-3 font-semibold disabled:cursor-not-allowed disabled:opacity-60">
                    {"Previous"}
                  </button>
                ) : (
                  <Link className="console-button-secondary rounded-2xl px-4 py-3 text-center font-semibold" to="/dashboard">
                    {"Cancel"}
                  </Link>
                )}

                {step < TOTAL_STEPS ? (
                  <button type="button" onClick={() => setStep(2)} disabled={!isStepOneValid || isSubmitting}
                          className="console-button-primary rounded-2xl px-4 py-3 font-semibold disabled:cursor-not-allowed disabled:border-[#4d5661] disabled:bg-[#3b424b] disabled:text-[#b6bec9]">
                    {"Next"}
                  </button>
                ) : (
                  <button type="submit" disabled={!isStepTwoValid || isSubmitting}
                          className="console-button-primary rounded-2xl px-4 py-3 font-semibold disabled:cursor-not-allowed disabled:border-[#4d5661] disabled:bg-[#3b424b] disabled:text-[#b6bec9]">
                    {isSubmitting ? ("Creating patient...") : ("Create Patient")}
                  </button>
                )}
              </div>
            </div>
          </form>
        </section>
      </div>
    </div>
  )
}
