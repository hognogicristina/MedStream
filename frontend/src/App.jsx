import {BrowserRouter, Navigate, Route, Routes, useLocation, useNavigate} from "react-router-dom"
import {useEffect} from "react"
import AuthenticatedLayout from "./components/AuthenticatedLayout.jsx"
import {useAuth} from "./components/AuthContext.jsx"
import ProtectedRoute from "./components/ProtectedRoute.jsx"
import PublicOnlyRoute from "./components/PublicOnlyRoute.jsx"
import LoadingSpinner from "./components/LoadingSpinner.jsx"
import {registerAuthFailureHandler} from "./services/api.js"
import AddPatientPage from "./pages/AddPatientPage.jsx"
import AlertsPage from "./pages/AlertsPage.jsx"
import BatchMetricsPage from "./pages/BatchMetricsPage.jsx"
import DepartmentPage from "./pages/DepartmentPage.jsx"
import DashboardPage from "./pages/DashboardPage.jsx"
import ForgotPasswordPage from "./pages/ForgotPasswordPage.jsx"
import HowItWorksPage from "./pages/HowItWorksPage.jsx"
import LoginPage from "./pages/LoginPage.jsx"
import PatientPage from "./pages/PatientPage.jsx"
import PatientDiagnosisPage from "./pages/PatientDiagnosisPage.jsx"
import PatientAdmissionHistoryPage from "./pages/PatientAdmissionHistoryPage.jsx"
import PatientMedicalHistoryPage from "./pages/PatientMedicalHistoryPage.jsx"
import PatientPostDischargeSummaryPage from "./pages/PatientPostDischargeSummaryPage.jsx"
import PatientTreatmentAnalysisPage from "./pages/PatientTreatmentAnalysisPage.jsx"
import ProfilePage from "./pages/ProfilePage.jsx"
import RecoverAccountPage from "./pages/RecoverAccountPage.jsx"
import RecoverAccountVerifyPage from "./pages/RecoverAccountVerifyPage.jsx"
import RegisterPage from "./pages/RegisterPage.jsx"
import ResetPasswordPage from "./pages/ResetPasswordPage.jsx"
import StreamingMetricsPage from "./pages/StreamingMetricsPage.jsx"
import StreamingBatchPage from "./pages/StreamingBatchPage.jsx"
import VerifyEmailPage from "./pages/VerifyEmailPage.jsx"
import {getPatient} from "./services/patientApi.js"
import {getResponseData} from "./services/apiMessages.js"
import {formatPatientFullName} from "./utils/patients.js"

function RootRoute() {
  const {isAuthenticated, isAuthResolved} = useAuth()

  if (!isAuthResolved) {
    return <LoadingSpinner/>
  }

  return <Navigate to={isAuthenticated ? "/dashboard" : "/login"} replace/>
}

function ApiAuthBridge() {
  const navigate = useNavigate()
  const location = useLocation()
  const {logout} = useAuth()
  const isAuthRoute = [
    "/login",
    "/register",
    "/forgot-password",
    "/reset-password",
    "/verify-email",
    "/recover-account",
    "/recover-account/verify",
  ].includes(location.pathname)

  useEffect(() => {
    registerAuthFailureHandler(() => {
      logout()
      if (!isAuthRoute) {
        navigate("/login", {replace: true})
      }
    })

    return () => {
      registerAuthFailureHandler(null)
    }
  }, [isAuthRoute, logout, navigate])

  return null
}

function resolveStaticTitle(pathname) {
  if (pathname === "/dashboard") {
    return "Dashboard"
  }
  if (pathname === "/metrics/streaming") {
    return "Streaming Monitoring"
  }
  if (pathname === "/metrics/batch") {
    return "Batch Analytics"
  }
  if (pathname === "/metrics/comparison") {
    return "Streaming vs Batch"
  }
  if (pathname === "/how-it-works") {
    return "How it works"
  }
  if (pathname === "/login") {
    return "Login"
  }
  if (pathname === "/register") {
    return "Register"
  }
  if (pathname === "/forgot-password" || pathname === "/recover-account") {
    return "Recover Account"
  }
  if (pathname === "/reset-password") {
    return "Reset Password"
  }
  if (pathname === "/verify-email" || pathname === "/recover-account/verify") {
    return "Verify Email"
  }
  if (pathname === "/profile") {
    return "My Profile"
  }
  if (pathname === "/alerts") {
    return "Alerting System"
  }
  if (pathname.startsWith("/departments/")) {
    return "Departemnts"
  }
  return "MedStream"
}

function useDocumentTitle() {
  const location = useLocation()

  useEffect(() => {
    let active = true
    const {pathname} = location
    const staticTitle = resolveStaticTitle(pathname)
    document.title = staticTitle

    const match = pathname.match(/^\/patients\/(\d+)\/(diagnosis|medical-history|admission-history|analysis|post-discharge-summary)$/)
      || pathname.match(/^\/patient\/(\d+)$/)

    if (!match) {
      return () => {
        active = false
      }
    }

    const patientId = match[1]
    const section = match[2] || ""
    const sectionTitle = section === "diagnosis"
      ? "Clinical Records"
      : section === "medical-history"
        ? "Medical History"
        : section === "admission-history"
          ? "Admission History"
          : section === "analysis"
            ? "Treatment Analysis"
            : section === "post-discharge-summary"
              ? "Post-Discharge Clinical Summary"
              : ""

    const fallbackPatientTitle = sectionTitle ? `Patient: #${patientId} - ${sectionTitle}` : `Patient: #${patientId}`
    document.title = fallbackPatientTitle

    const setPatientTitle = async () => {
      try {
        const response = await getPatient(patientId)
        if (!active) {
          return
        }
        const patientName = formatPatientFullName(getResponseData(response))
        document.title = sectionTitle ? `Patient: ${patientName} - ${sectionTitle}` : `Patient: ${patientName}`
      } catch (error) {
        void error
      }
    }

    setPatientTitle()

    return () => {
      active = false
    }
  }, [location])
}

function TitleManager() {
  useDocumentTitle()
  return null
}

function App() {
  return (
    <BrowserRouter>
      <TitleManager/>
      <ApiAuthBridge/>
      <Routes>
        <Route path="/" element={<RootRoute/>}/>

        <Route
          path="/login"
          element={
            <PublicOnlyRoute>
              <LoginPage/>
            </PublicOnlyRoute>
          }
        />

        <Route
          path="/register"
          element={
            <PublicOnlyRoute>
              <RegisterPage/>
            </PublicOnlyRoute>
          }
        />

        <Route
          path="/forgot-password"
          element={
            <PublicOnlyRoute>
              <ForgotPasswordPage/>
            </PublicOnlyRoute>
          }
        />

        <Route
          path="/reset-password"
          element={
            <PublicOnlyRoute>
              <ResetPasswordPage/>
            </PublicOnlyRoute>
          }
        />

        <Route
          path="/verify-email"
          element={<VerifyEmailPage/>}
        />

        <Route
          path="/recover-account"
          element={
            <PublicOnlyRoute>
              <RecoverAccountPage/>
            </PublicOnlyRoute>
          }
        />

        <Route
          path="/recover-account/verify"
          element={<RecoverAccountVerifyPage/>}
        />

        <Route
          element={
            <ProtectedRoute>
              <AuthenticatedLayout/>
            </ProtectedRoute>
          }
        >
          <Route path="/dashboard" element={<DashboardPage/>}/>
          <Route path="/departments/:name" element={<DepartmentPage/>}/>
          <Route path="/patient/:id" element={<PatientPage/>}/>
          <Route path="/patients/:id/diagnosis" element={<PatientDiagnosisPage/>}/>
          <Route path="/patients/:id/medical-history" element={<PatientMedicalHistoryPage/>}/>
          <Route path="/patients/:id/admission-history" element={<PatientAdmissionHistoryPage/>}/>
          <Route path="/patients/:id/analysis" element={<PatientTreatmentAnalysisPage/>}/>
          <Route path="/patients/:id/post-discharge-summary" element={<PatientPostDischargeSummaryPage/>}/>
          <Route path="/alerts" element={<AlertsPage/>}/>
          <Route path="/metrics/streaming" element={<StreamingMetricsPage/>}/>
          <Route path="/metrics/batch" element={<BatchMetricsPage/>}/>
          <Route path="/metrics/comparison" element={<StreamingBatchPage/>}/>
          <Route path="/how-it-works" element={<HowItWorksPage/>}/>
          <Route path="/patients/new" element={<AddPatientPage/>}/>
          <Route path="/profile" element={<ProfilePage/>}/>
        </Route>
        <Route path="*" element={<RootRoute/>}/>
      </Routes>
    </BrowserRouter>
  )
}

export default App
