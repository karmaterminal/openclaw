# P0-3: Chain-Hop Budget Inheritance

> Proposed RFC subsection under "Chain Tracking"

## Chain-Hop Budget Semantics

When a sub-agent's findings trigger a chain hop (a new sub-agent spawned from
the announce boundary), the child inherits the parent session's accumulated
chain state:

- **Chain count**: the hop increments the parent's `continuationChainCount`.
  If the parent has already used 3 of a `maxChainLength: 5` budget, the hop
  brings it to 4. The child does not start a new chain.

- **Token budget**: the hop's spawn checks the parent's accumulated
  `continuationChainTokens` against `costCapTokens` _before_ dispatching.
  The child's eventual token usage is added to the same accumulator on return.

- **Delay bounds**: the hop's delay is clamped to the parent session's
  configured `minDelayMs` / `maxDelayMs`, not hardcoded values.

- **Generation guard**: the hop's `setTimeout` callback checks the parent
  session's generation counter before spawning, same pattern as bracket-parsed
  and tool-dispatched delegates.

This means total chain cost is bounded by the original `costCapTokens`
regardless of hop depth. A chain cannot amplify its budget by spawning
children — each hop consumes from the same finite pool.

### Rationale

The alternative — each hop starting with a fresh budget — allows multiplicative
cost amplification: a chain of depth N could consume N × `costCapTokens`. This
defeats the purpose of the cost cap as a safety rail. Inheritance preserves a
single answer to "what stops this from running away?": the operator-configured
`costCapTokens` bounds the entire chain, including hops.

### Implementation

`doChainSpawn` must:

1. Read `activeSessionEntry.continuationChainCount` and check against `maxChainLength`
2. Read `activeSessionEntry.continuationChainTokens` and check against `costCapTokens`
3. Capture `continuationGenerations.get(sessionKey)` at schedule time, check in `setTimeout` callback
4. Clamp delay to config `minDelayMs` / `maxDelayMs` (replace hardcoded `300_000`)
5. Increment `continuationChainCount` on successful spawn
