# v2026.4.12 Continuation Transplant Plan

Date: 2026-04-13

Status: plan only, do not execute tonight

Target release: `v2026.4.12` (`1c0672b74f`)

Current feature branch: `flesh_beast_figs/20260411-fixup`

Relevant merge-base:

- `flesh_beast_figs/20260411-fixup` vs `v2026.4.12`: `5543925cd2`

## Why Move To `v2026.4.12`

Observed today on Elliott:

- reproducible boot-time event-loop stall: about `4.2s` to `4.5s`
- startup RSS spike: about `915MB` to `1030MB`
- startup CPU profile points at plugin loader / Jiti alias / manifest work, not continuation runtime itself

Relevant upstream `v2026.4.12` changes:

- plugin load narrowing:
  - `a9c7c2e1ed` `feat(plugins): narrow CLI loading via activation planning (#65120)`
  - `12db6dfc8d` `feat(plugins): narrow explicit provider loads from manifests (#65259)`
  - `6a189eec0b` `fix(plugins): centralize explicit plugin scope handling (#65298)`
  - `b7b3846793` `feat(plugins): narrow channel loads from manifests (#65429)`
  - `0fd9aa8e00` `refactor(plugins): centralize manifest owner trust policy (#65459)`
- gateway startup/runtime sequencing:
  - `92776b8d77` `fix(gateway): defer cron AND heartbeat activation until sidecars are ready (#65322)`
  - `6a7961736a` `fix: defer gateway scheduled services (#65365)`
  - `19d8069aea` `fix: lazy-start gateway mcp loopback`
  - `645c7b1897` `fix: harden qmd service startup`
- Discord cleanup:
  - `7995e408ce` `fix(discord): clear stale heartbeat timers in SafeGatewayPlugin.connect() (#65087)`

Conclusion:

- `v2026.4.12` is the correct next base.
- We should treat the move as a controlled transplant, not a blind rebase.

## Dry-Run Findings

Branch-only commits over `v2026.4.12`:

- `ee42ff157f` `feat: transplant context-pressure-aware continuation onto v2026.4.11`
- `479ace368b` `fix: semantic port for upstream v2026.4.11 refactors`
- `80e1c44b6a` `fix: resolve compact runner compile drift on v2026.4.11`
- `dae1ee53ef` `fix: restore v2026.4.11 boundary adjustments and build-green carry`
- `e8dcccbdcf` `fix: expose continue_delegate tool on all continuation-enabled turns`
- `817e892d57` `fix: resolve key normalization divergence in post-compaction delegate paths (#413)`
- `fc64f80ef8` `fix: normalize session key in context-pressure band persistence (sibling of #413)`
- `fcd4c36d28` `fix: normalize all remaining raw store[sessionKey] sites (sweep for #413 family)`
- `d300eafbf4` `fix: port Discord reconnect stall watchdog from upstream (addresses #415/#416)`
- `b13a2bab3b` `fix(#414): complete raw-key sweep — session-reset-model + session-updates + store.runtime`
- `ba5d04dc57` `Agents: fix continuation retention and stream hot paths`
- `9e7417c938` `Chore: remove WO0424 temp notes`

Dry-run replay result:

- first replayed commit `ee42ff157f` conflicts immediately
- first hard conflicts:
  - `src/auto-reply/reply/agent-runner.ts`
  - `src/auto-reply/reply/commands-status.ts`

This is manageable, but it means the port starts in the hottest continuation files.

Transplant commit overlap against upstream `v2026.4.12`:

- `ee42ff157f`: 81 touched files, 25 overlap with upstream `v2026.4.12`
- `dae1ee53ef`: 23 touched files, 6 overlap
- `ba5d04dc57`: 21 touched files, 4 overlap
- `fcd4c36d28`: 2 touched files, 2 overlap

## Source Commit Disposition

Keep as real semantic deltas:

- `ee42ff157f`
- `e8dcccbdcf`
- `817e892d57`
- `fc64f80ef8`
- `fcd4c36d28`
- `b13a2bab3b`
- `ba5d04dc57`

Rework or inline, do not replay blindly:

- `479ace368b`
- `80e1c44b6a`
- `dae1ee53ef`
- `d300eafbf4`

Drop:

- `9e7417c938`

Notes:

- `d300eafbf4` must be compared against upstream `7995e408ce` before any carry-forward
- `ba5d04dc57` must be preserved; it contains the real WO0424 fixes

## RFC Invariants To Preserve

Use `docs/design/continue-work-signal-v2.md` as the ambiguity guide when wiring looks unclear.

Non-negotiable invariants:

- `continue_work()`, `continue_delegate()`, and `request_compaction()` are one system
- tool path and response-token path converge on shared continuation machinery
- same-session continuation and delegated continuation share chain accounting
- generation-drift cancellation is a safety guard, not incidental behavior
- structured continuation wake classification matters; delegate-return must stay distinguishable from ordinary inbound traffic
- spawned subagents and main sessions consume continuation differently
- post-compaction delegates remain staged and are released through the compaction lifecycle
- `taskFlowDelegates` is optional durable backing, not the semantic core

## Hot Files For Manual Integration

Expect careful manual work in:

- `src/auto-reply/reply/agent-runner.ts`
- `src/auto-reply/reply/get-reply-run.ts`
- `src/auto-reply/reply/get-reply.ts`
- `src/auto-reply/reply/commands-status.ts`
- `src/agents/subagent-announce.ts`
- `src/agents/openclaw-tools.ts`
- `src/agents/pi-embedded-runner/run.ts`
- `src/agents/pi-embedded-runner/run/attempt.ts`
- `src/config/types.agent-defaults.ts`
- `src/config/zod-schema.agent-defaults.ts`
- `src/infra/heartbeat-runner.ts`
- `src/gateway/server-methods/agent.ts`

Secondary surfaces:

- `src/auto-reply/continuation-delegate-store.ts`
- `src/agents/tools/request-compaction-tool.ts`
- `src/config/sessions/store-cache.ts`
- `src/config/sessions/store-load.ts`
- `src/config/sessions/store.ts`
- `src/agents/pi-embedded-subscribe.handlers.messages.ts`

## Recommended Execution Shape

Do not run:

- `git rebase`
- `git cherry-pick` the entire current stack blindly

Do run:

1. Create a fresh branch from `v2026.4.12`.
2. Transplant by semantic area.
3. Resolve the continuation core files manually against the new base.
4. Reapply WO0424 fixes after the feature core is stable.
5. Validate against the continuation test matrix before pushing.

## Proposed New Commit Sequence

### Commit 1

`feat(continuation): port core continuation runtime onto v2026.4.12`

Primary source:

- `ee42ff157f`

Scope:

- response-token parsing integration
- continuation runtime config
- `agent-runner` core continuation logic
- `get-reply-run` and `get-reply` wiring
- system-event / heartbeat integration
- agent config schema and types

Expected manual conflict focus:

- `src/auto-reply/reply/agent-runner.ts`
- `src/auto-reply/reply/get-reply-run.ts`
- `src/auto-reply/reply/commands-status.ts`
- `src/infra/heartbeat-runner.ts`
- `src/gateway/server-methods/agent.ts`

### Commit 2

`feat(continuation): port delegate dispatch, announce flow, and continuation tools`

Primary source:

- `ee42ff157f`
- useful pieces from `479ace368b`

Scope:

- `continue_delegate` tool
- `continue_work` tool
- delegate queueing and delayed reservations
- announce path and parent-root topology
- subagent continuation integration

Expected manual conflict focus:

- `src/agents/subagent-announce.ts`
- `src/agents/openclaw-tools.ts`
- `src/agents/subagent-spawn.ts`
- `src/agents/subagent-registry*.ts`

### Commit 3

`feat(continuation): port context-pressure and request_compaction`

Primary source:

- `ee42ff157f`

Scope:

- context-pressure runtime
- `request_compaction` tool
- compaction status / integration paths
- related tests

Expected manual conflict focus:

- `src/agents/tools/request-compaction-tool.ts`
- `src/auto-reply/reply/context-pressure.ts`
- `src/auto-reply/tokens.ts`

### Commit 4

`fix(continuation): expose continue_delegate on all continuation-enabled turns`

Primary source:

- `e8dcccbdcf`

Scope:

- carry forward as a clean follow-up after core tool registration lands

### Commit 5

`fix(continuation): port #413 session-key normalization follow-ups`

Primary source:

- `817e892d57`
- `fc64f80ef8`
- `fcd4c36d28`

Scope:

- normalize key handling in post-compaction and related continuation paths

Expected manual conflict focus:

- `src/auto-reply/reply/agent-runner.ts`
- `src/auto-reply/reply/session.ts`

### Commit 6

`fix(continuation): port #414 raw-key sweep`

Primary source:

- `b13a2bab3b`

Scope:

- session-reset-model
- session-updates
- store runtime sweep

### Commit 7

`fix(continuation): port WO0424 retention and stream hot-path fixes`

Primary source:

- `ba5d04dc57`

Scope:

- restore structured continuation wake handling
- bound continuation volatile state
- finish delegate-pending lifecycle through the structured wake path
- physical delayed-timer disposal
- request_compaction guard cleanup
- session-store duplicate serialized retention fix
- incremental streamed visible-buffer handling

Expected manual conflict focus:

- `src/auto-reply/reply/agent-runner.ts`
- `src/auto-reply/reply/get-reply-run.ts`
- `src/agents/subagent-announce.ts`
- `src/agents/pi-embedded-subscribe.handlers.messages.ts`
- `src/config/sessions/store-cache.ts`

### Commit 8

`docs(continuation): restore design docs if still wanted`

Primary source:

- `ee42ff157f`

Scope:

- docs only, optional last commit

## Explicit Non-Goals For Tomorrow

Do not carry tonight's local exploratory startup-cache patch into this transplant automatically.

Those uncommitted local changes were host-triage experiments around:

- `src/plugins/sdk-alias.ts`
- `src/plugins/loader.ts`
- `src/plugins/source-loader.ts`
- `src/plugins/jiti-loader-cache.ts`
- `src/infra/openclaw-root.ts`

First validate whether `v2026.4.12` plugin-load narrowing reduces Elliott's startup stall on its own before deciding whether any of that local patching is still needed.

## Continuation Validation Matrix

Run these after the transplant. This is the minimum continuation feature matrix.

F1. Tool registration and prompt gating

- continuation tools appear only when `continuation.enabled: true`
- fallback syntax remains available when tools are absent
- suggested coverage:
  - `src/agents/tools/continuation-tools-registration.test.ts`

F2. Same-session continuation scheduling

- `continue_work()` and `CONTINUE_WORK(:N)` schedule the next turn correctly
- silent continuation stays silent
- suggested coverage:
  - `src/auto-reply/reply/agent-runner.misc.runreplyagent.test.ts`

F3. Delegate modes and return semantics

- `normal`
- `silent`
- `silent-wake`
- `post-compaction`
- suggested coverage:
  - `src/agents/subagent-announce.continuation.test.ts`

F4. Structured delegate-return wake handling

- `continuationTrigger` is consumed
- delegate-pending lifecycle clears on processed delegate return
- no accidental reintroduction of write-only state
- suggested coverage:
  - `src/auto-reply/reply/get-reply-run.media-only.test.ts`
  - `src/auto-reply/reply/agent-runner.misc.runreplyagent.test.ts`

F5. Chain guards and delayed reservations

- generation drift cancels correctly
- delayed reservations are physically disposed
- no orphaned delayed state after supersession
- suggested coverage:
  - `src/agents/subagent-announce.chain-guard.test.ts`

F6. Context-pressure and compaction path

- pressure event fires in correct bands
- `request_compaction()` guard behavior preserved
- post-compaction delegate release preserved
- suggested coverage:
  - `src/agents/tools/request-compaction-tool.test.ts`
  - `src/auto-reply/reply/context-pressure.test.ts`

F7. #413 and #414 normalization fixes

- raw-key regressions do not return
- session-reset and post-compaction paths stay normalized
- suggested coverage:
  - impacted session-store and reply tests around the transplant surfaces

F8. WO0424 fixes

- `continuationGenerations` bounded
- delegate-pending lifecycle not write-only
- duplicate serialized session-store retention removed
- streamed visible-text path remains incremental and correct
- suggested coverage:
  - `src/config/sessions.cache.test.ts`
  - `src/config/sessions/sessions.test.ts`
  - `src/agents/pi-embedded-subscribe.handlers.messages.test.ts`

## Verification Gates

Minimum gates after the transplant:

- targeted continuation matrix above
- `pnpm build`
- `pnpm check`

Strongly preferred if the tree is stable enough:

- broader `pnpm test` before deployment to fleet

## Timing Recommendation

Do not execute tonight.

Reason:

- the current fleet just deployed `ba5d04dc57`
- the continuation / memory / startup situation is still soaking
- the port is feasible, but it is not low-attention work

Tomorrow's job:

- fresh branch from `v2026.4.12`
- controlled transplant by semantic area
- validate against F1-F8
- then decide whether the local startup-cache experiment is still needed after upstream plugin narrowing
