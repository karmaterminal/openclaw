# Corrective repair: karmaterminal/openclaw#1313

## Named refs

| Category | Named ref | Full SHA | Identity |
|---|---|---|---|
| Product/base ref | `b3a572cd3ea0082679669baa80f0679332643cf8` | `b3a572cd3ea0082679669baa80f0679332643cf8` | Local = server; tracking N/A for a direct commit ref |
| Safe lane ref | `codeagent/fix-1313-telegram-edit-v2` | `d6b60321f6df2e248843840721de53254f4edbec` | Local = tracking = server |
| CI/workflow ref | N/A | N/A | Workorder forbids Actions and broad CI |
| Presentation ref | N/A | N/A | Workorder forbids presentation |
| Docs/proof ref | `codeagent/review-1313-telegram-edit` | `9d19e6c3d0d12e77bfaa4ee240e795353d2eb754` | Local = tracking = server |

## Result

`handleTelegramModelCallback` now sends the post-commit success receipt through the existing
`retryModelAction` contract. Once `applySessionModelSelection` returns `applied`, an ambiguous
failure consuming the edit response propagates for update replay instead of entering the selection
failure renderer. Replay renders the same committed success; Telegram's existing
`message is not modified` handling terminates the idempotent edit without a contradictory failure
message.

The owning composition boundary is
`extensions/telegram/src/bot-handlers.callback-router.ts`: durable model selection and transport
receipt delivery remain distinct outcomes. Persistence failure still renders selection failure,
permanent missing/uneditable targets still complete without replay, and persisted
`providerOverride`, `modelOverride`, `modelOverrideSource`, and `liveModelSwitchPending` facts
remain authoritative.

Production LOC: +5/-3 (net +2) | Tests: +161/-25. The production growth is the callback error
wrapper required to move the committed receipt onto the existing retry owner; no new production
API, branch, or compatibility path was added.

## Regression controls

- Rejected SHA `5211db337163eb3d248bc3062e589451e9bdeff8`: the successor regression,
  applied without the production repair and run under checksum-verified Node `v24.17.0`, failed
  because `firstAttemptError` was `undefined`. The old owner swallowed the accepted success edit's
  lost response and emitted the contradictory failure edit.
- Successor SHA `d6b60321f6df2e248843840721de53254f4edbec`: the same Node 24 regression
  passed. The first accepted success edit produced a retryable response-read failure; a restarted
  bot/router using the production Telegram fetch adapter replayed the identical success receipt;
  the loopback API returned `message is not modified`; no failure receipt was sent.
- The loopback retains grammY's default keep-alive client for the exact Node 24 trigger. The restart
  leg uses the production `resolveTelegramTransport` plus `createTelegramClientFetch` composition,
  not a non-reusing fixture agent.
- The focused middleware suite covers the existing persistence-failure retry and the new permanent
  edit-target completion. The permanent case verifies the update advances once, replay does not
  issue another edit, and committed session facts remain present.

## Validation

Focused-only acceptance; no Actions, PR, integration, presentation, deployment, or broad suite was
run.

```text
PATH=<verified-node-v24.17.0>/bin:$PATH node scripts/run-vitest.mjs run \
  --config test/vitest/vitest.extension-telegram.config.ts --maxWorkers=1 \
  extensions/telegram/src/model-callback.loopback.integration.test.ts \
  extensions/telegram/src/bot.create-telegram-bot.test.ts
```

Result: 2 files passed, 150 tests passed.

```text
PATH=<verified-node-v24.17.0>/bin:$PATH node scripts/run-vitest.mjs run \
  --config test/vitest/vitest.extension-telegram.config.ts --maxWorkers=1 \
  extensions/telegram/src/model-callback.loopback.integration.test.ts
node scripts/run-vitest.mjs run \
  --config test/vitest/vitest.extension-telegram.config.ts --maxWorkers=1 \
  extensions/telegram/src/model-callback.loopback.integration.test.ts
pnpm tsgo:extensions
pnpm tsgo:extensions:test
node scripts/run-oxlint.mjs --tsconfig extensions/tsconfig.json \
  extensions/telegram/src/bot-handlers.callback-router.ts \
  extensions/telegram/src/bot.create-telegram-bot.test.ts \
  extensions/telegram/src/model-callback.loopback.integration.test.ts
git diff --check
```

Result: Node 24 loopback passed; Node 25 loopback passed; extension production and test type checks
passed; focused Oxlint and diff checks passed.

`node scripts/check-changed.mjs -- <three changed Telegram paths>` passed every executed check,
including formatting and focused doctor-contract tests, then stopped on the repository-wide
`plugin-sdk-memory-host-core-public-demotion` compatibility record. The same
`plugins:boundary-report:ci` command fails unchanged at the exact base
`b3a572cd3ea0082679669baa80f0679332643cf8`; it is unrelated to this Telegram lane.

Final independent autoreview: scoped clean at P1, patch correct with 0.91 confidence.

## Uncertainties

No live Telegram request was sent because the workorder explicitly limits this lane to focused local
tests. The deterministic real grammY/HTTP loopback and production transport restart cover the
reported owner boundary; they are not claimed as live Telegram proof.
