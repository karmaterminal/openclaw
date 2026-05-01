# Recommended path — v2026.4.29 exploratory rebase candidate

Branch: `frond-scribe/20260429/rebase-copilot-v3`
Base: `a448042c2edd94a4e8ee86d5ed90a5ed9fe8e4cd` (`v2026.4.29`)
Gate-complete checkpoint before final handoff docs: `66810a724279` (pushed; all four local gates green)

## Recommendation

Proceed with prince review of this candidate rather than restarting the rebase. The textual conflicts were resolvable without leaving conflict markers, and the resulting shape keeps v2026.4.29 substrate improvements while carrying the cohort continuation work forward.

The only remaining items are semantic review questions, not blocked merge hunks: visible-reply policy vs blocked-liveness surfacing, abort-wait semantics vs reply-run registry cleanup, orphan recovery ordering vs continuation delegate drains, and the SDK seam used by the diagnostics-otel continuation tracer adapter.

## Conflict bucket ledger

| bucket         | count | notes                                                                                                                                                                                                                                                                                            |
| -------------- | ----: | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| compose        |    16 | Continuation core, tests, generated protocol models, gateway ingress, plugin SDK test, package scripts, macOS allowlist, chain-budget extraction, trace/chain spans, diagnostics-otel adapter, continuation persistence, runtime build entries, OpenShell append safety, compaction attribution. |
| supersede-up   |     3 | Stale v24 generated hash regen commits; generic system-prompt ACP/native-command wording from v29 superseded the older cohort prompt edit.                                                                                                                                                       |
| supersede-co   |     0 | No upstream changes were deliberately discarded wholesale.                                                                                                                                                                                                                                       |
| merge-required |     0 | No conflict markers or unresolved design-choice blocks remain in the candidate.                                                                                                                                                                                                                  |

## HIGH-risk touchpoint decisions

| touchpoint                                                    | decision               | rationale                                                                                                                                                                                                                                    |
| ------------------------------------------------------------- | ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Active-run steering default vs reply-run registry             | compose                | v29 queue/steering substrate remains; cohort `ReplyRunAlreadyActiveError` shielding, blocked-liveness marker, and #500 double-emit reconciliation replay on top.                                                                             |
| Session abort wait semantics vs reply-run registry cleanup    | compose; prince review | Gateway/server method forwarding now includes both v29 raw-model/prompt-mode fields and cohort continuation/drain fields. No textual conflict remains, but review should confirm registry cleanup waits align with upstream abort semantics. |
| Spawned subagent `spawnedBy` vs subagent announce runtime     | compose                | v29 `spawnedBy` metadata is preserved; cohort subagent announce runtime/dist entry and continuation drain behavior remain plugin/runtime-owned.                                                                                              |
| Visible replies vs blocked-liveness marker                    | compose; prince review | v29 visible-reply pipeline remains; cohort blocked-liveness marker is preserved through channel-visible delivery. Review config edge cases where `messages.visibleReplies` or group overrides suppress markers.                              |
| Commitments heartbeat vs continuation heartbeat/system prompt | compose                | Upstream commitments are not replaced. Cohort continuation heartbeat/tracing additions remain separate and additive.                                                                                                                         |
| Orphan recovery/tombstones vs continuation cleanup            | compose; prince review | v29 recovery/tombstone fields remain in session types; cohort continuation drain/post-compaction release and task-flow persistence replay. Ordering deserves review.                                                                         |
| Embedded-runner blank visible prompts                         | supersede-up           | v29 embedded boundary behavior is kept. Cohort continuation options compose around it instead of replacing it.                                                                                                                               |
| Tool-result guard/context budget                              | compose                | Cohort continuation cap/tracer helpers compose with v29 resolved runtime context/token budget behavior.                                                                                                                                      |

## Notable composed resolutions

- `src/auto-reply/reply/agent-runner.ts` now uses the extracted `dispatchPostCompactionDelegates` path and keeps v29 diagnostics, prompt-mode/raw-model behavior, continuation queue drain, blocked-liveness, and trace span emission.
- `src/gateway/server-methods/agent.ts` keeps all gateway ingress fields inside `ingressOpts`, including v29 `modelRun`/`promptMode`, upstream `spawnedBy`, and cohort `continuationTrigger`/`drainsContinuationDelegateQueue`.
- `extensions/diagnostics-otel` now wires the continuation tracer through v29's generic `openclaw/plugin-sdk/diagnostic-runtime` seam instead of resurrecting the deleted plugin-specific `src/plugin-sdk/diagnostics-otel.ts`.
- `extensions/openshell` keeps v29's focused `file-access-runtime` boundary; `appendFileWithinRoot` was added to that focused SDK subpath for the sandbox memory-flush append fix.
- Session artifact helpers now preserve v29 trajectory filtering while adopting checkpoint transcript accounting for usage/cost discovery.

## Diff shape

`git diff --shortstat a448042c2edd94a4e8ee86d5ed90a5ed9fe8e4cd..HEAD`: 305 files changed, 36387 insertions(+), 660 deletions(-).

Top areas by changed file count: `src/agents` 92, `src/auto-reply` 78, `studies` 21, `src/infra` 21, `docs` 19, `src/config` 14, `extensions` 10, `src/gateway` 7, `src/tasks` 5.

## Gate status

All requested v3 local gates are green. `pnpm check` initially failed the deprecated internal config API guard on continuation/subagent ambient `loadConfig()` usage; v3 repaired that by using the runtime-config accessor / injected `getRuntimeConfig()` seam and reran the gate successfully.

| gate                                                           | result | shape                                                                                                                                    |
| -------------------------------------------------------------- | ------ | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm install && pnpm tsgo`                                    | green  | Lockfile already up to date; `pnpm tsgo` exited 0 at checkpoint `fbb91bc87654`.                                                          |
| `pnpm check`                                                   | green  | Initial guard failure repaired; targeted deprecated-config guard exited 0, then full `pnpm check` exited 0 at checkpoint `d03149bbcdf6`. |
| `pnpm test src/auto-reply src/agents src/messages src/gateway` | green  | Scoped Vitest wrapper exited 0 with `[test] passed 1 Vitest shard in 1.92s` at checkpoint `224840abd6cd`.                                |
| `pnpm build`                                                   | green  | Build exited 0 at checkpoint `66810a724279`; A2UI bundle was already up to date and no tracked build artifacts changed.                  |
