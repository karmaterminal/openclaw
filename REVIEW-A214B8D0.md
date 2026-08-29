# Independent review: `a214b8d0`

Bound item: openclaw/openclaw#129388  
Review scope: `c2ee2f6cf58b933df72b918513c26893c18dfdf3..a214b8d040aee5eb639d1753580d8abeba716593`

## Named refs

| Ref category       | Named ref                                                          | Full SHA                                                                                  | Local    | Tracking | Server / workflow                                                | Evidence use                   |
| ------------------ | ------------------------------------------------------------------ | ----------------------------------------------------------------------------------------- | -------- | -------- | ---------------------------------------------------------------- | ------------------------------ |
| Product/base       | rejected candidate (immutable commit)                              | `c2ee2f6cf58b933df72b918513c26893c18dfdf3`                                                | resolved | N/A      | supplied immutable SHA                                           | negative control and diff base |
| Safe review branch | `codeagent/129388-a214b8d0-import-fix-independent-review-20260829` | initially `a214b8d040aee5eb639d1753580d8abeba716593`                                      | equal    | equal    | equal after publishing unchanged branch                          | lane identity before evidence  |
| CI/workflow        | N/A                                                                | N/A                                                                                       | N/A      | N/A      | focused-only; no broad workflow dispatched                       | no broad-acceptance credit     |
| Presentation       | N/A                                                                | protected presentation `00c7f721a55554d0b9228337cc8bc6bec88f9e9f` explicitly out of scope | N/A      | N/A      | N/A                                                              | not inspected or credited      |
| Docs/proof         | N/A                                                                | N/A                                                                                       | N/A      | N/A      | current upstream, proof, docs, and fleet explicitly out of scope | not inspected or credited      |

The product successor and its preservation refs were independently resolved before
evidence:

| Named ref                                                           | Local                                      | Tracking | Server |
| ------------------------------------------------------------------- | ------------------------------------------ | -------- | ------ |
| `codeagent/129388-terminal-notice-test-import-fix-20260829`         | `a214b8d040aee5eb639d1753580d8abeba716593` | equal    | equal  |
| `savegame/129388-terminal-notice-test-import-fix-a214b8d0-20260829` | `a214b8d040aee5eb639d1753580d8abeba716593` | equal    | equal  |

Successor `a214b8d040aee5eb639d1753580d8abeba716593` has exact parent
`c2ee2f6cf58b933df72b918513c26893c18dfdf3` and tree
`ef9ee3995db7c64b865355003885c3d60602ec7f`. The worktree was clean before
review output. The commit body contains `Refs openclaw/openclaw#129388` and the
required `Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>`
trailer.

## Diff assessment

The complete diff is one test file, `+2/-4`:

`src/auto-reply/continuation/work-terminal-notice.durability.test.ts`

- `prepareFormattedSystemEvents` remains imported from its implementation owner,
  `../reply/session-system-events.js`.
- `settleManagedSystemEventsAfterTurnAdoption` now imports from its implementation
  owner, `../reply/session-system-event-adoption.js`.
- `session-system-event-adoption.ts` is the sole production definition of the
  settlement helper. `session-system-events.ts` does not re-export it.
- No production file, compatibility export, dependency manifest, configuration,
  test name, fixture, assertion, mock, or coverage owner changed.

Production LOC: `+0/-0` (net `0`) | Tests: `+2/-4` (net `-2`).

The violated invariant was complete consumer migration when final system-event
adoption moved to `session-system-event-adoption.ts`. The owning composition
boundary is prompt preparation in `session-system-events.ts` followed by durable
turn-adoption settlement in `session-system-event-adoption.ts`. The successor is
the best fix: it updates the stale test consumer directly and adds no production
compatibility surface. Re-exporting from the old module or moving the helper back
would preserve redundant ownership.

Nearest alternate and lifecycle paths were retained and passed: prompt preparation
before adoption, adoption acknowledgement, restart replay, transcript-adopted
recovery, completed tombstones, concurrent handoff, transient/unknown enqueue
failure, recipient-authority invalidation, and route/current-session batch
isolation.

## Rejected controls

Exact rejected parent `c2ee2f6cf58b933df72b918513c26893c18dfdf3`,
Node `v24.20.0`, pnpm `11.22.0`, one worker:

- Durability suite: 10 passed, 2 failed. Both failures were
  `TypeError: settleManagedSystemEventsAfterTurnAdoption is not a function` in
  `adoptPreparedTurn`.
- Core test typing: failed with `TS2305` because
  `../reply/session-system-events.js` has no exported member
  `settleManagedSystemEventsAfterTurnAdoption`.

These results independently reproduce the HIGH finding in `REVIEW-C2EE2F6C.md`.

## Successor commands and results

Validation ran in a clean task-owned normal clone at the exact successor, using a
fresh frozen install from the exact unchanged manifest and lockfile. No install or
dependency reconciliation ran in the linked review worktree.

| Command                                                                                                                                                                                                                           | Result                                                     |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| `node scripts/run-vitest.mjs run --config test/vitest/vitest.auto-reply.config.ts --maxWorkers=1 src/auto-reply/continuation/work-terminal-notice.durability.test.ts`                                                             | 1 file, 12 passed                                          |
| `node scripts/run-vitest.mjs run --config test/vitest/vitest.auto-reply-reply.config.ts --maxWorkers=1 src/auto-reply/reply/session-system-events.recipient-authority.test.ts src/auto-reply/reply/session-system-events.test.ts` | 2 files, 26 passed                                         |
| `node_modules/.bin/oxfmt --check src/auto-reply/continuation/work-terminal-notice.durability.test.ts`                                                                                                                             | passed                                                     |
| `node scripts/run-oxlint.mjs src/auto-reply/continuation/work-terminal-notice.durability.test.ts`                                                                                                                                 | passed                                                     |
| `node --import ./scripts/tsx.mjs scripts/check-max-lines-ratchet.mts --base c2ee2f6cf58b933df72b918513c26893c18dfdf3`                                                                                                             | passed; 884 grandfathered suppressions, no new suppression |
| `node scripts/run-tsgo-core-test-shards.mjs`                                                                                                                                                                                      | passed                                                     |

An initial linked-worktree check found stale shared workspace importer links and
produced an unrelated `pako` declaration error. That result is not credited. The
clean exact clone eliminated the stale dependency state and passed the complete
core test type shard sequence.

## Evidence map

- Changed surface: durability test import only.
- Runtime entry point: `deliverPendingTerminalNotice` hands terminal outcomes to
  the durable session-delivery queue.
- Preparation owner: `prepareFormattedSystemEvents`.
- Adoption owner: `settleManagedSystemEventsAfterTurnAdoption`.
- Caller: `get-reply-run-execute.ts` settles managed deliveries after durable turn
  adoption.
- Callee: delivery acknowledgement functions owned by
  `session-system-event-adoption.ts`.
- Siblings: `session-system-events.test.ts` and
  `session-system-events.recipient-authority.test.ts`.
- Persistence/recovery: the 12-case durability suite exercises SQLite task-flow
  state, durable delivery rows, restart recovery, replay, acknowledgement, and
  partial failures.

## Residual uncertainty

No Mode-B or other broad acceptance workflow was dispatched, so this report claims
focused-only evidence. That is proportionate to the exact test-only import diff but
is not broad product acceptance. Protected presentation, current upstream, proof
corpus, docs, and fleet runtime remain out of scope. No product behavior changed,
so no live user-flow proof was applicable.

## Verdict

`CONFIRMED`

The exact one-file successor fully repairs the HIGH missing-import finding without
changing product behavior, adding compatibility surface, or weakening coverage.
