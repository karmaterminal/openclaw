# 1172 upstream absorb — independent review

Lane branch: `codeagent/1172-absorb-independent-review-opus5`
Bound issue: karmaterminal/openclaw#1197 (tracking also #1198, openclaw/openclaw#85651, Project 85)
Role: **fresh independent reviewer**. Review-only — no product edit, no merge, no rebase,
no cherry-pick, no commit rewriting, no force-push, no shared-ref push, no presentation motion,
no deployment.

Reviewed candidate frozen at `cad0b99de23822698d477ac7b1618a3e8ce22ae8`. Later upstream
movement was deliberately not chased.

## Recommendation

**REQUEST_CHANGES** — for exactly one bounded, test-only defect (F1).

The absorb itself is sound. Topology is correct, no accepted assembly behavior was silently
dropped, every named high-risk resolution holds up under source reading, and the candidate's
red ledger is now fully classified with three-tree controls. Under identical shard conditions
the absorb **strictly improves** the continuation shard (27 base failures → 10, a strict
subset). The single blocker is one stale test assertion the merge imported verbatim from
upstream. Fix that one assertion and this is landable.

Per the workorder, a candidate-caused red that is still present cannot return APPROVE — even
though it is test-only and fully root-caused.

---

## 1. Ancestry — verified, not trusted

Every SHA was resolved in this worktree and its parent relationships checked.

| Role | SHA | Parents | Verified |
| --- | --- | --- | --- |
| Assembly base | `16f4b3f106033f7fe75f68e67563db1b5b4d0e2f` | `2a5bfaad811` | yes |
| Frozen upstream | `cc48aef143551af2ce13096264335ce9954e61e6` | `fa0bced5446` | yes |
| True merge | `9ed7fd20b49ad18e4a99cb299b3ecfc9926cf857` | `16f4b3f1060` **+** `cc48aef1435` | yes |
| Review candidate | `cad0b99de23822698d477ac7b1618a3e8ce22ae8` | `dda878e7eb4` | yes |
| Protected presentation | `d8b08c9c0a1f425f4cfff1b21bff4852deff823f` | `9c66907106c` | yes |

- `9ed7fd20` is a **true two-parent merge** whose parents are *exactly* the frozen assembly base
  and the frozen upstream candidate — not a rebase, squash, or cherry-pick reconstruction.
- `git merge-base --is-ancestor` confirms **both** `16f4b3f1` and `cc48aef1` are ancestors of
  `cad0b99d`, so no history was dropped after the merge. Preserved topology confirmed.
- The candidate is the merge plus exactly five commits:

  | SHA | Subject |
  | --- | --- |
  | `9510a3797d6` | `fix(merge): retarget continuation code onto upstream's renamed surfaces` |
  | `f60acee5f66` | `chore(merge): regenerate plugin-sdk api baseline for the absorbed surface` |
  | `74c1a569044` | `fix(signal): restore the canonical ingress test seam after the absorb` |
  | `f0f5c95f53e` | `test(agents): canonicalize registry fixtures in the assembly's split file` |
  | `dda878e7eb4` | `test(continuation): mock the accessor final-delivery persistence actually calls` |
  | `cad0b99de23` | `docs(absorb): record the absorb report` |

### Protected refs are unmoved

- Protected presentation `d8b08c9c` is still the tip of **both**
  `origin/frond-scribe-claude/20260509/narrow-surgery-tight` and
  `origin/savegame/pr-presentation-1172-pre-cut-20260711`.
- Origin assembly `16f4b3f1` is still the tip of
  `origin/frond-scribe/20260726/assembly-1172-post-666-drift`,
  `origin/scribe/20260709/1172-status-row-assembly`,
  `origin/frond-scribe/20260727/1195-post-drift-port`, and
  `origin/codeagent/1198-postcompaction-lifecycle-p1`.
- Neither was checked out, fetched into, or written by this lane.

### Diff scope

| Delta | Files |
| --- | --- |
| `16f4b3f1..cad0b99d` (vs assembly base) | **4810** files, +334,749 / −92,922 |
| `cc48aef1..cad0b99d` (vs frozen upstream) | **639** files, +106,549 / −3,616 |
| merge vs parent 1 (assembly) | 4805 files |
| merge vs parent 2 (upstream) | 637 files |

Conflict-marker sweep on the merged tree is clean.

---

## 2. GitNexus receipts

The merged-tree index exists on this seat and its receipt matches the workorder **exactly**:

```
repo    : WORKTREES/openclaw-1172-upstream-absorb-opus5/.gitnexus
nodes   : 658,355      edges: 1,280,802      flows: 300
indexed : 2026-07-30T05:45:12Z   lastCommit: f60acee5f66a
```

**Index currency check (mine, not inherited).** The index is pinned at `f60acee5f66`, three
commits behind the candidate. I proved that gap is production-inert:
`git diff --name-only f60acee5f66 cad0b99de23` yields only `*.test.ts` files, `output.md`, and
root `AGENTS.md`. **No production source moved after the index**, so the graph is a sound oracle
for this review.

As on the cartography lane, GitNexus **MCP tools are not exposed in this Copilot process's tool
surface**. Mitigation: the read-only CLI (`impact`, `status`, `list`) against the existing
index, addressed by absolute `--repo` because many registry entries share the name `openclaw`.
No `analyze`, no re-index — the graph was not mutated by this review.

The candidate's own `detect-changes` receipt (4758 files / 29,152 symbols / 153 affected
processes / risk `critical`) is consistent with a 944-commit absorb and I did not re-run it;
`critical` here is a scale signal, not a defect signal.

### Blast radius — and a correction to the candidate's receipt

The candidate's §3 reports `createOpenClawTools` at **17 direct dependants / HIGH / 3 modules**.
That number is a **name-ambiguity artifact**: the registry holds **10** symbols named
`createOpenClawTools`, nine of which are test-local helper functions. Disambiguated to the
production symbol:

```
gitnexus impact "Function:src/agents/openclaw-tools.ts:createOpenClawTools" \
  --direction upstream --depth 1   → impactedCount 3,  risk LOW,  modules 2 (Agents, Reply)
  --direction upstream --depth 2   → impactedCount 6,  risk HIGH
```

d=1 (WILL BREAK on a signature change):

| Caller | Relation |
| --- | --- |
| `src/gateway/tool-resolution.ts::resolveGatewayScopedTools` | CALLS |
| `src/agents/agent-tools.ts::createOpenClawCodingToolsInternal` | CALLS |
| `src/skills/runtime/tool-dispatch.ts::resolveSkillDispatchTools` | CALLS |

d=2: `src/gateway/tools-invoke-shared.ts::resolveTools`,
`src/agents/agent-tools.ts::createOpenClawCodingTools`,
`src/gateway/mcp-http.runtime.ts::resolveMcpLoopbackTools`.

This **strengthens** the candidate's conclusion — the real production blast radius is smaller
than claimed — but the receipt as written overstates risk and should not be reused verbatim.

---

## 3. Findings, ordered by severity

### F1 — MEDIUM · candidate-caused · test-only · **blocks landing**

**`src/gateway/server-restart-sentinel.test.ts:3023` → "preserves an explicit targetless config restart note"**

The only red in the entire absorb that is *caused by the merge*. Both parents are green; the
merge is red:

| Tree | Isolated result |
| --- | --- |
| Assembly base `16f4b3f1` | **75 passed** |
| Frozen upstream `cc48aef1` | **73 passed** |
| Candidate `cad0b99d` | **77 passed / 1 failed** |

Root cause, established by reading both parents rather than inferring:

- Upstream **added** this test (`cc48aef1:src/gateway/server-restart-sentinel.test.ts:2707`);
  it is absent from the assembly base.
- Upstream's assertion encodes upstream's *pre-assembly* delivery shape:
  `enqueueSystemEvent("restart message", { sessionKey })`.
- The assembly reshaped that same `!sessionKey` fall-through to route through **durable session
  delivery**, so merged production correctly emits
  `enqueueSystemEvent("restart message", { sessionKey, sessionDeliveryAckId, trusted: true })`.
- The merge imported upstream's assertion **verbatim** without reconciling it against the
  assembly's production shape.

Observed failure on the candidate:

```
AssertionError: expected "vi.fn()" to be called with arguments: [ 'restart message', …(1) ]
Received: [ "restart message", {
+   "sessionDeliveryAckId": "session-delivery-1",
    "sessionKey": "agent:main:main",
+   "trusted": true,
} ]
Number of calls: 1
```

**The restart note is not lost.** It is delivered, durably, with the trusted marker — so this is
a stale assertion, not a silent-failure regression. Severity is capped at MEDIUM for that
reason; had the note actually been dropped this would be doctrine-class P0.

The decisive evidence that the assertion (not production) is wrong is that **the file is
internally inconsistent**: its sibling test `durably wakes the main session when the sentinel
has no sessionKey` at `src/gateway/server-restart-sentinel.test.ts:3034` exercises the *same*
code path and already asserts the assembly shape, including `sessionDeliveryAckId:
"session-delivery-1"` and `trusted: true`. One of the two imported assertions was reconciled
during the merge and the other was not.

**Best fix** (owner's call; not applied here — review-only lane): update the assertion at
`src/gateway/server-restart-sentinel.test.ts:3023` to the durable shape already used by its
sibling eleven lines below. No production change is warranted. This is the *best* fix rather
than merely a plausible one because production is behaving to the assembly's accepted, tested
contract, and the sibling test pins that contract independently.

### F2 — LOW · receipt accuracy · `createOpenClawTools` blast radius overstated

See §2. Reported 17 direct / HIGH; the disambiguated production symbol is 3 direct / LOW.
The conclusion (additive widening is safe) is unaffected and in fact better supported.

### F3 — LOW · classification evidence was thin, though the label was right

The candidate classifies `src/auto-reply/continuation/post-compaction-durable-handoff.test.ts`
as "inherited" on the strength of `src/auto-reply/continuation/` being byte-identical to base.
That file **passes 6/6 in isolation on both base and candidate**, so byte-identity does not
explain its four full-suite failures and the invariant was effectively unproven.

I re-proved it properly at shard level (§7.3): under identical `auto-reply-reply` shard
conditions all four failures reproduce on the assembly base. **The label is correct**; only the
stated evidence was insufficient. Recorded because this file is the *TaskFlow durable-handoff
terminalization* invariant surface named in the workorder, so it deserved a real control.

### F4 — INFO · operator · stale SQLite residue still breaks all three trees

The candidate quarantined 1118 stale `/tmp/*.sqlite` files, but the quarantine was incomplete.
Remaining residue at **fixed reused paths** still fails base, upstream, and candidate
identically:

- `/tmp/openclaw-state/state/openclaw.sqlite` — `column definitions differ for flow_runs`
  → breaks `src/cli/plugins-cli.install.test.ts` (4) and `src/gateway/server-cron.test.ts` (2).
- `/tmp/openclaw-test-sessions-{main,tavern.tavern,builder.builder}.sqlite` — `schema version 9`
  → breaks `src/commands/sandbox-explain.test.ts` (7).

This is environment debt on this seat, not absorb fallout, and not in absorb scope to fix. Worth
an operator sweep before any future full-suite tally is treated as meaningful.

### F5 — INFO · bookkeeping

The candidate's §10 and the workorder both say "**12 known failing tests**". The table
enumerates **12 failing *files*** totalling **~29 failing tests** (11 across the five
"inherited" files, 18 across the seven "untriaged" files). Worth correcting so the figure is not
carried forward as a test count.

### F6 — INFO · two gateway-server failures were never enumerated

The candidate's ledger omits `src/gateway/server-plugins.test.ts` (`allows trusted fallback
provider/model overrides when plugin config is explicit`) and
`src/gateway/server-node-session-runtime.test.ts` (`forwards subscribed payload json without
parsing it again`), both of which fail in the gateway-server shard. Both are proven
upstream-inherited (§7.2), so they change no conclusion, but the ledger was incomplete.

---

## 4. Silent auto-merge drop hunt

The workorder asks for drops found from merged-tree evidence, not conflict markers. I ran two
independent detectors over the merged tree.

### 4.1 Whole-file drops

For all **658** paths the assembly changed relative to the merge base
(`20eda756fae6599bc9d776815016f555a64d77d6`), find files where the merged blob equals the
**upstream** blob exactly while assembly differed from upstream — i.e. the assembly's version
was discarded wholesale.

Result: **21 files**, all `apps/android/wear/src/main/res/values-*/strings.xml`.

Key-set audit across those 21: **0 assembly keys absent from the merged tree.** Upstream's rows
are a superset — upstream added real localized strings for the same generated `native_*` keys
the assembly carried as English placeholders. Taking upstream wholesale is lossless here.

These 21 wear files are *in addition to* the 42 conflicted translation files the candidate
resolved hunk-wise in its §5.1; they auto-merged cleanly and so never entered the conflict
inventory. They are exactly the class this detector exists to catch, and they are clean.

### 4.2 Partial hunk drops

Stronger detector: for each of the **598** assembly-changed *source* files, take every
non-trivial line the assembly added relative to the merge base and check whether it survives
anywhere in the merged blob.

Result: **12 files** flagged out of 598. Every one maps to a resolution the candidate
documented — there is **no undocumented drop**:

| File | Lost lines | Documented as |
| --- | --- | --- |
| `extensions/signal/src/monitor/event-handler.reply-session-conflict.test.ts` | 85 | §8 deliberate rewrite onto canonical seam |
| `extensions/signal/src/monitor/event-handler.ts` | 25 | §5.9 upstream ingress rework adopted |
| `src/infra/heartbeat-wake.ts` | 17 | §5.6 serial loop deleted for upstream dispatcher |
| `src/agents/embedded-agent-subscribe.ts` | 8 | §5.5 |
| `src/status/status-codex-auth-profile.ts` | 7 | §5.7 legacy Codex retirement adopted |
| `src/agents/embedded-agent-subscribe.handlers.ts` | 6 | §5.4 composed contracts |
| `scripts/plugin-sdk-surface-report.mjs` | 3 | §5.12 ratchets reconciled |
| `src/agents/subagent-registry-queries.ts` | 2 | §6 rename retarget |
| `src/agents/embedded-agent-runner/compact-reasons.ts` | 2 | §6 rename retarget |
| `src/gateway/server-methods/chat-send-dispatch-errors.ts` | 1 | §5.8 re-inserted at new site |
| `src/agents/subagent-registry.persistence.restore-recovery.test.ts` | 1 | §6 |
| `src/agents/embedded-agent-runner/compact-reasons.test.ts` | 1 | §6 |

I then verified the replacements actually landed, rather than trusting the narrative:

- `findLatestRunForChildSession` → `getLatestSubagentRunByChildSessionKeyFromRuns` at every call
  site (`src/agents/subagent-registry-queries.ts:285,303,345,370,385,472`); repo-wide grep for
  the old name returns **nothing**.
- `already_compacted_recently` → `already_compacted` throughout the closed union
  (`src/agents/embedded-agent-runner/compact-reasons.ts:25,46,101,102,141`); repo-wide grep for
  the old code returns **nothing**.
- `markTerminalBroadcasted()` survives at both broadcast sites, and the §5.8 placement claim is
  accurate: `src/gateway/server-methods/chat-send-dispatch-errors.ts:211` sits *inside* the
  `!agentTerminalPersistenceOwnedAtDispatchReject` guard, immediately before `broadcastChatError`
  at line 212. Upstream's aborted early-return performs no broadcast and correctly carries no
  mark.

**Conclusion: no accepted assembly behavior was silently dropped.**

---

## 5. The named high-risk resolutions

### 5.1 `src/infra/heartbeat-wake.ts` — sound, and it caught a real latent break

Upstream replaced the single global serial runner with per-target concurrent dispatch
(`activeWakeTargets`, `MAX_CONCURRENT_HEARTBEAT_WAKE_TARGETS = 4`, `AsyncLocalStorage` abort
scoping, `readyAtMs` coalescing, `dispatchPendingWakeGroup`). The assembly's continuation
additions were ported **onto** that abstraction; the old serial loop is deleted, not resurrected
— which is what the root rule about adopting upstream architecture requires.

**Trust-domain separation — correct.** `getWakeCoalesceKey` (`heartbeat-wake.ts:223-230`)
appends a `default` / `trusted-continuation` domain to the base key, so trusted continuation
wakes get their own coalescing bucket and can never merge into a default bucket. Verified by
reading the key builder and every `pendingWakes` keying site.

**Global flush barrier — correct, and this was a genuine latent breakage.** I confirmed against
upstream source that upstream looks up the literal key `"::"`
(`cc48aef1:src/infra/heartbeat-wake.ts:252,258,265`). Under the assembly's key shape the
unscoped key becomes `"::::default"`, so **upstream's lookup could never match and the barrier
would have been permanently dead** — a silent-failure class defect that a textual merge would
have shipped. The candidate retargets through `UNSCOPED_WAKE_TARGET_KEYS`
(`heartbeat-wake.ts:232-242`) covering *both* trust domains, and preserves upstream's ordering
(`Number(isUnscoped(left)) - Number(isUnscoped(right))` sorts unscoped groups **last**, matching
upstream). Both the barrier predicate (line 311) and the sort (line 326) use it.

**AsyncLocalStorage swap — correct.** `runAbortableHeartbeatWake` nests
`heartbeatWakeAbortSignals.run(signal, () => activeHeartbeatWakeContexts.run(wake, () =>
active(wake)))` (`heartbeat-wake.ts:629-631`), so each of the up-to-4 concurrent target turns
reads its own wake instead of a shared module-level slot. I verified the **sole** consumer by
grep rather than trusting the graph: `src/infra/heartbeat-runner.ts:105` calls
`getActiveHeartbeatWakeContext()` synchronously inside the `runOnce` handler and uses it only to
recover `parentRunId` and the trusted-routing marker, gated on `isTargetedWake`
(`heartbeat-runner.ts:105-115`). Safe under concurrency.

**One genuine design fork, correctly flagged.** Extending the unscoped barrier across *both*
trust domains is a judgment call. Scope-and-intent reading (an unscoped immediate wake means
"flush everything") supports it, and it is the behavior-preserving choice relative to upstream's
single-domain world. If the owner intends trusted-continuation wakes to be excluded from the
global flush, it is a one-line narrowing. Flagged rather than assumed; not a landing blocker.

### 5.2 Signal ingress/release and public plugin-boundary mocks — sound

Upstream's restructured ingress lifecycle is adopted wholesale
(`fanInChannelIngressLifecycles`, `createFlush({lifecycle, dispatch})`,
`retrySignalInboundFlush` with backoff). The assembly's accepted merged-claim-release behavior
is ported into the new catch at `extensions/signal/src/monitor/event-handler.ts:698`, with an
inline comment stating the invariant (release only still-live siblings; reclaimed claims retain
drain ownership) — which is what root AGENTS.md asks inline comments to carry.

The boundary repair is real and matters beyond the merge. The assembly had replaced the
canonical `openclaw/plugin-sdk/channel-inbound` mock with deep `src/**` mocks — an
extensions-boundary violation under both root architecture rules and `extensions/AGENTS.md`. The
merged test now mocks only public barrels (`openclaw/plugin-sdk/reply-runtime`,
`openclaw/plugin-sdk/channel-inbound`, `openclaw/plugin-sdk/conversation-runtime`) plus
plugin-local `../send.js`. I grepped the whole signal monitor test directory for residual deep
`src/**` mocks: **none**. Net architecture improvement, not just a merge repair.

### 5.3 `createOpenClawTools` — additive, safe

The exported signature is unchanged; the widening is a single **optional** field on the
extracted options type: `webSearchEnabled?: boolean` at
`src/agents/openclaw-tools.options.ts:48`, consumed at `src/agents/openclaw-tools.ts:239`. The
assembly's extraction into `openclaw-tools.options.ts` is preserved (upstream kept it inline and
never created that file), which is the right call for the max-lines ratchet. All three d=1
callers pass an options object, so an added optional field cannot break them, and `tsgo` is
clean (§6). Upstream's own introductions in this file — `setImmediate` media-generation yield
hardening with `mediaGenerationYieldLog`, the shared `mediaGenerationToolOptions`,
`activeProjectKeys`, `runSessionKey` on the message tool — are retained.

### 5.4 subagent-spawn persistence/cleanup and attachment receipt — sound

- Assembly's `persistInitialChildRuntimeState({ ..., continuationPatch:
  buildContinuationSessionPatch(params) })` retained at `src/agents/subagent-spawn.ts:213-217` —
  this is what carries continuation chain state onto the child session at spawn.
- Upstream's stronger `cleanupProvisionalSession(...)` adopted at all cleanup sites
  (`subagent-spawn.ts:203,220,249,317,484,…`), replacing the raw delete + try/catch.
- Attachment receipt intact: `attachments: attachmentsReceipt` on the accepted result
  (`subagent-spawn.ts:673`), fed from `materializedAttachments.receipt` at line 328.

### 5.5 embedded-agent subscribe scheduling, fence, trust map, deferred callbacks — sound

The composition claim checks out precisely. `scheduleAttemptEvent`
(`src/agents/embedded-agent-subscribe.handlers.ts:84-102`) captures `deliveryGeneration` at
schedule time and **returns** `scheduleEvent(...)`, so the scheduled task is forwarded. The
fence still drops handlers from a discarded compaction attempt (lines 95-97), and because
`scheduleEvent` returns the chained task regardless of whether the inner handler ran, the
returned promise still settles when the fence skips. Upstream's awaitable terminal is preserved:
`agent_end` does `return scheduleAttemptEvent(...)` (lines 201-206) while every non-terminal
discard site keeps upstream's `void` marker.

Upstream's per-URL trust map is adopted (`pendingToolMediaTrustByUrl` throughout
`embedded-agent-subscribe.handlers.messages.ts`); the assembly's boolean
`pendingToolTrustedLocalMedia` has **no** production leftovers.

The assembly's `emitBlockReplySafely` callback form, `recordDeferredAssistantReplyDirectives` /
`recordDeliveredAssistantReplyDirectives`, `deferredBlockReplyTexts` and
`deferredBlockReplyCallbacks` are preserved and retargeted onto upstream's `taggedPayload`
(`embedded-agent-subscribe.ts:422-428,541-566`). I verified the subtle safety argument rather
than accepting it: `setReplyPayloadMetadata` (`src/auto-reply/reply-payload.ts:295-302`) stores
into a side WeakMap and does `return payload` — the **same object** — so the identity-keyed
`deferredBlockReplyCallbacks` WeakMap and `deferredToolMediaReplies` Set are unaffected by
tagging. Correct.

### 5.6 status-text adoption of upstream's legacy Codex retirement — correct, and required

`src/status/status-codex-auth-profile.ts` now accepts only `credentialProvider === "openai"`;
the legacy `openai-codex` / `codex-cli` branch is **not** resurrected. I diffed it against
upstream's inline version (`cc48aef1:src/status/status-text.ts:166-188`) — semantically
identical, just living in the assembly's extracted module (kept for the max-lines ratchet). This
is right independent of the merge: root AGENTS.md states OpenAI Codex is folded into `openai`,
that no new/live `openai-codex` routes may exist, and that doctor/migrations own repair of stale
`openai-codex/*` profiles. Adopting upstream here is architecture compliance, not merely
conflict resolution.

### 5.7 agent-runner / session-reset renamed surfaces — sound

Handled in `9510a3797d6`, which is well-scoped (10 files, +27/−49) and documents each rename.
The two renames with production reach (`findLatestRunForChildSession`,
`already_compacted_recently`) are verified fully retargeted with zero repo-wide leftovers (§4.2).
These were true silent auto-merges — only one side edited each region, so git could not flag
them — which validates hunting beyond the conflict inventory.

### 5.8 Generated plugin-sdk surface report and API hash baselines — verified independently

I re-ran both gates myself rather than trusting the receipt:

```
node --max-old-space-size=8192 scripts/plugin-sdk-surface-report.mjs --check      → exit 0
node --max-old-space-size=8192 --import tsx \
     scripts/generate-plugin-sdk-api-baseline.ts --check                          → exit 0
```

Surface output matches the claimed ratchets **exactly**: public entrypoints **146**, exports
**4791**, callable **2887**, deprecated **1710**, wildcard reexports **81**, package-exported
forbidden subpaths **0**.

`OK docs/.generated/plugin-sdk-api-baseline.sha256` proves the baseline was genuinely
**regenerated from merged source**, not picked from either side — which is the thing that
actually matters for a generated artifact in a merge.

---

## 6. Typecheck

```
node scripts/run-tsgo.mjs -p tsconfig.json --noEmit   → exit 0, no diagnostics
```

The "226 → 0" claim is verified at the endpoint. The three residual errors described mid-way in
the candidate's report (`timing` / `emojis` absent from `StatusReactionsConfig`) are gone,
cleared as a side effect of adopting upstream's type-clean signal test.

---

## 7. Red ledger — every failure classified with a three-tree control

Method: rather than reasoning from file byte-identity alone (which the candidate's own report
shows is not sufficient), I built **two control checkouts** of the frozen parents with
hardlinked dependencies and re-ran the exact failing targets:

```
git worktree add --detach /tmp/absorb-rev-base     16f4b3f106033f7fe75f68e67563db1b5b4d0e2f
git worktree add --detach /tmp/absorb-rev-upstream cc48aef143551af2ce13096264335ce9954e61e6
cp -al node_modules /tmp/absorb-rev-{base,upstream}/node_modules
```

Every control run used the sanctioned wrapper with an isolated module cache:

```
OPENCLAW_VITEST_FS_MODULE_CACHE_PATH=<per-tree> \
  node scripts/run-vitest.mjs run --maxWorkers=1 <path>
```

The implementation lane only ever controlled against the **assembly base**. Because all seven
"untriaged" files are *upstream-owned* surfaces, the decisive control is the **frozen upstream**
— which had never been run.

### 7.1 The seven "untriaged" files — all cleared

| File | Failing | Upstream `cc48aef1` | Verdict |
| --- | --- | --- | --- |
| `src/entry.respawn.test.ts` | 2 | **2 failed (identical)** | upstream-inherited / environment |
| `src/cli/plugins-cli.install.test.ts` | 4 | **4 failed (identical)** | upstream-inherited / stale SQLite |
| `src/commands/sandbox-explain.test.ts` | 7 | **7 failed (identical)** | upstream-inherited / stale SQLite |
| `extensions/anthropic/session-catalog.test.ts` | 1 | **1 failed (identical)** | upstream-inherited / float precision |
| `src/gateway/server-cron.test.ts` | 2 | **2 failed (identical)** | upstream-inherited / stale SQLite |
| `src/plugins/npm-install-security-scan.release.test.ts` | 1 | 78 passed | **flake** — passes isolated on all three trees |
| `src/gateway/server-restart-sentinel.test.ts` | 1 | 73 passed | **F1 — candidate-caused** |

Detail worth recording:

- `entry.respawn` — `src/entry.respawn.ts` **and** `src/entry.respawn.test.ts` are byte-identical
  across base, upstream, and candidate. The failure is the host's real CA bundle
  (`/etc/ssl/certs/ca-certificates.crt`) leaking into a `platform: "darwin"` case where the test
  passes `autoNodeExtraCaCerts: undefined` and expects `null`. Host-dependent, tree-independent.
- `plugins-cli.install` / `server-cron` — `SQLite schema is incomplete or noncanonical … column
  definitions differ for flow_runs` at `/tmp/openclaw-state/state/openclaw.sqlite`.
- `sandbox-explain` — `OpenClawAgentDatabaseMediaMigrationRequiredError … uses schema version 9`
  at `/tmp/openclaw-test-sessions-*.sqlite`.
- `anthropic/session-catalog` — `expected 1785396789645.999 to be 1785396789646`.
- `npm-install-security-scan.release` — isolated: base 77 passed, upstream 78 passed, candidate
  **78 passed**. Its full-suite red was parallel-load flakiness.

### 7.2 The gateway-server shard — hang and worker crash fully cleared

This was the candidate's own uncertainty #4, described there as "the single most likely place
for a real defect to still be hiding". I ran the **whole shard** on the candidate and on frozen
upstream:

```
node scripts/run-vitest.mjs run --config test/vitest/vitest.gateway-server.config.ts --maxWorkers=1
```

| Failure | Upstream `cc48aef1` | Candidate |
| --- | --- | --- |
| `server-cron` › persisted payload tool cap | ✗ | ✗ |
| `server-cron` › cron_changed hooks | ✗ | ✗ |
| `server-plugins` › trusted fallback overrides | ✗ (152,373 ms) | ✗ (159,294 ms) |
| `server-node-session-runtime` › subscribed payload json | ✗ | ✗ |
| **`Error: Worker exited unexpectedly`** | **✗ reproduces** | ✗ |
| `server-restart-sentinel` › targetless config restart note | — passes | **✗ candidate-only** |

The candidate's gateway-server shard differs from frozen upstream by **exactly one test — F1**.
The worker crash and the ~150-second timeout **reproduce identically on upstream**, so the hang
is upstream/environment, not absorb fallout. Both extra failures (F6) also pass in isolation on
all three trees, confirming they are shard-level flakes.

### 7.3 The continuation shard — the absorb strictly improves it

Because `post-compaction-durable-handoff` passes in isolation but fails in the full suite, the
sound control is the owning shard, run on both trees under identical conditions:

```
node scripts/run-vitest.mjs run --config test/vitest/vitest.auto-reply-reply.config.ts --maxWorkers=1
```

| Tree | Failing tests |
| --- | --- |
| Assembly base `16f4b3f1` | **27** |
| Candidate `cad0b99d` | **10** |

The candidate's failing set is a **strict subset** of the base's. Zero new failures. The absorb
*removes* 17 base failures: 7 gateway-scope persistence cases, 3 fast-bootstrap cases, and the
7 `continuation-work-span` cases the candidate repaired in `dda878e7eb4`.

All 10 remaining candidate failures reproduce on base:
`delegate-dispatch-post-compaction` (1), `volatile-map-allowlist` (1),
`post-compaction-release` (4), `post-compaction-durable-handoff` (4).

This is the strongest single receipt in the review: on the shard that owns the entire
continuation feature, the merge is a strict improvement.

### 7.4 The five "inherited" files — four confirmed directly, one corrected

Isolated runs on the assembly base:

| File | Base isolated | Verdict |
| --- | --- | --- |
| `continuation/delegate-dispatch-post-compaction` | 1 failed | inherited ✓ |
| `continuation/post-compaction-release` | 4 failed | inherited ✓ |
| `continuation/volatile-map-allowlist` | 1 failed | inherited ✓ |
| `test/scripts/plugin-sdk-surface-report` | 1 failed | inherited ✓ |
| `continuation/post-compaction-durable-handoff` | **6 passed** | label right, evidence wrong → F3, settled by §7.3 |

The `plugin-sdk-surface-report` failure is the pinned `wildcardReexports: 82` budget versus 81
in source. My independent surface run (§5.8) confirms source is at **81** and that the merge did
not drop an upstream export, so lowering the pinned budget is an owner decision outside absorb
scope — I agree with leaving it.

### 7.5 Net ledger

| Class | Files | Tests |
| --- | --- | --- |
| **Candidate-caused** | **1** | **1** (F1, test-only) |
| Upstream-inherited (proven on `cc48aef1`) | 7 | 18 |
| Base-inherited (proven on `16f4b3f1`) | 5 | 11 |
| Flake (passes isolated on all three trees) | 1 | 1 |

No continuation regression remains unclassified.

---

## 8. Feature invariants

| Invariant | Verdict | Evidence |
| --- | --- | --- |
| `continue_work` / `continue_delegate` / `request_compaction` coherent | HOLDS | `git diff 16f4b3f1..cad0b99d -- src/auto-reply/continuation/` is **empty** — 74 files / 34,151 lines byte-identical to base. Registration preserved via `createOpenClawContinuationTools` (`openclaw-tools.ts:22`) → `createContinueWorkTool` / `createContinueDelegateTool` / `createRequestCompactionTool` (`openclaw-tools.continuation.ts:68,75,79`) |
| Structured delegate return + attachment semantics | HOLDS | `attachments: attachmentsReceipt` (`subagent-spawn.ts:673`); `attachments` / `attachMountPath` still forwarded (`post-compaction-staged-dispatch.ts:363-364`) |
| Post-compaction pre-acceptance retries consume zero depth | HOLDS | continuation dir byte-identical; chain-charge owners unchanged |
| Accepted-child replay idempotent incl. source-less fallback | HOLDS | continuation dir byte-identical |
| Seven-day TTL before materialization/spawn | HOLDS | `classifyPostCompactionDelegateAge` at `post-compaction-staged-dispatch.ts:164` precedes `spawnSubagentDirect` at line 345; file byte-identical to base |
| TaskFlow durable handoff terminalization | HOLDS | failures reproduce identically on base under shard conditions (§7.3); no merge-caused change |
| Trusted delegate-task echo sanitization | HOLDS | trusted-routing marker ported onto upstream's dispatcher and kept in its **own** coalescing domain (§5.1) |
| Status-row visibility | HOLDS | `src/status/status-continuation-line.ts` retained; imported, re-exported and used at `status-text.ts:71,76,543` |
| Upstream architecture adopted, obsolete structure not resurrected | HOLDS | serial wake loop deleted; legacy Codex branch not revived; ingress rework adopted wholesale; deep `src/**` extension mocks removed |

---

## 9. Missing coverage

1. **Signal terminal status-hold coverage was not ported** (candidate §8) — the only
   accepted-test surface this absorb reduces. I verified the justification: the case configured
   `cfg.messages.statusReactions.timing` and `.emojis`, and `StatusReactionsConfig` defines only
   `enabled?: boolean` on **all** of base, upstream, and merged, so it was type-broken rather
   than an accepted contract. Correctly called out rather than dropped silently. Restoring
   equivalent coverage through the harness's real `statusReactionTiming` dependency is a
   reasonable follow-up, not a landing blocker.
2. **`persistInitialChildSessionRuntimeModel` is dead code** — confirmed inherited (already
   unreferenced on the assembly base). Correctly left alone per "do not fix unrelated base
   defects"; worth a follow-up deletion.
3. **Not run by either lane:** `pnpm build`, import-cycle and max-lines ratchets, Docker/E2E.
   `pnpm build` is the notable gap given the merge touches dynamic-import boundaries and bundled
   plugin surfaces, and root AGENTS.md asks for a build when module boundaries or published
   surfaces can change. Recommended before landing, though I found no evidence of a problem.
4. **F1's sibling risk.** F1 proves at least one upstream test assertion was imported without
   being reconciled against assembly production behavior. The shard-level controls in §7.2/§7.3
   bound this class — any other instance would surface as a red, and none did — but the class is
   worth naming.

---

## 10. Commands run

Ancestry, scope, drop hunt:

```
git log -1 --format=%P 9ed7fd20b49ad18e4a99cb299b3ecfc9926cf857
git merge-base --is-ancestor {16f4b3f1,cc48aef1} cad0b99d
git for-each-ref | grep -E 'd8b08c9c|16f4b3f1'
git diff --stat 16f4b3f1060 cad0b99de23
git diff --stat cc48aef1435 cad0b99de23
git diff --name-only f60acee5f66 cad0b99de23        # GitNexus index currency
git diff --name-only 20eda756 16f4b3f1              # 658 assembly-changed paths
```

GitNexus (read-only, existing index):

```
gitnexus impact "Function:src/agents/openclaw-tools.ts:createOpenClawTools" \
  --direction upstream --repo <abs> --depth {1,2}
```

Gates:

```
node scripts/run-tsgo.mjs -p tsconfig.json --noEmit                              → exit 0
node --max-old-space-size=8192 scripts/plugin-sdk-surface-report.mjs --check      → exit 0
node --max-old-space-size=8192 --import tsx \
     scripts/generate-plugin-sdk-api-baseline.ts --check                          → exit 0
```

Controls (per tree, isolated module cache):

```
node scripts/run-vitest.mjs run --maxWorkers=1 <file>
node scripts/run-vitest.mjs run --config test/vitest/vitest.gateway-server.config.ts --maxWorkers=1
node scripts/run-vitest.mjs run --config test/vitest/vitest.auto-reply-reply.config.ts --maxWorkers=1
```

Full suite (sanctioned runner, this worktree) — see §13:

```
node scripts/test-projects.mjs
```

---

## 11. Cartography cross-check

The cartography lane's warning is confirmed and worth restating: **static assembly-vs-upstream
symbol comparison over-predicts breaks; the merged tree is the sound oracle.** My §4.2 detector
is deliberately merged-tree-based for that reason, and its 12 flagged files are all real
merged-tree observations that resolve to documented decisions.

I reproduced the conflict topology independently: 61 content conflicts, zero structural
(modify/delete, rename/rename, rename/delete, add/add) conflicts. Both prior lanes' verdicts
(ABSORB-TRACTABLE; READY-FOR-INDEPENDENT-REVIEW) are consistent with what I found.

---

## 12. Recommendation

**REQUEST_CHANGES**

Required before landing:

1. **F1** — update the stale assertion at `src/gateway/server-restart-sentinel.test.ts:3023` to
   the durable delivery shape (`sessionDeliveryAckId`, `trusted: true`) already asserted by its
   sibling at line 3034. Test-only; no production change.

Recommended, not blocking:

2. Run `pnpm build` (§9.3) — the merge touches dynamic-import and bundled-plugin boundaries.
3. Correct "12 failing tests" to "12 failing files / ~29 tests" (F5), and add the two omitted
   gateway-server files (F6) so the ledger is complete.
4. Do not reuse the `createOpenClawTools` 17/HIGH receipt (F2); the disambiguated figure is
   3 direct / LOW.
5. Operator: finish the stale `/tmp` SQLite sweep (F4) — `/tmp/openclaw-state/state/openclaw.sqlite`
   and `/tmp/openclaw-test-sessions-*.sqlite` — so future suite tallies mean something.

Explicitly **not** blocking: every other red in the candidate. All remaining failing tests are
proven inherited from a frozen parent or flaky, each with a same-environment control run on the
tree that owns them. On the shard that owns the continuation feature the absorb is a strict
improvement (27 → 10 failures, strict subset).

The one design fork worth an owner's eye — whether the global flush barrier should span both
trust domains (§5.1) — is correctly flagged rather than assumed, and is a one-line narrowing if
the owner disagrees.
