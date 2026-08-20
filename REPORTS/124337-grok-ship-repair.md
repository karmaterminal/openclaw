# 124337 grok ship-repair

Lane: `codeagent/124337-grok-ship-repair`
Bound: openclaw/openclaw#124337, karmaterminal/openclaw#1255 (child of #1254)
This lane does not open/update/merge PRs and does not touch `codeagent/ward-1255-m1-intervention`.

## Topology

| Ref                                | SHA                                        |
| ---------------------------------- | ------------------------------------------ |
| Frozen PR head (Gate 1 / ancestor) | `70d47bec1f93c5f4c7e07eebb84ef9548a480751` |
| Original workorder freeze          | `267ffc4754a08181f1a15ff7cfbd0f4d817ca25a` |
| Re-frozen upstream (once)          | `923e972564cec0d2ce1dd9e46325a571ac52818e` |
| PR original merge-base             | `5626a79cc836d95d236debd720a34fc2dcdcc685` |
| Fossil                             | `c17a5c73a9bf9807d15b33bfa6bfb4aad5116398` |
| Candidate HEAD                     | `8a7c7a4d41317105c198e1864d2c00825203ad57` |
| Merge parents                      | `70d47bec…` + `923e972…`                   |

`git merge-base --is-ancestor 70d47bec… HEAD` holds.
`git merge-base --is-ancestor 923e972… HEAD` holds.

Upstream moved after the workorder freeze by one commit:

`923e972564c fix(apple): gate gateway RPC polling on the hello method catalog (#126559)`

Apple/macOS chat-transport only. No intersection with the 11 PR files versus `267ffc47..923e972`. The back-merge still absorbed the full `5626a79..923e972` delta onto the PR head.

Continuation primitive-core inventory: **N/A** (non-continuation PR). Not treated as a green setup exit.

#121204 repaired candidate observed on fork (`754ee5eae4a501c124f4e1975d2efef6d3b7d9f6`) is **future composite/proof input only**. It is not branch content here.

## Conflicts

Ordinary `--no-ff` merge of exact `923e972…` into `70d47bec…`.

Auto-merged:

- `src/channels/message/ingress-drain.ts` — kept PR `settleUnadopted` + genuine `onAbandoned -> applyFailureDisposition`, and kept upstream `GatewayDrainingError` budget-free release on `onFailed`.
- Teams/Mattermost sibling tests — kept PR aged-ceiling retarget on Teams; absorbed upstream Mattermost debounce/system-post test and Teams oxfmt-ignore import.

One textual conflict:

- `src/plugin-sdk/channel-ingress-runtime.ts`

Additive resolution:

1. Keep current-upstream split re-exports (`runtime.js` / `runtime-identity.js` / `store-allow-from.js` / `runtime-types.js` / `types.js`).
2. Keep PR `import { runIngressCancelCompat }` and mixed fan-in `cancelAll` fallback under cancel-compat ALS.

No Feishu production conflict. Feishu sibling test remained byte-identical to PR head.

## Causal invariant

Owner: core drain (`src/channels/message/ingress-drain.ts` `createLifecycle`) plus plugin-SDK fan-in (`fanInChannelIngressLifecycles`). Retry ceiling lives only in `applyFailureDisposition`.

Distinct paths after the merge:

| Signal                                | Owner                                                                                                   | Budget                    | Terminal                                                      |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------- | ------------------------- | ------------------------------------------------------------- |
| `onCancelled`                         | `settleUnadopted` → `releaseClaim({ recordAttempt: false })`                                            | none                      | never dead-letters                                            |
| mixed fan-in cancel, capable source   | `onCancelled`                                                                                           | none                      | never dead-letters                                            |
| mixed fan-in cancel, legacy source    | `runIngressCancelCompat(() => onAbandoned())` then `isIngressCancelCompat()` → same budget-free release | none                      | never dead-letters                                            |
| genuine `onAbandoned`                 | `applyFailureDisposition(claim, Error("turn-abandoned"))`                                               | consumes attempts/backoff | `retry-limit-exceeded` only under existing attempt+age policy |
| `onFailed`                            | same disposition owner                                                                                  | same                      | same                                                          |
| `GatewayDrainingError` on failed path | typed budget-free release                                                                               | none                      | not a dead-letter; restart successor reclaims the row         |

`bindIngressLifecycleToReplyOptions` still forwards `onCancelled` so Discord debounce cancel does not have to use the legacy fallback.

Later same-lane follower: poison head terminalizes at the ceiling; next drain adopts the follower (`ingress-drain.cancellation.test.ts` poison/follower).

Durable last error for genuine abandonment remains `turn-abandoned`. Cancellation preserves prior `attempts` / `lastAttemptAt` / `lastError`.

No broad catch, no silent fallback, no retry-budget widening, no channel-specific policy in core.

## Gate 2 byte/projection ledger

Walker: `openclaw-bootstrap/tools/feature-cores-byte-check.sh` against PR head `70d47bec` + frozen upstream `923e972`.

| File                                    | Verdict                      |
| --------------------------------------- | ---------------------------- |
| feishu ingress test                     | PASS (identical)             |
| mattermost inbound-system-event test    | PASS-UPSTREAM                |
| msteams ingress-lifecycle test          | PASS-UPSTREAM                |
| drain lifecycle test/ts                 | PASS (identical)             |
| abandonment-retry-budget test           | PASS (identical)             |
| cancellation test                       | PASS (identical)             |
| drain.test.ts                           | PASS (identical)             |
| drain.ts                                | PASS-UPSTREAM                |
| plugin-sdk fan-in test                  | PASS (identical)             |
| plugin-sdk `channel-ingress-runtime.ts` | FAIL auto-project (expected) |

The fan-in FAIL is the one textual conflict. Auto `git apply --3way` cannot emit the additive blob. Manual resolution was inspected: upstream export topology + PR cancel-compat. Not a frozen-tree reverse-clobber.

## Gate 2.5

Bounds: `5626a79..923e972` (absorbed delta).

- Upstream-touched test files: 3290
- Intersection with this PR: Mattermost inbound-system-event test; Teams ingress-lifecycle test
- Both ran GREEN on the candidate
- Semantic meaning: Teams still asserts aged `retry-limit-exceeded`; Mattermost still keeps the 24h-floor pending copy and gained an unrelated upstream debounce/system-post control

## Gate 2.7

`drift-cure-gate.sh 923e972 HEAD 70d47bec`

- files examined: 11
- FROZEN-STALE: 0 (exit 0)
- SAFE-NEW: 1 (`ingress-drain.abandonment-retry-budget.test.ts`)
- GENUINE: 4
- MIXED-CLOBBER: 6, all dispositioned as intentional contract rewrite (unbounded pending-past-ceiling → bounded `retry-limit-exceeded` / cancel-compat). Dropped lines are the old unbounded assertions and `releaseUnadopted` genuine-abandon path. Upstream `GatewayDrainingError` lines were **not** dropped.

No unresolved loss.

## Tests (owner / fossil / siblings / static)

Worktree runner: `node scripts/run-vitest.mjs run --config … --maxWorkers=1` with isolated `OPENCLAW_VITEST_FS_MODULE_CACHE_PATH`.

| Surface                                                              | Result                                                                                                        |
| -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| Fossil overlay RED (upstream `ingress-drain.ts` + unchanged 5 tests) | 1 failed / 4 passed. Ceiling test: `listFailed` empty after 8 abandonments (the defect). Controls still pass. |
| Fossil restore / reapply GREEN                                       | 5/5                                                                                                           |
| Drain owner files                                                    | `ingress-drain.test.ts` 27; abandonment 5; cancellation 2 GREEN                                               |
| Lifecycle bind (`unit-fast`)                                         | 1 GREEN (`onCancelled` forwarded)                                                                             |
| Plugin-SDK fan-in                                                    | 7 GREEN                                                                                                       |
| Channels owner shard                                                 | **101 files / 1138 tests GREEN**                                                                              |
| Feishu sibling                                                       | 10 GREEN (24h floor still pending-at-ceiling)                                                                 |
| Mattermost sibling                                                   | 33 GREEN                                                                                                      |
| Teams sibling                                                        | 4 GREEN (aged ceiling dead-letters)                                                                           |
| `git diff --check`                                                   | 0                                                                                                             |
| oxfmt --check (merge-touched)                                        | 0                                                                                                             |
| oxlint (merge-touched + boundary dts)                                | 0                                                                                                             |
| `tsgo` core prod (`tsconfig.core.json`)                              | 0                                                                                                             |
| `tsgo` core tests                                                    | 0                                                                                                             |
| `plugin-sdk:check-exports`                                           | 0                                                                                                             |

Full project suite on merge head `8a7c7a4d413…`:

```
node --import tsx scripts/test-projects.mts
OPENCLAW_VITEST_MAX_WORKERS=1
```

- Duration: 13318.27s (15:51Z–19:33Z)
- Wrapper: `[test] failed 546 Vitest shards`
- Shared `node_modules` (symlink to `source/openclaw/node_modules`) was mutated mid-run: 62 late shards `Cannot find module .../vitest/vitest.mjs`; 6 `Worker exited unexpectedly`; post-run `pathe` missing so follow-up vitest cannot even spawn
- Assertion `FAIL` headers: 234 across **143 files**
- **PR-surface FAIL hits: 0** (no drain/fan-in/Feishu/Mattermost/Teams-ingress-lifecycle files)
- Unique fail files: `REPORTS/124337-proof/full-suite-fail-files.txt`

Classification vs exact frozen upstream `923e972` / this product:

| Class                                                                         | Disposition                                                                                                                            |
| ----------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| Host shared-`node_modules` race (vitest.mjs/`pathe`)                          | Not this PR. Do not `pnpm install` in the worktree.                                                                                    |
| Worker-exit / pool crashes                                                    | Host/process contamination. Not this PR.                                                                                               |
| 143 assertion files (agents/cli/ui/config/cron/infra/commands/msteams-sdk, …) | None intersect the 11 PR files. Not repaired here. Treat as baseline/host unless a later isolated rerun on `923e972` proves otherwise. |
| Owner ingress suites run **before** node_modules collapse                     | GREEN (channels 1138, fossil 5/5, siblings, plugin-sdk fan-in)                                                                         |

This lane does not fix unrelated baseline debt.

## ClawSweeper disposition

Latest durable review on `70d47bec` (comment 5305225836): **no actionable code findings**. Patch quality platinum hermit. Blockers are proof-only:

1. Real transport-boundary behavior proof
2. Legacy cancel-compat ALS must not misclassify abandonment
3. Positive production LOC for the compat bridge needs that same proof
4. Contributor-supplied real-behavior proof before merge

This lane does **not** claim that proof. It prepares the executable spec below. Live/composite execution is scribe-owned after a separately disclosed composite.

## Composite-proof specification (executable, not a claim)

### Attribution (load-bearing)

| Name                                | What it is                                                                                                                                                                                                                 | What it is not                                                              |
| ----------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| **Source SHA (this PR)**            | Exact repaired #124337 product bytes. This lane's candidate `8a7c7a4d41317105c198e1864d2c00825203ad57` until a later additive commit on the same ancestry. Credit for cancel/abandon disposition belongs only to this SHA. | Not the Gateway process that will run live.                                 |
| **#121204 source SHA**              | Independently repaired FIFO/freshness candidate. Observed fork tip at write time: `754ee5eae4a501c124f4e1975d2efef6d3b7d9f6`. Must be re-read at composite construction.                                                   | Not absorbed here. Must not be used to explain abandonment terminalization. |
| **Continuation/frond runtime base** | Accepted continuation assembly, separately disclosed.                                                                                                                                                                      | Not this PR.                                                                |
| **Execution SHA**                   | Composite built later from those three sources. Live receipts attach to execution SHA.                                                                                                                                     | Must not be cited as #124337 merge proof by itself.                         |

Rule: a live receipt proves #124337 only when the execution SHA's `#124337` parent is the credited source SHA **and** the captured rows show this PR's disposition owner (`turn-abandoned` last error, `retry-limit-exceeded` at ceiling, cancel `attempts` unchanged). FIFO/freshness symptoms credit #121204. Continuation symptoms credit the frond base.

This lane must not build or deploy that composite.

### Preconditions

- Real Discord (preferred) or another real durable-ingress transport with `deadLetterMinAgeMs: 0` (Discord/LINE/Zalo already).
- Isolated seat, isolated `OPENCLAW_STATE_DIR`, never a prince seat.
- Known `maxAttempts` (default `DEFAULT_INGRESS_RETRY_MAX_ATTEMPTS`).
- Operator can force pre-adoption abandonment (session/run rejected before reply-lane adopt) and can force debounce/shutdown cancel.
- Capture **metadata-safe** fields only: event id, claim id, lane key, attempts, lastAttemptAt, lastError, fail reason, timestamps, adopted follower id. No message bodies, tokens, or raw payloads in the published receipt.

### Scenario A — genuine pre-adoption abandonment (budgeted)

1. Enqueue poison head + follower on one Discord lane.
2. Cause genuine `onAbandoned` before adopt, `maxAttempts` times, advancing past capped backoff each pass.
3. Pass if poison row reaches `listFailed` with `reason=retry-limit-exceeded`, `message=turn-abandoned`, payload retained, attempts at claim-time budget (`maxAttempts - 1` on fail()).
4. Pass if the next drain adopts the follower (visible reply or adopted claim id).
5. Fail if the head stays pending past the ceiling, or if cancel-compat ALS is set on this path.

### Scenario B — real cancellation remains attempts-neutral

1. Take a claimed unadopted Discord row with known prior retry facts.
2. Trigger real cancel: Discord debounce `onCancel` → `fanInChannelIngressLifecycles.cancel()`, or abort-before-dispatch `ingress.cancel()`.
3. Repeat at/above the attempt ceiling.
4. Pass if `attempts`, `lastAttemptAt`, and `lastError` are unchanged; `listFailed` empty; row remains pending.
5. Fail if attempts increment or the row dead-letters.

### Scenario C — mixed capable+legacy fan-in cancel

1. Two durable claims for one logical turn: one lifecycle with `onCancelled`, one legacy without.
2. `fanInChannelIngressLifecycles([capable, legacy]).cancel()`.
3. Repeat `maxAttempts` times.
4. Pass if both rows stay `attempts: 0` / unchanged and never dead-letter.
5. Then run Scenario A on a third poison+follower lane in the same process to prove genuine abandon still terminalizes.

### Receipt schema (metadata-safe)

```text
execution_sha
124337_source_sha
121204_source_sha
frond_base_sha
scenario: A|B|C
transport: discord|…
lane_key
head_id / follower_id
attempts_before / attempts_after
last_error
fail_reason (empty unless A)
list_pending_ids
list_failed_ids
adopted_ids
cancel_compat_expected: true|false
```

### Out of scope for this lane

Prince deploy, live Discord fire, composite construction, PR source fast-forward, ClawSweeper re-review request.

## Uncertainties

- ClawSweeper started a later review lease at 2026-08-20T06:25Z on `70d47bec`; durable verdict at write time remained the proof-blocked silver-shellfish comment. A newer in-place edit may land after this report.
- Frozen upstream was re-frozen once at `923e972`. Later `upstream/main` motion is not absorbed.
- Full-suite assertion reds were not isolated on exact `923e972` because the shared `node_modules` install collapsed during the run. Owner suites completed before that collapse.
