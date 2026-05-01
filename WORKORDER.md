# WORKORDER — RFC↔code alignment audit (continue-work-signal-v2)

## Strategic framing

Per figs's directive 2026-05-01 ~19:50Z:

> _"copilot also needs deep examination of RFC for correctness. deep; its a long document. it should identify all claims in code, all features in code; align to manner of discussion in existing rfc text (i.e. the depth to which feature is discussed must be maintained) - goal: the rfc is correct vs its PR code"_

**Goal**: deeply audit `docs/design/continue-work-signal-v2.md` against the actual implementation on `cael/325-canonical2` continuation feature surface. Output a structured discrepancy report; figs/cohort uses it to update the RFC so it correctly describes what the code actually does, at the depth-of-discussion the RFC already establishes.

**This is the substrate of figs's "the feature is hard to look away from" memory** — the RFC is a load-bearing document for upstream-PR-presentation. RFC-correctness directly affects how upstream openclaw maintainers receive the continuation feature. Drift between RFC and code is the strongest red flag a reviewer can raise. We close that gap before presenting.

## §0 — guardrails

- Operate ONLY in `/home/figs/flesh_beast_best_beast/openclaw-wt-rfc-alignment-audit/`
- **Never read, write, list, or shell into `/home/figs/flesh_beast_tmp/openclaw/`** — that's seal-boy / ronan-the-prince's runtime tree
- Push to `frond-scribe/441-rfc-alignment-audit` only (forward-only commits)
- This is a READ-ONLY audit lane — **do NOT edit `docs/design/continue-work-signal-v2.md` itself**. The audit produces a discrepancy report; the RFC update happens in a separate follow-up PR (probably by 🌊 or whoever drives the canonical-lineage RFC-pass)
- The deliverable is a structured findings document; commit + push that
- Discord webhook for heartbeat: `DISCORD_SPRITES_WEBHOOK` repo variable on `karmaterminal/frond-scribe`. Username for posts: `swim-v39-rfc-audit`

## §1 — read-first (CRITICAL: read the RFC end-to-end before walking code)

The RFC at `docs/design/continue-work-signal-v2.md` is **1400 lines**. Read it **end-to-end, no summary, no skim**. Per figs's directive: "the depth to which feature is discussed must be maintained" — you can only audit the depth-fit if you've read every section in its full register.

Note the document's structure as you read:

- What sections exist (table of contents shape)
- What features each section discusses
- What level of depth each section uses (one-paragraph summary vs full step-by-step protocol vs algorithmic detail vs etc.)
- What claims are made about runtime behavior, state transitions, contracts
- What examples are given
- What edge cases are surfaced

Build a mental (or scratch-file) index of "RFC claim X discussed at depth Y in section Z."

## §2 — code surface walk

The continuation feature surface on canonical2:

```
src/auto-reply/continuation/**              (core continuation runtime)
src/auto-reply/reply/continuation-*.ts      (reply integration)
src/auto-reply/reply/post-compaction-*.ts   (post-compaction delegate dispatch)
src/auto-reply/reply/reply-run-*.ts         (run lifecycle)
src/agents/subagent-announce.ts             (subagent announce wake)
src/agents/subagent-spawn.ts                (subagent registration / continuation)
src/agents/tools/continue-work-tool.ts      (the continue_work tool itself, if exists)
src/agents/tools/continue-delegate-tool.ts  (delegate tool, if exists)
src/agents/tools/request-compaction-tool.ts (compaction-trigger tool)
src/infra/continuation-tracer.ts            (OTEL/diagnostic tracing)
src/infra/heartbeat-runner.ts               (heartbeat substrate, if continuation-touched)
src/config/zod-schema.continuation*.ts      (continuation config zod schemas)
src/auto-reply/reply/queue/*.ts             (queue substrate the continuation rides on)
extensions/diagnostics-otel/**              (diagnostic adapter, if continuation-touched)
src/plugin-sdk/diagnostic-runtime.ts        (SDK seam continuation-tracer flows through)
```

(Adjust globs as you discover the actual continuation surface; the above is a starting scope.)

For each file, identify:

- **CLAIMS in code** — what does the code actually do at the level of: state transitions, contracts, error handling, fall-back behavior, persistence semantics, restart behavior, locking/mutex shapes, queue substrate ordering, tool invocations, span emissions, config-key reads
- **FEATURES in code** — what user-visible features the code provides: `continue_work`, `continue_delegate`, `request_compaction`, post-compaction enrichment shards, hedge-armed redundant fires, blocked-liveness markers, taskflow sqlite substrate, etc.

Don't summarize loosely. Pin claims to file:line citations.

## §3 — alignment cross-walk

This is the substantive work. For each (RFC-section, code-claim) pair:

**Class A — RFC says X / code does X-equivalent (alignment)**

- Mark aligned. No action needed. (But cite both sides for the report.)

**Class B — RFC says X / code does Y (drift)**

- Discrepancy. Document precisely: RFC quote (with line citation), code quote (file:line citation), specific axis of drift (semantic, ordering, error-handling, etc).
- Recommendation: either RFC-needs-update, or code-needs-update, or both-need-clarification — your judgment based on what the better truth is.

**Class C — RFC describes feature at depth N / code implements at depth M ≠ N (depth-fit drift)**

- E.g. RFC has full protocol-level step-by-step for feature A but code has glossed-over implementation; or RFC has one-line mention for feature B but code has rich state-machine.
- Document where the depth-fit is off. The figs-directive specifically calls this out: "the depth to which feature is discussed must be maintained."

**Class D — code has feature / RFC silent (under-described)**

- Real feature exists in code, RFC has no mention.
- Examples: hedge-armed redundant-fire timer (just discovered today on `delegate-dispatch.ts:33` `hedgeTimers`); per-host TaskFlow registry isolation (per OV-2 finding); `attachedBackendByOperation` WeakMap.
- Recommendation: add RFC section at appropriate depth.

**Class E — RFC describes feature / code silent (over-described)**

- RFC mentions feature; no implementation found.
- Could be aspirational design that wasn't built; could be feature removed without RFC update.
- Recommendation: either remove from RFC (if dropped) or implement (if still wanted).

## §4 — produce structured findings document

Commit `RFC-ALIGNMENT-AUDIT-FINDINGS.md` at branch root. Suggested structure:

```markdown
# RFC↔Code Alignment Audit — continue-work-signal-v2

Scope: docs/design/continue-work-signal-v2.md (NNNN lines)
Code surface: continuation feature on cael/325-canonical2 @ <SHA>
Audit date: 2026-05-01
Lane: frond-scribe/441-rfc-alignment-audit (dispatched workorder)

## Methodology

[1-2 paragraphs on read-walk-cross-walk approach]

## Summary

- Class A (aligned): N findings
- Class B (drift): N findings — see §B
- Class C (depth-fit drift): N findings — see §C
- Class D (under-described): N findings — see §D
- Class E (over-described): N findings — see §E

[overall verdict: how aligned is the RFC, in 2-3 sentences]

## §A — Aligned (sample 5-10 representative findings; full table appendix)

[per finding: RFC-section + code-citation + 1-line "matches"]

## §B — Drift findings

[per finding:

- RFC quote + line range
- Code citation + file:line
- Drift axis (semantic / ordering / error-handling / etc)
- Recommendation
  ]

## §C — Depth-fit drift findings

[same shape as §B]

## §D — Under-described in RFC

[per finding:

- Feature in code (file:line + brief shape)
- Why it matters / what depth it should land in RFC
- Suggested RFC section + insertion point
  ]

## §E — Over-described in RFC

[per finding:

- RFC quote + line
- Why no implementation found (search results)
- Recommendation: remove vs implement vs clarify-as-aspirational
  ]

## Appendices

- Appendix 1 — full RFC section index (1 line per section)
- Appendix 2 — full code-claim cross-reference table
- Appendix 3 — git pickaxe receipts for any "code says X but git history says X' was meant" findings

## Self-receipt

- Lane SHA on declare-done: <commit>
- Wall time: <minutes>
- Tokens used (if reportable): <approx>
- Confidence: <high/medium/low + rationale>
```

## §5 — heartbeat shape

Heartbeat to Discord after each meaningful checkpoint:

```bash
WEBHOOK=$(gh variable list -R karmaterminal/frond-scribe --json name,value | jq -r '.[] | select(.name=="DISCORD_SPRITES_WEBHOOK") | .value')
curl -sS -H "Content-Type: application/json" \
  -d "{\"username\":\"swim-v39-rfc-audit\",\"content\":\"🤖 RFC-audit: <one-line status>\"}" \
  "$WEBHOOK"
```

Heartbeat after:

- §1 RFC read complete (note any structural surprises)
- §2 code surface walk complete (note any features found beyond initial scope)
- §3 cross-walk complete (note rough class counts: A/B/C/D/E)
- §4 findings doc committed + pushed

## §6 — declare done

Final state:

- `RFC-ALIGNMENT-AUDIT-FINDINGS.md` committed + pushed on branch `frond-scribe/441-rfc-alignment-audit`
- All §1-§5 heartbeats sent
- Final Discord heartbeat: `🤖 RFC-audit: declare-done; A=N B=N C=N D=N E=N at <SHA>; report ready for figs/cohort review`
- No source modifications outside the findings doc and (optionally) a brief `WORKORDER.md` updates with declare-done timestamp

## §7 — what NOT to do

- Do NOT edit `docs/design/continue-work-signal-v2.md` itself — the audit produces a report; RFC updates happen in a separate follow-up
- Do NOT modify any production source file — strict read-only audit
- Do NOT skim the RFC — figs explicitly said "deep examination" and "depth must be maintained"
- Do NOT claim alignment for sections you didn't actually read end-to-end
- Do NOT generate findings from imagination — every finding must be backed by RFC-line + file:line citations
- Do NOT compress findings into "looks fine to me" prose — figs needs the specific drifts, with recommendations

## Acceptance / handoff

If you complete the audit + findings doc lands clean: declare done. Cohort + figs review at their pace; the RFC update lane opens with this findings doc as input.

If you hit a real blocker (e.g. RFC sections that resist alignment-audit because they're aspirational/philosophical/not-claim-shaped, or code that resists analysis because of ambient runtime context): journal the blocker shape + surface to channel; do NOT guess.
