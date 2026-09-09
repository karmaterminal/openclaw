# Independent review: karmaterminal/openclaw#1313 v3

**Verdict: PASS**

Candidate `cd05a1529bd78525e904a4fba136f29aecfa4448` is a test-only successor to accepted production-owner fix `04e592d18454a501a0636b0aedf7d32023da6aa9`. Production is byte-identical between those commits: `extensions/telegram/src/bot-handlers.callback-router.ts` has blob `fcf617aed286846a33a0d65438ac979c4d324ce7` at both refs. The candidate changes only `extensions/telegram/src/model-callback.loopback.integration.test.ts` (`+17/-11`).

## Named refs

| Category | Named ref | Full SHA | Local/tracking/server identity |
|---|---|---|---|
| Product/base ref | `04e592d18454a501a0636b0aedf7d32023da6aa9` | `04e592d18454a501a0636b0aedf7d32023da6aa9` | Local object resolved exactly; immutable commit |
| Safe lane ref | `codeagent/review-1313-telegram-edit-v3` | `cd05a1529bd78525e904a4fba136f29aecfa4448` | Local branch and `origin` server ref equal before evidence |
| CI/workflow ref | N/A | N/A | Workorder forbids Actions; focused local proof only |
| Presentation ref | N/A | N/A | No presentation work |
| Docs/proof ref | N/A | N/A | This receipt is committed on the safe lane ref |

## Review result

- **Invariant and owner boundary:** once `applySessionModelSelection` commits the session selection, loss of the success-edit response must remain a retryable callback receipt failure. `handleTelegramModelCallback` in `extensions/telegram/src/bot-handlers.callback-router.ts` owns that composition. It must not recast the committed selection as a failed selection or emit a contradictory second terminal edit.
- **Deterministic response-loss trigger:** the loopback API updates `sentMessage` before calling `response.destroy(...)`. Thus Telegram-side state is committed while the HTTP success response is deliberately lost. The successor then replays against the committed text and receives the explicit 400 `message is not modified` response. This mechanism has no Node-version branch.
- **Real transport:** replay uses `resolveTelegramTransport()` and `createTelegramClientFetch(...)`, which route through the production-owned undici `Agent`. `buildTelegramConnectOptions` sets `keepAlive: true`; the test closes the owned transport in `finally`.
- **Committed selection:** after the first ambiguous response, the test reads the real session store and confirms `providerOverride`, `modelOverride`, `modelOverrideSource: "user"`, and `liveModelSwitchPending: true`.
- **Retry/replay and exact methods:** successor first attempt records exactly `sendMessage`, `answerCallbackQuery`, `editMessageText`; replay adds exactly one `editMessageText`. Authorization/catalog steps execute once per attempt. Both edit payloads are success receipts and never contain `Failed to change model`.
- **Message-not-modified:** the loopback counts exactly one explicit `message is not modified` response on replay, which the callback action accepts.
- **Permanent target failure:** focused owner test confirms a committed selection survives `message can't be edited`, the update is acknowledged/completed, the edit is attempted once, and duplicate processing does not edit again.
- **Persistence failure:** focused owner test injects a pre-commit session-store failure, confirms it bubbles for retry, then succeeds with exactly one success edit and no false failure receipt.
- **Callback ACK:** focused owner tests confirm durable admission reuses one ACK and restart replay re-answers when process-local admission state is lost.
- **Sibling/alternate path:** provider callback edit failure remains retryable; permanent callback target errors remain terminal after persistence. Persistence has no rollback after a committed selection; pre-commit persistence failure retries without emitting a receipt.

## Rejected-production control

The negative control combines rejected production `b3a572cd3ea0082679669baa80f0679332643cf8` with the exact candidate test blob. Candidate and control test blobs both equal `40609643d97e9cd0bf5730b8ac9780c434d702d9`; rejected router blob is `b6e41dc08c54dec52d6480b6d02d68153b09c59b`.

On Node 24.17.0, 24.19.0, and 24.20.0, the identical control deterministically fails at the first exact method-list assertion. Expected:

```text
sendMessage, answerCallbackQuery, editMessageText
```

Rejected production actually performs:

```text
sendMessage, answerCallbackQuery, editMessageText, editMessageText
```

This proves the control exposes the production defect before the replay assertions and does not depend on incidental Node response timing.

## Focused validation

Candidate loopback, each with one worker:

```text
Node 24.17.0: 1 passed
Node 24.19.0: 1 passed
Node 24.20.0: 1 passed
```

Command shape:

```sh
<node-24.x>/bin/node scripts/run-vitest.mjs run \
  --config test/vitest/vitest.extension-telegram.config.ts \
  --maxWorkers=1 \
  extensions/telegram/src/model-callback.loopback.integration.test.ts
```

Node 24.20.0 owner/sibling proofs:

```text
retries model selection callbacks after a bubbled session-store failure: passed
keeps a committed model selection when its receipt target is permanently unavailable: passed
reuses the callback answer started at durable admission: passed
re-answers a durable callback after bot restart loses admission state: passed
```

Independent autoreview against the production-owner base was `scoped-clean` at P0/P1 with correctness confidence `0.9`; it found no accepted/actionable finding. Acceptance path: **focused-only**, as required by the workorder; no Actions, PR, integration, presentation, deployment, or broad suite was run.
