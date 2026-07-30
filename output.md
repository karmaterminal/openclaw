# 1172 upstream absorb — independent review

Lane branch: `codeagent/1172-absorb-independent-review-opus5`
Bound issue: karmaterminal/openclaw#1197 (tracking also #1198, openclaw/openclaw#85651, Project 85)
Role: **fresh independent reviewer**. Review-only — no product edit, no merge, no rebase,
no cherry-pick, no shared-ref push, no presentation motion.

Reviewed candidate frozen at `cad0b99de23822698d477ac7b1618a3e8ce22ae8`. Later upstream
movement was deliberately not chased.

> **Status: draft in progress.** Recommendation is stated in §12 and is final only in the
> pushed terminal revision of this file.

---

## 1. Ancestry — verified, not trusted

Every SHA in the workorder was resolved in this worktree and its parent relationships checked.

| Role | SHA | Parents | Verified |
| --- | --- | --- | --- |
| Assembly base | `16f4b3f106033f7fe75f68e67563db1b5b4d0e2f` | `2a5bfaad811` | yes |
| Frozen upstream | `cc48aef143551af2ce13096264335ce9954e61e6` | `fa0bced5446` | yes |
| True merge | `9ed7fd20b49ad18e4a99cb299b3ecfc9926cf857` | `16f4b3f1060` **+** `cc48aef1435` | yes |
| Review candidate | `cad0b99de23822698d477ac7b1618a3e8ce22ae8` | `dda878e7eb4` | yes |
| Protected presentation | `d8b08c9c0a1f425f4cfff1b21bff4852deff823f` | `9c66907106c` | yes |

- `9ed7fd20` is a **true two-parent merge** whose parents are *exactly* the frozen assembly
  base and the frozen upstream candidate. Not a rebase, squash, or cherry-pick reconstruction.
- `git merge-base --is-ancestor` confirms **both** `16f4b3f1` and `cc48aef1` are ancestors of
  `cad0b99d`, so no history was dropped after the merge.
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
- Neither was checked out, fetched into, or written by this review lane.

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
root `AGENTS.md`. **No production source moved after the index**, so the graph is a sound
oracle for this review.

As on the cartography lane, GitNexus **MCP tools are not exposed in this Copilot process's
tool surface**. Mitigation: the read-only CLI (`impact`, `context`, `status`, `list`) against
the existing index. No `analyze`, no re-index — the graph was not mutated by this review.

### Blast radius — and a correction to the candidate's receipt

The candidate's §3 reports `createOpenClawTools` at **17 direct dependants / HIGH / 3 modules**.
That number is a **name-ambiguity artifact**. The registry holds **10** symbols named
`createOpenClawTools`; nine are test-local helper functions. Disambiguated to the production
symbol:

```
gitnexus impact "Function:src/agents/openclaw-tools.ts:createOpenClawTools" \
  --direction upstream --depth 1   → impactedCount 3,  risk LOW,  modules 2
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

This **strengthens** the candidate's conclusion rather than weakening it — the true production
blast radius is smaller than claimed — but the receipt as written overstates risk and should
not be reused verbatim. Filed as F5.

---

## 3. Findings, ordered by severity

### F1 — MEDIUM · candidate-caused · test-only · **must fix before landing**

**`src/gateway/server-restart-sentinel.test.ts` → "preserves an explicit targetless config restart note"**

This is the only red in the entire candidate that is *caused by the merge*. Both parents are
green and the merge is red:

| Tree | Result |
| --- | --- |
| Assembly base `16f4b3f1` | **75 passed** |
| Frozen upstream `cc48aef1` | **73 passed** |
| Candidate `cad0b99d` | **77 passed / 1 failed** |

Root cause, established by reading both parents rather than inferring:

- Upstream added the test (`cc48aef1:src/gateway/server-restart-sentinel.test.ts:2707`); it is
  absent from the assembly base.
- Upstream's assertion encodes upstream's *pre-assembly* delivery shape:
  `enqueueSystemEvent("restart message", { sessionKey })`.
- The assembly changed that same `!sessionKey` fall-through to route through durable session
  delivery, so merged production correctly emits
  `enqueueSystemEvent("restart message", { sessionKey, sessionDeliveryAckId, trusted: true })`.
- The merge imported upstream's assertion **verbatim** without reconciling it against the
  assembly's production shape.

Observed failure output (candidate):

```
AssertionError: expected "vi.fn()" to be called with arguments: [ 'restart message', …(1) ]
Received: [ "restart message", {
+   "sessionDeliveryAckId": "session-delivery-1",
    "sessionKey": "agent:main:main",
+   "trusted": true,
} ]
Number of calls: 1
```

**The restart note is not lost.** It is delivered, durably, with the trusted marker. This is a
stale assertion, not a behavior regression — severity is capped at MEDIUM for that reason.

The file is **internally inconsistent**, which is the clearest proof: its sibling test
`durably wakes the main session when the sentinel has no sessionKey`, eleven lines below at
`src/gateway/server-restart-sentinel.test.ts:3034`, exercises the *same* code path and already
asserts the assembly shape including `sessionDeliveryAckId: "session-delivery-1"` and
`trusted: true`. One of the two imported assertions was reconciled and the other was not.

**Best fix** (owner's call, not applied here — this lane is review-only): update the imported
assertion at `src/gateway/server-restart-sentinel.test.ts:3023` to the durable shape already
used by its sibling. No production change is warranted; production is behaving to the
assembly's accepted contract.

### F2 — LOW · classification is wrong, conclusion is not

**`src/auto-reply/continuation/post-compaction-durable-handoff.test.ts` is not "inherited".**

The candidate lists this file under §11 "inherited" with 4 failures. Control runs falsify that
label:

| Tree | Isolated run |
| --- | --- |
| Assembly base `16f4b3f1` | **6 passed** |
| Candidate `cad0b99d` | **6 passed** |

It passes on *both* trees in isolation, so it is neither inherited-from-base nor
candidate-caused; its full-suite red is an **ordering / shared-state artifact**. The four
full-suite failures do belong to this file (`consume claims the row without terminalizing it`,
`finalize after handoff terminalizes the row so recovery cannot replay it`, `re-staging before
finalize preserves a delegate when the durable persist fails`, `startup recovery boot cutoff
skips rows claimed by live traffic after process start`).

This matters because this file is the **TaskFlow durable-handoff terminalization** invariant
surface named in the workorder. The candidate's stated evidence (continuation dir
byte-identical) is true but does not explain the failure, so the invariant was effectively
unproven. Shard-level control is reported in §7.

### F3 — INFO · the other six untriaged files are upstream-inherited or flaky, proven

Full treatment in §6.

### F4 — INFO · operator · stale SQLite residue still breaks all three trees

Full treatment in §6.3.

### F5 — LOW · receipt accuracy · `createOpenClawTools` blast radius overstated

See §2. Reported 17/HIGH; disambiguated production symbol is 3 direct / LOW.

### F6 — INFO · bookkeeping

The candidate's §10 and the workorder both say "**12 known failing tests**". The table below it
enumerates **12 failing *files*** totalling **~29 failing tests** (11 in the five "inherited"
files, 18 in the seven "untriaged" files). Worth correcting so the number is not carried
forward as a test count.

---

## 4. Silent auto-merge drop hunt

The workorder asks for drops found by merged-tree evidence, not conflict markers. I ran two
independent detectors over the merged tree.

### 4.1 Whole-file drops

For all **658** paths the assembly changed relative to the merge base
(`20eda756fae6599bc9d776815016f555a64d77d6`), find files where the merged blob equals the
**upstream** blob exactly while assembly differed from upstream — i.e. the assembly's version
was discarded wholesale.

Result: **21 files**, all `apps/android/wear/src/main/res/values-*/strings.xml`.

Key-set audit on those 21: **0 assembly keys absent from the merged tree.** Upstream's rows are
a superset — upstream added real localized strings for the same generated `native_*` keys the
assembly carried as English placeholders. Taking upstream wholesale is lossless here.

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

I then verified the replacements actually landed:

- `findLatestRunForChildSession` → `getLatestSubagentRunByChildSessionKeyFromRuns` at all call
  sites (`src/agents/subagent-registry-queries.ts:285,303,345,370,385,472`); repo-wide grep for
  the old name returns **nothing**.
- `already_compacted_recently` → `already_compacted` in the closed union
  (`src/agents/embedded-agent-runner/compact-reasons.ts:25,46,101,102,141`); repo-wide grep for
  the old code returns **nothing**.
- `markTerminalBroadcasted()` survives at both broadcast sites, and the §5.8 placement claim is
  accurate: `src/gateway/server-methods/chat-send-dispatch-errors.ts:211` sits *inside* the
  `!agentTerminalPersistenceOwnedAtDispatchReject` guard, immediately before `broadcastChatError`
  (line 212). Upstream's aborted early-return performs no broadcast and correctly carries no
  mark.

Conclusion: **no accepted assembly behavior was silently dropped.**

---

*(sections 5–12 completed in the terminal revision)*
