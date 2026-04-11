import {useState} from "react"
import {Link, useNavigate} from "react-router-dom"
import {api} from "../services/api"

export default function RegisterPage() {
  const navigate = useNavigate()
  const [step, setStep] = useState(1)
  const [form, setForm] = useState({
    first_name: "",
    last_name: "",
    email: "",
    phone_number: "",
    specialization: "",
    license_number: "",
    password: "",
    confirm_password: "",
  })
  const [phonePrefix, setPhonePrefix] = useState("+40")
  const [phoneLocalNumber, setPhoneLocalNumber] = useState("")
  const [message, setMessage] = useState("")
  const [isError, setIsError] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const isStepOneValid = Boolean(
    form.first_name.trim()
    && form.last_name.trim()
    && /\S+@\S+\.\S+/.test(form.email.trim())
    && form.phone_number.trim(),
  )
  const isStepTwoValid = Boolean(form.specialization.trim() && form.license_number.trim())
  const isStepThreeValid = Boolean(
    form.password.trim()
    && form.confirm_password.trim()
    && form.password === form.confirm_password,
  )

  const handleChange = (event) => {
    const {name, value} = event.target
    setForm((prev) => ({...prev, [name]: value}))
  }

  const handlePhonePrefixChange = (value) => {
    setPhonePrefix(value)
    setForm((prev) => ({
      ...prev,
      phone_number: phoneLocalNumber ? `${value}${phoneLocalNumber}` : "",
    }))
  }

  const handlePhoneNumberChange = (value) => {
    const sanitizedValue = value.replace(/\D/g, "")
    setPhoneLocalNumber(sanitizedValue)
    setForm((prev) => ({
      ...prev,
      phone_number: sanitizedValue ? `${phonePrefix}${sanitizedValue}` : "",
    }))
  }

  const handleNextStep = () => {
    if (step === 1 && !isStepOneValid) {
      setIsError(true)
      setMessage("Complete all account details before continuing.")
      return
    }

    if (step === 2 && !isStepTwoValid) {
      setIsError(true)
      setMessage("Complete all professional details before continuing.")
      return
    }

    setMessage("")
    setIsError(false)
    setStep((current) => Math.min(current + 1, 3))
  }

  const handlePreviousStep = () => {
    setMessage("")
    setIsError(false)
    setStep((current) => Math.max(current - 1, 1))
  }

  const handleSubmit = async (event) => {
    event.preventDefault()
    if (!isStepThreeValid || isSubmitting) {
      return
    }
    setMessage("")
    setIsError(false)

    setIsSubmitting(true)

    try {
      await api.post("/register", {
        first_name: form.first_name,
        last_name: form.last_name,
        email: form.email,
        phone_number: form.phone_number,
        specialization: form.specialization,
        license_number: form.license_number,
        password: form.password,
      })
      navigate("/login", {
        state: {
          message: "Account created. Sign in to open the MedStream dashboard.",
        },
      })
    } catch (error) {
      setIsError(true)
      setMessage(error.response?.data?.detail || "Unable to create account")
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="app-shell login-page register-page">
      <div className="login-card monitor-card">
        <div className="login-layout">
          <aside className="login-aside">
            <div className="flex items-center justify-between gap-3">
              <p className="login-brand">MedStream Console</p>
              <Link className="auth-link" to="/">
                Back home
              </Link>
            </div>
            <h1 className="login-title">Create Doctor Account</h1>
            <p className="login-subtitle">Provision a clinician account for access to monitoring, alerts, and patient operations.</p>
            <div className="auth-metrics">
              <div className="auth-metric">
                <p className="auth-metric-label">Identity</p>
                <p className="auth-metric-value">Named clinician record</p>
                <p className="auth-metric-copy">First name, last name, email, specialization, and license are stored together.</p>
              </div>
              <div className="auth-metric">
                <p className="auth-metric-label">Outcome</p>
                <p className="auth-metric-value">Console-ready access</p>
                <p className="auth-metric-copy">Registration leads directly to the login flow for dashboard entry.</p>
              </div>
            </div>
          </aside>

          <div className="auth-divider" aria-hidden="true"/>

          <div className="login-panel">
            <div className="login-header">
              <p className="login-brand">Registration</p>
              <h1 className="login-title">Doctor Registration</h1>
              <p className="login-subtitle">Enter account and professional details to activate console access.</p>
              <div className="mt-4 inline-flex rounded-full border border-[#3b424b] bg-[#151b22] px-4 py-2 text-xs font-semibold uppercase tracking-[0.22em] text-[#879196]">
                Step {step} / Step 3
              </div>
            </div>

            <form className="login-form" onSubmit={handleSubmit}>
              {step === 1 ? (
                <div className="auth-section register-step-card transition-all duration-200">
                  <div className="auth-section-header">
                    <p className="auth-section-label">Account Details</p>
                    <p className="auth-section-copy">Basic identity and contact information.</p>
                  </div>

                  <div className="register-grid">
                    <div className="login-field">
                      <label className="login-label" htmlFor="first_name">
                        First Name
                      </label>
                      <input
                        id="first_name"
                        name="first_name"
                        type="text"
                        value={form.first_name}
                        onChange={handleChange}
                        className="login-input"
                        required
                      />
                    </div>

                    <div className="login-field">
                      <label className="login-label" htmlFor="last_name">
                        Last Name
                      </label>
                      <input
                        id="last_name"
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
                    <label className="login-label" htmlFor="email">
                      Email
                    </label>
                    <input
                      id="email"
                      name="email"
                      type="email"
                      value={form.email}
                      onChange={handleChange}
                      className="login-input"
                      required
                    />
                  </div>

                  <div className="login-field">
                    <label className="login-label" htmlFor="phone_local_number">
                      Phone Number
                    </label>
                    <div className="phone-field-row">
                      <select
                        value={phonePrefix}
                        onChange={(event) => handlePhonePrefixChange(event.target.value)}
                        className="login-input auth-phone-prefix"
                        aria-label="Country code"
                      >
                        <option value="+40">+40</option>
                        <option value="+44">+44</option>
                        <option value="+1">+1</option>
                      </select>
                      <input
                        id="phone_local_number"
                        type="text"
                        value={phoneLocalNumber}
                        onChange={(event) => handlePhoneNumberChange(event.target.value)}
                        className="login-input"
                        placeholder="712345678"
                        required
                      />
                    </div>
                  </div>
                </div>
              ) : step === 2 ? (
                <div className="auth-section register-step-card transition-all duration-200">
                  <div className="auth-section-header">
                    <p className="auth-section-label">Professional Details</p>
                    <p className="auth-section-copy">Clinical role and license information.</p>
                  </div>

                  <div className="register-grid">
                    <div className="login-field">
                      <label className="login-label" htmlFor="specialization">
                        Specialization
                      </label>
                      <input
                        id="specialization"
                        name="specialization"
                        type="text"
                        value={form.specialization}
                        onChange={handleChange}
                        className="login-input"
                        required
                      />
                    </div>

                    <div className="login-field">
                      <label className="login-label" htmlFor="license_number">
                        License Number
                      </label>
                      <input
                        id="license_number"
                        name="license_number"
                        type="text"
                        value={form.license_number}
                        onChange={handleChange}
                        className="login-input"
                        required
                      />
                    </div>
                  </div>
                </div>
              ) : (
                <div className="auth-section register-step-card transition-all duration-200">
                  <div className="auth-section-header">
                    <p className="auth-section-label">Password Setup</p>
                    <p className="auth-section-copy">Set and confirm the password for the doctor account.</p>
                  </div>

                  <div className="login-field">
                    <label className="login-label" htmlFor="password">
                      Password
                    </label>
                    <input
                      id="password"
                      name="password"
                      type="password"
                      value={form.password}
                      onChange={handleChange}
                      className="login-input"
                      required
                    />
                  </div>

                  <div className="login-field">
                    <label className="login-label" htmlFor="confirm_password">
                      Confirm Password
                    </label>
                    <input
                      id="confirm_password"
                      name="confirm_password"
                      type="password"
                      value={form.confirm_password}
                      onChange={handleChange}
                      className="login-input"
                      required
                    />
                  </div>
                </div>
              )}

              {message && (
                <p className={isError ? "login-error" : "login-success"}>
                  {message}
                </p>
              )}

              <div className="auth-actions">
                {step < 3 ? (
                  <div className="flex gap-3">
                    {step > 1 && (
                      <button
                        type="button"
                        onClick={handlePreviousStep}
                        disabled={isSubmitting}
                        className="console-button-secondary w-full rounded-2xl px-4 py-3 font-semibold"
                      >
                        Back
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={handleNextStep}
                      disabled={isSubmitting || (step === 1 ? !isStepOneValid : !isStepTwoValid)}
                      className="login-button"
                    >
                      Next
                    </button>
                  </div>
                ) : (
                  <div className="flex gap-3">
                    <button
                      type="button"
                      onClick={handlePreviousStep}
                      disabled={isSubmitting}
                      className="console-button-secondary w-full rounded-2xl px-4 py-3 font-semibold"
                    >
                      Back
                    </button>
                    <button
                      type="submit"
                      disabled={!isStepThreeValid || isSubmitting}
                      className="login-button"
                    >
                      {isSubmitting ? "Creating account..." : "Create Account"}
                    </button>
                  </div>
                )}

                <div className="flex items-center justify-between gap-3 text-sm">
                  <Link className="auth-link" to="/login">
                    Already have an account? Login
                  </Link>
                  <Link className="auth-link" to="/">
                    Return home
                  </Link>
                </div>
              </div>
            </form>
          </div>
        </div>
      </div>
    </div>
  )
}
