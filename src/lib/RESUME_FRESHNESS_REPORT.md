# Stackd resume / freshness change report

## Implemented
- Immediate cold-open and foreground revalidation through visibilitychange, pageshow, focus and online, with pagehide/visibility preparation before suspension.
- Overlapping signals and rapid hide/show cycles join one presentation refresh. Expired suspended cycles, scope changes and unmounts retire earlier work. Query requests have an 8-second bound and consume cancellation signals; SDK transports that cannot abort may finish, but their retired results cannot update the cache.
- Patient display inputs are held during resume and committed together: latest real glucose, graph readings, insulin and meal logs. Secondary queries have at most 1.5 seconds after the primary read settles; incomplete sections retain last saved inputs rather than holding the latest glucose indefinitely.
- Fixed-layout guards cover current figures rather than replacing the page, retaining mounted charts, navigation, tabs and page structure. Historical chart traces remain available. No page reload or new splash.
- Clock-dependent existing insulin calculations are reevaluated on the committed snapshot and during foreground clock ticks. Formulas, meal grouping, comfort-zone calculations and alert rules are unchanged.
- Last-known/unavailable copy is driven by actual source timestamps and refresh verification, not HTTP success. CGM display age uses the existing patient eight-minute threshold, also in the follower UI; this does not change any server notification threshold. Missing/future/system timestamps do not produce a current status. Valid fresh urgent-low copy remains in the existing patient rendering path.
- Resume updates do not restart the chart number roll or insulin countdown fades. Historical horizontal scroll positions are retained, while a chart already following its newest edge continues following it. Continuous line and gap-building algorithms are unchanged.
- Patient query keys and read filters include the authenticated account; local latest-reading writes check that account ownership still matches. Follower keys include viewer, relationship and permission version. Switching person/account remounts that presentation state. Existing auth cache clearing remains in place.
- Follower revalidation continues through getSharedView; no new privileged endpoint. A failed or denied follower read hides protected cached data and sheet contents instead of showing an unconfirmed authorization state.

## Server ingestion and notification review
The capability inventory reports **Dexcom Glucose Sync active**, scheduled every five minutes. Its definition calls syncDexcomGlucose independently of browser visibility. The handler authenticates an admin, loads connected accounts server-side, and uses the existing centralized Dexcom sync and credential vault. The ingestion path calls notifyAfterPersist after stored readings. Existing notification sweep and new-reading workflows remain active according to the capability inventory.

No workflow, backend function, permissions, notification thresholds, consent settings or delivery rules were changed. This confirms the configured independent server path, not the success of every recent production run; production workflow run history was not inspected and no live glucose/notification side effects were triggered for testing.

## Files changed
### New
- src/lib/resumeFreshness.js — cancellation-aware bounded reads, presentation age gate, bounded snapshot refresh coordination.
- src/hooks/useResumeSnapshot.js — lifecycle presentation state, generation retirement, grouping and foreground clock.
- src/hooks/usePatientResumeSnapshot.js — patient query-to-snapshot adapter.
- src/lib/RESUME_FRESHNESS_REPORT.md — this report.

### Modified
- src/pages/Dashboard.jsx — user-scoped reads, snapshot display inputs and freshness propagation.
- src/pages/FollowingHome.jsx — viewer/person/permission-keyed dashboard instance.
- src/components/Layout.jsx — account-keyed patient dashboard instance.
- src/components/ActiveInsulinBanner.jsx — fixed-layout reading guard, truthful status and immediate clock inputs.
- src/components/ActivityGraph.jsx — resume clock, number-animation suppression and scroll preservation.
- src/components/follower/SharerDashboard.jsx — bounded shared revalidation, coherent authorized payload and failed-read suppression.
- src/components/follower/SharedGlucoseChart.jsx — preserve historical scroll on incoming data.
- src/components/sharing/SharedGlucosePanel.jsx — age derived from measurement time during render; suppress stale zone/trend.
- src/components/rightnow/RightNowView.jsx — updating guard and clearly labeled saved-log context.
- src/components/rightnow/IobAtAGlance.jsx — suppress replayed countdown fades on resume commit.
- src/hooks/useVisibilityRefresh.js — single lifecycle-signal adapter, including cold open and focus.
- src/hooks/useDexcomRefresh.js — account-keyed, bounded in-flight polling gate; avoid restarting already active glucose reads.
- src/hooks/useRealtimeLogSync.js — remove redundant overlapping prefix invalidations and join active reads.
- src/hooks/useGlucoseStaleness.js — evaluate source staleness synchronously in render.
- src/lib/latestGlucoseCache.js — validate explicit owner on cache writes.
- src/index.css — scoped, layout-preserving freshness guards.

## Checks actually performed
- Inspected lifecycle, query/cache, local cache ownership, logout/account-change clearing, Dexcom foreground and scheduled paths, authorized sharing endpoint, source-age logic, chart animation/scroll and insulin clock dependencies.
- Traced failed, timed-out and canceled request paths in source, including generation/scope checks before committing a result.
- `npm run build`: passed, including the final implementation.
- `git diff --check`: passed.
- Build emitted only the existing outdated Browserslist data warning.
- No browser interaction tests, physical iPhone tests, live workflow executions or notification sends were performed. The requested runtime scenarios are NOT claimed as passed.

## Focused runtime acceptance checks — Testing Agent / device follow-up
Use the Testing Agent (test-tube side panel), describe the goals below and press Run. Real iOS suspension/app-switcher behavior requires a physical iPhone running the existing native build.

1. Return after about ten minutes, with newer server readings: fixed layout before confirmation; value/time/trend/chart and dependent inputs settle together; current urgent-low copy is retained for a genuinely fresh low reading; no count-up replay.
2. Rapid hide/show, focus and pageshow bursts: one in-flight presentation refresh, no request storm, no old response replacing a newer committed result.
3. Cold start with cached data, no cache and a different account: no cached reading displayed as confirmed before validation; no cross-account data.
4. Offline, failed and deliberately slow requests: prompt last-known/unavailable state, true source age, no infinite loader; history, navigation and logging remain reachable.
5. Successful refresh with only an old source reading: never promotes it to current; suppresses current trend/status while retaining real recorded time and historical data.
6. Switch followed person, change permission version, pause/revoke sharing and switch account while requests are active: no previous person's values or late responses appear; authorization failures hide protected contents and open shared sheets.
7. Deliberately reverse response completion order: retired cycle cannot cancel or overwrite the new cycle; graph and headline derive from the same accepted readings.
8. Inspect page and chart scroll positions, tabs and input interactions across resume; verify line continuity and true data gaps are unchanged.
9. Verify server workflow execution while the app is fully closed using workflow history, without assuming foreground polling provides background ingestion.

## Deployment and native limitations
Publish the updated web app with the editor's Publish button for existing users to receive these changes. Base44 documentation says its generated native wrapper displays the published web app, so this frontend-only change ordinarily does not require new store files or a native rebuild.

No native background refresh, app-state plugin, silent push or new device permission has been enabled or claimed. The inspected native helper exposes platform detection only, not an established resume bridge; this implementation uses supported browser/WebView lifecycle signals. The app cannot guarantee removal of OS-controlled app-switcher snapshots. Real-device suspension behavior and the runtime acceptance cases above remain to be verified.