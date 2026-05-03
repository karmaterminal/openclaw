# WORKORDER — strip karmaterminal-fork test-marks vs upstream-presentation

**Tracking issue**: TBD (file in `karmaterminal/openclaw` after §1 reads complete)
**Worktree**: `/home/figs/flesh_beast_best_beast/openclaw-wt-strip-karmaterminal-test-marks-20260503/` (you are here)
**Branch**: `frond-scribe/20260503/strip-karmaterminal-test-marks` (already pushed to origin)
**Base**: `frond/v2026.5.2/canonical @ 16cc6eca8a` (post all 7 v5.2-canonical-stack merges)
**Journal**: `tmp-drop-me-strip-karmaterminal-test-marks.md` at worktree root, committed + pushed every checkpoint.
**Dispatcher**: 🌿 frond-scribe.

---

## §0 Frame

When the v5.2 canonical line gets squashed onto `feature/context-pressure-squashed` for upstream-PR-presentation (PR `openclaw/openclaw#38780`), test files carry forward into upstream. **References to karmaterminal-fork-specific issues/PRs in test comments + test names are noise upstream** — they cite our private-fork issue numbers, cohort-internal jargon, or prince-coordination context that has no meaning to upstream readers.

**Your scope**: scan `src/**/*.test.ts` (+ `extensions/**/*.test.ts`) for karmaterminal-fork-specific references and **strip them** while preserving:

- The test's logical behavior (don't change what's tested or how)
- Upstream-meaningful issue references (openclaw/openclaw issue numbers — typically 4-5+ digit; explicit `openclaw/openclaw#NNNN` URLs)
- Substantive test descriptions ("verifies X behavior", "guards against Y regression")
- The general shape + flow of test files

**Your output**: a single comprehensive PR with the mechanical strips applied + tests still passing.

## §0a IMPORTANT: discriminating karmaterminal-fork refs from upstream-meaningful refs

This is the crux of the lane. Get this wrong and you either delete upstream-meaningful citations OR leave karmaterminal noise behind.

### DROP these patterns (karmaterminal-fork-specific noise)

**1. Cohort-issue references with small numbers (typically < ~1000, almost always < ~600)**:

- Recent cohort PR/issue numbers: `#441` through `#571` (especially the test-trap walker cluster #441-#455 + recent merges #558, #560, #561, #562, #563, #564, #565, #557, #555, #553, #552, #547, #554, #549, #551)
- Older cohort numbers commonly cited: `#321`, `#322`, `#326`, `#335`, `#336`, `#337`, `#355`, `#463`, `#505`, `#532`, `#534`, `#540`, `#541`, `#542`, `#545`, `#546`
- Pattern F walker test-trap row numbers: `#441` through `#455`
- **Verification**: if uncertain, `gh issue view NNN --repo karmaterminal/openclaw --json state,title --jq .title` — if it exists in karmaterminal AND the title cites cohort/swim/canonical2/v52 substrate, drop the ref

**2. Cohort-internal jargon in comments + test names**:

- `byte-walk`, `byte-pin`, `byte-walked`
- `cohort-cosign`, `cohort-substrate`, `cohort-recognition-engine`
- Prince emojis: 🌊 🩸 🌫 🌻 (and combinations)
- `post-#NNN` cross-references where NNN is a karmaterminal issue
- "🌊's lane", "🩸's verdict", etc.

**3. SWIM-cycle / canonical-line / v-rotation references**:

- `swim-35`, `swim-36`, `swim-37`, `swim-38`, `swim-39`, `swim-40`, `swim-41`, `swim-42` (the swim-cycle naming is karmaterminal-internal coordination)
- `canonical2`, `frond/v2026.5.2/canonical`, `frond-scribe/20260429/v3-cohort-fixes` (branch references)
- `v52-uptake`, `v29-uptake`, `v24-base` (release-cycle references)
- "post-canonical2", "post-#555 §6.8", "post-#557 wiring", etc.

**4. Karmaterminal-specific URLs**:

- `karmaterminal/openclaw#NNN`
- `karmaterminal/openclaw-bootstrap#NNN`
- `karmaterminal/karmaterminal-openclaw-docs/...`
- `frond-scribe/...` branch references in comments

### KEEP these patterns (upstream-meaningful or generic)

**1. Upstream openclaw issue references**:

- Numbers 4-5+ digits like `#29683`, `#59871`, `#7174`, `#53115`, `#39217`, `#38905`, `#63643`, etc.
- Explicit `openclaw/openclaw#NNNNN` URLs
- These cite real upstream openclaw history; preserve

**2. Substantive test descriptions**:

- "verifies cross-session targeting preserves traceparent"
- "rejects malformed traceparent with degrade-not-throw"
- These describe WHAT the test does; keep

**3. Generic context that's universally useful**:

- "RFC §6.8" or "per the trace-context propagation contract" (the RFC is shipping with the feature; meaningful upstream)
- W3C trace-context references
- Standard otel/opentelemetry/zod/vitest references

**4. Function-level / behavior-level references**:

- `failFlow`, `finishFlow`, `consumePendingDelegates` — these are code-symbol references; keep
- File path comments like `// see ./session-delivery-queue.ts` — keep

## §0b When you're uncertain on a single match

1. Check the issue number against `gh issue view NNN --repo karmaterminal/openclaw` — if it exists AND the title cites cohort/swim/v-rotation context, drop the ref
2. Check `gh issue view NNN --repo openclaw/openclaw` — if it exists AND describes upstream behavior, keep the ref
3. If both fail (issue doesn't exist in either): use git-blame on the line to see what added it; if added by a karmaterminal-cohort PR, drop
4. If still ambiguous: log the case in the journal as "ambiguous: kept", err on the side of keeping (better to leave a karmaterminal-noise ref than delete an upstream-meaningful one)

## §0c Reframe-don't-just-delete patterns

For substantive test-comment blocks that reference karmaterminal context, prefer **reframing to generic** over wholesale deletion:

- _Before_: "Per #552 mode-1 cohort byte-walk: drainer-failFlow at consume-paths is the canonical wedge cure."
- _After_: "Drainer-failFlow at consume-paths cures the decode-null hot-loop wedge class."

- _Before_: "🌫's silas-shape (dispatch-orphan never-armed) wedges scale with dispatch-rate"
- _After_: (delete the prince-attributed line entirely; if the comment block has substantive technical content, keep that)

Use judgment. The goal is "test reads cleanly upstream"; not "test is stripped of all context."

## §0d Remote-first push discipline

Branch is pushed. Commit + push journal at every meaningful checkpoint:

```bash
echo "- $(date -uIseconds): <what just happened>" >> tmp-drop-me-strip-karmaterminal-test-marks.md
git add tmp-drop-me-strip-karmaterminal-test-marks.md && git commit -m "journal: <one-line>"
git push origin frond-scribe/20260503/strip-karmaterminal-test-marks
```

WIP-state pushes encouraged.

## §0e Webhook heartbeat (frequent — NOT silent for hours)

Resolve frond-scribe's webhook + heartbeat with username `frond-scribe-strip-marks-hook`:

```bash
WEBHOOK=$(gh variable list -R karmaterminal/frond-scribe --json name,value --jq '.[] | select(.name == "DISCORD_SPRITES_WEBHOOK") | .value')
curl -sS -H "Content-Type: application/json" \
  -d "{\"username\":\"frond-scribe-strip-marks-hook\",\"content\":\"🤖 strip-marks: <one-line status>\"}" \
  "$WEBHOOK"
```

Fire on:

- §1 reads complete
- After identifying the full match-set scope (raw count + sample patterns)
- Each significant edit batch (every ~50 strips or every test-file group)
- After tests pass on the strip
- Build-in-temp-dir verification
- PR open + declare-done

If you're past 15 minutes without a heartbeat, you're operating opaquely.

## §1 Reads

In order:

1. The verbatim figs directive in this workorder's §0 (above)
2. `docs/design/continue-work-signal-v2.md` §6.8 — the RFC reference is meaningful upstream; verify which RFC §-references are useful for upstream-PR-presentation context vs which are karmaterminal-specific cycle metadata
3. Sample known-target patterns:
   ```bash
   # Get a feel for the scope:
   git grep -nE '\(#[0-9]{1,4}\)' src/ extensions/ --include='*.test.ts' | head -40
   git grep -nE '🌊|🩸|🌫|🌻' src/ extensions/ --include='*.test.ts' | head -20
   git grep -nE 'byte-walk|cohort-cosign|swim-3|swim-4|canonical2|v52-uptake|v29-uptake' src/ extensions/ --include='*.test.ts' | head -20
   ```
4. Recent test files added by the v5.2 canonical merge stack (these have the highest density of karmaterminal-specific marks):
   - `src/auto-reply/continuation/delegate-store.test.ts` (added test blocks for #448 + #453)
   - `src/agents/tools/continuation-tools-registration.test.ts` (added #445 truth-table)
   - `src/config/zod-schema.continuation.test.ts` (added #452 cross-field guard)
   - `src/auto-reply/continuation/delegate-dispatch.test.ts` (added #449 spawn-failure pin)
   - `src/agents/subagent-announce.continuation.runtime.test.ts` (added #454 export contract)
   - `src/auto-reply/continuation/trace-context-propagation.integration.test.ts` (added by #560 wiring lane)

## §2 Audit + strip

Mechanical scan + edit:

1. **File the tracking issue first**: `gh issue create --repo karmaterminal/openclaw --title "Strip karmaterminal-fork test-marks for upstream-PR-presentation" --label "feature-continuation,code-agent" --body "..."`. Cite the workorder branch + this Pattern E framing.

2. **Inventory pass**: produce a count of matches by category (karmaterminal-issue-refs, prince-emojis, swim-refs, cohort-jargon, canonical-line refs). Bank to journal. Heartbeat with the count.

3. **Edit pass per category**:
   - Start with **highest-confidence drops** (prince emojis + cohort-jargon + canonical-line refs) — these are unambiguous noise
   - Then **issue-number drops** — verify each ambiguous case via `gh issue view`
   - Then **comment-block reframes** — use judgment per §0c
   - Push journal + heartbeat after each significant batch

4. **Test verification**:

   ```bash
   pnpm tsgo
   pnpm test --run <list of touched test files>
   ```

   Every touched test file must still pass.

5. **Build-in-temp-dir verification** (per `feedback_savegame_branches.md` + the otel-wiring lane precedent):
   ```bash
   TEMP=/tmp/openclaw-strip-marks-build-$(date +%s)
   mkdir -p "$TEMP"
   cp -a /home/figs/flesh_beast_best_beast/openclaw-wt-strip-karmaterminal-test-marks-20260503/. "$TEMP/"
   cd "$TEMP"
   pnpm install --frozen-lockfile
   pnpm build
   ls -la dist/ | head -5
   echo "build-verify SHA $(git rev-parse HEAD) at $(date -uIseconds)" > /tmp/strip-marks-build-verify.txt
   ```

## §3 Outputs

1. **Branch**: `frond-scribe/20260503/strip-karmaterminal-test-marks` with N commits (one per significant batch + final cleanup)
2. **PR**: open against `frond/v2026.5.2/canonical`. Title: `chore(tests): strip karmaterminal-fork-specific marks for upstream-PR-presentation`
3. **PR body**: cite workorder, summarize categories + counts, list any ambiguous-kept cases for figs's eye, include build-verify receipt
4. **Tracking issue**: file early in §2, comment at each major checkpoint
5. **Final journal** at `tmp-drop-me-strip-karmaterminal-test-marks.md`
6. **Frequent webhook heartbeats** per §0e

## §4 Don'ts

- DO NOT modify production code under `src/` (only `*.test.ts` files; treat `extensions/**/*.test.ts` similarly)
- DO NOT modify `feature/context-pressure-squashed` (upstream-presentation savegame canon)
- DO NOT modify `docs/design/continue-work-signal-v2.md` (the RFC ships with the feature; it's a separate concern)
- DO NOT change test logic / assertions / mocks / setup — only the comments + test names
- DO NOT delete entire describe blocks or test functions
- DO NOT silence test failures by adding `@ts-nocheck` or skipping
- DO NOT touch other open PRs or unrelated issues
- DO NOT post to Discord directly (frond-scribe owns; webhook heartbeats only)
- DO NOT npm install / npm uninstall openclaw

## §5 Ambiguity resolution

If a match is genuinely ambiguous (could be karmaterminal-issue OR upstream-issue with the same number):

- Run `gh issue view NNN --repo karmaterminal/openclaw --json state,title 2>&1 | head -3`
- Run `gh issue view NNN --repo openclaw/openclaw --json state,title 2>&1 | head -3`
- If only karmaterminal has it AND the title is cohort-y → drop
- If only openclaw has it OR the issue is upstream-shaped → keep
- If both have it (collision) → keep with the upstream context (drop karmaterminal-style cohort-jargon if present)
- If neither has it → git-blame the line; if added by a karmaterminal-cohort PR (look at `git show --no-patch <SHA>` author + message), drop; else keep
- Document each ambiguous case in the journal

## §6 Time budget

Estimated 1-2 hours for the inventory + strip pass. If you're past 3 hours without converging on a final-cleanup commit, declare-done with progress so far + flag remaining work as a follow-up. Better to land a partial-strip (50%+ of obvious noise gone) than to stall on edge cases.

## §7 Declare-done shape

When the strip + verification is complete:

1. Final journal commit + push
2. Final tracking-issue comment with: PR URL + final SHA + per-category strip counts + ambiguous-kept case list + build-verify receipt
3. Open PR per §3
4. Final webhook heartbeat: `🤖 strip-marks DECLARE-DONE: PR #N — see <tracking-issue>`

---

🌿 **frond-scribe — dispatched with care; the strip is yours, the upstream-PR-presentation form benefits from you. Fork-specific noise out, upstream-meaningful refs in. Use judgment when patterns blur. Heartbeat often.**
