# Splay equivalence / provenance candidate report

## Executive summary
- Candidate count by class: DROP-candidate=9, REVIEW-candidate=2, KEEP=0, UNKNOWN=0.
- Highest-confidence cleanup scope: files touched by the earlier assembly cleanup commits (`274e035b3bc` and `00baf3f8de9`) that are now equivalent to upstream current content under whitespace-insensitive diff.

## Methodology and refs
- `U0` (workorder): `6418e196b123d94fccb35a1a4d21001e3a084524`
- `U1` (frozen at Phase 0 from the live repo after fetch): `fc4626c1221d5b49af2d3d374109a7cf4bbd2deb` (the dispatch-prep note named `d633a2df422971154f5f819072fed8ba6142cf75`, but the live remote fetch resolved to `fc4626c1221d5b49af2d3d374109a7cf4bbd2deb`; this report uses the fetched SHA)
- `A0`: `1cc8f4e3d617ef6f173283ef83d7b739a4995734`
- `A1`: `d54026916e5328c2a37a5913cb466250dc78bb44`
- GitNexus fork: `karmaterminal/GitNexus` at `3c1e686edfc1acaac882927cada121ddd7c47bcc`
- Node 22: `v22.22.3`
- A1 index path: `/home/figs/flesh_beast_best_beast/source/WORKTREES/openclaw-gitnexus-assembly-splay/.gitnexus`
- Primary GitNexus queries used:
  - `node "$GN" context -r "$REPO" "createContinueWorkTool"`
  - `node "$GN" impact -r "$REPO" "createContinueWorkTool"`
  - `node "$GN" context -r "$REPO" "createContinueDelegateTool"`
  - `node "$GN" context -r "$REPO" "classifyEmbeddedAgentRunResultForModelFallback"`
  - `rg -n "continue[-_]work|continue[-_]delegate|auto[-_]reply|request_compaction|compaction|taskflow|follow[-_]up|session_selector|continuation" src packages test`

## GitNexus reachability map
- `feature-core`: `src/agents/tools/continue-work-tool.ts` (`createContinueWorkTool`), `src/agents/tools/continue-delegate-tool.ts` (`createContinueDelegateTool`), `src/auto-reply/continuation/*`, `src/agents/embedded-agent-runner/run/attempt.ts`.
- `feature-adjacent`: `src/agents/embedded-agent-runner/result-fallback-classifier.ts`, `src/auto-reply/reply/agent-runner-reminder-guard.ts`, `src/auto-reply/reply/agent-runner.ts` and `src/auto-reply/reply/agent-runner-execution.ts` (shared reply/runner seam).
- `not-feature-reachable`: the raft, mattermost, configure, and CLI-test candidates below; the reachability graph did not land within two hops of the continuation core seeds.
- `unknown`: none.

## Top candidates (highest-confidence DROP/REVIEW)
1. `src/cli/program/register.agent.test.ts` — import-order-only churn from the earlier assembly cleanup; equivalent to upstream current.
2. `src/commands/configure.commands.ts` — formatting/line-wrap only; equivalent to upstream current.
3. `src/plugins/setup-registry.test.ts` — EOF/newline-only residue; equivalent to upstream current.
4. `extensions/raft/src/accounts.ts` — raft-only arrangement drift; equivalent to upstream current.
5. `extensions/raft/src/channel.ts` — same pattern.
6. `extensions/raft/src/config-schema.ts` — same pattern.
7. `extensions/raft/src/setup.ts` — same pattern.
8. `extensions/codex/src/app-server/tool-abort-terminal-reason.ts` — helper added in the splay-fix commit, but current content is upstream-equivalent.
9. `extensions/mattermost/src/mattermost/slash-commands.ts` — upstream-equivalent command wiring residue.
10. `src/agents/embedded-agent-runner/result-fallback-classifier.ts` — feature-adjacent, review-only candidate because it sits in the embedded-agent fallback seam.
11. `src/auto-reply/reply/agent-runner-reminder-guard.ts` — feature-adjacent, review-only candidate because it sits near the reply/continuation seam.

## Full candidate table
| file | symbol/range | class | reachability | equivalence evidence | blame/provenance evidence | risk | proposed action |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `src/cli/program/register.agent.test.ts` | import block / test registration wiring | DROP-candidate | not-feature-reachable | `git diff -w --ignore-blank-lines ...` no hunks; A0..A1 diff is import-order churn | `274e035b3bc chore: prune transposed splay from assembly` | low | Drop from the next cleanup PR |
| `src/commands/configure.commands.ts` | `assertInteractiveConfigureTerminal` wrap | DROP-candidate | not-feature-reachable | whitespace-insensitive diff empty; A0..A1 diff is line-wrap churn | `274e035b3bc chore: prune transposed splay from assembly` | low | Drop |
| `src/plugins/setup-registry.test.ts` | EOF/newline / assertion block | DROP-candidate | not-feature-reachable | whitespace-insensitive diff empty; A0..A1 diff is EOF-only | `274e035b3bc chore: prune transposed splay from assembly` | low | Drop |
| `extensions/raft/src/accounts.ts` | raft account schema/object ordering | DROP-candidate | not-feature-reachable | whitespace-insensitive diff empty | `274e035b3bc chore: prune transposed splay from assembly` | low | Drop |
| `extensions/raft/src/channel.ts` | raft channel wiring block ordering | DROP-candidate | not-feature-reachable | whitespace-insensitive diff empty | `274e035b3bc chore: prune transposed splay from assembly` | low | Drop |
| `extensions/raft/src/config-schema.ts` | raft schema object ordering | DROP-candidate | not-feature-reachable | whitespace-insensitive diff empty | `274e035b3bc chore: prune transposed splay from assembly` | low | Drop |
| `extensions/raft/src/setup.ts` | raft setup block shaping | DROP-candidate | not-feature-reachable | whitespace-insensitive diff empty | `274e035b3bc chore: prune transposed splay from assembly` | low | Drop |
| `extensions/codex/src/app-server/tool-abort-terminal-reason.ts` | `resolveCodexToolAbortTerminalReason` | DROP-candidate | not-feature-reachable | whitespace-insensitive diff empty; A0..A1 added the file but current content matches upstream | `00baf3f8de9 fix: restore upstream splay behavior` | medium | Keep as a reviewer note only if the codex extension wants the helper preserved |
| `extensions/mattermost/src/mattermost/slash-commands.ts` | mattermost slash-command handler block | DROP-candidate | not-feature-reachable | whitespace-insensitive diff empty | `00baf3f8de9 fix: restore upstream splay behavior` | low | Drop |
| `src/agents/embedded-agent-runner/result-fallback-classifier.ts` | `classifyEmbeddedAgentRunResultForModelFallback` | REVIEW-candidate | feature-adjacent | whitespace-insensitive diff empty; GitNexus context shows it is adjacent to embedded-agent fallback and auto-reply tokens | `00baf3f8de9 fix: restore upstream splay behavior` | medium | Review only before any edit |
| `src/auto-reply/reply/agent-runner-reminder-guard.ts` | reminder guard regex block | REVIEW-candidate | feature-adjacent | whitespace-insensitive diff empty; sits in the reply surface near continuation behavior | `00baf3f8de9 fix: restore upstream splay behavior` | medium | Review only before any edit |

## Keep / do not touch list
- `src/agents/tools/continue-work-tool.ts` (`createContinueWorkTool`)
- `src/agents/tools/continue-delegate-tool.ts` (`createContinueDelegateTool`)
- `src/auto-reply/continuation/*` (`delegate-store`, `delegate-turn-admission`, `targeting`, `scheduler`, `state`, `types`)
- `src/agents/embedded-agent-runner/run/attempt.ts` and the surrounding run/attempt pipeline
- `src/auto-reply/reply/agent-runner.ts` / `src/auto-reply/reply/agent-runner-execution.ts` (real reply/runner payload)

## Methodology failures / uncertainties
- The dispatch-prep note named `upstream/main` as `d633a2df422971154f5f819072fed8ba6142cf75`, but the live fetch resolved to `fc4626c1221d5b49af2d3d374109a7cf4bbd2deb`. This report uses the fetched SHA.
- GitNexus `cypher` did not resolve against the repository schema in this environment, so the report relies on `context` / `impact` / `query` plus direct `rg` checks.
- The candidate set is intentionally conservative: it prioritizes files with strong byte evidence of equivalence to upstream current content rather than attempting a full-tree review.

## Suggested next edit-lane scope
- A narrow `#1169`-style cleanup PR could safely start with the seven raft/config/CLI-test files above and the mattermost/codex helper files, because they show no meaningful semantic drift relative to upstream current content.
- The two feature-adjacent review candidates (`result-fallback-classifier.ts` and `agent-runner-reminder-guard.ts`) should be left for a second pass after human review.
