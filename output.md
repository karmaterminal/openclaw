# Independent review: fixture isolation

**Verdict: PASS**

Candidate `046b15140be5969025983a645a08dfc56d56b3f4` cleanly isolates the remaining
test fixtures from ambient repository identity, workspace path length, and
default-port ownership. The diff changes tests only, preserves the behavioral
assertions, and adds one explicit socket-path bound. No blocking findings.

## Named refs

Ref identities were resolved before test evidence was collected.

| Category | Named ref | Full SHA | Local / tracking / server |
|---|---|---|---|
| Product/base | `b3a572cd3e` | `b3a572cd3ea0082679669baa80f0679332643cf8` | local object resolved; tracking/server N/A for the workorder's immutable SHA |
| Product/candidate | `046b15140b` | `046b15140be5969025983a645a08dfc56d56b3f4` | local object resolved |
| Safe lane | `codeagent/review-1299-fixture-isolation` | `046b15140be5969025983a645a08dfc56d56b3f4` | local = tracking = server before evidence |
| CI/workflow | N/A | N/A | Actions explicitly excluded by the workorder |
| Presentation | N/A | N/A | No presentation surface |
| Docs/proof | N/A | N/A | No independent docs/proof source ref; this file is the lane report |

## Review

**Scope:** `src/cli/connect-cli.test.ts`,
`test/scripts/docker-build-helper.test.ts`, and
`test/scripts/full-release-validation-state.test.ts`.

**Size:** Production LOC: `+0/-0` (net `0`) | Tests: `+25/-21` (net `+4`).

### Invariants and negative controls

| Boundary | Rejected SHA | Candidate SHA | Sibling / lifecycle coverage |
|---|---|---|---|
| Release-state test process owns `GITHUB_REPOSITORY` and restores the exact prior value | With `GITHUB_REPOSITORY=karmaterminal/hostile-repository`, 7 provenance assertions failed and 281 passed | Same hostile environment: 288/288 passed | `captureEnv` plus `afterAll` restores absent or present prior state; the full collector subprocess suite passed |
| Unix-domain socket fixture remains below the platform `sun_path` limit regardless of workspace `TMPDIR` | A deliberately long `TMPDIR` failed at `server.listen` with `EINVAL` | Same long `TMPDIR`: the socket rejection test passed using the bounded `/tmp/oc-connect-socket-*` path | The test still asserts the socket is rejected, not removed, and never reaches the node host |
| Docker restart fixture owns its collision port and does not reserve the product default | In an isolated network namespace, the running rejected fixture claimed `127.0.0.1:18789`; a concurrent bind failed with `EADDRINUSE` while the fixture test itself passed | Under the same harness, the concurrent bind succeeded and the fixture test passed | Full Docker helper suite passed 277/277; the adjacent stranded-listener test still fails closed for an owned or foreign live port |
| Package-manager fixture selects repository Corepack state rather than ambient `pnpm` | Already repaired in the named base; not changed by this candidate | Four inherited hostile-path controls passed | Covers absent shim, foreign/global shim, unavailable Corepack, and both app/dist package helpers |

The Docker negative control ran inside an unprivileged network namespace because
the host's port 18789 belonged to an existing operator gateway. The namespace
made the rejected fixed-port collision deterministic without touching that
runtime.

### Assertion and behavior audit

- No production file changed.
- The release test adds scoped setup/restore only; its 288 assertions are
  unchanged.
- The socket test retains all rejection, non-removal, and no-handoff assertions
  and adds a byte-length assertion against Darwin/Linux socket limits.
- The Docker tests retain config restoration, manager ownership, restart PID
  replacement, prior-process termination, stop/offline, and fail-closed
  assertions. Removing `occupyLoopbackPort` removes the branch that silently
  accepted a foreign listener; it does not relax an assertion.
- Persistence and rollback behavior are unchanged. Release environment state is
  restored after the file, Docker-authored config equality remains asserted,
  and fixture listeners are closed in `finally`.

**Best-fix verdict:** Best. A fixed canonical environment value at the release
test boundary is smaller and safer than editing every subprocess fixture.
Allocating and retaining an ephemeral listener gives the Docker test real
resource ownership without changing production scripts. A short system-temp
socket root is necessary because shortening only the leaf name cannot bound an
adversarial workspace `TMPDIR`.

**Code read:** the complete changed diff and test functions; shared temp-dir and
environment helpers; `scripts/e2e/lib/upgrade-survivor/run.sh`;
`scripts/e2e/lib/upgrade-survivor/update-restart-auth.sh`; adjacent Docker
restart/stop tests; inherited package-mac Corepack fixtures.

**Remaining uncertainty:** No native macOS run was performed. The Unix socket
control executed on Linux and explicitly enforces the Darwin byte limit in
source. The package-manager controls exercise extracted shell helpers on this
host rather than a full macOS package build. This lane was intentionally
focused-only; no Actions, broad suite, integration, presentation, or deployment
was run.

## Validation

Focused successor suites, each with one worker:

```text
GITHUB_REPOSITORY=karmaterminal/hostile-repository node scripts/run-vitest.mjs run --config test/vitest/vitest.tooling.config.ts --maxWorkers=1 test/scripts/full-release-validation-state.test.ts
# 288 passed

TMPDIR=<long-hostile-path> node scripts/run-vitest.mjs run --config test/vitest/vitest.cli.config.ts --maxWorkers=1 src/cli/connect-cli.test.ts -t 'rejects a socket target without removing it'
# 1 passed

node scripts/run-vitest.mjs run --config test/vitest/vitest.cli.config.ts --maxWorkers=1 src/cli/connect-cli.test.ts
# 20 passed

node scripts/run-vitest.mjs run --config test/vitest/vitest.tooling-docker.config.ts --maxWorkers=1 test/scripts/docker-build-helper.test.ts
# 277 passed

node scripts/run-vitest.mjs run --config test/vitest/vitest.tooling.config.ts --maxWorkers=1 test/scripts/package-mac-app.test.ts test/scripts/package-mac-dist.test.ts -t 'prefers repo Corepack pnpm over a global pnpm shim|fails with an actionable error when neither pnpm nor corepack pnpm is available|falls back to corepack pnpm when the pnpm shim is absent'
# 4 passed
```

Rejected/successor hostile controls:

```text
# Rejected release test substituted from b3a572cd3e:
GITHUB_REPOSITORY=karmaterminal/hostile-repository node scripts/run-vitest.mjs run --config test/vitest/vitest.tooling.config.ts --maxWorkers=1 test/scripts/full-release-validation-state.test.ts
# 7 failed, 281 passed

# Rejected socket test substituted from b3a572cd3e:
TMPDIR=<long-hostile-path> node scripts/run-vitest.mjs run --config test/vitest/vitest.cli.config.ts --maxWorkers=1 src/cli/connect-cli.test.ts -t 'rejects a socket target without removing it'
# failed with listen EINVAL

# Rejected/candidate Docker test, inside `unshare -Urn` with loopback enabled:
node scripts/run-vitest.mjs run --config test/vitest/vitest.tooling-docker.config.ts --maxWorkers=1 test/scripts/docker-build-helper.test.ts -t 'starts the published auth probe under the manager'
# rejected fixture: concurrent bind to 127.0.0.1:18789 failed EADDRINUSE; test passed
# candidate fixture: concurrent bind succeeded; test passed
```

Acceptance path: **focused-only**.

karmaterminal/openclaw#1299
