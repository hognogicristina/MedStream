import {Navigate} from "react-router-dom"
import {useAuth} from "./AuthContext.jsx"
import LoadingSpinner from "./LoadingSpinner.jsx"

export default function ProtectedRoute({children}) {
  const {isAuthenticated, isAuthResolved, token} = useAuth()

  if (!isAuthResolved) {
    return <LoadingSpinner text="Loading..."/>
  }

  if (!token || !isAuthenticated) {
    return <Navigate to="/login" replace state={{message: "You must be logged in to access this page."}}/>
  }

  return children
}
