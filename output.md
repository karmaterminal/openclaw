# Fix 1319 v3 Evidence

## Named refs

| Category         | Named ref                                  | Full SHA                                   | Identity                                        |
| ---------------- | ------------------------------------------ | ------------------------------------------ | ----------------------------------------------- |
| Product/base ref | `c27e802bf5a314c51eb661059922c95a92bd65b3` | `c27e802bf5a314c51eb661059922c95a92bd65b3` | local checkout equals requested failing product |
| Safe lane ref    | `origin/codeagent/fix-1319-v3`             | `c27e802bf5a314c51eb661059922c95a92bd65b3` | local = tracking = server before evidence       |
| CI/workflow ref  | N/A                                        | N/A                                        | Workorder forbids Actions                       |
| Presentation ref | N/A                                        | N/A                                        | No presentation requested                       |
| Docs/proof ref   | `origin/codeagent/fix-1319-v3`             | `c27e802bf5a314c51eb661059922c95a92bd65b3` | Evidence report is committed on the safe lane   |

## Root cause and repair

- Invariant: a successful Bot API callback answer retained by a new durable row must remain
  available for one middleware consumption; rejected answers must be removed.
- Owner boundary: the per-bot callback answer owner spans durable admission, module replacement,
  and the middleware consumer. The production owner was behaving correctly.
- Rejected-SHA negative control: on Node `24.17.0`,
  `telegram-ingress-drain-factory.test.ts` failed the two retained-answer rows because the test
  loopback's nominal HTTP 200 response had no explicit framing. `node-fetch` rejected every such
  response with `ERR_STREAM_PREMATURE_CLOSE`, correctly triggering production rejection cleanup.
- Repair: frame the loopback Bot API success body with an exact `Content-Length`, so the test
  observes fulfilled retention instead of transport rejection.
- Siblings: rejected-answer cleanup, transient answers, transient-to-retained upgrades, consumed
  answers, duplicate promise coalescing, settled one-shot consumption, tombstones, restart fallback,
  and cross-module ownership remain covered by the factory, callback-state, bot, and ingress
  integration tests. State remains attached to each bot, preserving bot isolation and garbage
  collection without a cross-bot map.

## Validation

- Rejected product, Node `25.9.0`: focused file passed 11/11; complete serial Telegram shard passed
  218 files / 3,960 tests. This explains why the failure was hidden outside Mode-B.
- Rejected product, Node `24.17.0`: focused file failed 2/11 at the exact two retained-answer rows
  with `expected undefined to be defined`; diagnostics confirmed `ERR_STREAM_PREMATURE_CLOSE`.
- Successor working tree, Node `24.17.0`: focused file passed 11/11.
- Successor `eb273555c7acdaaea582158bea05ccc97f1d0ce6`, Node `24.17.0`: complete
  serial Telegram shard passed 218 files / 3,960 tests.
- `node scripts/run-tsgo.mjs -p test/tsconfig/tsconfig.extensions.test.json --incremental
--tsBuildInfoFile .artifacts/tsgo-cache/extensions-test.tsbuildinfo`: passed.
- `node scripts/run-oxlint.mjs --tsconfig extensions/tsconfig.json
extensions/telegram/src/telegram-ingress-drain-factory.test.ts`: passed.
- `node_modules/.bin/oxfmt --check
extensions/telegram/src/telegram-ingress-drain-factory.test.ts output.md`: passed.
- Changed gate: all checks through formatting passed. The plugin boundary check then failed because
  one unrelated compatibility record became date-eligible; the identical failure reproduced on
  exact baseline `c27e802bf5a314c51eb661059922c95a92bd65b3`.
- Internal P1 autoreview against the exact base reported `scoped-clean` with patch correctness
  confidence `0.99` and no actionable P0/P1 findings.
- Acceptance path: focused-only. Actions were explicitly forbidden by the workorder.

## Scope and uncertainty

- Production LOC: `+0/-0`.
- Test LOC: `+6/-2`.
- Proof/report LOC: `+42/-0` before this final receipt.
- No live Telegram probe was run: the repaired surface is the deterministic loopback's HTTP framing,
  not product transport behavior, and the workorder required local proof with no deployment.
- No Actions, PR, presentation, or deployment was created.
