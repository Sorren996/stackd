import React from 'react'
import ReactDOM from 'react-dom/client'
import BootRoot from '@/components/startup/BootRoot'
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

// Do not evaluate App (or its SDK imports) until the boot-time offline gate opens.
let root;
let starting;
async function start() {
  if (starting) return starting;
  starting = (async () => {
    await window.__stackdBoot?.online;
    if (navigator.onLine === false) { window.__stackdBoot?.networkError(); return; }
    window.__stackdBoot?.starting();
    const [{ default: App }, { queryClientInstance }] = await Promise.all([
      import('@/App.jsx'), import('@/lib/query-client'),
    ]);
    // Retire only bootstrap reads, never clear saved data or selection keys.
    await queryClientInstance.cancelQueries({ predicate: query =>
      ['access-profile', 'latest-acknowledgment', 'onboarding-check'].includes(query.queryKey[0])
    });
    root?.unmount();
    root = ReactDOM.createRoot(document.getElementById('root'));
    root.render(<BootRoot App={App} />);
  })().finally(() => { starting = null; });
  return starting;
}
window.__stackdRestartBoot = start;
start().catch(() => window.__stackdBoot?.failure());