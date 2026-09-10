# Mode-B run 34478079173 terminal classification

**Verdict:** diagnostic failure, fully classified. The product static gates passed. The run contains one deterministic continuation-test failure on the stale diagnostic composition, five first-run failures that passed their confirmation executions, seven missing routed summaries fully attributed to hosted infrastructure or the blocked dist producer, and one Bootstrap archive-contract defect that rejects a benign multiply-linked regular file. There are zero unclassified cells.

This is a read-only result. It does not authorize the diagnostic product as a successor base, a source change, an Actions dispatch, a PR, presentation, deployment, or a broad rerun.

## Named-ref contract

| Category | Named ref | Full SHA | Equality |
|---|---|---|---|
| Product/base | `karmaterminal/openclaw@0b85aeb4685df7da33259fe3c6a0153dedd85cb8` | `0b85aeb4685df7da33259fe3c6a0153dedd85cb8` | Local object, diagnostic HEAD, run input, aggregate, and commit API agree |
| Safe lane | `codeagent/classify-modeb-34478079173` | `43b42f31f61a2816950e040a741aa45e9688458d` | Local, tracking, and server payload checkpoint agree |
| CI/workflow | `karmaterminal/openclaw-bootstrap:codeagent/final-workflow-1478-1479-impl` | `5a37295932d42e01d2a51c7176f09b14c860bd1e` | Run `headSha`, server branch, commit API, routing plan, and aggregate agree |
| Presentation | N/A | N/A | No presentation ref or action applies |
| Docs/proof | `modeb-34478079173` payload commit | `43b42f31f61a2816950e040a741aa45e9688458d` | Local, tracking, and server agree |

Final read-only ref refresh, without checkout reset:

- fork `main`: `8e7b2d2068d188af8b3509111af0ec33beb04bba`
- upstream `main`: `37df5e616473b218884263f40c9450ff7a85eba7`
- Bootstrap `main`: `30cf7234393690fade354ab577b58a9b9a67d03b`

`classification.json` records the earlier collection snapshot as well; the final refresh advanced both product main refs, but every compared test blob remained byte-identical to the earlier current-main blobs.

## Artifact integrity

The Actions API reports 75 non-expired artifacts. `artifacts.tsv` records every artifact ID, name, size, and service digest. Receipt validation is `75 / 75`.

| Download | Artifact/job | SHA-256 | Verification |
|---|---|---|---|
| Aggregate | `openclaw-local-ci-aggregate-0b85aeb4685d`, ID `10156296779` | `e3879d4d7e5289c0122c73ef3f346814e3949ac936e5dd47c5e5ae12c76286ef` | Matches Actions digest; ZIP passes extraction |
| Routing plan | `openclaw-local-ci-routing-plan-0b85aeb4685d`, ID `10152371072` | `27db6e3abe98fc71b4e8e595053fe7bd7fe089a8e19c3b1d448a6f94dec1d4f7` | Matches Actions digest; ZIP passes extraction |
| Static evidence | `openclaw-local-ci-static-0b85aeb4685d`, ID `10152895843` | `a5410cd1a3c0937c8a6445289ead026f5600802d79ad634edfa5d999911096d4` | Matches Actions digest and aggregate copy byte-for-byte |
| Hosted cancellation | batch `011`, ID `10156243367` | `ebee670a8cdc8da6996ea675938b1ba4b453e776a8bdffe1715e3e86019e78d8` | Matches Actions digest and aggregate copy byte-for-byte |
| Deterministic test batch | batch `033`, ID `10153235304` | `9693014d796a51877fa2469c0b62db2bfb654ff1559e73ad6acb7ea8ea26afd3` | Matches Actions digest and aggregate copy byte-for-byte |
| Static job log | job `102873912788` | `cc0b33b77b7538b942e50998245d2ecfa8d1b7f432ad75c171edb62e9d068f0f` | Immutable completed-job log |
| Hosted cancellation log | job `102873913495` | `9a02bf675482919d8d9bc52b5ad5aac4e7108e9f8a05d8dcf7c8786e722c3984` | Immutable completed-job log |
| Hosted runner-loss log | job `102873913657` | `9c1c1759a4697332a58d2a50b8ca8fa1114068d368db560ac7da26818347786e` | Immutable completed-job log |
| Hosted deterministic-failure log | job `102873913828` | `910945eba3defd130837e00310b63dc050f04e72c3168b6215684e12b1b3d9a7` | Immutable completed-job log |

There is no batch `039` artifact: the runner stopped before emitting a receipt. There are no dist-batch artifacts because archive creation failed before upload and both dist jobs were skipped. Aggregate terminal synthesis is therefore the authoritative failure-shaped evidence for batch `039` and dist batches `074`/`075`.

## Routing and zero-unclassified accounting

- planned routed shards: **178**
- present routed summaries: **171**
- missing routed summaries: **7**
- separately counted static summaries: **1**
- planned/received/valid batch receipts: **75 / 75 / 75**
- routing ruleset digest: `sha256:ecf33213b90b95f4fe8ea0ca6a18b958c5cb686068565c6f75ce9449c7d10384`
- planner digest: `sha256:957eea6354cfbd37ec65e09806021d52b716294519e81da13ce87c26f2d36c62`
- raw test tally: **192,403 passed / 6 failed**
- confirmation result: **5 greened / 1 deterministic**

| Terminal batch | State | Missing summaries | Classification |
|---|---|---|---|
| `hosted-batch-011` | cancelled, worker receipt, rc 130 | `extensions`, `extension-provider-openai` | Hosted cancellation; `checks-fast-contracts-plugins-b` had already produced its preserved summary |
| `hosted-batch-039` | blocked, aggregate synthesis, rc 125 | `agentic-plugins`, `extension-discord`, `core-runtime-infra-channel-plugin` | Runner shutdown/communication loss before receipt; no test verdict |
| `dist-batch-074` | blocked, aggregate synthesis, rc 125 | `core-runtime-tui-pty` | Static archive producer failed; dist job never ran |
| `dist-batch-075` | blocked, aggregate synthesis, rc 125 | `core-support-boundary` | Static archive producer failed; dist job never ran |

The cancellation log ends with `The operation was canceled` and exit 130. The runner-loss log records `The runner has received a shutdown signal` followed by cancellation before a receipt. Neither is a product test failure.

## Six test rows

Each row has two execution rows in the shard log. Five have a `confirm-determinism-flakes.txt` marker after the second execution passed. The continuation chain-reset row failed both executions and therefore has no greened-flake marker.

| Shard / test | First execution | Confirmation execution | Classification |
|---|---:|---:|---|
| `extension-codex-app-server-support` — `transport.process.test.ts`, descendant reaping | fail, 2,567 ms | pass, 561 ms | load flake greened |
| `extension-codex-surface` — `session-rollout-snapshot.test.ts`, immutable compressed=false metadata | fail, 137,231 ms | pass, 45,459 ms | load flake greened |
| `agentic-agents-support` — `exec.real.test.ts`, SIGTERM-resistant descendant | fail, 3,938 ms | pass, 6,166 ms | load flake greened |
| `auto-reply-reply-agent-runner` — `agent-runner.continuation-chain-break-reset.test.ts`, fresh turn-entry chain budget | fail, 211,397 ms | fail, 121,340 ms | deterministic on diagnostic product |
| `agentic-control-plane-agent-chat` — `server.sessions.reclamation.test.ts`, responsive large-session reclaim | fail, 16,661 ms | pass, 13,775 ms | load flake greened |
| `agentic-agents-core-subagents` — `subagent-announce.continuation.test.ts`, delayed chain-hop durable pending store | fail, 77 ms | pass, 31 ms | load flake greened |

The deterministic row is real for `0b85aeb...`, but its file is continuation-only and absent from current fork/upstream `main`. It must be retested after the accepted continuation delta is replayed onto a fresh base; it is not authority for patching the stale composition.

## Persistent blob disposition

Fork `main@8e7b2d...` and upstream `main@37df5e...` agree on all current blobs below.

| File | Diagnostic blob | Current fork/upstream blob | Upstream supersession | Disposition |
|---|---|---|---|---|
| `src/agents/sessions/exec.real.test.ts` | `20e92fbee301b52342e5b11b2a274cb703b25f4c` | same | N/A | Greened flake; no blob drift |
| `extensions/codex/src/session-rollout-snapshot.test.ts` | `e8ccfcd5c6f11b49888450c9f5813992172753e3` | `ba16515f67633bd6480ccbab90c6ae6d3835f2de` | `c49714aef31cf785fa06594f58e5f5f02f6f2c8b` | Greened flake; diagnostic blob stale |
| `src/gateway/server.sessions.reclamation.test.ts` | `ff34361d3e1b7ad22cd602ac1976c634e9d4e06a` | same | N/A | Greened flake; no blob drift |
| `extensions/codex/src/app-server/transport.process.test.ts` | `d837bc5411aaf85044ce4d1d73dab67015735c1e` | `912a2cd4de490d4398fde65b2ca86732de9a537c` | `693485b36510ee24cf97be4bdbfa2c3ff5547609` | Greened flake; diagnostic blob stale |
| `src/auto-reply/reply/agent-runner.continuation-chain-break-reset.test.ts` | `8977e44d41d2b83b052c83120670eb4ba05729ed` | absent | N/A | Accepted continuation surface; replay and retest |
| `src/agents/subagent-announce.continuation.test.ts` | `403a6349b5a98c1f5de15753c3af5ea58a0fc37e` | absent | N/A | Accepted continuation surface; replay and retest |
| `test/scripts/build-and-run-mac.test.ts` | `b98bd7f8ef09e0e45036f7440927c7ee8567e440` | `0292b9c22dcadce21c5f2f89d2560a560804b400` | `31b25e78513ec1855e09c19b88b3ca8a745d764e` after upstream #141884/#142096 | Prior-run Mac blocker is obsolete |
| `extensions/telegram/src/telegram-ingress-drain-factory.test.ts` | `57da9903f943418a12aea22937ee39f19d104fd6` | `a931a6323ec34172b45cd623c47052ccb4729a7f` | `f34ec093d5f88ba3a743464afab5d62385599d75` after upstream #140078/#140602 | Prior-run Telegram blockers are obsolete |

## Archive failure and dist state

Static typecheck/lint/guards, UI lint, protocol generation, plugin assets, strict build, and dist validation passed. The static job failed only afterward in `Create deterministic dist runtime archive`:

```text
FATAL: runtime artifact contains multiply-linked file:
dist/extensions/acpx/node_modules/@agentclientprotocol/claude-agent-acp/LICENSE
```

The exact workflow source opens the path with `O_NOFOLLOW`, proves it is a regular file, then rejects `st_nlink != 1`. The producer log did not retain the runner's device, inode, exact link count, or peer names; that missing geometry is recorded rather than inferred. Same-host candidate dependency bytes corroborate the class:

- device `66306`
- inode `35092411`
- link count `9`
- size `10,783`
- three same-inode names visible inside the worktree's pnpm tree; six links live outside that scanned root

**Archive disposition:** copy the bytes as the existing normalized regular-file manifest entry. Do not preserve source hardlink topology and do not reject it. The archive contract already validates canonical path, regular-file type, bounded size, SHA-256, and extraction content. Source inode topology is neither payload identity nor a security boundary. Preserving linkage would import nondeterministic filesystem topology and require ordered hardlink extraction; rejecting it blocks both dist consumers despite safe bytes.

Archive upload was skipped because creation failed. Archive download/extraction never ran. Both dist variants—`core-runtime-tui-pty` and `core-support-boundary`—were skipped and have no product verdict.

## Discord receipt verification

The local Discrawl database was stale at `2026-06-20T06:07:52.434433215Z` and did not contain the requested messages, so the exact IDs were retrieved from the live `sprites-of-thornfield` channel. `discord-receipts.tsv` records UTF-8 byte lengths and SHA-256 hashes:

| Receipt | Bytes | SHA-256 | Incorporated substance |
|---|---:|---|---|
| Ronan `1547608710157705246` | 2,015 | `ef50ceb691efb01804bca47ba958544b547924033f50536071026339e90e0483` | Five old-run flakes greened; Mac/Telegram blobs were stale; archive containment was separate |
| Ronan `1547608712145801266` | 300 | `3f726c25b50b1a64a9e6f8fc953ab637afd652f87519446ec1efd56dd6633e2c` | Fresh upstream-derived base, accepted continuation only, separate archive cure |
| Elliott `1547609116866908240` | 1,982 | `72a8f9d7492565c5049413ba9c368a6cf7ac12d65ed22fae54b2db6747a8c8f5` | Stale checkouts/GitNexus binding and invalid Gate 2.7/path-intersection baseline assumptions |
| Elliott `1547609120113303564` | 126 | `bfadba79c07be0f2bbcd91d3b332acd219e39873e57dc5ca7e3a2b9d98db5c9f` | No stale-path GitNexus authority; no mutation or rerun |
| Emeric `1547608122749755523` | 1,826 | `719c32aa553efc696b7d02e0d59befeaee35cea338c3ae08091b13e38721fb7a` | Static product pass/archive-only failure, hosted runner loss, exact stale Telegram blob |

## Stale-base disposition and replay inputs

Reject `0b85aeb...` as a successor base. Do not replay its stale Telegram/Mac repairs, unrelated gate-support repairs, or structural merge commits. `classification.json` assigns every one of the 35 first-parent post-`e73b1864...` commits to replay, subsumed, stale/redundant, or unrelated/excluded buckets.

Use current upstream `37df5e616473b218884263f40c9450ff7a85eba7` as the fresh base at this receipt. Re-resolve if server `main` advances before composition. Replay only these semantic inputs:

| Commit | Input |
|---|---|
| `f16aa2e0118b616d1a1c31bb64a56b7da756a224` | Canonical accepted continuation transpose; re-author its semantic delta, not its old upstream base |
| `4f3ed1f13dd4b562ced2a293c9f980bf8a6dd170` | Targeted TaskFlow store fixtures |
| `af4d5c901ff7ed43882812d2be3caec38dd48953` | Remaining continuation/reset store fixtures |
| `f2139b3497f9f16ee498302892bcf8e24d6ae71f` | Prepared model catalog for the real reject-observation path |
| `dedcc84b1c57cb94be7df4c8c47c968cc724b5ba` | Owner-bind `request_compaction` failure events |
| `1bfe94efa22f09808345babe413326d6bd02f50a` | Refresh post-compaction runner fixtures |
| `d3f8c4958a294b84094e3b8c4faa259345905cd7` | Bind continuation returns to recipient owners |
| `fc4e29c12aec3512bfa97877706dfa7e31e6b939` | Owner-resolution refactor supporting that binding |
| `e7eec0e6eefe2c90584d60988a5c962933e09a40` | Persist validated owner through completion spawn |
| `64a21f17cbc9f8861f8999f6e77b100409dcc133` | Fence owner-bound completion events |

Old fixture commits `abd2389...`, `a49d599...`, `eab496c...`, `3256509...`, `aa4d22a...`, and `8223339...` are subsumed by the canonical transpose/current-lineage fixture set and must not be replayed independently. The next proof must first cure the Bootstrap byte-copy archive edge, then run one exact fresh product/workflow pair. Gate 2.7, path intersection, stale checkouts, and stale GitNexus indexes remain non-authoritative.

## Validation and boundaries

No product source, workflow source, checkout state, Actions run, PR, presentation, or deployment was mutated. No local or broad test suite was run because this lane classifies the already-terminal Mode-B receipt. Validation consisted of immutable Actions API reads; ZIP digest/extraction checks; byte comparison of failure artifacts against aggregate copies; aggregate/routing JSON invariants; fresh server-ref fetches; Git object/blob comparisons; exact commit history; completed-job logs; and exact Discord message retrieval/hashing.

Bound work: openclaw/openclaw#129388 (the live bound continuation PR; the fork issue endpoint is 404), karmaterminal/openclaw-bootstrap#1478, and karmaterminal/openclaw-bootstrap#1479. No issue was closed or mutated.
