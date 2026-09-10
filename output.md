# Independent review: openclaw/openclaw#143480

**Verdict: PASS**

Candidate `aa4d22aa09b27c1bc94617a587da3d72c85cf9ef` is a correct fixture-scoped test-performance repair against exact base `8a4f89c11d3a90768ff6b641a84b77aa7e308820`.

## Named refs

| Category | Named ref | Full SHA | Identity receipt |
|---|---|---|---|
| Product/base ref | Exact workorder base | `8a4f89c11d3a90768ff6b641a84b77aa7e308820` | Local object = GitHub server commit |
| Safe lane ref | `codeagent/review-143480-final-env` | `aa4d22aa09b27c1bc94617a587da3d72c85cf9ef` | Local = tracking = server before evidence |
| CI/workflow ref | N/A | N/A | Workorder forbids Actions |
| Presentation ref | N/A | N/A | No presentation surface |
| Docs/proof ref | N/A | N/A | No external docs/proof ref; this report is the sole deliverable |

## Findings

No findings.

Production LOC: `+0/-0` (net `0`) | Tests: `+1/-0` (net `+1`)

The sole source delta is `env: { OPENCLAW_DISABLE_BUNDLED_PLUGINS: "1" }` on this file's own `createOpenClawTestState` call at `src/auto-reply/reply/agent-runner.continuation-delegate-fire-span.test.ts:209`. There are no imports, prewarm hooks, model facts, timeout values, production files, routing code, or assertions changed.

The owning fixture boundary is correct:

- `createOpenClawTestState` merges `options.env` into the fixture env, captures every resulting key before applying it, and applies it only for the fixture (`src/test-utils/openclaw-test-state.ts:304`, `src/test-utils/openclaw-test-state.ts:307`, `src/test-utils/openclaw-test-state.ts:340`).
- `cleanup()` calls `restoreEnv()`, which restores the captured prior value and resets config runtime state (`src/test-utils/openclaw-test-state.ts:353`, `src/test-utils/openclaw-test-state.ts:360`).
- The disable flag only redirects bundled-plugin discovery to the empty bundled directory (`src/plugins/bundled-dir.ts:31`, `src/plugins/bundled-dir.ts:184`). Bundled-plugin discovery is not an asserted contract of this continuation fire-span suite; its nine assertions cover continuation dispatch/fire spans, chain IDs, trusted trace context, delayed/immediate delivery, target propagation, raw terminal handling, restart survival, quiet-channel delivery, persistence, and matured dispatch.

## Focused evidence

Both exact revisions used fresh ordinary same-host clones with their own `pnpm install --frozen-lockfile`; `package.json` and `pnpm-lock.yaml` are byte-identical between base and candidate. Every Vitest invocation used the repository runner and one worker.

| Control | Exact SHA | Result | Relevant timing |
|---|---|---|---|
| Negative: exact base fire-span suite | `8a4f89c11d3a90768ff6b641a84b77aa7e308820` | 9/9 passed | first target `74.457s`; tests `81.21s`; total `105.76s`; wall `107.61s` |
| Positive: successor fire-span suite | `aa4d22aa09b27c1bc94617a587da3d72c85cf9ef` | 9/9 passed | first target `1.016s`; tests `2.19s`; total `25.55s`; wall `27.26s` |
| Nearest sibling: rejection observability | candidate | 4/4 passed | sibling retained bundled-discovery cost: tests `76.45s` |
| Same-worker sibling + changed suite | candidate | 13/13 passed | sibling `74.194s`; changed fire target `0.206s` |
| Fixture owner restoration suite | candidate | 20/20 passed | includes acquisition rollback, apply/restore, cleanup, and scoped env cases |
| Exact-key restoration probe | candidate | passed | restored both an absent prior value and prior value `"0"` after applying `"1"` |

The target's first-test time fell by 98.6%, and total test-body time fell by 97.3%, while all 9 assertions remained intact. The unchanged sibling's retained ~74-second cold path confirms the candidate did not globally prewarm or reroute discovery.

Commands:

```text
node scripts/run-vitest.mjs run --config test/vitest/vitest.auto-reply-reply.config.ts --maxWorkers=1 src/auto-reply/reply/agent-runner.continuation-delegate-fire-span.test.ts
node scripts/run-vitest.mjs run --config test/vitest/vitest.auto-reply-reply.config.ts --maxWorkers=1 src/auto-reply/reply/agent-runner.continuation-delegate-reject-obs.test.ts
node scripts/run-vitest.mjs run --config test/vitest/vitest.auto-reply-reply.config.ts --maxWorkers=1 src/auto-reply/reply/agent-runner.continuation-delegate-fire-span.test.ts src/auto-reply/reply/agent-runner.continuation-delegate-reject-obs.test.ts
node scripts/run-vitest.mjs run --config test/vitest/vitest.unit-fast-isolated.config.ts --maxWorkers=1 src/test-utils/openclaw-test-state.test.ts
```

The initial linked-worktree attempt did not collect tests because its inherited shared dependency tree was stale. It was discarded as infrastructure evidence; the reported controls are from exact ordinary clones after frozen-lockfile installation.

## Best-fix judgment

**Best-fix verdict: best.** The fixture owns the expensive, irrelevant ambient discovery state and already provides exact capture/apply/restore semantics. A prewarm would preserve unnecessary work and widen module-state coupling; a timeout increase would mask the cost; model-fact injection or routing changes would alter the behavior under test; a production change would repair the wrong boundary.

**Remaining uncertainty:** none material to this read-only review. No Actions, integration, presentation, deployment, or broad acceptance run was performed, as required by the workorder.

PASS
