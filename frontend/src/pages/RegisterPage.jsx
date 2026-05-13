import {useEffect, useState} from "react"
import {Link, useNavigate} from "react-router-dom"
import {Select} from "@cloudscape-design/components"
import {registerDoctor} from "../services/authApi.js"
import {getDepartments} from "../services/patientApi.js"
import {getErrorMessage, getResponseData, getResponseMessage} from "../services/apiMessages.js"
import {useNotifications} from "../hooks/useNotifications.js"
import {
  buildPatientPhoneNumber,
  ROMANIA_PHONE_PLACEHOLDER,
} from "../utils/patientPhone.js"

function getSelectedOption(options, value) {
  return options.find((option) => option.value === value) || null
}

export default function RegisterPage() {
  const navigate = useNavigate()
  const {notifyError} = useNotifications()

  const [step, setStep] = useState(1)
  const [form, setForm] = useState({
    first_name: "",
    last_name: "",
    birth_date: "",
    email: "",
    phone_number: "",
    specialization: "",
    license_number: "",
    password: "",
    confirm_password: "",
  })
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [departments, setDepartments] = useState([])
  const departmentOptions = departments.map((department) => ({label: department, value: department}))

  useEffect(() => {
    const loadDepartments = async () => {
      try {
        const res = await getDepartments()
        setDepartments(getResponseData(res))
      } catch (error) {
        notifyError(getErrorMessage(error), {duration: 5000})
      }
    }
    loadDepartments()
  }, [notifyError])

  const normalizedPhoneNumber = buildPatientPhoneNumber(form.phone_number)

  const isStepOneValid = Boolean(
    form.first_name.trim()
    && form.last_name.trim()
    && form.email.trim()
    && normalizedPhoneNumber.trim(),
  )

  const isStepTwoValid = Boolean(
    form.specialization.trim()
    && form.license_number.trim()
    && form.birth_date
  )

  const isStepThreeValid = Boolean(
    form.password.trim()
    && form.confirm_password.trim()
  )

  const handleChange = (event) => {
    const {name, value} = event.target
    setForm((prev) => ({...prev, [name]: value}))
  }

  const handlePhoneChange = (event) => {
    const digitsOnly = event.target.value.replace(/\D/g, "").slice(0, 10)

    setForm((prev) => ({
      ...prev,
      phone_number: digitsOnly,
    }))
  }

  const handleNextStep = () => {
    if (step === 1 && !isStepOneValid) {
      return
    }

    if (step === 2 && !isStepTwoValid) {
      return
    }

    setStep((current) => Math.min(current + 1, 3))
  }

  const handlePreviousStep = () => {
    setStep((current) => Math.max(current - 1, 1))
  }

  const handleSubmit = async (event) => {
    event.preventDefault()

    if (!isStepThreeValid || isSubmitting) {
      return
    }

    setIsSubmitting(true)

    try {
      const response = await registerDoctor({
        first_name: form.first_name.trim(),
        last_name: form.last_name.trim(),
        birth_date: form.birth_date,
        email: form.email.trim(),
        phone_number: normalizedPhoneNumber,
        specialization: form.specialization.trim(),
        license_number: form.license_number.trim(),
        password: form.password,
        confirm_password: form.confirm_password,
      })

      navigate("/login", {
        state: {
          message: getResponseMessage(response),
        },
      })
    } catch (error) {
      notifyError(getErrorMessage(error), {duration: 5000})
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="app-shell login-page login-page-centered register-page">
      <div className="login-card monitor-card">
        <div className="login-layout">
          <aside className="login-aside">
            <div className="flex items-center justify-between gap-3">
              <p className="login-brand">MedStream Console</p>
              <Link className="auth-link" to="/login">
                {"Back to login"}
              </Link>
            </div>

            <h1 className="login-title">
              {"Create Doctor Account"}
            </h1>

            <p className="login-subtitle">
              {"Provision a clinician account for access to monitoring, alerts, and patient operations."}
            </p>
            <div className="auth-metrics">
              <div className="auth-metric">
                <p className="auth-metric-label">Monitoring</p>
                <p className="auth-metric-value">Live Patient Insights</p>
                <p className="auth-metric-copy">Patient vitals update instantly through WebSocket streaming.</p>
              </div>
              <div className="auth-metric">
                <p className="auth-metric-label">Alerting</p>
                <p className="auth-metric-value">Instant Risk Detection</p>
                <p className="auth-metric-copy">Critical conditions trigger alerts the moment thresholds are exceeded.</p>
              </div>
            </div>
          </aside>

          <div className="auth-divider" aria-hidden="true"/>

          <div className="login-panel">
            <div className="login-header">
              <p className="login-brand">
                {"Registration"}
              </p>

              <h1 className="login-title">
                {"Doctor Registration"}
              </h1>

              <p className="login-subtitle">
                {"Enter account and professional details to activate console access."}
              </p>

              <div
                className="mt-4 inline-flex rounded-full border border-[var(--border-primary)] bg-[var(--surface-2)] px-4 py-2 text-xs font-semibold uppercase tracking-[0.22em] text-[var(--text-muted)]">
                {"Step"} {step} / 3
              </div>
            </div>

            <form className="login-form" onSubmit={handleSubmit}>
              {step === 1 && (
                <div className="auth-section register-step-card transition-all duration-200">
                  <div className="auth-section-header">
                    <p className="auth-section-label">
                      {"Account Details"}
                    </p>
                    <p className="auth-section-copy">
                      {"Basic identity and contact information."}
                    </p>
                  </div>

                  <div className="register-grid">
                    <div className="login-field">
                      <label className="login-label" htmlFor="first_name">
                        {"First Name"}
                      </label>
                      <input
                        id="first_name"
                        name="first_name"
                        type="text"
                        value={form.first_name}
                        onChange={handleChange}
                        className="login-input"
                        placeholder={"Elena"}
                        required
                      />
                    </div>

                    <div className="login-field">
                      <label className="login-label" htmlFor="last_name">
                        {"Last Name"}
                      </label>
                      <input
                        id="last_name"
                        name="last_name"
                        type="text"
                        value={form.last_name}
                        onChange={handleChange}
                        className="login-input"
                        placeholder={"Popescu"}
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
                      placeholder={"doctor@medstream.ro"}
                      required
                    />
                  </div>

                  <div className="login-field">
                    <label className="login-label" htmlFor="doctor-register-phone-number">
                      {"Phone Number"}
                    </label>
                    <input
                      id="doctor-register-phone-number"
                      name="phone_number"
                      type="text"
                      inputMode="numeric"
                      value={form.phone_number}
                      onChange={handlePhoneChange}
                      placeholder={ROMANIA_PHONE_PLACEHOLDER}
                      className="login-input"
                      maxLength={10}
                      required
                    />
                  </div>
                </div>
              )}

              {step === 2 && (
                <div className="auth-section register-step-card transition-all duration-200">
                  <div className="auth-section-header">
                    <p className="auth-section-label">
                      {"Professional Details"}
                    </p>
                    <p className="auth-section-copy">
                      {"Clinical role and license information."}
                    </p>
                  </div>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="login-field relative z-0">
                      <label className="login-label" htmlFor="specialization">
                        {"Specialization"}
                      </label>
                      <Select
                        selectedOption={getSelectedOption(departmentOptions, form.specialization)}
                        onChange={({detail}) => handleChange({target: {name: "specialization", value: detail.selectedOption.value}})}
                        options={departmentOptions}
                        placeholder="Specialization"
                        selectedAriaLabel="Selected specialization"
                      />
                    </div>

                    <div className="login-field relative z-0">
                      <label className="login-label" htmlFor="license_number">
                        {"License Number"}
                      </label>
                      <input
                        id="license_number"
                        name="license_number"
                        type="text"
                        value={form.license_number}
                        onChange={handleChange}
                        className="login-input w-full"
                        placeholder={"DOC-20458"}
                        required
                      />
                    </div>

                    <div className="login-field relative z-0 sm:col-span-2">
                      <label className="login-label" htmlFor="birth_date">
                        {"Birth Date"}
                      </label>
                      <input
                        id="birth_date"
                        name="birth_date"
                        type="date"
                        value={form.birth_date}
                        onChange={handleChange}
                        className="login-input w-full"
                        required
                      />
                    </div>
                  </div>
                </div>
              )}

              {step === 3 && (
                <div className="auth-section register-step-card transition-all duration-200">
                  <div className="auth-section-header">
                    <p className="auth-section-label">
                      {"Password Setup"}
                    </p>
                    <p className="auth-section-copy">
                      {"Set and confirm the password for the doctor account."}
                    </p>
                  </div>

                  <div className="login-field">
                    <label className="login-label" htmlFor="password">
                      {"Password"}
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
                      {"Confirm Password"}
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

              <div className="auth-actions">
                {step < 3 ? (
                  <div className="form-action-block w-full">
                    <div className="flex w-full gap-3">
                      {step > 1 && (
                        <button
                          type="button"
                          onClick={handlePreviousStep}
                          disabled={isSubmitting}
                          className="console-button-secondary w-full rounded-2xl px-4 py-3 font-semibold"
                        >
                          {"Back"}
                        </button>
                      )}

                      <button
                        type="button"
                        onClick={handleNextStep}
                        disabled={isSubmitting || (step === 1 ? !isStepOneValid : !isStepTwoValid)}
                        className="login-button w-full"
                      >
                        {"Next"}
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="form-action-block w-full">
                    <div className="flex w-full gap-3">
                      <button
                        type="button"
                        onClick={handlePreviousStep}
                        disabled={isSubmitting}
                        className="console-button-secondary w-full rounded-2xl px-4 py-3 font-semibold"
                      >
                        {"Back"}
                      </button>

                      <button
                        type="submit"
                        disabled={!isStepThreeValid || isSubmitting}
                        className="login-button w-full"
                      >
                        {isSubmitting
                          ? ("Creating account...")
                          : ("Create Account")}
                      </button>
                    </div>
                  </div>
                )}

                <div className="flex items-center justify-between gap-3 text-sm">
                  <Link className="auth-link" to="/login">
                    {"Already have an account? Login"}
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
