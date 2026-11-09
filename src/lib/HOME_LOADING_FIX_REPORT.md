# Home loading regression correction

## Identified cause, from source inspection
The reported five-second duration has not been independently measured. The following mechanisms were confirmed in the code and explain the reported interim display:

1. Home used `useResumeSnapshot`, initialized with `held: true` and `pending: true`. It withheld incoming React Query data behind a single multi-section refresh result, even when the authenticated account already had usable cached data. Its `data-freshness="updating"` attribute hid the hero and chart reading row.
2. `refreshSnapshotQueries` awaited the latest-reading request, then the remaining requests or a 1.5-second grace period, and canceled requests still running. This could delay display and cancel useful history. These shared helpers are still used by the follower authorization flow; Home no longer uses them.
3. The Home history query supplied `rawLatestGlucoseRows` as placeholder history. That single reading was merged into graph input and supplied to Daily Balance without history readiness. The chart's sparse-data hint and the summary's five-minute sample breakdown were therefore real computations over incomplete bootstrap input, not a completed history response.
4. Daily summary memoization did not depend on a clock/day key. An unchanged array could retain the previous day's summary after midnight. The default TIR calculation also extended its last reading toward the current time, which is inappropriate when displaying a saved, stale summary as historical coverage.

## Correction
- Home renders each authorized, account-scoped query's usable data directly. No grouped presentation hold, 500 ms resume gate, secondary grace wait, or group-completion cancellation remains in the Home path.
- Latest saved reading and chart history start independently once Home is authorized and mounted. Visibility/focus/online signals immediately join or start requests without canceling active reads. Dexcom upstream refresh remains separate and is never awaited before displaying saved data.
- Existing same-account in-memory history stays visible during background refresh and network failure. The existing owner-checked latest-reading cache remains the only between-launch reading persistence; no new health-data persistence was introduced. A true cold start without history shows lightweight history loading instead of fabricating history from the latest row.
- The hero shows a usable saved reading immediately with its actual age and an exact timestamp in its title, plus a small refreshing indicator. Current zone/direction copy still requires successful validation and a sufficiently recent source timestamp. CGM's existing eight-minute presentation threshold now also applies while connection metadata is still loading.
- No history placeholder is borrowed from the latest-reading query. A loaded history response is required for the graph's empty/sparse states and for daily summary eligibility. Existing history is never hidden merely because a refetch is running.
- Daily Balance uses only the history dataset, filters to the current local calendar day, excludes future/system/invalid readings, and requires at least two distinct measurement times. A capped 5,000-row result is not accepted as a complete summary source. Before eligibility, the percentage and minute breakdown are absent.
- A valid saved summary carries its date, observed first/last timestamps, reading count and as-of time, also in the detail sheet. These are observed timestamps, not a claim of complete coverage of the whole day. Existing time-category breakdown remains five minutes per saved sample.
- The existing TIR algorithm is reused with its end bounded to the last measured reading (`extendToNow: false`); stale snapshots no longer extrapolate forward with the clock. This is an explicit observation-window correction, not a change to insulin calculations, target ranges or the TIR formula. Day filtering updates on the foreground clock and immediately on resume. An open detail sheet is hidden when the new day has insufficient data.
- Existing account-keyed query isolation, logout/account-switch cache clearing and cancellation-aware bounded reads remain. Explicit 401/403 results suppress the Home cache presentation. Followers retain their existing server-authorized endpoint and revalidation flow; no follower access rules changed.
- Line interpolation, real-gap handling, navigation, notifications, consent, backend functions and scheduled ingestion are unchanged.

## Exact changed files
1. `src/hooks/usePatientResumeSnapshot.js` — replace Home's held snapshot with direct query presentation and independent lifecycle refreshes.
2. `src/pages/Dashboard.jsx` — remove latest-row history placeholder; track actual history readiness; split hero, history and summary inputs; stop the global masking attribute.
3. `src/components/ActiveInsulinBanner.jsx` — show saved hero while refreshing; keep stale copy neutral; use history-qualified day summary; do not gate the other saved-log section on glucose loading.
4. `src/components/ActivityGraph.jsx` — distinguish unresolved/unavailable history from a completed empty history response; retain existing cached chart.
5. `src/components/dailybalance/DailyBalanceSection.jsx` — honest waiting/unavailable copy, observation coverage, no percentage before eligibility, close insufficient-data detail presentation.
6. `src/components/dailybalance/DailyBalanceDetailSheet.jsx` — display the same observation coverage/as-of context.
7. `src/lib/homeDaySummary.js` — new focused, pure day-scoped summary eligibility/window helper using existing calculation functions.
8. `src/lib/HOME_LOADING_FIX_REPORT.md` — this report.

The earlier RESUME_FRESHNESS_REPORT describes the preceding implementation. Its statements about a held, grouped patient presentation no longer apply to Home after this correction; the follower path was not replaced.

## Actually checked
- Source dependency tracing: startup authorization, query keys, local cache ownership, React Query initial/placeholder data, refresh cancellation, render masking, graph sparse state and summary inputs.
- Source review of logout/account-switch clearing in AuthContext and userSettings; no cache-clearing behavior was removed.
- Source tracing of empty, retained-cache/error, source-age and day-rollover conditions.
- `npm run build`: passed.
- `git diff --check`: passed.

No browser scenario, network timing experiment, physical-device timing, production workflow execution or notification delivery was tested. No claim is made that the reported five seconds has been measured or eliminated on the owner's device.

## Runtime acceptance still required
Use the Testing Agent (test-tube side panel) for the browser scenarios below. Native app suspension and time-to-visible measurements additionally require a physical iPhone.

- **Cold start, no history cache:** latest reading may appear independently; chart and summary show loading, not a dot/empty hint/100%; real history appears when its request completes.
- **Warm reopen, same user:** prior valid reading and chart remain visible with actual age/as-of; refreshing is unobtrusive; no global masking, count-up replay or scroll reset.
- **Slow network:** independently delay latest, history and meal/dose requests; one delayed section must not hold another. Verify timeout/unavailable copy without a fabricated empty response.
- **Background refetch:** cached chart remains mounted, preserves tabs/scroll and receives completed history without cancellation by another section.
- **No readings:** only a completed empty history request can show the empty chart message; balance has no percentage or minute breakdown.
- **Stale data / offline:** saved value and history remain accessible; no current zone/direction reassurance, projected current status or advancing summary coverage. Verify a successful response containing only old readings does not make them current.
- **Day rollover:** previous-day points remain in history but do not become today's summary; insufficient new-day data suppresses the percentage/detail; adequate new-day history yields correctly scoped observed coverage.
- **Logout / account switch:** verify cache clearing and absence of the previous account's values while new requests are pending; late responses must not restore the prior account's screen. Also verify an explicit authorization denial suppresses protected cached values.
- **Measurements:** on device, record launch/resume time, first authorized cached-data paint and history completion separately. No measured result is supplied by this change report.