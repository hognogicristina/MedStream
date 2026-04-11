import {useState} from "react"
import BackButton from "../components/BackButton"
import {useNotifications} from "../components/NotificationProvider"
import {Link, useNavigate} from "react-router-dom"
import {api} from "../services/api"
import {
  buildPatientPhoneNumber,
  getPatientPhoneCountryOptionLabel,
  isValidPatientPhoneNumber,
  PATIENT_PHONE_COUNTRIES,
} from "../utils/patientPhone"
import {buildEmptyPatientAddress, isValidPatientAddress, normalizePatientAddress} from "../utils/patientAddress"

export default function AddPatientPage() {
  const navigate = useNavigate()
  const {notifyError} = useNotifications()
  const [form, setForm] = useState({
    first_name: "",
    last_name: "",
    cnp: "",
    birth_date: "",
    gender: "",
    department: "ER",
  })
  const [address, setAddress] = useState(buildEmptyPatientAddress())
  const [phoneCountryCode, setPhoneCountryCode] = useState(PATIENT_PHONE_COUNTRIES[0].code)
  const [phoneLocalNumber, setPhoneLocalNumber] = useState("")
  const [isSubmitting, setIsSubmitting] = useState(false)
  const normalizedPhoneNumber = buildPatientPhoneNumber(phoneCountryCode, phoneLocalNumber)
  const isPatientFormValid = form.first_name.trim()
    && form.last_name.trim()
    && /^\d{13}$/.test(form.cnp.trim())
    && isValidPatientPhoneNumber(normalizedPhoneNumber)
    && form.birth_date
    && form.gender.trim()
    && form.department.trim()
    && isValidPatientAddress(address)

  const handleChange = (event) => {
    const {name, value} = event.target
    setForm((prev) => ({
      ...prev,
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

  const handleSubmit = async (event) => {
    event.preventDefault()
    if (!isPatientFormValid || isSubmitting) {
      return
    }
    setIsSubmitting(true)

    try {
      const response = await api.post("/patients", {
        ...form,
        phone_number: normalizedPhoneNumber,
        address: normalizePatientAddress(address),
      })
      navigate(`/patient/${response.data.id}`)
    } catch (error) {
      notifyError(error.response?.data?.detail || "Unable to create patient")
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="app-shell min-h-screen px-4 py-6 text-slate-100 sm:px-6 lg:px-8">
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
        <header className="console-topbar rounded-[24px] p-6 sm:p-8">
          <div className="flex flex-col gap-3">
            <div className="flex items-start justify-between gap-4">
              <p className="text-xs font-semibold uppercase tracking-[0.35em] text-[#ff9900]">Patient Intake</p>
              <BackButton/>
            </div>
            <div>
              <h1 className="text-3xl font-semibold tracking-tight text-white sm:text-4xl">Add Patient</h1>
              <p className="mt-2 max-w-2xl text-sm text-[#b6bec9] sm:text-base">Create a patient admission record.</p>
            </div>
          </div>
        </header>

        <section className="monitor-card rounded-[28px] p-6">
          <div className="mb-5">
            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-[#ff9900]">Admission Form</p>
            <h2 className="mt-2 text-2xl font-semibold text-white">Create Patient Record</h2>
          </div>

          <form className="space-y-4" onSubmit={handleSubmit}>
            <div className="grid gap-4 sm:grid-cols-2">
              <input
                type="text"
                name="first_name"
                value={form.first_name}
                onChange={handleChange}
                placeholder="First name"
                className="console-input w-full rounded-2xl px-4 py-3 outline-none"
                required
              />
              <input
                type="text"
                name="last_name"
                value={form.last_name}
                onChange={handleChange}
                placeholder="Last name"
                className="console-input w-full rounded-2xl px-4 py-3 outline-none"
                required
              />
            </div>

            <input
              type="text"
              name="cnp"
              value={form.cnp}
              onChange={handleChange}
              placeholder="CNP"
              className="console-input w-full rounded-2xl px-4 py-3 outline-none"
              required
            />

            <div className="grid gap-3 sm:grid-cols-[220px_minmax(0,1fr)]">
              <select
                value={phoneCountryCode}
                onChange={(event) => setPhoneCountryCode(event.target.value)}
                className="console-input w-full rounded-2xl px-4 py-3 outline-none"
                aria-label="Phone country code"
                required
              >
                {PATIENT_PHONE_COUNTRIES.map((country) => (
                  <option key={country.code} value={country.code}>
                    {getPatientPhoneCountryOptionLabel(country)}
                  </option>
                ))}
              </select>
              <input
                type="tel"
                name="phone_number"
                value={phoneLocalNumber}
                onChange={(event) => setPhoneLocalNumber(event.target.value.replace(/\D/g, ""))}
                placeholder="Phone number"
                className="console-input w-full rounded-2xl px-4 py-3 outline-none"
                required
              />
            </div>
            <p className="text-xs text-[#879196]">Stored as {normalizedPhoneNumber || `${phoneCountryCode} ...`}</p>

            <div className="grid gap-4 sm:grid-cols-3">
              <input
                type="date"
                name="birth_date"
                value={form.birth_date}
                onChange={handleChange}
                className="console-input w-full rounded-2xl px-4 py-3 outline-none"
                required
              />
              <select
                name="gender"
                value={form.gender}
                onChange={handleChange}
                className="console-input w-full rounded-2xl px-4 py-3 outline-none"
                required
              >
                <option value="">Gender</option>
                <option value="male">Male</option>
                <option value="female">Female</option>
              </select>
              <select
                name="department"
                value={form.department}
                onChange={handleChange}
                className="console-input w-full rounded-2xl px-4 py-3 outline-none"
                required
              >
                <option value="ER">ER</option>
                <option value="ICU">ICU</option>
                <option value="Cardiology">Cardiology</option>
                <option value="Internal Medicine">Internal Medicine</option>
                <option value="Neurology">Neurology</option>
                <option value="Ward">Ward</option>
              </select>
            </div>

            <div className="rounded-2xl border border-[#3b424b] bg-[#151b22] p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[#879196]">Address</p>
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <input
                  type="text"
                  name="street"
                  value={address.street}
                  onChange={handleAddressChange}
                  placeholder="Street"
                  className="console-input w-full rounded-2xl px-4 py-3 outline-none"
                  required
                />
                <input
                  type="text"
                  name="number"
                  value={address.number}
                  onChange={handleAddressChange}
                  placeholder="Number"
                  className="console-input w-full rounded-2xl px-4 py-3 outline-none"
                  required
                />
                <input
                  type="text"
                  name="apartment"
                  value={address.apartment}
                  onChange={handleAddressChange}
                  placeholder="Apartment (optional)"
                  className="console-input w-full rounded-2xl px-4 py-3 outline-none"
                />
                <input
                  type="text"
                  name="city"
                  value={address.city}
                  onChange={handleAddressChange}
                  placeholder="City"
                  className="console-input w-full rounded-2xl px-4 py-3 outline-none"
                  required
                />
                <input
                  type="text"
                  name="state"
                  value={address.state}
                  onChange={handleAddressChange}
                  placeholder="County / State"
                  className="console-input w-full rounded-2xl px-4 py-3 outline-none"
                  required
                />
                <input
                  type="text"
                  name="postal_code"
                  value={address.postal_code}
                  onChange={handleAddressChange}
                  placeholder="Postal code"
                  className="console-input w-full rounded-2xl px-4 py-3 outline-none"
                  required
                />
                <input
                  type="text"
                  name="country"
                  value={address.country}
                  onChange={handleAddressChange}
                  placeholder="Country"
                  className="console-input w-full rounded-2xl px-4 py-3 outline-none sm:col-span-2"
                  required
                />
              </div>
            </div>
            <div className="flex flex-col gap-3 sm:flex-row">
              <button
                type="submit"
                disabled={!isPatientFormValid || isSubmitting}
                className="console-button-primary flex-1 rounded-2xl px-4 py-3 disabled:cursor-not-allowed disabled:border-[#4d5661] disabled:bg-[#3b424b] disabled:text-[#b6bec9]"
              >
                {isSubmitting ? "Creating patient..." : "Create Patient"}
              </button>
              <Link className="console-button-secondary rounded-2xl px-4 py-3 text-center font-semibold" to="/dashboard">
                Cancel
              </Link>
            </div>
          </form>
        </section>
      </div>
    </div>
  )
}
