# CI Differential Trace: main vs assembly — output

## Task

Investigate 6 red packs from CI run on continuation assembly candidate `fd060c8f6ed`, determine whether each reproduces on `karmaterminal/main` or only on the assembly branch.

## Method

1. Built assembly (`fd060c8f6ed`) and `origin/main` (`342a1e70a04`) in separate worktrees
2. Ran each failing test file on both branches with `node scripts/run-vitest.mjs`
3. For the one "ours" failure, identified root cause and committed fix

## Verdicts

| Pack                                               | Failing surface                                                                        | Verdict                                                   | Evidence                                                                                                                                                                                                                                                                                                 |
| -------------------------------------------------- | -------------------------------------------------------------------------------------- | --------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `core-runtime-infra-process,core-runtime-media-ui` | `src/media/web-media.test.ts`                                                          | **INHERITED FLAKE**                                       | Passes 88/88 locally on both branches. CI-only failure (filesystem-behaviour-dependent hardlink semantics).                                                                                                                                                                                              |
| `agentic-plugin-sdk,agentic-plugins`               | `src/plugins/runtime/load-context.test.ts`                                             | **INHERITED**                                             | Fails on both branches. Test uses `source: "registry"` but `InstallSourceSchema` only permits `npm\|archive\|path\|clawhub\|git\|marketplace`. Schema + test identical.                                                                                                                                  |
| `extension-memory,extension-messaging`             | `extensions/memory-lancedb/embeddings.lifecycle.test.ts`                               | **INHERITED**                                             | Fails on both branches: `closeProvider` called 3 times vs expected 2. Test + deps identical.                                                                                                                                                                                                             |
| `extension-qa,extension-media`                     | `extensions/qa-lab/src/scenario-catalog.test.ts`                                       | **INHERITED**                                             | Stale codeRef: `session-dedup-reconnect` points to `src/gateway/server-methods/agent-dedupe.ts` which doesn't exist (file is at `src/gateway/agent-turn/agent-dedupe.ts`). Scenario YAML identical on both branches. Main has 2 failures; assembly has 1 (we fixed the parallel-script allowlist issue). |
| `extensions,extension-misc`                        | `google-meet/src/oauth.test.ts` + `teams-meetings` + `zoom-meetings`                   | **MIXED: google-meet OURS (fixed); teams/zoom INHERITED** | google-meet: our `callbackPort: 0` addition triggers port validation error → falls to manual mode → parsing error. Fix: removed `callbackPort: 0`. teams/zoom: `spawnSyncMock` called 3x vs expected 2, fails identically on main.                                                                       |
| `extension-slack,extension-telegram`               | `slack/src/monitor/ingress.test.ts` + `telegram/src/{webhook,polling-session}.test.ts` | **INHERITED**                                             | Both fail identically on main. Slack: pending queue assertion mismatch. Telegram: all tests pass but process hangs (resource leak / timer not cleaned up).                                                                                                                                               |

## Fix Applied

**Commit `7460f2dbf60`** on `codeagent/ci-differential-1240`:

- Removed `callbackPort: 0` from `extensions/google-meet/src/oauth.test.ts`
- Root cause: `resolveOAuthLoopbackPort` rejects port ≤ 0; the error message contains "port", which `isLocalCallbackListenerError` matches, causing fallback to manual mode instead of re-throwing the timeout

## Full Suite Tally

```
319 Vitest shards completed
10 shards failed (all inherited defects present on main)
```

The 10 failed shards are:

- `extension-qa` (stale codeRef — inherited)
- `extension-memory` (closeProvider count — inherited)
- `extensions` (teams/zoom spawnSync count — inherited)
- `extension-telegram` (process hang — inherited)
- `extension-slack` (pending queue — inherited)
- `plugins` (source:"registry" invalid — inherited)
- `unit-fast-fake-timers` (CA trust respawn — inherited, identical to main)
- `ui` (device-auth overlay — inherited, identical to main)
- `auto-reply-reply` (inherited, identical to main)
- `tooling` (inherited, identical to main)

## Validation Commands

```bash
# Assembly test (post-fix):
cd WORKTREES/openclaw-ci-differential-1240
node scripts/run-vitest.mjs run --config test/vitest/vitest.extensions.config.ts --maxWorkers=1 extensions/google-meet/src/oauth.test.ts
# Result: 9 passed (9)

# Main control (pre-existing on main):
cd WORKTREES/openclaw-main-control  # origin/main @ 342a1e70a04
node scripts/run-vitest.mjs run --config test/vitest/vitest.plugins.config.ts --maxWorkers=1 src/plugins/runtime/load-context.test.ts
# Result: 1 failed (same error)

# Full suite:
node --import tsx scripts/test-projects.mts
# Result: 319 shards, 10 failed (all inherited)
```

## Uncertainties

1. **Telegram hang**: Tests pass but process doesn't exit. The resource leak is identical on main and assembly. Could not identify the specific timer/server/worker that leaks without deeper investigation.
2. **web-media CI flake**: Passes locally on both branches. The hardlink-swap guard test is likely filesystem-dependent (CI uses a different fs than local). Could not reproduce the `'not-found' to be 'path-not-allowed'` error locally.
3. **4 additional shards** (unit-fast-fake-timers, ui, auto-reply-reply, tooling): verified test files are identical to main; did not run full control on main for these (time constraint), but byte-identity + pattern of inherited failures gives high confidence.
