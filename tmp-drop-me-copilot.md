# silas/611-reason-cap-investigation — copilot journal

## bootstrap

- 2026-05-08 19:43 PDT: branch created off origin/main `af49c09d132`, pushed remote-first as STEP 1 per `feedback_code_agent_remote_first_checkpoint_pushes`
- Tracking issue: karmaterminal/openclaw#611
- Workorder: ~/.openclaw/workspace/openclaw-bootstrap/tmp/codeagents/WO-reason-cap-611/copilot-20260508-194210/brief.md
- Dispatcher: silas-dandelion-cult (fog-prince-canary)
- Dispatched per figs `1502499119` "start copilot lanes asap" + Ronan `1502487024` "fire SAME TURN, not 'tomorrow morning.'"

## checkpoint: investigation context

- 2026-05-08 20:03 PDT: confirmed branch `silas/611-reason-cap-investigation` already existed and tracked `origin/silas/611-reason-cap-investigation`; pushed again as remote-first resume checkpoint.
- Ran `pnpm docs:list`; no docs page looked directly load-bearing for this tool-validation-only change.
- `RUNBOOKS/PRINCE-CODE-AGENT-RUNBOOK.md` is not present in this worktree, so runbook read was attempted but blocked by missing file.
- Read issue #611 live: reported validation failure is `reason: must not have more than 1024 characters` before compaction path.
- Current `origin/main` (`af49c09d1320`) does not contain `src/agents/tools/request-compaction-tool.ts` or any `request_compaction` string; current `src/agents/openclaw-tools.ts` is 483 lines, so the line-683 trace belongs to continuation/canonical history rather than this main snapshot.
- Historical/current continuation branch evidence (`ed117ab0332`, PR #598 lineage) shows `request_compaction` schema defines `reason` with `maxLength: 1024`, then execution slices `reason` to 1024 before logging and passing it as `RequestCompactionInvocation.reason` to `triggerCompaction`.
- Downstream reason use observed in that implementation: info log on enqueue and diagnostic invocation metadata. The trigger closure consumes the invocation metadata; the reason is not part of `compactEmbeddedPiSessionDirect` summarization/custom instructions in the inspected runtime bridge.
- Hypothesis: shape (a), raise the validation/retention cap, is the least invasive fix. Shape (b) would preserve the exact pre-path failure. Shape (c) adds a new persistence/file contract where downstream usage is diagnostic metadata, not LLM compaction input.

## checkpoint: fix-shape implemented

- 2026-05-08 20:06 PDT: implemented shape (a) in the tool-validation layer only.
- Added `src/agents/tools/request-compaction-tool.ts` on the `main` branch surface with `REQUEST_COMPACTION_REASON_MAX_LENGTH = 8192`, matching schema and direct-execute truncation.
- Registered `request_compaction` only when `createOpenClawTools` receives an injected `requestCompactionOpts` trigger; default tool construction still omits it.
- Added focused tests for the 8192-character schema cap, multi-line >1024-character reason pass-through, direct-execute cap parity, and optional registration.
- Updated `CHANGELOG.md` with a user-facing #611 fix entry.
- Local proof: `pnpm test src/agents/tools/request-compaction-tool.test.ts src/agents/openclaw-tools.request-compaction.test.ts`, `pnpm tsgo`, `pnpm check:test-types`, targeted `run-oxlint`, targeted `oxfmt --check`, and `git diff --check`.

## checkpoint: draft PR + CI

- 2026-05-08 20:13 PDT: opened draft PR https://github.com/karmaterminal/openclaw/pull/613 against `main`.
- PR body closes #611 and documents why raising the cap was chosen over documenting the old cap or adding a `notes_path` contract.
- Dispatched bootstrap CI with `event_type=openclaw-ci` for head SHA `b94c585366d8cc1de0dc7d7ad43ce9658b107d71`.
