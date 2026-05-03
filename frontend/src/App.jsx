import {BrowserRouter, Navigate, Route, Routes, useLocation, useNavigate} from "react-router-dom"
import {useEffect} from "react"
import AuthenticatedLayout from "./components/AuthenticatedLayout.jsx"
import {useAuth} from "./components/AuthContext.jsx"
import ProtectedRoute from "./components/ProtectedRoute.jsx"
import PublicOnlyRoute from "./components/PublicOnlyRoute.jsx"
import LoadingSpinner from "./components/LoadingSpinner.jsx"
import {useNotifications} from "./hooks/useNotifications.js"
import {registerAuthFailureHandler} from "./services/api.js"
import AddPatientPage from "./pages/AddPatientPage.jsx"
import AlertsPage from "./pages/AlertsPage.jsx"
import BatchMetricsPage from "./pages/BatchMetricsPage.jsx"
import DepartmentPage from "./pages/DepartmentPage.jsx"
import DashboardPage from "./pages/DashboardPage.jsx"
import ForgotPasswordPage from "./pages/ForgotPasswordPage.jsx"
import LoginPage from "./pages/LoginPage.jsx"
import PatientPage from "./pages/PatientPage.jsx"
import PatientDiagnosisPage from "./pages/PatientDiagnosisPage.jsx"
import PatientAdmissionHistoryPage from "./pages/PatientAdmissionHistoryPage.jsx"
import PatientMedicalHistoryPage from "./pages/PatientMedicalHistoryPage.jsx"
import PatientTreatmentAnalysisPage from "./pages/PatientTreatmentAnalysisPage.jsx"
import ProfilePage from "./pages/ProfilePage.jsx"
import RecoverAccountPage from "./pages/RecoverAccountPage.jsx"
import RecoverAccountVerifyPage from "./pages/RecoverAccountVerifyPage.jsx"
import RegisterPage from "./pages/RegisterPage.jsx"
import ResetPasswordPage from "./pages/ResetPasswordPage.jsx"
import StreamingMetricsPage from "./pages/StreamingMetricsPage.jsx"
import StreamingBatchPage from "./pages/StreamingBatchPage.jsx"
import VerifyEmailPage from "./pages/VerifyEmailPage.jsx"

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
  const {notifyError} = useNotifications()

  useEffect(() => {
    registerAuthFailureHandler(() => {
      notifyError("Session expired. Please log in again.")
      logout()
      if (location.pathname !== "/login") {
        navigate("/login", {replace: true, state: {message: "Session expired. Please log in again."}})
      }
    })

    return () => {
      registerAuthFailureHandler(null)
    }
  }, [location.pathname, logout, navigate, notifyError])

  return null
}

function App() {
  return (
    <BrowserRouter>
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
          <Route path="/alerts" element={<AlertsPage/>}/>
          <Route path="/metrics/streaming" element={<StreamingMetricsPage/>}/>
          <Route path="/metrics/batch" element={<BatchMetricsPage/>}/>
          <Route path="/metrics/comparison" element={<StreamingBatchPage/>}/>
          <Route path="/patients/new" element={<AddPatientPage/>}/>
          <Route path="/profile" element={<ProfilePage/>}/>
        </Route>
        <Route path="*" element={<RootRoute/>}/>
      </Routes>
    </BrowserRouter>
  )
}

export default App
