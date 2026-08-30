# Review: #129388 `627fd528` confirmed-routing Mode-B

## Verdict

`BLOCKED`

Confirmed routing fixed the old preflight classification failure and routed every planner
identity exactly once, including an exclusive one-shard
`agentic-gateway-core-runtime` batch. The product acceptance run is nevertheless red and
receipt-incomplete: 30 deterministic test failures remained, 5 load flakes greened, one
hosted batch was cancelled, and both dist batches were skipped after static gates failed.

None of those failures can be attributed to successor `627fd528`: the successor changes
only two compaction test files, neither appears in the failure corpus, every failed file is
byte-identical to parent `e6b9dcbd`, and every focused owner command had the same exit on
successor and parent. This is not a `REQUEST_CHANGES` verdict against the successor, but the
red/missing Mode-B receipts prevent `CANDIDATE_CLEAN`.

## Named-ref contract

This table was resolved before evidence was credited. The report lane was published
unchanged before dispatch.

| Category     | Named ref                                                                     | Full SHA                                   | Local / tracking / server                                                  |
| ------------ | ----------------------------------------------------------------------------- | ------------------------------------------ | -------------------------------------------------------------------------- |
| Product/base | product successor                                                             | `627fd528391d62add9c828b3896e8864adb6de22` | local object, savegame server ref, and product API equal                   |
| Product/base | product parent                                                                | `e6b9dcbd1f365ba02d994a8ee24e2c3fd89af900` | local object; product API confirms it is the successor's sole parent       |
| Product/base | pinned upstream                                                               | `43a7cb3c92c7b5b8d5ddd56d9d157c009e0c85e5` | local object resolved                                                      |
| Product/base | `savegame/129388-compact-hook-semantic-contract-cure-627fd528-20260830T1539Z` | `627fd528391d62add9c828b3896e8864adb6de22` | local and server equal                                                     |
| Safe lane    | `codeagent/129388-627fd-modeb-confirmed-routing-20260830` evidence anchor     | `627fd528391d62add9c828b3896e8864adb6de22` | local, tracking, and server equal before dispatch                          |
| CI/workflow  | `codeagent/124337-feac2430-routing-independent-review-20260829`               | `d05778e6a96dd9a96946eff483e80c4d9ff9575e` | bootstrap server branch and dispatched run `headSha` equal                 |
| CI/workflow  | confirmed routing implementation                                              | `feac243018add5fdf106feeb5f676efddec7bafc` | bootstrap server commit; ancestor of workflow head by two commits          |
| Presentation | N/A                                                                           | N/A                                        | Out of scope                                                               |
| Docs/proof   | N/A                                                                           | N/A                                        | Proof corpus movement is out of scope; this report is the only lane output |

## Product scope

`e6b9dcbd..627fd528` changes exactly:

| File                                                       |      Delta | Parent blob                                | Successor blob                             |
| ---------------------------------------------------------- | ---------: | ------------------------------------------ | ------------------------------------------ |
| `src/agents/embedded-agent-runner/compact-reasons.test.ts` |  `+59/-20` | `475a9513d70d507979a7febe97ebb062523f376a` | `b30739d70905a77cf58a044341a0b46e9d5867a4` |
| `src/agents/embedded-agent-runner/compact.hooks.test.ts`   | `+398/-83` | `63ec1378c30fa6c86fba102e75a5552c79b4807d` | `aab495224dc99cd52de60a7f599a5eaf9a7f83b4` |

No product, bootstrap, presentation, covenant-proof, documentation, or deployment bytes were
modified by this report lane.

## Rejected old-workflow receipt

Run [`33319973689`](https://github.com/karmaterminal/openclaw-bootstrap/actions/runs/33319973689)
is a negative routing receipt only.

| Field                    | Receipt                                                                    |
| ------------------------ | -------------------------------------------------------------------------- |
| Product                  | `627fd528391d62add9c828b3896e8864adb6de22`                                 |
| Workflow SHA             | `e768ccc2e1e0887be455e6880db0bff91a1dfddd`                                 |
| Conclusion               | `failure`                                                                  |
| Planner identities       | `167`                                                                      |
| Shard summaries          | `0`                                                                        |
| Preflight                | failed at `Route shard-execution plan`                                     |
| Product/static execution | skipped                                                                    |
| Routing receipt          | unset: no ruleset digest, planner digest, lane totals, or routed-job count |

The retained planner matrix contains the single identity
`checks-node-agentic-gateway-core-runtime` /
`agentic-gateway-core-runtime`; the old workflow could not classify it. Because no test or
static shard ran, this run supplies no product evidence.

## Confirmed-routing dispatch

The dispatch used:

```text
repo=karmaterminal/openclaw
ref=627fd528391d62add9c828b3896e8864adb6de22
workflow ref=codeagent/124337-feac2430-routing-independent-review-20260829
```

Run [`33321121675`](https://github.com/karmaterminal/openclaw-bootstrap/actions/runs/33321121675)
was created at `2026-08-30T15:58:21Z`, completed at `2026-08-30T17:32:16Z`,
and reported workflow `headSha`
`d05778e6a96dd9a96946eff483e80c4d9ff9575e`.

### Routing receipt

| Field                                                    |                                                                   Receipt |
| -------------------------------------------------------- | ------------------------------------------------------------------------: |
| Planner identities emitted / matched / unknown / blocked |                                                       `167 / 167 / 0 / 0` |
| Unique routed identities                                 |                                                                     `167` |
| Duplicate routed identities                              |                                                                       `0` |
| Unrouted identities                                      |                                                                       `0` |
| Hosted                                                   |                                                  `146` shards / `55` jobs |
| Self-hosted                                              |                                                   `19` shards / `12` jobs |
| Self-hosted-dist                                         |                                                     `2` shards / `2` jobs |
| Total                                                    |                                                  `167` shards / `69` jobs |
| Routing contract                                         |                                                                   `2.0.0` |
| Ruleset digest                                           | `sha256:d2ef6b0b93c9f36ca9a668270b50eb696d3ea302760861d2cadf2cdac1a230a8` |
| Planner digest                                           | `sha256:0bee700c22fb01bd637e009689faa55c66277fb09bf4ee333064cfeeca7366a8` |

`agentic-gateway-core-runtime` occurs once in the planner and once across all routed
matrices. Its receipt is `capability_class=hermetic`, `weight_class=exclusive`,
`lane=self-hosted`, `shard_count=1`, `max_concurrent_shards=1`, and
`requires_dist=false`. No sibling shares its batch.

### Terminal aggregate

| Field                         |                                             Receipt |
| ----------------------------- | --------------------------------------------------: |
| Workflow conclusion           |                                           `failure` |
| Job conclusions               | `57 success / 13 failure / 4 skipped / 1 cancelled` |
| Test tally                    |                         `176070 passed / 35 failed` |
| Deterministic failures        |                                                `30` |
| Load flakes greened           |                                                 `5` |
| Shard summaries               |                                         `164 / 167` |
| Routing receipts              |                                           `66 / 69` |
| Exact product SHA consistency |                                              `true` |
| Receipt validation            |                                             `false` |

Missing receipts:

| Batch              | Outcome                             | Shards                                                                        |
| ------------------ | ----------------------------------- | ----------------------------------------------------------------------------- |
| `hosted-batch-009` | cancelled after about 90 minutes    | `extensions`, `agentic-commands-doctor-whatsapp`, `core-runtime-infra-cli-ui` |
| `dist-batch-068`   | skipped because static gates failed | `core-runtime-tui-pty`                                                        |
| `dist-batch-069`   | skipped because static gates failed | `core-support-boundary`                                                       |

The custom-command job and three empty matrix placeholders were intentionally skipped.
The aggregate itself failed because the lane graph and receipt validation were red.

## Failure table and controls

The focused control command shape was:

```text
node scripts/run-vitest.mjs run --config test/vitest/vitest.<owner>.config.ts \
  --maxWorkers=1 <failed owner file(s)>
```

All commands ran serially against detached clones of the immutable refs with the same
lockfile and same-host dependency tree. Exit `0` means the focused failure did not
reproduce outside Mode-B; nonzero means it reproduced or hit the stated local
infrastructure condition. Successor and parent results were identical in every row.

| Mode-B shard                       | Deterministic failures | Failed owner file(s)                                                                                                                         | Successor / parent | Pinned upstream |
| ---------------------------------- | ---------------------: | -------------------------------------------------------------------------------------------------------------------------------------------- | -----------------: | --------------: |
| `core-unit-fast-isolated`          |                      2 | `src/agents/embedded-agent-runner/run.continuation-integration.test.ts`                                                                      |            `1 / 1` |             `1` |
| `agentic-agents-support`           |                      4 | `src/agents/subagents/spawn/subagent-spawn-gateway.test.ts`                                                                                  |            `1 / 1` |             `0` |
| `extension-misc`                   |                      1 | `extensions/diagnostics-otel/src/codex-dynamic-tool-origin.integration.test.ts`                                                              |        `143 / 143` |             `1` |
| `agentic-control-plane-agent-chat` |                      2 | `src/gateway/server.chat.acp-completion.test.ts`                                                                                             |            `1 / 1` |             `0` |
| `core-runtime-config`              |                      2 | `src/config/sessions/conversation-registry.test.ts`                                                                                          |            `1 / 1` |             `0` |
| `agentic-plugins`                  |                      1 | `src/plugins/npm-install-security-scan.release.test.ts`                                                                                      |            `1 / 1` |             `1` |
| `auto-reply-reply-agent-runner`    |                      2 | `src/auto-reply/reply/agent-runner-embedded-candidate.continuation.test.ts`                                                                  |            `1 / 1` |             `1` |
| `agentic-agents-core-subagents`    |                      2 | `src/agents/subagent-announce.crosssession-gate.test.ts`                                                                                     |            `0 / 0` |             `1` |
| `auto-reply-reply-session`         |                      1 | `src/auto-reply/reply/session-updates.compaction.test.ts`                                                                                    |            `1 / 1` |             `1` |
| `agentic-gateway-core-runtime`     |                      2 | `src/gateway/gateway-active-memory.test.ts`; `src/gateway/gateway-concurrent-streams.test.ts`                                                |            `2 / 2` |             `2` |
| `core-tooling-5`                   |                      7 | `test/scripts/full-release-validation-state.test.ts`; `test/scripts/package-mac-app.test.ts`                                                 |            `0 / 0` |             `0` |
| `agentic-gateway-methods`          |                      1 | `src/gateway/server-methods/chat.directive-tags.test.ts`                                                                                     |            `1 / 1` |             `0` |
| `core-runtime-infra-storage-state` |                      2 | `src/infra/state-migrations.media-persistence.historical-v14.test.ts`; `src/infra/state-migrations.media-persistence.historical-v15.test.ts` |            `1 / 1` |             `0` |
| `extension-telegram`               |                      1 | `extensions/telegram/src/model-callback.loopback.integration.test.ts`                                                                        |            `0 / 0` |             `0` |

Interpretation:

- Every one of the 17 failed owner files has the same blob on successor and parent.
- The `core-tooling-5` full 72-file routed set also passed on all three refs:
  successor and parent `1567 passed / 6 skipped`; pinned upstream
  `1566 passed / 6 skipped`.
- The literal local `pnpm exec` wrapper could not run because the host's pnpm 12 launcher
  is stale and exits with a shell syntax error. The repository-required direct Node runner
  was used for controls instead.
- `extension-misc` successor/parent controls reached the repository runner's 120-second
  no-output termination (`143`); pinned upstream did not provide a comparable green.
- `agentic-gateway-core-runtime` controls stopped during the required runtime build because
  that same stale pnpm launcher exited `2`; they are not green controls.
- Three Mode-B failures (`agents-core-subagents`, `core-tooling-5`, and
  `extension-telegram`) did not reproduce in focused local commands on either successor or
  parent. They remain honest Mode-B reds, not candidate-owned failures.

The Mode-B static gate failed lint on:

| File                                                                                    | Error                                        | Successor vs parent |
| --------------------------------------------------------------------------------------- | -------------------------------------------- | ------------------- |
| `src/gateway/server-runtime-subscriptions.test.ts:419`                                  | `typescript(no-redundant-type-constituents)` | identical blob      |
| `src/agents/subagents/registry/subagent-registry.lifecycle-retry-grace.e2e.test.ts:111` | duplicate `listSessionEntriesReadOnly` key   | identical blob      |

Both static failures are outside the successor delta. Build strict smoke, protocol
generation, plugin asset build, and the raw-window-open UI lint passed.

## Successor-focused proof

The only changed surfaces pass focused local owner proof:

| Command surface                                                                                            | Result       |
| ---------------------------------------------------------------------------------------------------------- | ------------ |
| `compact-reasons.test.ts` under `vitest.unit-fast.config.ts`, one worker                                   | `64 passed`  |
| `compact.hooks.test.ts` through repository routing to `vitest.agents-embedded-agent.config.ts`, one worker | `165 passed` |

The Mode-B `core-unit-fast-2` shard containing `compact-reasons.test.ts` passed. The
planner does not place `compact.hooks.test.ts` in its 167-identity matrix, so the focused
owner run is its direct receipt.

## Dependency contract check

Sibling Codex was inspected directly at
`400ee190c30d5e4a88549c070a2335311f0baa91`. The relevant contract remains:

- `codex-rs/protocol/src/dynamic_tools.rs:10-52` defines typed dynamic tool specs,
  call requests, and responses.
- `codex-rs/core/src/tools/handlers/dynamic.rs:180-239` records the dynamic call as an
  in-progress turn item and completes it with success/failure content.
- `codex-rs/app-server/src/dynamic_tools.rs:14-58` decodes the app-server response and
  submits `Op::DynamicToolResponse`.

This inspection does not turn the `extension-misc` failure into successor evidence; that
test file is unchanged from the parent and its successor/parent controls had the same
termination.

## Final classification

The confirmed workflow routing objective succeeded. Product acceptance did not: the exact
run is red, one hosted batch was cancelled, two dist batches never executed, and receipt
validation failed. Parent controls rule out attribution to successor `627fd528`, while the
missing and locally blocked controls prevent a clean acceptance claim.

`BLOCKED`
