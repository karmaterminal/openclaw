# #1320 mac corepack fixture isolation

## Named refs

Evidence was frozen at the repair checkpoint before this report-only successor commit.

| Ref category | Named ref | Full SHA | Identity receipt |
|---|---|---|---|
| Product/base ref | rejected product | `c27e802bf5a314c51eb661059922c95a92bd65b3` | local repair parent matches the workorder SHA |
| Safe lane branch ref | `codeagent/fix-1320-mac-corepack-fixture` | `4108fe73f6f5050c6bb87678e8f8f1ad3c94e935` | local = tracking = server at evidence freeze |
| CI/workflow ref | N/A | N/A | focused-only acceptance; no Mode-B workflow dispatched |
| Presentation ref | N/A | N/A | no PR, presentation, or deployment requested |
| Docs/proof ref | repair checkpoint commit | `4108fe73f6f5050c6bb87678e8f8f1ad3c94e935` | local = tracking = server at evidence freeze |

## Change

- Invariant: each package-manager row in the copied mac build-wrapper fixture must expose only the selected fake package manager. Host package-manager installations must not participate.
- Owner boundary: `test/scripts/build-and-run-mac.test.ts`, where the fixture composes the child `PATH`.
- Repair: invoke the macOS shell at its platform path, provide the one required external `dirname` fixture, and restrict child `PATH` to the fixture bin directory.
- Production behavior: unchanged. `scripts/pnpm-runner.mts` still prefers a directly available pnpm over Corepack.
- Files: one test file, +3/-2. Production LOC: +0/-0.

Persistence, rollback, restart/recovery, and partial-failure state are N/A: this is an ephemeral copied-script fixture with no persistent state. The existing fake Swift status 23 remains the partial-failure boundary proving assets were prepared before SwiftPM.

## Regression proof

Rejected-SHA negative control: on `c27e802bf5a314c51eb661059922c95a92bd65b3`, a harness-only injected ambient pnpm after fake Corepack reproduced the Mode-B failure:

```text
expected 1 to be 23
Test Files 1 failed (1)
Tests 1 failed | 6 skipped (7)
```

Command:

```sh
node scripts/run-vitest.mjs run --config test/vitest/vitest.tooling.config.ts --maxWorkers=1 test/scripts/build-and-run-mac.test.ts -t 'prepares the Apple resource bundle before SwiftPM with corepack'
```

The same command on repair SHA `4108fe73f6f5050c6bb87678e8f8f1ad3c94e935` passed: 1 passed, 6 skipped. The complete owner file and nearest package-manager/mac build-wrapper siblings passed:

```sh
node scripts/run-vitest.mjs run --config test/vitest/vitest.tooling.config.ts --maxWorkers=1 test/scripts/build-and-run-mac.test.ts test/scripts/pnpm-runner.test.ts test/scripts/package-mac-app.test.ts test/scripts/package-mac-dist.test.ts
```

Receipt: 4 files passed; 125 tests passed, 8 skipped.

## Checks and review

Passed:

```sh
node_modules/.bin/oxfmt --check test/scripts/build-and-run-mac.test.ts
pnpm tsgo:test:root
node scripts/run-oxlint.mjs --tsconfig test/tsconfig/tsconfig.test.root.json test/scripts/build-and-run-mac.test.ts
pnpm lint:scripts
git diff --check
```

Internal P1 autoreview was `scoped-clean` with no P0/P1 findings.

`node scripts/check-changed.mjs -- test/scripts/build-and-run-mac.test.ts` stopped at the unrelated core test graph ownership gate: `agents-root` has 776 roots over the 720 cap and command tests are assigned to both `agents-root` and `commands`. Running `scripts/check-tsgo-core-boundary.mts` from a detached worktree at the exact rejected product SHA produced the same failure. No baseline files were changed.

Acceptance path: **focused-only**. No Mode-B, Gate 3g, Actions, PR, presentation, or deployment was run.
