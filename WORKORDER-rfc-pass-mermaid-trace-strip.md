# WORKORDER — RFC pass: mermaid docs + trace implementation assurance + karmaterminal-fork ref strip

**Tracking issue**: TBD (file in `karmaterminal/openclaw` after §1 reads complete; label `feature-continuation,code-agent`)
**Worktree**: `/home/figs/flesh_beast_best_beast/openclaw-wt-rfc-pass-20260503/` (you are here)
**Branch**: `frond-scribe/20260503/rfc-pass-mermaid-trace-strip` (already pushed to origin)
**Base**: `frond/v2026.5.2/canonical @ 52fe6cf944` (post all v5.2 stack merges + #570 dev-detritus drop)
**Journal**: `tmp-drop-me-rfc-pass-journal.md` at worktree root, committed + pushed every checkpoint.
**Dispatcher**: 🌿 frond-scribe.

---

## §0 Frame

The RFC at `docs/design/continue-work-signal-v2.md` ships with the feature into the upstream-PR-presentation form (`feature/context-pressure-squashed`) for `openclaw/openclaw#38780`. Three passes needed before the squash:

1. **Mermaid docs assurance** — every mermaid diagram in the RFC needs a correctness check against shipped implementation. Drift = update.
2. **Trace implementation assurance** — §6.6 / §6.7 / §6.8 trace-context prose needs alignment with what PR #560 actually wired. Document any deviations from §6.8 spec that the wiring lane chose (per the "MAY deviate from §6.8 prose" caveat in #560's workorder).
3. **Karmaterminal-fork reference strip** — drop fork-specific marks in the RFC (issue refs, branch refs, swim-cycle refs, prince emojis, cohort jargon). Same discriminator family as the #568 strip-marks PR but for the RFC document, not test files.

**Your output**: ONE comprehensive PR with the three passes applied. RFC reads cleanly upstream.

## §0a IMPORTANT CAVEATS

### You MAY adjust §6.8 prose to reflect what shipped

Per the #560 wiring-lane caveats, the implementation could deviate from §6.8 spec when:

- Impossible to solve given current substrate
- Contrary to W3C trace-context / OTel best practices
- Hot-path strain or blocks normal operation

If your byte-walk of the wiring code finds deviations, **update the §6.8 prose to match the shipped reality** + add a brief "implementation note" subsection documenting the deviation rationale. The spec should describe what's real, not what was planned.

### Sampling reality (preserved from #560 workorder)

The wired substrate has zero overhead when `traceparent` is absent or collection inactive. The RFC prose should reflect this — "OPTIONAL traceparent, MUST NOT be on hot path, MUST degrade gracefully when absent". If §6.8 prose currently states something stricter, soften.

### #559 substrate follow-up

Issue `karmaterminal/openclaw#559` flags additional gaps the wiring exposed (continuation tracer link primitive, fresh span context extraction). **DO NOT try to resolve #559 in this lane** — it's a separate substrate-work issue. Just note it in §6.8 if the prose currently implies a contract the substrate can't yet fulfill, and reference #559 as the follow-up tracking surface (BUT strip the ref-number from the prose; the ref-number citation is karmaterminal-internal — see §0b).

## §0b Discriminating fork-specific refs from upstream-meaningful refs

### DROP (karmaterminal-fork-specific)

**1. Karmaterminal repository URLs / issue refs**:

- `karmaterminal/openclaw#NNN` (any number)
- `karmaterminal/openclaw-bootstrap#NNN` (any number)
- `karmaterminal/karmaterminal-openclaw-docs/...`
- `frond-scribe/...` branch references in prose

**2. Cohort PR/issue numbers (typically < ~1000)**:

- Bare `#NNN` references where NNN is a known karmaterminal issue (e.g. `(#552)`, `(#557)`, `(#560)`, `(#449)`, etc.)
- Recent merge cluster: `#558`, `#560`, `#561`, `#562`, `#563`, `#564`, `#565`, `#568`, `#570`, `#553`, `#555`, `#557`, `#559`
- Test-trap walker output: `#441` through `#455`
- Older cohort refs: `#321`, `#322`, `#326`, `#335`-`#337`, `#355`, `#463`, `#505`, `#532`-`#547`
- **Verification**: if uncertain, `gh issue view NNN --repo karmaterminal/openclaw --json title` — if it cites cohort/swim/canonical2/v52 substrate, drop

**3. Swim-cycle / canonical-line / v-rotation references**:

- `swim-3X`, `swim-4X` (swim-39, swim-40, swim-41, swim-42)
- `canonical2`, `v52-uptake`, `v29-uptake`, `v24-base`
- `frond/v2026.5.2/canonical`, `frond-scribe/20260429/v3-cohort-fixes` branch refs in prose
- "the cohort", "post-canonical2 rotation", "the v5.2 canonical line", etc — reframe to generic substrate-language

**4. Cohort-internal jargon + prince attribution**:

- 🌊 🩸 🌫 🌻 (prince emojis)
- "byte-walk", "byte-pin", "cohort-cosign", "cohort-recognition-engine"
- "🌊 said...", "per 🩸's byte-walk", "silas-shape", etc.
- Date-stamped cohort SHAs like `1e966b8a70` (the audit final journal SHA)

**5. Point-in-time history comments**:

- "Per 2026-05-03 cohort cycle...", "during the v52-uptake...", "post-#551 squash..."
- "The frond converged on...", "swim-41 OV-1 PASS..."

### KEEP (upstream-meaningful or generic)

**1. Upstream openclaw issue refs** (4-5+ digit numbers):

- `openclaw/openclaw#NNNNN` URLs — preserve
- Bare `#NNNNN` where NNNNN is a verifiable upstream issue

**2. Standards / specifications**:

- W3C trace-context references
- OpenTelemetry / OTel SDK references
- RFC-style standard citations (RFC 7234, etc.)

**3. Intra-document section anchors**:

- `§6.6`, `§6.7`, `§6.8`, `§3.3`, `§D.X` — these are RFC-internal anchors; keep them functional (renumber if anchors drifted but don't drop)

**4. Code-symbol references**:

- File path citations (`src/auto-reply/continuation/...`)
- Function names (`failFlow`, `consumePendingDelegates`, `enqueueContinuationReturnDeliveries`)
- Type names (`PendingContinuationDelegate`, `StartSpanOptions`)

**5. Substantive design content**:

- The desired trace shape (root → depth-N → return spans), the chain-budget anti-flood rule, the producer-IN/return-OUT/restart-resilience contracts — keep all of this, just strip the karmaterminal-specific point-in-time framing around it

**6. The mermaid diagrams themselves**:

- Diagrams describe substrate-level shapes; keep + verify correctness
- Update labels/edges if drifted from shipped implementation

## §0c Reframe-don't-just-delete patterns

For substantive prose blocks that reference karmaterminal context, prefer **reframing** over wholesale deletion:

- _Before_: "Per the 2026-05-03 cohort byte-walk on the v5.2 canonical line, the seam map at branch `frond-scribe/20260503/otel-traceparent-audit` (final journal `1e966b8a70`) enumerates seven implementation seams..."
- _After_: "The seam map enumerates seven implementation seams across producer, return, restart, and anti-flood paths..." (keep the substantive seam-map content; drop the cohort-cycle anchor)

- _Before_: "🌫 + 🌊 + 🩸 + 🌻 byte-walked the substrate; the converged finding is that drainer-failFlow at consume-paths cures the decode-null hot-loop wedge."
- _After_: "Drainer-failFlow at consume-paths cures the decode-null hot-loop wedge class."

Use judgment. The goal is "RFC reads as a substrate spec without dating itself or attributing to private-fork actors"; not "RFC stripped of all context."

## §0d Mermaid diagram pass

The RFC has ~6 mermaid blocks (per `grep -c '```mermaid' docs/design/continue-work-signal-v2.md`). For each:

1. Identify what substrate-shape the mermaid is illustrating
2. Cross-reference the actual shipped code (post-#560 merge) — does the mermaid match?
3. If drifted (e.g. labels reference symbols that were renamed, edges show flows that no longer exist), update to match
4. If correct, leave as-is + note in journal "verified mermaid block at line N"

Common drift sources after the wiring lane shipped:

- Span names: did the wiring use the names §6.6/§6.7 prescribed? If not, update mermaid labels.
- Helper function names: did the wiring rename anything?
- New spans introduced by wiring (e.g. `continuation.queue.fanout`) that aren't yet in mermaid — add if substantive.

## §0e Trace implementation assurance pass

For §6.6, §6.7, §6.8 (the trace-context substrate sections):

1. Read the prose
2. Cross-reference the shipped code:
   - `extensions/diagnostics-otel/src/continuation-tracer-adapter.ts` (consumer side; parent-stitching)
   - `src/infra/continuation-tracer.ts` (producer span helpers)
   - `src/auto-reply/continuation/delegate-store.ts` + `delegate-dispatch.ts` (producer-IN)
   - `src/auto-reply/continuation/targeting.ts` (return-OUT targeted/multi/fanout)
   - `src/auto-reply/continuation/post-compaction-delegate-dispatch.ts` (restart-resilience)
   - `src/agents/subagent-announce.ts` + `subagent-announce-delivery.ts` (default return)
3. Identify deviations between prose and shipped code
4. Update prose to match shipped reality + document deviation rationale where it serves the reader

For #559 specifically: the `continuation-tracer` shim has no link primitive yet (per #559 issue body). If §6.8 currently says "spawn-as-link via tracer.startSpan({ links: [...] })", soften to "spawn semantically links to producer's traceparent (specific link-primitive landing in follow-up)".

## §0f Remote-first push discipline

Branch is pushed. Commit + push journal at every meaningful checkpoint:

```bash
echo "- $(date -uIseconds): <what just happened>" >> tmp-drop-me-rfc-pass-journal.md
git add tmp-drop-me-rfc-pass-journal.md && git commit -m "journal: <one-line>"
git push origin frond-scribe/20260503/rfc-pass-mermaid-trace-strip
```

WIP-state pushes encouraged.

## §0g Webhook heartbeat (frequent — NOT silent for hours)

Resolve frond-scribe's webhook + heartbeat with username `frond-scribe-rfc-pass-hook`:

```bash
WEBHOOK=$(gh variable list -R karmaterminal/frond-scribe --json name,value --jq '.[] | select(.name == "DISCORD_SPRITES_WEBHOOK") | .value')
curl -sS -H "Content-Type: application/json" \
  -d "{\"username\":\"frond-scribe-rfc-pass-hook\",\"content\":\"🤖 rfc-pass: <one-line status>\"}" \
  "$WEBHOOK"
```

Fire on:

- §1 reads complete
- After identifying the full strip-target match-set (raw count + sample patterns)
- After mermaid pass complete
- After trace-implementation assurance pass complete
- After strip pass complete
- Build/docs verification pass
- PR open + declare-done

## §1 Reads (study before editing)

In order:

1. The RFC itself: `docs/design/continue-work-signal-v2.md` — entire document, with focus on §3.3, §6, §D.X
2. The shipped wiring code (post-#560):
   - `extensions/diagnostics-otel/src/continuation-tracer-adapter.ts`
   - `src/infra/continuation-tracer.ts`
   - `src/auto-reply/continuation/delegate-store.ts`
   - `src/auto-reply/continuation/delegate-dispatch.ts`
   - `src/auto-reply/continuation/targeting.ts`
   - `src/auto-reply/continuation/post-compaction-delegate-dispatch.ts`
   - `src/agents/subagent-announce.ts`
   - `src/agents/subagent-announce-delivery.ts`
3. The shipped integration test: `src/auto-reply/continuation/trace-context-propagation.integration.test.ts` — what shape did it actually assert?
4. Sample mermaid + karmaterminal-fork-ref scope:
   ````bash
   grep -nE '```mermaid|sequenceDiagram|graph TD|graph LR' docs/design/continue-work-signal-v2.md
   grep -nE 'karmaterminal/openclaw#|karmaterminal/openclaw-bootstrap#|frond-scribe/|swim-3[0-9]|swim-4[0-9]|canonical2|v52-uptake|v29-uptake|🌊|🩸|🌫|🌻|cohort byte-walk|byte-pin|silas-shape|🌫|🌻' docs/design/continue-work-signal-v2.md
   grep -nE '\(#[0-9]{1,4}\)' docs/design/continue-work-signal-v2.md  # cohort issue refs (small numbers)
   ````

## §2 Audit + edit

Mechanical scan + edit, in order:

1. **File the tracking issue first**: `gh issue create --repo karmaterminal/openclaw --title "RFC pass: mermaid docs + trace implementation assurance + karmaterminal-fork ref strip" --label "feature-continuation,code-agent"`. Cite the workorder branch + this Pattern E framing.

2. **Inventory pass**: produce counts for: (a) mermaid blocks (verified-as-correct vs needs-update), (b) trace-implementation drift cases (prose-vs-code mismatches), (c) karmaterminal-fork ref categories (cohort-issue-refs, branch-refs, swim-refs, jargon, prince-emojis, point-in-time history). Bank to journal. Heartbeat.

3. **Edit pass per category** (highest-confidence first):
   - Karmaterminal-URL drops (unambiguous)
   - Branch-name drops
   - Swim-cycle / v-rotation refs
   - Prince-emoji + cohort-jargon
   - Cohort-issue-number refs (verify each via `gh issue view` if uncertain)
   - Point-in-time history reframes
   - Mermaid corrections
   - Trace-implementation prose updates per shipped reality

4. **Test verification**:
   - `pnpm check:docs` (RFC docs sanity)
   - `pnpm tsgo` (catches accidental code edits)
   - Visual mermaid render check if possible (e.g. `pnpm docs:check-mermaid` if such a script exists; otherwise inspect blocks for syntax validity)

5. **Build-in-temp-dir verification**:
   ```bash
   TEMP=/tmp/openclaw-rfc-pass-build-$(date +%s)
   mkdir -p "$TEMP"
   cp -a /home/figs/flesh_beast_best_beast/openclaw-wt-rfc-pass-20260503/. "$TEMP/"
   cd "$TEMP"
   pnpm install --frozen-lockfile
   pnpm build
   ```

## §3 Outputs

1. **Branch**: `frond-scribe/20260503/rfc-pass-mermaid-trace-strip` with N commits (one per significant batch)
2. **PR**: open against `frond/v2026.5.2/canonical`. Title: `docs(rfc): mermaid + trace-implementation assurance + strip karmaterminal-fork refs for upstream-PR-presentation`
3. **PR body**: cite workorder, summarize: mermaid blocks pass-status, trace-implementation drift cases + how each was reconciled, fork-ref strip counts by category, build-verify receipt
4. **Tracking issue comments** at major checkpoints
5. **Final journal** at `tmp-drop-me-rfc-pass-journal.md`
6. **Frequent webhook heartbeats**

## §4 Don'ts

- DO NOT modify production code under `src/` (only the RFC document `docs/design/continue-work-signal-v2.md`)
- DO NOT modify `feature/context-pressure-squashed` (upstream-presentation savegame canon)
- DO NOT try to resolve `#559` substrate gaps in this lane — that's separate work
- DO NOT delete substantive design content; only fork-specific marks + drift-corrections
- DO NOT touch mermaid diagram structure unnecessarily — only verify-and-update if drifted
- DO NOT touch other open PRs / issues
- DO NOT post to Discord directly (frond-scribe owns; webhook heartbeats only)
- DO NOT npm install / npm uninstall openclaw
- DO NOT commit the workorder + journal files into the PR's merged tree (clean dev-detritus before declare-done; same lesson as #568 + #570)

## §5 Ambiguity resolution

For ambiguous fork-vs-upstream issue numbers:

- `gh issue view NNN --repo karmaterminal/openclaw --json state,title 2>&1 | head -3`
- `gh issue view NNN --repo openclaw/openclaw --json state,title 2>&1 | head -3`
- Drop if karmaterminal-cohort-shaped; keep if upstream-shaped; document any case where the call wasn't obvious

For mermaid drift uncertainty:

- If mermaid prose says one thing and code says another, prefer the code as ground truth + update prose
- If you can't determine the ground truth from the code, flag in journal as "ambiguous: kept as-is, surfaced in PR body"

## §6 Time budget

Estimated 1-3 hours. If you're past 4 hours without converging, declare-done with progress + flag remaining work.

## §7 Declare-done shape

1. Final journal commit + push
2. Final tracking-issue comment with: PR URL + final SHA + per-category strip counts + mermaid-pass results + trace-implementation drift case list + build-verify receipt
3. Drop dev-detritus files (workorder + journal + console-log) before declare-done — clean tree for the squash
4. Open PR
5. Final webhook heartbeat: `🤖 rfc-pass DECLARE-DONE: PR #N — see <tracking-issue>`

---

🌿 **frond-scribe — dispatched with care; the RFC is the upstream-presentation surface; clean it well. Mermaid correctness + trace-implementation alignment + fork-ref strip. Heartbeat often.**
