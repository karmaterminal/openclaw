# Drift audit output

## What changed

- No OpenClaw product source was changed.
- Wrote the independent audit to
  `frond-scribe/workorders/AUDIT-gpt-5.6-sol-2026-08-10.md`.
- Audited assembly `ee864e73d220`, merge `056bdf882952`, repaired descendant
  `d46885d6422`, and proof composite `b1f800b93e3`.

## Main findings

- `callbackPort: 0` is invalid and falls into manual mode instead of timeout.
- `callbackPort` is a test-only fork seam, not a production caller-visible
  feature. The later `6e5601deeab` repair is still half-wired because only the
  listener URI follows the test port; the issued Google auth URL and token
  exchange remain on 8085.
- The npm install security-scan failure is unrelated to `callbackPort`; the
  controlled scan fails identically with and without that test line.
- First back-merge `90b055341a1` preserves both sides after its recorded
  follow-up repairs.
- Second back-merge `056bdf882952` is wrong: 76 newly introduced unresolved
  relative mocks, copied stale config/SDK/prompt baselines, and duplicate/dead
  imports.
- Repair descendant `d46885d6422` remains wrong: 23 merge-introduced unresolved
  mock strings remain, config baseline still drifts, and the Google OAuth flow
  is still inconsistent.
- Gate 2.7 passes exact-parent comparisons for `90b055341a1` (731/0/0),
  `056bdf882952` (741/0/0), and `d46885d6422` (747/0/0), demonstrating that the
  gate does not cover mock-string routing, generated contracts, or end-to-end
  OAuth URI consistency.

## Validation

- Tracked e2e inventory: 325 files, all excluded from standard/root projects.
- Generic e2e: 163 files; 154 pass, 8 fail, 1 timeout; 17 failed tests.
- UI e2e: 160 files; 158 pass, 2 fail; 566 passed tests, 2 failed tests.
- TUI PTY: 3 files pass; 84 tests pass, 2 skip.
- Unique e2e result: 314 pass files, 10 fail files, 1 timeout file, 0 unrun.
- Mandated `node scripts/test-projects.mjs`: exit 1, file removed upstream.
- Current full runner `node --import tsx scripts/test-projects.mts`:
  320 shards, 300 green, 20 red, exit 1, 1573.32 seconds.

## Uncertainties

- Several e2e failures are host prerequisites or current-main failures:
  missing sandbox image, `safe.bareRepository=explicit`, and byte-identical
  upstream tests. They are counted as broken on assembly but not attributed to
  the audited drift commits.
- The live back-merge branch moved repeatedly during the audit. Findings are
  frozen to the exact SHAs listed above.
- Local reflogs can confirm merge ancestry and show no local force operation;
  they cannot prove that no remote force-push ever occurred.

## Exact commands

```text
node scripts/run-vitest.mjs extensions/google-meet/src/oauth.test.ts
node scripts/run-vitest.mjs src/plugins/npm-install-security-scan.release.test.ts
node scripts/run-vitest.mjs run --config test/vitest/vitest.e2e.config.ts --maxWorkers=1
node --import tsx scripts/ensure-playwright-chromium.mts
node scripts/run-vitest.mjs run --config test/vitest/vitest.ui-e2e.config.ts --configLoader runner
OPENCLAW_TUI_PTY_INCLUDE_LOCAL=1 node scripts/run-vitest.mjs run --config test/vitest/vitest.tui-pty.config.ts --maxWorkers=1
node scripts/test-projects.mjs
node --import tsx scripts/test-projects.mts
node --import tsx scripts/generate-config-doc-baseline.ts --check
node --max-old-space-size=8192 --import tsx scripts/generate-plugin-sdk-api-baseline.ts --check
node --import tsx scripts/generate-prompt-snapshots.ts --check
/home/figs/flesh_beast_best_beast/source/openclaw-bootstrap/tools/drift-cure-gate.sh <upstream-sha> <head-sha> '' <outdir>
```
