# M1 #1255 — bounded pre-adoption abandonment (independent review)

- **Bound issue:** [karmaterminal/openclaw#1255](https://github.com/karmaterminal/openclaw/issues/1255) (child of [#1254](https://github.com/karmaterminal/openclaw/issues/1254))
- **Lane:** `codeagent/ward-1255-m1-intervention`
- **Implementation:** `401dc7a1f5c3445b4ff85de6ac0574f91da2fde9`
- **Review/sibling retarget:** `a01d78a4b33c155c948eeca283f179ef06fa7e7e`
- **Upstream PR:** https://github.com/openclaw/openclaw/pull/124337 (not merged)
- **Upstream base:** `5626a79cc836d95d236debd720a34fc2dcdcc685`
- **Frozen fossil:** `c17a5c73a9bf9807d15b33bfa6bfb4aad5116398` (`origin/codeagent/silas-abandonment-red-fossil`)
- **No fleet / live / DB / config / continuation / #121204 mutation. Unit causal closure is not a fleet cure.**

By: frond scribe 🌿 (@scribe-dandelion-cult, acct 2026-05-06) | OpenClaw: 3 PRs, 6 issues, 1 commits/12mo | GitHub: 2276 commits, 1716 PRs, 294 issues, 35 reviews

## What changed

Production owner remains `createChannelIngressDrain` in `src/channels/message/ingress-drain.ts`.

- `onAbandoned` now settles through existing `applyFailureDisposition(..., Error("turn-abandoned"))`.
- `onCancelled` stays `releaseClaim({ recordAttempt: false })` (budget-free).
- `releaseUnadopted` renamed to `settleUnadopted` and takes the terminal write as a callback. Phase / guillotine / stall-timer / `settleOnce` ownership unchanged.
- No new retry mode, config, schema, helper, error hierarchy, or channel branch.

**Corrected upstream-owned expectation:** `ingress-drain.test.ts` no longer pins pending attempts past `maxAttempts` when `deadLetterMinAgeMs: 0`. Retry accounting is preserved; the ceiling now requires `retry-limit-exceeded`.

**Independent review finding (fixed here):** Microsoft Teams `message-handler.ingress-lifecycle.test.ts` aged the row two days (age floor met) and still expected pending `attempts: 8` then `9`. That is the same defective contract. Retargeted to require aged-ceiling dead-letter and no resurrection. Feishu/Mattermost copies stay pending because they never meet the 24h age floor; comments record that.

Production LOC (implementation): **+10 / -5** (3 added lines are the ownership comment).
Review delta: tests only (`msteams` retarget + two sibling comments).

Affected symbols: `settleUnadopted`, `createLifecycle.onAbandoned`, `createLifecycle.onCancelled`, callee `applyFailureDisposition` → `resolveIngressFailureDisposition`.

## Independent review

**Best-fix verdict:** best. The drain already owned bounded disposition and applied it to only one of its own pre-adoption exits.

**Alternatives rejected:**

1. Discord-only / channel-branch fix — wrong owner; the asymmetry is in core drain.
2. New abandon retry mode or config — product already has `maxAttempts` + age floor.
3. Special-case `maxAttempts` inside `releaseClaim` — would tax cancellation and every release caller.

**Code read:** `ingress-drain.ts` (`createLifecycle`, `applyFailureDisposition`, `releaseClaim`, `failClaim`, `settleOnce`), `ingress-retry-policy.ts`, owner tests, fossil, MS Teams / Feishu / Mattermost abandon siblings, Discord/Line/Zalo `resolveNonRetryableFailure` (instanceof / auth only; none match `"turn-abandoned"`).

**Remaining uncertainty:** treatment-composite Gateway/state-dir smoke and live Discord delivery are out of this lane. `R-NC-ABANDON-SETTLE-RACE` is owned by reused `settleOnce`, not a new race harness.

GitNexus was not used as authority (stale). Direct source is the authority.

## Receipts (verified)

Immutable copies: `/home/figs/.copilot/session-state/10458b29-3e96-4ee4-95e4-13c1b00a8c0f/files/receipts/`

| Step                  | File                             | Result                                                          |
| --------------------- | -------------------------------- | --------------------------------------------------------------- |
| Base RED              | `01-base-red-5626a79.txt`        | fossil contract RED (`1 failed / 4 passed`); empty `listFailed` |
| Patch GREEN           | `02-patched-green-fossil.txt`    | 5 passed                                                        |
| Owner shard           | `03-channels-shard-green.txt`    | 103 files / 1129 tests GREEN                                    |
| Patch-only revert RED | `04-patch-only-revert-red.txt`   | fossil RED restored + old drain expectation RED                 |
| Reapply GREEN         | `05-reapply-green.txt`           | 32 passed                                                       |
| Fossil equivalence    | `06-fossil-equivalence.txt`      | executable surface comment-only vs `c17a5c73`                   |
| Negative controls     | `07-negative-control-shards.txt` | discord 2775, line 528, plugin-sdk 765, auto-reply 3795         |
| Full suite            | `08-full-suite.txt`              | 539 shards / 15 failed; classified below                        |

Independent hash check: fossil source `573e0283…d1522c`, shipped source `ac150d78…f26346`. After dropping file-level + line comments the only remaining hunk is the `INCIDENT_RETRY_POLICY` JSDoc. Assertion/input bodies match.

Reviewer re-ran after sibling retarget:

```bash
node scripts/run-vitest.mjs run --config test/vitest/vitest.channels.config.ts --maxWorkers=1 \
  src/channels/message/ingress-drain.abandonment-retry-budget.test.ts \
  src/channels/message/ingress-drain.test.ts
# 32 passed

node scripts/run-vitest.mjs run --config test/vitest/vitest.extension-msteams.config.ts --maxWorkers=1 \
  extensions/msteams/src/monitor-handler/message-handler.ingress-lifecycle.test.ts
# 4 passed on patch; 1 failed on exact-base drain (pending attempts: 8, intended)
```

Exact-base drain + old MS Teams test: 4 passed (proves the sibling was GREEN on `5626a79`).

## Full-suite classification vs `5626a79`

Every failing file except the three drain files is **byte-identical** to exact base. This lane does not own those surfaces.

| Class                                          | Items                                                                                                                                                                                                                                                                                                                                                      |
| ---------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **M1 sibling (fixed)**                         | `extensions/msteams/.../message-handler.ingress-lifecycle.test.ts` — old unbounded-after-age assertion. GREEN on exact-base drain; RED on patch until retargeted.                                                                                                                                                                                          |
| **Isolation flake**                            | `message-handler.control-ui-build-admission.test.ts` (suite RED, isolation GREEN); `plugin-lifecycle-measure.test.ts` (suite RED, isolation GREEN).                                                                                                                                                                                                        |
| **Deterministic pre-existing / host**          | `exec-authorization-render.test.ts` (`/usr/bin/rg` vs `rg`); `src/claws/project.test.ts` golden digest `1a65cb72…` vs `f7377ae6…`. Isolation reruns still RED.                                                                                                                                                                                             |
| **Unchanged vs base; not re-run in isolation** | tui-pty timeouts; shell-snapshot HOME/path; Codex configured-MCP 120s timeouts; package-mac-app / install-sh / ensure-playwright / prepack / plugin-npm-package-manifest / npm-install-security-scan; git-backup `refs/heads/master`; backup-create 120s timeouts; full-release-validation-at-sha git refs. Same class as prior fossil-lane baseline reds. |
| **Harness artifact**                           | `[code-mode-matrix] FAIL harness_error ollama-qwen3-5-9b-…`                                                                                                                                                                                                                                                                                                |

No remaining suite red is attributable to the drain patch after the MS Teams retarget.

Full suite was **not** rerun after the sibling-only test change.

## Proof handoff

Machine-readable manifest: `proof-handoff.json`.

Future docs corpus (publication lane fills `PR-NNNNNN` + head SHA):

`karmaterminal-openclaw-docs:main:PR-NNNNNN/PROOFS/<FULL_SHA>/`

Rows: `R-NC-ABANDON-BUDGET`, `R-NC-ABANDON-LANE-PROGRESS`, `R-NC-ABANDON-CANCEL`, `R-NC-ABANDON-SETTLE-RACE`.

## Commands

```bash
node scripts/run-vitest.mjs run --config test/vitest/vitest.channels.config.ts --maxWorkers=1 \
  src/channels/message/ingress-drain.abandonment-retry-budget.test.ts \
  src/channels/message/ingress-drain.test.ts
node scripts/run-vitest.mjs run --config test/vitest/vitest.extension-msteams.config.ts --maxWorkers=1 \
  extensions/msteams/src/monitor-handler/message-handler.ingress-lifecycle.test.ts
# sanctioned full suite (already received): node --import tsx scripts/test-projects.mts
```
