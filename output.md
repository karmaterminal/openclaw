# #1319 / #1320 final product test composition

Evidence was frozen at the implementation checkpoint before this report-only
successor commit.

## Named refs

| Ref category | Named ref | Full SHA | Identity receipt |
| --- | --- | --- | --- |
| Product/base ref | requested product | `c27e802bf5a314c51eb661059922c95a92bd65b3` | local repair parent equals the requested product SHA |
| Safe lane branch ref | `origin/codeagent/compose-product-1319v3-1320` | `0b85aeb4685df7da33259fe3c6a0153dedd85cb8` | local = tracking = server at evidence freeze |
| CI/workflow ref | N/A | N/A | workorder forbids Actions; focused-only acceptance |
| Presentation ref | N/A | N/A | no PR, presentation, or deployment requested |
| Docs/proof ref | implementation evidence checkpoint | `0b85aeb4685df7da33259fe3c6a0153dedd85cb8` | local = tracking = server at evidence freeze; this report is the only successor change |

## Composition

- Integrated the accepted #1319 test patch from
  `eb273555c7acdaaea582158bea05ccc97f1d0ce6` without its evidence-only
  `output.md`.
- Integrated the accepted #1320 test patch from
  `4108fe73f6f5050c6bb87678e8f8f1ad3c94e935`.
- Stable patch identities matched exactly once:
  - #1319 source/candidate:
    `c40ed02c29c255e0fb30860eadc866d17ae36b38`
  - #1320 source/candidate:
    `1be69040d574b616332961a4b8913ddabebbcfa6`
- Product delta: only
  `extensions/telegram/src/telegram-ingress-drain-factory.test.ts` and
  `test/scripts/build-and-run-mac.test.ts`, +9/-4 test lines. Production LOC:
  +0/-0. No product byte outside the two accepted test files changed.

## Regression ownership

### #1319

- Invariant: a fulfilled Bot API callback answer retained by a new durable row
  remains available for one middleware consumption; rejected answers are
  removed.
- Owner boundary:
  `extensions/telegram/src/telegram-ingress-drain-factory.test.ts` composes the
  loopback Bot API response consumed by grammY/node-fetch.
- Rejected product, Node 24.17.0: the owner file failed exactly the two retained
  rows with `expected undefined to be defined` (2 failed, 9 passed).
- Successor, Node 24.17.0: the same owner file passed 11/11 after the success
  response gained an exact `Content-Length`.
- Nearest alternatives remain covered: rejected and transient answers,
  transient-to-retained upgrades, consumed answers, duplicate coalescing,
  tombstones, module replacement, and restart fallback. State remains bot-owned;
  no persistence or rollback contract changed.

### #1320

- Invariant: each copied mac build-wrapper package-manager fixture exposes only
  its selected fake runner; ambient host pnpm installations cannot override the
  fake Corepack row.
- Owner boundary: `test/scripts/build-and-run-mac.test.ts` owns the copied
  wrapper's child `PATH`.
- Rejected product negative control: a harness-only ambient pnpm injected after
  fake Corepack made the Corepack row fail deterministically with
  `expected 1 to be 23` (1 failed, 6 skipped).
- Successor: the owner file passed both fake pnpm and fake Corepack rows by
  invoking `/bin/bash`, supplying fixture-owned `dirname`, and restricting
  `PATH` to the fixture bin directory.
- Persistence, rollback, restart/recovery: N/A for the ephemeral copied-script
  fixture. The fake Swift exit 23 remains the partial-failure boundary proving
  Mermaid assets were prepared before SwiftPM.

## Validation

Passed:

```sh
env PATH="<node-24.17.0>/bin:$PATH" node scripts/run-vitest.mjs run \
  --config test/vitest/vitest.extension-telegram.config.ts --maxWorkers=1 \
  extensions/telegram/src/telegram-ingress-drain-factory.test.ts

env PATH="<node-24.17.0>/bin:$PATH" node scripts/run-vitest.mjs run \
  --config test/vitest/vitest.extension-telegram.config.ts --maxWorkers=1
# 218 files passed; 3,960 tests passed

node scripts/run-vitest.mjs run \
  --config test/vitest/vitest.tooling.config.ts --maxWorkers=1 \
  test/scripts/build-and-run-mac.test.ts \
  test/scripts/pnpm-runner.test.ts \
  test/scripts/npm-runner.test.ts \
  test/scripts/package-mac-app.test.ts \
  test/scripts/package-mac-dist.test.ts
# Tooling ownership selected 4 files; 125 passed, 8 skipped.
# npm-runner is outside this config's selected ownership; the requested mac
# wrapper, pnpm runner, and nearest mac package siblings all ran.

node_modules/.bin/oxfmt --check \
  extensions/telegram/src/telegram-ingress-drain-factory.test.ts \
  test/scripts/build-and-run-mac.test.ts
node scripts/run-tsgo.mjs -p test/tsconfig/tsconfig.extensions.test.json \
  --incremental --tsBuildInfoFile .artifacts/tsgo-cache/extensions-test.tsbuildinfo
node scripts/run-tsgo.mjs -p test/tsconfig/tsconfig.test.root.json \
  --incremental --tsBuildInfoFile .artifacts/tsgo-cache/test-root.tsbuildinfo
node scripts/run-oxlint.mjs --tsconfig extensions/tsconfig.json \
  extensions/telegram/src/telegram-ingress-drain-factory.test.ts
node scripts/run-oxlint.mjs --tsconfig test/tsconfig/tsconfig.test.root.json \
  test/scripts/build-and-run-mac.test.ts
git diff --check c27e802bf5a314c51eb661059922c95a92bd65b3..HEAD
```

Internal autoreview at P1 was `scoped-clean` with no accepted/actionable
findings.

The exact-manifest/lock dependency install was completed in a task-owned
ordinary clone at the product SHA, then the worktree used that clone's
`node_modules`. An initial command-directory mistake invoked pnpm from the
worktree and touched only its pre-existing ignored shared dependency target;
`git status` remained clean. The mistake was reported immediately, and all
credited evidence used the corrected exact ordinary-clone install.

Acceptance path: **focused-only**. No Actions, Mode-B, Gate 3g, PR,
presentation, deployment, or unrelated repair was run.
