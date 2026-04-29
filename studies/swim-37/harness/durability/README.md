// studies/swim-37/harness/durability/README.md
//
// **Scope:** continuation-chain durability integration tests.
//
// Cross-surface coverage for the audit-lane fixes (#427/#428/#429 + persist-trio
// f26a86535f). Unit tests assert each write-site in isolation; these scenarios
// assert the *boundary* between dispatch and persist where the bugs lived
// (import shadowing, drain return discard, dispatched-count guard).
//
// **Substrate:**
// - Real `dispatchToolDelegates` from `src/auto-reply/continuation/delegate-dispatch.ts`
//   for S1 + S3 (the boundary is what we're testing — mocks can't catch shadowing).
// - Stubbed `dispatchToolDelegates` for S2 (the `dispatched==0` token-only branch).
// - Faked `spawnSubagentDirect` returning deterministic `{status:"accepted"}` so
//   chain advancement is observable without spinning real subagent runs.
// - Tmpdir session-store file (`os.tmpdir() + crypto.randomUUID()`) per test;
//   real `updateSessionStore` writes; real `loadSessionStore` reads.
//
// **Vitest config:** `test/vitest/vitest.continuation-durability.config.ts`
// (registered in root `vitest.config.ts`'s `rootVitestProjects`). Runs separate
// from swim-37 trap-class scaffolds so pre-merge gating is independent.
//
// **Scenarios:**
//   S1 — Two-hop chain across subagent boundary  (r3164380565 cross-surface)
//   S2 — Followup-only token chain               (r3164418106 cross-surface)
//   S3 — Durable persist across restart          (r3164418100 + persist-trio)
//
// **Reference:** see `INTEGRATION-TEST-GAP-MAP.md` at repo root for full design.
