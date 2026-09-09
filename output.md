# Independent review: FAIL

Candidate `04e592d18454a501a0636b0aedf7d32023da6aa9` applies the production repair at the correct Telegram callback composition boundary, but its regression is not deterministic across supported Node 24 releases. The successor test fails on Node 24.19.0 and 24.20.0 before proving replay.

Issue: [karmaterminal/openclaw#1313](https://github.com/karmaterminal/openclaw/issues/1313), opened by frond scribe 🌿 (`@scribe-dandelion-cult`, account created 2026-05-06).

## Named refs

| Category | Named ref | Full SHA | Equality before evidence |
|---|---|---|---|
| Product/base ref | base `b3a572cd3ea0082679669baa80f0679332643cf8`; candidate `04e592d18454a501a0636b0aedf7d32023da6aa9` | base `b3a572cd3ea0082679669baa80f0679332643cf8`; candidate `04e592d18454a501a0636b0aedf7d32023da6aa9` | Both local objects matched their named SHAs; GitHub commit API returned the same full SHAs. |
| Safe lane branch ref | `codeagent/review-1313-telegram-edit-v2` | `04e592d18454a501a0636b0aedf7d32023da6aa9` | Local, `origin/` tracking, and `git ls-remote origin` were equal after publishing the unchanged branch. |
| CI/workflow ref | N/A | N/A | Workorder forbids Actions. |
| Presentation ref | N/A | N/A | No PR, integration, presentation, or deployment. |
| Docs/proof ref | pre-evidence `codeagent/review-1313-telegram-edit-v2` | `04e592d18454a501a0636b0aedf7d32023da6aa9` | Same local/tracking/server equality as the safe lane branch. |

## Blocking finding

`extensions/telegram/src/model-callback.loopback.integration.test.ts:275-278` assumes every Node 24 release will surface a first-attempt transport error from incidental keepalive/socket behavior. That premise is false:

- Node 24.17.0: rejected production fails and the successor passes.
- Repository-pinned Node 24.19.0: both rejected and successor runs fail at `expected undefined to be an instance of Error`.
- Node 24.20.0: both rejected and successor runs fail at the same assertion.

The supported range is Node `>=24.15.0 <25` (`package.json:2238`), and CI uses `24.x`. The candidate therefore cannot supply the required deterministic rejected-SHA negative and successor positive across its supported/CI runtime. Replace the Node-major conditional and incidental socket race with a deterministic response-loss injection after the loopback server has committed the first success edit. Keep the real transport and production-like keepalive, then prove the rejected router emits the contradictory second edit while the successor bubbles for replay and treats the replay's `message is not modified` response as the one committed success receipt.

## Production behavior assessment

The two-line semantic production change is correct and in the best layer. `extensions/telegram/src/bot-handlers.callback-router.ts:694-699` routes the post-persistence success edit through the existing `TelegramRetryableCallbackError` boundary. The outer router at `extensions/telegram/src/bot-handlers.callback-router.ts:394-405` then:

- swallows permanent edit-target failures without undoing or misreporting the committed selection;
- rethrows ambiguous/transient edit failures for callback replay;
- avoids the inner generic catch that previously emitted `Failed to change model` after a committed selection.

The replay repeats the idempotent model selection, attempts the same success receipt, and accepts Telegram's `message is not modified` response through `extensions/telegram/src/bot-handlers.callback-actions.ts:106-123`. Persistence failure remains before any success receipt and still retries. The permanent-edit regression at `extensions/telegram/src/bot.create-telegram-bot.test.ts:5736-5792` proves the update completes, the durable selection remains, and replay does not issue another edit.

**Best-fix verdict:** the production change is the best owner-boundary fix, but the candidate is not acceptable until its nondeterministic regression is repaired.

**Alternatives considered:** moving the success edit outside the selection `try` would bypass the established callback retry/permanent-error classifier; adding receipt persistence would be unnecessary state for an idempotent Telegram edit; weakening the Node 24 assertion would remove the required negative control rather than fix it.

## Regression and sibling evidence

### Rejected SHA

Using candidate regression code against production at `b3a572cd3ea0082679669baa80f0679332643cf8`, Node 24.17.0 failed at the expected boundary because the ambiguous first success edit was swallowed. A disposable negative-control instrumentation advanced past that assertion and exposed the exact contradiction:

```text
Expected: sendMessage, answerCallbackQuery, editMessageText
Received: sendMessage, answerCallbackQuery, editMessageText, editMessageText
```

The extra request was the failure edit after the server had already applied the success edit.

### Successor SHA

Node 24.17.0 passed the unchanged successor regression. It preserved the durable model selection, retried the same success receipt after restart/replay, accepted `message is not modified`, and emitted no `Failed to change model` edit.

The required focused sibling command also passed on Node 24.17.0:

```text
PATH=/home/figs/.nvm/versions/node/v24.17.0/bin:$PATH \
  node scripts/run-vitest.mjs run \
  --config test/vitest/vitest.extension-telegram.config.ts \
  --maxWorkers=1 \
  extensions/telegram/src/model-callback.loopback.integration.test.ts \
  extensions/telegram/src/bot.create-telegram-bot.test.ts \
  extensions/telegram/src/telegram-ingress-callback.integration.test.ts

Test Files  3 passed (3)
Tests       153 passed (153)
```

This includes session-store retry, permanent edit completion, command/model callback retry, callback ACK recovery, and the loopback `message is not modified` replay path.

### Failing successor controls

The unchanged successor failed on both Node 24.19.0 and Node 24.20.0:

```text
extensions/telegram/src/model-callback.loopback.integration.test.ts:276
AssertionError: expected undefined to be an instance of Error
```

No Actions were run. Acceptance path: **focused-only**.

## Review map

- Changed surface and owner: Telegram model callback router.
- Entry point/caller: `createTelegramCallbackRouter` callback-query route.
- Callee: `applySessionModelSelection`, then `editCallbackMessageWithButtons`.
- Siblings: command pagination retry, permanent callback edit handling, callback ACK recovery, and `message is not modified`.
- Current-main context: `origin/main` at `d8420e5a727d41606bfb58d4e0dd772e430ca6c3` still contains the unwrapped success edit; the workorder's historical base/candidate pair remains the review authority.
- Code read: `extensions/telegram/src/bot-handlers.callback-router.ts`, `extensions/telegram/src/bot-handlers.callback-actions.ts`, `extensions/telegram/src/bot-handlers.callback-router-controls.ts`, `extensions/telegram/src/bot-core.ts`, `extensions/telegram/src/callback-query-answer-state.ts`, `extensions/telegram/src/network-errors.ts`, and all three changed tests.
- Remaining uncertainty: no live Telegram, integration, presentation, deployment, or Actions proof was allowed by the workorder.

Production LOC: `+5/-3` (net `+2`) | Tests: `+158/-23` (net `+135`)

## Terminal verdict

**FAIL**
