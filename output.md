# Independent review: issue #1319 v2

## Named-ref contract (pre-evidence)

| Category | Named ref | Full SHA | Local / tracking / server |
|---|---|---|---|
| Product/base ref | `92ae08ae5b74aeca70fbd57cf260e5fb28e274fc` | `92ae08ae5b74aeca70fbd57cf260e5fb28e274fc` | Local object resolved; tracking/server equality N/A (immutable commit ref) |
| Safe lane ref | `codeagent/review-1319-telegram-order-v2` | `7ddb61ea41f5f26b76bd0869c7ad4c7bbd06966a` | Equal: local, `origin/codeagent/review-1319-telegram-order-v2`, and server |
| CI/workflow ref | N/A | N/A | No Actions per workorder |
| Presentation ref | N/A | N/A | No PR or presentation per workorder |
| Docs/proof ref | `codeagent/review-1319-telegram-order-v2` | `7ddb61ea41f5f26b76bd0869c7ad4c7bbd06966a` | Pre-evidence anchor equal locally, tracking, and server; final `output.md` receipt recorded below |

## Review result

**PASS**

Candidate `7ddb61ea41f5f26b76bd0869c7ad4c7bbd06966a` correctly repairs the issue
#1319 callback-answer ownership defect against base
`92ae08ae5b74aeca70fbd57cf260e5fb28e274fc`. No blocking or non-blocking
candidate finding was identified.

Production LOC: +18/-7 (net +11) | Tests: +65/-0

The positive production delta is justified by moving the callback answer map
from a module-local `WeakMap` to a non-enumerable, bot-owned map keyed by
`Symbol.for("openclaw.telegram.callbackQueryAnswers")`. That is the smallest
composition-boundary change that lets isolated/reloaded admission and
middleware module graphs share state while preserving per-bot isolation.

## Issue and evidence map

- Issue: [karmaterminal/openclaw#1319](https://github.com/karmaterminal/openclaw/issues/1319),
  “Mode-B: Telegram duplicate callback answer is missing under shared shard
  order.” It remains open and unassigned.
- Opener: frond scribe (@scribe-dandelion-cult), account created 2026-05-06.
  Repository activity over the prior 12 months: 3 PRs, 9 issues, 1
  default-branch commit; GitHub contribution graph: 2466 commits, 1802 PRs,
  401 issues, and 41 reviews.
- Changed surface and owner:
  `extensions/telegram/src/callback-query-answer-state.ts`.
- Admission caller:
  `extensions/telegram/src/telegram-ingress-drain-factory.ts`.
- Middleware consumer and fallback:
  `extensions/telegram/src/bot-core.ts` and
  `extensions/telegram/src/bot-handlers.callback-router.ts`.
- Durable tracker/tombstone owner:
  `extensions/telegram/src/telegram-ingress-drain.ts` delegates durable
  completion to the shared channel ingress monitor; callback state does not
  alter queue persistence.
- Adjacent behavior proof:
  `extensions/telegram/src/telegram-ingress-drain-factory.test.ts`,
  `extensions/telegram/src/telegram-ingress-callback.integration.test.ts`, and
  `extensions/telegram/src/bot.create-telegram-bot.test.ts`.
- New isolated-graph regression:
  `extensions/telegram/src/callback-query-answer-state.test.ts`.

## Repair completeness

**Invariant and owning boundary.** A single bot object owns one callback-query
answer record per callback ID. Durable admission and middleware consumption
must observe the same record even when they loaded separate instances of the
state module. The bot lifetime, not a module instance, is the composition
boundary.

**Rejected-SHA negative control.** On
`92ae08ae5b74aeca70fbd57cf260e5fb28e274fc`, the candidate regression file was
overlaid unchanged and run before the existing drain-factory coverage in one
serial process. Both isolated-module-graph cases failed for the expected
reason: the replacement graph returned `undefined` for the answer promise held
in the first graph. The existing factory matrix still passed 11/11, confirming
the broader preceding-state/module-replacement interaction rather than a
standalone admission-order defect.

**Successor positive.** On
`7ddb61ea41f5f26b76bd0869c7ad4c7bbd06966a`, the same focused composition
passed 165/165 tests across four files. The complete serial Telegram shard then
passed 218 files and 3960 tests.

**State and alternate paths.**

- `admission-retained` survives successful settlement until middleware takes
  it; the settled record is deleted on consumption.
- `admission-transient` is upgraded to retained when a new-row admission
  follows an existing-row admission; consumer-first state remains consumed.
- Pending duplicate starts coalesce onto the identical promise. Existing-row
  tombstone admissions never become dispatchable retained state.
- Rejected answers delete their record and allow the router to issue a fresh
  ACK. Middleware- and handler-level HTTP 503 recovery each produced exactly
  two answer requests and no retained residue.
- Restart uses a new bot object, intentionally loses the old in-memory answer,
  and re-answers replayed durable work. The restarted bot then coalesces its
  own transient duplicates.
- Queue tracker, adoption, durable tombstone, retry, rollback, and restart
  semantics remain owned by the existing ingress monitor and are unchanged by
  this in-memory ownership repair.

## Best-fix judgment

**Best-fix verdict: best.** A global map would violate per-bot isolation, while
passing state explicitly through every admission and middleware caller would
duplicate ownership and widen APIs. A module-local `WeakMap` is the proven
failure mode. A hidden symbol-backed map on the existing bot lifetime owner is
the narrow canonical repair: it shares only the state that must cross module
graphs, remains unreachable through ordinary enumeration, and is garbage
collected with the bot.

The tests protect observable ownership and coalescing behavior rather than
implementation shape: they use separate module graphs, assert promise identity,
single ACK issuance, one-shot consumption, and the real callback
admission/router boundaries. No test-only production seam was added.

## Validation

```text
# Rejected base, candidate regression overlaid unchanged:
node scripts/run-vitest.mjs run --config test/vitest/vitest.extension-telegram.config.ts --maxWorkers=1 \
  extensions/telegram/src/callback-query-answer-state.test.ts \
  extensions/telegram/src/telegram-ingress-drain-factory.test.ts
Result: expected failure, 1 file failed / 1 passed; 2 tests failed / 11 passed.

# Successor focused owner and sibling proof:
node scripts/run-vitest.mjs run --config test/vitest/vitest.extension-telegram.config.ts --maxWorkers=1 \
  extensions/telegram/src/callback-query-answer-state.test.ts \
  extensions/telegram/src/telegram-ingress-drain-factory.test.ts \
  extensions/telegram/src/telegram-ingress-callback.integration.test.ts \
  extensions/telegram/src/bot.create-telegram-bot.test.ts
Result: 4 files passed; 165 tests passed.

# Complete serial Telegram shard:
node scripts/run-vitest.mjs run --config test/vitest/vitest.extension-telegram.config.ts --maxWorkers=1
Result: 218 files passed; 3960 tests passed.

pnpm tsgo:extensions
pnpm tsgo:extensions:test
Result: both passed.

node_modules/.bin/oxfmt --check \
  extensions/telegram/src/callback-query-answer-state.ts \
  extensions/telegram/src/callback-query-answer-state.test.ts
git diff --check 92ae08ae5b74aeca70fbd57cf260e5fb28e274fc \
  7ddb61ea41f5f26b76bd0869c7ad4c7bbd06966a
Result: passed.

.agents/skills/autoreview/scripts/autoreview --mode branch \
  --base 92ae08ae5b74aeca70fbd57cf260e5fb28e274fc --max-priority P2 ...
Result: scoped-clean, no actionable P0-P2 finding; correctness 0.93.
```

`node scripts/check-changed.mjs -- <candidate files>` stopped before its type
lanes at `plugins:boundary-report:ci`: one unrelated compatibility record had
become due. Running that exact boundary command on the pinned base produced the
same failure. The candidate-specific format, TypeScript, focused, serial shard,
and independent-review proofs are green. Per the workorder, acceptance is
**focused-only**: no Actions, PR, presentation, live Telegram, or deployment
was run.

## Remaining uncertainty

No authenticated live Telegram turn was run because the workorder explicitly
forbids deployment/presentation and requests local serial proof. The loopback
integration verifies real grammY API request ordering and ACK rejection
recovery, but it is not a live Telegram Test Server receipt.
