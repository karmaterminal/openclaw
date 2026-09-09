# Final cross-pair affected-subnetwork review

**Verdict: PASS**

Reviewed product `333809fb26eeb665f7ab868dfe13b14627d1af90` against
`32e89116f2177b6cccd80cc427af85e678921176`, and workflow
`76293741f20054b352417507012b58e49ad4022f` against
`b27223f107a7b55dbd5b207ba8d6bd3b426941a1`, for
openclaw/openclaw#129388. No blocking findings.

## Named-ref contract

Identity was frozen before review evidence was credited. The lane branch was
published unchanged before focused validation.

| Category | Named ref | Full commit SHA | Tree SHA | Equality |
|---|---|---|---|---|
| Product/base ref | product target / product parent | `333809fb26eeb665f7ab868dfe13b14627d1af90` / `32e89116f2177b6cccd80cc427af85e678921176` | `e6ae77659ddec6cbf5f820aa310d1163167dadad` / `bee6e3f415969861dcc34b73b95e33f842a56a5a` | local target and parent objects resolved exactly |
| Safe lane ref | `refs/heads/codeagent/review-final-pair-333809-762937` | `333809fb26eeb665f7ab868dfe13b14627d1af90` | `e6ae77659ddec6cbf5f820aa310d1163167dadad` | local HEAD = local tracking = server before evidence |
| CI/workflow ref | `karmaterminal/openclaw-bootstrap@76293741f20054b352417507012b58e49ad4022f` / named base `b27223f107a7b55dbd5b207ba8d6bd3b426941a1` | `76293741f20054b352417507012b58e49ad4022f` / `b27223f107a7b55dbd5b207ba8d6bd3b426941a1` | `6cce081b9cb8b028fad961df0e72a466067ff63b` / `214d3b3a9fc15bfd44e18f5e6c0f4781bc950009` | GitHub commit API = requested archive ref; exact archive SHA-256 `ffb791e1bcf221849737f3cdcedde9b5ddfa04c9b5a5068a00be3fba3359d176` |
| Presentation ref | N/A | N/A | N/A | No PR or presentation branch requested |
| Docs/proof ref | N/A | N/A | N/A | This report is the only proof artifact and follows the frozen identity gate |

The named workflow base is not the raw direct parent of the target. The exact
range contains four commits:
`b27223f107a7b55dbd5b207ba8d6bd3b426941a1..76293741f20054b352417507012b58e49ad4022f`;
the target's raw direct parent is
`a8dd67a396e690a8e4bc1f3ebbca719872ff16a4`.

## Review result

| Contract | Result | Evidence |
|---|---|---|
| Static harness compiles without widening production types | PASS | `createTestCronReconciliation` now uses `satisfies GatewayCronReconciliation & { completeMock: ... }`; the production contract remains `arm()` plus `invalidate()`, while assertions observe the same callback returned by `arm()`. Gateway Vitest and the canonical gateway-root test graph typecheck pass. |
| docs-i18n gets verified Go 1.27 before execution | PASS | The composite action pins `actions/setup-go` by SHA to `1.27.0`, disables setup cache, runs `openclaw-local-ci-go-capability.sh` before the batch, forces `GOTOOLCHAIN=local`, requires exact `go1.27.0`, and records setup/capability failure as a blocked receipt. |
| Runtime/private-QA pretest builds are sufficient-memory singletons | PASS | Canonical pretest rows become `exclusive`, route to the `self-hosted` `>=60GB` seat, and pack into one-shard batches with concurrency 1. The exact 179-row product fixture verifies all seven build-bearing shards. |
| Canonical pretest mode reaches classifier, matrix, receipt, and batch runner | PASS | `pretest_build_mode` is preserved through classification and matrix payloads, validated again before launch, drives runtime/private-QA build environment, persists build status, and is checked against receipts. The post-adapter camel-case alias is rejected at classifier, receipt, and runner boundaries. |
| Hosted Fastlane, static-seat routing, batch rc/cleanup, 75/75 receipts, and both dist variants remain intact | PASS | Focused tests retain hosted-only Fastlane routing and pinned Ruby setup, distinct eligible static-seat routing, nonzero batch rc propagation through receipt/upload, cleanup for success/failure/setup failure/cancellation, exact 75-batch closure, and two represented `self-hosted-dist` variants. |
| No accepted product repair was silently reverted | PASS | The product delta is limited to the gateway test harness and three assertions: production code is untouched, the fake production-only `complete` property is removed, and the arm-returned completion spy remains observable. The workflow final tree retains the Go capability, heavy-pretest isolation, canonical mode rejection, route/matrix fields, receipt fields, and runner behavior from all four commits. |

**Best-fix verdict:** Best. The product repair keeps the spy on a test-owned
intersection instead of widening the production interface. The workflow repair
normalizes the planner's camel-case field once at the adapter, then fails closed
on alias drift at downstream ownership boundaries; silently accepting both
spellings would permit contradictory routing evidence.

**Alternatives considered:** Returning the test helper as only
`GatewayCronReconciliation` would hide the spy needed by assertions; adding
`complete` to the production contract would preserve the original type leak.
Keeping a downstream camel-case fallback would create two canonical workflow
shapes. These alternatives were rejected.

**Code read:** `src/gateway/server-cron-reconciled.ts`,
`src/gateway/server-runtime-services.ts`,
`src/gateway/server-runtime-services.test-harness.ts`,
`src/gateway/server-runtime-services.test.ts`,
`.github/actions/openclaw-ci-shard-batch/action.yml`,
`.github/workflows/openclaw-local-ci.yml`,
`scripts/lib/shard-execution/classify-shard-execution.mjs`,
`scripts/emit-shard-batch-receipt.mjs`,
`tools/openclaw-local-ci-go-capability.sh`,
`tools/openclaw-local-ci-run-batch.sh`, and adjacent routing, workflow, receipt,
and exact-product fixture tests.

**Remaining uncertainty:** No Actions run was dispatched by design. The
concurrent exact-head Mode-B run is outside this read-only lane.

## Size

Product production LOC: `+0/-0` (net `0`) | Product tests/test support:
`+6/-8` (net `-2`) | Workflow CI/tooling: `+191/-51` (net `+140`) | Workflow
tests: `+329/-37` (net `+292`).

Workflow tooling growth implements the pinned Go capability boundary, canonical
pretest ownership across routing and receipts, and sufficient-memory singleton
routing; it is not product-runtime growth.

## Focused validation

- `node scripts/run-vitest.mjs run --config test/vitest/vitest.gateway-server.config.ts --maxWorkers=1 src/gateway/server-runtime-services.test.ts`
  - PASS: 1 file, 42 tests.
- `node scripts/run-tsgo.mjs -b test/tsconfig/tsconfig.core.test.gateway-root.json --builders 1`
  - PASS.
- From the exact workflow archive:
  `node --test test/scripts/shard-execution-routing.test.mjs test/scripts/shard-routing-receipts.test.mjs test/scripts/shard-routing-workflow.test.mjs`
  - PASS: 178 tests.
- From the exact workflow archive:
  `bash -n tools/openclaw-local-ci-go-capability.sh tools/openclaw-local-ci-run-batch.sh`
  plus `node --check` for the classifier and receipt emitter.
  - PASS.
- Independent autoreview of product commit
  `333809fb26eeb665f7ab868dfe13b14627d1af90`, through P1.
  - `scoped-clean`; patch correctness confidence `0.99`.

The changed-path typecheck router was also attempted, but failed before
compilation on pre-existing core test graph ownership violations
(`agents-root` has 776 roots over the 720 limit and `src/agents/command` roots
are assigned twice). The candidate does not change the graph owner,
configuration, or boundary checker. This failure is not counted as passing;
the canonical gateway-root graph was run directly and passed.

**Acceptance path:** `focused-only`.
