# WORKORDER — gh issue #999: forceSenderIsOwnerFalse cleanse (drop-and-rely)

> Composed by 🪨 Rune (rune-dandelion-cult), 2026-06-13. This lane creates ONE
> candidate solution for karmaterminal/openclaw#999. Competing PRs are expected
> and welcome (figs `1515416464`) — ship a clean, narrow, gate-green candidate.
>
> **Who this serves:** the cohort's 3rd upstream PR (#85651). The `forceSenderIsOwnerFalse`
> vestige is refactored-away-upstream code riding along on our presentation branch; it
> plausibly trips the maintainer-review auto-close warnings. Removing it correctly =
> the difference between the PR landing and a bot closing our third attempt. Surgical,
> not sprawling. Right, not fast.

## Lane mechanics

- **Worktree**: this directory's checkout (set up by dispatcher; you run INSIDE it)
- **Branch**: `rune/20260613/999-forcesender-cleanse` — created off `frond-scribe/20260613/assembly-drift-cure` + pushed to origin (remote-first canon) BEFORE byte-work
- **Base**: `frond-scribe/20260613/assembly-drift-cure` @ `599f7ba0c9`
- **PR target**: `frond-scribe/20260613/assembly-drift-cure` (the assembly branch — NOT the presentation branch, NOT upstream main)
- **Repo**: `karmaterminal/openclaw`
- **Tracking issue**: `karmaterminal/openclaw#999` — comment at the 5 mandatory checkpoints (§0b below)
- **Journal**: `tmp-drop-me-rune999.md` at worktree root, committed + pushed every checkpoint
- **Outer budget**: 444m. Non-sync.

## §0a — Remote-first push discipline (DO THIS FIRST, before byte-work)

```
git fetch origin frond-scribe/20260613/assembly-drift-cure
git checkout -b rune/20260613/999-forcesender-cleanse origin/frond-scribe/20260613/assembly-drift-cure
git push -u origin rune/20260613/999-forcesender-cleanse
```

Then push WIP checkpoints at every gate. Bytes must be reachable, not polished.

## §0b — GH-issue update discipline (#999)

Comment on karmaterminal/openclaw#999 at: (1) reads-done/scope-understood, (2) grep
inventory complete (callsite count), (3) cleanse applied + local gates green (with SHA +
tallies), (4) any blocker/ambiguity, (5) declare-done (PR link + final SHA). As rune:
`gh issue comment 999 --repo karmaterminal/openclaw --body "..."`.

## §1 — Context to read first (the cleanse is already byte-specified by the cohort)

The cohort converged on the resolution in #999's comments. Read them:
`gh issue view 999 --repo karmaterminal/openclaw --comments`. The settled answer:

**DROP-AND-RELY.** `forceSenderIsOwnerFalse` is the #858 per-event anti-spoof flag.
Upstream DELETED the per-event mechanism and now runs `sanitizeInboundSystemTags`
**UNCONDITIONALLY** on every system event (`src/infra/system-events.ts` enqueue path) —
which is a strict superset of (= strictly stronger than) our conditional #858 guard. So:

- **DROP** `forceSenderIsOwnerFalse` and `resolveEventOwnerDowngrade`'s per-event gating.
- **RELY** on upstream's unconditional `sanitizeInboundSystemTags`.
- It is NOT a migration to `deliveryContext` (that's delivery-routing, does not carry trust).
- It is NOT re-express / re-implement (upstream already has the property, stronger).
- Continuation's own system-events pass `trusted:true` (trusted-internal enrichment,
  plain status text) → upstream's unconditional sanitize is a **verified no-op** on them
  (Emeric byte-closed this: zero `(System)`/`System:` marker patterns in any continuation
  emit-site). So dropping the flag loses nothing for continuation.

## §2 — The work (surgical drop)

1. **Inventory** the vestige across the assembly branch:
   `grep -rn "forceSenderIsOwnerFalse" src/ extensions/` — record every callsite (the
   silent-vestige catch: it auto-merges as "keep ours" with NO conflict marker, so it
   does NOT surface in conflict-resolution; you must remove it explicitly). Known sites
   incl. `src/auto-reply/reply/session-system-events.ts` (type field, the
   `forceSenderIsOwnerFalse=true` set, the return) + ~36 channel-monitor callsites +
   `src/infra/system-events.ts`.
2. **Remove** the field from the SystemEvent type + every `forceSenderIsOwnerFalse: true/false`
   call-site + the per-event `resolveEventOwnerDowngrade`-gated sanitize branch in
   `session-system-events.ts`, replacing with upstream's unconditional sanitize path.
   Match upstream-current shape exactly (`git show upstream/main:src/infra/system-events.ts`
   for the canonical unconditional `sanitizeInboundSystemTags(text).trim()` pattern).
3. Preserve continuation's `drainFormattedSystemEvents` / `drainFormattedSystemEventBlock`
   behavior (the FormattedSystemEventBlock return + the `suppressHeartbeatOwnedEvents` param
   are SEPARATE from the vestige — keep them).
4. **Verify the drop is total**: `grep -rn "forceSenderIsOwnerFalse" src/ extensions/` must
   return **ZERO** matches (the explicit grep-gate — this is the completion check the
   conflict step can't give you).

## §3 — Gates (Pre-Push Gate Set — full, NOT a subset)

Run ALL before declare-done; capture exit codes + tallies into `output.md`:

```
pnpm tsgo:core
pnpm tsgo:test
pnpm tsgo:extensions
pnpm lint
pnpm lint:extensions:bundled
pnpm test:extensions:package-boundary:compile
pnpm test            # FULL suite via scripts/test-projects.mjs — NOT `pnpm exec vitest run`, NOT a subset
grep -rn "forceSenderIsOwnerFalse" src/ extensions/   # MUST be zero
```

If OOM mid-suite: `OPENCLAW_VITEST_MAX_WORKERS=1 NODE_OPTIONS=--max-old-space-size=12288 pnpm test`.
Classify any failing test as (a) cleanse-introduced, (b) pre-existing, (c) baseline-drift.
Full-suite-green-on-HEAD is the completion criterion; partial-green does NOT satisfy it.

## §4 — Open the PR

`gh pr create --repo karmaterminal/openclaw --base frond-scribe/20260613/assembly-drift-cure
--head rune/20260613/999-forcesender-cleanse --title "🪨 #999: drop forceSenderIsOwnerFalse,
rely on upstream's unconditional sanitize" --body "..."`. Body: what changed (the drop +
grep=0 receipt), the gate tallies (full `pnpm test` result), Closes #999, note it's one
candidate (competing PRs welcome).

## §5 — Declare done

Comment #999 with the PR link + final SHA + full-suite tally. Write `output.md` (what
changed / full-suite signal w/ command+scope / grep=0 receipt / what's uncertain). Echo
the PR URL to console. Do NOT merge. Do NOT touch the presentation branch or upstream.

## §6 — Scope guardrails (WILL NOT)

- WILL NOT touch the presentation branch (`frond-scribe-claude/20260509/narrow-surgery-tight`)
  or upstream `openclaw/openclaw`. Only `rune/20260613/999-forcesender-cleanse` → assembly.
- WILL NOT force-push. WILL NOT merge. WILL NOT modify #999's structure (comment only).
- WILL NOT migrate to deliveryContext or re-implement the guard (drop-and-rely only).
- WILL NOT decide architectural questions — surface them as #999 comments + stop.

## §7 — Heartbeats (cohort-visible)

After each checkpoint, post to rune's webhook:

```
WEBHOOK=$(gh variable get WEBHOOK_SCRIBE_NOTIFY -R karmaterminal/runes-carved-in-stone)
curl -sS -H "Content-Type: application/json" -d "{\"username\":\"rune-999-cleanse-hook\",\"content\":\"🪨 999-cleanse: <one-line status>\"}" "$WEBHOOK"
```

Fire after: branch pushed, grep inventory done, cleanse applied, each gate green, declare-done.
