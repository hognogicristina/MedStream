import {useEffect, useState} from "react"
import {
  Box,
  Button,
  ColumnLayout,
  Container,
  ContentLayout,
  Header,
  SpaceBetween,
  StatusIndicator,
} from "@cloudscape-design/components"
import {useNotifications} from "../hooks/useNotifications.js"
import {useAuth} from "../components/AuthContext.jsx"
import {useNavigate} from "react-router-dom"
import {createPatient} from "../services/patientApi.js"
import {assignPatientToDoctor, getCurrentDoctor} from "../services/doctorApi.js"
import {getErrorMessage, getResponseData} from "../services/apiMessages.js"
import {buildPatientPhoneNumber, ROMANIA_PHONE_PLACEHOLDER} from "../utils/patientPhone.js"
import {getCityOptions, getCountyOptions} from "../utils/addressOptions.js"
import {buildEmptyPatientAddress, normalizePatientAddress} from "../utils/patientAddress.js"
import AppBreadcrumbs from "../components/AppBreadcrumbs.jsx"

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
    arrival_method: "self",
    is_pregnant: false,
  })
  const [address, setAddress] = useState(buildEmptyPatientAddress())
  const [phoneNumber, setPhoneNumber] = useState("")
  const [isSubmitting, setIsSubmitting] = useState(false)
  const {token} = useAuth()
  const [currentDoctor, setCurrentDoctor] = useState(null)


  const normalizedPhoneNumber = buildPatientPhoneNumber(phoneNumber)
  const isStepOneValid = Boolean(
    form.first_name.trim()
    && form.last_name.trim()
    && form.cnp.trim()
    && form.birth_date
    && form.gender.trim()
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
    setForm((prev) => {
      const updates = {[name]: name === "is_pregnant" ? value === "true" : value}
      if (name === "gender" && value === "male") {
        updates.is_pregnant = false
      }
      return {...prev, ...updates}
    })
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
      const response = await createPatient({
        ...form,
        department: currentDoctor?.specialization || "ER",
        phone_number: normalizedPhoneNumber,
        address: normalizePatientAddress(address),
      })
      const patientData = getResponseData(response)

      if (currentDoctor?.id) {
        try {
          await assignPatientToDoctor(currentDoctor.id, patientData.id, token ? {Authorization: `Bearer ${token}`} : {})
        } catch (assignError) {
          console.error("Failed to assign patient to doctor", assignError)
        }
      }

      navigate(`/patient/${patientData.id}`)
    } catch (error) {
      notifyError(getErrorMessage(error))
    } finally {
      setIsSubmitting(false)
    }
  }

  useEffect(() => {
    const fetchMe = async () => {
      if (!token) return
      try {
        const res = await getCurrentDoctor({Authorization: `Bearer ${token}`})
        setCurrentDoctor(getResponseData(res))
      } catch (error) {
        console.error("Failed to load current doctor", error)
      }
    }
    fetchMe()
  }, [token])

  return (
    <ContentLayout>
      <SpaceBetween size="m">
        <div className="medstream-page-header">
          <AppBreadcrumbs/>
          <div className="medstream-page-heading-row">
            <div>
              <h1 className="medstream-page-title">Add Patient</h1>
              <p>Create a patient admission record for the current department.</p>
            </div>
          </div>
        </div>

        <Container>
          <ColumnLayout columns={3} variant="text-grid">
            <SpaceBetween size="xs">
              <Box color="text-body-secondary" variant="awsui-key-label">Workflow</Box>
              <Box variant="h2">Patient intake</Box>
            </SpaceBetween>
            <SpaceBetween size="xs">
              <Box color="text-body-secondary" variant="awsui-key-label">Department</Box>
              <Box variant="h2">{currentDoctor?.specialization || "ER"}</Box>
            </SpaceBetween>
            <SpaceBetween size="xs">
              <Box color="text-body-secondary" variant="awsui-key-label">Step</Box>
              <Box variant="h2">{step} / {TOTAL_STEPS}</Box>
            </SpaceBetween>
          </ColumnLayout>
        </Container>

        <Container
          header={
            <Header
              variant="h2"
              description={step === 1 ? "Enter identity, contact, and arrival details." : "Enter the patient's address details."}
              actions={<StatusIndicator type={step === 1 ? "pending" : "in-progress"}>{step === 1 ? "Basic info" : "Address"}</StatusIndicator>}
            >
              Create patient record
            </Header>
          }
        >
          <form className="medstream-form" onSubmit={handleSubmit}>
            {step === 1 && (
              <SpaceBetween size="m">
                <Header variant="h3">Basic info</Header>
                <div className="medstream-form-grid">
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
                    <label className="login-label" htmlFor="patient-pregnant">{"Pregnant"}</label>
                    <select
                      id="patient-pregnant"
                      name="is_pregnant"
                      value={String(form.is_pregnant)}
                      onChange={handleChange}
                      className="login-input"
                      disabled={!form.gender || form.gender === "male"}
                      required
                    >
                      <option value="false">{"No"}</option>
                      <option value="true">{"Yes"}</option>
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
              </SpaceBetween>
            )}

            {step === 2 && (
              <SpaceBetween size="m">
                <Header variant="h3">Address</Header>
                <div className="medstream-form-grid">
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
                               value: event.target.value.replace(/\D/g, ""),
                             }
                           })} placeholder="010101" className="login-input" required/>
                  </div>
                  <div className="login-field medstream-form-field-wide">
                    <label className="login-label" htmlFor="add-country">{"Country"}</label>
                    <input id="add-country" type="text" value={"Romania"} className="login-input" disabled/>
                  </div>
                </div>
              </SpaceBetween>
            )}

            <div className="medstream-form-actions">
              <SpaceBetween direction="horizontal" size="xs">
                {step > 1 ? (
                  <Button formAction="none" onClick={() => setStep(1)} disabled={isSubmitting}>Previous</Button>
                ) : (
                  <Button formAction="none" onClick={() => navigate("/dashboard")}>Cancel</Button>
                )}

                {step < TOTAL_STEPS ? (
                  <Button formAction="none" variant="primary" onClick={() => setStep(2)} disabled={!isStepOneValid || isSubmitting}>Next</Button>
                ) : (
                  <Button formAction="submit" variant="primary" disabled={!isStepTwoValid || isSubmitting}>
                    {isSubmitting ? "Creating patient..." : "Create patient"}
                  </Button>
                )}
              </SpaceBetween>
            </div>
          </form>
        </Container>
      </SpaceBetween>
    </ContentLayout>
  )
}
