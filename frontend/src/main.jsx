import {StrictMode} from 'react'
import {createRoot} from 'react-dom/client'
import App from './App.jsx'
import {AuthProvider} from './auth/AuthContext.jsx'
import {NotificationProvider} from './components/NotificationProvider.jsx'
import './styles.css'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <AuthProvider>
      <NotificationProvider>
        <App/>
      </NotificationProvider>
    </AuthProvider>
  </StrictMode>,
)
