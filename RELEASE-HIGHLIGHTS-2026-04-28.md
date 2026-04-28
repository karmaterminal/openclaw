# RELEASE-HIGHLIGHTS-2026-04-28

*Temporary sync doc for Swim 37 release-surface enumeration. Seeded from Cael's draft; intended as the single convergence point for commit-delta, #56 cross-walk, config bits, and swim-case / RFC-appendix mapping.*

## Seed surface axes

### 1) Core continuation surface landed
- `continue_work`
- `continue_delegate`
- `request_compaction`
- post-compaction relay / handoff path
- context-pressure-triggered compaction path

**Integration shape to cover:** primitive invocation, delayed wake, silent / silent-wake behavior, post-compaction return, resumption quality after wake.

### 2) Drain / eligibility logic changed
- `continue_delegate` moved to **default-allow** behavior
- explicit non-drainers block it; normal drainers should pass
- related truth-table tests were added

**Integration shape to cover:** delegates allowed in ordinary turns, blocked only on explicit non-draining surfaces, no false negatives on valid callers.

### 3) Descriptor / routing surface expanded
- multi-recipient delegate descriptor work landed
- `targetSessionKey` added to `continue_delegate`
- session-delivery queue metadata/payload union extended

**Integration shape to cover:** return routing, queue delivery, multi-recipient / cross-session descriptor behavior, no dropped or misrouted returns.

### 4) Volitional compaction plumbing changed
- provider + model now plumbed into volitional compaction call
- compaction path is now part of the continuation surface, not just ambient runtime behavior

**Integration shape to cover:** request-compaction from active session, correct model/provider continuity, post-compaction wake integrity.

### 5) OTEL / traceability surface expanded
- DiagnosticTraceContext / continuation trace threading work landed
- `continuation.*` / queue-related spans are expected evidence surfaces
- chain attributes like `chain.id` / remaining budget are part of the contract being pinned

**Integration shape to cover:** traces emitted on real in-vivo runs, root/delegate correlation preserved, evidence usable for RFC appendix.

### 6) Config surface changed
- continuation config lives under `agents.defaults.continuation`
- relevant live knobs include enablement, delay bounds, chain length, delegate cap, cost cap, context-pressure threshold
- old `generationGuardTolerance` references are stale and should not drive testing

**Integration shape to cover:** enabled path, sane behavior with configured delays/caps, bad stale-key assumptions removed from docs/runbooks.

### 7) Bracket fallback remains required
- tools-first is canon
- bracket syntax still must work for tool-disabled environments

**Integration shape to cover:**
- `CONTINUE_WORK`
- `CONTINUE_WORK:N`
- `[[CONTINUE_DELEGATE: ... +Ns | silent-wake]]`
- bracket misplacement / mid-prose non-parse behavior
- tool + bracket same turn precedence

### 8) Swim-37 harness / scaffold exists but is not the live swim
- vitest scaffold PR #370 pins harness contract and trap classes
- static board is green-floor / scaffold territory, not substitute for live SEAL-BOY swim

**Integration shape to cover:** live gateway behavior on deployed cohort, not just mocked or harnessed behavior.

## Candidate Swim-37 axes derived from the release
- Primitive axis: `continue_work` / `continue_delegate` / `request_compaction`
- Return-mode axis: normal / silent / silent-wake / post-compaction
- Routing axis: parent return, cross-session routing, multi-recipient / echo-like cases
- Chain axis: depth, fan-out, return-to-root behavior
- Config axis: enabled / bounded delays / chain-cap / OTEL configured vs absent
- Bracket-fallback axis: tool-disabled equivalents
- In-vivo-emulation axis: natural user patterns under pressure, delayed check-ins, parallel enrichment, mid-prose returns

## Immediate doc gaps noticed while drafting
- No single upstream-style changelog currently enumerates the above.
- SWIM docs still contain stale `operator` language and stale `generationGuardTolerance` references.
- Swim-37 case board should explicitly add:
  - chain returns to root
  - echo / multi-channel or multi-recipient return behavior
  - bracket fallback twins for each primitive

## Contrib slots
- 🌻 commit-delta-by-feature
- 🌫 #56 cross-walk + config-bits + uncovered TC list
- 🌊 merge + swim-37 case-stub per highlight + RFC-appendix slot
- 🩸 seed / surface backbone

---

# 🌫 Silas sections — #56 cross-walk + config-bits + uncovered TC list

> Companion to Elliott 🌻's commit-delta walk on `feature/context-pressure-squashed`.
> Owner: 🌫. Generated 2026-04-28 from project #56 board JSON + canonical2 (`origin/cael/325-canonical2`) byte-walk.
> Substrate baselines used:
> - **Old release floor:** `v2026.4.21` (last upstream tag pulled into `feature/context-pressure-squashed` lineage)
> - **New target base:** `karmaterminal-2026.4.24-base` = `cbcfdf62c7297bda66009ea7476f053c3e9addab` (upstream openclaw v2026.4.24)
> - **Working canonical for v2026.4.24-uptake:** `origin/cael/325-canonical2`

---

## (A) Project #56 closed-items cross-walk

Project board: `karmaterminal/openclaw` project **#56** — *2026.4.24 frond release track*. 22 items total. Status counts: **11 Done**, 1 prince_review (#335), 4 in_coding_agent (#325, #331, #333, #352→Done? actually prince_review per latest), 4 Todo (#323 #332 #334 #365), 1 In Progress (#324 swim-37).

### Done since the v2026.4.21 floor

| # | Title (1-line) | Feature element | Swim-37 case suggestion |
|---|----------------|-----------------|-------------------------|
| **#326** | Savegame branch convention (`-recompose-YYYYMMDD`); no force-push, one per cycle | release process / discoverability | NOT a runtime case — promote to release-checklist enforcement (CI lint that next squash has a sibling savegame) |
| **#327** | Parallel rebase candidate lane — Claude Opus 4.7 (`frond-scribe/20260424/candidate-claude`); savegame frozen | rebase substrate / multi-walker validation | Already exercised by #331 trap-class doc; no new swim case needed |
| **#328** | Parallel rebase candidate lane — gpt-5.5 xhigh (`candidate-gpt`); savegame frozen | rebase substrate / cross-model validation | Same as #327 |
| **#329** | Cael lane (`flesh_beast_figs/20260424-claude`) rebase tracking — 49-commit replay set, conflict policy | rebase substrate / canonical track | Promoted to `cael/325-canonical2` which is the working base; covered indirectly by every swim case running on canonical2 |
| **#336** | Trigger-propagation surface tracker (was: copilot v2.5 assist lane) — Surfaces 1+2 descriptor draft | continuation tool descriptor / publish-subscribe RFC | Add **TC-trigger-propagation**: descriptor lists targetSessionKey + carries bc#11 conditional-voice; assert prince loud-failure on (b)-shape pre-runtime |
| **#337** | Delegate-drain surface tracker (was: claude2 v2.5 assist lane) — same Surfaces 1+2 from a second model family | continuation tool descriptor / cross-walker | Subsumed by #336 case |
| **#338** | docs+descriptor PR for Surfaces 1+2 substrate-naming + `docs/design/continuation-integration.md` landing | descriptor / RFC doc | Assert `continue_delegate` tool description contains substrate-naming line + bc#11 cross-link (regression guard) |
| **#341** | Draft: revive canonical v24-uptake lane (#325) — produced `cael/325-canonical2` | rebase substrate | Implicit: every other swim-37 case on canonical2 covers this |
| **#344** | Substrate-adoption-rule lint mechanization (capability-registry + PR-time lint) | substrate discipline / CI | Add **TC-substrate-lint**: assert PR adding new persistence path triggers capability-registry warning if not registered |
| **bootstrap#704** | Runbook follow-up: turn-cycle taxonomy table + parent-death-expected scoping | dispatch / runbook | Out-of-scope for openclaw swim-37 (bootstrap-side); cover via runbook-self-test |
| **bootstrap#705** | OTEL traces for princes — ansible env-injection + plugin enable + tailnet reach | OTEL transport / fleet observability | Add **TC-OTEL-bootstrap**: post-deploy assert otel-collector receives spans from each prince with `prince.name=` resource attr; HTTP/Protobuf only (rejects gRPC) |

### Open / In-flight (not Done) — relevant for swim-37 coverage

| # | Status | Title (1-line) | Feature element |
|---|--------|----------------|-----------------|
| #323 | Todo | "2026.04.24 - initial analysis" stub | meta — no swim case |
| #324 | In Progress | swim-37 master matrix (Ronan's PR #370) | THIS — the matrix being filled |
| #325 | in_coding_agent | Root rebase lane | substrate (canonical2) |
| #331 | in_coding_agent | swim-37 trap-class: parallel-evolution / cherry-false-negative | swim-37 trap taxonomy |
| #332 | **Todo** | session-delivery-queue (#70780) integration: post-compaction delegate release on v24 base | **post-compaction / lich** |
| #333 | in_coding_agent | v22→v24 upstream surface — describe, weigh hooks | hooks survey |
| #334 | **Todo** | OTEL chain-correlation: propagate `DiagnosticTraceContext` through delegate scheduling | **OTEL spans / continuation** |
| #335 | prince_review | RFC updates owed for v24 capability uptake | docs |
| #352 | prince_review | gpt2 path-b parallel — chain-budget extraction insurance | continuation / chain-budget |
| #365 | **Todo** | Purge `taskFlowDelegates` opt-in gate (TaskFlow is unconditional substrate) | **continuation / config-bit removal** |
| bootstrap#718 | In Progress | Sovereign snapshot autorun lane | sovereigns / out-of-scope |

### Cross-reference against Ronan's #324 / PR #370 master matrix

Ronan's matrix (17 cases: H1-H3, C1-C4, S1-S2, D1-D4, P1, K1, M1-M2) covers heartbeat (H), continuation/restart (C1-C4), session config (S), discord (D), copilot header (P1), SDK removal (K1), and media/cron (M). It does **NOT** explicitly cover the following items closed/in-flight on project #56:

#### **Uncovered (load-bearing) — figs's earlier prompt anchors:**

1. **Chain-returns-to-root** — figs explicitly asked for this. No case in #324. The semantics: a depth-N delegate completing returns enrichment to the chain's root session, not its immediate parent. Anchors: #334 (DiagnosticTraceContext propagation), #352 (chain-budget). **Add as TC-chain-root-return.**
2. **Echo-to-multiple-channels** — figs explicitly asked. No case in #324. Semantics: a single agent reply emitted to >1 destination (e.g. cron output to discord + memory write + delegate enqueue) preserves ordering and dedup keys. Anchors: D2 (#71406 dedupe) is adjacent but doesn't cover the multi-channel echo path. **Add as TC-multi-channel-echo.**

#### **Uncovered (substrate axis):**

3. **OTEL chain-correlation** (#334) — Ronan's matrix has zero OTEL cases. With the canonical2 `diagnostics.otel.*` config block live and bootstrap#705 wiring princes to Elliott's collector, swim-37 must verify spans arrive AND that `chain.id` / `chain.step.remaining` propagate across `enqueueSystemEvent` / `enqueueSessionDelivery`. **Add TC-otel-chain-correlation** (covers #334 + #366 slice-2 work + bootstrap#705 fleet wiring).
4. **session-delivery-queue post-compaction handoff** (#332) — Ronan's C-block is restart-continuation, not the new SQLite-backed `enqueueSessionDelivery` substrate switch. Post-compaction delegate release through the new queue (vs old `enqueueSystemEvent`) needs a dedicated case. **Add TC-sdq-postcompact** — verify exactly-once delivery across gateway restart with post-compaction shard staged.
5. **`taskFlowDelegates` gate purge** (#365) — config-bit removal in flight. Swim should verify both states (gate-on legacy and gate-off post-purge) behave identically before the gate code disappears. **Add TC-taskflow-unconditional**.
6. **`generationGuardTolerance` REMOVAL** — RFC L598/L850 strikes the field but it still exists in `feature/context-pressure-squashed` (line 304 `types.agent-defaults.ts`). canonical2 has already removed it from both types and zod schema. Swim-37 must assert that delayed delegates in noisy channels still survive WITHOUT the tolerance knob (whatever the new mechanism is — likely the chain-budget from #352). **Add TC-no-genguard** — fire delayed delegate, generate inbound traffic, assert delegate still fires.
7. **`continue_delegate.targetSessionKey?` descriptor** (#336/#338) — descriptor-only landed, runtime stubbed with loud-failure. Swim case must assert (a) descriptor lists the field and (b) runtime use throws "not yet implemented" rather than silently dropping. **Add TC-target-session-key-stub.**
8. **Substrate-adoption-rule lint** (#344) — descriptor lives in CI, not at runtime. Promote as a release-gate check, not a swim case (already satisfied by the lint itself).

#### **Already covered or subsumed:**

- Heartbeat-prompt suppression (#69079/#69278) → H1 ✓
- Restart-continuation queue (#70780) → C1 (matches #332's substrate but not the post-compaction integration angle) ⚠️ partial
- SDK breaking change (`registerEmbeddedExtensionFactory`) → K1 ✓
- Manual `/compact` `keepRecentTokens` → C4 ✓
- gpt-5.5 context budget (272K/400K) → S2 ✓

**Headline gap: 8 uncovered swim-cases** — the two figs-prompted ones (chain-root-return, multi-channel-echo) plus six substrate/config-bit cases that fall out of the v24 uptake. All eight are filable as additions to PR #370 without disturbing existing case IDs.

---

## (B) Config-bits enumeration — `feature/context-pressure-squashed` and `cael/325-canonical2`

Walked: `src/config/types.agent-defaults.ts`, `src/config/zod-schema.agent-defaults.ts`, `src/config/types.base.ts`, `src/config/zod-schema.ts`, `src/config/schema.help.ts`, `src/config/schema.labels.ts` across both branches. Diff focus: keys added or removed in the v22→v24 + feature-squash window.

### B.1 — `agents.defaults.continuation.*` (the continuation feature surface)

Path stem: `agents.defaults.continuation`. Strict object (additional keys rejected). Optional throughout — block omitted = feature off.

| Key | Type | Default | Controls | Required for feature? | Swim-37 case suggestion |
|-----|------|---------|----------|-----------------------|-------------------------|
| `.enabled` | boolean | `false` | Master switch for `continue_work` / `continue_delegate` / `request_compaction` tools and CONTINUE_WORK signal handling | YES — feature is no-op when unset/false | TC-continuation-default-off: with key omitted, assert tools absent from agent surface |
| `.taskFlowDelegates` | boolean | `false` | Opt-in to TaskFlow-backed delegate store (SQLite, cancel/retry). **#365 wants this purged** — TaskFlow becomes unconditional substrate | NO (transitional) | TC-taskflow-unconditional: assert behavior identical with key set true vs key absent (pre-purge); post-purge, assert key rejected by strict zod |
| `.defaultDelayMs` | number (positive int) | unset (resolved at use-site) | Default `delaySeconds` for delegates/work without explicit delay | NO — sane fallback | TC-delay-default: omit key, fire `continue_work` without delaySeconds, assert reasonable default |
| `.minDelayMs` | number (positive int) | unset | Lower clamp on requested delays | NO | TC-delay-clamp-min: assert `delaySeconds=0` clamps to min when set |
| `.maxDelayMs` | number (positive int) | unset | Upper clamp on requested delays | NO | TC-delay-clamp-max: assert `delaySeconds=99999` clamps to max when set |
| `.maxChainLength` | number (positive int) | `10` (per chain-guard tests) | Hard cap on total hops in a continuation chain (announce-side enforced) | NO — sane default | TC-chain-cap: drive chain to max+1, assert announce-side rejection with structured reason |
| `.costCapTokens` | number (nonnegative int) | unset (no cap) | Token budget across a chain; over-cap halts further hops | NO | TC-cost-cap: set low cap, drive chain, assert halt with cost-exceeded reason |
| `.maxDelegatesPerTurn` | number (positive int) | `5` | Max `continue_delegate` tool calls per agent turn | NO — sane default | Already covered partly by existing tests; add TC-delegate-fanout-cap: assert 6th call returns structured rejection |
| `.contextPressureThreshold` | number (`gt(0)`, `max(1)`) | unset (disabled) | Token-fraction at which `[system:context-pressure]` event injects pre-run | NO — feature opt-in | TC-context-pressure-fire: set 0.8, drive session past threshold, assert event injection on next turn; TC-context-pressure-zero-rejected: assert zod rejects 0 with documented error message |
| ~~`.generationGuardTolerance`~~ | ~~number (nonnegative int)~~ | **REMOVED in canonical2** (still present at L304 of `feature/context-pressure-squashed:types.agent-defaults.ts` and L203 of `zod-schema.agent-defaults.ts`) | **WAS:** drift tolerance for the generation-guard cancelling delayed timers in noisy channels | N/A — removed | **TC-no-genguard (figs-flagged):** with the field gone from canonical2, fire delayed delegate (e.g. 30s) in a channel receiving inbound noise; assert delegate STILL FIRES (mechanism replacement, not just removal). RFC L598/L850 strikes; verify behavior. |

**Headline removed bit:** `generationGuardTolerance` is gone from `cael/325-canonical2` (both `types.agent-defaults.ts` and `zod-schema.agent-defaults.ts` — confirmed via byte-walk 2026-04-28). The squashed feature branch still references it in 8+ test files (`subagent-announce.chain-guard.test.ts`, `subagent-announce.continuation.test.ts`, `agent-runner.misc.runreplyagent.test.ts`, `continue-delegate-tool.ts`). **Test cleanup required as part of swim-37 / #365 follow-up.** RFC L598/L850 mark the strike but the test-side burn-down is the open work.

### B.2 — `diagnostics.otel.*` (OTEL plugin substrate, NEW v24)

Path stem: `diagnostics.otel`. Strict object. NEW in v2026.4.24 release window (substrate from upstream PRs `bcdacfa1b3` / `f8573fe9c2` / `4630ce3d9e` / `56eb1ffabf`). Plugin opt-in (default-off per #12 invisibility).

| Key | Type | Default | Controls | Required for feature? | Swim-37 case suggestion |
|-----|------|---------|----------|-----------------------|-------------------------|
| `.enabled` | boolean | `false` | Master switch for OTLP exporter SDK init | YES — exports off when unset | TC-otel-default-off: assert no OTLP traffic with key absent |
| `.endpoint` | string | unset | OTLP collector endpoint (per W3C) | YES when enabled | TC-otel-endpoint-required: enable without endpoint, assert structured warning |
| `.protocol` | `"http/protobuf"` \| `"grpc"` | `"http/protobuf"` (gateway hard-coded gate at `extensions/diagnostics-otel/src/service.ts:389-391`) | Wire format. **gRPC is REJECTED with warning, no fallback** | YES | TC-otel-protocol-grpc-rejected: set `"grpc"`, assert startup warning + exporter NOT initialized |
| `.headers` | record(string, string) | unset | Auth headers for collector | NO | TC-otel-headers: set, assert outgoing requests carry them |
| `.serviceName` | string | unset (defaults to `"openclaw-gateway"`) | OTEL `service.name` resource attr | NO | TC-otel-service-name-default: assert default value when unset |
| `.traces` | boolean | `true` when block enabled | Toggle traces signal | NO | TC-otel-traces-toggle |
| `.metrics` | boolean | `true` when block enabled | Toggle metrics signal | NO | (lower priority) |
| `.logs` | boolean | `true` when block enabled | Toggle logs signal | NO | (lower priority) |
| `.sampleRate` | number (0..1) | `1.0` | ParentBased+TraceIdRatio sampler arg | NO | TC-otel-sampling: set 0.0, assert no spans exported |
| `.flushIntervalMs` | number (nonneg int) | unset (SDK default) | BatchSpanProcessor flush interval | NO | (lower priority) |
| `.captureContent` | boolean \| object{`enabled?`, `inputMessages?`, `outputMessages?`, `toolInputs?`, `toolOutputs?`} | `false` (privacy default) | Whether to attach LLM I/O content to spans (policy-gated per-key redaction in canonical2; not in squashed branch) | NO — privacy default-off | TC-otel-capture-content-redaction: enable with redaction policy, assert sensitive keys redacted |

**OTEL collector endpoint shape (per bootstrap#705):** Princes export to `http://elliott:4318` (otel-collector OTLP HTTP listener on Elliott's LGTM stack). HTTP/Protobuf only — gateway gate at `service.ts:389-391` rejects anything else without fallback. Standard env-injection for prince-side rigging:
- `OTEL_EXPORTER_OTLP_ENDPOINT=http://elliott:4318`
- `OTEL_EXPORTER_OTLP_PROTOCOL=http/protobuf`
- `OTEL_SERVICE_NAME=openclaw-{prince}`
- `OTEL_RESOURCE_ATTRIBUTES=prince.name={prince},service.instance.id={hostname},deployment.environment={env},service.version={commit-short-sha}`
- `OTEL_TRACES_SAMPLER=parentbased_traceidratio` + `OTEL_TRACES_SAMPLER_ARG=1.0`

**Tailnet reach required:** `4318/tcp` Elliott-from-other-princes. Reverse-proxy (if any) MUST pass `traceparent` + `tracestate` headers unmodified for chain-correlation (#334).

### B.3 — `agents.defaults.compaction.postCompactionSections` (related feature axis)

| Key | Type | Default | Controls | Required for feature? | Swim-37 case suggestion |
|-----|------|---------|----------|-----------------------|-------------------------|
| `agents.defaults.compaction.postCompactionSections` | string[] | `["Session Startup", "Red Lines"]` (when unset) | H2/H3 section names from AGENTS.md to inject after compaction; `[]` disables | NO — sane default | TC-postcompact-sections-default: assert default list when unset; TC-postcompact-sections-disable: set `[]`, assert no injection |

### B.4 — `agents.defaults.memorySearch.sync.sessions.postCompactionForce`

| Key | Type | Default | Controls | Required? | Swim-37 case suggestion |
|-----|------|---------|----------|-----------|-------------------------|
| `agents.defaults.memorySearch.sync.sessions.postCompactionForce` | boolean | unset (false) | Forces a session-memory sync immediately after compaction completes | NO | TC-memsync-postcompact: set true, assert sync fires on compaction completion |

### B.5 — `feedback_context_pressure_lifecycle` — NOT FOUND as a config key

Searched both branches: `feedback_context_pressure_lifecycle` does not appear as a config key, schema entry, or env var. It exists only as a memory file name (`memory/feedback_context_pressure_lifecycle.md`-ish referent in prince agent files). **Flag for the briefing-author**: if the swim-37 RFC mentions it as a config bit, that's a misnaming — the actual lifecycle config bits are the `.continuation.*` stack above (especially `.contextPressureThreshold` + `.maxChainLength` + `.maxDelegatesPerTurn`).

### B.6 — Headline config-bits that need swim cases

Ranked by load-bearing-ness for the v24 uptake:

1. **`agents.defaults.continuation.contextPressureThreshold`** — feature anchor; zod rejects 0 with documented error message; needs both fire and reject cases.
2. **`agents.defaults.continuation.generationGuardTolerance` REMOVAL** — substrate change with test-cleanup debt; figs-flagged via RFC L598/L850.
3. **`diagnostics.otel.protocol`** — HTTP/Protobuf hard-gate is silent-failure-prone (warning-only, no fallback); needs explicit reject case.
4. **`diagnostics.otel.captureContent` redaction policy** — privacy default-off but redaction-on-enable is the load-bearing surface for #335 RFC §Privacy.
5. **`agents.defaults.continuation.taskFlowDelegates`** — transitional gate (#365 will purge); needs identity case before purge to license the removal.
6. **`agents.defaults.continuation.maxChainLength` off-by-one** — canonical2 chain-guard tests show recent off-by-one fix (`>` not `>=`); pin behavior at boundary.

---

## Methodology / receipts

- **Project board source:** `gh project item-list 56 --owner karmaterminal --format json --limit 200` (2026-04-28T07:38 PDT, 22 items).
- **Squashed feature byte-walk:** `git --no-pager grep -nE` against `feature/context-pressure-squashed` for `continuation\.|generationGuardTolerance|otel|contextPressureThreshold|maxDelegatesPerTurn|maxChainLength|postCompactionSections` in `src/config/`.
- **Canonical2 byte-walk:** same against `origin/cael/325-canonical2` for delta confirmation.
- **#324 master matrix source:** project-board JSON body of issue #324 (Ronan's PR #370 description).
- **Local checkout:** `~/.openclaw-data/workspace/karmaterminal-openclaw` on `feature/context-pressure` (bare-mirror with all branches).

🌫

---

## 🌻 Commit-delta walk (E1–E10) — `karmaterminal-2026.4.24-base` → `7ba4b19e03`

**Methodology:** `git log --oneline karmaterminal-2026.4.24-base..HEAD` on canonical2 (74 commits); grouped by file path + commit-message prefix; cross-checked against `src/infra/continuation-tracer.ts` span-name list and `studies/swim-37/harness/README.md`. Footprint: ~132 files / ~15.4k insertions / ~446 deletions in `src/` + `test/` (excluding docs/i18n/generated). Full version with file-level evidence at `~/.openclaw/workspace/release-highlights/2026-04-28-frond-release.md` (Elliott's local; not committed here).

**Map to seed axes:** E1 → seed §1 · E2 → §5 · E3 → §3 (queue half) · E4 → §1+§5 substrate · E5 → §1 · E6 → §3 · E7 → §2 · E8 → §7 · E9 → §5 (rebase span) · E10 → §8.
**Map to 🌫 uncovered-TC list:** TC-chain-root-return / TC-multi-channel-echo / TC-target-session-key-stub → E6 · TC-otel-chain-correlation → E2 · TC-sdq-postcompact → E3.1 · TC-no-genguard → cross-cutting (see flag below) · TC-taskflow-unconditional → E1.4 area · TC-context-pressure-fire/zero-rejected → E1.4.

### E1 — Continuation core primitives
**Anchor:** `8ecf0c0b83 feat(continuation): core implementation`. Descriptor evolution: `14b3418e1f` → `eb0361d8dc` → `c99aa116f8` → `8f267807c0` → `69b4079aef` → `c4d779605c`.
**Files:** `src/auto-reply/reply/continuation-runtime.ts`, `continuation-state.ts`, `src/auto-reply/continuation-delegate-store.ts`.
**Cases:** E1.1 `continue_work(N)` end-to-end (verify `continuation.work` + `continuation.work.fire` + `chain.id` propagation); E1.2 `silent-wake` round-trip (verify `requestHeartbeatNow()` actually wakes); E1.3 `post-compaction` (verify shard arrives in *new* session, `continuation.compaction.released` once-per-seam); E1.4 `request_compaction()` rate-limit + ≥70% gating (subsumes 🌫 TC-context-pressure-fire/zero-rejected); E1.5 multi-call fan-out one-turn (3× `silent-wake`, no lost wakes — Swim 30 trap-class regression).

### E2 — OTEL chain-correlation surface (continuation-tracer)
**Anchor:** `d533d5c720` (Tracer surface), `2d10c1c218` (Slice 1), `19797e7fa6` (Slice 2 `chain.id` substrate), `3655b0667a` (`delegate.dispatch`), `4719e86345` (`disabled`), `6656138126` (per-turn cap reland), `e959d2c177` (`delegate.fire`), `47016eb417` (`work.fire`), `560948a70a` (`queue.drain`), `cd8b623be2` (`compaction.released`), `5e90c859b9` (`signal.kind` SSOT + `compaction.id`).
**Files:** `src/infra/continuation-tracer.ts` (~900 LOC) + `.test.ts` (1526 LOC).
**Span family (canonical):** `continuation.work`, `continuation.work.fire`, `continuation.delegate.dispatch`, `continuation.delegate.fire`, `continuation.queue.drain`, `continuation.queue.enqueue`, `continuation.compaction.released`, `continuation.disabled`, `heartbeat`. All carry `chain.id` (UUIDv7), `signal.kind` (SSOT enum), chain-budget attrs.
**Cases:** E2.1 end-to-end span trail (single chain emits `dispatch` → `fire` → parent `work.fire`, all share `chain.id`, parent–child via traceparent link **not** parent — RFC §6.6); E2.2 `continuation.disabled` with three distinct `disabled.reason` enum values (per-turn cap, cost cap, depth cap); E2.3 `queue.drain` once-per-cycle, `chain.ids[]` aggregate correct; E2.4 `compaction.released` once-per-seam (#332 Item B), `compaction.id` cross-cutting; E2.5 OTEL collector receives via diagnostics-otel endpoint (Elliott canary `http://elliott.dandelion.cult:4318`), trace tree reconstructable. Subsumes 🌫 TC-otel-chain-correlation.

### E3 — Session-delivery-queue substrate (durability)
**Anchor:** `b0bc4b4ee2` (TTL prune + queueDir soft-cap, #332), `8338d37bda` (taskHash whitespace canonicalization), `5b24433955` (payload union metadata).
**Files:** `src/infra/session-delivery-queue.ts`, `session-delivery-queue-storage.ts` (+204), `session-delivery-queue-recovery.ts` (new, 68).
**Cases:** E3.1 restart-survival = 🌫 TC-sdq-postcompact (delayed delegate, kill gateway pre-fire, restart, fire on schedule with original payload + `chain.id`); E3.2 idempotency (taskHash whitespace variation → single dispatch); E3.3 failed-TTL prune; E3.4 queueDir soft-cap enforcement (loud reject, no silent drop).
**Spec gap:** `session-delivery-queue.retry.cap` and `.backoffMs[]` documented in RFC §3.6 / §6.5 but **not yet hot-reloadable keys** — flag for swim plan.

### E4 — Chain-budget + substrate primitives
**Anchor:** `2d10c1c218` (Slice 1 chain-budget), `1870a84f32` (path-b extraction), `bd3033d740` (`requireSessionKeyOrSkip` #292), `96d1304d47` (substrate-adoption lint mechanization).
**Files:** `chain-budget.ts` (68), `secure-random.ts` (17), `session-keys.ts` (50), `substrate-capability-registry.ts` (134), `system-events.ts` (65), `test/scripts/check-substrate-adoption.test.ts` (124).
**Cases:** E4.1 UUIDv7 monotonicity within chain + collision under 100-delegate burst; E4.2 `declineToCarry()` blocks at `maxChainLength` with `disabled.reason="chain-length"` (boundary-pin: `>` vs `>=` per 🌫 D-cfg.maxChainLength-boundary); E4.3 `costCapTokens` enforcement mid-step with `disabled.reason="cost-cap"`.

### E5 — Heartbeat surface
**Anchor:** `30b06a984e` (wire `captureSwim("heartbeat")` against `emitContinuationHeartbeatSpan`), `1b84e71c95` (memo).
**Files:** `src/infra/heartbeat-reason.ts` (6), `heartbeat-runner.ts` (9 LOC change).
**Cases:** E5.1 `silent-wake` return → `requestHeartbeatNow()` → `heartbeat` span emits with continuation `chain.id`; E5.2 standalone heartbeat (no continuation context) emits cleanly with `continuation.disabled` attr.

### E6 — `targetSessionKey` (multi-recipient surface)
**Anchor:** `14b3418e1f` (descriptor), `eb0361d8dc` (rephrase), `6cdb079981` (ToolInputError refactor), `be76c3dc2b` (marked §4 proposed-pending #332).
**Files:** `src/auto-reply/continuation-delegate.types.ts`.
**Per RFC L149:** chain-returns-to-root is "natural extension … not yet exposed as a distinct mode" — implicit, not a flag.
**Cases:** E6.1 cross-session delivery (A→B); E6.2 chain-returns-to-root pattern (depth-3, leaf elects root target — test **observed-current** behavior, not design-target per RFC L149) = 🌫 TC-chain-root-return; E6.3 echo-to-multiple-channels (single dispatch + multi target — pending figs spec call X1: dual-delivery vs fan-out of multiple `continue_delegate`) = 🌫 TC-multi-channel-echo; E6.4 invalid `targetSessionKey` → `ToolInputError`, no zombie in queue = 🌫 TC-target-session-key-stub.

### E7 — Default-allow `continue_delegate` + drain gating
**Anchor:** `8f267807c0` (default-allow), `c99aa116f8` (gate + detailKeys sync), `69b4079aef` (truth-table pin).
**Cases:** E7.1 default-allow (vanilla agent succeeds without explicit opt-in); E7.2 explicit-block (`drainsContinuationDelegateQueue: false` → `continuation.disabled` span emits with reason).

### E8 — Bracket-syntax fallback
**Per RFC §2.6:** "Pick one. (Default: pick the tool.)"
**Cases (B-twins per E1):** B1 `CONTINUE_WORK` end-of-message arms timer; B2 `CONTINUE_WORK:N` honors delay; B3 `[[CONTINUE_DELEGATE: ... +Ns | silent-wake]]` dispatches with delay+mode; B4 bracket *mid-message* gets stripped, not parsed; B5 bracket + tool same turn → tool wins, bracket no-ops or warns (mode unsupported per Swim 8 finding).

### E9 — Rebase classification tracer
**Anchor:** `526540de15` (wire `captureClassify`), `148792a0b7` (validation + `signal.kind` rename per 🌫 #416 review), `0985182e87` (status-type cleanup).
**Files:** `src/rebase/tracer.ts` (161 LOC).
**Cases:** Covered by static harness vitest (10+17+21+18 tests across `rebase-classifier.test.ts`, `cherry-pick-provenance.test.ts`, `conflict-content-rubric.test.ts`, `changelog-grep.test.ts`) — satisfied static precheck.

### E10 — Swim-37 harness scaffold
**Anchor:** `953030d88f` (scaffold), `934a59bd30` (InMemorySpanRecorder shim).
**Files:** `studies/swim-37/harness/*` (15 files), `test/vitest/vitest.swim-37.config.ts`.
**Status:** 8 test files / 163 passing / 12 todo / 0 failed (Elliott local, head `7ba4b19e03`, 330ms).

## 🌻 Cross-cutting flags (corrections lifted into the seed)

- **TC-no-genguard correction (per 🌫 byte-check):** RFC §3.2 is **outright removal** of the cancel-on-channel-noise behavior, **not mechanism replacement**. `taskFlowDelegates` persistence is orthogonal. My earlier framing pointing 🌊 at §3.6 was wrong — pin §3.2 directly when the case lands. Test shape per 🌫: delayed delegate fires N seconds out, channel receives K unrelated messages in between, delegate still fires.
- **`generationGuardTolerance` cleanup-debt is phantom** (per 🌫 byte-check on `origin/feature/context-pressure-squashed` and `origin/cael/325-canonical2` — zero non-doc hits). Skip the hygiene issue.
- **`feedback_context_pressure_lifecycle` is not a config key** (per 🌫) — memory-file referent only. Real lifecycle config = the `agents.defaults.continuation.*` stack.
- **OTEL endpoint config** rides on diagnostics-otel layer: `diagnostics.otel.protocol` (HTTP/Protobuf hard-gate, gRPC silent-warning at `service.ts:389-391`, no fallback) + `diagnostics.otel.captureContent` (redaction policy per #335). No continuation-specific endpoint key in this release.
- **Frozen-branch contract:** All commit refs above are on canonical2 (`cael/325-canonical2`). `feature/context-pressure-squashed` reflects the same content at the squashed level but is FROZEN until swim sign-off.

— 🌻 (Elliott)

---

# 🌊 Merge editor pass — canonical case board + (c)/(d) columns

> Owner: 🌊 Ronan. Editor pass on top of fan-in stack: 🩸 seed (`c0bc590005`) → 🌫 §A/§B/uncovered (`f745b4954b`) → 🌻 E1–E10 (`be2e864509`).
> Purpose: collapse duplicate labels, lock canonical case IDs, attach (c) swim-37 case-stub + (d) RFC-appendix slot per highlight so #324 master matrix gets a one-to-one mapping.
> **Branch discipline:** `feature/context-pressure-squashed` REMAINS FROZEN. This doc lives on `cael/release-highlights-sync-2026-04-28`; PR-back to feature branch is figs/Cael's call post-cohort-signoff.

## Dedup decision (per 🌫 vote, ack'd 🩸)

🌻's E6.{1,2,3,4} are **canonical**. 🌫's earlier TC-* labels preserved as aliases only (sharper anchors live on E6 — RFC L149 implicit-not-flag caveat, X1 spec gap, ToolInputError shape).

### Alias table (TC-* → E6.x)

| 🌫 TC-* alias                | Canonical case | Anchor                                          |
|------------------------------|----------------|-------------------------------------------------|
| TC-chain-root-return         | **E6.2**       | RFC L149 — observed-current, not design-target  |
| TC-multi-channel-echo        | **E6.3**       | Pending figs X1 (dual-delivery vs fan-out)      |
| TC-target-session-key-stub   | **E6.4**       | `ToolInputError`, no zombie in queue            |

## Canonical case board

Columns: **(a) highlight**, **(b) feature anchor**, **(c) swim-37 case-stub**, **(d) RFC-appendix slot**.

| ID    | (a) Highlight                                      | (b) Anchor                                                  | (c) Swim-37 case-stub                                                                                                                                | (d) RFC appendix slot                  |
|-------|----------------------------------------------------|-------------------------------------------------------------|------------------------------------------------------------------------------------------------------------------------------------------------------|----------------------------------------|
| E1.1  | `continue_work(N)` end-to-end                      | `8ecf0c0b83`                                                | Drive `continue_work({delaySeconds:N})`; assert `continuation.work` + `continuation.work.fire` spans, `chain.id` propagates.                         | App-A §Primitives.work                 |
| E1.2  | `silent-wake` round-trip                           | `8ecf0c0b83` + `30b06a984e`                                 | Dispatch `silent-wake`; assert `requestHeartbeatNow()` actually wakes parent within window.                                                          | App-A §Primitives.silent-wake          |
| E1.3  | `post-compaction` shard release                    | `b0bc4b4ee2` (#332 Item B) + `cd8b623be2`                   | Stage post-compaction shard; force compaction; assert shard arrives in *new* session, `continuation.compaction.released` once-per-seam.              | App-A §Primitives.post-compaction      |
| E1.4  | `request_compaction()` rate-limit + ≥70% gating    | `8ecf0c0b83`                                                | Drive `request_compaction()` below threshold → reject; above + within rate-limit → accept; subsumes TC-context-pressure-fire / -zero-rejected.       | App-A §Primitives.request-compaction   |
| E1.5  | Multi-call fan-out one-turn                        | Swim-30 trap-class regression                               | 3× `silent-wake` in one turn; assert no lost wakes.                                                                                                  | App-A §Multi-call                      |
| E2.1  | OTEL chain trail (single-chain)                    | `d533d5c720` + `19797e7fa6` + `e959d2c177` + `47016eb417`   | End-to-end chain emits `dispatch` → `fire` → `work.fire`; same `chain.id`; parent-child via traceparent **link**, not parent (RFC §6.6).             | App-B §Tracer.chain-correlation        |
| E2.2  | `continuation.disabled` + reason enum              | `4719e86345`                                                | Trigger 3 distinct `disabled.reason` values (per-turn cap, cost cap, depth cap); each emits a span.                                                  | App-B §Tracer.disabled-reasons         |
| E2.3  | `queue.drain` once-per-cycle                       | `560948a70a`                                                | Drive multi-chain drain; assert `queue.drain` fires once, `chain.ids[]` aggregate correct.                                                           | App-B §Tracer.queue-drain              |
| E2.4  | `compaction.released` once-per-seam                | `cd8b623be2` (#332 Item B)                                  | Force compaction with shard staged; assert exactly-once span, `compaction.id` cross-cutting.                                                         | App-B §Tracer.compaction-seam          |
| E2.5  | OTEL collector receives                            | bootstrap#705 + diagnostics-otel                            | Post-deploy in-vivo: confirm `http://elliott:4318` receives spans w/ `prince.name=`, trace tree reconstructable.                                     | App-B §Transport.collector-receive     |
| E3.1  | SDQ restart-survival                               | `b0bc4b4ee2`                                                | Delayed delegate; kill gateway pre-fire; restart; assert fire on schedule + original payload + `chain.id`.                                           | App-C §SDQ.restart-survival            |
| E3.2  | SDQ idempotency (taskHash)                         | `8338d37bda`                                                | Whitespace variation in same task; assert single dispatch.                                                                                           | App-C §SDQ.idempotency                 |
| E3.3  | SDQ failed-TTL prune                               | `b0bc4b4ee2`                                                | Stale entries past TTL; assert prune cycle removes them.                                                                                             | App-C §SDQ.ttl-prune                   |
| E3.4  | SDQ queueDir soft-cap                              | `b0bc4b4ee2`                                                | Drive past soft-cap; assert loud reject, no silent drop.                                                                                             | App-C §SDQ.soft-cap                    |
| E4.1  | Chain-budget UUIDv7 monotonicity                   | `2d10c1c218` + `secure-random.ts`                           | 100-delegate burst; assert UUIDv7 monotonic + no collision within chain.                                                                             | App-D §ChainBudget.uuid                |
| E4.2  | `declineToCarry()` at `maxChainLength`             | `2d10c1c218`                                                | Drive chain to cap; assert `disabled.reason="chain-length"`; **boundary-pin** (`>` not `>=`) per 🌫 D-cfg.maxChainLength-boundary.                   | App-D §ChainBudget.length-cap          |
| E4.3  | `costCapTokens` mid-step enforcement               | `2d10c1c218`                                                | Set low cap; drive chain past mid-step; assert `disabled.reason="cost-cap"`.                                                                         | App-D §ChainBudget.cost-cap            |
| E5.1  | `silent-wake` → heartbeat with `chain.id`          | `30b06a984e`                                                | Wake via `silent-wake`; assert `heartbeat` span carries continuation `chain.id`.                                                                     | App-E §Heartbeat.continuation          |
| E5.2  | Standalone heartbeat (no continuation)             | `1b84e71c95`                                                | Plain heartbeat tick; assert clean span w/ `continuation.disabled` attr.                                                                             | App-E §Heartbeat.standalone            |
| **E6.1** | `targetSessionKey` cross-session delivery       | `14b3418e1f`                                                | A → B cross-session dispatch; assert delivery on B w/ correct payload + `chain.id`.                                                                  | App-F §Routing.cross-session           |
| **E6.2** | Chain-returns-to-root (was: TC-chain-root-return) | RFC L149                                                  | Depth-3 chain; leaf elects root target; test **observed-current** behavior (RFC L149: implicit, not design-flag). Pending figs C1 to confirm spec-or-current. | App-F §Routing.chain-to-root          |
| **E6.3** | Echo-to-multiple-channels (was: TC-multi-channel-echo) | `targetSessionKey` + multi-recipient descriptor       | Single dispatch + multi-target; assert ordering + dedup. **Pending figs X1**: dual-delivery vs fan-out semantics — case-stub conditional on call.    | App-F §Routing.multi-channel-echo      |
| **E6.4** | Invalid `targetSessionKey` → `ToolInputError` (was: TC-target-session-key-stub) | `6cdb079981`                          | Send invalid key; assert `ToolInputError`, no zombie in SDQ.                                                                                         | App-F §Routing.invalid-key             |
| **E6.5** | Descriptor-content regression guard (#336/#338)    | `14b3418e1f` + `6cdb079981`                                 | Snapshot `continue_delegate` tool-description JSON; assert substrate-naming line present + bc#11 cross-link + `targetSessionKey` listed. Catches descriptor-string drift independent of runtime path. | App-F §Routing.descriptor-content      |
| E7.1  | Default-allow `continue_delegate`                  | `8f267807c0`                                                | Vanilla agent w/o explicit opt-in; assert `continue_delegate` succeeds.                                                                              | App-G §Drain.default-allow             |
| E7.2  | Explicit-block via `drainsContinuationDelegateQueue: false` | `c99aa116f8`                                       | Set false; assert `continuation.disabled` span emits w/ reason.                                                                                      | App-G §Drain.explicit-block            |
| B1    | `CONTINUE_WORK` end-of-message arms timer          | RFC §2.6                                                    | Bracket at EOM; assert timer arms identically to tool-form.                                                                                          | App-H §Bracket.work                    |
| B2    | `CONTINUE_WORK:N` honors delay                     | RFC §2.6                                                    | Bracket w/ N; assert delay honored.                                                                                                                  | App-H §Bracket.work-delay              |
| B3    | `[[CONTINUE_DELEGATE: ... +Ns | silent-wake]]`     | RFC §2.6                                                    | Bracket dispatch; assert delegate w/ delay+mode equiv to tool-form.                                                                                  | App-H §Bracket.delegate                |
| B4    | Bracket mid-message stripped, not parsed           | RFC §2.6                                                    | Embed bracket mid-prose; assert stripped, no timer/delegate fired.                                                                                   | App-H §Bracket.position                |
| B5    | Bracket + tool same turn → tool wins               | Swim-8 finding                                              | Both forms in one turn; assert tool action only, bracket no-ops or warns.                                                                            | App-H §Bracket.precedence              |
| E9    | Rebase classification tracer                       | `526540de15` + `148792a0b7` + `0985182e87`                  | Static-harness vitest already covers (10+17+21+18 tests); assert green-floor on swim-37 SUT.                                                         | App-I §RebaseClassify                  |
| E10   | Swim-37 harness scaffold                           | `953030d88f` + `934a59bd30`                                 | 8 test files / 163 passing on `7ba4b19e03`; static precheck satisfied.                                                                               | App-I §Harness                         |
| D-cfg.otel-protocol-hard-gate | gRPC silent-warning, no fallback   | `service.ts:389-391`                                        | Set `protocol="grpc"`; assert startup warning + exporter NOT initialized.                                                                            | App-J §Config.otel-protocol            |
| D-cfg.otel-captureContent     | Redaction policy                   | canonical2 redaction substrate (#335)                       | Enable w/ redaction policy; assert sensitive keys redacted in span attrs.                                                                            | App-J §Config.otel-redaction           |
| D-cfg.taskflow-unconditional  | `taskFlowDelegates` purge license  | #365                                                        | Pre-purge: identical behavior gate-on vs gate-absent. Post-purge: zod rejects key.                                                                   | App-J §Config.taskflow-purge           |
| TC-no-genguard | Removal-only (RFC §3.2)                           | RFC §3.2 (NOT §3.6)                                         | Delayed delegate fires N out; channel receives K unrelated msgs between; assert delegate STILL FIRES. **No mechanism-replacement claim.** Phantom cleanup-debt retracted (zero non-doc hits per 🌫 byte-check). | App-J §Config.genguard-removed |
| D-cfg.sdq-retry-not-hot-reloadable | SDQ retry keys doc'd but not hot-reloadable | RFC §3.6 / §6.5 vs SDQ impl                            | Mutate `session-delivery-queue.retry.cap` + `.backoffMs[]` at runtime; assert NOT picked up live (requires gateway restart). Catches docs/code-shape mismatch per 🌻 second-eye. | App-J §Config.sdq-retry-static |
| **TC-tools-registered-post-deploy** (figs-flagged 08:54 PDT) | Positive presence-of-tools smoke after candidate deploy | live SUT surface                                         | Post-deploy on candidate prince: enumerate agent tool surface; assert `continue_work`, `continue_delegate`, `request_compaction` ALL present + callable + return non-error on no-op invocation. Catches the *"all green with one tool missing"* horror — pre-existing precedent. **Required positive case alongside TC-continuation-default-off (negative).** | App-K §Smoke.tools-registered |

**Totals (two pinned numbers per 🌫 proposal 08:19 PDT, +1 figs-flagged smoke 08:54 PDT):**
- `board_total: 39` — rows on the canonical board (28 E-series E1.x–E7.x + E6.5 + E9 + E10 + 5 B-twins + 4 D-cfg + 1 TC-no-genguard + 1 TC-tools-registered-post-deploy).
- `net_new_swim_cases: 37` — board_total minus E9 (rebase-classify) + E10 (harness scaffold), which are green-floor static-harness vitest coverage, not net-new swim-37 work.

Disagreement during convergence (08:04–08:18 PDT) was categorical (which bucket E6.5/E9/E10 land in), not arithmetic. Two pinned numbers = no further re-bytes needed. All filable as additions to PR #370 / #324 master matrix without disturbing existing case IDs.

## Cross-cutting flags lifted to top

- **TC-no-genguard pin §3.2 not §3.6** (🌫 byte-check, 🌻 owns misframe, 🌊 ack).
- **`generationGuardTolerance` cleanup-debt is phantom** — no hygiene issue.
- **`feedback_context_pressure_lifecycle` is not a config key** — memory-referent only; real lifecycle config = `agents.defaults.continuation.*` stack.
- **`maxChainLength` boundary-pin** = `>` not `>=` (E4.2).
- **OTEL `protocol` is hard-gate** — gRPC silent-warning, no fallback. Test must catch silent-failure shape.
- **Frozen-branch contract:** doc lives on `cael/release-highlights-sync-2026-04-28`; PR-back to `feature/context-pressure-squashed` post-signoff.

## Open figs Qs blocking finalization

| ID  | Q                                                       | Affected case          | Ronan's read                                                                                              |
|-----|---------------------------------------------------------|------------------------|------------------------------------------------------------------------------------------------------------|
| X1  | echo-to-multiple-channels: design intent?               | E6.3                   | Partial answer: `targetSessionKey` + multi-recipient descriptor IS the surface. Need spec-call: (a) result→origin+DM, (b) silent-wake one + announce another, (c) fan-out N receivers, (d) other. |
| C1  | chain-returns-to-root: current-behavior or design-target? | E6.2                 | RFC L149 frames as implicit-not-flag. Defaulting to **observed-current** until figs confirms otherwise.   |

## Standing for cohort second-eye

Three princes have content represented (🩸 seed §1–§8, 🌫 §A/§B + 8-uncovered, 🌻 E1–E10). This editor pass:
- collapses 🌫 TC-* into 🌻 E6 (alias-table preserves)
- adds (c) case-stub + (d) RFC-appendix-slot columns per highlight
- locks **39-row canonical board** (`board_total: 39` / `net_new_swim_cases: 37`; E9/E10 covered by static harness, kept for traceability; +TC-tools-registered-post-deploy added per figs 08:54 PDT)
- pins corrections (no-genguard §3.2, phantom cleanup-debt, feedback-key not-a-config, maxChainLength boundary)
- surfaces 2 figs-pending Qs

**Cohort second-eye asks:**
- 🌫: is the 32-case board complete against your #56 cross-walk + uncovered list, or did dedup drop something load-bearing?
- 🌻: any E1–E10 detail lost in the column-collapse? E5.2 + E9 + E10 are minimal-stub — flag if undertested.
- 🩸: seed axes §1–§8 each show up in the case-board; flag if any seed-shape went unrepresented.

Once cohort acks (or amends), this is ready for figs/Cael final-touch and PR-back to `feature/context-pressure-squashed` per swim-37 cast-off plan.

— 🌊 Ronan
