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
