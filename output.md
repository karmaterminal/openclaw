# 1172 absorb — exact-control triage of unresolved test residuals

Lane branch: `codeagent/1172-absorb-residual-triage-opus5`
Bound issue: karmaterminal/openclaw#1197 (tracking also #1198, Project 85)
Regression issue opened: karmaterminal/openclaw#1200 (bound to Project 86)

The predecessor absorb report is preserved verbatim at `output-absorb-1172.md`; this file replaces it
per the workorder's deliverable contract.

---

## 1. Exact bytes and topology

| Role | SHA | Worktree |
| --- | --- | --- |
| Candidate | `cad0b99de23822698d477ac7b1618a3e8ce22ae8` | `WORKTREES/openclaw-1172-absorb-residual-triage-opus5` (lane) |
| Assembly control | `16f4b3f106033f7fe75f68e67563db1b5b4d0e2f` | `WORKTREES/ctl-asm-16f4b3f1` (detached) |
| Upstream control | `cc48aef143551af2ce13096264335ce9954e61e6` | `WORKTREES/ctl-ups-cc48aef1` (detached) |
| Merge base | `20eda756fae6599bc9d776815016f555a64d77d6` | — |

Two-parent merge verified **before any test ran**:

```
git log --merges --format='%h %p | %s' cad0b99d --not 16f4b3f1
→ 9ed7fd20b49 16f4b3f1060 cc48aef1435 | merge: absorb upstream cc48aef into continuation assembly

git merge-base --is-ancestor 16f4b3f1 cad0b99d   → true
git merge-base --is-ancestor cc48aef1 cad0b99d   → true
git merge-base 16f4b3f1 cc48aef1                 → 20eda756fae  (matches workorder)
```

Both controls are ancestors of the candidate through exactly the stated merge. No tree was moved,
re-fetched, rebased, squashed, or force-pushed. Upstream was never chased.

## 2. Environment

| Item | Value |
| --- | --- |
| Host | Linux, 20 cores, 121 GB RAM, ~4 load at lane start (shared box, sibling lanes active) |
| Node | v25.9.0 |
| Vitest | 4.1.10 |
| Node default heap ceiling | **4288 MB**, measured, for main **and** worker threads |
| Runners | `node scripts/test-projects.mjs <file>` / `node scripts/run-vitest.mjs run --config … --maxWorkers=1 <file>` only. No raw `vitest`. |

**Control dependency policy.** Both control worktrees were given the candidate's dependency tree so
that the only variable across the three runs is source bytes — which is what a control requires. The
root `node_modules` is already a symlink into the shared install and is intentionally held constant.

**Methodology defect found and corrected mid-lane (disclosed in full).** The 164 nested workspace
`node_modules` directories were *first* mirrored as plain symlinks to the candidate's. That is wrong:
pnpm puts **relative** self-links inside them —
`extensions/slack/node_modules/openclaw -> ../../..` and
`@openclaw/plugin-sdk -> ../../../../packages/plugin-sdk` — and following a symlinked
`node_modules` resolves those relative targets against the **candidate** root. 36 of the 164 nested
directories contain such links, so any *extension* test run in a control was silently loading the
candidate's `openclaw` package and `plugin-sdk`.

Both controls were rebuilt as real directories that recreate every relative self-link as a relative
link (resolving inside the control) and share only real package payloads. Verified afterwards:

```
ctl-asm-16f4b3f1: openclaw   -> …/ctl-asm-16f4b3f1
ctl-asm-16f4b3f1: plugin-sdk -> …/ctl-asm-16f4b3f1/packages/plugin-sdk
ctl-ups-cc48aef1: openclaw   -> …/ctl-ups-cc48aef1
ctl-ups-cc48aef1: plugin-sdk -> …/ctl-ups-cc48aef1/packages/plugin-sdk
```

Blast radius was bounded and every affected result was re-run: the core, gateway, `entry.respawn`,
`sandbox-explain` and `server-cron` controls resolve from the shared **root** `node_modules` and were
never affected. The only affected control was `anthropic/session-catalog`, which was re-run on
corrected controls and **strengthened** the original conclusion (§4.3). All extension results quoted
below are from corrected controls.

**Serialization.** `node_modules/.vite` is one physical directory shared by all three worktrees, so
concurrent Vitest across them would race (`ENOTEMPTY`, per root `AGENTS.md`). Every run below was
serial. This also matters for correctness: the gateway worker death is resource-sensitive, so
concurrent load would have confounded it.

## 3. Residual matrix — one row per file, all three trees

| # | File | Candidate `cad0b99d` | Assembly `16f4b3f1` | Upstream `cc48aef1` | Classification |
| --- | --- | --- | --- | --- | --- |
| 1 | `src/entry.respawn.test.ts` | 2 failed / 21 | 2 failed / 21 | 2 failed / 21 | **ENVIRONMENT** (host CA file) |
| 2 | `src/commands/sandbox-explain.test.ts` | 7 failed / 12 → **12 passed** after quarantine | 7 failed / 12 | 7 failed / 12 | **ENVIRONMENT / STALE-STATE** |
| 3 | `extensions/anthropic/session-catalog.test.ts` | F, F, **P**, F (~50 %) | 46 passed / 46 (older file) | **F, P, F** (~50 %) | **ENVIRONMENT** (host fs mtime), upstream-inherited |
| 4 | `src/cli/plugins-cli.install.test.ts` | **177 passed / 177** isolated | — | — | **NOT-REPRODUCIBLE** isolated |
| 5 | `src/plugins/npm-install-security-scan.release.test.ts` | **78 passed / 78** isolated | — | — | **NOT-REPRODUCIBLE** isolated |
| 6 | `src/gateway/server-cron.test.ts` | **60 passed / 60** (shard *and* solo) | 60 passed / 60 | **2 failed / 60** solo | **UPSTREAM-INHERITED** |
| 7 | `src/gateway/server-restart-sentinel.test.ts` | **78 tests, 1 failed** | 75 tests, 0 failed | 73 tests, 0 failed | **CANDIDATE-REGRESSION** → fixed, §5 |
| 8 | `gateway-server` shard worker death | died at **136 / 203** standalone; **passed** in full suite | died at **115** files, 4022 MB | died at **134** files, 4048 MB | **HARNESS / WORKER-CRASH** (heap) |
| 9 | `extension-slack` shard (lane-discovered) | **129 failed / 129** collection | **127 failed / 127** | **129 failed / 129** | **ENVIRONMENT / HARNESS**, pre-existing |

Exact test names for every failing case are given in the cluster sections below.

## 4. Root-cause clusters (non-candidate)

### 4.1 `entry.respawn` — host CA probe; byte-identical on all three trees

Failing cases:
- `keeps macOS system CA loading for interactive commands`
- `does not respawn one-shot commands only to change CA trust`

`src/entry.respawn.ts` (blob `a55d3df7ada`) and `src/entry.respawn.test.ts` (blob `7e0fc4685e3`) are
**the same blob on all three trees**, so a candidate regression is impossible by construction; the
identical 2/21 failure on all three confirms it empirically.

`buildCliRespawnPlan` honours the injected `platform` only for the Windows branch. When the caller
passes `autoNodeExtraCaCerts: undefined` it falls back to a **real host filesystem probe**:

```ts
resolveNodeStartupTlsEnvironment({ env, execPath, includeDarwinDefaults: false }).NODE_EXTRA_CA_CERTS
```

This box has `/etc/ssl/certs/ca-certificates.crt`, so the two cases asserting `toBeNull()` under
`platform: "darwin"` instead receive a respawn plan carrying that path plus
`OPENCLAW_NODE_EXTRA_CA_CERTS_READY`. `src/bootstrap/node-startup-env.ts` is likewise identical on
all three trees. Upstream-owned, host-dependent, outside absorb scope.

### 4.2 `sandbox-explain` — stale SQLite at fixed `/tmp` paths (proven by ablation)

7 failing cases, all shaped
`OpenClawAgentDatabaseMediaMigrationRequiredError: … uses schema version 9`.

`OPENCLAW_AGENT_SCHEMA_VERSION` is `16` in `src/state/openclaw-agent-db-contract.ts` on **all three
trees**, and `src/commands/sandbox-explain.ts` is the same blob (`9519e9d5544`) on all three, so a
sub-16 database is refused identically everywhere.

The test configures `session: { store: "/tmp/openclaw-test-sessions-{agentId}.json" }` — a fixed,
machine-global path, unlike the `mkdtemp` used by other cases in the very same file — so a stale
database left by any older checkout on this host poisons it.

**Ablation (decisive):** three stale files at `user_version` 9 were *moved* (not deleted, reversible)
to `/tmp/absorb-triage-quarantine/sqlite`, after which the candidate returned **12 passed / 12**.

Operator note: the predecessor lane's `/tmp/absorb-quarantine` no longer exists and 2199 `*.sqlite`
files were present again at lane start, with sub-16 versions still among them. **This residue
recurs on this host**; it is not a one-time cleanup, and it will keep poisoning any lane that runs
these tests until the fixed-path hygiene defect is fixed at the source.

### 4.3 `anthropic/session-catalog` — host `utimes`/`stat` millisecond rounding, ~50 % flaky

Failing case: `invalidates the assembled scan when an existing transcript is appended`
(`expected 1785396886395.999 to be 1785396886396`).

The candidate's test (`a21f93dfe05`) and source (`ceddf60995c`) blobs are **identical to upstream's**
and differ from the assembly's, i.e. the candidate adopted upstream wholesale. On corrected controls
(§2) the **upstream control itself flakes on those identical bytes**:

| Tree | Repeated runs |
| --- | --- |
| Candidate | fail, fail, **pass**, fail |
| Upstream `cc48aef1` | fail, **pass**, fail |
| Assembly `16f4b3f1` | 46/46, 46/46, 46/46 (its older file has no such case) |

Upstream failing on the same bytes is direct proof this is not a candidate regression, and the
alternation proves non-determinism rather than a deterministic defect.

Root cause is below OpenClaw entirely. A bare-Node probe touching no repository code:

```
fs.utimesSync(p, d, d);  fs.statSync(p).mtimeMs
set 1785396886396  →  read back 1785396886395.999
mismatches: 2480/5000 values (49.6 %)     [Node v25.9.0, this filesystem]
```

The test pins `appendedAt = new Date(baseNow + 2_000)` and asserts exact `toBe()` equality against
the value read back through `stat`, so it coin-flips per run on this host at very close to the
measured 49.6 % rate.

### 4.4 `plugins-cli.install` / `npm-install-security-scan.release` — clean in isolation

Both pass fully and repeatably in isolation on the candidate (**177/177** and **78/78**).

The predecessor's full-suite logs are unrecoverable (`/tmp/full-suite2.log` is a June artifact from
an unrelated lane), so the original failure text is unavailable and classification rests on
reproduction. `npm-install-security-scan.release.test.ts` is the **same blob on all three trees** and
is `mkdtemp`-hygienic. `plugins-cli.install.test.ts` carries upstream's bytes and uses
machine-global fixed roots — `const CLI_STATE_ROOT = "/tmp/openclaw-state"`,
`const PROFILE_STATE_ROOT = "/tmp/openclaw-ledger-profile"` — the same hygiene defect class as §4.2
and contention-prone under full-suite parallelism.

### 4.5 `server-cron` — upstream-inherited, and the candidate is *better*

Failing cases on upstream:
- `passes the persisted payload tool cap to trigger evaluation`
- `forwards durable recurring wake changes to cron_changed hooks`

| Tree | Isolated `server-cron.test.ts` |
| --- | --- |
| Candidate | **60 passed / 60** (both in-shard and solo) |
| Upstream `cc48aef1` | **2 failed / 58 passed / 60** solo |

These are exactly the two failures the workorder listed as untriaged. They are **upstream defects**
that the candidate does not exhibit. Not absorb fallout in any direction.

### 4.6 `gateway-server` worker death — harness heap exhaustion on **all three** trees

| Tree | Files reported | Last logged heap | Outcome |
| --- | --- | --- | --- |
| Candidate `cad0b99d` | 136 / 203 | — | `Error: Worker exited unexpectedly` |
| Assembly `16f4b3f1` | 115 | **4022 MB** | `Error: Worker exited unexpectedly` |
| Upstream `cc48aef1` | 134 | **4048 MB** | `Error: Worker exited unexpectedly` |

Measured Node default ceiling on this host: **4288 MB**, for worker threads as well as the main
thread. No `--max-old-space-size` is applied to this shard (`resolveVitestNodeArgs` returns only
`--no-maglev`) and `vitest.scoped-config.ts` sets no `resourceLimits`.

`test/vitest/vitest.gateway-server.config.ts` sets `fileParallelism: false` **and** `isolate: false`,
so all 203 shard files execute sequentially **in one worker with no module isolation**. Heap
therefore grows monotonically — measured on the assembly control at 2735 MB by file 40, 3976 MB,
4022 MB by file 115 — until V8 aborts the worker thread, which surfaces as vitest's uncatchable
`Worker exited unexpectedly` with no failing test attached.

Determinism: reproduces on every tree, at a similar heap value but a *different* file index, so it is
**resource-driven, not order-specific and not file-specific**. Under full-suite parallelism the extra
memory pressure makes the pre-abort GC thrash, and because the local full-suite profile disables the
no-output watchdog, that presents as the reported "36-minute hang".

**Correction to the predecessor's finding.** The claim that a worker dies *immediately after*
`server.sessions.process-cleanup.test.ts` is not what any run here shows. On the candidate that file
**passed** (2 tests, 2920 ms) and two further files passed after it —
`session-observer-bookkeeping.test.ts` and `server.sessions.face.test.ts` — before the exit. On the
assembly control the death occurred at an entirely different point. `process-cleanup` is
coincidental, not causal, and should not be treated as a suspect.

**Second correction — the shard is not broken under the full suite.** In this lane's full sanctioned
run the `gateway-server` shard **passed**: 174 passing file lines, zero failures, and it is absent
from the failed-shard digest. The OOM reproduces only under the standalone
`run-vitest.mjs --config …` invocation, which resolves different local worker scheduling than the
full-suite profile. So the shard is not unconditionally broken; it is *marginal*, and which side of
the 4288 MB line it lands on depends on the scheduling profile. Two other large non-isolated shards
(`extensions`, `auto-reply-reply`) took the worker death in the full run instead — same class, and
they are the two shards that emitted no summary (303 started, 301 summaries).

### 4.7 `extension-slack` — 129/129 collection failure, pre-existing on all three trees

Surfaced by this lane's full suite, not in the workorder's list. The whole shard collapses at
collection with:

```
Error: "./plugin-sdk/system-event-runtime.js" is not exported under the conditions
["node","development","import"] from package …/extensions/slack/node_modules/openclaw
```

Three slack tests (`events/reactions.test.ts`, `events/messages.test.ts`, `events/pins.test.ts`)
carry a **duplicate `vi.mock` with a `.js` suffix** alongside the bare specifier, e.g.

```ts
vi.mock("openclaw/plugin-sdk/system-event-runtime", …);
vi.mock("openclaw/plugin-sdk/system-event-runtime.js", …);   // unresolvable
```

No tree's `package.json` exports any `.js` key or wildcard — all three declare exactly
`./plugin-sdk/system-event-runtime` and zero wildcard patterns — so the `.js` specifier cannot
resolve anywhere. Because the shard is non-isolated, one unresolvable mock takes the entire shard's
collection down.

Run on **corrected** controls, each resolving against its own worktree's `package.json`:

| Tree | Result |
| --- | --- |
| Candidate | **129 failed (129)** |
| Assembly `16f4b3f1` | **127 failed (127)** |
| Upstream `cc48aef1` | **129 failed (129)** |

Identical failure and identical error on all three (counts differ only because the assembly carries
two fewer slack test files). Two of the three offending files are byte-identical on all three trees.
**Pre-existing, not absorb drift.**

## 5. The one candidate regression — found, root-caused, fixed

**`src/gateway/server-restart-sentinel.test.ts > scheduleRestartSentinelWake > preserves an explicit
targetless config restart note`**

| Tree | Result |
| --- | --- |
| Candidate | **78 tests, 1 failed** |
| Assembly `16f4b3f1` | 75 tests, 0 failed |
| Upstream `cc48aef1` | 73 tests, 0 failed |

`78 = 75 + 3` upstream-added cases, so the merge *union* is correct; nothing was dropped.

### Why it was the prime suspect

`server-restart-sentinel.{ts,test.ts}` were the only residual-implicated files whose bytes differ
from **both** controls, so they were audited line-by-line rather than sampled:

| File | base → upstream | base → assembly | Verdict |
| --- | --- | --- | --- |
| `server-restart-sentinel.ts` | +15 / −0 (`controlPlaneOnlyConfigRestart`) | +9 / −230 (extraction) | union present |
| `server-restart-sentinel.test.ts` | +61 / −0 | +304 / −0 | union present |
| `server-restart-sentinel-delivery.ts` | **untouched by upstream** | +411 (new, assembly-owned) | no upstream edit to clobber |

A per-line scan of every line upstream added found **zero missing lines** in the candidate, and
upstream never edited the function the assembly extracted — so the classic "extraction silently drops
an upstream edit" failure mode is excluded by evidence. Differing from both controls is the expected
union of two additive deltas.

### Actual root cause

Both sides additively edited the **same `enqueueSystemEvent` contract** with no textual conflict:

- The **assembly** routed restart-sentinel wakes through its own durable session-delivery queue in
  the new, assembly-owned `src/gateway/server-restart-sentinel-delivery.ts`, which sets
  `trusted: true` unconditionally and adds `sessionDeliveryAckId`. It correspondingly **retargeted**
  the pre-existing sibling case `"durably wakes the main session when the sentinel has no
  sessionKey"` from `{ sessionKey }` to the durable shape.
- **Upstream** independently added a *new* case, `"preserves an explicit targetless config restart
  note"`, asserting upstream's **bare** `{ sessionKey: "agent:main:main" }` for the same call.

Git merged both cleanly, so the merged file asserted **two contradictory shapes for one production
call**. `toHaveBeenCalledWith` is deep-equal, so the ported case failed on the extra fields:

```
+     "sessionDeliveryAckId": "session-delivery-1",
      "sessionKey": "agent:main:main",
+     "trusted": true,
```

Because that payload carries a non-empty `message`, it does **not** take upstream's new
`controlPlaneOnlyConfigRestart` early return; it falls through to the assembly's durable wake path,
so the ported assertion could **never** pass on this tree — deterministic, not flaky.

### Fix applied (bounded, test-only)

Commit `7241da4590f`. The ported assertion is retargeted onto this tree's durable-wake contract,
exactly matching the sibling case the assembly had already retargeted, with a short comment recording
why the branch differs. **No production change** — production behaviour was verified correct, and
upstream's behavioural intent (an explicit targetless note is preserved and still wakes, rather than
being consumed by the new config path) is unchanged.

This is the same class as the absorb lane's own documented "silent auto-merge" repairs, and it is the
smallest continuation/drift-scoped correction available, so it was made in-lane per the workorder's
"unambiguous and bounded" allowance rather than deferred to a repair workorder.

Verification:

```
node scripts/run-vitest.mjs run --config test/vitest/vitest.gateway-server.config.ts \
  --maxWorkers=1 src/gateway/server-restart-sentinel.test.ts
before: 1 failed | 77 passed (78)
after:  78 passed (78)
```

`node_modules/.bin/oxfmt` and `node scripts/run-oxlint.mjs` clean on the changed file;
`git diff --check` clean.

## 6. Issues created and Project 86 binding

| Issue | Title | Project |
| --- | --- | --- |
| karmaterminal/openclaw#1200 | 1172 absorb regression: restart-sentinel test asserts two contradictory shapes for one `enqueueSystemEvent` call | **Project 86** (verified bound) |

No issue was created for inherited or environmental noise, per the workorder. #1197 remains open and
was not closed by this lane.

## 7. Bounded repair workorders for the non-candidate findings

These are **out of this lane's scope** (not continuation/drift), recorded so they are not lost. None
blocks the absorb.

1. **Gateway shard heap budget.** `vitest.gateway-server.config.ts` runs 203 files in one
   non-isolated worker against a 4288 MB default ceiling. Either give the shard an explicit
   `--max-old-space-size`, split it, or drop `isolate: false` for it. Affects all three trees and
   silently truncates ~1/3 of the shard's coverage on every local full-suite run today.
2. **Fixed `/tmp` path hygiene.** `sandbox-explain.test.ts` (`/tmp/openclaw-test-sessions-{agentId}`)
   and `plugins-cli.install.test.ts` (`/tmp/openclaw-state`, `/tmp/openclaw-ledger-profile`) use
   machine-global paths where sibling cases in the same files already use `mkdtemp`. This is the
   direct cause of §4.2 and the most likely cause of §4.4.
3. **Host-dependent assertions.** `entry.respawn.test.ts` should inject `autoNodeExtraCaCerts`
   explicitly (or the resolver should honour the injected `platform`) instead of falling through to a
   real-filesystem probe; `anthropic/session-catalog.test.ts` should not assert exact `mtimeMs`
   equality across a `utimes`/`stat` round trip.
4. **Upstream `server-cron`.** Two genuine upstream failures (§4.5) that the candidate does not
   exhibit; worth reporting upstream, not fixing here.
5. **`extension-slack` unresolvable `.js` mock.** Drop the duplicate
   `vi.mock("openclaw/plugin-sdk/system-event-runtime.js")` in `events/{reactions,messages,pins}.test.ts`,
   or add the `.js` alias to the exports map. Today it costs the whole 129-file shard on every tree
   (§4.7) — a large, permanently invisible coverage hole that predates the absorb.

## 8. Uncertainties

1. Controls ran with the candidate's dependency **payload** by design (§2), with workspace self-links
   corrected to resolve inside each control. That isolates source bytes but would still mask a
   purely third-party-dependency-version-driven difference. None of the clusters proven here is
   dependency-shaped: five rest on byte identity or host probes, one is a source-level merge
   contradiction, and both harness clusters reproduce on all three trees.
2. The predecessor's original full-suite failure text for §4.4 is unrecoverable, so those two files
   are classified `NOT-REPRODUCIBLE` from clean isolated runs rather than root-caused to a named
   interaction. Their fixed-`/tmp` hygiene defect is a strong but unproven candidate cause. Both
   passed in this lane's full suite.
3. The `gateway-server` shard OOMs under the standalone config invocation on all three trees but
   completed cleanly under the full-suite profile (§4.6), so it is marginal rather than broken. The
   ~67 files after the standalone abort point are equally unproven on all three trees; they *were*
   exercised in the full run.
4. `/tmp` stale-SQLite residue recurs on this shared host and can re-poison §4.2 at any time. Only
   the `openclaw-test-sessions-*` family was quarantined; the full suite then surfaced the same class
   at `/tmp/openclaw-discord-approval-native-test.sqlite`, which was left in place so the evidence
   survives for the repair workorder.
5. `extension-msteams` (3) and `extension-telegram` (1) are red on files that are byte-identical on
   all three trees. That excludes them as absorb fallout but does not root-cause them; they were
   outside this lane's named residual set and were not investigated further.

## 9. Verdict

**CANDIDATE-REGRESSION-FOUND — one class, root-caused and fixed in-lane; all other named residuals
classified as non-candidate.**

Every residual named in the workorder now has a targeted classification backed by a three-tree
control:

- 1 CANDIDATE-REGRESSION (`server-restart-sentinel`, test-only, fixed, verified 78/78)
- 1 UPSTREAM-INHERITED (`server-cron`, fails on upstream, passes on candidate)
- 3 ENVIRONMENT (`entry.respawn`, `sandbox-explain`, `anthropic/session-catalog`)
- 2 NOT-REPRODUCIBLE isolated (`plugins-cli.install`, `npm-install-security-scan.release`)
- 1 HARNESS/WORKER-CRASH (`gateway-server` shard, reproduces on all three trees)

Plus one class the lane discovered on its own and also classified: `extension-slack` 129/129
collection failure, identical on all three trees (§4.7).

The full sanctioned suite (§11) then closed the loop: **121,900 passed / 8 failed / 208 skipped**
across 303 shards, with `gateway-server`, `commands`, `cli` and `plugins` all green, and every one of
the 8 remaining red shards mapping onto an already-established non-candidate classification or onto
files that are byte-identical on all three trees.

No unrelated upstream or baseline repairs were made. No assembly, presentation, or shared-ref
movement. No force-push, rebase, squash, or history rewrite. No credentials exposed.

## 10. Exact commands

```
# topology
git log --merges --format='%h %p | %s' cad0b99d --not 16f4b3f1
git merge-base --is-ancestor 16f4b3f1 cad0b99d
git merge-base --is-ancestor cc48aef1 cad0b99d

# controls
git worktree add --detach WORKTREES/ctl-asm-16f4b3f1 16f4b3f106033f7fe75f68e67563db1b5b4d0e2f
git worktree add --detach WORKTREES/ctl-ups-cc48aef1 cc48aef143551af2ce13096264335ce9954e61e6
# + mirror all 164 node_modules paths as symlinks from the candidate worktree

# per-file reproduction (run in each of the three worktrees)
node scripts/test-projects.mjs src/entry.respawn.test.ts
node scripts/test-projects.mjs src/commands/sandbox-explain.test.ts
node scripts/test-projects.mjs extensions/anthropic/session-catalog.test.ts
node scripts/test-projects.mjs src/cli/plugins-cli.install.test.ts
node scripts/test-projects.mjs src/plugins/npm-install-security-scan.release.test.ts

# gateway shard + single files
node scripts/run-vitest.mjs run --config test/vitest/vitest.gateway-server.config.ts --logHeapUsage
node scripts/run-vitest.mjs run --config test/vitest/vitest.gateway-server.config.ts \
  --maxWorkers=1 src/gateway/server-restart-sentinel.test.ts
node scripts/run-vitest.mjs run --config test/vitest/vitest.gateway-server.config.ts \
  --maxWorkers=1 src/gateway/server-cron.test.ts

# host probes (no repository code)
node -e 'const v8=require("v8");console.log(v8.getHeapStatistics().heap_size_limit/1048576)'
node -e '…fs.utimesSync(p,d,d); fs.statSync(p).mtimeMs…'   # 2480/5000 mismatches

# change hygiene + completion signal
node_modules/.bin/oxfmt src/gateway/server-restart-sentinel.test.ts
node scripts/run-oxlint.mjs src/gateway/server-restart-sentinel.test.ts
git diff --check
node scripts/test-projects.mjs        # full sanctioned suite
```

## 11. Full sanctioned suite

`node scripts/test-projects.mjs` on the fixed candidate, after the §4.2 stale-SQLite quarantine.

| Metric | Value |
| --- | --- |
| Shards started | **303** |
| Shard summaries emitted | **301** (2 shards died before summarising) |
| Failed shards (digest) | **8** |
| Tests passed | **121,900** |
| Tests failed | **8** |
| Tests skipped | **208** |
| Wall time | 1599.7 s |

Every failing shard maps onto a classification already established above. **No residual that this
lane classified or fixed reappeared.**

| Failing shard | Failure | Classification |
| --- | --- | --- |
| `unit-fast-fake-timers` | `entry.respawn` (2) | §4.1 ENVIRONMENT — identical on all three trees |
| `extension-msteams` | `auth-coverage` (3), `Error: Invalid token` | file **byte-identical on all three trees** → not candidate; time/fixture-dependent token validation |
| `extension-discord` | `approval-native` (1) | §4.2 class — stale `/tmp/openclaw-discord-approval-native-test.sqlite` at `user_version` 13, dated Jul 19; file byte-identical on all three trees |
| `extension-slack` | 129/129 collection | §4.7 — identical on all three trees |
| `extension-telegram` | `bot-native-command-menu` (1) retry timing | file **byte-identical on all three trees** → not candidate |
| `tooling` | `plugin-sdk-surface-report` (1) | inherited; file is `=assembly`, and the pinned wildcard budget mismatch was already proven inherited by the predecessor |
| `extensions` | worker death, no summary | §4.6 harness heap class |
| `auto-reply-reply` | worker death, no summary | §4.6 harness heap class |

Confirmed **clean** in this run, i.e. the fix and the environment work held:

- `gateway-server` — 174 passing file lines, **zero** failures, including
  `server-restart-sentinel.test.ts` with the §5 fix and all six `server-cron*` files.
- `commands` (`sandbox-explain`), `cli` (`plugins-cli.install`), `plugins`
  (`npm-install-security-scan.release`) — all passed.
- `extension-providers` (`anthropic/session-catalog`) — passed on this run's coin flip.

The three shards that were red for reasons *outside* any classification here (`extension-msteams`,
`extension-telegram`, and the `.js`-mock half of `extension-slack`) are all backed by files that are
**byte-identical on all three trees**, so none of them can be absorb fallout.
