import {Navigate} from "react-router-dom"
import {useAuth} from "./AuthContext.jsx"

export default function ProtectedRoute({children}) {
  const {isAuthenticated, isAuthResolved} = useAuth()

  if (!isAuthResolved) {
    return null
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace/>
  }

  return children
}
