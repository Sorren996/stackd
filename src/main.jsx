import React from 'react'
import ReactDOM from 'react-dom/client'
import App from '@/App.jsx'
import '@/index.css'
import { logStartup } from '@/lib/startupDiagnostics'

// The first line of JavaScript on the device. If a launch never logs this, the
// app never started running its own code — the stall is native, before JS.
logStartup('bootstrap')

// Long-press and right-click never open a copy menu on content. Fields keep
// theirs, so cut, copy, paste and spellcheck still work while editing.
document.addEventListener('contextmenu', (e) => {
  const t = e.target;
  if (t && t.closest && t.closest('input, textarea, select, [contenteditable="true"], [contenteditable=""]')) return;
  e.preventDefault();
}, { capture: false });

ReactDOM.createRoot(document.getElementById('root')).render(
  <App />
)