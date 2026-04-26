# rebase candidate journal — claude2 (frond-scribe v2.5 assist lane, double-duty)

worktree:        /home/figs/flesh_beast_best_beast/openclaw-wt-rebase-20260424-claude2
branch:          frond-scribe/20260424/candidate-claude2
base:            silas/rebase/v2026.4.22-feature @ 140f74956d
target:          karmaterminal-2026.4.24-base (tag, == cbcfdf62c7297bda66009ea7476f053c3e9addab)
workorder:       /home/figs/flesh_beast_best_beast/WORKORDER-rebase-20260424-v2.md
tracking issue:  https://github.com/karmaterminal/openclaw/issues/337
project status:  in_coding_agent (project 56)
seeded:          2026-04-25T19:30-07:00 (approx)

driver:          frond-scribe (Claude Opus 4.7 / 1M context)
host:            ronan
dispatched-by:   figs's double-duty directive 2026-04-25 ("if you wanna double duty discord watch and your attempt, feel free 🌿 i figure it'll help, a LOT, to revisit architecture and alignment of feature once we've has solid shots at it")

## Why this lane exists alongside gpt2

The gpt2 lane (copilot CLI / gpt-5.5 / xhigh, branch `frond-scribe/20260424/candidate-gpt2`, tracking #336) is dispatched and operating well. This claude2 lane runs the **same workorder** in parallel from a different worktree under a different model family (Claude Opus 4.7), with the same scope: parallel rebase against `karmaterminal-2026.4.24-base` + Surfaces 1+2 descriptor edits.

**Cohort-comparison value**: two independent walks of the same 49-commit replay set + two independent descriptor-prose drafts gives figs three datapoints (Cael's #325 canonical + gpt2 + claude2) for the architecture-revisit pass figs wants once "we have solid shots at it." Different model families produce different conflict-resolution heuristics and different prose-shape choices; the cross-product surfaces axes-of-disagreement that single-model attempts can't.

**Lane-partition discipline** (memory-pin: `feedback_severability.md` + `feedback_princes_salt.md`): claude2 does **not** coordinate with gpt2 during execution; both lanes are independent walks against the same anchor. Comparison happens after both finish.

---

## §0 — guardrails (acknowledged)

Confirming the §0 + §A + §B + §C + §D loads from workorder:

- **Off-limits tree**: `/home/figs/flesh_beast_tmp/openclaw/` is ronan-the-prince's live runtime. Do not read/write/list/cd. The `openclaw-gateway` process is live there. Memory-pin: `reference_ronan_host_two_openclaw_trees.md`.
- **Branch confinement**: push only to `frond-scribe/20260424/candidate-claude2`. Never touch `silas/*`, `cael/*`, `ronan/*`, `elliott/*`, `flesh_beast_figs/20260424-claude` (Cael's canonical), `flesh_beast_figs/pr1-pr4b-zk-foundation` (figs's hot-patches), `frond-scribe/20260424/candidate-claude` (savegame from earlier round), `frond-scribe/20260424/candidate-gpt` (savegame), `frond-scribe/20260424/candidate-gpt2` (sibling lane, copilot's), `main`, or any release branch.
- **Savegame discipline (#326)**: after first post-rebase push (§5), the branch is the savegame — no force-push, no rewrite, no delete. Memory-pin: `feedback_savegame_branches.md`.
- **Destructive-ambiguity stop rule**: pause + journal + wait. Do not guess. Memory-pin: `feedback_show_your_work.md` + CLAUDE.md "multi-agent safety".
- **Service-untouchability**: no start/stop/restart on `openclaw-gateway`; no tmux outside `oc-rebase-20260424-v2` family; no port outside the worktree.
- **Journal cadence**: this file at every meaningful checkpoint, commit + push.
- **§A north-star loaded**: shipping-because-upstream-will-want-it-back. Frame around capability gain, not refactor cost. Cite SeedLink / Tempo / MAGI-1 patterns when explaining substrate properties.
- **§B Surfaces 1+2 loaded**: Surface 1 = `continue_delegate.targetSessionKey?` descriptor + JSDoc (`continuation-delegate.types.ts` + `continuation-tools-registration.ts`). Surface 2 = `QueuedSessionDeliveryPayload` schema migration (`session-delivery-queue-storage.ts`) with `traceparent?` + `attachments?` optional fields, descriptor-stub `AttachmentRef`. Runtime stays in #332 / #334.
- **§C bc#11 conditional-voice template loaded**: descriptor JSDoc on every new field uses the (a)-shape framing — *"This is the (a)-shape — addressable, point-to-point, intra-host (gateway-RPC for cross-prince). v3 will surface as `publish_to_stream` with broadcast-mode under karmaterminal/binary-canticle#11 — same substrate, different verb-set."*
- **§D cite-pin discipline loaded**: three-anchor table (tag for v2026.4.24, branch ref for v2026.4.22, candidate-tip SHA for our work). Strong-form verification at the pinned ref.
- **gh CLI attribution caveat loaded**: every comment from this lane prepends the ronan-auth header.

### Verification of base tag (strong-form, in this worktree, before §1)

```
git rev-parse karmaterminal-2026.4.24-base
→ cbcfdf62c7297bda66009ea7476f053c3e9addab    ✓
```

(Will append the live verification output after first commit.)

## §1 — read first (frond-scribe fills in)

(in progress)

## §2 — code walk (frond-scribe fills in)

## §3 — tests of concern (frond-scribe fills in)

## §4 — rebase (frond-scribe fills in)

## §5 — savegame push (frond-scribe fills in)

## §6 — verification (frond-scribe fills in)

## §B-execute — Surfaces 1+2 descriptor edits (frond-scribe fills in)

## §8 — declare done (frond-scribe fills in)
