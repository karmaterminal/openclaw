# Journal — migrate off upstream-internalized APIs (#1042)

Append-only. Branch `codeagent/api-migration-1042`, base assembly
`frond-scribe/20260613/assembly-drift-cure` @ `8cafdcd`.
Worktree-safe commands only (RELIABLE-TESTING): `node scripts/run-tsgo.mjs`,
`node scripts/run-oxlint.mjs`, `node scripts/run-vitest.mjs`. No bare `pnpm
test`/`pnpm check` in a worktree.

---

## 2026-06-17T07:22Z — Step 0: trace + enumerate

- Read issue `karmaterminal/openclaw#1042` (via `ghread`; `gh issue view` hits
  the projects-classic GraphQL choke). Read `RELIABLE-TESTING.md`.
- Fetched `upstream/main` (tip `4ea1b4fc4a`).
- Verified the two named internalizing commits:
  - `bb46b79d3c` — "refactor: internalize OpenClaw agent runtime (#85341)"
  - `c40e904c1b` — "refactor(agents): narrow internal event constants"

### Enumeration via drift-cure-gate (Gate 2.7)
`drift-cure-gate.sh upstream/main HEAD <PRC=8e04d27f1a> .gate-out` →
**exit 1, exactly 2 FROZEN-STALE** (116 GENUINE, 70 MIXED-CLOBBER, 114 SAFE-NEW):
- `src/agents/embedded-agent-subscribe.tools.ts` (HEAD==historical upstream blob)
- `src/agents/internal-event-contract.ts` (HEAD==historical upstream blob)

Both FROZEN-STALE files differ from `upstream/main` by **only** the band-aid
`export` keyword(s):
- `embedded-agent-subscribe.tools.ts`: `export function isCoreToolResultMediaTrustedName`
  (upstream made it private in `bb46b79d3c`).
- `internal-event-contract.ts`: `export const AGENT_INTERNAL_EVENT_SOURCES` +
  `export const AGENT_INTERNAL_EVENT_STATUSES` (upstream made them private in
  `c40e904c1b`; the derived *types* stay exported).

The MIXED-CLOBBER queue is general feature divergence (continuation feature
fields etc.), **not** internalized-symbol band-aids; out of scope for #1042.
The assembly branch already cured sibling carries (`hide message merge helper
types`, `hide failover policy types`, `drop preemptive route re-export`, …), so
these 2 are the remainder. Enumeration confirms scope = exactly these 2.

### Consumers (only one external consumer per family)
- Finding 1: `src/agents/embedded-agent-runner/run/attempt.ts:163` (import),
  `:565` (use inside `collectTrustedLocalMediaToolNames`). Internal use at
  `embedded-agent-subscribe.tools.ts:491` (inside `isToolResultMediaTrusted`)
  stays.
- Finding 2: `packages/gateway-protocol/src/schema/agent.ts:4-7` (import),
  `:39,:44` (use in `Type.String({ enum: [...] })`).

---

## 2026-06-17T07:25Z — Step 1: migrate media-trust family (Finding 1)

**Method chosen:** swap consumer to upstream's public `isToolResultMediaTrusted`,
drop the band-aid `export` on `isCoreToolResultMediaTrustedName`.

**Why behavior-preserving (proof):** in `attempt.ts`
`collectTrustedLocalMediaToolNames` we filter core builtin tool *names* while
*building* the trusted-local-media set. At that point there is no tool `result`
and no trusted-set yet, so passing them would be circular — the name-only check
is intentional. `isToolResultMediaTrusted(toolName)` called with a single arg is
identical to `isCoreToolResultMediaTrustedName(toolName)`:
- `result` undefined → `isExternalToolResult(undefined)` = false (no details).
- `trustedLocalMediaToolNames` undefined → `undefined?.has(x) === true` = false.
- → falls through to `return isCoreToolResultMediaTrustedName(toolName)`.
So output is bit-identical for every name. Continuation media-trust semantics
unchanged.

**Exemplar traced (`bb46b79d3c` / #85341):** upstream removed
`collectTrustedLocalMediaToolNames` + `collectTrustedPluginLocalMediaToolNames`
from `attempt.ts` wholesale and moved trust derivation inside the runtime; it
made `isCoreToolResultMediaTrustedName` private and kept `isToolResultMediaTrusted`
public. We do NOT adopt #85341's whole-runtime internalization (that would change
our continuation feature's attempt-runner composition); we adopt only the public
API at our one call site — the minimal behavior-preserving migration the issue
asks for.

**Edits:**
- `src/agents/embedded-agent-runner/run/attempt.ts`: import + call site
  `isCoreToolResultMediaTrustedName` → `isToolResultMediaTrusted`.
- `src/agents/embedded-agent-subscribe.tools.ts`: `export function
  isCoreToolResultMediaTrustedName` → `function …` (private, as upstream).
  File is now **byte-identical to `upstream/main`** (FROZEN-STALE → SAFE-CURRENT).

**Verify (worktree-safe):**
- `run-tsgo -p tsconfig.core.json` → exit 0.
- `run-oxlint attempt.ts subscribe.tools.ts` → exit 0.
- `diff upstream/main:subscribe.tools.ts <worktree>` → identical.

No semantic ambiguity; no TODO needed.
