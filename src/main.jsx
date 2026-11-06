import React from 'react'
import ReactDOM from 'react-dom/client'
import App from '@/App.jsx'
import '@/index.css'
import { logStartup } from '@/lib/startupDiagnostics'

// The first line of JavaScript on the device. If a launch never logs this, the
// app never started running its own code — the stall is native, before JS.
logStartup('bootstrap')

ReactDOM.createRoot(document.getElementById('root')).render(
  <App />
)