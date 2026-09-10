# Final pair review: 8a4f89c1 x ad2f8d2f

**Verdict: PASS**

The exact product pair is represented once and remains semantic-no-op/test-fixture scoped. The exact workflow patch integrates receipt terminalization once at the batch composition boundary and preserves the five routed jobs, pinned Go capability, pretest/private-QA behavior, hosted Fastlane routing, static-gate topology, 75/75 accounting, and dist handoff contracts.

## Named refs

| Category | Named ref | Full SHA | Identity receipt |
|---|---|---|---|
| Product/base | `karmaterminal/openclaw:codeagent/final-product-8a4f89c1` / `karmaterminal/openclaw:codeagent/product-1318-final-composite` | `8a4f89c11d3a90768ff6b641a84b77aa7e308820` / `333809fb26eeb665f7ab868dfe13b14627d1af90` | Product and base each matched local object, local tracking ref, and server ref. |
| Safe lane | `karmaterminal/openclaw:codeagent/review-final-pair-8a4f89-ad2f8d` | `8a4f89c11d3a90768ff6b641a84b77aa7e308820` before this report commit | Unchanged lane was published before evidence; local, tracking, and server refs matched. |
| CI/workflow | `karmaterminal/openclaw-bootstrap:codeagent/final-workflow-ad2f8d2f` | `ad2f8d2fd5cb6be6775ac8fbd9ffc4e20e3fb816` | Exact local detached checkout and server branch head matched. Raw parent: `3ecbff1a2e45b84de09753bbc747d4df8f65d791`. |
| Presentation | N/A | N/A | Workorder forbids presentation mutation. |
| Docs/proof | N/A | N/A | This report is the requested lane artifact; no external proof ref applies. |

## Review result

- Product commit `9995bf5e79107d6332a52f308c5a9ca245f2bfeb` changes only import ordering in `src/gateway/session-utils-store-lookup.ts`: production `+4/-4`, net zero, with no runtime token or control-flow change.
- Product commit `8a4f89c11d3a90768ff6b641a84b77aa7e308820` changes only `test/scripts/ci-workflow-guards.test.ts`: tests `+35/-0`. It adds one fake `uname`, one unsupported `Linux/aarch64` negative control, and diagnostics on the existing race-marker assertion. The pair contains one commit touching each surface.
- Workflow commit `ad2f8d2fd5cb6be6775ac8fbd9ffc4e20e3fb816` changes the shared batch action and batch runner (`+85/-22`) plus focused tests (`+173/-11`). There is one `Emit routing receipt` step, one terminal `Fail routed shard batch` step, and one workflow commit in the reviewed parent range.
- The action records the child process-group terminal result, emits and uploads its receipt, cleans temporary roots, then re-emits the original batch status. The runner retains its parent-owned delete helper until worker cleanup finishes.
- All five routed jobs still use the one shared action and pass one exact check-name binding each. The executable contract preserves five canonical pretest builds, pinned Go behavior, hosted Fastlane Ruby setup, private-QA build flags, static gating, 75 routed batches/receipts, and two distinct dist variants.

**Best-fix verdict:** Best. Terminalization belongs in the shared action/runner composition boundary. Failing directly in the run step would again prevent terminal receipt upload; synthesizing only at aggregate time would lose worker-terminal evidence.

**Remaining uncertainty:** Per workorder, no GitHub Actions run was dispatched. Cancellation proof is the focused local Actions-like signal test rather than a hosted runner cancellation.

## Focused validation

- `node scripts/run-vitest.mjs run --config test/vitest/vitest.tooling.config.ts --maxWorkers=1 test/scripts/ci-workflow-guards.test.ts -t "pins simple release admission owners before selected checkout and preserves Git contracts"`: **1 passed, 432 skipped**.
- In the exact workflow checkout: `node --test test/scripts/shard-routing-receipts.test.mjs test/scripts/shard-routing-workflow.test.mjs`: **136 passed, 0 failed**.
- In the exact workflow checkout: `bash tests/test-openclaw-local-ci-mode-b-routing.sh`: **PASS**, including all named routing, build, receipt, static, 75/75, and dist contracts.
- `git diff --check 333809fb26..8a4f89c11d` and workflow `git diff --check 3ecbff1a..ad2f8d2f`: **passed**.

An initial whole-file product run produced **432 passed and 1 unrelated failure** in the pnpm hard-link fixture because a generated temporary pnpm launcher had invalid shell syntax. The failing source region is byte-identical between base `333809fb26eeb665f7ab868dfe13b14627d1af90` and product `8a4f89c11d3a90768ff6b641a84b77aa7e308820` (matching SHA-256 `2fcd0dc2ebd5243bd560fc02038a411789bd717802ed1a6c575fe4e96f73f233`), and neither reviewed product patch touches that harness.

**CI path:** focused-only. No Actions, Mode-B, Gate 3g, deployment, presentation, or PR mutation was performed.

Bound work item: openclaw/openclaw#129388.
