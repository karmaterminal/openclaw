# Independent review: karmaterminal/openclaw#1313

## Named refs

| Category | Named ref | Full SHA | Identity |
|---|---|---|---|
| Product/base ref | `b3a572cd3e` | `b3a572cd3ea0082679669baa80f0679332643cf8` | Local object resolved |
| Safe lane ref | `codeagent/review-1313-telegram-edit` | `5211db337163eb3d248bc3062e589451e9bdeff8` | Local = tracking = server |
| CI/workflow ref | N/A | N/A | Workorder forbids Actions |
| Presentation ref | N/A | N/A | Workorder forbids presentation |
| Docs/proof ref | N/A | N/A | No pre-existing docs/proof ref is an evidence input |

## Verdict: FAIL

Candidate `5211db337163eb3d248bc3062e589451e9bdeff8` makes the focused test green, but it does so by removing the keep-alive response-read failure that exposes a production callback bug. The first `editMessageText` is accepted and renders the successful model-change receipt. Its response then rejects in grammY under Node 24; `handleTelegramModelCallback` catches that edit failure as though model persistence failed and sends a second `editMessageText` saying the model change failed. The model selection remains durably applied. A fixture-only non-keepalive agent suppresses the contradictory second edit rather than repairing its production owner.

**Finding (P1):** `extensions/telegram/src/model-callback.loopback.integration.test.ts:144` replaces production-like connection reuse with `keepAlive: false`. This hides the post-persistence ambiguous-response path in `extensions/telegram/src/bot-handlers.callback-router.ts:694-701`.

Production LOC: +0/-0 (net 0) | Tests: +8/-2

## Root cause and owner boundary

- **Invariant:** once `applySessionModelSelection` reports `applied`, Telegram feedback must reflect that durable fact. An ambiguous failure while reading the success edit's response must not be recast as a failed model selection.
- **Owner:** model callback composition in `handleTelegramModelCallback`, specifically the boundary between durable selection application and terminal Telegram receipt rendering.
- **Observed failure:** an external preload traced the rejected SHA's three grammY requests. The first edit carried the successful model-change receipt; the second carried `Failed to change model: HttpError: Network request for 'editMessageText' failed!`.
- **Persistence:** `applySessionModelSelection` awaits `persistReplySessionEntry` before the first edit. The accepted edit/read failure causes no rollback; the stored provider/model override and `liveModelSwitchPending` remain committed.
- **Partial failure:** the final success edit is not wrapped by `retryModelAction`. Its `HttpError` enters the broad selection catch, which attempts the contradictory failure edit and prevents the callback retry owner from seeing the transient failure.
- **Retry/recovery:** sibling model-menu edits and selection persistence failures are wrapped in `TelegramRetryableCallbackError`. The router bubbles those for update replay, while permanent missing-target/no-text edit failures are terminal. The final success receipt is the asymmetric path.
- **Restart:** restart does not repair the visible contradiction. Durable session state survives, while the Telegram message can say the change failed.
- **Rollback:** no rollback exists or is appropriate after the authoritative selection commit. The receipt path must adapt to committed state.

## Deterministic controls

The recorded Mode-B product SHA `fc4e29c12aec3512bfa97877706dfa7e31e6b939` is an ancestor of the review base. The test, callback router, callback actions, model-selection owner, and session-persistence owner have identical blob IDs at that product SHA and at `b3a572cd3ea0082679669baa80f0679332643cf8`.

Using the exact failing runtime—official Node `v24.17.0` Linux AArch64, checksum verified from the Node distribution:

- **Negative:** `b3a572cd3ea0082679669baa80f0679332643cf8` failed 4/4 focused runs with `sendMessage`, `answerCallbackQuery`, `editMessageText`, `editMessageText` (one direct run plus 3/3 stress runs).
- **Positive:** `5211db337163eb3d248bc3062e589451e9bdeff8` passed 11/11 focused runs with the unchanged strict three-method assertion (one direct run plus 10/10 stress runs).
- **Runtime discriminator:** under the host-default Node `v25.9.0`, both base and candidate passed once. The defect is repeatable under the Mode-B Node 24 runtime, not a generic source-order coincidence.
- **Historical receipt:** existing Mode-B run `34314908785`, workflow SHA `30cf7234393690fade354ab577b58a9b9a67d03b`, failed the byte-identical path under Node `v24.17.0` and re-red in its serial determinism confirmation. No Action was dispatched for this review.

Focused command:

```text
node scripts/run-vitest.mjs run --config test/vitest/vitest.extension-telegram.config.ts --maxWorkers=1 extensions/telegram/src/model-callback.loopback.integration.test.ts
```

The exact-runtime runs invoked that command with the checksum-verified Node `v24.17.0` binary first on `PATH`. The rejected SHA used a detached proof worktree with same-host dependency symlinks; no dependency installation or reconciliation ran.

## Dependency and production-path proof

- Installed grammY `1.46.0` constructs a cached `node:http.Agent({ keepAlive: true })` for plain HTTP when no custom fetch is supplied. Its client resolves only after `fetch(...).then(response => response.json())`.
- Installed node-fetch `2.7.0` passes the supplied agent to `http.request`; response/body failures reject the request and it does not retry this POST.
- Production bot construction does not use this default node-fetch path. `extensions/telegram/src/bot-core.ts:134-172` creates the Telegram-owned undici transport and injects its wrapped fetch into grammY. The changed default grammY client exists only in this hand-built loopback fixture.
- Therefore the Node 24 fixture transport explains why this exact test repeats the response-read ambiguity, but it does not make the production catch correct. Real transports can also lose an accepted non-idempotent request's response; `extensions/telegram/src/network-errors.ts:39-42` already classifies resets/timeouts as ambiguous for that reason.

## Best-fix verdict

**Wrong layer.** Keep the regression capable of exercising response ambiguity and repair the callback owner. Separate durable model-selection failure from terminal receipt failure. After selection is applied, route the success edit through the existing retryable callback contract; replay can re-render the committed success receipt, and an already-applied identical edit can terminate through the existing message-not-modified handling.

**Alternatives considered:**

1. Disable keep-alive in the fixture — rejected because it removes the only deterministic trigger and leaves production able to report committed state as failed.
2. Raise or disable the loopback server timeout — rejected because the exact Node 24 failure completes in about 414 ms; the server's measured default keep-alive timeout is 5 seconds.
3. Use the production undici fetch in the fixture — useful for a separate production-transport integration test, but insufficient as the regression fix because it also removes the deterministic accepted-request/lost-response case.

## Test value audit

The strict method list is valuable owner-boundary coverage: it detects a user-visible contradictory terminal edit after a durable model selection. It was added with the opaque callback loopback in `8954634b15eac9d3de2cd055475b94f2e74ca04a`. The candidate does not weaken its assertion, but it weakens the fixture condition that made the regression credible. Existing mocked call-count tests cannot replace this boundary proof because their edit mocks cannot accept a request and then fail while the response is consumed.

## Code and history read

`extensions/telegram/AGENTS.md`; `extensions/telegram/src/model-callback.loopback.integration.test.ts`; `extensions/telegram/src/bot-handlers.callback-router.ts`; `extensions/telegram/src/bot-handlers.callback-actions.ts`; `extensions/telegram/src/bot-handlers.callback-router-controls.ts`; `extensions/telegram/src/bot-core.ts`; `extensions/telegram/src/send-context.ts`; `extensions/telegram/src/client-fetch.ts`; `extensions/telegram/src/fetch.ts`; `extensions/telegram/src/network-errors.ts`; `extensions/telegram/src/bot.create-telegram-bot.test.ts`; `src/model-picker/apply-session-model-selection.ts`; `src/auto-reply/reply/session-entry-persistence.ts`; grammY `1.46.0`; node-fetch `2.7.0`; Node `v24.17.0` HTTP agent/client source; commits `8954634b15e`, `aa017bf9ddf`, and `d2825c70a5`.

**Provenance:** `aa017bf9ddfa0d2e583b1addcfaf5e8c2db4eea8` (raw parent `df4c086c524dde1efeabed997d37603ffab95610`) added retry propagation for model-selection persistence but explicitly left the final success edit inside the broad failure-message catch. Refactors carried that asymmetry forward. `8954634b15eac9d3de2cd055475b94f2e74ca04a` later added the loopback assertion that exposes it.

**Independent review:** mandatory autoreview returned the same P1 finding and judged the patch incorrect with 0.96 confidence.

**Remaining uncertainty:** no live Telegram request was sent, and the workorder forbids Actions. This does not affect the rejection: the exact Node 24 owner-boundary negative and positive controls are deterministic, and the production control flow is explicit. Acceptance path is **focused-only**.
