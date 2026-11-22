# output: 129388-browser-headless-cleanup-rerun

Bound to karmaterminal/openclaw#129388 (upstream PR; fork lane). Read-only: no product file changed.

**Verdict: upstream-baseline, triggered by host arch. Not candidate-attributable.**

The four `chrome.headless-cleanup` reds come from an upstream mismatch between a test and the code
it tests. It is deterministic on any **aarch64 host whose CPU model does not contain "Apple"**, at
all three refs. Whether Mode-B shows it depends only on the arch of the runner that the mixed-arch
ARC scale set `oc-8cpu-32gb` assigns to the extension-browser batch:

- the "green" at 8fbf29f2 (Mode-B 44990430565) ran on an **X64** runner;
- the red at a329243b (Mode-B 45008617882) ran on **aarch64**;
- 16541aa5 (44932832262) and 9476c7aa (44733879344) were also red on ARM64.

- **Local:** red 10/10 at each of a329243b, 16541aa5 and 5a3e6b1c, on ronan (aarch64). Every run
  fails CI's exact four cases with CI's three messages; the other 41 cases pass.
- **Counterfactual:** a scratch copy of the test that mocks one input, the `os.cpus()` model
  string, passes 45/45 at all three refs with `"Apple M2"` (2/2 each). With the host's own
  `"unknown"` it fails CI's same four (1/1 each).
- **Not run:** no Mode-B dispatch.

## Named refs

| category | ref | full SHA | equality |
| --- | --- | --- | --- |
| product / candidate | karmaterminal/openclaw candidate | `a329243bd1aa4e8677517a5eaf4a67aa30ca8647` | control worktree `cand-a329243b` HEAD = this SHA; lane branch base = this SHA |
| prior head | #129388 presentation head before stage 4 | `16541aa5a8ee81f1e505a414e2d21a758c43cbc2` | control worktree `prior-16541aa5` HEAD = this SHA |
| upstream baseline | openclaw/openclaw main absorbed by stage 4 | `5a3e6b1cb09bb886c4f9760d5d155353131e823a` | control worktree `up-5a3e6b1c` HEAD = this SHA; ancestor of a329243b (not of 16541aa5, which predates stage 4) |
| CI source run | karmaterminal/openclaw-bootstrap Mode-B 45008617882, job `hosted(extension-browser,extension-active-memory)` (job id 137166030126) | product `a329243bd1aa4e8677517a5eaf4a67aa30ca8647`, workflow `105e83abf9c3d328695e022779d75cb556fdc275` | from the job log (`target-sha`, checkout of the workflow SHA); `ci/receipts.tsv` |
| lane | `codeagent/129388-browser-headless-cleanup-rerun` | published unchanged at `a329243bd1aa4e8677517a5eaf4a67aa30ca8647` before any evidence; receipts on top (final SHA in the COMPLETE post) | local = tracking = server at each push |
| CI / workflow for this lane | N/A | N/A | read-only lane, local focused controls only, no dispatch |
| presentation | N/A | N/A | untouched |
| docs / proof | `lane-evidence/129388-browser-headless-cleanup-rerun/` | at the lane SHA | pushed |

The three relevant files are byte-identical at all four SHAs:
`chrome.headless-cleanup.test.ts` (`17c00693`), `chrome.playwright-cache.ts` (`285291b4`) and
`chrome.executables.ts` (`49ecedb5`); `chrome.ts` (`2aac78a2`) is identical too. The fork's diff
in `extensions/browser/` against 5a3e6b1c is 0 files.

## Counts per ref

All runs: ronan, aarch64, 1 worker, Node v26.12.1. Each round runs all three refs; the first ref
rotates every round (round 1 ran cand, prior, up by hand; rounds 2–10 used `tools/rounds.sh`).

| control | a329243b cand | 16541aa5 prior | 5a3e6b1c upstream |
| --- | --- | --- | --- |
| interleaved ×10, unmodified test | **red 10/10** | **red 10/10** | **red 10/10** |
| failed set per run | CI's 4 (digest `5d8e3cad1eb4` = CI's) in all 10 | same, 10/10 | same, 10/10 |
| probe: `os.cpus()` model `"unknown"` (the host's own; mock is neutral) | red 1/1, CI's 4 | red 1/1, CI's 4 | red 1/1, CI's 4 |
| probe: `os.cpus()` model `"Apple M2"` | **pass 2/2** (45/45) | **pass 2/2** (45/45) | **pass 2/2** (45/45) |

Every red run fails exactly these four cases, with CI's three messages:

- `cleans up a one-shot darwin cache shell only when ownsProfile=true|false`:
  `expected undefined to be '<root>/browsers/chromium-100/chrome-mac-arm64/…'` at `:238:75`;
- `recovers stale cache browser with configuredHeadless=false, ownsProfile=true, code=websocket_health_command_timeout`:
  `No supported browser found` (`chrome.ts:596`);
- `recovers stale cache browser with configuredHeadless=true, ownsProfile=true, code=websocket_health_command_timeout`:
  `PortInUseError: Port is already in use.`

## CI receipts by runner arch

`ci/receipts.tsv` indexes these receipts with sha256. The logs stay on the seat under
`~/.local/state/frond-scribe/receipts/`, because openclaw-bootstrap is private.

| Mode-B run | product SHA | workflow SHA | extension-browser runner arch | darwin cache case |
| --- | --- | --- | --- | --- |
| 45008617882 | `a329243b…` | `105e83ab…` | aarch64 | **red** (CI's own serial rerun: "DETERMINISTIC (re-red on isolated re-run)") |
| 44990430565 | `8fbf29f2…` | `105e83ab…` | X64 | green |
| 44932832262 | `16541aa5…` | `105e83ab…` | ARM64 | **red** |
| 44733879344 | `9476c7aa…` | `5ffdcf67…` | ARM64 | **red** |

The first three runs share one workflow SHA and one scale set. The test and code files are
identical across their products. Only the runner arch varies, and it alone predicts the result.

## Mechanism

1. **The test's fake cache** (`chrome.headless-cleanup.test.ts:93-95`, `setupOwnedBrowser`) names
   the Chrome for Testing directory from **`process.arch`**:
   `const arch = process.arch === "arm64" ? "arm64" : "x64"` → `chrome-mac-${arch}`. On an aarch64
   host it creates `chromium-100/chrome-mac-arm64/Google Chrome for Testing.app/…`.
2. **The resolver** (`chrome.playwright-cache.ts:56`, `findPlaywrightChromiumExecutable`) picks the
   mac directory from **the CPU model**:
   `macArm64 = platform === "darwin" && os.cpus().some((cpu) => cpu.model.includes("Apple"))`. The
   comment there explains why: "Playwright selects native Apple silicon even when Node runs under
   Rosetta". On a Linux aarch64 host the model is not Apple (ronan reports `"unknown"` for all 20
   CPUs), so the resolver looks for `chrome-mac-x64`. That directory does not exist, and it returns
   `null`. This is the only `os.cpus()` call in `extensions/browser/src`.
3. **On a real Mac the two agree.** Apple silicon gives arm64 + "Apple"; Intel gives x64 + no Apple.
   An x86_64 Linux runner also agrees (x64 + no Apple, so `chrome-mac-x64`), which is why X64 CI
   passes. Only a non-Apple arm64 host splits them, and the test fakes `darwin` on a Linux host.
4. **The three CI messages all follow from that one `null`:**
   - `:238` asserts on the resolver directly, which gives `expected undefined`.
   - With `configuredHeadless=false`, the stale process is the headless shell. It is identified by
     name (`readOwnedManagedHeadlessShell`, `chrome.ts:102`), stopped, and the port frees. Then
     `launchOpenClawChromeLocked` resolves the executable (`chrome.ts:594`), gets `null`, and throws
     `No supported browser found`.
   - With `configuredHeadless=true`, the stale process is full Chrome. Identifying it needs the
     resolved executable (`resolveOwnedManagedChromeIdentity`, `chrome.ts:107`). That is `null`, so
     `recoverOwnedStaleManagedChromeCdpListener` returns false, and `ensureManagedChromePortAvailable`
     rethrows the fixture's `PortInUseError` (`chrome.ts:340`).
5. **History** (upstream, ancestors of all three refs):
   - `03af81024d` (#154607, 2026-10-15) added the Apple-CPU `macArm64` check and the
     `recovers stale cache browser` cases;
   - `32748bce75` (#173936, 2026-10-16) wrote the test's `mac-${arch}` suffix from `process.arch`.
   - `upstream/main` `8d1e59c2fddcfefb29b3000ca8faa091e7aa8d13` (fetched 2026-11-22) has no later
     change to either file (context only).
   - `gh search` in openclaw/openclaw found no PR or issue for it.

## Step 3 (CI conditions): not needed

The red reproduced in step 2, so step 3 did not run. Each suggested condition is ruled out by the
code and by the local reproduction:

- **Another listener on the test's ports.** The test never binds or probes a real port: it mocks
  `ensurePortAvailable` (`fixture.portProbe`), and that mock throws `PortInUseError` while the fake
  pid 4321 is "alive". The CI `PortInUseError` is that fixture error, rethrown (Mechanism 4).
- **No Chrome on PATH.** The test stubs `fs.statSync` and `fs.existsSync` to reject every path
  outside its temp root, so a host Chrome is invisible either way. `No supported browser found` is
  the resolver's `null` from Mechanism 2.
- **`OPENCLAW_TMP_DIR` under a 94-character root.** It reproduced with a short root
  (`/home/figs/classify-129388-bhc/cand-a329243b`, 44 characters) and a short TMPDIR. Path length is
  not part of the trigger.

## Classification

- **Not candidate-attributable.**
  - Red 10/10 at 5a3e6b1c and at 16541aa5, with the identical failed set.
  - The fork changes nothing in `extensions/browser/`.
  - The only input that flips the result is the host CPU model, which the probe varies without
    touching product code.
  - No TROUBLE was posted.
- **Upstream-baseline.**
  - The defect is upstream's: the test assumes `process.arch` picks the mac cache directory, but
    the product picks it from the CPU vendor.
  - It has been in upstream since 2026-10-16 and is carried unchanged.
- **Trigger is environmental.** Runner arch: aarch64 without an Apple CPU. Expect the four cases red
  whenever extension-browser lands on an ARM64 runner, and green on X64, at any of these refs.
- **The 8fbf29f2 green was arch luck, not a cure.**
- **No fix in this lane.** An upstream test fix would make the fixture agree with the resolver, for
  example by mocking `os.cpus()` or deriving the suffix the same way. That is a follow-up for
  upstream, not this lane.

## How the controls ran

- **`tools/ctl.sh REF FILE RUN [ENV...]`** is adapted from
  `lane-evidence/129388-stage4-new-reds-reruns/tools/ctl.sh` with its own root,
  `/home/figs/classify-129388-bhc`. Each run:
  - goes through `oc-focused` (openclaw's planner picks `test/vitest/vitest.extension-browser.config.ts`;
    `--maxWorkers=1`, umask 0022, `FORCE_COLOR` unset);
  - runs inside `run-isolated-from-live-gateways.sh`;
  - uses Node v26.12.1 (CI's version), `OPENCLAW_VITEST_RUNTIME=node`, and a private 0700 HOME and
    TMPDIR;
  - keeps its full raw log in `controls/`, with one row in `controls/summary.tsv`.
- **`tools/rounds.sh FILE FROM TO`** runs interleaved rounds with a rotating first ref.
- **`tools/cpu-probe.sh REF RUN MODEL`** is diagnostic only. It writes an untracked scratch copy of
  the test beside it, adding one `vi.mock("node:os")` that rewrites every `os.cpus()` model to MODEL.
  It runs the copy once through `ctl.sh` and deletes it. The probe file's sha256 is
  `9c739533b49b0485…` at all three refs. No tracked file changed: `git status --porcelain` was
  empty on every control worktree after every run.
- **`tools/sync-evidence.sh`** copies the logs here and writes `ci/receipts.tsv`.

**Dependencies.** No pnpm ran. Each control worktree hard-links `node_modules` from a same-host
donor at the same commit and lock (`oc-focused --link-deps-from` checks the lock sha256 itself).
These are the same donors as the stage4-new-reds-reruns lane:

| control | donor (HEAD) | `pnpm-lock.yaml` sha256 |
| --- | --- | --- |
| `cand-a329243b` | `WORKTREES/openclaw-129388-stage4-pins-deletion-fix` (a329243b) | `8fb9f6aa1ebf045a…` |
| `prior-16541aa5` | `WORKTREES/openclaw-129388-final-fix` (16541aa5) | `2873a286fde987bf…` |
| `up-5a3e6b1c` | `WORKTREES/openclaw-129388-stage4-config-readiness-up` (5a3e6b1c) | `8fb9f6aa1ebf045a…` |

## Exact commands

```bash
L=lane-evidence/129388-browser-headless-cleanup-rerun
F=extensions/browser/src/browser/chrome.headless-cleanup.test.ts
# control worktrees (umask 022, detached)
git worktree add --detach /home/figs/classify-129388-bhc/cand-a329243b a329243bd1aa4e8677517a5eaf4a67aa30ca8647
git worktree add --detach /home/figs/classify-129388-bhc/prior-16541aa5 16541aa5a8ee81f1e505a414e2d21a758c43cbc2
git worktree add --detach /home/figs/classify-129388-bhc/up-5a3e6b1c 5a3e6b1cb09bb886c4f9760d5d155353131e823a
# interleaved x10
$L/tools/ctl.sh cand $F 1; $L/tools/ctl.sh prior $F 1; $L/tools/ctl.sh up $F 1
$L/tools/rounds.sh $F 2 4; $L/tools/rounds.sh $F 5 10
# mechanism counterfactual
for r in cand prior up; do $L/tools/cpu-probe.sh $r 1 "Apple M2"; done
for r in up cand prior; do $L/tools/cpu-probe.sh $r 1 "unknown"; done
for r in prior up cand; do $L/tools/cpu-probe.sh $r 2 "Apple M2"; done
# host facts
node -e 'const os=require("os");console.log(process.arch,[...new Set(os.cpus().map(c=>c.model))])'  # arm64 [ 'unknown' ]
# history (context)
git log -S'cpu.model.includes("Apple")' 5a3e6b1c -- extensions/browser/src/browser/chrome.playwright-cache.ts
git log -S'`mac-${arch}`' 5a3e6b1c -- extensions/browser/src/browser/chrome.headless-cleanup.test.ts
$L/tools/sync-evidence.sh
```

## Gaps and uncertainties

- **No local x86_64 control.** ronan is aarch64, and this lane is local-only on this seat. The X64
  green comes from Mode-B 44990430565: same workflow SHA, same scale set, identical test and
  product blobs. The `"Apple M2"` probe stands in on this host.
- **No macOS control.** The claim that a real Mac agrees (point 3) is reasoned from the code: Apple
  silicon gives arm64 + Apple, Intel gives x64. A Mac under Rosetta (x64 Node on Apple silicon) would
  split the other way: the test builds `chrome-mac-x64` but the resolver wants arm64. That is not
  observed here.
- **The probe mocks `node:os` for the whole test module graph.** It overrides only `cpus`, and the
  `"unknown"` arm shows the mock alone changes nothing.
- **GitNexus:** not used. Every cross-module claim was read from source at the named SHAs. The
  `os.cpus()` caller scan is a plain search of `extensions/browser/src`.
- **The first evidence commit (`0b0d2f4073`) skipped the pre-commit hook** (`core.hooksPath=/dev/null`).
  I then ran the hook's guard (`scripts/pre-commit/guard-staged-content.mjs`) on exactly that
  commit's 48 files, staged on the `cand-a329243b` control worktree: rc=0. This seat sets no
  `hooks.blockedLiteralsFile`, so the guard's literal scan had no rules. A separate scan for
  token, webhook and private-key patterns found 0 matches. Later commits ran with the hook on.
