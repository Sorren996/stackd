# Resume / graph regression repair — diagnosis, changes, evidence

Scope: this app only. No redesign, no change to insulin/glucose math, notifications,
consent, thresholds, dedup or server ingestion. The prior empty-startup repair is
preserved (the newest-reading row is still never used as a day's history).

## Root causes, with evidence from the actual source

### 1. Marker did not return to the newest received reading (confirmed, fixed)
`src/components/ActivityGraph.jsx` anchored the viewport only when:

```
previousNowPosition.current == null || scrollRef.scrollLeft >= previousNowPosition.current - 2
```

A resume never re-anchored if the reader had scrolled before backgrounding. Worse,
a **freshly mounted** scroll container starts at `scrollLeft = 0` (the oldest edge of
the chart) while `previousNowPosition` still held the previous maximum, so
`wasAtLatest` was false and the marker sat on old/oldest data. That container is
re-created whenever the graph's waiting branch is left. The anchor is also
`latestGlucoseBucket`, derived from the newest **received** reading time — not a
clock point — which was already correct and is unchanged.

### 2. Chart measured nothing after its waiting state (confirmed, fixed)
The waiting branch returned a different root element carrying `containerRef` than
the chart did. The `ResizeObserver` is created once on mount, so it stayed bound to
a detached node and `containerWidth` froze at its `600` default — mis-scaled trace
and no reliable marker. Both branches now share one root element, so React reuses
the node and the observer stays live.

### 3. Every resume ran three or four full revalidation rounds (confirmed, fixed)
`useVisibilityRefresh` called `onRevalidate` on `visibilitychange`, `pageshow`,
`focus`, `online` **and** mount with no dedupe. One iOS resume fires three of these
within milliseconds, so six queries plus the upstream poll were requested
repeatedly. Triggers are now collapsed into a single round (1.2 s window) and the
trigger name is carried through for diagnostics.

### 4. A suspended request could block that section for the whole foreground session (fixed)
Revalidation used `refetchQueries(..., { cancelRefetch: false })`, which **joins**
an in-flight request. A request left `fetching` when the WebView was suspended may
never settle, so that section kept showing old data. On a resume (not the first
mount) any query still marked `fetching` is now retired with `cancelQueries` and
re-read once, bounded by the existing 8 s per-read timeout. Each round is numbered;
only the newest round may publish or report, so a late obsolete response cannot
overwrite newer state.

### 5. Render failure never showed white in web code (verified present, not changed in behaviour)
`ErrorBoundary` wraps every authenticated route (`src/App.jsx`) and shows a cream
retry screen; `CardErrorBoundary` already wraps the graph slot
(`ActiveInsulinBanner.jsx:1086`) so a chart throw leaves the rest of the screen
working. Both are code-only diagnostics now.

### 6. Session expiry does not leak the previous account (verified, unchanged)
401 → `queryClient` `onError` → `onAuthFailure` → `checkSession` →
`handleSessionExpired` → `performLocalLogout` (`queryClient.clear()` +
`clearLocalSettingsCache()` + `/login`). The resume hook additionally blanks every
section of its snapshot on a 401/403. Account switch and logout already clear the
local glucose cache and enforce cache ownership.

### 7. Blank white screen after minutes in the background — NOT explained by web code
Not reproduced here, and no web-side cause was found: every live-path failure in
this app renders either cream or the slate retry screen. If JavaScript is still
running the app cannot be white. A dead WKWebView content process (iOS terminates
it under memory pressure) leaves the native view with nothing to paint, and web
code cannot reload itself from a dead renderer. **This app contains no native
project**: no `ios/`, `android/`, Podfile or Capacitor config, and
`src/lib/nativeShell.js` only *reads* `window.Capacitor`. So the required native
hook cannot be added here. Renderer termination therefore remains a hypothesis
consistent with the evidence, not a verified cause.

## Changed files

1. `src/hooks/useVisibilityRefresh.js` — single-flight resume triggers, trigger reason.
2. `src/hooks/usePatientResumeSnapshot.js` — retire suspended in-flight reads on resume,
   newest-round-only publication, `resume` diagnostic start/end/failure codes.
3. `src/components/ActivityGraph.jsx` — one stable measuring root for waiting and chart;
   anchoring delegated to the new pure rule.
4. `src/lib/graphAnchor.js` (new) — the anchor decision, isolated and testable.
5. `src/lib/__tests__/graphAnchor.test.js` (new) — guards resume, remount, follow, browse.
6. `src/components/CardErrorBoundary.jsx` — code-only `card-crash` diagnostic.

## Actually tested
- `npm run build` — passes.
- `npx vitest run` — 405 tests pass (incl. the 7 new anchor tests). 42 `.mjs` files
  report "No test suite found"; that is a pre-existing discovery quirk of files that
  contain no tests, unrelated to this change.
- Source tracing: auth hydration, query keys, cache ownership, logout clearing,
  render boundaries, chart measurement, scroll anchoring, day-summary inputs.

## Not tested (needs a device / the Testing Agent)
Background duration, renderer termination, cold/warm resume timing, and any
background-fetch or silent-push behaviour. Nothing above is claimed as verified on
iOS.

## Background feasibility (D) — not implemented, and why
- **BGAppRefreshTask** needs `BGTaskSchedulerPermittedIdentifiers` + `UIBackgroundModes`
  in the native Info.plist, a registered identifier, and a native handler registered
  during launch. Opportunistic by design, never a five-minute timer. None of this
  exists in this app and none can be added from web code.
- **Silent push** needs `content-available: 1`, matching APNs headers and a native
  remote-notification handler. Working *visible* push does not prove any of it.
- Added instead: the foreground/resume refresh already used by the app, with no
  hidden web timers and no change to push categories, consent, thresholds or dedup.

Native change required (for the Base44/iOS wrapper, outside this workspace):
implement `WKNavigationDelegate.webViewWebContentProcessDidTerminate(_:)` with a
single bounded `webView.reload()` per foreground return, and register a
`BGAppRefreshTask` if background cache refresh is wanted.
