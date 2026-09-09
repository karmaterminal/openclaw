# Affected-subnetwork review: product `32e89116`

**Verdict: PASS.** Candidate `32e89116f2177b6cccd80cc427af85e678921176`
has tree `bee6e3f415969861dcc34b73b95e33f842a56a5a` and is a linear,
merge-free 14-commit successor of preserved base
`b3a572cd3ea0082679669baa80f0679332643cf8`. No blocking finding or
actionable P0-P2 defect was found for openclaw/openclaw#129388.

By: Gwydion Nanashi Ferrinas Solidor (@karmafeast, acct 2011-06-30) |
OpenClaw: 13 PRs, 5 issues, 1 default-branch commit/12mo | GitHub
contributions: 24,282 commits, 9,977 PRs, 502 issues, 53 reviews/12mo.
The contribution graph is token-visible and may include private repositories.

## Named refs

| Category | Named ref | Full SHA | Equality receipt |
|---|---|---|---|
| Product/base ref | Product `karmaterminal/openclaw:codeagent/product-34370180927-repair-assembly`; preserved base immutable object | Product `32e89116f2177b6cccd80cc427af85e678921176`; base `b3a572cd3ea0082679669baa80f0679332643cf8` | Product local = tracking = server; base local object = server commit object |
| Safe lane ref | `karmaterminal/openclaw:codeagent/review-product-32e891-affected-subnetwork` | Evidence anchor `32e89116f2177b6cccd80cc427af85e678921176` | Local HEAD = local tracking = server before evidence; the final successor changes only this report |
| CI/workflow ref | `karmaterminal/openclaw-bootstrap:codeagent/modeb-1471-1472-1474-1475-composite` | `b27223f107a7b55dbd5b207ba8d6bd3b426941a1` | Local object = server branch = server commit object |
| Presentation ref | N/A | N/A | N/A |
| Docs/proof ref | N/A | N/A | N/A |

## Findings and composition verdict

No findings.

Production LOC: **+16/-10 (net +6)** | Tests/test support:
**+653/-486 (net +167)**. The production growth is limited to the required
timeout classification, locked native-model ownership, and committed Telegram
receipt boundaries; version-aware media validation removes duplicate schema
construction.

| Surface | Composition and fail-closed result |
|---|---|
| Continuation result projection | The shared test adapter now returns the terminal result shape consumed by the real auto-reply scheduling owner and releases accepted-terminal work in `finally`. Prepared text-only catalog facts prevent unrelated provider discovery. Immediate, delayed, restart, reservation, rollback, and partial-persistence paths retain their real owner boundaries. |
| Persisted replay and announce drain | Replay fixtures persist canonical source owners for their full lifecycle. Announce fixtures seed the same SQLite-backed child owner read by `drainChildContinuationQueue`; accepted spawns remain exactly once, stale/cancelled admissions reject, failed chain-state persistence is recorded, and announce delivery does not claim success for a missing owner. |
| ACP timeout publication | `finalizeChatSendAgentOutcome` carries its already-derived `runtimeClassification === "timeout"` into the single `chat` terminal error frame. The dedupe payload and ACP projection agree without message-text inference. |
| CLI/Gateway state roots and media migration | CLI and Gateway fixtures default under `OPENCLAW_TEST_HOME` while explicit `OPENCLAW_STATE_DIR` still wins. Doctor validates each historical database against `resolveOpenClawAgentTargetSchema(userVersion)`, so v14/v15 omit later recipient-authority storage before converging to current schema; integrity, foreign keys, source preservation, and restart-open behavior remain covered. |
| Fixture resources | Unix socket paths are explicitly bounded, Docker restart probes allocate and own collision ports instead of borrowing 18789, and release-validation tests freeze and restore `GITHUB_REPOSITORY`. Cleanup remains fixture-owned. |
| Locked native model routing | Admission-less, explicitly pinned non-OpenClaw harnesses are native-model-owned and skip prepared-route materialization. Persisted sessions still require the authoritative admission/runtime ownership checks, and ordinary OpenClaw routing still resolves through the catalog. |
| Codex dynamic origin | The test no longer injects tools through another plugin's private build state. It binds admitted production host capabilities, reaches `turn/start`, receives `item/tool/call`, and verifies tool-to-continuation trace ancestry. Direct dependency proof used `@openai/codex` 0.153.0 tag commit `41e22fee981a63b3698df7ed36bad393cda24715`: `codex-rs/app-server-protocol/src/protocol/v2/turn.rs` owns `turn/start`; `codex-rs/app-server/src/request_processors/turn_processor.rs` carries the turn trigger; `codex-rs/app-server/src/bespoke_event_handling.rs` publishes dynamic-tool requests; `codex-rs/app-server/src/dynamic_tools.rs` returns their results. |
| Telegram selection receipt/replay | Model selection commits before presentation. A lost successful edit response is retryable rather than recast as selection failure; replay accepts Telegram's `message is not modified` receipt; permanently unavailable edit targets settle without repeating the committed selection. The loopback test mutates server state before destroying the first response, so response loss is deterministic. |
| Telegram fetch adaptation | The final assembly-only change applies the existing `asTelegramClientFetch` boundary exactly once at grammY construction. `createTelegramClientFetch` remains the transport wrapper; the adaptation is type-only and adds no second runtime fetch layer. |

### Patch-set accounting

All 14 commits have distinct stable patch IDs within the base-to-candidate
range; the range contains zero merges. The four production hunks still blame
to their accepted repair commits at the candidate tip, so later test repairs
did not revert them. The seven superseded prior Mode-B candidate patches ending
at `85891fb0d98461d0835ea11d5b3b41e462753db2` have no stable patch-ID
intersection with this range and are not ancestors of the candidate.

| Commit | Stable patch ID | Accepted responsibility |
|---|---|---|
| `abd2389ed0fe5699cf96b9383ff580c1cf40aa86` | `a854f4195e4a1c63d18028fb31ac836b56d4cef1` | continuation result projection |
| `fc267d54215820897a2bffbb35524cd6feb88aaa` | `c5e3615325e698460dc1eb73639bcc20b651219b` | ACP timeout terminal |
| `a49d599edfb42b4a4a9a0ac290493a7f06a16d4b` | `8ba26250b436872438dc7721cddc33ea16b448d9` | prepared catalog |
| `eab496cdf0c4b1d358991e126405242d83cbc2a3` | `677bedabe2e3e65f76275d3ada75e8895ab84c46` | replay owners |
| `32565097c057970e546ddc8bb82e09005d43530e` | `486c1f6d1bc2207883106b1b5e2ebfe1bf4de6ad` | announce drain owners |
| `f49ba6f875c7173e2a2f7db1a8151011c6c78ba9` | `ab1d8da402a79bbb475710e5ffd900e0b52f7369` | CLI/Gateway state isolation |
| `b1b0bebfe332c17be500e41867683179b693d27d` | `d485f21afbd2c01611109bd908f7cd4815ae8f48` | version-aware media schema |
| `6fcb3f0085f87270241beee5e60410de7d82cae7` | `6e83d108ce0aba859a38a5d954af30d639060084` | fixture resources |
| `c07dd5983cc59cc92a6c438bd194c96cc9a4d1c1` | `989fc665dc791058eeedcb2aa3a5f4731b226f3f` | locked native model |
| `82a8c8fa98b0e9e62777d3825ccc5decf14396d4` | `dc4c2c3d0758ba9d7bcd0416779b569eb6956ccb` | Codex production origin |
| `6a8979ddc60875955a8effc3c959e85fd4476219` | `e178356e211abc797e47a392f9e13214eb963374` | Telegram committed receipt |
| `49cd1cfb4ddecb5bd8f624b5f742da5cf8cb167f` | `36c0feaa00efdef88b06bd75854b4a6b4fc14ff7` | deterministic response loss |
| `aea5f4e097fb0d99da02275fa911905abd459940` | `e85a0efeac3da3a107c4d4f8b864eb19dddebb10` | rejected duplicate edit assertion |
| `32e89116f2177b6cccd80cc427af85e678921176` | `06b7686453b7578e9b6317e395e77d7c1e0d15a4` | canonical fetch type adaptation |

## Regression evidence

The disposable exact-base checkout at
`b3a572cd3ea0082679669baa80f0679332643cf8` produced the expected negative
controls: continuation scheduling emitted zero accepted spans/actions; ACP
timeout frames omitted `errorKind`; announce drain skipped accepted spawn
admission; prepared catalog coverage delayed about 74 seconds and omitted the
required rejection event; locked native routing called generic model resolution
twice; Codex never reached `turn/start` and hit the runner's 120-second
no-output termination; v14/v15 migration rejected missing
`session_recipient_authority`; CLI/Gateway tests opened ambient schema-v16
state; and the successor Telegram regression against base production emitted a
contradictory second edit while the permanent-target case edited twice.

Mode-B run `34370180927` supplies the original environment-bound negative
receipts for the socket/port/repository fixtures: 153 ambient state-root
failures, seven release-provenance failures, and the remaining owner failures
enumerated by its terminal classification. The same fixture tests pass on the
successor; an idle local machine does not reproduce occupied-port or inherited
repository failures, so those passing base probes were not misreported as
negative controls.

Focused successor proof, always one worker:

```text
auto-reply-reply: 9 files, 41 passed, 1 todo
agents announce/drain: 7 files, 47 passed
gateway startup/chat events: 3 files, 321 passed
gateway ACP completion: 1 file, 17 passed
CLI: 3 files, 276 passed
media migration: 2 files, 2 passed
unit-fast-isolated model routing: 1 file, 53 passed
Telegram: 2 files, 150 passed
diagnostics/Codex origin: 1 file, 1 passed
tooling Docker: 1 file, 277 passed
tooling release state: 1 file, 288 passed
```

Commands used the required form:
`node scripts/run-vitest.mjs run --config test/vitest/vitest.<shard>.config.ts
--maxWorkers=1 <focused paths>`. One initial model-routing invocation used the
wrong owner config and selected no tests; it was rerun successfully with
`vitest.unit-fast-isolated.config.ts`. Independent autoreview was
`scoped-clean` at P0-P2 with confidence 0.9.

Acceptance path: **focused-only**. This lane dispatched no Actions and did not
duplicate the concurrent exact-head Mode-B reproof. No PR, presentation,
deployment, source edit, or GitHub mutation was performed. Remaining
uncertainty is limited to that separately owned Mode-B run's terminal result
and live Telegram delivery, both intentionally outside this read-only focused
workorder.

**Best-fix verdict:** best. Downstream timeout inference, Telegram
success-shaped fallback, generic catalog loading, and runtime legacy-schema
shims were rejected because they would move ownership away from the
authoritative producer or weaken fail-closed behavior.

**Code read:** changed production/test files; auto-reply runner and fallback
entry; continuation scheduling, persistence, delegate dispatch, and announce
runtime; Gateway chat dispatch/broadcast/ACP projection; agent model setup,
harness selection, and route materialization; agent schema variants and media
migration; Telegram callback actions, retry/replay, fetch adapter, and session
selection; Codex app-server request/tool bridge; exact Codex 0.153.0 protocol
and runtime source.
