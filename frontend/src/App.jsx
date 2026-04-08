import { BrowserRouter, Route, Routes } from "react-router-dom"
import AuthenticatedLayout from "./components/AuthenticatedLayout"
import ProtectedRoute from "./components/ProtectedRoute"
import PublicOnlyRoute from "./components/PublicOnlyRoute"
import AddPatientPage from "./pages/AddPatientPage"
import AlertsPage from "./pages/AlertsPage"
import DepartmentPage from "./pages/DepartmentPage"
import Dashboard from "./pages/Dashboard"
import EventsPage from "./pages/EventsPage"
import HomePage from "./pages/HomePage"
import LoginPage from "./pages/LoginPage"
import PatientPage from "./pages/PatientPage"
import ProfilePage from "./pages/ProfilePage"
import RegisterPage from "./pages/RegisterPage"

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route
          path="/login"
          element={
            <PublicOnlyRoute>
              <LoginPage />
            </PublicOnlyRoute>
          }
        />
        <Route
          path="/register"
          element={
            <PublicOnlyRoute>
              <RegisterPage />
            </PublicOnlyRoute>
          }
        />
        <Route
          element={
            <ProtectedRoute>
              <AuthenticatedLayout />
            </ProtectedRoute>
          }
        >
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/departments/:name" element={<DepartmentPage />} />
          <Route path="/patient/:id" element={<PatientPage />} />
          <Route path="/alerts" element={<AlertsPage />} />
          <Route path="/events" element={<EventsPage />} />
          <Route path="/patients/new" element={<AddPatientPage />} />
          <Route path="/profile" element={<ProfilePage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}

export default App
