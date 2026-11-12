import React from 'react'
import ReactDOM from 'react-dom/client'
import App from '@/App.jsx'
import '@/index.css'
import { logStartup } from '@/lib/startupDiagnostics'

// The first line of JavaScript on the device. If a launch never logs this, the
// app never started running its own code — the stall is native, before JS.
logStartup('bootstrap')

// Long-press and right-click menus belong to a web page, not to this app, so
// the native menu is suppressed everywhere except inside fields — where cut,
// copy, paste and spellcheck must keep working. Clicks, drags, scrolling and
// focus behaviour are untouched, since only the context menu is affected.
const EDITABLE_TARGETS =
  'input, textarea, select, [contenteditable="true"], [contenteditable=""]';

document.addEventListener(
  'contextmenu',
  (event) => {
    const target = event.target;
    if (target instanceof Element && target.closest(EDITABLE_TARGETS)) return;
    event.preventDefault();
  },
  { capture: false }
)

ReactDOM.createRoot(document.getElementById('root')).render(
  <App />
)