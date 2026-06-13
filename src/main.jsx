import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { Toaster } from 'react-hot-toast'
import App from './App.jsx'
import { AuthProvider } from './context/AuthContext.jsx'
import { LanguageProvider } from './context/LanguageContext.jsx'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <LanguageProvider>
      <AuthProvider>
        <App />
        <Toaster
          position="top-right"
          toastOptions={{
            duration: 3000,
            style: {
              fontFamily: 'Inter, sans-serif',
              fontSize: '14px',
              borderRadius: '10px',
              background: '#1B2B4B',
              color: '#fff'
            },
            success: { iconTheme: { primary: '#2D6A4F', secondary: '#fff' } },
            error: { iconTheme: { primary: '#E63946', secondary: '#fff' } }
          }}
        />
      </AuthProvider>
      </LanguageProvider>
    </BrowserRouter>
  </React.StrictMode>
)
