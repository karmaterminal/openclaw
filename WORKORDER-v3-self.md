# WORKORDER — RFC↔code v3-self-review audit (delta from canonical2 baseline)

## STRATEGIC FRAMING — READ BEFORE STARTING

**You are reviewing your own work.** This branch (`frond-scribe/20260429/rebase-copilot-v3 @ f8fec1c4e8`) is the v2026.4.29 exploratory rebase candidate that you (a prior copilot lane) authored over the last few hours. This audit is **copilot self-reviewing the copilot v3 candidate as if presenting upstream at v2026.4.29**.

Per figs's directive 2026-05-01 ~20:08Z:

> _"yes to B - copilot may be confused of context looking back and forth across versions. thats not wondrous, but it does from this get an idea then of 'what changed from 2026.4.24 -> .29', so lets turn its work to our advantage. be super clear about targets of the work for assessment of 2026.4.29 works (i.e. its reviewing its own branch)"_

**Targets explicit**:

- **Anchor (this audit)**: `frond-scribe/20260429/rebase-copilot-v3 @ f8fec1c4e8cbc6e30238ff66753a620dd2b26898` — the v29-rebased candidate, you operate in this worktree
- **RFC under audit**: `docs/design/continue-work-signal-v2.md` AS IT EXISTS ON THIS BRANCH (the v3-side RFC; may or may not have v29-side adjustments vs canonical2)
- **Code under audit**: continuation feature surface AS IT EXISTS ON THIS BRANCH (post-rebase + v29-tweak: 8-ambient `loadConfig` route through repo runtime-config-accessor; 3 test-mock additions; `agentDir?` on `RegisterSubagentRunParams`; `serialized?` on `SessionStoreCacheEntry`; `studies` in `dup:check`)

**Baseline (already done)**: prior copilot lane completed canonical2-side audit at `frond-scribe/441-rfc-alignment-audit @ 881c44f03e` on `cael/325-canonical2 @ 9b31762f611`. That audit produced:

- A=12 / B=8 / C=5 / D=9 / E=5 (aligned / drift / depth-fit drift / under-described / over-described)
- Deliverable: `RFC-ALIGNMENT-AUDIT-FINDINGS.md` on that branch
- 8m 40s wall, 4.7M cached tokens

**Your job**: produce the **delta** from that baseline. What's different on v3 vs canonical2 that affects RFC↔code alignment? Most findings should carry unchanged (continuation surface composed cleanly: 16 compose / 3 supersede-up / 0 supersede-co / 0 merge-required per `RECOMMENDED-PATH.md` on this branch). But:

- **v3-only deltas** (the 5 areas copilot v3 touched during rebase): may shift Class B (drift) or Class D (under-described) findings on canonical2 baseline
- **Anything else** that the canonical2 audit may have missed because it operated on a different SHA

## §0 — guardrails

- Operate ONLY in `/home/figs/flesh_beast_best_beast/openclaw-wt-rfc-audit-v3-self/`
- **Never read, write, list, or shell into `/home/figs/flesh_beast_tmp/openclaw/`** — that's seal-boy / ronan-the-prince's runtime tree
- Push to `frond-scribe/441-rfc-alignment-audit-v3` only (forward-only commits)
- READ-ONLY audit lane — do NOT edit `docs/design/continue-work-signal-v2.md` or any production source. The audit produces a delta-report; the RFC update happens in a separate follow-up PR.
- Discord webhook for heartbeat: `DISCORD_SPRITES_WEBHOOK` repo variable on `karmaterminal/frond-scribe`. Username for posts: `swim-v39-rfc-audit-v3`

## §1 — read-first (CRITICAL)

1. **Read the canonical2-side baseline findings**: `git show origin/frond-scribe/441-rfc-alignment-audit:RFC-ALIGNMENT-AUDIT-FINDINGS.md` — this is your starting reference. Don't re-derive what's already been derived. Use it as the comparison anchor.

2. **Read the RFC end-to-end**: `docs/design/continue-work-signal-v2.md` (~1400 lines). Read in full — no skim. Note any divergence vs the canonical2 RFC if you can detect it.

3. **Read the v3-specific delta artifacts**:
   - `RATIFICATIONS.md` — figs's Q1/Q3/Q4 + Q2 deferral + 🌻's Q4 byte-walk evidence
   - `RECOMMENDED-PATH.md` — bucket ledger 16/3/0/0 + the 8-ambient `loadConfig` fix-shape
   - `OV-5-AWARENESS.md` — handoff doc on OV-5 work in flight on canonical2
   - `tmp-drop-me-rebase-v29-v3.md` — v3 journal

4. **Identify the v3-side adjustments vs canonical2** (per `RECOMMENDED-PATH.md`):
   - 8-ambient `loadConfig` sites refactored to runtime-config-accessor (`subagent-announce.ts`, `auto-reply/continuation/config.ts`, `auto-reply/reply/continuation-runtime.ts`, `auto-reply/reply/post-compaction-delegate-dispatch.ts`)
   - `subagent-announce.runtime.ts` re-export of `loadConfig`
   - `subagent-announce.{test,timeout.test}.ts` mock additions
   - `subagent-registry-spawn-runtime.ts` `agentDir?` add
   - `store-cache.ts` `serialized?` add
   - `scripts/check-duplicates.mjs` `studies` add

These are mostly mechanical refactors / type-shape adjustments. RFC↔code alignment SHOULDN'T shift much, but:

- Does the RFC describe `loadConfig` semantics? If yes, does the v3 refactor change the contract the RFC describes? (Likely "no" — same config keys, just routed through a runtime-accessor seam — but VERIFY by reading the RFC's config section + the new accessor pattern.)
- Does the RFC describe `serialized` field semantics? (Probably new vs canonical2's RFC era; if yes, does the new field need RFC documentation?)

## §2 — produce delta findings

Commit `RFC-ALIGNMENT-AUDIT-V3-DELTA-FINDINGS.md` at branch root. Suggested structure:

```markdown
# RFC↔Code Alignment Audit — v3 Self-Review (delta from canonical2 baseline)

**Anchor**: frond-scribe/20260429/rebase-copilot-v3 @ f8fec1c4e8 (v29-rebased candidate)
**Baseline**: frond-scribe/441-rfc-alignment-audit @ 881c44f03e (canonical2 audit; A=12 B=8 C=5 D=9 E=5)
**RFC**: docs/design/continue-work-signal-v2.md (NNNN lines on this branch)
**Audit framing**: copilot self-reviews own work as if presenting upstream at v2026.4.29

## Methodology

[1-2 paragraphs on baseline-cross-walk approach; you are NOT re-deriving full A/B/C/D/E — you are computing v3-deltas]

## Delta summary

- **Δ-A** (newly aligned vs canonical2 baseline): N findings
- **Δ-B** (newly drifted vs canonical2 baseline): N findings
- **Δ-C** (depth-fit drift introduced by v3 rebase): N findings
- **Δ-D** (newly under-described — v3 added feature, RFC silent): N findings
- **Δ-E** (newly over-described — v3 removed feature, RFC still describes): N findings
- **Carries-from-baseline**: N findings unchanged (cite by §-section in canonical2 baseline doc)

## §Δ-A — Newly aligned (v3 fixed something canonical2-baseline flagged)

[per finding: cite baseline finding, show v3-side fix, evidence]

## §Δ-B — Newly drifted

[per finding: RFC quote + v3 code citation + drift axis + recommendation]

## §Δ-C — Depth-fit drift introduced

[same shape as Δ-B]

## §Δ-D — v3-added features RFC silent on

[per finding: feature in v3 code (file:line + brief shape) + why it matters + suggested RFC insertion point]

## §Δ-E — v3-removed features RFC still describes

[per finding: RFC quote + line + verification that v3 has no implementation]

## Notable observations

- v3-side `loadConfig`-refactor: did it shift any RFC alignment? [yes/no + cite]
- v3-side `serialized?` add: did it shift any RFC alignment? [yes/no + cite]
- v3-side mock-additions: visible in test-side; usually doesn't shift RFC alignment

## Carries-unchanged from canonical2 baseline

[brief table — section-references to canonical2 doc; "Class A finding §A.3 carries unchanged" etc]

## Self-review note

[as you finish: any v3-specific frame that the canonical2 audit might have missed because operating on different SHA?]
```

## §3 — heartbeat

Heartbeat to Discord webhook (resolve via `gh variable list -R karmaterminal/frond-scribe ...`) using username `swim-v39-rfc-audit-v3`:

- after baseline read complete
- after v3 RFC read complete
- after delta cross-walk complete
- after findings doc committed + pushed

## §4 — declare done

Final state:

- `RFC-ALIGNMENT-AUDIT-V3-DELTA-FINDINGS.md` committed + pushed on `frond-scribe/441-rfc-alignment-audit-v3`
- Final heartbeat: `🤖 RFC-audit-v3: declare-done; Δ-A=N Δ-B=N Δ-C=N Δ-D=N Δ-E=N + N-baseline-carries at <SHA>`
- READ-ONLY: no production source modified

## §5 — what NOT to do

- Do NOT re-derive what canonical2 audit already established — leverage the baseline
- Do NOT edit RFC or production source — read-only audit
- Do NOT skim the RFC or skip baseline read — figs explicitly says "be super clear about targets"; that requires having both RFC + baseline-findings in head
- Do NOT confuse this audit's scope with the canonical2 audit's scope — you are the v3-side audit; baseline is the canonical2-side audit
- Do NOT include findings from "v3 is bad" or "feature is wrong" — this is RFC↔code alignment, not code-quality review
- Do NOT cite line numbers without verifying the line range exists on THIS branch (canonical2-baseline citations may have drifted on v3 due to rebase)

## §6 — efficiency goals

Cohort exemplar: 🌊's source-walk lane (4min wall + ~10min compose) at smallest scope, your prior canonical2 audit (8m40s wall + 4.7M cached tokens). This v3-delta audit should be **smaller** — most findings carry from baseline; you compute deltas only. Target: ~15-20min wall + ~2-3M tokens (vs 8m40s + 4.7M for full audit).

If you find yourself re-deriving > 50% of the baseline, you're auditing fresh instead of computing delta — STOP and re-anchor.

## Acceptance / handoff

If you complete the delta-findings doc + push: declare done. The cohort + figs review at their pace; the RFC update lane (whoever drives it) reads this delta-findings doc alongside the canonical2 baseline to update the RFC consistently across both lineages.

## Self-review framing reminder

This is **copilot reviewing copilot's own v3 work**. Be honest about what you (the prior lane) shifted vs what was already there on canonical2. The point isn't to look-good or look-bad; the point is to surface drift so figs can present a coherent v29-PR-candidate upstream when the time comes. Findings here become the substrate for the eventual canonical-lineage drive's RFC update PR.
