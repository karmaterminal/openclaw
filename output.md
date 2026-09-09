# Independent Review: openclaw/openclaw#143479

## Named-ref contract

| Category | Named ref | Full SHA | Local | Tracking | Server |
|---|---|---|---|---|---|
| Product/base ref | rejected `333809fb26eeb665f7ab868dfe13b14627d1af90`, candidate `c872c6979f0e08cedaea1823e505aa71e9a4c01e` | as named | resolved | N/A (immutable commits) | resolved from repository history |
| Safe lane branch ref | `codeagent/review-143479-race-marker` | `c872c6979f0e08cedaea1823e505aa71e9a4c01e` | equal | equal | equal |
| CI/workflow ref | N/A | N/A | N/A | N/A | N/A |
| Presentation ref | N/A | N/A | N/A | N/A | N/A |
| Docs/proof ref | `codeagent/review-143479-race-marker` (`output.md`) | `c872c6979f0e08cedaea1823e505aa71e9a4c01e` before review receipt commit | equal | equal | equal |

No Actions, PR, integration, presentation, or deployment evidence is in scope.

## Terminal verdict

**PASS**

Candidate `c872c6979f0e08cedaea1823e505aa71e9a4c01e` is the correct test-owner repair for
openclaw/openclaw#143479. It makes the release-admission fixture own its host input, preserves the
Tauri cache-race marker through the intended rejected publication path, improves failure attribution
before the marker read, and does not change production behavior or weaken the existing Git contract
assertions.

By: frond scribe 🌿 (@scribe-dandelion-cult, account 2026-05-06) | OpenClaw: 3 PRs, 6 issues,
1 default-branch commit/12mo | GitHub contribution graph: 2466 commits, 1802 PRs, 399 issues,
41 reviews/12mo

## Review evidence

- **Invariant and owner:** the synthetic release-admission composition in
  `test/scripts/ci-workflow-guards.test.ts` owns every external host input used by
  `apps/linux/scripts/tauri-appimage-tools.sh`. The production helper validates `uname -s` and
  `uname -m` before creating the cache root, so an inherited AArch64 host prevented the fixture's
  fake downloader from creating `tauri/race-marker`.
- **Rejected negative control:** the exact focused command on
  `333809fb26eeb665f7ab868dfe13b14627d1af90` failed with one test failure:
  `ENOENT: no such file or directory, open '<tmp>/.cache/tauri/race-marker'`. The failure occurs
  because production rejects the inherited Linux/AArch64 host before the fake `curl` race hook runs.
- **Successor proof:** the identical focused command on
  `c872c6979f0e08cedaea1823e505aa71e9a4c01e` passed: 1 test passed, 432 skipped.
- **Race ownership:** the candidate adds a fixture-local `uname` executable whose default is
  Linux/x86_64, then separately proves Linux/AArch64 is rejected before cache creation. The intended
  raced prepare reaches fake `curl`, creates `tauri/race-marker`, fails non-clobbering publication
  because `tauri` now exists, preserves the marker, removes only `.tauri-tools.*` staging, and
  exposes child stdout/stderr on both the status and existence assertions before reading marker
  contents.
- **Git contract preserved:** the candidate patch is additive. Existing release-admission Git owner,
  timeout, fetch, merge-base, selected-checkout, and publication assertions are byte-unchanged.
- **Partial-failure and alternate paths:** the containing owner-boundary test still covers unsupported
  host rejection, digest rejection, race rejection and staging cleanup, successful prepare/verify,
  stale-cache rejection, tool/runtime tampering, finalization, signing, and release workflow Git
  contracts. Persistence, rollback, and restart are not applicable: all state is fixture-local and
  removed by the test temp-directory owner.
- **Nearest workflow guard siblings:** 3 adjacent release/workflow ownership cases passed:
  generated-publisher/maturity owner ordering, stale Linux release-request admission, and Performance
  Git-owner deadlines.
- **Production behavior:** no non-test path differs between rejected and successor SHAs.
- **LOC:** Production `+0/-0` (net 0) | Tests `+35/-0` (net +35).

## Test value and solution quality

The changed coverage protects an independently meaningful release-workflow contract: a rejected
cache publication must not erase state created by the competing publisher. The credible regression
is inherited host architecture preventing the test from reaching that boundary, which existing
coverage did not distinguish from the intended race rejection. The change extends the existing
owner-boundary fixture and adds no production seam.

**Best-fix verdict:** best. Making the fixture own `uname` is narrower and more deterministic than
changing the production helper's supported-host contract. Removing the marker assertion or accepting
`ENOENT` would weaken the race contract. A consumer-side fallback would conceal the fixture setup
failure instead of repairing its composition boundary.

**Independent review:** autoreview commit mode, P0-P2, `scoped-clean`; patch correctness 0.97, no
accepted/actionable findings.

**Remaining uncertainty:** none within the requested deterministic fixture scope. Per workorder,
no Actions or broad acceptance run was dispatched; acceptance mode is `focused-only`.

## Exact validation

```text
# Rejected SHA (isolated worktree; exit 1 with ENOENT)
node scripts/run-vitest.mjs run --config test/vitest/vitest.tooling.config.ts --maxWorkers=1 test/scripts/ci-workflow-guards.test.ts -t 'pins simple release admission owners before selected checkout and preserves Git contracts'

# Successor SHA (same selector; pass)
node scripts/run-vitest.mjs run --config test/vitest/vitest.tooling.config.ts --maxWorkers=1 test/scripts/ci-workflow-guards.test.ts -t 'pins simple release admission owners before selected checkout and preserves Git contracts'

# Successor sibling guard proof (3 pass)
node scripts/run-vitest.mjs run --config test/vitest/vitest.tooling.config.ts --maxWorkers=1 test/scripts/ci-workflow-guards.test.ts -t 'pins generated publisher and maturity owners before credentials and selected checkout|reports stale Linux release requests before selected code runs|pins every Performance Git owner before checkout and preserves Git deadlines'

git diff --exit-code 333809fb26eeb665f7ab868dfe13b14627d1af90 c872c6979f0e08cedaea1823e505aa71e9a4c01e -- ':!test/**'
git diff --check
.agents/skills/autoreview/scripts/autoreview --mode commit --commit c872c6979f0e08cedaea1823e505aa71e9a4c01e --max-priority P2 ...
```
