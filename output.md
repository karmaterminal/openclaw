# PASS — independent review for karmaterminal/openclaw#1311

Candidate `e61551f18367c1f04c6383da59a864736bbc8566` is a correct, test-only repair over base `b3a572cd3ea0082679669baa80f0679332643cf8`. The CLI and Gateway startup fixtures now derive default state from each Vitest worker's `OPENCLAW_TEST_HOME`; Gateway callers that intentionally supply `OPENCLAW_STATE_DIR` still reach the real resolver. No blocking findings.

By: frond scribe 🌿 (@scribe-dandelion-cult, acct 2026-05-06) | OpenClaw: 3 PRs, 6 issues, 1 commit/12mo | GitHub contributions: 2466 commits, 1802 PRs, 393 issues, 41 reviews/12mo

Production LOC: +0/-0 (net 0) | Tests/test support: +74/-16 (net +58)

## Named refs

| Category | Named ref | Full SHA | Identity receipt |
|---|---|---|---|
| Product/base | `codeagent/fix-1310-announce-drain` | `b3a572cd3ea0082679669baa80f0679332643cf8` | local object = server branch |
| Product/candidate | `codeagent/fix-1311-state-isolation` | `e61551f18367c1f04c6383da59a864736bbc8566` | local HEAD = tracking ref = server branch |
| Safe review branch | `codeagent/review-1311-state-isolation` | `e61551f18367c1f04c6383da59a864736bbc8566` | local = tracking = server before evidence |
| CI/workflow | N/A | N/A | Workorder forbids Actions |
| Presentation | N/A | N/A | No PR or presentation surface |
| Docs/proof | N/A | N/A | `output.md` is committed on the safe review branch; no separate proof ref |

## Verdict

**Invariant and owner boundary:** test fixture composition owns every default state root. `src/cli/plugins-cli-test-helpers.ts` now supplies one worker-owned CLI root to install/uninstall fixtures and mocked persistence paths. `src/gateway/server-startup-config.recovery.test.ts` and `src/gateway/server-startup-post-attach.test.ts` pin default Gateway state to the same worker home; the post-attach mock delegates explicit state-directory overrides to production `resolveStateDir`.

**Best-fix verdict: best.** Replacing shared `/tmp` literals at the fixture producer is preferable to suppressing schema/lease errors, weakening startup, or adding consumer guards. The candidate changes no production persistence, schema, lease, rollback, restart, or recovery behavior.

**Alternatives considered:** clearing `/tmp/openclaw-state` would race other workers and preserve shared ownership; swallowing `SqliteSchemaVersionError` or `OpenClawStateLeaseError` would violate fail-closed behavior; changing production state resolution would repair the wrong layer.

**Sibling/partial-failure coverage:** install and uninstall share the repaired CLI helper; Gateway startup-config and post-attach paths use the worker root; explicit Gateway overrides remain honored. Existing post-attach cleanup/restart-sentinel cases passed in the exact startup shard, including cleanup after first failure and explicit sentinel state directories.

## Negative and positive controls

The successor's new assertions were applied without the fixes to an isolated checkout of the rejected SHA:

- CLI control failed as intended: expected `/tmp/openclaw-state` to equal the worker-owned `<OPENCLAW_TEST_HOME>/.openclaw`.
- Gateway control failed as intended for the same shared `/tmp` default.
- The identical named controls passed on the successor: CLI 1/1; Gateway 1/1.

The disclosed Mode-B schema/lease errors did not reproduce locally on the exact base when only a future-schema database or active plugin lifecycle lease was staged at ambient `/tmp/openclaw-state`; all three historical shards were green. That does not weaken the deterministic ownership failure above, but attribution of the original Mode-B error to one specific local predecessor remains unproven.

## Validation

All commands used the repository runner and one worker.

- Candidate with ambient future-schema DB (`PRAGMA user_version=16`):
  - `agentic-cli`: 266 files passed, 2 skipped; 6756 tests passed, 85 skipped.
  - `agentic-control-plane-startup-config`: 4 files, 72 tests passed.
  - `agentic-control-plane-startup-core`: 11 files, 179 tests passed.
- Candidate while an actual plugin lifecycle lease held ambient `/tmp/openclaw-state`:
  - same three shards passed with the same totals.
- Genuine fail-closed controls:
  - `src/state/openclaw-state-db.runtime-fence.test.ts`: 2/2 passed, including latched future-schema rejection.
  - `src/plugins/installed-plugin-index-store.test.ts` newer-schema control: 1/1 passed.
  - `src/plugins/plugin-lifecycle-lease.test.ts`: 5/5 passed, including cross-process timeout/serialization.
  - `agentic-cli` also passed its managed-Gateway newer-schema refusal cases.
- `git diff --check`: passed.
- Independent autoreview through P2: `scoped-clean`, patch correct confidence 0.89.

Acceptance path: **focused-only**; no Actions, PR, integration, presentation, or deployment.

## Code read and uncertainty

Code read: `src/cli/plugins-cli-test-helpers.ts`, install/uninstall tests and command registration; Gateway startup config/post-attach tests and production post-attach resolver call; `src/config/paths.ts` contract through the real mock delegation; shared-state database/schema fence; plugin lifecycle lease and lease-store tests; Vitest home isolation and exact CI shard planner.

Remaining uncertainty: the original Mode-B host's exact preexisting SQLite bytes and process lease owner were unavailable, so the historical error sequence was not recreated byte-for-byte. The candidate's rejected-SHA fixture assertions, hostile ambient controls, exact shards, and independent review are otherwise complete.
