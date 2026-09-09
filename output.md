# Mode-B 34370180927 terminal classification

**Verdict: PASS.** All 229 first-pass failed tests are enumerated in
`modeb-34370180927-classification.json` and
`modeb-34370180927-classification.tsv`: 225 deterministic failures and four
load flakes that greened on the required isolated rerun. Every row has exactly
one durable disposition; unclassified rows: **0**.

## Named refs

| Category | Named ref | Full SHA | Equality receipt |
|---|---|---|---|
| Product/base ref | `karmaterminal/openclaw:savegame/20260909/14c500-before-static-repairs` | `14c500c3f0a1442bb558b8475480677b36180e6b` | local tracking = server |
| Safe lane ref | `karmaterminal/openclaw:codeagent/modeb-34370180927-terminal-classifier` | `b3a572cd3ea0082679669baa80f0679332643cf8` | local HEAD = local tracking = server before classification publication |
| CI/workflow ref | `karmaterminal/openclaw-bootstrap:codeagent/modeb-1471-1472-1474-1475-composite` | `b27223f107a7b55dbd5b207ba8d6bd3b426941a1` | run `headSha` = server |
| Presentation ref | `karmaterminal/openclaw:codeagent/85651-upstream-1ba243c8-gates` | `e76395810becd0ad0f2997cae8b4f777e6439d81` | live openclaw/openclaw#129388 head = local tracking = server |
| Docs/proof ref | N/A | N/A | N/A |

The Mode-B aggregate reports 75/75 valid receipts, no missing batches, exact
product/workflow SHA consistency, both dist variants, 198,963 passed tests, 229
first-pass failed tests, 225 confirm-determinism reds, and four isolated-rerun
greens. Bootstrap routing is closed by those receipts and is not classified as
a product failure.

## Durable dispositions

| Count | Phase | Root-cause/owner group | Disposition |
|---:|---|---|---|
| 153 | deterministic | CLI and Gateway startup tests consume ambient newer state DB / plugin lifecycle lease | `EXISTING_ISSUE` karmaterminal/openclaw#1311 |
| 32 | deterministic | accepted continuation result never reaches auto-reply scheduling composition | `EXISTING_ISSUE` karmaterminal/openclaw#1275 |
| 25 | deterministic | owned subagent announce drains never call `spawnSubagentDirect` | `EXISTING_ISSUE` karmaterminal/openclaw#1310 |
| 7 | deterministic | release-validation fixtures inherit runner repository/provenance | `EXISTING_ISSUE` karmaterminal/openclaw#1299 |
| 2 | deterministic | ACP terminal publication drops derived timeout kind | `EXISTING_ISSUE` karmaterminal/openclaw#1276 |
| 2 | deterministic | historical v14/v15 media fixtures are rejected as noncanonical | `EXISTING_ISSUE` karmaterminal/openclaw#1312 |
| 1 | deterministic | disabled cross-session bracket case times out at 120 seconds | `EXISTING_ISSUE` karmaterminal/openclaw#1280 |
| 1 | deterministic | locked native model enters prepared-route materialization | `EXISTING_ISSUE` karmaterminal/openclaw#1308 |
| 1 | deterministic | Codex dynamic origin path never issues `turn/start` | `EXISTING_ISSUE` karmaterminal/openclaw#1309 |
| 1 | deterministic | Telegram opaque callback loopback edits twice | `EXISTING_ISSUE` karmaterminal/openclaw#1313 |
| 1 | load flake | worker re-arm backoff is clipped below one second | `NEW_ISSUE` karmaterminal/openclaw#1314 |
| 1 | load flake | plain Codex rollout snapshot times out | `NEW_ISSUE` karmaterminal/openclaw#1315 |
| 1 | load flake | Discord PCM underflow playback aborts before idle | `NEW_ISSUE` karmaterminal/openclaw#1316 |
| 1 | load flake | Codex remote-media fixture exhausts its 500 ms batch deadline | `NEW_ISSUE` karmaterminal/openclaw#1317 |
| **229** |  |  | **0 unclassified** |

No row uses `UPSTREAM_BASELINE` or `BLOCKED`: the aggregate does not contain an
exact absorbed-upstream failure receipt for these rows, and every observed
failure has a durable issue owner.

## Accepted non-test repairs in the preserved successor

The static receipt contained two additional non-test groups:

- Six `max-lines` violations are repaired by
  `6eee5579c373c53233d42ad9f50dc3ea193bf9f1`
  (`ACCEPTED_REPAIR_PRESENT`, karmaterminal/openclaw#1304). Its stable patch ID
  `8d553e75258c72d51116f0a8cd39465eb0b7c580` exactly matches tested repair
  `c6a43363ccf8c3e3d97739d0a4c6e84b16c022d4`; the receipt records 132 focused
  tests and targeted oxlint passing with all six overages removed.
- Two undeclared `__exportAll` declaration exports are repaired by
  `b3a572cd3ea0082679669baa80f0679332643cf8`
  (`ACCEPTED_REPAIR_PRESENT`, karmaterminal/openclaw#1305). Its stable patch ID
  `8c1e5ba7a72c13189d2fa7ff1c236f0fdf4d468c` exactly matches tested repair
  `e4133accf0408afb247e039e534b9b0ab6196275`; the receipt records 174 focused
  tests plus `build:strict-smoke` and all 152 public plugin-SDK subpaths passing.

For Codex-backed classifications, direct source inspection used
`openai/codex@400ee190c30d5e4a88549c070a2335311f0baa91`:
`codex-rs/rollout/src/{recorder,compression}.rs`,
`codex-rs/app-server-protocol/src/protocol/v2/fs.rs`, and
`codex-rs/app-server/src/request_processors/fs_processor.rs`.

## Validation and acceptance path

This read-only lane used the downloaded Mode-B aggregate and per-shard logs; no
product/bootstrap source was changed, no workflow was dispatched, and no broad
suite was run. Acceptance path: **focused-only**, consisting of manifest
accounting/schema checks, exact ref equality checks, live issue receipt checks,
successor ancestry/diff/patch-ID proof, and the aggregate's own
confirm-determinism receipts.
