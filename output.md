# openclaw-local-ci harness test-fail cure — byte report

Worktree: `codeagent/ci-harness-cure` @ `b7ed06ed`. Byte-investigation of the 3
*accepted* harness test-fail classes carried by `openclaw-local-ci` on `b7ed06ed`.

## Headline verdict

**The fork CI runner is mis-pinned to Node 22.** That single fact is the root
cause of **two** of the three classes, and the runner's resulting
over-parallelism is the root cause of the third.

| # | Class | Root cause | Curable? | Cure |
| - | ----- | ---------- | -------- | ---- |
| 1 | Codex resume-path | CPU starvation under over-parallel runner load (real-timer test windows blow). **Code is correct.** | **Yes** | Cap runner parallelism (env-var) so shards are not oversubscribed |
| 2 | code-mode `--import tsx` | Node 22 nested-worker `--import tsx` does not register tsx | **Yes** | Runner Node **22 → 24** |
| 3 | shrinkwrap `deps:shrinkwrap:check` | Node 22 ships **npm 10**; committed shrinkwrap is **npm 11** (Node 24) | **Yes** | Runner Node **22 → 24** (brings npm 11) |

The runner workflow (`openclaw-bootstrap/.github/workflows/openclaw-ci.yml:149-151`)
pins `actions/setup-node@v4` → `node-version: "22"`. Openclaw's primary CI uses
**Node 24.x** (`.github/workflows/ci.yml:484`, plus 24.x across release/smoke
workflows); AGENTS.md: "CI truth is Linux Node 24". `generate-npm-shrinkwrap.mjs:690`
literally targets "supported Node 24 patch versions".

**Answer to figs's framing ("env vars for the runner, or other means?"): YES — all
three are runner-side cures. None require an openclaw production-code change.**

All findings reproduced locally on a 20-core Linux host. Node binaries used:
`v22.22.3` (npm 10.9.8), `v24.17.0` (npm 11.13.0), `v25.9.0` (npm 11.12.1).

---

## Class #1 — CODEX resume-path under parallelism — **KEEP `fb40f3c1d6`**, cure = cap parallelism

### Byte
`turn/start` = fork-fix `fb40f3c1d6` RESUME (correct); `thread/start` = pre-fix
throwaway. The resume-vs-rotate decision (`extensions/codex/src/app-server/thread-lifecycle.ts`,
`startOrResumeThread` / `deferLegacyWebSearchRotation`) is a **pure function of
`params` + the on-disk binding — no timer in the decision**. The fork-fix is correct.

The failure is **not** a code regression and **not** Node-version-driven. It is an
**event-loop-starvation timing artifact**: the failing tests use **real timers**
(`run-attempt-test-harness.ts`; `createParams` `timeoutMs: 5_000`; the
context-engine inline harness `waitForMethod` uses `vi.waitFor({interval:1})` with
Vitest's **1000 ms default** timeout). Under the runner's few-core parallel load the
codex shard's event loop is starved, so the async attempt does not issue
`turn/start` (and sometimes not even `thread/start`) inside the wait window.

### Proof
| Config | Result |
| --- | --- |
| `-extra` shard, 2 failing files, isolated, Node 25 | 87/87 GREEN |
| `-extra` shard, 2 failing files, isolated, Node 22.22 | 87/87 GREEN |
| `-extra` shard, all 9 files, isolated, Node 25 | 139/139 GREEN |
| Full parallel suite (`test-projects.mjs`), Node 25, 20 cores | codex `-extra` GREEN |
| **Node 22 + `OPENCLAW_TEST_PROJECTS_PARALLEL=12` + `taskset -c 0-3`** (faithful runner) | **context-engine 14/24 FAILED** |
| `-extra` shard + 8 CPU burners oversubscribing 2 cores, Node 22 | FAIL (`expected [] to include 'turn/start'`) |
| same contention, **Node 24** | **FAIL too** (2 tests) → not Node-driven |
| `-extra` shard on **dedicated** cores while burners saturate other cores, Node 22 | **87/87 GREEN** |

The failing-test set is **non-deterministic** across runs (1 test, then 2, then 14)
— the signature of a timing artifact, matching frond-scribe's prior "single-run
non-deterministic" classification of timing-sensitive substrate. Symptom severity
scales with starvation: light starvation → `thread/start` issued but `turn/start`
starved out (the workorder's "got thread/start"); heavy starvation → no requests at
all (`expected [] to include 'turn/start'`). Same root cause.

### Verdict
**KEEP `fb40f3c1d6`.** It is green in every adequately-resourced config including
full parallel. The 4 runner fails are CPU-starvation wait-window timeouts, not
evidence the resume-path is broken.

### Cure (runner-side, env-var — exactly figs's ask)
Stop oversubscribing the runner's cores. Either:
- **Unset `OPENCLAW_TEST_PROJECTS_PARALLEL`** → in CI (`GITHUB_ACTIONS=true`)
  `resolveParallelFullSuiteConcurrency` returns **1 (serial)** by design
  (`scripts/test-projects.test-support.mjs:3084`), which eliminates starvation; or
- **Cap `OPENCLAW_TEST_PROJECTS_PARALLEL` ≤ the runner's physical core count**
  (keeps parallel speed without oversubscription). Proven: codex is green on
  dedicated cores even while other cores are saturated.

Optional belt-and-suspenders (openclaw-side, *not* required, *not* implemented
here): the context-engine inline harness `waitForMethod` uses the 1000 ms `vi.waitFor`
default while the turn-watches harness uses 5000 ms — bumping the context-engine
window to match would raise the starvation tolerance. This only papers over flake;
the definitive cure is not oversubscribing.

---

## Class #2 — CODE-MODE `--import tsx` not activating (#1191) — cure = Node 22 → 24

### Byte
`src/agents/code-mode.ts:633-640` (and the identical
`src/agents/compaction-planning-worker.ts:71-76`) spawn the **source** worker
(`*.worker.ts`) with `execArgv: ["--import", "tsx"]` so tsx resolves the TS
`import "./x.js"` → `x.ts` convention inside the nested worker
(`resolveCodeModeWorkerUrl` picks `.ts` when not running from `/dist/`, i.e. under
vitest/`pnpm dev`).

**On Node 22.x, `--import tsx` does not register tsx's module hooks inside a worker
thread.** Node's native TS type-stripping (default since 22.18) then loads the `.ts`
worker entry but does **not** rewrite `.js`→`.ts` import specifiers → the exact
runner error: `Cannot find module '.../code-mode-json.js' imported from
code-mode.worker.ts`. On Node 24/25 the worker `--import tsx` registers correctly.

### Proof (this host)
Minimal nested-worker repro (`new Worker(url.ts, {execArgv:["--import","tsx"]})`,
worker imports `./dep.js` that exists only as `./dep.ts`):

| Node | nested worker | real `code-mode.test.ts` (`vitest.agents-core`) |
| --- | --- | --- |
| 22.22.3 | `ERROR Cannot find module .../dep.js` | **30 / 53 FAILED** |
| 24.17.0 | `MESSAGE {ok:true}` | **60 / 60 pass** (incl. compaction worker) |
| 25.9.0  | `MESSAGE {ok:true}` | pass |

- tsx 4.22.3 works in the **main** process via `--import tsx` on Node 22 — only the
  **worker-thread** `--import` registration is broken on 22.x.
- `--no-experimental-strip-types` on Node 22 → `Unknown file extension ".ts"`,
  confirming tsx never registered (native strip was the only loader).
- `NODE_OPTIONS=--import tsx`, `--import tsx/esm`, `--loader tsx/esm` do **not** fix
  the Node-22 worker case.

### Cure A (recommended): runner Node 22 → 24
```diff
# openclaw-bootstrap/.github/workflows/openclaw-ci.yml (setup-node step)
-          node-version: "22"
+          node-version: "24"
```
Matches openclaw's documented CI truth; pure harness/CI config; fixes #2 **and** #3.

### Cure B (secondary, openclaw-side, *not* implemented — broader blast radius)
Spawn a `.mjs` bootstrap worker that registers tsx via its supported programmatic
API, instead of relying on `execArgv:["--import","tsx"]`. **Proven on Node 22.22.3:**
```js
// boot.mjs (worker entry)
import { register } from "tsx/esm/api";   // NOT node:module register — tsx rejects that
register();
await import("./code-mode.worker.ts");
```
This also fixes `pnpm dev` code-mode on Node 22 (a latent non-CI bug). It changes
production worker-spawn in two files, so it is heavier than Cure A and only
addresses #2. Recommend Cure A unless Node-22-from-source dev support is wanted.

---

## Class #3 — SHRINKWRAP guard — cure = Node 22 → 24 (npm 10 → 11)

### Byte
`deps:shrinkwrap:check` = `generate-npm-shrinkwrap.mjs --all --check` regenerates
`npm-shrinkwrap.json` with **the npm bundled in the active Node toolchain**
(`scripts/npm-runner.mjs` → `resolveToolchainNpmRunner`) and diffs vs committed:
- Node 22 → **npm 10.9.8**
- Node 24 → **npm 11.13.0** (what the committed shrinkwrap and openclaw's main CI use)

npm 10 and npm 11 produce **structurally different** package-lock v3 trees
(different hoisting/dedup), beyond what `normalizeNpmVersionDrift`
(`generate-npm-shrinkwrap.mjs:680`, which only bridges npm-11 *patch* drift via
`delete libc`/`peer`) can absorb. So the runner's Node 22 / npm 10 output diverges
from the committed npm-11 shrinkwrap. "Intermittent" because it only surfaces when a
shrinkwrap-affecting path is generated/compared.

### Proof (this host, no network needed — uses pnpm store/cache)
```
node scripts/generate-npm-shrinkwrap.mjs --check
  Node 24.17 (npm 11):  ".: npm-shrinkwrap.json is current."   EXIT 0   ✅
  Node 22.22 (npm 10):  ".: npm-shrinkwrap.json is stale."     EXIT 1   ❌
```
Generating on Node 22 and diffing the committed file shows npm-10-vs-11 tree
differences, e.g. `node_modules/cliui` resolved as `6.0.0` (npm 10) vs `8.0.1`
(npm 11), and a removed nested `qrcode/node_modules/cliui`. (Committed file restored
immediately; worktree clean.)

### Cure: runner Node 22 → 24
Same one-line `setup-node` change as #2. The runner then uses npm 11, matching the
committed shrinkwrap toolchain. No `--check` skip env-var needed (and skipping would
hide real drift). Pinning npm independently of Node would also work but is fragile;
matching Node 24 is the clean fix and unifies with #2.

---

## Unrelated observation (NOT one of the 3 classes, NOT in scope)
On this host the full Node-25 suite has one extra failure:
`src/infra/exec-authorization-render.test.ts > renders dispatch-wrapper safe-bin
commands without quote-all argv rendering` — `expected '/usr/bin/rg -n needle' to be
'rg -n needle'`. The test assumes `rg` is not resolvable to an absolute path; this
host has ripgrep at `/usr/bin/rg`. It is **environment-specific** (host has rg
installed), not Node-version- or class-related, and would pass on a runner without
`/usr/bin/rg`. Flagged for awareness only.

---

## Validation / full-suite tally
- Completion signal: `node scripts/test-projects.mjs`, Node 25.9.0, 20 cores:
  **87 / 89 shards green** in 286.6s. The 3 target classes are all GREEN on a correct
  toolchain (Node 24/25 + adequate cores) — i.e. the cures' end-state:
  `agents-core code-mode.test.ts` ✓ (53), `extension-codex-app-server-attempt-extra`
  context-engine ✓ (24) + turn-watches ✓ (63).
- The 2 failing shards are **unrelated** to the 3 classes:
  - `vitest.infra.config.ts` — `exec-authorization-render` `rg`-path test
    (env-specific: ripgrep at `/usr/bin/rg` on this host).
  - `vitest.extension-imessage.config.ts` — `monitor.watch-subscribe-retry`
    `watch.subscribe` retry-timeout test. **Passes 5/5 in isolation** → a parallel-load
    timing flake of the **same genus as #1**. Corroborates that the runner's
    over-parallelism flakes real-timer tests broadly; codex is one instance, and the
    #1 cure (do not oversubscribe) benefits the whole genus.
- Per-class faithful repro on Node 22 (+ parallel/starvation) reproduced #1 (codex
  context-engine 14/24), #2 (code-mode 30/53), #3 (shrinkwrap stale) — confirming the
  diagnoses.

## Exact commands
```bash
# per-Node nested-worker tsx repro (.tmp-cmrepro, git-excluded scratch)
node .tmp-cmrepro/main2.mjs '["--import","tsx"]'

# real code-mode under a given Node
PATH=<nodeXX/bin>:$PATH node scripts/run-vitest.mjs run \
  --config test/vitest/vitest.agents-core.config.ts --maxWorkers=1 \
  src/agents/code-mode.test.ts src/agents/compaction-planning-worker.test.ts

# codex -extra shard under a given Node
PATH=<nodeXX/bin>:$PATH node scripts/run-vitest.mjs run \
  --config test/vitest/vitest.extension-codex-app-server-attempt-extra.config.ts \
  --maxWorkers=1 \
  extensions/codex/src/app-server/run-attempt.context-engine.test.ts \
  extensions/codex/src/app-server/run-attempt.turn-watches.test.ts

# faithful runner emulation for #1 (Node 22 + parallel + few cores)
CI=true GITHUB_ACTIONS=true OPENCLAW_TEST_PROJECTS_PARALLEL=12 \
  taskset -c 0-3 <node22> scripts/test-projects.mjs

# shrinkwrap check per Node
<nodeXX> scripts/generate-npm-shrinkwrap.mjs --check

# completion signal
node scripts/test-projects.mjs
```

## Uncertainties
- Exact runner physical core count is unknown; the precise `OPENCLAW_TEST_PROJECTS_PARALLEL`
  value to set for #1 should match the runner's cores (my 4-core emulation is
  deliberately harsher and produced more collateral starvation than the runner's "4
  codex" set). The principle — do not oversubscribe — is firm.
- The exact runner workflow that sets `OPENCLAW_TEST_PROJECTS_PARALLEL` was not in the
  local `openclaw-bootstrap` checkout (stale); the Node pin and `pnpm test` path were
  confirmed in `openclaw-bootstrap/.github/workflows/openclaw-ci.yml`.
- The Node "works" boundary is between 22.x (fails #2) and 24.x (works); 23.x not
  tested. 24 is the documented target, so the boundary is moot.
