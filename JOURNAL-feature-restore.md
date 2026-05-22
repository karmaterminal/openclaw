# Feature restore journal

## PR-head resolution

WORKORDER referenced `642a33df` as the PR-head. That sha was not in the local clone
(was only on the remote branch `frond-scribe-claude/20260509/narrow-surgery-tight`).
Resolved by fetching that branch, then comparing `b3993da70b..642a33df` for the
three target files plus any other diffs the verification tests turned out to
require.

## Feature 1 — compaction-failure auto-recovery

File: `src/auto-reply/reply/agent-runner-execution.ts`

- Added `let didResetAfterCompactionFailure = false;` next to the other
  per-attempt state (just after `compactionTraceparent`).
- Wrapped the embedded-error `isContextOverflowError` block: it now triggers
  only when the flag is unset and `params.resetSessionAfterCompactionFailure`
  returns `true`. Removed the `Preserving existing session mapping...` log line
  and the `preserveSessionMapping: true` arg to
  `buildContextOverflowRecoveryText` (the session _is_ being reset now, so the
  preserve-mapping copy was wrong).
- Same wrap for the thrown-error `isCompactionFailure` block (further down,
  after the `runResult.meta?.error` handling), again dropping the now-stale
  preserve-mapping log + flag.
- `params.resetSessionAfterCompactionFailure` was already on the params type;
  no plumbing change needed.

## Feature 2 — forceSenderIsOwnerFalse propagation

Files: `src/auto-reply/reply/session-system-events.ts`,
`src/auto-reply/reply/get-reply-run.ts`,
`src/gateway/server-methods/agent.ts`,
`src/agents/pi-embedded-runner/compact.ts`.

- `session-system-events.ts`: renamed the existing `drainFormattedSystemEvents`
  body into `drainFormattedSystemEventBlock` returning
  `Promise<FormattedSystemEventBlock | undefined>`. Added the local
  `forceSenderIsOwnerFalse` ratchet inside the event loop and propagated it on
  the return. Kept the legacy `drainFormattedSystemEvents(...)` as a thin
  wrapper that returns `.text` so existing string-only callers still compile.
  Kept module-level helpers (`compactSystemEvent`,
  `resolveSystemEventTimezone`, `formatSystemEventTimestamp`) at module scope
  — PR-head had nested them inside the function, but that restructuring is
  cosmetic and not part of the feature.
- `get-reply-run.ts`: switched import to `drainFormattedSystemEventBlock`,
  added `let forceSenderIsOwnerFalseFromSystemEvents = false;`, pushed
  `eventsBlock.text` into the drained array, ratcheted the flag, and used it
  to force `senderIsOwner: false` (and matching `traceAuthorized`) when the
  drained events demand it.
- `gateway/server-methods/agent.ts`: added `senderIsOwner = clientHasAdminScope(client)`
  in the agent handler and threaded it into `ingressOpts`. Required for
  `agent.test.ts > passes senderIsOwner=… for …-scoped gateway callers` to see
  the bit at all. Did not rename `clientHasAdminScope` → `resolveSenderIsOwnerFromClient`
  (PR-head did, but that's a cosmetic rename — surgical restore keeps the
  existing name).
- `pi-embedded-runner/compact.ts`: forwarded `params.senderIsOwner` into the
  three downstream call sites that already accept the field (around lines
  742, 809, 853). Required so compaction-time tool wiring sees the same
  authority bit; the compact.hooks tests assert this transitively.

## Verification

```
NODE_OPTIONS=--max-old-space-size=8192 OPENCLAW_VITEST_MAX_WORKERS=1 \
  npx vitest run \
    src/gateway/server-methods/agent.test.ts \
    src/agents/pi-embedded-runner/compact.hooks.test.ts
```

Final: `Test Files 4 passed (4) / Tests 326 passed (326)`.

## Out-of-workorder fix (had to make tests pass)

`src/agents/pi-embedded-runner/compact.hooks.harness.ts` — the production
module `src/plugins/current-plugin-metadata-snapshot.ts` has a newly-added
export `isReusableCurrentPluginMetadataSnapshot` (added after the PR-head
commit, so it's drift in the _opposite_ direction — code added, mock not
updated). The compact-hooks harness `vi.doMock(...)` block did not expose it,
so the fallback path threw "[vitest] No 'isReusableCurrentPluginMetadataSnapshot'
export is defined on the ... mock". Without the mock entry, the two model-
fallback tests caught that error in the outer try/catch and returned
`ok: false`, masquerading as a feature regression.

Fix: added `isReusableCurrentPluginMetadataSnapshot: vi.fn(() => true)` to the
mock alongside the existing `getCurrentPluginMetadataSnapshot` mock. Not
"restoring a dropped feature" — it's keeping the test harness in sync with
the production module surface.

## What I deliberately did NOT restore

The full `b3993da70b ↔ 642a33df` diff is wide (many files outside the three
named in the workorder). I limited changes to what was required by the
workorder text _and_ what the named verification tests demand. Skipped, for
example: removal of `buildCodexAppServerFailureText`, the
`normalizePositiveContextTokens`/`resolveAgentContextTokensForHint` cleanup,
the `isDiagnosticsEnabled`/`logSessionTurnCreated` removal, the
`compact.queued.ts` `shouldFallbackAfterHarnessCompaction` removal, and the
`clientHasAdminScope` → `resolveSenderIsOwnerFromClient` rename. Those are
unrelated to the two named features.
