import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App.jsx'
import SetupNeeded from './components/SetupNeeded.jsx'
import { isConfigured } from './supabaseClient'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    {isConfigured ? (
      <BrowserRouter>
        <App />
      </BrowserRouter>
    ) : (
      <SetupNeeded />
    )}
  </React.StrictMode>,
)
