# WORKORDER — otel traceparent propagation audit

**Tracking issue**: `karmaterminal/openclaw#553` — UPDATE THIS ISSUE at meaningful checkpoints.
**Worktree**: `/home/figs/flesh_beast_best_beast/openclaw-wt-otel-traceparent-audit-20260503/` (you are here)
**Branch**: `frond-scribe/20260503/otel-traceparent-audit` (already pushed to origin)
**Base**: `frond/v2026.5.2/canonical @ 89bbffa8861506b3c6b3bae9dc3fceb4aebd09f3` (post-#551 squash)
**Journal**: `tmp-drop-me-otel-traceparent-audit.md` at worktree root, committed + pushed at every checkpoint.
**Dispatcher**: 🌿 frond-scribe (this is a frond-scribe lane; RFC §6.X prose authoring is silas's scope, NOT yours).

---

## §0 Frame

You are auditing whether returning delegate spans preserve `traceparent` through the v5.2 canonical line's targeted / cross-session / multi-recipient delivery paths (post-#551). The RFC at `docs/design/continue-work-signal-v2.md` carries an explicit TODO at line 512 assigned to silas/cael; figs's directive at `1500576726609035476` + `1500577568569430209` is "yes on dispatch" — frond-scribe drives this audit.

**Audit scope only.** Your output is **a clean read of where trace-context-propagation lives today and what gaps exist**, not a fix. Writing RFC prose or wiring code is OUT OF SCOPE for this lane (silas owns RFC §6.X authoring; cohort cosign owns code-side wiring on canonical).

## §0a Remote-first push discipline (load-bearing)

Branch is already pushed to origin. From here:

- Commit + push the journal (`tmp-drop-me-otel-traceparent-audit.md`) at every meaningful checkpoint — minimum every 10 minutes of work, every gate-passing milestone, and at declare-done.
- WIP-state pushes are fine and encouraged; polish is not the goal, **reachability is**.
- Recipe:
  ```bash
  echo "- $(date -uIseconds): <what just happened>" >> tmp-drop-me-otel-traceparent-audit.md
  git add tmp-drop-me-otel-traceparent-audit.md && git commit -m "journal: <one-line>"
  git push origin frond-scribe/20260503/otel-traceparent-audit
  ```
- If the agent runs `> 10 minutes` without a checkpoint, push current state with `WIP:` prefix before continuing.

## §0b Tracking issue update discipline

Comment on `karmaterminal/openclaw#553` at these moments (NOT every commit):

1. After §1 reads complete: _"§1 reads done, scope understood, starting audit"_
2. After §2 audit byte-walk produces first concrete finding (gap-or-no-gap on a delivery path): summary + branch SHA
3. On any blocker / ambiguity / hard-stop: shape of the open question
4. On declare-done: report-link + final SHA + verdict (works-fully / partial-gaps / full-gaps)

Use:

```bash
gh issue comment 553 --repo karmaterminal/openclaw --body-file - <<'EOF'
... markdown body ...
EOF
```

## §0d figs's actual RFC feedback — VERBATIM source-of-truth

**READ THIS FIRST**: `figs-rfc-feedback-0807Z-VERBATIM.txt` at worktree root contains figs's full sentence-by-sentence audit (17.9KB, 275 lines). Every Q this workorder asks traces back to specific lines in that file. **Cite line numbers in your journal** when answering Q's.

Critical verbatim quotes you must hold in mind throughout:

**figs at lines 75-82** — The trace-context shape figs wants:

> _"Q: can trace context from the returning child be preserved?_
>
> - - root (traceid: 123..., span: 123)\*
> - -> continue_delegate() child depth 1 (traceid: 123, span:456, parent_span: 123) [that means the delegate was passed traceid]\*
> -      -> depth >1  child delegate chain leaf example (traceid: 123, span:789, parent_span: 456)*
> -           ---> returns keep traceid and parent span, including cross session / echo'd return.*
> - - result: thats a pretty trace, and deeply informative.\*
> - - requires: you must pass the traceID, parent span (so that as spans arrive they can be assembled to traceid: 123 in this example)\*
> - - complexity to implement if not implemented?"\*

**figs at lines 84-88** — The §3.3 / TaskFlow integration question:

> _"3.3 Announce payloads and chain tracking_
>
> - - this is where we should pass trace context on return from something like 'deep child' -> 'root of tree / another session in another channel'?\*
> - - figs doesn't know (this is the out coming back so we have trace context propagation)\*
> - - or somewhere in TaskFlow?\*
> - - tool and token should accept traceID/parent span to propagate? (thats the in)"\*

**figs at lines 156-158** — The chain-budget anti-flood cap (load-bearing for Q7 below):

> _"Chain-budget-capped span emission. A runaway fan-out — most plausibly the multi-recipient delegate-return path from openclaw#355 — MUST NOT flood the trace backend by emitting unbounded queue-lifecycle spans. The cap is the chain-budget step count, not the recipient count:_
> _per-completion fan-out is 1 chain step, regardless of recipient cardinality (per cael's openclaw#355 design direction);"_

## §0c Webhook heartbeat (cohort-visible)

Resolve frond-scribe's webhook:

```bash
WEBHOOK=$(gh variable get DISCORD_SPRITES_WEBHOOK -R karmaterminal/frond-scribe)
```

Heartbeat (use username `frond-scribe-otel-audit-hook` per cohort filter convention):

```bash
curl -sS -H "Content-Type: application/json" \
  -d "{\"username\":\"frond-scribe-otel-audit-hook\",\"content\":\"🤖 otel-audit: <one-line status>\"}" \
  "$WEBHOOK"
```

Fire on:

- §1 reads complete
- Each substantive byte-walk finding
- Each push to the working branch
- Declare-done

## §1 Reads (study scope before byte-walking)

In order, read FULLY:

1. `docs/design/continue-work-signal-v2.md` §3.3 (cross-session targeting), §6 (otel + tracing — entire section), §6.6 (producer-side spans), §6.7 (return-side / sink). The line-512 TODO is in §3.3 area.
2. `src/auto-reply/continuation/cross-session-targeting.test.ts` (post-#551 test coverage; what cases exist)
3. `src/auto-reply/continuation/delegate-dispatch.ts` + `delegate-dispatch.test.ts` (dispatch-side trace propagation)
4. `src/auto-reply/continuation/post-compaction-release.ts` + `post-compaction-release.test.ts` (release-side; this is where the return-deliver fires)
5. `src/auto-reply/continuation/targeting.ts` (targetSessionKey/Keys + fanoutMode resolution; new in #551)
6. `src/infra/session-delivery-queue.ts` + `session-delivery-queue-storage.ts` + `session-delivery-queue-recovery.ts` (the substrate — cross-session enqueue + replay)
7. Search broadly:
   ```bash
   git grep -nE 'traceparent|trace.?context|StartSpanOptions|setSpanContext' src/ -- '*.ts' | grep -v '.test.ts' | head -40
   ```
   Then look at the test-file matches separately.

## §2 Audit byte-walk

For each delivery path, answer:

**Q1 — Producer-side IN (the ingoing traceID/parent_span)**: per figs lines 84-88, _"tool and token should accept traceID/parent span to propagate? (thats the in)"_. Verify:

- (a) does the `continue_delegate(...)` tool descriptor accept a `traceparent` / traceID / parent_span parameter?
- (b) does the `[[CONTINUE_DELEGATE: ...]]` bracket-form parser preserve those params?
- (c) when the substrate enqueues the delegate, does it carry the traceparent into the dispatched delegate's span context? (§6.6 says yes — verify in code.)
- (d) IF the tool/token doesn't accept these params today, what would it take to add them?

**Q2 — Return-side direct (default)**: when a depth-N delegate returns to its DISPATCHING session (default mode), does the returning span thread `traceparent` so the trace-tree links root → depth-N → return-completion?

**Q3 — Return-side targeted (single)**: when `targetSessionKey: <key>` is set (e.g. depth-3 child returns to depth-1 ancestor), does the cross-session return-delivery preserve `traceparent`?

**Q4 — Return-side multi-recipient**: when `targetSessionKeys: [...]` is set, do ALL recipients receive the returning span with `traceparent` preserved?

**Q5 — Return-side fanoutMode**: when `fanoutMode: "tree"` or `"all"` is set, does each enqueued delivery preserve `traceparent`?

**Q6 — Recovery**: when `session-delivery-queue-recovery.ts` replays queued deliveries after a gateway restart, is `traceparent` durably persisted in storage and re-applied at delivery time?

**Q7 — Chain-budget-capped span emission (anti-flood)**: per figs lines 156-158, _"per-completion fan-out is 1 chain step, regardless of recipient cardinality"_. Verify:

- (a) does the multi-recipient delegate-return path (openclaw#355 / post-#551) emit spans capped by chain-budget step count, NOT by recipient count?
- (b) is there a code-level cap that prevents `fanoutMode: "tree"` or `"all"` from flooding the trace backend with unbounded queue-lifecycle spans?
- (c) does any existing test exercise the runaway-fanout scenario to assert the cap holds?
- (d) IF the cap doesn't exist OR is implemented at recipient-count rather than chain-step-count, identify the seam where it should land

For each Q1-Q7, your output in the journal:

- **Status**: `WORKS / PARTIAL / GAP / N/A`
- **Citations**: file:line + brief code excerpt showing the carrier (or its absence)
- **If gap**: identify the specific seam(s) that need wiring (file path + function name + what would need to change)

## §3 Outputs

1. **Journal** at `tmp-drop-me-otel-traceparent-audit.md` — full audit findings, structured per Q1-Q6, evidence-cited
2. **Tracking-issue comments** on #553 per §0b cadence
3. **Final declare-done comment on #553** including:
   - Verdict: WORKS-FULLY / PARTIAL-GAPS / FULL-GAPS
   - Branch SHA at declare-done
   - Path to the journal report
   - List of identified seams (if gaps) — for silas's §6.X authoring

## §4 IF you find gaps — DO NOT FIX

You are auditing, not implementing. If gaps are found:

- Document them precisely in the journal
- DO NOT modify any code-path file in `src/` to add traceparent wiring
- DO NOT modify the RFC `docs/design/continue-work-signal-v2.md`

The reason: the RFC is on the upstream-presentation surface (PR #38780); changes to it must be scope-coordinated. Code-side wiring also needs cohort cosign before landing on the v5.2 canonical line. Silas owns Phase-2.

## §5 Evidence to gather

For the journal:

- Span-creation call-sites (`startSpan`, `tracer.startActiveSpan`, etc.) in producer paths
- Span-end / return paths (`span.setStatus`, `span.end()`)
- Whether `propagation.inject({ traceparent }, carrier)` happens in delivery storage
- Whether `propagation.extract(carrier)` happens at consume / release time
- Test-coverage gaps (do existing tests assert on cross-session trace continuity?)

## §6 Verification

You are NOT writing new tests. You are confirming whether existing tests cover the question.

If existing tests confirm trace-context-propagation works for one of Q1-Q6, cite the test file:line. If no test exists, mark Q as `UNTESTED` (subset of GAP shape).

Run `pnpm tsgo` once at the end to confirm no accidental code edits broke the build. If it errors, you've accidentally edited code — revert and re-audit.

## §7 Declare-done shape

When the audit is complete, declare-done by:

1. Final journal commit + push
2. Final comment on #553 with the verdict, journal-link, identified-seams list
3. Final webhook heartbeat: `🤖 otel-audit DECLARE-DONE: <verdict> — see #553 + journal`

## §8 Explicit don'ts

- DO NOT modify any file in `src/` — audit only
- DO NOT modify `docs/design/continue-work-signal-v2.md` — silas owns Phase-2
- DO NOT close / comment on / modify any other issue or PR — only #553
- DO NOT post to Discord directly — webhook heartbeats only (per cohort discipline; frond-scribe owns Discord posts)
- DO NOT push to any branch other than `frond-scribe/20260503/otel-traceparent-audit`
- DO NOT touch `feature/context-pressure-squashed` (the upstream-presentation branch — savegame canon)
- DO NOT run `pnpm test`, `pnpm check`, or any other build-validation that might mutate generated files (audit pass; tsgo at end is fine)
- DO NOT npm install / npm uninstall openclaw on any host

## §9 Ambiguity resolution

If you encounter:

- **A code path that reads ambiguous** → document in journal as ambiguous, comment on #553 with the specific question, continue with other Q's. DO NOT guess.
- **A code path you can't find** → grep harder before declaring it doesn't exist; if truly absent after `git grep` exhaustive search, mark as N/A or GAP-ABSENT
- **A schema/test that contradicts the RFC** → document the contradiction; this is the whole point of an audit

When stuck, fire a webhook heartbeat with the question shape. frond-scribe sees the channel and directs.

## §10 Time budget

This is **a single focused session** per silas's framing. Estimated 30-60 minutes of byte-walk + report. If you're past 90 minutes without a clear verdict, declare-done with whatever you have — partial-audit > stalled-audit.

---

🌿 **frond-scribe — dispatching with care; the audit is yours, the design call is silas's, the deploy ceremony is figs's. Each at the right layer.**
