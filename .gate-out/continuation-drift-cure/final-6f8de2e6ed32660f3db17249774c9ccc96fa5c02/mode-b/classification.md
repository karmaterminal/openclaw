## Mode-B receipt and baseline classification

### Exact identities

- Run: `32642373348`
- Product: `karmaterminal/openclaw@6f8de2e6ed32660f3db17249774c9ccc96fa5c02`
- Workflow: `karmaterminal/openclaw-bootstrap@6dd6c3a7712c8ae02937a29054525b2ddacb89c1`
- Reviewed workflow ref: `main`
- Workflow blob: `a66cf30c9e7a0cc44438feba884129ccc0706a47`
- Run `headSha`: `6dd6c3a7712c8ae02937a29054525b2ddacb89c1`
- Dispatch identity: `scribe-dandelion-cult`

### Routing and aggregate

- 163/163 planner rows matched exact identities; zero unknown, blocked, or unrouted rows.
- 69/69 routed batch receipts were found and validated:
  55 hosted, 12 self-hosted, and two self-hosted-dist.
- `exact_sha_consistent=true`; no missing batch and no receipt validation error.
- Static gates passed all five owners: check/typecheck/lint/guards, UI raw-window guard, protocol generation, plugin assets, and strict build smoke.
- Aggregate tally: 163,370 passed, 37 initially failed, and 24 load flakes greened.
- Final deterministic set: 13 tests in two shards.

### `agentic-commands-doctor`

The sole deterministic row was
`src/commands/doctor-lint.test.ts > reports an actionable Crabbox profile finding before dispatch`.
On the two-CPU hosted batch, the test took 200,924 ms and exceeded its
120-second test timeout. The shard retry then left zombie children and hit the
five-minute no-output guard.

Baseline proof:

- `src/commands/doctor-lint.test.ts` and `src/commands/doctor-lint.ts` have
  identical blobs at accepted source, frozen upstream, and final candidate.
- Exact candidate focused rerun passed 1/1.
- Exact full test file under a two-CPU, 6 GiB heap constraint passed 25/25 in
  17.46 seconds.
- No candidate, accepted-source, or frozen-upstream byte distinguishes the
  failing boundary.

Disposition: hosted batch contention/no-output cleanup failure, not a
candidate regression.

### `core-runtime-tui-pty`

Twelve real-local-backend cases failed before exercising their asserted
behavior. Every captured PTY startup reported:

`Cannot find module .../node_modules/@openclaw/ai/dist/internal/openai-responses-payload-policy.mjs`

The dist batch reused a preinstalled dependency tree and explicitly skipped
test-shard shrinkwrap reconciliation. The required package output was absent
from that runner tree.

Baseline proof:

- `packages/ai/package.json` and
  `packages/ai/src/internal/openai-responses-payload-policy.ts` have identical
  blobs at accepted source, frozen upstream, and final candidate.
- The manifest exports exactly the missing
  `dist/internal/openai-responses-payload-policy.mjs`.
- A proper isolated candidate install/build contains the 282-byte output at
  that exact path.
- The exact local TUI PTY shard reached and passed every real-local-backend
  case. Its two remaining local failures were harness timing rows, not the 12
  CI startup rows. The xAI harness row was independently greened by Mode-B's
  retry; the other local harness row passed in Mode-B.

Disposition: stale/incomplete preinstalled workspace-package output on the
self-hosted dist runner, shared by accepted source and frozen upstream; not a
candidate regression.

### Acceptance decision

The workflow conclusion remains honestly `failure`; it is not laundered to
green. Route, shard, artifact, and aggregate receipts are complete and exact.
Both deterministic failure families have current-method baseline provenance
and focused exact-candidate proof, with no distinguishing candidate byte.

Per the workorder's red-classification rule, Mode-B is accepted as a complete,
baseline-classified broad receipt with two infrastructure findings and zero
candidate finding. No candidate amendment, retry masking, timeout increase, or
assertion weakening was used.
