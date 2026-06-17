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

---

## 2026-06-17T07:29Z — Step 2: migrate event-constants family (Finding 2)

**Method chosen (traced from `c40e904c1b` + `upstream/main`):** upstream kept the
*types* `AgentInternalEventSource`/`AgentInternalEventStatus` exported but made the
value arrays private. Its own protocol layer
(`packages/gateway-protocol/src/schema/agent.ts`) does **not** import them from
`src/agents/`; it declares its **own local private copies** of all three
constants (`AGENT_INTERNAL_EVENT_TYPE_TASK_COMPLETION`,
`AGENT_INTERNAL_EVENT_SOURCES`, `AGENT_INTERNAL_EVENT_STATUSES`). The
"keep values stable because they cross agent runtime boundaries" comment in
`internal-event-contract.ts` is the documented sync contract.

Adopted upstream's exact pattern: gateway-protocol now owns local copies and no
longer reaches into `src/agents/internal-event-contract.js`. This also satisfies
the package boundary rule (the standalone gateway-protocol package should not
depend on core `src/agents` internals).

**Why behavior-preserving:** the local arrays are value-identical to the prior
imported arrays, so `Type.String({ enum: [...] })` produces the same TypeBox enum
for `source`/`status`; `Type.Literal(AGENT_INTERNAL_EVENT_TYPE_TASK_COMPLETION)`
still narrows to `"task_completion"`. Internal-event enum coverage for the
continuation feature is unchanged.

**Edits:**
- `packages/gateway-protocol/src/schema/agent.ts`: drop the 3-constant import from
  `../../../../src/agents/internal-event-contract.js`; declare local private
  copies (placement matches upstream, before `AgentGeneratedAttachmentSchema`).
- `src/agents/internal-event-contract.ts`: `export const
  AGENT_INTERNAL_EVENT_SOURCES`/`..._STATUSES` -> private `const` (types stay
  exported). File is now **byte-identical to `upstream/main`** (FROZEN-STALE ->
  SAFE-CURRENT).

**Verify (worktree-safe):**
- `run-tsgo -p tsconfig.core.json` (covers `packages/**`, `noUnusedLocals`) -> exit 0.
- `run-oxlint` on both files -> exit 0.
- `diff upstream/main:internal-event-contract.ts <worktree>` -> identical.

No semantic ambiguity; no TODO needed.

---

## 2026-06-17T07:36Z — Step 3: full verification (worktree-safe)

All commands run from the worktree via node wrappers (no bare pnpm).

**drift-cure-gate** `upstream/main HEAD <PRC=8e04d27f1a> .gate-out`:
- **0 FROZEN-STALE**, gate **exit 0** (was 2 before: the two seed files).
- Ground truth: `HEAD:src/agents/internal-event-contract.ts` and
  `HEAD:src/agents/embedded-agent-subscribe.tools.ts` are now **byte-identical to
  `upstream/main`** (SAFE-CURRENT); band-aid exports gone.
- The MIXED-CLOBBER queue (69 rows) is pre-existing continuation-feature
  divergence, not internalized-symbol carries — out of scope for #1042.

**tsgo (type-check):**
- `-p tsconfig.core.json` (prod, includes `packages/**`, `noUnusedLocals`) → exit 0.
- `-p test/tsconfig/tsconfig.core.test.json` (test) → exit 0.
- `-p tsconfig.extensions.json` → exit 0.

**oxlint:** all 4 changed files → exit 0.

**vitest (worktree-safe `node scripts/run-vitest.mjs run`):**
- `embedded-agent-subscribe.tools.test.ts` → 23 passed.
- `embedded-agent-subscribe.tools.media.test.ts` → 37 passed.
- `embedded-agent-runner/run/tool-media-payloads.test.ts` → 5 passed.
- `embedded-agent-runner/run/attempt.media-hint-cache-boundary.test.ts` (run-attempt
  trusted-media path; `collectTrustedLocalMediaToolNames` is live at attempt.ts:2404
  → passed to filter at :3655) → 5 passed.
- `packages/gateway-protocol/src/schema/agent.schema.test.ts` → 10 passed.
- `packages/gateway-protocol/src/schema/agent.test.ts` → 3 passed.
- Total 83 passed, 0 failed. `internal-event-contract` has no dedicated test;
  its values/types are covered by the gateway schema runtime tests + the three
  tsgo lanes (all type consumers compile).

**Branch diff (excl. journal):** 4 files, +15/-10. Net prod +5 lines in
gateway-protocol (it now owns local enum copies instead of importing them) —
justified: matches upstream exactly and severs the cross-package import into
`src/agents` internals.

**Result:** both internalized-symbol families migrated to upstream's current
public API, band-aids removed, feature behavior preserved. No semantic
ambiguity encountered; no `TODO(#1042)` carries left.
