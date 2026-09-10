# Mode-B 34463428087 terminal classification

**Terminal verdict: FAIL.** Exact run
[`34463428087`](https://github.com/karmaterminal/openclaw-bootstrap/actions/runs/34463428087)
tested product `c27e802bf5a314c51eb661059922c95a92bd65b3` with workflow
`f34107bc12314e5a5a2e98cc8c0331819a5f236c`. Accounting is closed:
`0` unclassified receipts, shards, tests, jobs, or archive states.

Machine receipts:

- `modeb-34463428087-classification.json`
- `modeb-34463428087-classification.tsv`

## Named-ref contract

The unchanged lane branch was published before evidence acquisition. The
classifier machine receipt was then pushed before this report was written.

| Category | Named ref | Full SHA | Local | Tracking | Server | Equality |
|---|---|---|---|---|---|---|
| Product/base | `karmaterminal/openclaw:codeagent/compose-final-product-1292-1319-v2` | `c27e802bf5a314c51eb661059922c95a92bd65b3` | same | same | same | yes |
| Safe lane at evidence acquisition | `karmaterminal/openclaw:codeagent/classify-modeb-34463428087` | `c27e802bf5a314c51eb661059922c95a92bd65b3` | same | same | same | yes |
| CI/workflow | `karmaterminal/openclaw-bootstrap:codeagent/fix-1478-declaration-entry` | `f34107bc12314e5a5a2e98cc8c0331819a5f236c` | N/A | N/A | same | yes |
| Presentation | N/A | N/A | N/A | N/A | N/A | N/A |
| Docs/proof checkpoint | `karmaterminal/openclaw:codeagent/classify-modeb-34463428087` | `80b6478e1c5c884a67070b1211e40685fabb942a` | same | same | same | yes |

The aggregate target/ref/SHA, every raw receipt target, and the routing plan
agree on the product SHA. The run `headSha` and routing plan agree on the
workflow SHA. Routing digests also match end to end:

- ruleset:
  `sha256:ecf33213b90b95f4fe8ea0ca6a18b958c5cb686068565c6f75ce9449c7d10384`
- planner:
  `sha256:957eea6354cfbd37ec65e09806021d52b716294519e81da13ce87c26f2d36c62`

## Artifact integrity

All requested failure-shaped batches were downloaded independently, not only
read from the aggregate. Their downloaded ZIP SHA-256 values match the Actions
artifact metadata.

| Artifact ID | Artifact | Bytes | SHA-256 |
|---:|---|---:|---|
| 10149452625 | `openclaw-local-ci-aggregate-c27e802bf5a3` | 12,061,756 | `7f490b1ce8533e9475651f15ba61aad8b0f0a10b3daaa5e3091acf5531cd3509` |
| 10146506478 | `openclaw-local-ci-routing-plan-c27e802bf5a3` | 135,948 | `8fb62a06c4e9d4126cf98ed4cf7f9fc5263ce1673e715a64446492135b5eb177` |
| 10146890017 | `openclaw-local-ci-static-c27e802bf5a3` | 12,912 | `7489e1be1bccf7c76ac60d4d43826f3fadec246b397d000ba4e064e91997ff84` |
| 10147162527 | `openclaw-local-ci-batch-hosted-batch-008-c27e802bf5a3` | 440,077 | `aa6d13afff6c6b1fd2f9ca90e6b95cb82babbc8720ec8e979b8e4703a1cf3385` |
| 10147123092 | `openclaw-local-ci-batch-hosted-batch-022-c27e802bf5a3` | 328,735 | `f8d42529f1604f12bbf3fecaade1afb6e34c56209f4ffdab66ca5fe7dccf17bf` |
| 10147155842 | `openclaw-local-ci-batch-hosted-batch-033-c27e802bf5a3` | 153,746 | `5a79642fcc8e4461adfbadbbab5abf4d6d15e776b75a67b8f0fe5d90c1725637` |
| 10146993890 | `openclaw-local-ci-batch-hosted-batch-045-c27e802bf5a3` | 172,036 | `0c14ac84fd2183883fd63de7be529f64d0a469b87f523bae8538696fc1030e76` |
| 10147863877 | `openclaw-local-ci-batch-local-batch-055-c27e802bf5a3` | 83,062 | `0247735f4f9c810ad586d3e905454ddcd6f52578adcda357443f3670605582f1` |
| 10148522030 | `openclaw-local-ci-batch-local-batch-071-c27e802bf5a3` | 536,807 | `136e2eda6ca066e1d877055e8b3b127e40b9f84b3d0cca6286279ca17871cb7e` |

The run exposed `74` artifacts: `71` batch artifacts, one routing-plan
artifact, one static artifact, and one aggregate artifact. There was no dist
runtime artifact.

## Routing and summary accounting

The plan emitted `178` uniquely named shards in `75` jobs:

| Lane | Jobs | Shards |
|---|---:|---:|
| hosted | 48 | 144 |
| self-hosted | 25 | 32 |
| self-hosted-dist | 2 | 2 |
| **Total** | **75** | **178** |

Receipt accounting is complete. `71` batches uploaded raw receipts. The
aggregate synthesized four terminal receipts, yielding exactly `75/75`.
There are no missing batch IDs after synthesis, duplicates, validation errors,
unknown SHAs, or invalid rows. Every synthesis is failure-shaped:

| Batch | Lane | Terminal synthesis | RC | Missing shard rows |
|---|---|---|---:|---:|
| `hosted-batch-011` | hosted | blocked/failure | 125 | 3 |
| `hosted-batch-039` | hosted | cancelled/failure | 125 | 3 |
| `dist-batch-074` | self-hosted-dist | blocked/failure | 125 | 1 |
| `dist-batch-075` | self-hosted-dist | blocked/failure | 125 | 1 |

The aggregate's `summaries_found: 171` is not `171` routed shard summaries.
The array contains `170` routed shard summaries plus the static-gates summary,
whose shard is null. Against `178` planned routed shards, exactly **eight**
summaries are missing:

| Batch | Missing summaries | Classification |
|---|---|---|
| `hosted-batch-011` | `extensions`, `checks-fast-contracts-plugins-b`, `extension-provider-openai` | hosted infrastructure failure |
| `hosted-batch-039` | `agentic-plugins`, `extension-discord`, `core-runtime-infra-channel-plugin` | hosted infrastructure cancellation |
| `dist-batch-074` | `core-runtime-tui-pty` | workflow-blocked |
| `dist-batch-075` | `core-support-boundary` | workflow-blocked |

Thus `178 planned = 170 present routed + 8 classified missing`. There are no
duplicate routed summaries. Counting the static summary as a shard summary is a
workflow aggregate defect; it does not turn any missing result green.

## Dist variants

Both distinct dist variants were planned but never executed:

| Batch | Shard/config | Executed | Matrix state | Receipt | Uploaded | Extracted | Reason |
|---|---|---|---|---|---|---|---|
| `dist-batch-074` | `core-runtime-tui-pty`; `test/vitest/vitest.tui-pty.config.ts` | no | skipped, then blocked | synthesized failure | no | no | static archive creation failed; `dist_ready` was empty; eligibility reported `dist=false` |
| `dist-batch-075` | `core-support-boundary`; `test/vitest/vitest.boundary.config.ts` | no | skipped, then blocked | synthesized failure | no | no | static archive creation failed; `dist_ready` was empty; eligibility reported `dist=false` |

The static product gates themselves passed, and
`openclaw-local-ci-runtime-artifact/v1` validation passed. The next step,
deterministic archive creation, failed. Upload and readiness recording were
therefore skipped. The dist matrix jobs were not materialized, and no consumer
could download or extract the archive.

## Static archive failure

**Classification: workflow defect in the
`karmaterminal/openclaw-bootstrap#1478` archive contract, not a product static
failure.**

The product build intentionally stages isolated plugin dependencies in
`dist/extensions/<plugin>/node_modules`. For ACPx,
`dist/extensions/acpx/node_modules/.bin` is a POSIX symbolic link created with
directory/junction semantics. Its relative target is
`../../../../extensions/acpx/node_modules/.bin`; canonicalization lands in the
same checkout at `extensions/acpx/node_modules/.bin`. That target is a real
directory, **not** itself a symlink.

The archive helper first normalized the source symlink target and rejected the
canonical relative path because it lies outside the archive's allowed
`dist`, `dist-runtime`, and `packages/ai/dist` prefixes:

```text
FATAL: unexpected archive path: 'extensions/acpx/node_modules/.bin'
```

The exact unsupported class is therefore an **out-of-archive directory
symlink**. Archive contract v1 supports a symlink only when its normalized
target is an archived regular file. It does not support this generated
directory/junction dependency entry. Archive creation stopped before producing
bytes, so upload and extraction were never attempted.

## Seven failed tests

The suite tally was `191,607 passed / 7 failed`. Four failed tests greened on
fresh isolated confirm-determinism runs; three re-red.

| ID | File and test | Original | Preceding state/order | Fresh-process confirmation | Classification |
|---|---|---|---|---|---|
| F1 | `extensions/codex/src/app-server/run-attempt.steering.test.ts` — `persists every completed answer before 'Gateway steering across a none barrier'` | Assertion mismatch: answer records were merged and the steer record was absent | Same-file cleanup/start-time/pending-question steering cases passed immediately before | PASS, 19/19; target 3,861ms | greened load flake |
| F2 | `extensions/codex/src/session-rollout-snapshot.test.ts` — `reads immutable metadata without interpreting historical records (compressed=false)` | 120,000ms timeout after four no-output notices | Followed `harness.session-runtime-ownership`; the compressed sibling and later snapshot cases passed | PASS, 20/20; target 24,113ms | greened load flake |
| F3 | `src/auto-reply/reply/agent-runner.continuation-chain-break-reset.test.ts` — `resets the chain budget to 0 on a fresh (non-wake) turn-entry, upstream of inference` | 120,000ms timeout | Followed `agent-runner-utils`; all three same-file siblings passed | PASS, 4/4; target 95,851ms | greened load flake; unrelated to the reservation fixture in #1292 |
| F4 | `extensions/codex/src/app-server/transport.process.test.ts` — `reaps descendants in independent and root process groups before close returns` | Four leader/descendant processes remained | Two identity-change cases ran immediately before; four revalidation siblings passed after | PASS, 12/12; target 511ms | greened load flake |
| F5 | `test/scripts/build-and-run-mac.test.ts` — `prepares the Apple resource bundle before SwiftPM with corepack` | Status 1 instead of 23; real pnpm failed `lstat` on the fixture's absent `packages` directory | The same-file pnpm variant passed immediately before | FAIL again, 1 failed/6 passed; target 369ms | test-harness defect |
| F6 | `extensions/telegram/src/telegram-ingress-drain-factory.test.ts` — retained answer `before middleware consumes a new-row answer` | Expected defined, got undefined | Fresh file process; first three admission-order rows passed | FAIL again as part of 2 failed/9 passed; target 5ms | product composition defect, #1319 |
| F7 | `extensions/telegram/src/telegram-ingress-drain-factory.test.ts` — retained answer `when an existing-row answer starts before the new-row admission` | Expected defined, got undefined | Fresh file process; follows F6 and exercises transient-to-retained upgrade | FAIL again as part of 2 failed/9 passed; target 3ms | product composition defect, #1319 |

F5 is environmental fixture leakage, not a macOS product failure.
`createPnpmRunnerSpawnSpec` correctly prefers an executable `pnpm` found on
`PATH` before falling back to `corepack`. The test places fake `corepack` on
`PATH` but leaves `/usr/bin` visible; Emeric has `/usr/bin/pnpm`, so the test
invokes the real package manager. Its pnpm sibling passes, and the isolated
file re-reds identically.

F6/F7 are one broken product-composition invariant: callback-answer ownership
must survive admission ordering and replacement module graphs. The real
factory/answer-state boundary fails in a fresh file process; this is not a
shared-shard-only flake. The current product commit changed only the erased
TypeScript owner type. After removing that type-only intersection, the
`callback-query-answer-state.ts` bytes equal predecessor
`a3dce202836ac647ed9e8c6cdb2cb096326bbc9e`. Therefore the failure remains
owned by #1319 but was not introduced by `c27e802b`.

## Five greened load flakes

F1-F4 account for four original failed tests. The fifth greened load flake was
a file-load hook failure, so it added no failed test:

| File | Original | Fresh-process result |
|---|---|---|
| `ui/src/styles/cursor-policy.browser.test.ts` | `beforeAll` hook timed out at 180,000ms; 0 tests failed and 3 were skipped | PASS, 3/3 |

All five were explicitly identified by confirm-determinism and ended with
passing isolated files. They remain load-flake evidence, not broad acceptance
for the run and not a reason to green the terminal verdict.

## Hosted failures and cancellation

`hosted-batch-011` ran for 5,000 seconds and ended with its routed action still
marked in progress. Its check annotation says:

> The hosted runner lost communication with the server.

It uploaded no batch artifact or receipt. All three planned shards are
infrastructure-unexecuted/unknown, represented by a synthesized blocked
failure—not test passes.

`hosted-batch-039` received a runner shutdown signal after about 14 minutes,
then logged `The operation was canceled.` Post-action cleanup was skipped. The
run itself continued, so this was not whole-run supersession or fail-fast
behavior. Its three shards likewise have no summaries and are represented by a
synthesized cancelled failure.

## Predecessor and ownership classification

Direct product predecessor:
`a3dce202836ac647ed9e8c6cdb2cb096326bbc9e`.
Every failed test file is unchanged between predecessor and candidate. The
candidate's only change is a TypeScript-only `object &` intersection in
`extensions/telegram/src/callback-query-answer-state.ts`; normalized runtime
source is byte-identical.

| Class | Count | Ownership |
|---|---:|---|
| Product defects | 2 failed tests / 1 invariant | Telegram callback admission/answer composition, #1319 |
| Test-harness defects | 1 failed test | mac build wrapper corepack fixture/PATH isolation |
| Workflow defects | 2 | dist archive directory-symlink support and static-summary miscount, `karmaterminal/openclaw-bootstrap#1478` |
| Infrastructure terminal failures | 2 batches / 6 missing summaries | GitHub-hosted runner communication and shutdown |
| Greened load flakes | 5 | four test failures plus one load-hook failure |
| Unclassified | **0** | N/A |

Repair boundaries are:

1. Telegram's callback answer state at the admission/consumer and
   module-replacement composition boundary; preserve duplicate coalescing,
   transient-to-retained upgrades, settled retention, tombstones, and restart
   module graphs.
2. The mac wrapper test fixture's package-manager selection boundary; make the
   corepack case deterministic without changing production PATH precedence.
3. Bootstrap's archive manifest/create/extract boundary; model the generated
   directory symlink safely and cover both dist consumers, corruption,
   missing targets, cleanup, and exact-SHA verification.
4. Bootstrap aggregation's summary classifier; count only routed shard
   summaries and separately account for static evidence.
5. Hosted runner lifecycle is infrastructure-owned; terminal synthesis already
   fails closed and requires no product fallback.

This lane is read-only: it made no source repair and therefore has no successor
negative/positive repair pair. The immutable run itself supplies deterministic
negative controls for F5-F7 and isolated confirmation for all seven. No Actions
dispatch, broad rerun, local test execution, PR, presentation, deployment, or
issue mutation was performed. Acceptance path: **focused-only artifact
classification**.
