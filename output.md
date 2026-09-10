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
- Acceptance path: focused-only. Actions were explicitly forbidden by the workorder.
