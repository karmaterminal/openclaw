# v2026.5.3 rebase feasibility scout

## Verdict

**Is the rebase easy? No.** The continuation substrate does not rebase cleanly from `feature/context-pressure-squashed` (`5397a00a4e1b1fa3fe58fe75088e595da0bbfa5a`) onto `frond/v2026.5.3/canonical` (`06d46f7cf638a31c4852c068aeeaa76f5e949941`).

**Feasibility estimate: medium, not hard.** The attempted one-commit rebase stopped on 7 conflicted files. Most conflicts are localized/mechanical, and the rest of the large substrate auto-applied: 304 staged paths, 34,130 insertions, and 848 deletions before conflict resolution. I did not find a `feedback_three_way_merge_for_rewritten_hosts` marker or a broad rewritten-host hard case. The only conflict requiring real judgment is the diagnostic liveness-warning merge, where v2026.5.3 tightened warning severity while the continuation substrate adds continuation-queue warning behavior.

`pnpm tsgo:core` was **skipped** because the rebase was intentionally left unresolved for scout-only reporting.

## Rebase command

```sh
git switch -c frond-scribe/20260504/v2026.5.3-rebase-scout-attempt-local 5397a00a4e1b1fa3fe58fe75088e595da0bbfa5a
git rebase --onto origin/frond/v2026.5.3/canonical 8b2a6e57fef6c582ec6d27b85150616f9e3a7ba4
```

Result: `error: could not apply 5397a00a4e... feat(continuation): context-pressure and targeted returns`

## Conflict catalog

| File                                             | Conflict shape                                                     | Estimate    | Notes                                                                                                                                                                                                                                                                                                                                 |
| ------------------------------------------------ | ------------------------------------------------------------------ | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `CHANGELOG.md`                                   | Release-note insertion collisions in `### Changes` and `### Fixes` | Easy        | Keep both upstream v2026.5.3 entries and continuation entries, preserving single-line changelog bullets.                                                                                                                                                                                                                              |
| `docs/.generated/config-baseline.sha256`         | Generated checksum collision                                       | Easy/medium | Hashes differ because both base and substrate changed config surface. Resolve after the real merge by regenerating/checking config docs artifacts.                                                                                                                                                                                    |
| `docs/.generated/plugin-sdk-api-baseline.sha256` | Generated checksum collision                                       | Easy/medium | Hashes differ because both base and substrate changed API baseline surface. Resolve after the real merge by regenerating/checking plugin SDK API artifacts.                                                                                                                                                                           |
| `src/agents/pi-embedded-runner/run.ts`           | Object-parameter contract widening                                 | Easy        | v2026.5.3 added `suppressNextUserMessagePersistence` and `onUserMessagePersisted`; continuation added `requestCompactionOpts`. The likely merge keeps all three fields.                                                                                                                                                               |
| `src/infra/heartbeat-runner.ts`                  | Import-list overlap                                                | Easy        | v2026.5.3 keeps `SessionEntry` type usage while continuation needs `resolveSessionStoreEntry`. The likely merge imports both.                                                                                                                                                                                                         |
| `src/logging/diagnostic.ts`                      | Liveness-warning semantic overlap                                  | Medium      | v2026.5.3 avoids warning on transient event-loop max spikes unless there is blocking work or sustained P99 delay; continuation adds continuation-queue suffixes and queue activity warnings. A safe merge should preserve the stricter v2026.5.3 warning gate while adding continuation-queue activity as an explicit warning reason. |
| `src/logging/diagnostic.test.ts`                 | Test/import overlap for the diagnostic liveness behavior           | Medium      | Keep both the v2026.5.3 transient-spike debug-only test and the continuation queue sample/warning-history test, plus imports for `getDiagnosticSessionActivitySnapshot`, `markDiagnosticEmbeddedRunStarted`, and `registerDiagnosticContinuationQueueMetricsProvider`.                                                                |

## Recommended integration path

1. Resolve the five mechanical conflicts first: changelog, generated hash files, `src/agents/pi-embedded-runner/run.ts`, and `src/infra/heartbeat-runner.ts`.
2. Resolve `src/logging/diagnostic.ts` and `src/logging/diagnostic.test.ts` as a pair, preserving both upstream liveness-noise reduction and continuation queue diagnostics.
3. Regenerate/check generated config and plugin-SDK baselines.
4. Run `pnpm tsgo:core`, then the changed gate appropriate for the final touched surfaces.

## Publishing notes

No cohort branch was modified or pushed. No draft PR was opened because the rebase did not produce resolved rebase-applied bytes.
