import {BrowserRouter, Route, Routes} from "react-router-dom"
import AuthenticatedLayout from "./components/AuthenticatedLayout"
import ProtectedRoute from "./components/ProtectedRoute"
import PublicOnlyRoute from "./components/PublicOnlyRoute"
import AddPatientPage from "./pages/AddPatientPage"
import AlertsPage from "./pages/AlertsPage"
import BatchMetricsPage from "./pages/BatchMetricsPage"
import DepartmentPage from "./pages/DepartmentPage"
import Dashboard from "./pages/Dashboard"
import ForgotPasswordPage from "./pages/ForgotPasswordPage"
import HomePage from "./pages/HomePage"
import LoginPage from "./pages/LoginPage"
import PatientPage from "./pages/PatientPage"
import PatientDiagnosisPage from "./pages/PatientDiagnosisPage"
import PatientAdmissionHistoryPage from "./pages/PatientAdmissionHistoryPage"
import PatientMedicalHistoryPage from "./pages/PatientMedicalHistoryPage"
import ProfilePage from "./pages/ProfilePage"
import RecoverAccountPage from "./pages/RecoverAccountPage"
import RegisterPage from "./pages/RegisterPage"
import ResetPasswordPage from "./pages/ResetPasswordPage"
import StreamingMetricsPage from "./pages/StreamingMetricsPage"
import StreamingBatchPage from "./pages/StreamingBatchPage"
import VerifyEmailPage from "./pages/VerifyEmailPage"

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<HomePage/>}/>

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
          element={
            <ProtectedRoute>
              <AuthenticatedLayout/>
            </ProtectedRoute>
          }
        >
          <Route path="/dashboard" element={<Dashboard/>}/>
          <Route path="/departments/:name" element={<DepartmentPage/>}/>
          <Route path="/patient/:id" element={<PatientPage/>}/>
          <Route path="/patients/:id/diagnosis" element={<PatientDiagnosisPage/>}/>
          <Route path="/patients/:id/medical-history" element={<PatientMedicalHistoryPage/>}/>
          <Route path="/patients/:id/admission-history" element={<PatientAdmissionHistoryPage/>}/>
          <Route path="/alerts" element={<AlertsPage/>}/>
          <Route path="/metrics/streaming" element={<StreamingMetricsPage/>}/>
          <Route path="/metrics/batch" element={<BatchMetricsPage/>}/>
          <Route path="/metrics/comparison" element={<StreamingBatchPage/>}/>
          <Route path="/patients/new" element={<AddPatientPage/>}/>
          <Route path="/profile" element={<ProfilePage/>}/>
        </Route>
      </Routes>
    </BrowserRouter>
  )
}

export default App
