# ClawSweeper Evidence Alignment Audit — openclaw/openclaw#85651

Bound issue: https://github.com/openclaw/openclaw/issues/85651  
Reviewed comment: https://github.com/openclaw/openclaw/pull/85651#issuecomment-4524413167  
Saved review text: `/tmp/20260815-text_from_clawsweeper_comment.txt`  
Exact PR-presentation source: `99ce36658eef9d4a9ad9eca6782ffa0ee7891fd6`  
This lane: read-only. No product, test, docs, GitHub, or prince-seat mutation.

## 1. Executive verdict

The ClawSweeper comment is a **stale-head product-escalation review**, not an exact-`99ce` evidence verdict.

It still names reviewed head `a316a17ca0db351708978c0d30497dcd6db7e343` (updated 2026-08-11) and treats the exact head as unavailable. Live GitHub PR head **is** `99ce366`. `a316a17` is an ancestor of `99ce366`, not a substitute for it. Several Evidence cells reason from `7fe75acb5f46` / current-main / aggregate metadata rather than 99ce bytes.

Against exact 99ce:

- The three continuation tools, TaskFlow persistence, default-deny `crossSessionTargeting`, and shared `spawnSubagentDirect` → `resolveChildAdmission` path **exist**.
- `sessions_spawn` + `sessions_yield` **overlap only part** of the RFC. They do not implement self-elected same-session continuation, delayed/post-compaction durable delegates, silent/silent-wake return, or addressed multi-recipient return.
- Published live proof **does not PASS** the five requested boundaries. Treat PARTIAL as PARTIAL. The dedicated `PROOFS/99ce366…` tree is supplementary, executed on composite `6b09`, and is not the INDEX current corpus.

Product close-or-sponsor remains a maintainer decision. The technical claim that exact-head proof is impossible, or that yield/spawn already subsume the RFC, is **not** supported by 99ce.

## 2. Bindings

| Item | Value |
|---|---|
| ClawSweeper reviewed head | `a316a17` (comment line 11) |
| Comment created / updated | 2026-05-23 / 2026-08-11 |
| Live PR head / branch | `99ce366` / `frond-scribe-claude/20260509/narrow-surgery-tight` |
| 99ce merge-base vs absorbed upstream | `530b33e4e37264c89ecd5abdd06279dd23d5c867` |
| 99ce unique commits after merge-base | 1105 |
| Live PR size vs `530b33e` | 896 files, +121965 / -7465 |
| Comment size metadata | 921 files, +121407 / -7165 |
| RFC | `docs/design/continue-work-signal-v2.md` (status: Implemented) |
| Infographics | `docs/design/continuation-tools-infographics.md` |
| INDEX current corpus | `PROOFS/a7ef03177e0f42831a087521e6eb7720102d6be1` (runtime composite `2e72b665`, continuation parent `c8681949`) |
| Dedicated 99ce corpus | `PROOFS/99ce36658eef9d4a9ad9eca6782ffa0ee7891fd6` (runtime composite `6b09b1db`; INDEX not repointed) |
| Codex review baseline cited | `7fe75acb5f46` |
| Current `origin/main` used for alignment only | `10a98702b7b` |
| Child-admission default | `DEFAULT_SUBAGENT_MAX_CHILDREN_PER_AGENT = 5` in `src/config/agent-limits.ts` |

## 3. Claim-by-claim Evidence table

Classifications: CURRENT / STALE-WRONG-HEAD / PARTIALLY TRUE / UNPROVEN / PRODUCT-DECISION.

| # | ClawSweeper claim (tight) | Class | 99ce / proof binding |
|---|---|---|---|
| E1 | Current main exposes `sessions_spawn`, `sessions_yield`, subagents; lacks the three continuation tools. Child completions return to requester; yield ends the turn. Cites `docs/tools/subagents.md:70` @ `7fe75ac`. | PARTIALLY TRUE | True of `origin/main` `10a98702` and of 99ce's inherited spawn/yield surface (`src/agents/tools/sessions-yield-tool.ts`, `docs/tools/subagents.md:70-78`). False as a 99ce-head description: 99ce also has `continue_work`, `continue_delegate`, `request_compaction`. Docs cite is current-main, not 99ce RFC. |
| E2 | Current main limits direct children to five and enforces before normal spawning; prior P1 preserve-invariant **cannot be verified** at unavailable PR head. Cites `src/agents/child-admission.ts:77` @ `1dcac5b`. | STALE-WRONG-HEAD | Head is available. 99ce `child-admission.ts:77-101` still owns the cap. Continuation spawn shares it: `delegate-dispatch.ts` → `spawnSubagentDirect` → `resolveSubagentSpawnRequest` (`subagent-spawn-request.ts:241-247`) → `reserveChildAdmissionSlot` + `resolveSpawnAdmission` (`spawn-plan.ts:329-340`). Separate width cap `maxDelegatesPerTurn` default 5 (`continuation/config.ts:20,118-121`) does **not** replace the admission owner. No live proof row exercises `maxChildrenPerAgent` on continuation. |
| E3 | VISION.md one-topic / ~5k-line bar; supplied metadata 921 files +121407/-7165; roadmap guards heavy orchestration. Cites `VISION.md:34` @ `7fe75ac`. | PARTIALLY TRUE + PRODUCT-DECISION | Size bar text is current (`VISION.md` contribution rules). Exact 99ce-vs-`530b33e` is **896 / +121965 / -7465**, matching live GH PR JSON, not 921/121407. Scope judgment is product, not a 99ce correctness defect. |
| E4 | Plugin runtime can run/wait a subagent for the authenticated requester; no generic delayed, post-compaction, or arbitrary-session delivery; cannot redirect to ClawHub unchanged. Cites `src/plugins/runtime/types.ts:15` @ `7fe75ac`. | CURRENT (as plugin-API claim) | `origin/main` `types.ts` still exposes `SubagentRunParams` / `completionDelivery?: "current-requester"` only. 99ce continuation is core TaskFlow + session-delivery-queue, not a plugin API. Does not prove 99ce implementation missing. |
| E5 | Blame: child-admission to Peter @ `1dcac5b`; recent main wake by wonfong @ `9fdc266`; yield diagnostics by SunnyShu @ `8ecb609`. | PARTIALLY TRUE | Those commits exist. `1dcac5b` message is unrelated (“open terminals…”); file blame may still land there. `9fdc266` / `8ecb609` are upstream yield/wake repairs, not continuation-tool owners. |
| E6 | Exact-head and Codex gate gap: local checkout lacked PR head and `../codex`; no Codex/exact-head proof claim. Cites `extensions/codex/src/app-server/dynamic-tools.ts` @ `a316a17`. | STALE-WRONG-HEAD | Exact 99ce is present. `530b33e..99ce366` still touches 22 `extensions/codex` files (+450/-73). This audit did **not** inspect sibling `../codex`; no Codex protocol verdict. Gate remains open until a Codex-inspecting worker reads sibling source. |
| S1 | High: PR body permits delegated results to target other sessions when configured; every enqueue, recovery, and post-compaction release path must prove default-deny and avoid unintended session injection. | PARTIALLY TRUE (impl) / UNPROVEN (live) | Implementation: default `"disabled"` (`config.ts:128-129`, `zod-schema.agent-defaults.ts:277-279`). Enforced at tool (`continue-delegate-tool.ts` `hasCrossSessionDelegateTargeting`), TaskFlow dispatch (`delegate-dispatch.ts:336-384`), managed-artifact partition (`delegate-dispatch-managed-gates.ts:60-66`), token/announce (`subagent-announce.continuation.runtime.ts`), and post-compaction **managed** release (`post-compaction-delegate-dispatch.ts` `crossSessionDisabled`). `fanoutMode:"tree"` is lineage, not cross-session (`targeting-pure.ts:45-62`). Live: `R-CD-4` PARTIAL (`return_in_target:false`, `return_in_parent:false`). `R-CONFIG-INTERSESSION` PASS observed `cross_session_targeting=enabled` on the proof seat, not default-deny reject. `R-CONFIG-DEFAULTS` PASS observed seat `enabled=true`, `max_delegates_per_turn=500`. Unmanaged post-compaction release defers only managed-artifact rows when disabled; tool-time still rejects new enqueue. |
| M1 | Persistent data-model change: serialized state in unrelated test files (`package-mac-app.test.ts`, plugin-sdk-surface, stage-bundled-plugin-runtime, chat-tool-cards, sessions view) + `unknown-truncated-pull-files`. | STALE-WRONG-HEAD | Truncated file list is not the continuation store. Canonical persist is TaskFlow SQLite: `core/continuation-work`, `core/continuation-delegate`, post-compaction staging (`delegate-store.ts`, RFC §3.6 / §5.4). Returns use `session-delivery-queue`. Hedge timers are process-scoped. No continuation-owned SQLite schema-version bump found in this lane. |
| R1 | Proof corpus is for earlier heads; current head changed; need redacted exact-head boundary run covering child-cap, restart, post-compaction, default-deny. | PARTIALLY TRUE | INDEX still points at `a7ef0317`, not 99ce. Dedicated 99ce corpus exists but is supplementary and ran composite `6b09`. Requested four live boundaries are not all PASS (matrix below). |
| D1 | Decline/defer core framework; retain spawn+yield unless demand establishes a missing core contract. | PRODUCT-DECISION | RFC §1 and §B.3 name missing contracts spawn+yield do not cover. Whether that justifies core adoption is maintainer product judgment. |
| D2 | Branch conflict-dirty / not reviewable / 921-file mixed history. | PARTIALLY TRUE + PRODUCT-DECISION | 99ce is a large long-lived assembly (1105 commits after `530b33e`). Live GH head is not “unavailable.” Salvage-vs-replacement is product. |
| L1 | Labels: compatibility / session-state / security-boundary / needs proof / P3 speculative feature. | PRODUCT-DECISION / PARTIALLY TRUE | New `agents.defaults.continuation` surface is real (more than ten keys; see §5). P3/feature vs repair is product. “Needs proof” remains fair for the requested live boundaries. |

## 4. Exact proof coverage matrix

Do not treat PARTIAL as PASS. Neither published corpus is a pure exact-99ce gateway.

| Requested boundary | Unit/static at 99ce | Live INDEX `a7ef0317` (runtime `2e72b665`) | Live supplementary `PROOFS/99ce366…` (runtime `6b09`) | Verdict |
|---|---|---|---|---|
| Child-cap (`maxChildrenPerAgent=5`) shared with continuation spawn | Shared owner proven in source (`spawn-plan.ts:329-340`, `subagent-spawn-request.ts:241-247`). No continuation-specific live row. `maxDelegatesPerTurn` is a **different** cap. | No row named for five-child admission. `R-CONFIG-DEFAULTS` read seat `max_delegates_per_turn=500`. `R-CW-5/5A/6/6A` excluded orchestration. | Same exclusions. | **GAP** for live child-cap. Implementation CURRENT. |
| Restart recovery | Strong unit: `delegate-dispatch.recovery-1.test.ts`, `work-dispatch.parent-lineage-and-restart.test.ts`, `delegate-dispatch.post-compaction-recovery.test.ts`. RFC §3.6. | No dedicated gateway-restart live row in the 33-run matrix. | Same. | **Unit CURRENT; live GAP.** |
| Post-compaction behavior | Implementation + unit (`post-compaction-delegate-dispatch.ts`, staging tests). | `R-RC-1` PASS (threshold reject). `R-RC-2` PARTIAL: `post_compaction_path_observed=false`, `request_compaction_tool_result_observed=false`. | `R-RC-2` still PARTIAL. | **PARTIAL / not PASS.** |
| Default-deny targeting | Unit CURRENT: `continue-delegate-tool.crosssession-gate.test.ts` cases 1–6, 13–16; announce gate tests. | `R-CONFIG-INTERSESSION` PASS with targeting **enabled**. No PASS row showing disabled reject + no enqueue. | Same class. | **Unit CURRENT; live default-deny GAP.** |
| Cross-session return authority | Delivery owner `enqueueContinuationReturnDeliveries` (`targeting.ts:84-216`). | `R-CD-4` PARTIAL: child completed, `return_in_target=false`, `return_in_parent=false`. | `R-CD-4` PARTIAL again. | **PARTIAL. Missing return receipts.** |

Other live rows (context only): `R-CD-1` PASS typed delegate; `R-CD-2` PARTIAL silent-wake; `R-CW-1/2/4/TOKEN` PASS-class continue_work; `R-OBS-*` status/observe. INDEX rollup 26 PASS / 7 PARTIAL / 0 FAIL among run rows; 99ce supplementary live 15 validated PASS / 7 PARTIAL / 0 FAIL, plus 10 static-reader substrate failures (not product FAILs).

## 5. Child-admission and cross-session-authority trace

### 5.1 Five-child admission

```
continue_delegate execute
  → enqueuePendingDelegate (TaskFlow)
  → dispatchToolDelegates
      width: maxDelegatesPerTurn (continuation-owned)
      policy: crossSessionTargeting
      budget: checkContinuationBudget
      spawn: spawnSubagentDirect
        → resolveSubagentSpawnRequest
            → reserveChildAdmissionSlot
            → resolveSpawnAdmission
                → resolveChildAdmission
                    activeChildren vs maxChildrenPerAgent (default 5)
```

Continuation **shares** the existing admission owner. It does not bypass it. It **also** applies continuation-specific chain/cost/width/targeting bounds. Token-path announce uses the same spawn endpoint.

### 5.2 Cross-session authority

| Phase | 99ce owner | Default-deny? |
|---|---|---|
| Tool enqueue | `continue-delegate-tool.ts` | Yes. Reject, no enqueue. Tree/self allowed. |
| Token/bracket spawn | `subagent-announce.continuation.runtime.ts` | Yes. |
| TaskFlow dispatch / recovery spawn | `delegate-dispatch.ts` + managed gates | Yes for unmanaged (reject); managed defers until re-enabled. |
| Post-compaction release | `post-compaction-delegate-dispatch.ts` | Managed + disabled → preserve/defer. Unmanaged gated rows still enter release after tool-time deny. |
| Final delivery | `enqueueContinuationReturnDeliveries` → session-delivery-queue + optional `requestHeartbeatNow` | Delivers to resolved keys only; does not re-derive policy. Policy must have held at enqueue/dispatch. |
| Restart of queued returns | session-delivery-queue replay (`targeting.ts` comments 189-192) | Replays stored recipient snapshot (RFC A.6). |

`hasCrossSessionDelegateTargeting`: `fanout=all` or any explicit non-self key. `fanout=tree` is not cross-session.

## 6. Recent-upstream alignment matrix

Compared `99ce366` (continuation assembly on `530b33e`) with `origin/main` `10a98702`. Not a chase of unrelated main drift.

| Surface | Upstream now | 99ce continuation | Align / reuse? | Forced-align risk |
|---|---|---|---|---|
| `sessions_spawn` | Current child-task primitive | Reused via `spawnSubagentDirect`; attachments/model parity (RFC §2.4, §B.3) | Keep sharing spawn/admission/attachments | Replacing continue_delegate with spawn-only erases delay, modes, targeting, chain |
| `sessions_yield` | Park turn until next event; child completion becomes next message (`sessions-yield-tool.ts`, `docs/tools/subagents.md:78,279-292`) | Present on 99ce **and** main. Complementary, not equivalent to `continue_work` | Keep. Do not rename continue_work to yield | Yield requires an external next event; continue_work is a durable same-session election |
| Child admission cap 5 | Same file on main; 99ce diff empty vs main | Shared | Already aligned | None |
| Parent wake after yielded child | `9fdc266` | Continuation silent-wake uses `requestHeartbeatNow` / trusted continuation wake | Vocabulary overlap only | Collapsing silent-wake into yield-wake loses silent enrichment + delay + targeting |
| Yield diagnostics | `8ecb609` | Continuation has its own `/status` line and OTel spans (RFC §6) | Optional shared diagnostics later | Do not delete continuation tracer |
| Plugin `runtime.subagent.run/wait` | current-requester only | Insufficient for RFC | Do not ClawHub-redirect the RFC | Would drop durability and authority |
| Compaction | Main overflow/compaction owners | 99ce adds volitional `request_compaction` + staged post-compaction release | Hook into existing compaction lifecycle; do not fork compaction | Dropping lich/release path erases RFC §2.5 / §4.4 |
| Codex plugin | Main + 99ce delta in `extensions/codex` | Continuation-adjacent dynamic-tool wiring | Codex gate still required; not judged here | Blind rebase of Codex files is unsafe |

RFC contracts still **absent** on `origin/main`:

1. `continue_work` / `CONTINUE_WORK` durable same-session election (TaskFlow `continuation_work`).
2. `continue_delegate` modes and return addressing.
3. `request_compaction`.
4. `agents.defaults.continuation.*` including default-deny `crossSessionTargeting`.
5. Post-compaction staged delegate release.
6. Continuation chain/cost accounting and OTel `continuation.*` spans.

Narrow rebase/refactor **if sponsored**: keep spawn/admission/attachments/compaction owners; keep continuation as a thin broker over TaskFlow + session-delivery-queue; do not rewrite as yield. Proof/docs-only work is enough if the product decision is defer.

## 7. Recommended next actions (ordered, severable)

### A. Proof / documentation repair (no product decision required)

1. Stop citing `a316a17` as the reviewed head. Bind reviews to `99ce366`.
2. Point ClawSweeper / PR body at `PROOFS/INDEX.json` **and** state that `PROOFS/99ce366…` is supplementary / composite-runtime.
3. Add live rows that can actually PASS the requested boundaries:
   - child-cap: 5 active children + sixth `continue_delegate` forbidden by `subagents.maxChildrenPerAgent`;
   - default-deny: `crossSessionTargeting=disabled` reject + zero enqueue/delivery;
   - restart: kill gateway with queued work/delegate/return, recover once;
   - post-compaction: observe `post_compaction_path_observed=true` (R-RC-2 is not that);
   - cross-session return: close `R-CD-4` return receipts (`return_in_target`).
4. Do not fold PARTIAL into PASS. Do not treat `R-CONFIG-DEFAULTS` seat overrides as shipped defaults.

### B. Code alignment (only if a maintainer sponsors the feature)

1. Keep `resolveChildAdmission` as the only child-count owner; add a continuation regression that the sixth spawn fails that error string.
2. Close unmanaged post-compaction release so disabled targeting cannot release a previously queued cross-session unmanaged row.
3. If a replacement PR is required, start from current main and lift the broker + TaskFlow controllers, not the 1105-commit assembly as a merge.
4. Codex: inspect sibling `../codex` before any Codex-file verdict.

### C. Product decisions (cannot be resolved technically)

1. Is model-elected durable continuation a supported **core** architecture, or remain out of tree?
2. If yes, is the 896-file assembly acceptable or must it be a focused replacement?
3. Is `fanoutMode:"all"` ever an in-tree operator surface?
4. Are live prince-seat proofs required before any merge, or is unit + one sanitized mock-gateway matrix enough?

## 8. Uncertainties and GitNexus limits

- GitNexus indexes used: `openclaw` @ `fabc84d31ff6` (2026-06-16, continuation-bearing but stale vs 99ce); sibling `openclaw-85651-upstream-530b33e-gitnexus` @ `530b33e` (2026-08-14). **Neither is 99ce.** Used only for symbol/path discovery (`dispatchToolDelegates`, `createContinueDelegateTool`, `hasCrossSessionDelegateTargeting`). Every substantive conclusion was re-read on 99ce files.
- No `../codex` inspection; no Codex compatibility verdict.
- Did not re-run k6, restart a prince, or execute the full `node --import tsx scripts/test-projects.mts` suite (read-only audit; no product change).
- Did not re-litigate 1105-commit history cleanliness beyond size and head identity.
- Post-compaction unmanaged release gap is source-level; no failing live row was executed here.
- A new ClawSweeper “review started” comment (`5301792045`, 2026-08-15) appeared during this lane. This lane did not trigger or wait on it.

## 9. Validation

- Read: root + `src/agents`, `src/agents/tools`, `docs` AGENTS.md; RFC; saved ClawSweeper text; live PR `85651`; proof INDEX + 99ce README/METHOD/manifest + a7ef row evidence for R-CD-4, R-CONFIG-INTERSESSION, R-RC-2, R-CONFIG-DEFAULTS.
- Exact 99ce owners read: `child-admission.ts`, `spawn-plan.ts`, `subagent-spawn.ts`, `subagent-spawn-request.ts`, `continue-delegate-tool.ts`, `continuation/config.ts`, `targeting-pure.ts`, `targeting.ts`, `delegate-dispatch.ts`, `delegate-dispatch-managed-gates.ts`, `delegate-store.ts`, `post-compaction-delegate-dispatch.ts`, `sessions-yield-tool.ts`, `zod-schema.agent-defaults.ts`.
- Full-suite: **not run** (read-only evidence audit).
- Files authored: `output.md` only.
