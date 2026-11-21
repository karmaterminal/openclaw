### agentic-plugins :: plugins src/plugins/plugin-generation-artifact.native-reference.test.ts > captures native companions into state on another filesystem

```
AssertionError: expected 66306 to be 83 // Object.is equality
- Expected
+ Received
- 83
+ 66306
 ❯ src/plugins/plugin-generation-artifact.native-reference.test.ts:345:41
    343|       const captured = artifact.resolve(companion);
    344|       expect(readText(captured)).toBe("native companion sentinel");
    345|       expect(fs.statSync(captured).dev).toBe(fs.statSync(captureState)…
       |                                         ^
    346|       expect(fs.statSync(companion).nlink).toBe(1);
    347|       expect(fs.realpathSync(captured)).not.toBe(companion);
 ❯ src/test-utils/openclaw-test-state.ts:468:64
 ❯ src/shared/async-work-scope.ts:63:14
 ❯ AsyncLocalStorage.enterAsyncStore src/shared/async-store.ts:9:10
 ❯ runWithAsyncStore src/shared/async-store.ts:21:50
 ❯ AsyncWorkScope.enter src/shared/async-work-scope.ts:61:12
 ❯ AsyncWorkScope.track src/shared/async-work-scope.ts:106:30
 ❯ withOpenClawTestState src/test-utils/openclaw-test-state.ts:468:52
 ❯ src/plugins/plugin-generation-artifact.native-reference.test.ts:302:3
⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯
 Test Files  1 failed | 497 passed | 2 skipped (500)
      Tests  1 failed | 5768 passed | 19 skipped (5788)
   Start at  05:45:58
```

### compact-large-10 :: infra src/agents/openclaw-tools.workshop-authority.test.ts > refuses the write when the caller is revoked during awaited preparation

```
AssertionError: expected 'written' to be 'refused (tool invocation authority is…' // Object.is equality
Expected: "refused (tool invocation authority is no longer active)"
Received: "written"
 ❯ src/agents/openclaw-tools.workshop-authority.test.ts:107:26
    105|   const result = await createUnderCaller("revoked", true);
    106|   expect(result.trace).toContain("caller:revoked");
    107|   expect(result.outcome).toBe("refused (tool invocation authority is n…
       |                          ^
    108|   expect(result.exists).toBe(false);
    109| });
⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯
 Test Files  1 failed | 61 passed | 2 skipped (64)
      Tests  1 failed | 740 passed | 3 skipped (744)
   Start at  08:32:17
   Duration  337.10s (tests 83%, transform 9%, import 7%, setup 2%)
[test] failed 1 Vitest shard in 340.70s
[test] FAILED (exit 1)
end (exit 1)
FAILED (exit 1)
ee-paths.test.ts > does not create the worktrees directory during detection 22ms
 ✓  infra  src/sessions/session-state-events.ownership.test.ts > refuses raw, malformed, and contradictory watch addresses before registering 782ms
 ✓  infra  src/infra/state-migrations.plugin-rehearsal.test.ts > keeps external declared plugin data untouched through the registered post-session runner 1995ms
 ✓  infra  src/agents/mcp-oauth-writes.test.ts > persists SDK callbacks and pending state across close without parent SQL or waits 1693ms
 ✓  infra  src/agents/mcp-oauth-writes.test.ts > preserves transaction and commit authority when publishing credential writes 731ms
```

### compact-large-15 :: gateway-database-workers src/gateway/mcp-http.completion-lineage.test.ts > MCP loopback completion lineage at the final tool-effect fence > rejects the write at its source guard when the lineage is removed after dispatch

```
AssertionError: expected { jsonrpc: '2.0', id: 1, …(1) } to match object { result: { isError: true, …(1) } }
(3 matching properties omitted from actual)
- Expected
+ Received
  {
    "result": {
      "content": [
        {
-         "text": StringContaining "tool invocation authority is no longer active",
+         "text": "Successfully wrote 23 bytes to /tmp/oc1f8b53/.oc-ci-tmp/s7TB/t/oc-vt-IaJzro/oc-vt-wuclAP/openclaw-mcp-completion-lineage-GoRuyW/workspace/lineage-removed-in-tool.txt",
        },
      ],
-     "isError": true,
+     "isError": false,
    },
  }
 ❯ src/gateway/mcp-http.completion-lineage.test.ts:451:35
    449|     const response = await pending;
    450|
    451|     expect(await response.json()).toMatchObject({
       |                                   ^
    452|       result: {
    453|         isError: true,
⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯
```

### compact-large-15 :: infra src/auto-reply/reply/session-event-permissions.test.ts > bounds a production background completion by current and retained permissions: retained-database-replacement

```
AssertionError: {"status":"completed","executionStarted":true,"terminalOutcome":{"reason":"completed","status":"ok"},"interruptedByRestart":false,"delivered":false,"deliveryAttempted":false,"deliveryAmbiguous":false,"admissionDeferred":false,"summary":"Completion observed"}: expected 'completed\n' to be 'original\n' // Object.is equality
- Expected
+ Received
- original
+ completed
 ❯ src/auto-reply/reply/session-event-permissions.test.ts:<redacted len=6>
    520|       expect(accepted).toEqual({ ok: true });
    521|       const evidence = JSON.stringify(outcome);
    522|       expect(await fs.readFile(filePath, "utf8"), evidence).toBe(
       |                                                             ^
    523|         change === "new-session" || remapped || toolOnly || unrelatedC…
    524|           ? "completed\n"
⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯
 Test Files  1 failed | 62 passed | 1 skipped (64)
      Tests  1 failed | 833 passed | 3 skipped (837)
   Start at  07:41:39
   Duration  495.60s (tests 85%, transform 8%, import 6%, setup 1%)
[test] failed 1 Vitest shard in 497.46s
[test] FAILED (exit 1)
end (exit 1)
FAILED (exit 1)
ranting handoff 1 authority 6751ms
 ✓  infra  src/infra/sqlite-pinned-read-snapshot.test.ts > retries recovery before pinning, finalizes each cursor, and invokes the callback once 20ms
 ✓  infra  src/infra/sqlite-pinned-read-snapshot.test.ts > does not replay exhausted recovery beyond its acquisition bound 5ms
```

### compact-large-18 :: infra src/sessions/user-turn-transcript.recorder.test.ts > createUserTurnTranscriptRecorder > preserves distinct text supplied with late-resolved media

```
Error: Session reader validation does not match its current physical owner
 ❯ createError src/state/openclaw-state-worker-error-identity.ts:256:14
    254|       return new SessionMetadataUnavailableError(node.reason, undefine…
    255|     case "error":
    256|       return new Error(node.message);
       |              ^
    257|     case "mcp-oauth-corruption":
    258|       return new McpOAuthStoreCorruptionError("", "");
 ❯ src/state/openclaw-state-worker-error.ts:199:14
 ❯ decodeErrorGraph src/state/openclaw-state-worker-error.ts:192:26
 ❯ hydrateOpenClawStateWorkerError src/state/openclaw-state-worker-error.ts:277:57
 ❯ decodeSessionTranscriptWorkerReadError src/config/sessions/session-history-worker-errors.ts:<redacted len=6>
 ❯ unwrapSessionTranscriptWorkerReply src/config/sessions/session-history-worker-errors.ts:<redacted len=4>
 ❯ Object.runRequest src/config/sessions/session-transcript-worker-runtime.ts:<redacted len=6>
 ❯ withSessionStoreReaderInWorker.backing src/config/sessions/session-accessor.transcript-target.ts:<redacted len=5>
 ❯ src/config/sessions/session-entry-read-runtime.ts:<redacted len=6>
⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[2/2]⎯
 Test Files  1 failed | 62 passed | 1 skipped (64)
      Tests  2 failed | 882 passed | 17 skipped (901)
   Start at  08:41:13
   Duration  578.53s (tests 88%, import 6%, transform 5%, setup 1%)
[test] failed 1 Vitest shard in 581.18s
[test] FAILED (exit 1)
end (exit 1)
```

### compact-large-18 :: infra src/sessions/user-turn-transcript.recorder.test.ts > createUserTurnTranscriptRecorder > returns the older receipt-free row for an idempotent managed-delivery retry

```
Error: Canonical session reader continuation is no longer current
 ❯ Object.assertCurrent src/config/sessions/session-canonical-key.ts:<redacted len=6>
    326|     assertCurrent: () => {
    327|       if (!isCurrent()) {
    328|         throw new Error("Canonical session reader continuation is no l…
       |               ^
    329|       }
    330|     },
 ❯ assertCapturedCurrent src/config/sessions/session-entry-read-runtime.ts:<redacted len=6>
 ❯ withSessionStoreReaderInWorker.backing src/config/sessions/session-accessor.transcript-target.ts:<redacted len=5>
 ❯ src/config/sessions/session-entry-read-runtime.ts:<redacted len=6>
 ❯ withSessionHistoryWorkerDatabase src/config/sessions/session-transcript-worker-runtime.ts:<redacted len=6>
 ❯ withSessionStoreReaderInWorker src/config/sessions/session-entry-read-runtime.ts:<redacted len=6>
 ❯ resolveSessionTranscriptRuntimeTarget src/config/sessions/session-accessor.transcript-target.ts:<redacted len=5>
 ❯ prepareTranscriptTurnTarget src/config/sessions/session-accessor.transcript-turn.ts:<redacted len=6>
 ❯ persistSessionTranscriptTurn src/config/sessions/session-accessor.transcript-turn.ts:<redacted len=6>
 ❯ persistUserTurnTranscript src/sessions/user-turn-transcript.persistence.ts:84:16
⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/2]⎯
 FAIL   infra  src/sessions/user-turn-transcript.recorder.test.ts > createUserTurnTranscriptRecorder > preserves distinct text supplied with late-resolved media
Error: Session reader validation does not match its current physical owner
 ❯ createError src/state/openclaw-state-worker-error-identity.ts:256:14
    254|       return new SessionMetadataUnavailableError(node.reason, undefine…
    255|     case "error":
    256|       return new Error(node.message);
```

### compact-large-19 :: infra src/config/sessions/disk-budget.physical-usage.test.ts > physical session disk usage > joins real SDK mutation maintenance before native fixture drainage

```
AssertionError: expected 2 to be 1 // Object.is equality
- Expected
+ Received
- 1
+ 2
 ❯ src/config/sessions/disk-budget.physical-usage.test.ts:295:25
    293|             "Actual SDK mutations must reach the canonical observed qu…
    294|           ).toBeGreaterThan(0);
    295|           expect(scans).toBe(1);
       |                         ^
    296|           mutationBodyFinished.resolve(true);
    297|         } catch (error) {
 ❯ Module.withSessionHistoryBudgetSweepsForTest src/config/sessions/session-history-budget.test-support.ts:<redacted len=5>
⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯
 Test Files  1 failed | 60 passed | 3 skipped (64)
      Tests  1 failed | 716 passed | 14 skipped (731)
   Start at  08:06:36
   Duration  299.43s (tests 77%, import 11%, transform 9%, setup 2%)
[test] failed 1 Vitest shard in 301.34s
[test] FAILED (exit 1)
end (exit 1)
FAILED (exit 1)
[49m src/state/openclaw-agent-db-registry-listing.settled.test.ts > never certifies a query failure after the transaction owner could not roll it back 88ms
 ✓  infra  src/agents/bash-tools.visible-subagent-notify.test.ts > keeps a failed background exec owned by agent:main:subagent:hidden (child=true, borrowed policy=false, visible spawn=false) 2224ms
```

### compact-large-2 :: gateway-methods-isolated src/gateway/server-methods/agent.visitor-access.test.ts > visitor access admitted caller > reopens existing profiles and grants and repairs a missing Visitor model policy

```
SessionMutationFactsUnavailableError: <redacted len=75>
 ❯ prepareSessionMutationFacts src/gateway/session-sharing-preparation.ts:<redacted len=5>
    707|       error instanceof SessionCanonicalKeyMigrationRequiredError
    708|       ? error
    709|       : new SessionMutationFactsUnavailableError({ cause: error });
       |         ^
    710|   }
    711| }
 ❯ resolveSessionMutationAuthorizationAsync src/gateway/session-sharing-authorization-async.ts:<redacted len=6>
 ❯ authorizeGatewayRequestPreDispatch src/gateway/server-methods/request-authorization.ts:<redacted len=5>
 ❯ dispatch src/gateway/server-methods.ts:409:29
 ❯ handleGatewayRequest src/gateway/server-methods.ts:685:12
 ❯ invoke src/gateway/server-methods/agent.visitor-access.test-utils.ts:505:13
 ❯ src/gateway/server-methods/agent.visitor-access.test-utils.ts:537:61
Caused by: AgentDatabaseRegistryChangedError: Agent database registry changed during discovery; retry the read.
 ❯ assertCurrent src/state/openclaw-agent-db-registry-listing.ts:642:19
 ❯ Object.assertCurrent src/state/openclaw-agent-db-registry-listing.ts:703:85
 ❯ dispatch src/gateway/server-methods.ts:409:29
 ❯ handleGatewayRequest src/gateway/server-methods.ts:685:12
 ❯ invoke src/gateway/server-methods/agent.visitor-access.test-utils.ts:505:13
 ❯ src/gateway/server-methods/agent.visitor-access.test-utils.ts:537:61
⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯
 Test Files  1 failed (1)
      Tests  1 failed | 4 passed (5)
```

### compact-large-2 :: infra src/agents/embedded-agent-runner/compact.queued-successor.test.ts > fences a queued maintenance writer replacement after acceptance: during branch read (captured=undefined)

```
AssertionError: expected false to be true // Object.is equality
- Expected
+ Received
- true
+ false
 ❯ src/agents/embedded-agent-runner/compact.queued-successor.test.ts:821:38
    819|     ).catch(() => undefined);
    820|
    821|     expect(observed.rewriteRejected).toBe(true);
       |                                      ^
    822|     expect(loadSessionEntry(target())).toMatchObject({
    823|       ...owner,
⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯
 Test Files  1 failed | 59 passed | 4 skipped (64)
      Tests  1 failed | 939 passed | 62 skipped (1002)
   Start at  08:13:29
   Duration  380.62s (tests 84%, transform 8%, import 7%, setup 2%)
[test] failed 1 Vitest shard in 382.49s
[test] FAILED (exit 1)
end (exit 1)
FAILED (exit 1)
2m > splits a batch that misses its deadline so slow storage still gets an answer 4ms
 ✓  infra  src/infra/sqlite-worker-request-custody.test.ts > distinguishes queued cancellation, accepted work, and permanently retired generations 15ms
 ✓  infra  src/infra/sqlite-worker-request-custody.test.ts > revokes before failure observers and retains accepted work until native retirement 4ms
```

### compact-large-22 :: infra src/infra/shell-env.test.ts > shell env fallback > uses interactive Bash login startup before nounset reads PS1

```
AssertionError: expected [] to deeply equal [ 'PATH' ]
- Expected
+ Received
- [
-   "PATH",
- ]
+ []
 ❯ src/infra/shell-env.test.ts:503:68
    501|
    502|     withEtcShells([shell], () => {
    503|       expect(runShellEnvFallback({ env, expectedKeys: ["PATH"] })).toE…
       |                                                                    ^
    504|     });
    505|     expect(exec).toHaveBeenCalledOnce();
 ❯ withEtcShells src/infra/shell-env.test.ts:289:7
 ❯ src/infra/shell-env.test.ts:502:5
⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯
 Test Files  1 failed | 24 passed (25)
      Tests  1 failed | 390 passed | 4 skipped (395)
   Start at  09:42:39
   Duration  9.88s (setup 39%, tests 36%, transform 23%, import 1%)
[test] failed 1 Vitest shard in 11.46s
[test] FAILED (exit 1)
end (exit 1)
```

### compact-large-25 :: ui ui/src/test-helpers/new-session-page-opener.node.test.ts > captures New Session failures before closing their contexts and starting the next test

```
AssertionError: expected { numTotalTestSuites: 2, …(12) } to match object { Object (numFailedTests, numPassedTests) }
(25 matching properties omitted from actual)
- Expected
+ Received
  {
-   "numFailedTests": 1,
-   "numPassedTests": 1,
+   "numFailedTests": 0,
+   "numPassedTests": 0,
  }
 ❯ ui/src/test-helpers/new-session-page-opener.node.test.ts:<redacted len=6>
    110|       expect(output.code, output.stdout + output.stderr).toBe(1);
    111|       const report: JsonTestResults = JSON.parse(await fs.readFile(rep…
    112|       expect(report).toMatchObject({ numFailedTests: 1, numPassedTests…
       |                      ^
    113|       expect(JSON.stringify(report)).toContain("private-synthetic-new-…
    114|       expect(JSON.parse(await fs.readFile(path.join(root, "journal.jso…
⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[2/3]⎯
 FAIL   ui  ui/src/test-helpers/new-session-page-opener.node.test.ts > captures New Session failures before closing their contexts and starting the next test
AssertionError: expected { numTotalTestSuites: 2, …(12) } to match object { Object (numFailedTests, numPassedTests) }
(25 matching properties omitted from actual)
- Expected
+ Received
  {
```

### compact-large-27 :: unit-src src/state/openclaw-database-preflight.artifacts.test.ts > falls back to the private snapshot when the last owner closes during a preserving read

```
AssertionError: expected 0 to be greater than 0
 ❯ src/state/openclaw-database-preflight.artifacts.test.ts:417:29
    415|   // Both paths ran: live families were read in place, closed ones wen…
    416|   expect(outcomes.read).toBeGreaterThan(0);
    417|   expect(outcomes.snapshot).toBeGreaterThan(0);
       |                             ^
    418| }, 60_000);
    419|
⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯
 Test Files  1 failed | 234 passed | 9 skipped (244)
      Tests  1 failed | 2383 passed | 26 skipped (2410)
   Start at  07:43:23
   Duration  278.57s (tests 73%, transform 21%, import 4%, worker 1%, setup 1%)
[test] failed 1 Vitest shard in 280.20s
[test] FAILED (exit 1)
end (exit 1)
FAILED (exit 1)
ble admission 5ms
 ✓  unit-src  src/test-utils/repo-files.test.ts > listGitTrackedFiles > bounds Git inventory lookup and returns sorted existing files 6ms
 ✓  unit-src  src/test-utils/repo-files.test.ts > listGitTrackedFiles > caches a timed-out inventory lookup as unavailable 4ms
 ✓  unit-src  src/snapshot/database-backup.test.ts > reads the committed anchor through private offline-owner inspection without changing source bytes 332ms
 ✓  unit-src  src/snapshot/database-backup.test.ts > reads the committed anchor through private locked-source inspection without changing source bytes 30442ms
 ✓  unit-src  src/snapshot/database-backup.test.ts > refuses an empty engine source 379ms
 ✓  unit-src  src/snapshot/database-backup.test.ts > refuses an duplicate engine source 293ms
```

### compact-large-31 :: infra src/agents/openclaw-tools.workshop-contract.test.ts > Workshop through the OpenClaw tool set > T7: captures the invoking source authority before its first await

```
AssertionError: promise resolved "{ content: [ { …(2) } ], …(1) }" instead of rejecting
- Expected
+ Received
- Error {
-   "message": "rejected promise",
+ {
+   "content": [
+     {
+       "text": "Patched \"deploy\" (patched SKILL.md). Saved previous version; undo with action=restore name=deploy.",
+       "type": "text",
+     },
+   ],
+   "details": {
+     "change": {
+       "action": "patch",
+       "actor": "agent",
+       "agentId": "main",
+       "createdAtMs": 1795252750691,
+       "id": "47f65fa3-c4aa-4acd-9268-fa092e4f892b",
+       "runId": "4f3b3056-a6e5-41ba-a7f9-4e7c5053b294",
+       "sessionKey": "<redacted len=19>",
+       "skillName": "deploy",
+       "summary": "patched SKILL.md",
+       "versionId": "20261121T091910319Z-patch",
```

### compact-large-32 :: gateway-core src/gateway/mcp-http.loopback-real-recovery.test.ts > fences retired warm-turn writes while preserving the successor's bearer

```
AssertionError: expected { jsonrpc: '2.0', id: 1, …(1) } to match object { result: { isError: true, …(1) } }
(3 matching properties omitted from actual)
- Expected
+ Received
  {
    "result": {
      "content": [
        {
-         "text": StringContaining "tool invocation authority is no longer active",
+         "text": "Successfully wrote 19 bytes to /tmp/oc8b4580/.oc-ci-tmp/sbEh/t/oc-vt-PQGLjJ/oc-vt-ap6MCg/mcp-real-recovery-XspJib/retired.txt",
        },
      ],
-     "isError": true,
+     "isError": false,
    },
  }
 ❯ src/gateway/mcp-http.loopback-real-recovery.test.ts:284:27
    282|
    283|     releaseRetired.resolve();
    284|     expect(await retired).toMatchObject({
       |                           ^
    285|       result: {
    286|         isError: true,
⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯
```

### compact-large-34 :: unit-fast src/infra/worker-task-pool.memory.test.ts > collects a completed large external payload while keeping the bounded worker warm

```
AssertionError: expected 71084839 to be less than 37661643
 ❯ src/infra/worker-task-pool.memory.test.ts:45:29
     43|       const allocationBytes = memoryKind === "heap" ? 100 * 1024 * 102…
     44|       expect(allocated[counter]).toBeGreaterThan(warm[counter] + alloc…
     45|       expect(idle[counter]).toBeLessThan(warm[counter] + 32 * 1024 * 1…
       |                             ^
     46|       expect(cachedDataVersionTag()).toBe(cacheVersion);
     47|       const reused = await pool.run({}, {});
⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯
 Test Files  1 failed | 818 passed | 5 skipped (824)
      Tests  1 failed | 6640 passed | 19 skipped (6660)
   Start at  06:01:09
   Duration  148.82s (tests 58%, transform 37%, import 4%)
[test] failed 1 Vitest shard in 152.33s
[test] FAILED (exit 1)
end (exit 1)
FAILED (exit 1)
ms
 ✓  unit-fast  src/agents/channel-tool-metadata.test.ts > channel tool metadata > preserves ownership when a concrete tool is wrapped 1ms
 ✓  unit-fast  src/infra/secure-random-chain-id.test.ts > generateChainId continuation chain ids > returns a UUID-shaped string 0ms
 ✓  unit-fast  src/infra/secure-random-chain-id.test.ts > generateChainId continuation chain ids > returns unique ids across calls 3ms
 ✓  unit-fast  src/infra/plain-object.test.ts > isPlainObject > accepts object-tag values: {} 0ms
 ✓  unit-fast  src/infra/plain-object.test.ts > isPlainObject > accepts object-tag values: {} 0ms
 ✓  unit-fast  src/infra/plain-object.test.ts > isPlainObject > accepts object-tag values: {"marker":true} 0ms
```

### compact-large-35 :: commands src/commands/doctor-session-transcript-labels.reuse.test.ts > update Doctor retained transcript scan reuse > does not scan unchanged retained history twice across update passes

```
AssertionError: expected undefined to be defined
 ❯ src/commands/doctor-session-transcript-labels.reuse.test.ts:<redacted len=6>
    186|     recordUpdateDatabaseWrites(backup, result?.databaseWrites, { name:…
    187|     const encoded = consumeUpdateDoctorHistoricalScans(backup);
    188|     expect(encoded).toBeDefined();
       |                     ^
    189|     expect(consumeUpdateDoctorHistoricalScans(backup)).toBeUndefined();
    190|     const second = await pass(encoded);
⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯
 Test Files  1 failed | 49 passed (50)
      Tests  1 failed | 418 passed (419)
   Start at  08:57:49
   Duration  495.43s (tests 94%, transform 4%, import 2%)
[test] failed 1 Vitest shard in 496.78s
[test] FAILED (exit 1)
end (exit 1)
FAILED (exit 1)
commands/doctor-session-canonical-keys.path-alias.test.ts: retiring openclaw.stateDomainPublication.repository-workspace
[sqlite-test-lifecycle] src/commands/doctor-session-canonical-keys.path-alias.test.ts: retiring openclaw.stateDomainPublication.personal-model-credentials
[sqlite-test-lifecycle] src/commands/doctor-session-canonical-keys.path-alias.test.ts: retiring openclaw.stateDomainPublication.auth-profile-credentials
[sqlite-test-lifecycle] src/commands/doctor-session-canonical-keys.path-alias.test.ts: retiring openclaw.stateDomainPublication.plugin-state
[sqlite-test-lifecycle] src/commands/doctor-session-canonical-keys.path-alias.test.ts: retiring openclaw.pluginStatePublication
[sqlite-test-lifecycle] src/commands/doctor-session-canonical-keys.path-alias.test.ts: retiring openclaw.sessionDiskBudgetWorkers
 ✓  commands  src/commands/doctor-session-canonical-keys.path-alias.test.ts > preserves history through case-variant agent paths (foreign winner: true) 3285ms
```

### compact-large-35 :: infra src/infra/package-update-permission-drift.test.ts > publication permission drift > repairs a recursive named-user POSIX ACL

```
Error: spawnSync setfacl ENOENT
 ❯ src/infra/package-update-permission-drift.test.ts:124:5
    122|   it.skipIf(process.platform !== "linux")("repairs a recursive named-u…
    123|     const f = fixture();
    124|     execFileSync("setfacl", ["-R", "-m", "u:65534:rwX", f.root]);
       |     ^
    125|     expect(fs.statSync(f.payload).mode & 0o022).not.toBe(0);
    126|     await expect(f.matches()).resolves.toBe(true);
⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯
Serialized Error: { errno: -2, code: 'ENOENT', syscall: 'spawnSync setfacl', path: 'setfacl', spawnargs: [ '-R', '-m', 'u:65534:rwX', '/tmp/ocb05385/.oc-ci-tmp/sxzU/t/oc-vt-y1LAr9/oc-vt-yTr5NB/publication-permission-drift-uf1074' ], error: { stack: 'Error: spawnSync setfacl ENOENT
    at Object.spawnSync (node:internal/child_process:1175:20)
    at spawnSync (node:child_process:976:24)
    at execFileSync (node:child_process:1019:15)
    at /home/runner/_work/_temp/ci-batch-work-44871298969-1-local-batch-047/shard-0-compact-large-35/src/infra/package-update-permission-drift.test.ts:124:5
    at file:///home/runner/_work/_temp/ci-batch-work-44871298969-1-local-batch-047/shard-0-compact-large-35/node_modules/.pnpm/vitest@5.0.5_patch_hash=a2a78abe9470cc2ceb0d4eeb81acfc62d6180e9990bc866a7771ba60b1320ea_75661d0a5892d48edf76140ec77ed19d/node_modules/vitest/dist/chunks/run.BPv-BBRv.js:1632:35
    at file:///home/runner/_work/_temp/ci-batch-work-44871298969-1-local-batch-047/shard-0-compact-large-35/node_modules/.pnpm/vitest@5.0.5_patch_hash=a2a78abe9470cc2ceb0d4eeb81acfc62d6180e9990bc866a7771ba60b1320ea_75661d0a5892d48edf76140ec77ed19d/node_modules/vitest/dist/chunks/run.BPv-BBRv.js:2801:26
    at file:///home/runner/_work/_temp/ci-batch-work-44871298969-1-local-batch-047/shard-0-compact-large-35/node_modules/.pnpm/vitest@5.0.5_patch_hash=a2a78abe9470cc2ceb0d4eeb81acfc62d6180e9990bc866a7771ba60b1320ea_75661d0a5892d48edf76140ec77ed19d/node_modules/vitest/dist/chunks/run.BPv-BBRv.js:3338:20
    at new Promise (<anonymous>)
    at runWithCancel (file:///home/runner/_work/_temp/ci-batch-work-44871298969-1-local-batch-047/shard-0-compact-large-35/node_modules/.pnpm/vitest@5.0.5_patch_hash=a2a78abe9470cc2ceb0d4eeb81acfc62d6180e9990bc866a7771ba60b1320ea_75661d0a5892d48edf76140ec77ed19d/node_modules/vitest/dist/chunks/run.BPv-BBRv.js:3333:10)
    at file:///home/runner/_work/_temp/ci-batch-work-44871298969-1-local-batch-047/shard-0-compact-large-35/node_modules/.pnpm/vitest@5.0.5_patch_hash=a2a78abe9470cc2ceb0d4eeb81acfc62d6180e9990bc866a7771ba60b1320ea_75661d0a5892d48edf76140ec77ed19d/node_modules/vitest/dist/chunks/run.BPv-BBRv.js:3318:20', message: 'spawnSync setfacl ENOENT', errno: -2, code: 'ENOENT', syscall: 'spawnSync setfacl', path: 'setfacl', spawnargs: [ '-R', '-m', 'u:65534:rwX', '/tmp/ocb05385/.oc-ci-tmp/sxzU/t/oc-vt-y1LAr9/oc-vt-yTr5NB/publication-permission-drift-uf1074' ], error: [Circular], status: null, signal: null, output: null, pid: 0, stdout: undefined, stderr: undefined, constructor: 'Function<Error>', name: 'Error', toString: 'Function<toString>', stacks: [ { method: '', file: '/home/runner/_work/_temp/ci-batch-work-44871298969-1-local-batch-047/shard-0-compact-large-35/src/infra/package-update-permission-drift.test.ts', line: 124, column: 5 } ] }, status: null, signal: null, output: null, pid: 0, stdout: undefined, stderr: undefined }
⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/2]⎯
 FAIL   infra  src/infra/update-retained-runtime-imports.process.test.ts > keeps bun late imports on the old generation through replacement and CLI teardown
Error: [openclaw] CI job core-runtime-infra-system-runtime-hosted-2: Bun revision verification failed: spawnSync bun ENOENT. Run .github/actions/setup-test-bun before tests.
 ❯ requirePinnedBun scripts/lib/pinned-bun.mts:189:13
```

### compact-large-35 :: infra src/infra/update-retained-runtime-imports.process.test.ts > keeps bun late imports on the old generation through replacement and CLI teardown

```
Error: [openclaw] CI job core-runtime-infra-system-runtime-hosted-2: Bun revision verification failed: spawnSync bun ENOENT. Run .github/actions/setup-test-bun before tests.
 ❯ requirePinnedBun scripts/lib/pinned-bun.mts:189:13
    187|       }
    188|     } catch (error) {
    189|       throw new Error(
       |             ^
    190|         `[openclaw] ${ciJob}Bun revision verification failed: ${error …
    191|         { cause: error },
 ❯ src/infra/update-retained-runtime-imports.process.test.ts:121:23
Caused by: Error: spawnSync bun ENOENT
 ❯ requirePinnedBun scripts/lib/pinned-bun.mts:180:24
 ❯ src/infra/update-retained-runtime-imports.process.test.ts:121:23
⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯
Serialized Error: { errno: -2, code: 'ENOENT', syscall: 'spawnSync bun', path: 'bun', spawnargs: [ '--revision' ], error: { stack: 'Error: spawnSync bun ENOENT
    at Object.spawnSync (node:internal/child_process:1175:20)
    at spawnSync (node:child_process:976:24)
    at execFileSync (node:child_process:1019:15)
    at requirePinnedBun (/home/runner/_work/_temp/ci-batch-work-44871298969-1-local-batch-047/shard-0-compact-large-35/scripts/lib/pinned-bun.mts:180:24)
    at /home/runner/_work/_temp/ci-batch-work-44871298969-1-local-batch-047/shard-0-compact-large-35/src/infra/update-retained-runtime-imports.process.test.ts:121:23
    at async file:///home/runner/_work/_temp/ci-batch-work-44871298969-1-local-batch-047/shard-0-compact-large-35/node_modules/.pnpm/vitest@5.0.5_patch_hash=a2a78abe9470cc2ceb0d4eeb81acfc62d6180e9990bc866a7771ba60b1320ea_75661d0a5892d48edf76140ec77ed19d/node_modules/vitest/dist/chunks/run.BPv-BBRv.js:2801:20', message: 'spawnSync bun ENOENT', errno: -2, code: 'ENOENT', syscall: 'spawnSync bun', path: 'bun', spawnargs: [ '--revision' ], error: [Circular], status: null, signal: null, output: null, pid: 0, stdout: undefined, stderr: undefined, constructor: 'Function<Error>', name: 'Caused by: Error', toString: 'Function<toString>', stacks: [ { method: 'requirePinnedBun', file: '/home/runner/_work/_temp/ci-batch-work-44871298969-1-local-batch-047/shard-0-compact-large-35/scripts/lib/pinned-bun.mts', line: 180, column: 24 }, { method: '', file: '/home/runner/_work/_temp/ci-batch-work-44871298969-1-local-batch-047/shard-0-compact-large-35/src/infra/update-retained-runtime-imports.process.test.ts', line: 121, column: 23 } ] }, status: null, signal: null, output: null, pid: 0, stdout: undefined, stderr: undefined }
⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[2/2]⎯
 Test Files  2 failed | 279 passed | 3 skipped (284)
      Tests  2 failed | 4039 passed | 51 skipped (4092)
   Start at  08:43:35
```

### compact-large-39 :: agents-support src/agents/harness/mediated-delegation-effects.test.ts > cli-loopback delegated final effects (stamped visible spawn: false) > rejects revocation at the final exec boundary

```
 FAIL   agents-support  src/agents/harness/mediated-delegation-effects.test.ts > cli-loopback delegated final effects (stamped visible spawn: true) > rejects revocation at the final exec boundary
AssertionError: Warning: continuation options are unavailable; running synchronously.
(no output): expected false to be true // Object.is equality
- Expected
+ Received
- true
+ false
 ❯ expectRejected src/agents/harness/mediated-delegation-effects.test.ts:276:41
    274| }
    275| async function expectRejected(receipt: Receipt, target: string) {
    276|   expect(receipt.isError, receipt.text).toBe(true);
       |                                         ^
    277|   expect(receipt.text).toMatch(/authorization changed|authority is no …
    278|   expect(await fs.readFile(target, "utf8")).toBe("original");
 ❯ src/agents/harness/mediated-delegation-effects.test.ts:392:15
⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/8]⎯
 FAIL   agents-support  src/agents/harness/mediated-delegation-effects.test.ts > cli-loopback delegated final effects (stamped visible spawn: false) > rejects revocation at the final write boundary
AssertionError: Successfully wrote 9 bytes to /tmp/oca37fd4/.oc-ci-tmp/sPAG/t/oc-vt-D2wKUr/oc-vt-cHFdKF/openclaw-mediated-delegation-8BhHsz/workspace/cli-loopback-revoked-write.txt: expected false to be true // Object.is equality
- Expected
+ Received
- true
+ false
 ❯ expectRejected src/agents/harness/mediated-delegation-effects.test.ts:276:41
    274| }
```

### compact-large-39 :: agents-support src/agents/harness/mediated-delegation-effects.test.ts > cli-loopback delegated final effects (stamped visible spawn: false) > rejects revocation at the final write boundary

```
AssertionError: Successfully wrote 9 bytes to /tmp/oca37fd4/.oc-ci-tmp/sPAG/t/oc-vt-D2wKUr/oc-vt-cHFdKF/openclaw-mediated-delegation-8BhHsz/workspace/cli-loopback-revoked-write.txt: expected false to be true // Object.is equality
- Expected
+ Received
- true
+ false
 ❯ expectRejected src/agents/harness/mediated-delegation-effects.test.ts:276:41
    274| }
    275| async function expectRejected(receipt: Receipt, target: string) {
    276|   expect(receipt.isError, receipt.text).toBe(true);
       |                                         ^
    277|   expect(receipt.text).toMatch(/authorization changed|authority is no …
    278|   expect(await fs.readFile(target, "utf8")).toBe("original");
 ❯ src/agents/harness/mediated-delegation-effects.test.ts:392:15
⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[2/8]⎯
 FAIL   agents-support  src/agents/harness/mediated-delegation-effects.test.ts > plugin-harness delegated final effects (stamped visible spawn: false) > rejects revocation at the final exec boundary
 FAIL   agents-support  src/agents/harness/mediated-delegation-effects.test.ts > plugin-harness delegated final effects (stamped visible spawn: true) > rejects revocation at the final exec boundary
AssertionError: Warning: continuation options are unavailable; running synchronously.
(no output): expected false to be true // Object.is equality
- Expected
+ Received
- true
+ false
 ❯ expectRejected src/agents/harness/mediated-delegation-effects.test.ts:276:41
    274| }
```

### compact-large-39 :: agents-support src/agents/harness/mediated-delegation-effects.test.ts > cli-loopback delegated final effects (stamped visible spawn: true) > rejects revocation at the final exec boundary

```
AssertionError: Warning: continuation options are unavailable; running synchronously.
(no output): expected false to be true // Object.is equality
- Expected
+ Received
- true
+ false
 ❯ expectRejected src/agents/harness/mediated-delegation-effects.test.ts:276:41
    274| }
    275| async function expectRejected(receipt: Receipt, target: string) {
    276|   expect(receipt.isError, receipt.text).toBe(true);
       |                                         ^
    277|   expect(receipt.text).toMatch(/authorization changed|authority is no …
    278|   expect(await fs.readFile(target, "utf8")).toBe("original");
 ❯ src/agents/harness/mediated-delegation-effects.test.ts:392:15
⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/8]⎯
 FAIL   agents-support  src/agents/harness/mediated-delegation-effects.test.ts > cli-loopback delegated final effects (stamped visible spawn: false) > rejects revocation at the final write boundary
AssertionError: Successfully wrote 9 bytes to /tmp/oca37fd4/.oc-ci-tmp/sPAG/t/oc-vt-D2wKUr/oc-vt-cHFdKF/openclaw-mediated-delegation-8BhHsz/workspace/cli-loopback-revoked-write.txt: expected false to be true // Object.is equality
- Expected
+ Received
- true
+ false
 ❯ expectRejected src/agents/harness/mediated-delegation-effects.test.ts:276:41
    274| }
    275| async function expectRejected(receipt: Receipt, target: string) {
```

### compact-large-39 :: agents-support src/agents/harness/mediated-delegation-effects.test.ts > cli-loopback delegated final effects (stamped visible spawn: true) > rejects revocation at the final write boundary

```
AssertionError: Successfully wrote 9 bytes to /tmp/oca37fd4/.oc-ci-tmp/sPAG/t/oc-vt-D2wKUr/oc-vt-cHFdKF/openclaw-mediated-delegation-8BhHsz/workspace/cli-loopback-stamped-revoked-write.txt: expected false to be true // Object.is equality
- Expected
+ Received
- true
+ false
 ❯ expectRejected src/agents/harness/mediated-delegation-effects.test.ts:276:41
    274| }
    275| async function expectRejected(receipt: Receipt, target: string) {
    276|   expect(receipt.isError, receipt.text).toBe(true);
       |                                         ^
    277|   expect(receipt.text).toMatch(/authorization changed|authority is no …
    278|   expect(await fs.readFile(target, "utf8")).toBe("original");
 ❯ src/agents/harness/mediated-delegation-effects.test.ts:392:15
⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[5/8]⎯
 FAIL   agents-support  src/agents/harness/mediated-delegation-effects.test.ts > plugin-harness delegated final effects (stamped visible spawn: true) > rejects revocation at the final write boundary
AssertionError: Successfully wrote 9 bytes to /tmp/oca37fd4/.oc-ci-tmp/sPAG/t/oc-vt-D2wKUr/oc-vt-cHFdKF/openclaw-mediated-delegation-8BhHsz/workspace/plugin-harness-stamped-revoked-write.txt: expected false to be true // Object.is equality
- Expected
+ Received
- true
+ false
 ❯ expectRejected src/agents/harness/mediated-delegation-effects.test.ts:276:41
    274| }
    275| async function expectRejected(receipt: Receipt, target: string) {
    276|   expect(receipt.isError, receipt.text).toBe(true);
```

### compact-large-39 :: agents-support src/agents/harness/mediated-delegation-effects.test.ts > plugin-harness delegated final effects (stamped visible spawn: false) > rejects revocation at the final exec boundary

```
 FAIL   agents-support  src/agents/harness/mediated-delegation-effects.test.ts > plugin-harness delegated final effects (stamped visible spawn: true) > rejects revocation at the final exec boundary
AssertionError: Warning: continuation options are unavailable; running synchronously.
(no output): expected false to be true // Object.is equality
- Expected
+ Received
- true
+ false
 ❯ expectRejected src/agents/harness/mediated-delegation-effects.test.ts:276:41
    274| }
    275| async function expectRejected(receipt: Receipt, target: string) {
    276|   expect(receipt.isError, receipt.text).toBe(true);
       |                                         ^
    277|   expect(receipt.text).toMatch(/authorization changed|authority is no …
    278|   expect(await fs.readFile(target, "utf8")).toBe("original");
 ❯ src/agents/harness/mediated-delegation-effects.test.ts:392:15
⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[3/8]⎯
 FAIL   agents-support  src/agents/harness/mediated-delegation-effects.test.ts > plugin-harness delegated final effects (stamped visible spawn: false) > rejects revocation at the final write boundary
AssertionError: Successfully wrote 9 bytes to /tmp/oca37fd4/.oc-ci-tmp/sPAG/t/oc-vt-D2wKUr/oc-vt-cHFdKF/openclaw-mediated-delegation-8BhHsz/workspace/plugin-harness-revoked-write.txt: expected false to be true // Object.is equality
- Expected
+ Received
- true
+ false
 ❯ expectRejected src/agents/harness/mediated-delegation-effects.test.ts:276:41
    274| }
```

### compact-large-39 :: agents-support src/agents/harness/mediated-delegation-effects.test.ts > plugin-harness delegated final effects (stamped visible spawn: false) > rejects revocation at the final write boundary

```
AssertionError: Successfully wrote 9 bytes to /tmp/oca37fd4/.oc-ci-tmp/sPAG/t/oc-vt-D2wKUr/oc-vt-cHFdKF/openclaw-mediated-delegation-8BhHsz/workspace/plugin-harness-revoked-write.txt: expected false to be true // Object.is equality
- Expected
+ Received
- true
+ false
 ❯ expectRejected src/agents/harness/mediated-delegation-effects.test.ts:276:41
    274| }
    275| async function expectRejected(receipt: Receipt, target: string) {
    276|   expect(receipt.isError, receipt.text).toBe(true);
       |                                         ^
    277|   expect(receipt.text).toMatch(/authorization changed|authority is no …
    278|   expect(await fs.readFile(target, "utf8")).toBe("original");
 ❯ src/agents/harness/mediated-delegation-effects.test.ts:392:15
⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[4/8]⎯
 FAIL   agents-support  src/agents/harness/mediated-delegation-effects.test.ts > cli-loopback delegated final effects (stamped visible spawn: true) > rejects revocation at the final write boundary
AssertionError: Successfully wrote 9 bytes to /tmp/oca37fd4/.oc-ci-tmp/sPAG/t/oc-vt-D2wKUr/oc-vt-cHFdKF/openclaw-mediated-delegation-8BhHsz/workspace/cli-loopback-stamped-revoked-write.txt: expected false to be true // Object.is equality
- Expected
+ Received
- true
+ false
 ❯ expectRejected src/agents/harness/mediated-delegation-effects.test.ts:276:41
    274| }
    275| async function expectRejected(receipt: Receipt, target: string) {
    276|   expect(receipt.isError, receipt.text).toBe(true);
```

### compact-large-39 :: agents-support src/agents/harness/mediated-delegation-effects.test.ts > plugin-harness delegated final effects (stamped visible spawn: true) > rejects revocation at the final exec boundary

```
AssertionError: Warning: continuation options are unavailable; running synchronously.
(no output): expected false to be true // Object.is equality
- Expected
+ Received
- true
+ false
 ❯ expectRejected src/agents/harness/mediated-delegation-effects.test.ts:276:41
    274| }
    275| async function expectRejected(receipt: Receipt, target: string) {
    276|   expect(receipt.isError, receipt.text).toBe(true);
       |                                         ^
    277|   expect(receipt.text).toMatch(/authorization changed|authority is no …
    278|   expect(await fs.readFile(target, "utf8")).toBe("original");
 ❯ src/agents/harness/mediated-delegation-effects.test.ts:392:15
⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[3/8]⎯
 FAIL   agents-support  src/agents/harness/mediated-delegation-effects.test.ts > plugin-harness delegated final effects (stamped visible spawn: false) > rejects revocation at the final write boundary
AssertionError: Successfully wrote 9 bytes to /tmp/oca37fd4/.oc-ci-tmp/sPAG/t/oc-vt-D2wKUr/oc-vt-cHFdKF/openclaw-mediated-delegation-8BhHsz/workspace/plugin-harness-revoked-write.txt: expected false to be true // Object.is equality
- Expected
+ Received
- true
+ false
 ❯ expectRejected src/agents/harness/mediated-delegation-effects.test.ts:276:41
    274| }
    275| async function expectRejected(receipt: Receipt, target: string) {
```

### compact-large-39 :: agents-support src/agents/harness/mediated-delegation-effects.test.ts > plugin-harness delegated final effects (stamped visible spawn: true) > rejects revocation at the final write boundary

```
AssertionError: Successfully wrote 9 bytes to /tmp/oca37fd4/.oc-ci-tmp/sPAG/t/oc-vt-D2wKUr/oc-vt-cHFdKF/openclaw-mediated-delegation-8BhHsz/workspace/plugin-harness-stamped-revoked-write.txt: expected false to be true // Object.is equality
- Expected
+ Received
- true
+ false
 ❯ expectRejected src/agents/harness/mediated-delegation-effects.test.ts:276:41
    274| }
    275| async function expectRejected(receipt: Receipt, target: string) {
    276|   expect(receipt.isError, receipt.text).toBe(true);
       |                                         ^
    277|   expect(receipt.text).toMatch(/authorization changed|authority is no …
    278|   expect(await fs.readFile(target, "utf8")).toBe("original");
 ❯ src/agents/harness/mediated-delegation-effects.test.ts:392:15
⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[6/8]⎯
 Test Files  1 failed | 54 passed | 1 skipped (56)
      Tests  8 failed | 783 passed | 11 skipped (802)
   Start at  09:27:36
   Duration  182.88s (tests 79%, transform 15%, import 5%, worker 1%)
[test] failed 1 Vitest shard in 184.34s
[test] FAILED (exit 1)
end (exit 1)
FAILED (exit 1)
[sqlite-test-lifecycle] src/agents/sessions/background-result-placement.test.ts: retiring openclaw.sessionDiskBudgetWorkers
 ✓  agents-support  src/agents/sessions/background-result-placement.test.ts > does not retain a transcript manager through an abandoned placement listener 94ms
```

### compact-large-4 :: agents-support src/agents/worktrees/filesystem-native.test.ts > preserves native mode across ReFS copies on a reused worker

```
Error: [openclaw] CI job agentic-agents-support-hosted-8: Bun revision verification failed: spawnSync bun ENOENT. Run .github/actions/setup-test-bun before tests.
 ❯ requirePinnedBun scripts/lib/pinned-bun.mts:189:13
    187|       }
    188|     } catch (error) {
    189|       throw new Error(
       |             ^
    190|         `[openclaw] ${ciJob}Bun revision verification failed: ${error …
    191|         { cause: error },
 ❯ src/agents/worktrees/filesystem-native.test.ts:74:7
Caused by: Error: spawnSync bun ENOENT
 ❯ requirePinnedBun scripts/lib/pinned-bun.mts:180:24
 ❯ src/agents/worktrees/filesystem-native.test.ts:74:7
⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯
Serialized Error: { errno: -2, code: 'ENOENT', syscall: 'spawnSync bun', path: 'bun', spawnargs: [ '--revision' ], error: { stack: 'Error: spawnSync bun ENOENT
    at Object.spawnSync (node:internal/child_process:1175:20)
    at spawnSync (node:child_process:976:24)
    at execFileSync (node:child_process:1019:15)
    at requirePinnedBun (/home/runner/_work/_temp/ci-batch-work-44871298969-1-local-batch-059/shard-0-compact-large-4/scripts/lib/pinned-bun.mts:180:24)
    at /home/runner/_work/_temp/ci-batch-work-44871298969-1-local-batch-059/shard-0-compact-large-4/src/agents/worktrees/filesystem-native.test.ts:74:7
    at file:///home/runner/_work/_temp/ci-batch-work-44871298969-1-local-batch-059/shard-0-compact-large-4/node_modules/.pnpm/vitest@5.0.5_patch_hash=a2a78abe9470cc2ceb0d4eeb81acfc62d6180e9990bc866a7771ba60b1320ea_75661d0a5892d48edf76140ec77ed19d/node_modules/vitest/dist/chunks/run.BPv-BBRv.js:1632:35
    at file:///home/runner/_work/_temp/ci-batch-work-44871298969-1-local-batch-059/shard-0-compact-large-4/node_modules/.pnpm/vitest@5.0.5_patch_hash=a2a78abe9470cc2ceb0d4eeb81acfc62d6180e9990bc866a7771ba60b1320ea_75661d0a5892d48edf76140ec77ed19d/node_modules/vitest/dist/chunks/run.BPv-BBRv.js:2801:26
    at file:///home/runner/_work/_temp/ci-batch-work-44871298969-1-local-batch-059/shard-0-compact-large-4/node_modules/.pnpm/vitest@5.0.5_patch_hash=a2a78abe9470cc2ceb0d4eeb81acfc62d6180e9990bc866a7771ba60b1320ea_75661d0a5892d48edf76140ec77ed19d/node_modules/vitest/dist/chunks/run.BPv-BBRv.js:3338:20
    at new Promise (<anonymous>)
    at runWithCancel (file:///home/runner/_work/_temp/ci-batch-work-44871298969-1-local-batch-059/shard-0-compact-large-4/node_modules/.pnpm/vitest@5.0.5_patch_hash=a2a78abe9470cc2ceb0d4eeb81acfc62d6180e9990bc866a7771ba60b1320ea_75661d0a5892d48edf76140ec77ed19d/node_modules/vitest/dist/chunks/run.BPv-BBRv.js:3333:10)
```

### compact-large-6 :: agents-support src/agents/subagents/registry/subagent-registry-worker.test.ts > releases serialized payloads while their immutable registry rows remain resident

```
AssertionError: Expected values to be strictly equal:
1 !== 0
- Expected
+ Received
- 0
+ 1
 ❯ expectLiveObjects src/test-utils/retention.ts:23:10
     21| ): Promise<void> {
     22|   await collectForRetentionCheck("live-objects", 1);
     23|   assert.equal(refs.filter((ref) => ref.deref() !== undefined).length,…
       |          ^
     24| }
     25|
 ❯ expectCollected src/test-utils/retention.ts:27:3
 ❯ src/agents/subagents/registry/subagent-registry-worker.test.ts:873:3
⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯
 Test Files  1 failed | 57 passed | 1 skipped (59)
      Tests  1 failed | 632 passed | 8 skipped (641)
   Start at  08:49:21
   Duration  117.63s (tests 76%, transform 17%, import 5%, worker 1%)
[test] failed 1 Vitest shard in 118.90s
[test] FAILED (exit 1)
end (exit 1)
FAILED (exit 1)
```

### compact-small-30 :: tooling test/scripts/vitest-worker-shutdown.test.ts > ci wrapper joins admission work before honoring SIGINT

```
Error: Missing shutdown receipt: /home/runner/_work/_temp/ci-batch-work-44871298969-1-hosted-batch-004/shard-1-compact-small-30/.artifacts/worker proof-LqlqBS/verification-ready
 ❯ test/scripts/vitest-worker-shutdown.test.ts:344:23
    342|               // separate transports can deliver command completion fi…
    343|               if (!fs.existsSync(filename) || fs.statSync(filename).si…
    344|                 throw new Error(`Missing shutdown receipt: ${filename}…
       |                       ^
    345|               }
    346|             }),
 ❯ test/scripts/vitest-worker-shutdown.test.ts:356:9
⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[15/25]⎯
 FAIL   tooling  test/scripts/vitest-worker-shutdown.test.ts > ci wrapper joins admission work before honoring SIGTERM
Error: Missing shutdown receipt: /home/runner/_work/_temp/ci-batch-work-44871298969-1-hosted-batch-004/shard-1-compact-small-30/.artifacts/worker proof-SHRNMy/verification-ready
 ❯ test/scripts/vitest-worker-shutdown.test.ts:344:23
    342|               // separate transports can deliver command completion fi…
    343|               if (!fs.existsSync(filename) || fs.statSync(filename).si…
    344|                 throw new Error(`Missing shutdown receipt: ${filename}…
       |                       ^
    345|               }
    346|             }),
 ❯ test/scripts/vitest-worker-shutdown.test.ts:356:9
⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[16/25]⎯
 FAIL   tooling  test/scripts/vitest-worker-shutdown.test.ts > ci wrapper joins disposal work before honoring SIGINT
Error: Missing shutdown receipt: /home/runner/_work/_temp/ci-batch-work-44871298969-1-hosted-batch-004/shard-1-compact-small-30/.artifacts/worker proof-HHEh6H/verification-ready
 ❯ test/scripts/vitest-worker-shutdown.test.ts:344:23
```

### compact-small-30 :: tooling test/scripts/vitest-worker-shutdown.test.ts > ci wrapper joins admission work before honoring SIGTERM

```
Error: Missing shutdown receipt: /home/runner/_work/_temp/ci-batch-work-44871298969-1-hosted-batch-004/shard-1-compact-small-30/.artifacts/worker proof-SHRNMy/verification-ready
 ❯ test/scripts/vitest-worker-shutdown.test.ts:344:23
    342|               // separate transports can deliver command completion fi…
    343|               if (!fs.existsSync(filename) || fs.statSync(filename).si…
    344|                 throw new Error(`Missing shutdown receipt: ${filename}…
       |                       ^
    345|               }
    346|             }),
 ❯ test/scripts/vitest-worker-shutdown.test.ts:356:9
⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[16/25]⎯
 FAIL   tooling  test/scripts/vitest-worker-shutdown.test.ts > ci wrapper joins disposal work before honoring SIGINT
Error: Missing shutdown receipt: /home/runner/_work/_temp/ci-batch-work-44871298969-1-hosted-batch-004/shard-1-compact-small-30/.artifacts/worker proof-HHEh6H/verification-ready
 ❯ test/scripts/vitest-worker-shutdown.test.ts:344:23
    342|               // separate transports can deliver command completion fi…
    343|               if (!fs.existsSync(filename) || fs.statSync(filename).si…
    344|                 throw new Error(`Missing shutdown receipt: ${filename}…
       |                       ^
    345|               }
    346|             }),
 ❯ test/scripts/vitest-worker-shutdown.test.ts:356:9
⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[17/25]⎯
 FAIL   tooling  test/scripts/vitest-worker-shutdown.test.ts > ci wrapper joins disposal work before honoring SIGTERM
Error: Missing shutdown receipt: /home/runner/_work/_temp/ci-batch-work-44871298969-1-hosted-batch-004/shard-1-compact-small-30/.artifacts/worker proof-rn3fJT/verification-ready
 ❯ test/scripts/vitest-worker-shutdown.test.ts:344:23
```

### compact-small-30 :: tooling test/scripts/vitest-worker-shutdown.test.ts > ci wrapper joins compilation work before honoring SIGINT

```
Error: Missing shutdown receipt: /home/runner/_work/_temp/ci-batch-work-44871298969-1-hosted-batch-004/shard-1-compact-small-30/.artifacts/worker proof-8Nsm8W/compiler-ready
 ❯ test/scripts/vitest-worker-shutdown.test.ts:344:23
    342|               // separate transports can deliver command completion fi…
    343|               if (!fs.existsSync(filename) || fs.statSync(filename).si…
    344|                 throw new Error(`Missing shutdown receipt: ${filename}…
       |                       ^
    345|               }
    346|             }),
 ❯ test/scripts/vitest-worker-shutdown.test.ts:356:9
⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[11/25]⎯
 FAIL   tooling  test/scripts/vitest-worker-shutdown.test.ts > ci wrapper joins compilation work before honoring SIGTERM
Error: Missing shutdown receipt: /home/runner/_work/_temp/ci-batch-work-44871298969-1-hosted-batch-004/shard-1-compact-small-30/.artifacts/worker proof-sCxfEL/compiler-ready
 ❯ test/scripts/vitest-worker-shutdown.test.ts:344:23
    342|               // separate transports can deliver command completion fi…
    343|               if (!fs.existsSync(filename) || fs.statSync(filename).si…
    344|                 throw new Error(`Missing shutdown receipt: ${filename}…
       |                       ^
    345|               }
    346|             }),
 ❯ test/scripts/vitest-worker-shutdown.test.ts:356:9
⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[12/25]⎯
 FAIL   tooling  test/scripts/vitest-worker-shutdown.test.ts > ci-shared wrapper joins compilation work before honoring SIGINT
Error: Missing shutdown receipt: /home/runner/_work/_temp/ci-batch-work-44871298969-1-hosted-batch-004/shard-1-compact-small-30/.artifacts/worker proof-MtVGFg/compiler-ready
 ❯ test/scripts/vitest-worker-shutdown.test.ts:344:23
```

### compact-small-30 :: tooling test/scripts/vitest-worker-shutdown.test.ts > ci wrapper joins compilation work before honoring SIGTERM

```
Error: Missing shutdown receipt: /home/runner/_work/_temp/ci-batch-work-44871298969-1-hosted-batch-004/shard-1-compact-small-30/.artifacts/worker proof-sCxfEL/compiler-ready
 ❯ test/scripts/vitest-worker-shutdown.test.ts:344:23
    342|               // separate transports can deliver command completion fi…
    343|               if (!fs.existsSync(filename) || fs.statSync(filename).si…
    344|                 throw new Error(`Missing shutdown receipt: ${filename}…
       |                       ^
    345|               }
    346|             }),
 ❯ test/scripts/vitest-worker-shutdown.test.ts:356:9
⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[12/25]⎯
 FAIL   tooling  test/scripts/vitest-worker-shutdown.test.ts > ci-shared wrapper joins compilation work before honoring SIGINT
Error: Missing shutdown receipt: /home/runner/_work/_temp/ci-batch-work-44871298969-1-hosted-batch-004/shard-1-compact-small-30/.artifacts/worker proof-MtVGFg/compiler-ready
 ❯ test/scripts/vitest-worker-shutdown.test.ts:344:23
    342|               // separate transports can deliver command completion fi…
    343|               if (!fs.existsSync(filename) || fs.statSync(filename).si…
    344|                 throw new Error(`Missing shutdown receipt: ${filename}…
       |                       ^
    345|               }
    346|             }),
 ❯ test/scripts/vitest-worker-shutdown.test.ts:356:9
⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[13/25]⎯
 FAIL   tooling  test/scripts/vitest-worker-shutdown.test.ts > ci-shared wrapper joins compilation work before honoring SIGTERM
Error: Missing shutdown receipt: /home/runner/_work/_temp/ci-batch-work-44871298969-1-hosted-batch-004/shard-1-compact-small-30/.artifacts/worker proof-J1RmdZ/compiler-ready
 ❯ test/scripts/vitest-worker-shutdown.test.ts:344:23
```

### compact-small-30 :: tooling test/scripts/vitest-worker-shutdown.test.ts > ci wrapper joins deletion work before honoring SIGINT

```
Error: Missing shutdown receipt: /home/runner/_work/_temp/ci-batch-work-44871298969-1-hosted-batch-004/shard-1-compact-small-30/.artifacts/worker proof-Lfy4kR/verification-ready
 ❯ test/scripts/vitest-worker-shutdown.test.ts:344:23
    342|               // separate transports can deliver command completion fi…
    343|               if (!fs.existsSync(filename) || fs.statSync(filename).si…
    344|                 throw new Error(`Missing shutdown receipt: ${filename}…
       |                       ^
    345|               }
    346|             }),
 ❯ test/scripts/vitest-worker-shutdown.test.ts:356:9
⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[20/25]⎯
 FAIL   tooling  test/scripts/vitest-worker-shutdown.test.ts > ci wrapper joins deletion work before honoring SIGTERM
Error: Missing shutdown receipt: /home/runner/_work/_temp/ci-batch-work-44871298969-1-hosted-batch-004/shard-1-compact-small-30/.artifacts/worker proof-RXQurm/verification-ready
 ❯ test/scripts/vitest-worker-shutdown.test.ts:344:23
    342|               // separate transports can deliver command completion fi…
    343|               if (!fs.existsSync(filename) || fs.statSync(filename).si…
    344|                 throw new Error(`Missing shutdown receipt: ${filename}…
       |                       ^
    345|               }
    346|             }),
 ❯ test/scripts/vitest-worker-shutdown.test.ts:356:9
⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[21/25]⎯
 FAIL   tooling  test/scripts/vitest-worker-shutdown.test.ts > direct wrapper joins deletion work before honoring SIGINT
Error: Missing shutdown receipt: /home/runner/_work/_temp/ci-batch-work-44871298969-1-hosted-batch-004/shard-1-compact-small-30/.artifacts/worker proof-NVqsSO/verification-ready
 ❯ test/scripts/vitest-worker-shutdown.test.ts:344:23
```

### compact-small-30 :: tooling test/scripts/vitest-worker-shutdown.test.ts > ci wrapper joins deletion work before honoring SIGTERM

```
Error: Missing shutdown receipt: /home/runner/_work/_temp/ci-batch-work-44871298969-1-hosted-batch-004/shard-1-compact-small-30/.artifacts/worker proof-RXQurm/verification-ready
 ❯ test/scripts/vitest-worker-shutdown.test.ts:344:23
    342|               // separate transports can deliver command completion fi…
    343|               if (!fs.existsSync(filename) || fs.statSync(filename).si…
    344|                 throw new Error(`Missing shutdown receipt: ${filename}…
       |                       ^
    345|               }
    346|             }),
 ❯ test/scripts/vitest-worker-shutdown.test.ts:356:9
⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[21/25]⎯
 FAIL   tooling  test/scripts/vitest-worker-shutdown.test.ts > direct wrapper joins deletion work before honoring SIGINT
Error: Missing shutdown receipt: /home/runner/_work/_temp/ci-batch-work-44871298969-1-hosted-batch-004/shard-1-compact-small-30/.artifacts/worker proof-NVqsSO/verification-ready
 ❯ test/scripts/vitest-worker-shutdown.test.ts:344:23
    342|               // separate transports can deliver command completion fi…
    343|               if (!fs.existsSync(filename) || fs.statSync(filename).si…
    344|                 throw new Error(`Missing shutdown receipt: ${filename}…
       |                       ^
    345|               }
    346|             }),
 ❯ test/scripts/vitest-worker-shutdown.test.ts:356:9
⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[22/25]⎯
 FAIL   tooling  test/scripts/vitest-worker-shutdown.test.ts > direct wrapper joins deletion work before honoring SIGTERM
Error: Missing shutdown receipt: /home/runner/_work/_temp/ci-batch-work-44871298969-1-hosted-batch-004/shard-1-compact-small-30/.artifacts/worker proof-ZPK3ae/verification-ready
 ❯ test/scripts/vitest-worker-shutdown.test.ts:344:23
```

### compact-small-30 :: tooling test/scripts/vitest-worker-shutdown.test.ts > ci wrapper joins disposal work before honoring SIGINT

```
Error: Missing shutdown receipt: /home/runner/_work/_temp/ci-batch-work-44871298969-1-hosted-batch-004/shard-1-compact-small-30/.artifacts/worker proof-HHEh6H/verification-ready
 ❯ test/scripts/vitest-worker-shutdown.test.ts:344:23
    342|               // separate transports can deliver command completion fi…
    343|               if (!fs.existsSync(filename) || fs.statSync(filename).si…
    344|                 throw new Error(`Missing shutdown receipt: ${filename}…
       |                       ^
    345|               }
    346|             }),
 ❯ test/scripts/vitest-worker-shutdown.test.ts:356:9
⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[17/25]⎯
 FAIL   tooling  test/scripts/vitest-worker-shutdown.test.ts > ci wrapper joins disposal work before honoring SIGTERM
Error: Missing shutdown receipt: /home/runner/_work/_temp/ci-batch-work-44871298969-1-hosted-batch-004/shard-1-compact-small-30/.artifacts/worker proof-rn3fJT/verification-ready
 ❯ test/scripts/vitest-worker-shutdown.test.ts:344:23
    342|               // separate transports can deliver command completion fi…
    343|               if (!fs.existsSync(filename) || fs.statSync(filename).si…
    344|                 throw new Error(`Missing shutdown receipt: ${filename}…
       |                       ^
    345|               }
    346|             }),
 ❯ test/scripts/vitest-worker-shutdown.test.ts:356:9
⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[18/25]⎯
 FAIL   tooling  test/scripts/vitest-worker-shutdown.test.ts > ci-disconnect wrapper joins admission work before honoring SIGTERM
Error: Missing shutdown receipt: /home/runner/_work/_temp/ci-batch-work-44871298969-1-hosted-batch-004/shard-1-compact-small-30/.artifacts/worker proof-YzUTSQ/verification-ready
 ❯ test/scripts/vitest-worker-shutdown.test.ts:344:23
```

### compact-small-30 :: tooling test/scripts/vitest-worker-shutdown.test.ts > ci wrapper joins disposal work before honoring SIGTERM

```
Error: Missing shutdown receipt: /home/runner/_work/_temp/ci-batch-work-44871298969-1-hosted-batch-004/shard-1-compact-small-30/.artifacts/worker proof-rn3fJT/verification-ready
 ❯ test/scripts/vitest-worker-shutdown.test.ts:344:23
    342|               // separate transports can deliver command completion fi…
    343|               if (!fs.existsSync(filename) || fs.statSync(filename).si…
    344|                 throw new Error(`Missing shutdown receipt: ${filename}…
       |                       ^
    345|               }
    346|             }),
 ❯ test/scripts/vitest-worker-shutdown.test.ts:356:9
⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[18/25]⎯
 FAIL   tooling  test/scripts/vitest-worker-shutdown.test.ts > ci-disconnect wrapper joins admission work before honoring SIGTERM
Error: Missing shutdown receipt: /home/runner/_work/_temp/ci-batch-work-44871298969-1-hosted-batch-004/shard-1-compact-small-30/.artifacts/worker proof-YzUTSQ/verification-ready
 ❯ test/scripts/vitest-worker-shutdown.test.ts:344:23
    342|               // separate transports can deliver command completion fi…
    343|               if (!fs.existsSync(filename) || fs.statSync(filename).si…
    344|                 throw new Error(`Missing shutdown receipt: ${filename}…
       |                       ^
    345|               }
    346|             }),
 ❯ test/scripts/vitest-worker-shutdown.test.ts:356:9
⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[19/25]⎯
 FAIL   tooling  test/scripts/vitest-worker-shutdown.test.ts > ci wrapper joins deletion work before honoring SIGINT
Error: Missing shutdown receipt: /home/runner/_work/_temp/ci-batch-work-44871298969-1-hosted-batch-004/shard-1-compact-small-30/.artifacts/worker proof-Lfy4kR/verification-ready
 ❯ test/scripts/vitest-worker-shutdown.test.ts:344:23
```

### compact-small-30 :: tooling test/scripts/vitest-worker-shutdown.test.ts > ci-disconnect wrapper joins admission work before honoring SIGTERM

```
Error: Missing shutdown receipt: /home/runner/_work/_temp/ci-batch-work-44871298969-1-hosted-batch-004/shard-1-compact-small-30/.artifacts/worker proof-YzUTSQ/verification-ready
 ❯ test/scripts/vitest-worker-shutdown.test.ts:344:23
    342|               // separate transports can deliver command completion fi…
    343|               if (!fs.existsSync(filename) || fs.statSync(filename).si…
    344|                 throw new Error(`Missing shutdown receipt: ${filename}…
       |                       ^
    345|               }
    346|             }),
 ❯ test/scripts/vitest-worker-shutdown.test.ts:356:9
⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[19/25]⎯
 FAIL   tooling  test/scripts/vitest-worker-shutdown.test.ts > ci wrapper joins deletion work before honoring SIGINT
Error: Missing shutdown receipt: /home/runner/_work/_temp/ci-batch-work-44871298969-1-hosted-batch-004/shard-1-compact-small-30/.artifacts/worker proof-Lfy4kR/verification-ready
 ❯ test/scripts/vitest-worker-shutdown.test.ts:344:23
    342|               // separate transports can deliver command completion fi…
    343|               if (!fs.existsSync(filename) || fs.statSync(filename).si…
    344|                 throw new Error(`Missing shutdown receipt: ${filename}…
       |                       ^
    345|               }
    346|             }),
 ❯ test/scripts/vitest-worker-shutdown.test.ts:356:9
⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[20/25]⎯
 FAIL   tooling  test/scripts/vitest-worker-shutdown.test.ts > ci wrapper joins deletion work before honoring SIGTERM
Error: Missing shutdown receipt: /home/runner/_work/_temp/ci-batch-work-44871298969-1-hosted-batch-004/shard-1-compact-small-30/.artifacts/worker proof-RXQurm/verification-ready
 ❯ test/scripts/vitest-worker-shutdown.test.ts:344:23
```

### compact-small-30 :: tooling test/scripts/vitest-worker-shutdown.test.ts > ci-shared wrapper joins compilation work before honoring SIGINT

```
Error: Missing shutdown receipt: /home/runner/_work/_temp/ci-batch-work-44871298969-1-hosted-batch-004/shard-1-compact-small-30/.artifacts/worker proof-MtVGFg/compiler-ready
 ❯ test/scripts/vitest-worker-shutdown.test.ts:344:23
    342|               // separate transports can deliver command completion fi…
    343|               if (!fs.existsSync(filename) || fs.statSync(filename).si…
    344|                 throw new Error(`Missing shutdown receipt: ${filename}…
       |                       ^
    345|               }
    346|             }),
 ❯ test/scripts/vitest-worker-shutdown.test.ts:356:9
⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[13/25]⎯
 FAIL   tooling  test/scripts/vitest-worker-shutdown.test.ts > ci-shared wrapper joins compilation work before honoring SIGTERM
Error: Missing shutdown receipt: /home/runner/_work/_temp/ci-batch-work-44871298969-1-hosted-batch-004/shard-1-compact-small-30/.artifacts/worker proof-J1RmdZ/compiler-ready
 ❯ test/scripts/vitest-worker-shutdown.test.ts:344:23
    342|               // separate transports can deliver command completion fi…
    343|               if (!fs.existsSync(filename) || fs.statSync(filename).si…
    344|                 throw new Error(`Missing shutdown receipt: ${filename}…
       |                       ^
    345|               }
    346|             }),
 ❯ test/scripts/vitest-worker-shutdown.test.ts:356:9
⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[14/25]⎯
 FAIL   tooling  test/scripts/vitest-worker-shutdown.test.ts > ci wrapper joins admission work before honoring SIGINT
Error: Missing shutdown receipt: /home/runner/_work/_temp/ci-batch-work-44871298969-1-hosted-batch-004/shard-1-compact-small-30/.artifacts/worker proof-LqlqBS/verification-ready
 ❯ test/scripts/vitest-worker-shutdown.test.ts:344:23
```

### compact-small-30 :: tooling test/scripts/vitest-worker-shutdown.test.ts > ci-shared wrapper joins compilation work before honoring SIGTERM

```
Error: Missing shutdown receipt: /home/runner/_work/_temp/ci-batch-work-44871298969-1-hosted-batch-004/shard-1-compact-small-30/.artifacts/worker proof-J1RmdZ/compiler-ready
 ❯ test/scripts/vitest-worker-shutdown.test.ts:344:23
    342|               // separate transports can deliver command completion fi…
    343|               if (!fs.existsSync(filename) || fs.statSync(filename).si…
    344|                 throw new Error(`Missing shutdown receipt: ${filename}…
       |                       ^
    345|               }
    346|             }),
 ❯ test/scripts/vitest-worker-shutdown.test.ts:356:9
⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[14/25]⎯
 FAIL   tooling  test/scripts/vitest-worker-shutdown.test.ts > ci wrapper joins admission work before honoring SIGINT
Error: Missing shutdown receipt: /home/runner/_work/_temp/ci-batch-work-44871298969-1-hosted-batch-004/shard-1-compact-small-30/.artifacts/worker proof-LqlqBS/verification-ready
 ❯ test/scripts/vitest-worker-shutdown.test.ts:344:23
    342|               // separate transports can deliver command completion fi…
    343|               if (!fs.existsSync(filename) || fs.statSync(filename).si…
    344|                 throw new Error(`Missing shutdown receipt: ${filename}…
       |                       ^
    345|               }
    346|             }),
 ❯ test/scripts/vitest-worker-shutdown.test.ts:356:9
⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[15/25]⎯
 FAIL   tooling  test/scripts/vitest-worker-shutdown.test.ts > ci wrapper joins admission work before honoring SIGTERM
Error: Missing shutdown receipt: /home/runner/_work/_temp/ci-batch-work-44871298969-1-hosted-batch-004/shard-1-compact-small-30/.artifacts/worker proof-SHRNMy/verification-ready
 ❯ test/scripts/vitest-worker-shutdown.test.ts:344:23
```

### compact-small-30 :: tooling test/scripts/vitest-worker-shutdown.test.ts > direct wrapper joins admission work before honoring SIGINT

```
Error: Missing shutdown receipt: /home/runner/_work/_temp/ci-batch-work-44871298969-1-hosted-batch-004/shard-1-compact-small-30/.artifacts/worker proof-TQUprC/verification-ready
 ❯ test/scripts/vitest-worker-shutdown.test.ts:344:23
    342|               // separate transports can deliver command completion fi…
    343|               if (!fs.existsSync(filename) || fs.statSync(filename).si…
    344|                 throw new Error(`Missing shutdown receipt: ${filename}…
       |                       ^
    345|               }
    346|             }),
 ❯ test/scripts/vitest-worker-shutdown.test.ts:356:9
⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[5/25]⎯
 FAIL   tooling  test/scripts/vitest-worker-shutdown.test.ts > direct wrapper joins admission work before honoring SIGTERM
Error: Missing shutdown receipt: /home/runner/_work/_temp/ci-batch-work-44871298969-1-hosted-batch-004/shard-1-compact-small-30/.artifacts/worker proof-dzvhcj/verification-ready
 ❯ test/scripts/vitest-worker-shutdown.test.ts:344:23
    342|               // separate transports can deliver command completion fi…
    343|               if (!fs.existsSync(filename) || fs.statSync(filename).si…
    344|                 throw new Error(`Missing shutdown receipt: ${filename}…
       |                       ^
    345|               }
    346|             }),
 ❯ test/scripts/vitest-worker-shutdown.test.ts:356:9
⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[6/25]⎯
 FAIL   tooling  test/scripts/vitest-worker-shutdown.test.ts > direct wrapper joins compilation work before honoring SIGINT
Error: Missing shutdown receipt: /home/runner/_work/_temp/ci-batch-work-44871298969-1-hosted-batch-004/shard-1-compact-small-30/.artifacts/worker proof-Ccc4HB/compiler-ready
 ❯ test/scripts/vitest-worker-shutdown.test.ts:344:23
```

### compact-small-30 :: tooling test/scripts/vitest-worker-shutdown.test.ts > direct wrapper joins admission work before honoring SIGTERM

```
Error: Missing shutdown receipt: /home/runner/_work/_temp/ci-batch-work-44871298969-1-hosted-batch-004/shard-1-compact-small-30/.artifacts/worker proof-dzvhcj/verification-ready
 ❯ test/scripts/vitest-worker-shutdown.test.ts:344:23
    342|               // separate transports can deliver command completion fi…
    343|               if (!fs.existsSync(filename) || fs.statSync(filename).si…
    344|                 throw new Error(`Missing shutdown receipt: ${filename}…
       |                       ^
    345|               }
    346|             }),
 ❯ test/scripts/vitest-worker-shutdown.test.ts:356:9
⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[6/25]⎯
 FAIL   tooling  test/scripts/vitest-worker-shutdown.test.ts > direct wrapper joins compilation work before honoring SIGINT
Error: Missing shutdown receipt: /home/runner/_work/_temp/ci-batch-work-44871298969-1-hosted-batch-004/shard-1-compact-small-30/.artifacts/worker proof-Ccc4HB/compiler-ready
 ❯ test/scripts/vitest-worker-shutdown.test.ts:344:23
    342|               // separate transports can deliver command completion fi…
    343|               if (!fs.existsSync(filename) || fs.statSync(filename).si…
    344|                 throw new Error(`Missing shutdown receipt: ${filename}…
       |                       ^
    345|               }
    346|             }),
 ❯ test/scripts/vitest-worker-shutdown.test.ts:356:9
⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[7/25]⎯
 FAIL   tooling  test/scripts/vitest-worker-shutdown.test.ts > direct wrapper joins compilation work before honoring SIGTERM
Error: Missing shutdown receipt: /home/runner/_work/_temp/ci-batch-work-44871298969-1-hosted-batch-004/shard-1-compact-small-30/.artifacts/worker proof-L4qObi/compiler-ready
 ❯ test/scripts/vitest-worker-shutdown.test.ts:344:23
```

### compact-small-30 :: tooling test/scripts/vitest-worker-shutdown.test.ts > direct wrapper joins compilation work before honoring SIGINT

```
Error: Missing shutdown receipt: /home/runner/_work/_temp/ci-batch-work-44871298969-1-hosted-batch-004/shard-1-compact-small-30/.artifacts/worker proof-Ccc4HB/compiler-ready
 ❯ test/scripts/vitest-worker-shutdown.test.ts:344:23
    342|               // separate transports can deliver command completion fi…
    343|               if (!fs.existsSync(filename) || fs.statSync(filename).si…
    344|                 throw new Error(`Missing shutdown receipt: ${filename}…
       |                       ^
    345|               }
    346|             }),
 ❯ test/scripts/vitest-worker-shutdown.test.ts:356:9
⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[7/25]⎯
 FAIL   tooling  test/scripts/vitest-worker-shutdown.test.ts > direct wrapper joins compilation work before honoring SIGTERM
Error: Missing shutdown receipt: /home/runner/_work/_temp/ci-batch-work-44871298969-1-hosted-batch-004/shard-1-compact-small-30/.artifacts/worker proof-L4qObi/compiler-ready
 ❯ test/scripts/vitest-worker-shutdown.test.ts:344:23
    342|               // separate transports can deliver command completion fi…
    343|               if (!fs.existsSync(filename) || fs.statSync(filename).si…
    344|                 throw new Error(`Missing shutdown receipt: ${filename}…
       |                       ^
    345|               }
    346|             }),
 ❯ test/scripts/vitest-worker-shutdown.test.ts:356:9
⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[8/25]⎯
 FAIL   tooling  test/scripts/vitest-worker-shutdown.test.ts > serial wrapper joins compilation work before honoring SIGINT
Error: Missing shutdown receipt: /home/runner/_work/_temp/ci-batch-work-44871298969-1-hosted-batch-004/shard-1-compact-small-30/.artifacts/worker proof-wD7KXe/compiler-ready
 ❯ test/scripts/vitest-worker-shutdown.test.ts:344:23
```

### compact-small-30 :: tooling test/scripts/vitest-worker-shutdown.test.ts > direct wrapper joins compilation work before honoring SIGTERM

```
Error: Missing shutdown receipt: /home/runner/_work/_temp/ci-batch-work-44871298969-1-hosted-batch-004/shard-1-compact-small-30/.artifacts/worker proof-L4qObi/compiler-ready
 ❯ test/scripts/vitest-worker-shutdown.test.ts:344:23
    342|               // separate transports can deliver command completion fi…
    343|               if (!fs.existsSync(filename) || fs.statSync(filename).si…
    344|                 throw new Error(`Missing shutdown receipt: ${filename}…
       |                       ^
    345|               }
    346|             }),
 ❯ test/scripts/vitest-worker-shutdown.test.ts:356:9
⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[8/25]⎯
 FAIL   tooling  test/scripts/vitest-worker-shutdown.test.ts > serial wrapper joins compilation work before honoring SIGINT
Error: Missing shutdown receipt: /home/runner/_work/_temp/ci-batch-work-44871298969-1-hosted-batch-004/shard-1-compact-small-30/.artifacts/worker proof-wD7KXe/compiler-ready
 ❯ test/scripts/vitest-worker-shutdown.test.ts:344:23
    342|               // separate transports can deliver command completion fi…
    343|               if (!fs.existsSync(filename) || fs.statSync(filename).si…
    344|                 throw new Error(`Missing shutdown receipt: ${filename}…
       |                       ^
    345|               }
    346|             }),
 ❯ test/scripts/vitest-worker-shutdown.test.ts:356:9
⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[9/25]⎯
 FAIL   tooling  test/scripts/vitest-worker-shutdown.test.ts > serial wrapper joins compilation work before honoring SIGTERM
Error: Missing shutdown receipt: /home/runner/_work/_temp/ci-batch-work-44871298969-1-hosted-batch-004/shard-1-compact-small-30/.artifacts/worker proof-GKEuil/compiler-ready
 ❯ test/scripts/vitest-worker-shutdown.test.ts:344:23
```

### compact-small-30 :: tooling test/scripts/vitest-worker-shutdown.test.ts > direct wrapper joins deletion work before honoring SIGINT

```
Error: Missing shutdown receipt: /home/runner/_work/_temp/ci-batch-work-44871298969-1-hosted-batch-004/shard-1-compact-small-30/.artifacts/worker proof-NVqsSO/verification-ready
 ❯ test/scripts/vitest-worker-shutdown.test.ts:344:23
    342|               // separate transports can deliver command completion fi…
    343|               if (!fs.existsSync(filename) || fs.statSync(filename).si…
    344|                 throw new Error(`Missing shutdown receipt: ${filename}…
       |                       ^
    345|               }
    346|             }),
 ❯ test/scripts/vitest-worker-shutdown.test.ts:356:9
⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[22/25]⎯
 FAIL   tooling  test/scripts/vitest-worker-shutdown.test.ts > direct wrapper joins deletion work before honoring SIGTERM
Error: Missing shutdown receipt: /home/runner/_work/_temp/ci-batch-work-44871298969-1-hosted-batch-004/shard-1-compact-small-30/.artifacts/worker proof-ZPK3ae/verification-ready
 ❯ test/scripts/vitest-worker-shutdown.test.ts:344:23
    342|               // separate transports can deliver command completion fi…
    343|               if (!fs.existsSync(filename) || fs.statSync(filename).si…
    344|                 throw new Error(`Missing shutdown receipt: ${filename}…
       |                       ^
    345|               }
    346|             }),
 ❯ test/scripts/vitest-worker-shutdown.test.ts:356:9
⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[23/25]⎯
 FAIL   tooling  test/scripts/vitest-worker-shutdown.test.ts > serial wrapper joins deletion work before honoring SIGINT
Error: Missing shutdown receipt: /home/runner/_work/_temp/ci-batch-work-44871298969-1-hosted-batch-004/shard-1-compact-small-30/.artifacts/worker proof-yiYJVq/verification-ready
 ❯ test/scripts/vitest-worker-shutdown.test.ts:344:23
```

### compact-small-30 :: tooling test/scripts/vitest-worker-shutdown.test.ts > direct wrapper joins deletion work before honoring SIGTERM

```
Error: Missing shutdown receipt: /home/runner/_work/_temp/ci-batch-work-44871298969-1-hosted-batch-004/shard-1-compact-small-30/.artifacts/worker proof-ZPK3ae/verification-ready
 ❯ test/scripts/vitest-worker-shutdown.test.ts:344:23
    342|               // separate transports can deliver command completion fi…
    343|               if (!fs.existsSync(filename) || fs.statSync(filename).si…
    344|                 throw new Error(`Missing shutdown receipt: ${filename}…
       |                       ^
    345|               }
    346|             }),
 ❯ test/scripts/vitest-worker-shutdown.test.ts:356:9
⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[23/25]⎯
 FAIL   tooling  test/scripts/vitest-worker-shutdown.test.ts > serial wrapper joins deletion work before honoring SIGINT
Error: Missing shutdown receipt: /home/runner/_work/_temp/ci-batch-work-44871298969-1-hosted-batch-004/shard-1-compact-small-30/.artifacts/worker proof-yiYJVq/verification-ready
 ❯ test/scripts/vitest-worker-shutdown.test.ts:344:23
    342|               // separate transports can deliver command completion fi…
    343|               if (!fs.existsSync(filename) || fs.statSync(filename).si…
    344|                 throw new Error(`Missing shutdown receipt: ${filename}…
       |                       ^
    345|               }
    346|             }),
 ❯ test/scripts/vitest-worker-shutdown.test.ts:356:9
⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[24/25]⎯
 FAIL   tooling  test/scripts/vitest-worker-shutdown.test.ts > serial wrapper joins deletion work before honoring SIGTERM
Error: Missing shutdown receipt: /home/runner/_work/_temp/ci-batch-work-44871298969-1-hosted-batch-004/shard-1-compact-small-30/.artifacts/worker proof-NINHM1/verification-ready
 ❯ test/scripts/vitest-worker-shutdown.test.ts:344:23
```

### compact-small-30 :: tooling test/scripts/vitest-worker-shutdown.test.ts > direct wrapper joins disposal work before honoring SIGINT

```
Error: Missing shutdown receipt: /home/runner/_work/_temp/ci-batch-work-44871298969-1-hosted-batch-004/shard-1-compact-small-30/.artifacts/worker proof-AF9L1q/verification-ready
 ❯ test/scripts/vitest-worker-shutdown.test.ts:344:23
    342|               // separate transports can deliver command completion fi…
    343|               if (!fs.existsSync(filename) || fs.statSync(filename).si…
    344|                 throw new Error(`Missing shutdown receipt: ${filename}…
       |                       ^
    345|               }
    346|             }),
 ❯ test/scripts/vitest-worker-shutdown.test.ts:356:9
⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/25]⎯
 FAIL   tooling  test/scripts/vitest-worker-shutdown.test.ts > direct wrapper joins disposal work before honoring SIGTERM
Error: Missing shutdown receipt: /home/runner/_work/_temp/ci-batch-work-44871298969-1-hosted-batch-004/shard-1-compact-small-30/.artifacts/worker proof-y1acCp/verification-ready
 ❯ test/scripts/vitest-worker-shutdown.test.ts:344:23
    342|               // separate transports can deliver command completion fi…
    343|               if (!fs.existsSync(filename) || fs.statSync(filename).si…
    344|                 throw new Error(`Missing shutdown receipt: ${filename}…
       |                       ^
    345|               }
    346|             }),
 ❯ test/scripts/vitest-worker-shutdown.test.ts:356:9
⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[2/25]⎯
 FAIL   tooling  test/scripts/vitest-worker-shutdown.test.ts > serial wrapper joins disposal work before honoring SIGINT
Error: Missing shutdown receipt: /home/runner/_work/_temp/ci-batch-work-44871298969-1-hosted-batch-004/shard-1-compact-small-30/.artifacts/worker proof-nex8yT/verification-ready
 ❯ test/scripts/vitest-worker-shutdown.test.ts:344:23
```

### compact-small-30 :: tooling test/scripts/vitest-worker-shutdown.test.ts > direct wrapper joins disposal work before honoring SIGTERM

```
Error: Missing shutdown receipt: /home/runner/_work/_temp/ci-batch-work-44871298969-1-hosted-batch-004/shard-1-compact-small-30/.artifacts/worker proof-y1acCp/verification-ready
 ❯ test/scripts/vitest-worker-shutdown.test.ts:344:23
    342|               // separate transports can deliver command completion fi…
    343|               if (!fs.existsSync(filename) || fs.statSync(filename).si…
    344|                 throw new Error(`Missing shutdown receipt: ${filename}…
       |                       ^
    345|               }
    346|             }),
 ❯ test/scripts/vitest-worker-shutdown.test.ts:356:9
⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[2/25]⎯
 FAIL   tooling  test/scripts/vitest-worker-shutdown.test.ts > serial wrapper joins disposal work before honoring SIGINT
Error: Missing shutdown receipt: /home/runner/_work/_temp/ci-batch-work-44871298969-1-hosted-batch-004/shard-1-compact-small-30/.artifacts/worker proof-nex8yT/verification-ready
 ❯ test/scripts/vitest-worker-shutdown.test.ts:344:23
    342|               // separate transports can deliver command completion fi…
    343|               if (!fs.existsSync(filename) || fs.statSync(filename).si…
    344|                 throw new Error(`Missing shutdown receipt: ${filename}…
       |                       ^
    345|               }
    346|             }),
 ❯ test/scripts/vitest-worker-shutdown.test.ts:356:9
⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[3/25]⎯
 FAIL   tooling  test/scripts/vitest-worker-shutdown.test.ts > serial wrapper joins disposal work before honoring SIGTERM
Error: Missing shutdown receipt: /home/runner/_work/_temp/ci-batch-work-44871298969-1-hosted-batch-004/shard-1-compact-small-30/.artifacts/worker proof-pCEwHf/verification-ready
 ❯ test/scripts/vitest-worker-shutdown.test.ts:344:23
```

### compact-small-30 :: tooling test/scripts/vitest-worker-shutdown.test.ts > serial wrapper joins compilation work before honoring SIGINT

```
Error: Missing shutdown receipt: /home/runner/_work/_temp/ci-batch-work-44871298969-1-hosted-batch-004/shard-1-compact-small-30/.artifacts/worker proof-wD7KXe/compiler-ready
 ❯ test/scripts/vitest-worker-shutdown.test.ts:344:23
    342|               // separate transports can deliver command completion fi…
    343|               if (!fs.existsSync(filename) || fs.statSync(filename).si…
    344|                 throw new Error(`Missing shutdown receipt: ${filename}…
       |                       ^
    345|               }
    346|             }),
 ❯ test/scripts/vitest-worker-shutdown.test.ts:356:9
⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[9/25]⎯
 FAIL   tooling  test/scripts/vitest-worker-shutdown.test.ts > serial wrapper joins compilation work before honoring SIGTERM
Error: Missing shutdown receipt: /home/runner/_work/_temp/ci-batch-work-44871298969-1-hosted-batch-004/shard-1-compact-small-30/.artifacts/worker proof-GKEuil/compiler-ready
 ❯ test/scripts/vitest-worker-shutdown.test.ts:344:23
    342|               // separate transports can deliver command completion fi…
    343|               if (!fs.existsSync(filename) || fs.statSync(filename).si…
    344|                 throw new Error(`Missing shutdown receipt: ${filename}…
       |                       ^
    345|               }
    346|             }),
 ❯ test/scripts/vitest-worker-shutdown.test.ts:356:9
⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[10/25]⎯
 FAIL   tooling  test/scripts/vitest-worker-shutdown.test.ts > ci wrapper joins compilation work before honoring SIGINT
Error: Missing shutdown receipt: /home/runner/_work/_temp/ci-batch-work-44871298969-1-hosted-batch-004/shard-1-compact-small-30/.artifacts/worker proof-8Nsm8W/compiler-ready
 ❯ test/scripts/vitest-worker-shutdown.test.ts:344:23
```

### compact-small-30 :: tooling test/scripts/vitest-worker-shutdown.test.ts > serial wrapper joins compilation work before honoring SIGTERM

```
Error: Missing shutdown receipt: /home/runner/_work/_temp/ci-batch-work-44871298969-1-hosted-batch-004/shard-1-compact-small-30/.artifacts/worker proof-GKEuil/compiler-ready
 ❯ test/scripts/vitest-worker-shutdown.test.ts:344:23
    342|               // separate transports can deliver command completion fi…
    343|               if (!fs.existsSync(filename) || fs.statSync(filename).si…
    344|                 throw new Error(`Missing shutdown receipt: ${filename}…
       |                       ^
    345|               }
    346|             }),
 ❯ test/scripts/vitest-worker-shutdown.test.ts:356:9
⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[10/25]⎯
 FAIL   tooling  test/scripts/vitest-worker-shutdown.test.ts > ci wrapper joins compilation work before honoring SIGINT
Error: Missing shutdown receipt: /home/runner/_work/_temp/ci-batch-work-44871298969-1-hosted-batch-004/shard-1-compact-small-30/.artifacts/worker proof-8Nsm8W/compiler-ready
 ❯ test/scripts/vitest-worker-shutdown.test.ts:344:23
    342|               // separate transports can deliver command completion fi…
    343|               if (!fs.existsSync(filename) || fs.statSync(filename).si…
    344|                 throw new Error(`Missing shutdown receipt: ${filename}…
       |                       ^
    345|               }
    346|             }),
 ❯ test/scripts/vitest-worker-shutdown.test.ts:356:9
⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[11/25]⎯
 FAIL   tooling  test/scripts/vitest-worker-shutdown.test.ts > ci wrapper joins compilation work before honoring SIGTERM
Error: Missing shutdown receipt: /home/runner/_work/_temp/ci-batch-work-44871298969-1-hosted-batch-004/shard-1-compact-small-30/.artifacts/worker proof-sCxfEL/compiler-ready
 ❯ test/scripts/vitest-worker-shutdown.test.ts:344:23
```

### compact-small-30 :: tooling test/scripts/vitest-worker-shutdown.test.ts > serial wrapper joins deletion work before honoring SIGINT

```
Error: Missing shutdown receipt: /home/runner/_work/_temp/ci-batch-work-44871298969-1-hosted-batch-004/shard-1-compact-small-30/.artifacts/worker proof-yiYJVq/verification-ready
 ❯ test/scripts/vitest-worker-shutdown.test.ts:344:23
    342|               // separate transports can deliver command completion fi…
    343|               if (!fs.existsSync(filename) || fs.statSync(filename).si…
    344|                 throw new Error(`Missing shutdown receipt: ${filename}…
       |                       ^
    345|               }
    346|             }),
 ❯ test/scripts/vitest-worker-shutdown.test.ts:356:9
⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[24/25]⎯
 FAIL   tooling  test/scripts/vitest-worker-shutdown.test.ts > serial wrapper joins deletion work before honoring SIGTERM
Error: Missing shutdown receipt: /home/runner/_work/_temp/ci-batch-work-44871298969-1-hosted-batch-004/shard-1-compact-small-30/.artifacts/worker proof-NINHM1/verification-ready
 ❯ test/scripts/vitest-worker-shutdown.test.ts:344:23
    342|               // separate transports can deliver command completion fi…
    343|               if (!fs.existsSync(filename) || fs.statSync(filename).si…
    344|                 throw new Error(`Missing shutdown receipt: ${filename}…
       |                       ^
    345|               }
    346|             }),
 ❯ test/scripts/vitest-worker-shutdown.test.ts:356:9
⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[25/25]⎯
 Test Files  1 failed | 5 passed (6)
      Tests  25 failed | 169 passed (194)
   Start at  05:43:54
```

### compact-small-30 :: tooling test/scripts/vitest-worker-shutdown.test.ts > serial wrapper joins deletion work before honoring SIGTERM

```
Error: Missing shutdown receipt: /home/runner/_work/_temp/ci-batch-work-44871298969-1-hosted-batch-004/shard-1-compact-small-30/.artifacts/worker proof-NINHM1/verification-ready
 ❯ test/scripts/vitest-worker-shutdown.test.ts:344:23
    342|               // separate transports can deliver command completion fi…
    343|               if (!fs.existsSync(filename) || fs.statSync(filename).si…
    344|                 throw new Error(`Missing shutdown receipt: ${filename}…
       |                       ^
    345|               }
    346|             }),
 ❯ test/scripts/vitest-worker-shutdown.test.ts:356:9
⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[25/25]⎯
 Test Files  1 failed | 5 passed (6)
      Tests  25 failed | 169 passed (194)
   Start at  05:43:54
   Duration  63.67s (tests 89%, transform 8%, import 2%, worker 1%)
⎯⎯⎯⎯⎯⎯ Failed Tests 25 ⎯⎯⎯⎯⎯⎯⎯
 FAIL   tooling  test/scripts/vitest-worker-shutdown.test.ts > direct wrapper joins disposal work before honoring SIGINT
Error: Missing shutdown receipt: /home/runner/_work/_temp/ci-batch-work-44871298969-1-hosted-batch-004/shard-1-compact-small-30/.artifacts/worker proof-AF9L1q/verification-ready
 ❯ test/scripts/vitest-worker-shutdown.test.ts:344:23
    342|               // separate transports can deliver command completion fi…
    343|               if (!fs.existsSync(filename) || fs.statSync(filename).si…
    344|                 throw new Error(`Missing shutdown receipt: ${filename}…
       |                       ^
    345|               }
    346|             }),
```

### compact-small-30 :: tooling test/scripts/vitest-worker-shutdown.test.ts > serial wrapper joins disposal work before honoring SIGINT

```
Error: Missing shutdown receipt: /home/runner/_work/_temp/ci-batch-work-44871298969-1-hosted-batch-004/shard-1-compact-small-30/.artifacts/worker proof-nex8yT/verification-ready
 ❯ test/scripts/vitest-worker-shutdown.test.ts:344:23
    342|               // separate transports can deliver command completion fi…
    343|               if (!fs.existsSync(filename) || fs.statSync(filename).si…
    344|                 throw new Error(`Missing shutdown receipt: ${filename}…
       |                       ^
    345|               }
    346|             }),
 ❯ test/scripts/vitest-worker-shutdown.test.ts:356:9
⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[3/25]⎯
 FAIL   tooling  test/scripts/vitest-worker-shutdown.test.ts > serial wrapper joins disposal work before honoring SIGTERM
Error: Missing shutdown receipt: /home/runner/_work/_temp/ci-batch-work-44871298969-1-hosted-batch-004/shard-1-compact-small-30/.artifacts/worker proof-pCEwHf/verification-ready
 ❯ test/scripts/vitest-worker-shutdown.test.ts:344:23
    342|               // separate transports can deliver command completion fi…
    343|               if (!fs.existsSync(filename) || fs.statSync(filename).si…
    344|                 throw new Error(`Missing shutdown receipt: ${filename}…
       |                       ^
    345|               }
    346|             }),
 ❯ test/scripts/vitest-worker-shutdown.test.ts:356:9
⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[4/25]⎯
 FAIL   tooling  test/scripts/vitest-worker-shutdown.test.ts > direct wrapper joins admission work before honoring SIGINT
Error: Missing shutdown receipt: /home/runner/_work/_temp/ci-batch-work-44871298969-1-hosted-batch-004/shard-1-compact-small-30/.artifacts/worker proof-TQUprC/verification-ready
 ❯ test/scripts/vitest-worker-shutdown.test.ts:344:23
```

### compact-small-30 :: tooling test/scripts/vitest-worker-shutdown.test.ts > serial wrapper joins disposal work before honoring SIGTERM

```
Error: Missing shutdown receipt: /home/runner/_work/_temp/ci-batch-work-44871298969-1-hosted-batch-004/shard-1-compact-small-30/.artifacts/worker proof-pCEwHf/verification-ready
 ❯ test/scripts/vitest-worker-shutdown.test.ts:344:23
    342|               // separate transports can deliver command completion fi…
    343|               if (!fs.existsSync(filename) || fs.statSync(filename).si…
    344|                 throw new Error(`Missing shutdown receipt: ${filename}…
       |                       ^
    345|               }
    346|             }),
 ❯ test/scripts/vitest-worker-shutdown.test.ts:356:9
⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[4/25]⎯
 FAIL   tooling  test/scripts/vitest-worker-shutdown.test.ts > direct wrapper joins admission work before honoring SIGINT
Error: Missing shutdown receipt: /home/runner/_work/_temp/ci-batch-work-44871298969-1-hosted-batch-004/shard-1-compact-small-30/.artifacts/worker proof-TQUprC/verification-ready
 ❯ test/scripts/vitest-worker-shutdown.test.ts:344:23
    342|               // separate transports can deliver command completion fi…
    343|               if (!fs.existsSync(filename) || fs.statSync(filename).si…
    344|                 throw new Error(`Missing shutdown receipt: ${filename}…
       |                       ^
    345|               }
    346|             }),
 ❯ test/scripts/vitest-worker-shutdown.test.ts:356:9
⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[5/25]⎯
 FAIL   tooling  test/scripts/vitest-worker-shutdown.test.ts > direct wrapper joins admission work before honoring SIGTERM
Error: Missing shutdown receipt: /home/runner/_work/_temp/ci-batch-work-44871298969-1-hosted-batch-004/shard-1-compact-small-30/.artifacts/worker proof-dzvhcj/verification-ready
 ❯ test/scripts/vitest-worker-shutdown.test.ts:344:23
```

### compact-small-33 :: tooling test/helpers/openclaw-test-instance.test.ts > openclaw test instance > keeps claimed port offset 0 unavailable while its child starts

```
 FAIL   tooling  test/helpers/openclaw-test-instance.test.ts > openclaw test instance > keeps claimed port offset 1 unavailable while its child starts
AssertionError: expected { reserved: true } to deeply equal { reserved: false, …(2) }
- Expected
+ Received
  {
-   "causeCode": "file_lock_timeout",
-   "code": "EADDRINUSE",
-   "reserved": false,
+   "reserved": true,
  }
 ❯ test/helpers/openclaw-test-instance.test.ts:1045:46
    1043|           });
    1044|         }
    1045|         expect(await reserveInProcessPort()).toEqual({
       |                                              ^
    1046|           reserved: false,
    1047|           code: "EADDRINUSE",
⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/2]⎯
 Test Files  1 failed | 6 passed (7)
      Tests  2 failed | 349 passed (351)
   Start at  07:37:36
   Duration  59.41s (tests 96%, transform 2%, import 1%, worker 1%)
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 2 ⎯⎯⎯⎯⎯⎯⎯
 FAIL   tooling  test/helpers/openclaw-test-instance.test.ts > openclaw test instance > keeps claimed port offset 0 unavailable while its child starts
```

### compact-small-33 :: tooling test/helpers/openclaw-test-instance.test.ts > openclaw test instance > keeps claimed port offset 1 unavailable while its child starts

```
AssertionError: expected { reserved: true } to deeply equal { reserved: false, …(2) }
- Expected
+ Received
  {
-   "causeCode": "file_lock_timeout",
-   "code": "EADDRINUSE",
-   "reserved": false,
+   "reserved": true,
  }
 ❯ test/helpers/openclaw-test-instance.test.ts:1045:46
    1043|           });
    1044|         }
    1045|         expect(await reserveInProcessPort()).toEqual({
       |                                              ^
    1046|           reserved: false,
    1047|           code: "EADDRINUSE",
⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/2]⎯
 Test Files  1 failed | 6 passed (7)
      Tests  2 failed | 349 passed (351)
   Start at  07:37:36
   Duration  59.41s (tests 96%, transform 2%, import 1%, worker 1%)
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 2 ⎯⎯⎯⎯⎯⎯⎯
 FAIL   tooling  test/helpers/openclaw-test-instance.test.ts > openclaw test instance > keeps claimed port offset 0 unavailable while its child starts
 FAIL   tooling  test/helpers/openclaw-test-instance.test.ts > openclaw test instance > keeps claimed port offset 1 unavailable while its child starts
```

### compact-small-36 :: tooling test/scripts/bun-standalone-codegen.test.ts > standalone fixed code generation > captures remaining static programs (//!)

```
Error: [openclaw] CI job core-tooling-1-hosted-3: Bun revision verification failed: spawnSync bun ENOENT. Run .github/actions/setup-test-bun before tests.
 ❯ requirePinnedBun scripts/lib/pinned-bun.mts:189:13
    187|       }
    188|     } catch (error) {
    189|       throw new Error(
       |             ^
    190|         `[openclaw] ${ciJob}Bun revision verification failed: ${error …
    191|         { cause: error },
 ❯ test/scripts/bun-standalone-codegen.test.ts:82:32
Caused by: Error: spawnSync bun ENOENT
 ❯ requirePinnedBun scripts/lib/pinned-bun.mts:180:24
 ❯ test/scripts/bun-standalone-codegen.test.ts:82:32
⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯
Serialized Error: { errno: -2, code: 'ENOENT', syscall: 'spawnSync bun', path: 'bun', spawnargs: [ '--revision' ], error: { stack: 'Error: spawnSync bun ENOENT
    at Object.spawnSync (node:internal/child_process:1175:20)
    at spawnSync (node:child_process:976:24)
    at execFileSync (node:child_process:1019:15)
    at requirePinnedBun (/home/runner/_work/_temp/ci-batch-work-44871298969-1-hosted-batch-006/shard-1-compact-small-36/scripts/lib/pinned-bun.mts:180:24)
    at /home/runner/_work/_temp/ci-batch-work-44871298969-1-hosted-batch-006/shard-1-compact-small-36/test/scripts/bun-standalone-codegen.test.ts:82:32
    at file:///home/runner/_work/_temp/ci-batch-work-44871298969-1-hosted-batch-006/shard-1-compact-small-36/node_modules/.pnpm/vitest@5.0.5_patch_hash=a2a78abe9470cc2ceb0d4eeb81acfc62d6180e9990bc866a7771ba60b1320ea_75661d0a5892d48edf76140ec77ed19d/node_modules/vitest/dist/chunks/run.BPv-BBRv.js:2886:64
    at file:///home/runner/_work/_temp/ci-batch-work-44871298969-1-hosted-batch-006/shard-1-compact-small-36/node_modules/.pnpm/vitest@5.0.5_patch_hash=a2a78abe9470cc2ceb0d4eeb81acfc62d6180e9990bc866a7771ba60b1320ea_75661d0a5892d48edf76140ec77ed19d/node_modules/vitest/dist/chunks/run.BPv-BBRv.js:1632:35
    at file:///home/runner/_work/_temp/ci-batch-work-44871298969-1-hosted-batch-006/shard-1-compact-small-36/node_modules/.pnpm/vitest@5.0.5_patch_hash=a2a78abe9470cc2ceb0d4eeb81acfc62d6180e9990bc866a7771ba60b1320ea_75661d0a5892d48edf76140ec77ed19d/node_modules/vitest/dist/chunks/run.BPv-BBRv.js:2801:26
    at file:///home/runner/_work/_temp/ci-batch-work-44871298969-1-hosted-batch-006/shard-1-compact-small-36/node_modules/.pnpm/vitest@5.0.5_patch_hash=a2a78abe9470cc2ceb0d4eeb81acfc62d6180e9990bc866a7771ba60b1320ea_75661d0a5892d48edf76140ec77ed19d/node_modules/vitest/dist/chunks/run.BPv-BBRv.js:3338:20
    at new Promise (<anonymous>)', message: 'spawnSync bun ENOENT', errno: -2, code: 'ENOENT', syscall: 'spawnSync bun', path: 'bun', spawnargs: [ '--revision' ], error: [Circular], status: null, signal: null, output: null, pid: 0, stdout: undefined, stderr: undefined, constructor: 'Function<Error>', name: 'Caused by: Error', toString: 'Function<toString>', stacks: [ { method: 'requirePinnedBun', file: '/home/runner/_work/_temp/ci-batch-work-44871298969-1-hosted-batch-006/shard-1-compact-small-36/scripts/lib/pinned-bun.mts', line: 180, column: 24 }, { method: '', file: '/home/runner/_work/_temp/ci-batch-work-44871298969-1-hosted-batch-006/shard-1-compact-small-36/test/scripts/bun-standalone-codegen.test.ts', line: 82, column: 32 } ] }, status: null, signal: null, output: null, pid: 0, stdout: undefined, stderr: undefined }
```

### compact-small-36 :: tooling test/scripts/bun-standalone-codegen.test.ts > standalone fixed code generation > captures remaining static programs (//#region)

```
 FAIL   tooling  test/scripts/bun-standalone-codegen.test.ts > standalone fixed code generation > captures remaining static programs (//)
 FAIL   tooling  test/scripts/bun-standalone-codegen.test.ts > standalone fixed code generation > captures remaining static programs (//!)
Error: [openclaw] CI job core-tooling-1-hosted-3: Bun revision verification failed: spawnSync bun ENOENT. Run .github/actions/setup-test-bun before tests.
 ❯ requirePinnedBun scripts/lib/pinned-bun.mts:189:13
    187|       }
    188|     } catch (error) {
    189|       throw new Error(
       |             ^
    190|         `[openclaw] ${ciJob}Bun revision verification failed: ${error …
    191|         { cause: error },
 ❯ test/scripts/bun-standalone-codegen.test.ts:82:32
Caused by: Error: spawnSync bun ENOENT
 ❯ requirePinnedBun scripts/lib/pinned-bun.mts:180:24
 ❯ test/scripts/bun-standalone-codegen.test.ts:82:32
⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯
Serialized Error: { errno: -2, code: 'ENOENT', syscall: 'spawnSync bun', path: 'bun', spawnargs: [ '--revision' ], error: { stack: 'Error: spawnSync bun ENOENT
    at Object.spawnSync (node:internal/child_process:1175:20)
    at spawnSync (node:child_process:976:24)
    at execFileSync (node:child_process:1019:15)
    at requirePinnedBun (/home/runner/_work/_temp/ci-batch-work-44871298969-1-hosted-batch-006/shard-1-compact-small-36/scripts/lib/pinned-bun.mts:180:24)
    at /home/runner/_work/_temp/ci-batch-work-44871298969-1-hosted-batch-006/shard-1-compact-small-36/test/scripts/bun-standalone-codegen.test.ts:82:32
    at file:///home/runner/_work/_temp/ci-batch-work-44871298969-1-hosted-batch-006/shard-1-compact-small-36/node_modules/.pnpm/vitest@5.0.5_patch_hash=a2a78abe9470cc2ceb0d4eeb81acfc62d6180e9990bc866a7771ba60b1320ea_75661d0a5892d48edf76140ec77ed19d/node_modules/vitest/dist/chunks/run.BPv-BBRv.js:2886:64
    at file:///home/runner/_work/_temp/ci-batch-work-44871298969-1-hosted-batch-006/shard-1-compact-small-36/node_modules/.pnpm/vitest@5.0.5_patch_hash=a2a78abe9470cc2ceb0d4eeb81acfc62d6180e9990bc866a7771ba60b1320ea_75661d0a5892d48edf76140ec77ed19d/node_modules/vitest/dist/chunks/run.BPv-BBRv.js:1632:35
    at file:///home/runner/_work/_temp/ci-batch-work-44871298969-1-hosted-batch-006/shard-1-compact-small-36/node_modules/.pnpm/vitest@5.0.5_patch_hash=a2a78abe9470cc2ceb0d4eeb81acfc62d6180e9990bc866a7771ba60b1320ea_75661d0a5892d48edf76140ec77ed19d/node_modules/vitest/dist/chunks/run.BPv-BBRv.js:2801:26
```

### compact-small-36 :: tooling test/scripts/bun-standalone-codegen.test.ts > standalone fixed code generation > captures remaining static programs (//)

```
 FAIL   tooling  test/scripts/bun-standalone-codegen.test.ts > standalone fixed code generation > captures remaining static programs (//!)
Error: [openclaw] CI job core-tooling-1-hosted-3: Bun revision verification failed: spawnSync bun ENOENT. Run .github/actions/setup-test-bun before tests.
 ❯ requirePinnedBun scripts/lib/pinned-bun.mts:189:13
    187|       }
    188|     } catch (error) {
    189|       throw new Error(
       |             ^
    190|         `[openclaw] ${ciJob}Bun revision verification failed: ${error …
    191|         { cause: error },
 ❯ test/scripts/bun-standalone-codegen.test.ts:82:32
Caused by: Error: spawnSync bun ENOENT
 ❯ requirePinnedBun scripts/lib/pinned-bun.mts:180:24
 ❯ test/scripts/bun-standalone-codegen.test.ts:82:32
⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯
Serialized Error: { errno: -2, code: 'ENOENT', syscall: 'spawnSync bun', path: 'bun', spawnargs: [ '--revision' ], error: { stack: 'Error: spawnSync bun ENOENT
    at Object.spawnSync (node:internal/child_process:1175:20)
    at spawnSync (node:child_process:976:24)
    at execFileSync (node:child_process:1019:15)
    at requirePinnedBun (/home/runner/_work/_temp/ci-batch-work-44871298969-1-hosted-batch-006/shard-1-compact-small-36/scripts/lib/pinned-bun.mts:180:24)
    at /home/runner/_work/_temp/ci-batch-work-44871298969-1-hosted-batch-006/shard-1-compact-small-36/test/scripts/bun-standalone-codegen.test.ts:82:32
    at file:///home/runner/_work/_temp/ci-batch-work-44871298969-1-hosted-batch-006/shard-1-compact-small-36/node_modules/.pnpm/vitest@5.0.5_patch_hash=a2a78abe9470cc2ceb0d4eeb81acfc62d6180e9990bc866a7771ba60b1320ea_75661d0a5892d48edf76140ec77ed19d/node_modules/vitest/dist/chunks/run.BPv-BBRv.js:2886:64
    at file:///home/runner/_work/_temp/ci-batch-work-44871298969-1-hosted-batch-006/shard-1-compact-small-36/node_modules/.pnpm/vitest@5.0.5_patch_hash=a2a78abe9470cc2ceb0d4eeb81acfc62d6180e9990bc866a7771ba60b1320ea_75661d0a5892d48edf76140ec77ed19d/node_modules/vitest/dist/chunks/run.BPv-BBRv.js:1632:35
    at file:///home/runner/_work/_temp/ci-batch-work-44871298969-1-hosted-batch-006/shard-1-compact-small-36/node_modules/.pnpm/vitest@5.0.5_patch_hash=a2a78abe9470cc2ceb0d4eeb81acfc62d6180e9990bc866a7771ba60b1320ea_75661d0a5892d48edf76140ec77ed19d/node_modules/vitest/dist/chunks/run.BPv-BBRv.js:2801:26
    at file:///home/runner/_work/_temp/ci-batch-work-44871298969-1-hosted-batch-006/shard-1-compact-small-36/node_modules/.pnpm/vitest@5.0.5_patch_hash=a2a78abe9470cc2ceb0d4eeb81acfc62d6180e9990bc866a7771ba60b1320ea_75661d0a5892d48edf76140ec77ed19d/node_modules/vitest/dist/chunks/run.BPv-BBRv.js:3338:20
```

### compact-small-40 :: tooling test/scripts-update-gateway-legacy.test.ts > published source shell reaches candidate build entry: begin-abort

```
AssertionError: From /tmp/oc4c2671/.oc-ci-tmp/sMVl/t/oc-vt-oF5NFB/oc-vt-OFM4Qo/openclaw-legacy-source-template-G8XiIu/seed
 * branch            main       -> FETCH_HEAD
   83abdd7..0fd79df  main       -> origin/main
[update-gateway] stopping gateway before replacing hashed build chunks
/home/runner/_work/_temp/ci-batch-work-44871298969-1-hosted-batch-009/shard-2-compact-small-40/scripts/lib/source-update-build.mts:423
        ? new AggregateError([failure.error, error], "Source build and native settlement failed", {
          ^
AggregateError: Source build and native settlement failed
    at <anonymous> (/home/runner/_work/_temp/ci-batch-work-44871298969-1-hosted-batch-009/shard-2-compact-small-40/scripts/lib/source-update-build.mts:423:11)
    at async withDistArtifactOwnership (/home/runner/_work/_temp/ci-batch-work-44871298969-1-hosted-batch-009/shard-2-compact-small-40/scripts/lib/dist-artifact-lock.mts:213:12)
    ... 2 lines matching cause stack trace ...
    at async <anonymous> (/home/runner/_work/_temp/ci-batch-work-44871298969-1-hosted-batch-009/shard-2-compact-small-40/scripts/build-all.mts:747:24) {
  [cause]: Error: Source update interrupted; successful restart remains unconfirmed.
      at assertUninterrupted (/home/runner/_work/_temp/ci-batch-work-44871298969-1-hosted-batch-009/shard-2-compact-small-40/scripts/lib/source-update-build.mts:86:13)
      at Object.settle (/home/runner/_work/_temp/ci-batch-work-44871298969-1-hosted-batch-009/shard-2-compact-small-40/scripts/lib/source-update-build.mts:229:11)
      at async settle (/home/runner/_work/_temp/ci-batch-work-44871298969-1-hosted-batch-009/shard-2-compact-small-40/scripts/lib/source-update-build.mts:260:7)
      at async <anonymous> (/home/runner/_work/_temp/ci-batch-work-44871298969-1-hosted-batch-009/shard-2-compact-small-40/scripts/lib/source-update-build.mts:418:9)
      at async withDistArtifactOwnership (/home/runner/_work/_temp/ci-batch-work-44871298969-1-hosted-batch-009/shard-2-compact-small-40/scripts/lib/dist-artifact-lock.mts:213:12)
      at async runSourceUpdateBuild (/home/runner/_work/_temp/ci-batch-work-44871298969-1-hosted-batch-009/shard-2-compact-small-40/scripts/lib/source-update-build.mts:255:10)
      at async runLegacySourceUpdateBuild (/home/runner/_work/_temp/ci-batch-work-44871298969-1-hosted-batch-009/shard-2-compact-small-40/scripts/lib/source-update-build.mts:119:10)
      at async <anonymous> (/home/runner/_work/_temp/ci-batch-work-44871298969-1-hosted-batch-009/shard-2-compact-small-40/scripts/build-all.mts:747:24),
  [errors]: [
    AggregateError: Source build admission and original-runtime recovery failed.
        at <anonymous> (/home/runner/_work/_temp/ci-batch-work-44871298969-1-hosted-batch-009/shard-2-compact-small-40/scripts/lib/source-update-build.mts:285:19)
```

### compact-small-40 :: tooling test/scripts-update-gateway-legacy.test.ts > published source shell reaches candidate build entry: begin-unjoined

```
AssertionError: From /tmp/oc4c2671/.oc-ci-tmp/sMVl/t/oc-vt-oF5NFB/oc-vt-OFM4Qo/openclaw-legacy-source-template-G8XiIu/seed
 * branch            main       -> FETCH_HEAD
   83abdd7..0fd79df  main       -> origin/main
[update-gateway] stopping gateway before replacing hashed build chunks
/home/runner/_work/_temp/ci-batch-work-44871298969-1-hosted-batch-009/shard-2-compact-small-40/scripts/lib/source-update-build.mts:423
        ? new AggregateError([failure.error, error], "Source build and native settlement failed", {
          ^
AggregateError: Source build and native settlement failed
    at <anonymous> (/home/runner/_work/_temp/ci-batch-work-44871298969-1-hosted-batch-009/shard-2-compact-small-40/scripts/lib/source-update-build.mts:423:11)
    at async withDistArtifactOwnership (/home/runner/_work/_temp/ci-batch-work-44871298969-1-hosted-batch-009/shard-2-compact-small-40/scripts/lib/dist-artifact-lock.mts:213:12)
    ... 2 lines matching cause stack trace ...
    at async <anonymous> (/home/runner/_work/_temp/ci-batch-work-44871298969-1-hosted-batch-009/shard-2-compact-small-40/scripts/build-all.mts:747:24) {
  [cause]: Error: Source update interrupted; successful restart remains unconfirmed.
      at assertUninterrupted (/home/runner/_work/_temp/ci-batch-work-44871298969-1-hosted-batch-009/shard-2-compact-small-40/scripts/lib/source-update-build.mts:86:13)
      at Object.settle (/home/runner/_work/_temp/ci-batch-work-44871298969-1-hosted-batch-009/shard-2-compact-small-40/scripts/lib/source-update-build.mts:229:11)
      at async settle (/home/runner/_work/_temp/ci-batch-work-44871298969-1-hosted-batch-009/shard-2-compact-small-40/scripts/lib/source-update-build.mts:260:7)
      at async <anonymous> (/home/runner/_work/_temp/ci-batch-work-44871298969-1-hosted-batch-009/shard-2-compact-small-40/scripts/lib/source-update-build.mts:418:9)
      at async withDistArtifactOwnership (/home/runner/_work/_temp/ci-batch-work-44871298969-1-hosted-batch-009/shard-2-compact-small-40/scripts/lib/dist-artifact-lock.mts:213:12)
      at async runSourceUpdateBuild (/home/runner/_work/_temp/ci-batch-work-44871298969-1-hosted-batch-009/shard-2-compact-small-40/scripts/lib/source-update-build.mts:255:10)
      at async runLegacySourceUpdateBuild (/home/runner/_work/_temp/ci-batch-work-44871298969-1-hosted-batch-009/shard-2-compact-small-40/scripts/lib/source-update-build.mts:119:10)
      at async <anonymous> (/home/runner/_work/_temp/ci-batch-work-44871298969-1-hosted-batch-009/shard-2-compact-small-40/scripts/build-all.mts:747:24),
  [errors]: [
    AggregateError: Source build admission and original-runtime recovery failed.
        at <anonymous> (/home/runner/_work/_temp/ci-batch-work-44871298969-1-hosted-batch-009/shard-2-compact-small-40/scripts/lib/source-update-build.mts:285:19)
```

### compact-small-40 :: tooling test/scripts-update-gateway-legacy.test.ts > published source shell reaches candidate build entry: build-throw-restart

```
AssertionError: expected 'From /tmp/oc4c2671/.oc-ci-tmp/sMVl/t/…' to contain 'fixture native restart failed'
- Expected
+ Received
- fixture native restart failed
+ From /tmp/oc4c2671/.oc-ci-tmp/sMVl/t/oc-vt-oF5NFB/oc-vt-OFM4Qo/openclaw-legacy-source-template-G8XiIu/seed
+  * branch            main       -> FETCH_HEAD
+    83abdd7..0fd79df  main       -> origin/main
+ [update-gateway] stopping gateway before replacing hashed build chunks
+ [build-all] native-protocol
+ [update-gateway] restoring previous build output
+ [update-gateway] restarting gateway on previous build after update failure
+ /home/runner/_work/_temp/ci-batch-work-44871298969-1-hosted-batch-009/shard-2-compact-small-40/scripts/lib/source-update-build.mts:369
+             throw new AggregateError(
+                   ^
+
+ AggregateError: Source build recovery failed: busctl --user machine Manager.Version: exit 1; Failed to connect to bus: Protocol error
+ No supported service manager detected. Manage the Gateway through the supervisor or terminal that started it.
+     at <anonymous> (/home/runner/_work/_temp/ci-batch-work-44871298969-1-hosted-batch-009/shard-2-compact-small-40/scripts/lib/source-update-build.mts:369:19)
+     at async Promise.allSettled (index 0)
+     at async <anonymous> (/home/runner/_work/_temp/ci-batch-work-44871298969-1-hosted-batch-009/shard-2-compact-small-40/scripts/lib/source-update-build.mts:262:23)
+     at async withDistArtifactOwnership (/home/runner/_work/_temp/ci-batch-work-44871298969-1-hosted-batch-009/shard-2-compact-small-40/scripts/lib/dist-artifact-lock.mts:213:12)
+     at async runSourceUpdateBuild (/home/runner/_work/_temp/ci-batch-work-44871298969-1-hosted-batch-009/shard-2-compact-small-40/scripts/lib/source-update-build.mts:255:10)
+     at async runLegacySourceUpdateBuild (/home/runner/_work/_temp/ci-batch-work-44871298969-1-hosted-batch-009/shard-2-compact-small-40/scripts/lib/source-update-build.mts:119:10)
+     at async <anonymous> (/home/runner/_work/_temp/ci-batch-work-44871298969-1-hosted-batch-009/shard-2-compact-small-40/scripts/build-all.mts:747:24) {
```

### compact-small-40 :: tooling test/scripts-update-gateway-legacy.test.ts > published source shell reaches candidate build entry: build-throw-settle

```
AssertionError: From /tmp/oc4c2671/.oc-ci-tmp/sMVl/t/oc-vt-oF5NFB/oc-vt-OFM4Qo/openclaw-legacy-source-template-G8XiIu/seed
 * branch            main       -> FETCH_HEAD
   83abdd7..0fd79df  main       -> origin/main
[update-gateway] stopping gateway before replacing hashed build chunks
[build-all] native-protocol
[update-gateway] restoring previous build output
[update-gateway] restarting gateway on previous build after update failure
/home/runner/_work/_temp/ci-batch-work-44871298969-1-hosted-batch-009/shard-2-compact-small-40/scripts/lib/source-update-build.mts:423
        ? new AggregateError([failure.error, error], "Source build and native settlement failed", {
          ^
AggregateError: Source build and native settlement failed
    at <anonymous> (/home/runner/_work/_temp/ci-batch-work-44871298969-1-hosted-batch-009/shard-2-compact-small-40/scripts/lib/source-update-build.mts:423:11)
    at async withDistArtifactOwnership (/home/runner/_work/_temp/ci-batch-work-44871298969-1-hosted-batch-009/shard-2-compact-small-40/scripts/lib/dist-artifact-lock.mts:213:12)
    ... 2 lines matching cause stack trace ...
    at async <anonymous> (/home/runner/_work/_temp/ci-batch-work-44871298969-1-hosted-batch-009/shard-2-compact-small-40/scripts/build-all.mts:747:24) {
  [cause]: AggregateError: Source-update native recovery did not settle.
      at Object.settle (/home/runner/_work/_temp/ci-batch-work-44871298969-1-hosted-batch-009/shard-2-compact-small-40/scripts/lib/source-update-build.mts:226:17)
      at async settle (/home/runner/_work/_temp/ci-batch-work-44871298969-1-hosted-batch-009/shard-2-compact-small-40/scripts/lib/source-update-build.mts:260:7)
      at async <anonymous> (/home/runner/_work/_temp/ci-batch-work-44871298969-1-hosted-batch-009/shard-2-compact-small-40/scripts/lib/source-update-build.mts:418:9)
      at async withDistArtifactOwnership (/home/runner/_work/_temp/ci-batch-work-44871298969-1-hosted-batch-009/shard-2-compact-small-40/scripts/lib/dist-artifact-lock.mts:213:12)
      at async runSourceUpdateBuild (/home/runner/_work/_temp/ci-batch-work-44871298969-1-hosted-batch-009/shard-2-compact-small-40/scripts/lib/source-update-build.mts:255:10)
      at async runLegacySourceUpdateBuild (/home/runner/_work/_temp/ci-batch-work-44871298969-1-hosted-batch-009/shard-2-compact-small-40/scripts/lib/source-update-build.mts:119:10)
      at async <anonymous> (/home/runner/_work/_temp/ci-batch-work-44871298969-1-hosted-batch-009/shard-2-compact-small-40/scripts/build-all.mts:747:24) {
    [errors]: [
```

### compact-small-40 :: tooling test/scripts-update-gateway-legacy.test.ts > published source shell reaches candidate build entry: failure

```
AssertionError: From /tmp/oc4c2671/.oc-ci-tmp/sMVl/t/oc-vt-oF5NFB/oc-vt-OFM4Qo/openclaw-legacy-source-template-G8XiIu/seed
 * branch            main       -> FETCH_HEAD
   83abdd7..0fd79df  main       -> origin/main
[update-gateway] stopping gateway before replacing hashed build chunks
[build-all] native-protocol
[build-all] native-protocol failed after 0ms
[build-all] phase timings: total 1ms; slowest native-protocol (failed) 0ms
[update-gateway] restoring previous build output
[update-gateway] restarting gateway on previous build after update failure
/home/runner/_work/_temp/ci-batch-work-44871298969-1-hosted-batch-009/shard-2-compact-small-40/scripts/lib/source-update-build.mts:369
            throw new AggregateError(
                  ^
AggregateError: Source build recovery failed: busctl --user machine Manager.Version: exit 1; Failed to connect to bus: Protocol error
No supported service manager detected. Manage the Gateway through the supervisor or terminal that started it.
    at <anonymous> (/home/runner/_work/_temp/ci-batch-work-44871298969-1-hosted-batch-009/shard-2-compact-small-40/scripts/lib/source-update-build.mts:369:19)
    at async Promise.allSettled (index 0)
    at async <anonymous> (/home/runner/_work/_temp/ci-batch-work-44871298969-1-hosted-batch-009/shard-2-compact-small-40/scripts/lib/source-update-build.mts:262:23)
    at async withDistArtifactOwnership (/home/runner/_work/_temp/ci-batch-work-44871298969-1-hosted-batch-009/shard-2-compact-small-40/scripts/lib/dist-artifact-lock.mts:213:12)
    at async runSourceUpdateBuild (/home/runner/_work/_temp/ci-batch-work-44871298969-1-hosted-batch-009/shard-2-compact-small-40/scripts/lib/source-update-build.mts:255:10)
    at async runLegacySourceUpdateBuild (/home/runner/_work/_temp/ci-batch-work-44871298969-1-hosted-batch-009/shard-2-compact-small-40/scripts/lib/source-update-build.mts:119:10)
    at async <anonymous> (/home/runner/_work/_temp/ci-batch-work-44871298969-1-hosted-batch-009/shard-2-compact-small-40/scripts/build-all.mts:747:24) {
  [cause]: ServiceInspectionError: busctl --user machine Manager.Version: exit 1; Failed to connect to bus: Protocol error
  No supported service manager detected. Manage the Gateway through the supervisor or terminal that started it.
      at select (/home/runner/_work/_temp/ci-batch-work-44871298969-1-hosted-batch-009/shard-2-compact-small-40/src/daemon/systemd-user-transport.ts:228:13)
```

### compact-small-40 :: tooling test/scripts-update-gateway-legacy.test.ts > published source shell reaches candidate build entry: failure-scheduled

```
AssertionError: From /tmp/oc4c2671/.oc-ci-tmp/sMVl/t/oc-vt-oF5NFB/oc-vt-OFM4Qo/openclaw-legacy-source-template-G8XiIu/seed
 * branch            main       -> FETCH_HEAD
   83abdd7..0fd79df  main       -> origin/main
[update-gateway] stopping gateway before replacing hashed build chunks
[build-all] native-protocol
[build-all] native-protocol failed after 0ms
[build-all] phase timings: total 1ms; slowest native-protocol (failed) 0ms
[update-gateway] restoring previous build output
[update-gateway] restarting gateway on previous build after update failure
/home/runner/_work/_temp/ci-batch-work-44871298969-1-hosted-batch-009/shard-2-compact-small-40/scripts/lib/source-update-build.mts:369
            throw new AggregateError(
                  ^
AggregateError: Source build recovery failed: busctl --user machine Manager.Version: exit 1; Failed to connect to bus: Protocol error
No supported service manager detected. Manage the Gateway through the supervisor or terminal that started it.
    at <anonymous> (/home/runner/_work/_temp/ci-batch-work-44871298969-1-hosted-batch-009/shard-2-compact-small-40/scripts/lib/source-update-build.mts:369:19)
    at async Promise.allSettled (index 0)
    at async <anonymous> (/home/runner/_work/_temp/ci-batch-work-44871298969-1-hosted-batch-009/shard-2-compact-small-40/scripts/lib/source-update-build.mts:262:23)
    at async withDistArtifactOwnership (/home/runner/_work/_temp/ci-batch-work-44871298969-1-hosted-batch-009/shard-2-compact-small-40/scripts/lib/dist-artifact-lock.mts:213:12)
    at async runSourceUpdateBuild (/home/runner/_work/_temp/ci-batch-work-44871298969-1-hosted-batch-009/shard-2-compact-small-40/scripts/lib/source-update-build.mts:255:10)
    at async runLegacySourceUpdateBuild (/home/runner/_work/_temp/ci-batch-work-44871298969-1-hosted-batch-009/shard-2-compact-small-40/scripts/lib/source-update-build.mts:119:10)
    at async <anonymous> (/home/runner/_work/_temp/ci-batch-work-44871298969-1-hosted-batch-009/shard-2-compact-small-40/scripts/build-all.mts:747:24) {
  [cause]: ServiceInspectionError: busctl --user machine Manager.Version: exit 1; Failed to connect to bus: Protocol error
  No supported service manager detected. Manage the Gateway through the supervisor or terminal that started it.
      at select (/home/runner/_work/_temp/ci-batch-work-44871298969-1-hosted-batch-009/shard-2-compact-small-40/src/daemon/systemd-user-transport.ts:228:13)
```

### compact-small-40 :: tooling test/scripts-update-gateway-legacy.test.ts > published source shell reaches candidate build entry: partial-stop

```
 FAIL   tooling  test/scripts-update-gateway-legacy.test.ts > published source shell reaches candidate build entry: partial-stop-custom
 FAIL   tooling  test/scripts-update-gateway-legacy.test.ts > published source shell reaches candidate build entry: partial-stop-scheduled
AssertionError: From /tmp/oc4c2671/.oc-ci-tmp/sMVl/t/oc-vt-oF5NFB/oc-vt-OFM4Qo/openclaw-legacy-source-template-G8XiIu/seed
 * branch            main       -> FETCH_HEAD
   83abdd7..0fd79df  main       -> origin/main
[update-gateway] stopping gateway before replacing hashed build chunks
/home/runner/_work/_temp/ci-batch-work-44871298969-1-hosted-batch-009/shard-2-compact-small-40/scripts/lib/source-update-build.mts:165
              throw new AggregateError(
                    ^
AggregateError: Source update stop and original-runtime recovery failed.
    at Object.stop (/home/runner/_work/_temp/ci-batch-work-44871298969-1-hosted-batch-009/shard-2-compact-small-40/scripts/lib/source-update-build.mts:165:21)
    at async <anonymous> (/home/runner/_work/_temp/ci-batch-work-44871298969-1-hosted-batch-009/shard-2-compact-small-40/scripts/lib/source-update-build.mts:269:25)
    at async Promise.allSettled (index 0)
    at async <anonymous> (/home/runner/_work/_temp/ci-batch-work-44871298969-1-hosted-batch-009/shard-2-compact-small-40/scripts/lib/source-update-build.mts:262:23)
    at async withDistArtifactOwnership (/home/runner/_work/_temp/ci-batch-work-44871298969-1-hosted-batch-009/shard-2-compact-small-40/scripts/lib/dist-artifact-lock.mts:213:12)
    at async runSourceUpdateBuild (/home/runner/_work/_temp/ci-batch-work-44871298969-1-hosted-batch-009/shard-2-compact-small-40/scripts/lib/source-update-build.mts:255:10)
    at async runLegacySourceUpdateBuild (/home/runner/_work/_temp/ci-batch-work-44871298969-1-hosted-batch-009/shard-2-compact-small-40/scripts/lib/source-update-build.mts:119:10)
    at async <anonymous> (/home/runner/_work/_temp/ci-batch-work-44871298969-1-hosted-batch-009/shard-2-compact-small-40/scripts/build-all.mts:747:24) {
  [cause]: ServiceInspectionError: busctl --user machine Manager.Version: exit 1; Failed to connect to bus: Protocol error
  No supported service manager detected. Manage the Gateway through the supervisor or terminal that started it.
      at select (/home/runner/_work/_temp/ci-batch-work-44871298969-1-hosted-batch-009/shard-2-compact-small-40/src/daemon/systemd-user-transport.ts:228:13)
      at process.processTicksAndRejections (node:internal/process/task_queues:104:5) {
    reason: 'service-manager-unavailable'
  },
```

### compact-small-40 :: tooling test/scripts-update-gateway-legacy.test.ts > published source shell reaches candidate build entry: partial-stop-custom

```
 FAIL   tooling  test/scripts-update-gateway-legacy.test.ts > published source shell reaches candidate build entry: partial-stop-scheduled
AssertionError: From /tmp/oc4c2671/.oc-ci-tmp/sMVl/t/oc-vt-oF5NFB/oc-vt-OFM4Qo/openclaw-legacy-source-template-G8XiIu/seed
 * branch            main       -> FETCH_HEAD
   83abdd7..0fd79df  main       -> origin/main
[update-gateway] stopping gateway before replacing hashed build chunks
/home/runner/_work/_temp/ci-batch-work-44871298969-1-hosted-batch-009/shard-2-compact-small-40/scripts/lib/source-update-build.mts:165
              throw new AggregateError(
                    ^
AggregateError: Source update stop and original-runtime recovery failed.
    at Object.stop (/home/runner/_work/_temp/ci-batch-work-44871298969-1-hosted-batch-009/shard-2-compact-small-40/scripts/lib/source-update-build.mts:165:21)
    at async <anonymous> (/home/runner/_work/_temp/ci-batch-work-44871298969-1-hosted-batch-009/shard-2-compact-small-40/scripts/lib/source-update-build.mts:269:25)
    at async Promise.allSettled (index 0)
    at async <anonymous> (/home/runner/_work/_temp/ci-batch-work-44871298969-1-hosted-batch-009/shard-2-compact-small-40/scripts/lib/source-update-build.mts:262:23)
    at async withDistArtifactOwnership (/home/runner/_work/_temp/ci-batch-work-44871298969-1-hosted-batch-009/shard-2-compact-small-40/scripts/lib/dist-artifact-lock.mts:213:12)
    at async runSourceUpdateBuild (/home/runner/_work/_temp/ci-batch-work-44871298969-1-hosted-batch-009/shard-2-compact-small-40/scripts/lib/source-update-build.mts:255:10)
    at async runLegacySourceUpdateBuild (/home/runner/_work/_temp/ci-batch-work-44871298969-1-hosted-batch-009/shard-2-compact-small-40/scripts/lib/source-update-build.mts:119:10)
    at async <anonymous> (/home/runner/_work/_temp/ci-batch-work-44871298969-1-hosted-batch-009/shard-2-compact-small-40/scripts/build-all.mts:747:24) {
  [cause]: ServiceInspectionError: busctl --user machine Manager.Version: exit 1; Failed to connect to bus: Protocol error
  No supported service manager detected. Manage the Gateway through the supervisor or terminal that started it.
      at select (/home/runner/_work/_temp/ci-batch-work-44871298969-1-hosted-batch-009/shard-2-compact-small-40/src/daemon/systemd-user-transport.ts:228:13)
      at process.processTicksAndRejections (node:internal/process/task_queues:104:5) {
    reason: 'service-manager-unavailable'
  },
  [errors]: [
```

### compact-small-40 :: tooling test/scripts-update-gateway-legacy.test.ts > published source shell reaches candidate build entry: partial-stop-scheduled

```
AssertionError: From /tmp/oc4c2671/.oc-ci-tmp/sMVl/t/oc-vt-oF5NFB/oc-vt-OFM4Qo/openclaw-legacy-source-template-G8XiIu/seed
 * branch            main       -> FETCH_HEAD
   83abdd7..0fd79df  main       -> origin/main
[update-gateway] stopping gateway before replacing hashed build chunks
/home/runner/_work/_temp/ci-batch-work-44871298969-1-hosted-batch-009/shard-2-compact-small-40/scripts/lib/source-update-build.mts:165
              throw new AggregateError(
                    ^
AggregateError: Source update stop and original-runtime recovery failed.
    at Object.stop (/home/runner/_work/_temp/ci-batch-work-44871298969-1-hosted-batch-009/shard-2-compact-small-40/scripts/lib/source-update-build.mts:165:21)
    at async <anonymous> (/home/runner/_work/_temp/ci-batch-work-44871298969-1-hosted-batch-009/shard-2-compact-small-40/scripts/lib/source-update-build.mts:269:25)
    at async Promise.allSettled (index 0)
    at async <anonymous> (/home/runner/_work/_temp/ci-batch-work-44871298969-1-hosted-batch-009/shard-2-compact-small-40/scripts/lib/source-update-build.mts:262:23)
    at async withDistArtifactOwnership (/home/runner/_work/_temp/ci-batch-work-44871298969-1-hosted-batch-009/shard-2-compact-small-40/scripts/lib/dist-artifact-lock.mts:213:12)
    at async runSourceUpdateBuild (/home/runner/_work/_temp/ci-batch-work-44871298969-1-hosted-batch-009/shard-2-compact-small-40/scripts/lib/source-update-build.mts:255:10)
    at async runLegacySourceUpdateBuild (/home/runner/_work/_temp/ci-batch-work-44871298969-1-hosted-batch-009/shard-2-compact-small-40/scripts/lib/source-update-build.mts:119:10)
    at async <anonymous> (/home/runner/_work/_temp/ci-batch-work-44871298969-1-hosted-batch-009/shard-2-compact-small-40/scripts/build-all.mts:747:24) {
  [cause]: ServiceInspectionError: busctl --user machine Manager.Version: exit 1; Failed to connect to bus: Protocol error
  No supported service manager detected. Manage the Gateway through the supervisor or terminal that started it.
      at select (/home/runner/_work/_temp/ci-batch-work-44871298969-1-hosted-batch-009/shard-2-compact-small-40/src/daemon/systemd-user-transport.ts:228:13)
      at process.processTicksAndRejections (node:internal/process/task_queues:104:5) {
    reason: 'service-manager-unavailable'
  },
  [errors]: [
    Error: fixture stop rejected after native mutation
```

### compact-small-40 :: tooling test/scripts/check-line-cap-ratchet.test.ts > preserves failed child diagnostics for 1//Cannot load oxlint native binding

```
AssertionError: expected 'Error: Cannot resolve tooling depende…' to contain 'Cannot load oxlint native binding'
- Expected
+ Received
- Cannot load oxlint native binding
+ Error: Cannot resolve tooling dependencies at /tmp/oc4c2671/.oc-ci-tmp/sMVl/t/oc-vt-oF5NFB/oc-vt-OFM4Qo/openclaw-line-cap-admission-6wCroh/tooling #root. Different repository. Install dependencies in this checkout or set OPENCLAW_PR_TOOLING_ROOT to an installed checkout of this repository.
+     at toolingDependencyOptions (file:///tmp/oc4c2671/.oc-ci-tmp/sMVl/t/oc-vt-oF5NFB/oc-vt-OFM4Qo/openclaw-line-cap-admission-6wCroh/checkout/scripts/lib/tooling-dependencies.mjs:156:11)
+     at runTsxCliShim (file:///tmp/oc4c2671/.oc-ci-tmp/sMVl/t/oc-vt-oF5NFB/oc-vt-OFM4Qo/openclaw-line-cap-admission-6wCroh/checkout/scripts/lib/tsx-cli-shim.mjs:280:23)
+     at async file:///tmp/oc4c2671/.oc-ci-tmp/sMVl/t/oc-vt-oF5NFB/oc-vt-OFM4Qo/openclaw-line-cap-admission-6wCroh/checkout/scripts/check-line-cap-ratchet.mjs:4:1 {
+   [cause]: Error: Different repository.
+       at toolingDependencyOptions (file:///tmp/oc4c2671/.oc-ci-tmp/sMVl/t/oc-vt-oF5NFB/oc-vt-OFM4Qo/openclaw-line-cap-admission-6wCroh/checkout/scripts/lib/tooling-dependencies.mjs:149:15)
+       at runTsxCliShim (file:///tmp/oc4c2671/.oc-ci-tmp/sMVl/t/oc-vt-oF5NFB/oc-vt-OFM4Qo/openclaw-line-cap-admission-6wCroh/checkout/scripts/lib/tsx-cli-shim.mjs:280:23)
+       at async file:///tmp/oc4c2671/.oc-ci-tmp/sMVl/t/oc-vt-oF5NFB/oc-vt-OFM4Qo/openclaw-line-cap-admission-6wCroh/checkout/scripts/check-line-cap-ratchet.mjs:4:1
+ }
+ [line-cap-ratchet] FAILED (exit 1)
+
 ❯ test/scripts/check-line-cap-ratchet.test.ts:254:29
    252|     expect(result.status, result.stderr).toBe(1);
    253|     if (status !== 0) {
    254|       expect(result.stderr).toContain(stderr || stdout);
       |                             ^
    255|     } else {
    256|       expect(result.stderr).not.toContain(stderr);
⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[8/14]⎯
 FAIL   tooling  test/scripts/check-line-cap-ratchet.test.ts > preserves failed child diagnostics for 1/invalid report/Cannot load oxlint native binding
```

### compact-small-40 :: tooling test/scripts/check-line-cap-ratchet.test.ts > preserves failed child diagnostics for 1/Invalid oxlint configuration/

```
AssertionError: expected 'Error: Cannot resolve tooling depende…' to contain 'Invalid oxlint configuration'
- Expected
+ Received
- Invalid oxlint configuration
+ Error: Cannot resolve tooling dependencies at /tmp/oc4c2671/.oc-ci-tmp/sMVl/t/oc-vt-oF5NFB/oc-vt-OFM4Qo/openclaw-line-cap-admission-WbSDIB/tooling #root. Different repository. Install dependencies in this checkout or set OPENCLAW_PR_TOOLING_ROOT to an installed checkout of this repository.
+     at toolingDependencyOptions (file:///tmp/oc4c2671/.oc-ci-tmp/sMVl/t/oc-vt-oF5NFB/oc-vt-OFM4Qo/openclaw-line-cap-admission-WbSDIB/checkout/scripts/lib/tooling-dependencies.mjs:156:11)
+     at runTsxCliShim (file:///tmp/oc4c2671/.oc-ci-tmp/sMVl/t/oc-vt-oF5NFB/oc-vt-OFM4Qo/openclaw-line-cap-admission-WbSDIB/checkout/scripts/lib/tsx-cli-shim.mjs:280:23)
+     at async file:///tmp/oc4c2671/.oc-ci-tmp/sMVl/t/oc-vt-oF5NFB/oc-vt-OFM4Qo/openclaw-line-cap-admission-WbSDIB/checkout/scripts/check-line-cap-ratchet.mjs:4:1 {
+   [cause]: Error: Different repository.
+       at toolingDependencyOptions (file:///tmp/oc4c2671/.oc-ci-tmp/sMVl/t/oc-vt-oF5NFB/oc-vt-OFM4Qo/openclaw-line-cap-admission-WbSDIB/checkout/scripts/lib/tooling-dependencies.mjs:149:15)
+       at runTsxCliShim (file:///tmp/oc4c2671/.oc-ci-tmp/sMVl/t/oc-vt-oF5NFB/oc-vt-OFM4Qo/openclaw-line-cap-admission-WbSDIB/checkout/scripts/lib/tsx-cli-shim.mjs:280:23)
+       at async file:///tmp/oc4c2671/.oc-ci-tmp/sMVl/t/oc-vt-oF5NFB/oc-vt-OFM4Qo/openclaw-line-cap-admission-WbSDIB/checkout/scripts/check-line-cap-ratchet.mjs:4:1
+ }
+ [line-cap-ratchet] FAILED (exit 1)
+
 ❯ test/scripts/check-line-cap-ratchet.test.ts:254:29
    252|     expect(result.status, result.stderr).toBe(1);
    253|     if (status !== 0) {
    254|       expect(result.stderr).toContain(stderr || stdout);
       |                             ^
    255|     } else {
    256|       expect(result.stderr).not.toContain(stderr);
⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[10/14]⎯
 FAIL   tooling  test/scripts/check-line-cap-ratchet.test.ts > rejects bin traversal before executing the oxlint CLI
```

### compact-small-40 :: tooling test/scripts/check-line-cap-ratchet.test.ts > preserves failed child diagnostics for 1/invalid report/Cannot load oxlint native binding

```
AssertionError: expected 'Error: Cannot resolve tooling depende…' to contain 'Cannot load oxlint native binding'
- Expected
+ Received
- Cannot load oxlint native binding
+ Error: Cannot resolve tooling dependencies at /tmp/oc4c2671/.oc-ci-tmp/sMVl/t/oc-vt-oF5NFB/oc-vt-OFM4Qo/openclaw-line-cap-admission-0KsS9p/tooling #root. Different repository. Install dependencies in this checkout or set OPENCLAW_PR_TOOLING_ROOT to an installed checkout of this repository.
+     at toolingDependencyOptions (file:///tmp/oc4c2671/.oc-ci-tmp/sMVl/t/oc-vt-oF5NFB/oc-vt-OFM4Qo/openclaw-line-cap-admission-0KsS9p/checkout/scripts/lib/tooling-dependencies.mjs:156:11)
+     at runTsxCliShim (file:///tmp/oc4c2671/.oc-ci-tmp/sMVl/t/oc-vt-oF5NFB/oc-vt-OFM4Qo/openclaw-line-cap-admission-0KsS9p/checkout/scripts/lib/tsx-cli-shim.mjs:280:23)
+     at async file:///tmp/oc4c2671/.oc-ci-tmp/sMVl/t/oc-vt-oF5NFB/oc-vt-OFM4Qo/openclaw-line-cap-admission-0KsS9p/checkout/scripts/check-line-cap-ratchet.mjs:4:1 {
+   [cause]: Error: Different repository.
+       at toolingDependencyOptions (file:///tmp/oc4c2671/.oc-ci-tmp/sMVl/t/oc-vt-oF5NFB/oc-vt-OFM4Qo/openclaw-line-cap-admission-0KsS9p/checkout/scripts/lib/tooling-dependencies.mjs:149:15)
+       at runTsxCliShim (file:///tmp/oc4c2671/.oc-ci-tmp/sMVl/t/oc-vt-oF5NFB/oc-vt-OFM4Qo/openclaw-line-cap-admission-0KsS9p/checkout/scripts/lib/tsx-cli-shim.mjs:280:23)
+       at async file:///tmp/oc4c2671/.oc-ci-tmp/sMVl/t/oc-vt-oF5NFB/oc-vt-OFM4Qo/openclaw-line-cap-admission-0KsS9p/checkout/scripts/check-line-cap-ratchet.mjs:4:1
+ }
+ [line-cap-ratchet] FAILED (exit 1)
+
 ❯ test/scripts/check-line-cap-ratchet.test.ts:254:29
    252|     expect(result.status, result.stderr).toBe(1);
    253|     if (status !== 0) {
    254|       expect(result.stderr).toContain(stderr || stdout);
       |                             ^
    255|     } else {
    256|       expect(result.stderr).not.toContain(stderr);
⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[9/14]⎯
 FAIL   tooling  test/scripts/check-line-cap-ratchet.test.ts > preserves failed child diagnostics for 1/Invalid oxlint configuration/
```

### compact-small-40 :: tooling test/scripts/check-line-cap-ratchet.test.ts > rejects bin symlink before executing the oxlint CLI

```
AssertionError: expected 'Error: Cannot resolve tooling depende…' to contain 'The oxlint CLI bin must be a file ins…'
- Expected
+ Received
- The oxlint CLI bin must be a file inside its admitted package.
+ Error: Cannot resolve tooling dependencies at /tmp/oc4c2671/.oc-ci-tmp/sMVl/t/oc-vt-oF5NFB/oc-vt-OFM4Qo/openclaw-line-cap-admission-2PnCQW/tooling #root. Different repository. Install dependencies in this checkout or set OPENCLAW_PR_TOOLING_ROOT to an installed checkout of this repository.
+     at toolingDependencyOptions (file:///tmp/oc4c2671/.oc-ci-tmp/sMVl/t/oc-vt-oF5NFB/oc-vt-OFM4Qo/openclaw-line-cap-admission-2PnCQW/checkout/scripts/lib/tooling-dependencies.mjs:156:11)
+     at runTsxCliShim (file:///tmp/oc4c2671/.oc-ci-tmp/sMVl/t/oc-vt-oF5NFB/oc-vt-OFM4Qo/openclaw-line-cap-admission-2PnCQW/checkout/scripts/lib/tsx-cli-shim.mjs:280:23)
+     at async file:///tmp/oc4c2671/.oc-ci-tmp/sMVl/t/oc-vt-oF5NFB/oc-vt-OFM4Qo/openclaw-line-cap-admission-2PnCQW/checkout/scripts/check-line-cap-ratchet.mjs:4:1 {
+   [cause]: Error: Different repository.
+       at toolingDependencyOptions (file:///tmp/oc4c2671/.oc-ci-tmp/sMVl/t/oc-vt-oF5NFB/oc-vt-OFM4Qo/openclaw-line-cap-admission-2PnCQW/checkout/scripts/lib/tooling-dependencies.mjs:149:15)
+       at runTsxCliShim (file:///tmp/oc4c2671/.oc-ci-tmp/sMVl/t/oc-vt-oF5NFB/oc-vt-OFM4Qo/openclaw-line-cap-admission-2PnCQW/checkout/scripts/lib/tsx-cli-shim.mjs:280:23)
+       at async file:///tmp/oc4c2671/.oc-ci-tmp/sMVl/t/oc-vt-oF5NFB/oc-vt-OFM4Qo/openclaw-line-cap-admission-2PnCQW/checkout/scripts/check-line-cap-ratchet.mjs:4:1
+ }
+ [line-cap-ratchet] FAILED (exit 1)
+
 ❯ test/scripts/check-line-cap-ratchet.test.ts:279:27
    277|     const result = run();
    278|     expect(result.status, result.stderr).toBe(1);
    279|     expect(result.stderr).toContain(
       |                           ^
    280|       "The oxlint CLI bin must be a file inside its admitted package.",
    281|     );
⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[12/14]⎯
 Test Files  2 failed | 64 passed | 1 skipped (67)
```

### compact-small-40 :: tooling test/scripts/check-line-cap-ratchet.test.ts > rejects bin traversal before executing the oxlint CLI

```
AssertionError: expected 'Error: Cannot resolve tooling depende…' to contain 'The oxlint CLI bin must be a file ins…'
- Expected
+ Received
- The oxlint CLI bin must be a file inside its admitted package.
+ Error: Cannot resolve tooling dependencies at /tmp/oc4c2671/.oc-ci-tmp/sMVl/t/oc-vt-oF5NFB/oc-vt-OFM4Qo/openclaw-line-cap-admission-zlMH0z/tooling #root. Different repository. Install dependencies in this checkout or set OPENCLAW_PR_TOOLING_ROOT to an installed checkout of this repository.
+     at toolingDependencyOptions (file:///tmp/oc4c2671/.oc-ci-tmp/sMVl/t/oc-vt-oF5NFB/oc-vt-OFM4Qo/openclaw-line-cap-admission-zlMH0z/checkout/scripts/lib/tooling-dependencies.mjs:156:11)
+     at runTsxCliShim (file:///tmp/oc4c2671/.oc-ci-tmp/sMVl/t/oc-vt-oF5NFB/oc-vt-OFM4Qo/openclaw-line-cap-admission-zlMH0z/checkout/scripts/lib/tsx-cli-shim.mjs:280:23)
+     at async file:///tmp/oc4c2671/.oc-ci-tmp/sMVl/t/oc-vt-oF5NFB/oc-vt-OFM4Qo/openclaw-line-cap-admission-zlMH0z/checkout/scripts/check-line-cap-ratchet.mjs:4:1 {
+   [cause]: Error: Different repository.
+       at toolingDependencyOptions (file:///tmp/oc4c2671/.oc-ci-tmp/sMVl/t/oc-vt-oF5NFB/oc-vt-OFM4Qo/openclaw-line-cap-admission-zlMH0z/checkout/scripts/lib/tooling-dependencies.mjs:149:15)
+       at runTsxCliShim (file:///tmp/oc4c2671/.oc-ci-tmp/sMVl/t/oc-vt-oF5NFB/oc-vt-OFM4Qo/openclaw-line-cap-admission-zlMH0z/checkout/scripts/lib/tsx-cli-shim.mjs:280:23)
+       at async file:///tmp/oc4c2671/.oc-ci-tmp/sMVl/t/oc-vt-oF5NFB/oc-vt-OFM4Qo/openclaw-line-cap-admission-zlMH0z/checkout/scripts/check-line-cap-ratchet.mjs:4:1
+ }
+ [line-cap-ratchet] FAILED (exit 1)
+
 ❯ test/scripts/check-line-cap-ratchet.test.ts:279:27
    277|     const result = run();
    278|     expect(result.status, result.stderr).toBe(1);
    279|     expect(result.stderr).toContain(
       |                           ^
    280|       "The oxlint CLI bin must be a file inside its admitted package.",
    281|     );
⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[11/14]⎯
 FAIL   tooling  test/scripts/check-line-cap-ratchet.test.ts > rejects bin symlink before executing the oxlint CLI
```

### compact-small-6 :: cli src/cli/update-cli/update-command-retained-restart.test.ts > retained POSIX native restart > rechecks retained authority before restart: A after reset-failed

```
 FAIL   cli  src/cli/update-cli/update-command-retained-restart.test.ts > retained POSIX native restart > rechecks retained authority before restart: B after reset-failed
AssertionError: expected [Function] to throw error matching /executor|ownership|cancelled fixture|…/ but got 'busctl --user machine Manager.Version…'
- Expected:
/executor|ownership|cancelled fixture|changed original service|unavailable|scope/
+ Received:
"busctl --user machine Manager.Version: exit 1; Failed to connect to bus: Protocol error
No supported service manager detected. Manage the Gateway through the supervisor or terminal that started it."
 ❯ src/cli/update-cli/update-command-retained-restart.test.ts:268:23
    266|       });
    267|     });
    268|     await expect(work).rejects.toThrow(
       |                       ^
    269|       /executor|ownership|cancelled fixture|changed original service|u…
    270|     );
⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[2/5]⎯
 FAIL   cli  src/cli/update-cli/update-command-retained-restart.test.ts > retained POSIX native restart > retains native rejection rather than reporting completed or readiness
AssertionError: expected [Function] to throw error including 'native failed' but got 'busctl --user machine Manager.Version…'
- Expected
+ Received
- native failed
+ busctl --user machine Manager.Version: exit 1; Failed to connect to bus: Protocol error
+ No supported service manager detected. Manage the Gateway through the supervisor or terminal that started it.
 ❯ src/cli/update-cli/update-command-retained-restart.test.ts:312:33
    310|       stderr: "native failed",
```

### compact-small-6 :: cli src/cli/update-cli/update-command-retained-restart.test.ts > retained POSIX native restart > rechecks retained authority before restart: B after reset-failed

```
AssertionError: expected [Function] to throw error matching /executor|ownership|cancelled fixture|…/ but got 'busctl --user machine Manager.Version…'
- Expected:
/executor|ownership|cancelled fixture|changed original service|unavailable|scope/
+ Received:
"busctl --user machine Manager.Version: exit 1; Failed to connect to bus: Protocol error
No supported service manager detected. Manage the Gateway through the supervisor or terminal that started it."
 ❯ src/cli/update-cli/update-command-retained-restart.test.ts:268:23
    266|       });
    267|     });
    268|     await expect(work).rejects.toThrow(
       |                       ^
    269|       /executor|ownership|cancelled fixture|changed original service|u…
    270|     );
⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[2/5]⎯
 FAIL   cli  src/cli/update-cli/update-command-retained-restart.test.ts > retained POSIX native restart > retains native rejection rather than reporting completed or readiness
AssertionError: expected [Function] to throw error including 'native failed' but got 'busctl --user machine Manager.Version…'
- Expected
+ Received
- native failed
+ busctl --user machine Manager.Version: exit 1; Failed to connect to bus: Protocol error
+ No supported service manager detected. Manage the Gateway through the supervisor or terminal that started it.
 ❯ src/cli/update-cli/update-command-retained-restart.test.ts:312:33
    310|       stderr: "native failed",
    311|     });
```

### compact-small-6 :: cli src/cli/update-cli/update-command-retained-restart.test.ts > retained POSIX native restart > rechecks retained authority before restart: unavailable

```
 FAIL   cli  src/cli/update-cli/update-command-retained-restart.test.ts > retained POSIX native restart > rechecks retained authority before restart: A after reset-failed
 FAIL   cli  src/cli/update-cli/update-command-retained-restart.test.ts > retained POSIX native restart > rechecks retained authority before restart: B after reset-failed
AssertionError: expected [Function] to throw error matching /executor|ownership|cancelled fixture|…/ but got 'busctl --user machine Manager.Version…'
- Expected:
/executor|ownership|cancelled fixture|changed original service|unavailable|scope/
+ Received:
"busctl --user machine Manager.Version: exit 1; Failed to connect to bus: Protocol error
No supported service manager detected. Manage the Gateway through the supervisor or terminal that started it."
 ❯ src/cli/update-cli/update-command-retained-restart.test.ts:268:23
    266|       });
    267|     });
    268|     await expect(work).rejects.toThrow(
       |                       ^
    269|       /executor|ownership|cancelled fixture|changed original service|u…
    270|     );
⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[2/5]⎯
 FAIL   cli  src/cli/update-cli/update-command-retained-restart.test.ts > retained POSIX native restart > retains native rejection rather than reporting completed or readiness
AssertionError: expected [Function] to throw error including 'native failed' but got 'busctl --user machine Manager.Version…'
- Expected
+ Received
- native failed
+ busctl --user machine Manager.Version: exit 1; Failed to connect to bus: Protocol error
+ No supported service manager detected. Manage the Gateway through the supervisor or terminal that started it.
 ❯ src/cli/update-cli/update-command-retained-restart.test.ts:312:33
```

### compact-small-6 :: cli src/cli/update-cli/update-command-retained-restart.test.ts > retained POSIX native restart > restarts retained A with a real child and keeps both owners until native drain

```
ServiceInspectionError: busctl --user machine Manager.Version: exit 1; Failed to connect to bus: Protocol error
No supported service manager detected. Manage the Gateway through the supervisor or terminal that started it.
 ❯ select src/daemon/systemd-user-transport.ts:228:13
    226|         const error = timedOut
    227|           ? new SystemdInspectionTimeout(timedOutCheck)
    228|           : new ServiceInspectionError(reason);
       |             ^
    229|         if (failure) {
    230|           error.message = `${failure}\n${error.message}`;
⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯
Serialized Error: { reason: 'service-manager-unavailable' }
⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/5]⎯
 FAIL   cli  src/cli/update-cli/update-command-retained-restart.test.ts > retained POSIX native restart > rechecks retained authority before restart: unavailable
 FAIL   cli  src/cli/update-cli/update-command-retained-restart.test.ts > retained POSIX native restart > rechecks retained authority before restart: A after reset-failed
 FAIL   cli  src/cli/update-cli/update-command-retained-restart.test.ts > retained POSIX native restart > rechecks retained authority before restart: B after reset-failed
AssertionError: expected [Function] to throw error matching /executor|ownership|cancelled fixture|…/ but got 'busctl --user machine Manager.Version…'
- Expected:
/executor|ownership|cancelled fixture|changed original service|unavailable|scope/
+ Received:
"busctl --user machine Manager.Version: exit 1; Failed to connect to bus: Protocol error
No supported service manager detected. Manage the Gateway through the supervisor or terminal that started it."
 ❯ src/cli/update-cli/update-command-retained-restart.test.ts:268:23
    266|       });
    267|     });
```

### compact-small-6 :: cli src/cli/update-cli/update-command-retained-restart.test.ts > retained POSIX native restart > retains native rejection rather than reporting completed or readiness

```
AssertionError: expected [Function] to throw error including 'native failed' but got 'busctl --user machine Manager.Version…'
- Expected
+ Received
- native failed
+ busctl --user machine Manager.Version: exit 1; Failed to connect to bus: Protocol error
+ No supported service manager detected. Manage the Gateway through the supervisor or terminal that started it.
 ❯ src/cli/update-cli/update-command-retained-restart.test.ts:312:33
    310|       stderr: "native failed",
    311|     });
    312|     await expect(restartOwned()).rejects.toThrow("native failed");
       |                                 ^
    313|   });
    314|
⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[3/5]⎯
 Test Files  1 failed | 428 passed | 1 skipped (430)
      Tests  5 failed | 5921 passed | 12 skipped (5938)
   Start at  06:21:28
   Duration  886.21s (tests 91%, transform 6%, import 2%, setup 1%)
[test] failed 1 Vitest shard in 887.80s
[test] FAILED (exit 1)
end (exit 1)
FAILED (exit 1)
law-command.help.test.ts > lazy command help > loads nested leaf options without executing for --help 4ms
 ✓  cli  src/cli/program/openclaw-command.help.test.ts > lazy command help > loads nested leaf options without executing for -h 3ms
```

### compact-small-dist-2 :: tui-pty src/tui/tui-pty-local.e2e.test.ts > TUI PTY real backends > authenticates a manifest-discovered provider and resumes the unchanged local model

```
Error: timed out waiting for "Enter T05 local auth API key"
│
◇  
OpenClaw 2026.11.5 (93a1e35)
I'll butter your workflow like a lobster roll: messy, delicious, effective.
7u openclaw tui - local embedded - agent main - session main                                          
 ⠋ starting up • 0s | subscribing to session events                                                 
 agent main | session main | unknown | deliver:off | tokens ?                                       
────────────────────────────────────────────────────────────────────────────────────────────────────
────────────────────────────────────────────────────────────────────────────────────────────────────
 ⠙ starting up • 0s | subscribing to session events                                                 
 ⠹ starting up • 0s | subscribing to session events                                                 
 ⠸ starting up • 0s | subscribing to session events                                                 
 ⠼ starting up • 0s | subscribing to session events                                                 
 ⠴ starting up • 0s | subscribing to session events                                                 
 ⠦ starting up • 0s | subscribing to session events                                                 
 ⠧ starting up • 0s | subscribing to session events                                                 
 ⠇ starting up • 0s | subscribing to session events                                                 
 ⠏ starting up • 0s | subscribing to session events                                                 
 ⠋ starting up • 0s | subscribing to session events                                                 
 ⠋ starting up • 1s | subscribing to session events                                                 
 ⠙ starting up • 1s | subscribing to session events                                                 
 ⠹ starting up • 1s | subscribing to session events                                                 
 ⠸ starting up • 1s | subscribing to session events                                                 
```

### extension-browser :: extension-browser extensions/browser/src/browser/chrome.headless-cleanup.test.ts > cleans up a one-shot darwin cache shell only when ownsProfile=false

```
AssertionError: expected undefined to be '/tmp/oc5a9a0c/.oc-ci-tmp/sGAS/t/oc-vt…' // Object.is equality
- Expected:
"/tmp/oc5a9a0c/.oc-ci-tmp/sGAS/t/oc-vt-7y4i4i/openclaw-headless-cleanup-oyk6cP/browsers/chromium-100/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing"
+ Received:
undefined
 ❯ extensions/browser/src/browser/chrome.headless-cleanup.test.ts:238:75
    236|       platform,
    237|     );
    238|     expect(resolveBrowserExecutableForPlatform(resolved, platform)?.pa…
       |                                                                           ^
    239|       mode === "cache" ? chrome : shell,
    240|     );
⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[2/4]⎯
 FAIL   extension-browser  extensions/browser/src/browser/chrome.headless-cleanup.test.ts > recovers stale cache browser with configuredHeadless=false, ownsProfile=true, code=websocket_health_command_timeout
AssertionError: promise rejected "Error: No supported browser found (Chrome…" instead of resolving
 ❯ extensions/browser/src/browser/chrome.headless-cleanup.test.ts:581:27
    579|     });
    580|     if (recovers) {
    581|       await expect(launch).resolves.toMatchObject({ exe: { path: chrom…
       |                           ^
    582|       expect(fixture.spawn).toHaveBeenCalledTimes(1);
    583|       const stopOrder = kill.mock.invocationCallOrder[0]!;
Caused by: Error: No supported browser found (Chrome/Brave/Edge/Chromium on macOS, Linux, or Windows).
 ❯ launchOpenClawChromeLocked extensions/browser/src/browser/chrome.ts:596:11
```

### extension-browser :: extension-browser extensions/browser/src/browser/chrome.headless-cleanup.test.ts > cleans up a one-shot darwin cache shell only when ownsProfile=true

```
AssertionError: expected undefined to be '/tmp/oc5a9a0c/.oc-ci-tmp/sGAS/t/oc-vt…' // Object.is equality
- Expected:
"/tmp/oc5a9a0c/.oc-ci-tmp/sGAS/t/oc-vt-7y4i4i/openclaw-headless-cleanup-ODJaQa/browsers/chromium-100/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing"
+ Received:
undefined
 ❯ extensions/browser/src/browser/chrome.headless-cleanup.test.ts:238:75
    236|       platform,
    237|     );
    238|     expect(resolveBrowserExecutableForPlatform(resolved, platform)?.pa…
       |                                                                           ^
    239|       mode === "cache" ? chrome : shell,
    240|     );
⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/4]⎯
 FAIL   extension-browser  extensions/browser/src/browser/chrome.headless-cleanup.test.ts > cleans up a one-shot darwin cache shell only when ownsProfile=false
AssertionError: expected undefined to be '/tmp/oc5a9a0c/.oc-ci-tmp/sGAS/t/oc-vt…' // Object.is equality
- Expected:
"/tmp/oc5a9a0c/.oc-ci-tmp/sGAS/t/oc-vt-7y4i4i/openclaw-headless-cleanup-oyk6cP/browsers/chromium-100/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing"
+ Received:
undefined
 ❯ extensions/browser/src/browser/chrome.headless-cleanup.test.ts:238:75
    236|       platform,
    237|     );
    238|     expect(resolveBrowserExecutableForPlatform(resolved, platform)?.pa…
       |                                                                           ^
```

### extension-browser :: extension-browser extensions/browser/src/browser/chrome.headless-cleanup.test.ts > recovers stale cache browser with configuredHeadless=false, ownsProfile=true, code=websocket_health_command_timeout

```
AssertionError: promise rejected "Error: No supported browser found (Chrome…" instead of resolving
 ❯ extensions/browser/src/browser/chrome.headless-cleanup.test.ts:581:27
    579|     });
    580|     if (recovers) {
    581|       await expect(launch).resolves.toMatchObject({ exe: { path: chrom…
       |                           ^
    582|       expect(fixture.spawn).toHaveBeenCalledTimes(1);
    583|       const stopOrder = kill.mock.invocationCallOrder[0]!;
Caused by: Error: No supported browser found (Chrome/Brave/Edge/Chromium on macOS, Linux, or Windows).
 ❯ launchOpenClawChromeLocked extensions/browser/src/browser/chrome.ts:596:11
 ❯ extensions/browser/src/browser/chrome.profile-lifecycle-lock.ts:28:17
 ❯ Object.onRequest extensions/browser/profile-filesystem.ts:32:32
⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[3/4]⎯
 FAIL   extension-browser  extensions/browser/src/browser/chrome.headless-cleanup.test.ts > recovers stale cache browser with configuredHeadless=true, ownsProfile=true, code=websocket_health_command_timeout
AssertionError: promise rejected "PortInUseError: Port is already in use." instead of resolving
 ❯ extensions/browser/src/browser/chrome.headless-cleanup.test.ts:581:27
    579|     });
    580|     if (recovers) {
    581|       await expect(launch).resolves.toMatchObject({ exe: { path: chrom…
       |                           ^
    582|       expect(fixture.spawn).toHaveBeenCalledTimes(1);
    583|       const stopOrder = kill.mock.invocationCallOrder[0]!;
Caused by: PortInUseError: Port is already in use.
 ❯ extensions/browser/src/browser/chrome.headless-cleanup.test.ts:562:36
```

### extension-browser :: extension-browser extensions/browser/src/browser/chrome.headless-cleanup.test.ts > recovers stale cache browser with configuredHeadless=true, ownsProfile=true, code=websocket_health_command_timeout

```
AssertionError: promise rejected "PortInUseError: Port is already in use." instead of resolving
 ❯ extensions/browser/src/browser/chrome.headless-cleanup.test.ts:581:27
    579|     });
    580|     if (recovers) {
    581|       await expect(launch).resolves.toMatchObject({ exe: { path: chrom…
       |                           ^
    582|       expect(fixture.spawn).toHaveBeenCalledTimes(1);
    583|       const stopOrder = kill.mock.invocationCallOrder[0]!;
Caused by: PortInUseError: Port is already in use.
 ❯ extensions/browser/src/browser/chrome.headless-cleanup.test.ts:562:36
⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[4/4]⎯
 Test Files  1 failed | 253 passed | 22 skipped (276)
      Tests  4 failed | 3069 passed | 123 skipped (3196)
   Start at  07:25:23
   Duration  206.00s (tests 48%, transform 35%, import 13%, setup 4%)
verifying completed generation before cleanup
failed 1 Vitest shard in 208.23s
FAILED (exit 1)
 RUN  v5.0.5 /home/runner/_work/_temp/ci-batch-work-44871298969-1-hosted-batch-023/shard-0-extension-browser
prepared ed90143fcb2a in 23196ms (13125 inputs, 8155 outputs)
 ✓  extension-browser  extensions/browser/src/browser/chrome.headless-cleanup.test.ts > cleans up a one-shot darwin explicit shell only when ownsProfile=true 1268ms
 ✓  extension-browser  extensions/browser/src/browser/chrome.headless-cleanup.test.ts > cleans up a one-shot darwin explicit shell only when ownsProfile=false 9ms
 ×  extension-browser  extensions/browser/src/browser/chrome.headless-cleanup.test.ts > cleans up a one-shot darwin cache shell only when ownsProfile=true 13ms
   → expected undefined to be '/tmp/oc5a9a0c/.oc-ci-tmp/sGAS/t/oc-vt…' // Object.is equality
```

### extension-database-workers.in-flight :: extension-database-workers extensions/tlon/src/monitor/index.test.ts > monitorTlonProvider shutdown > streams deeply nested poison and capped messages over real HTTP SSE through production handlers and recovers on the next messages

```
AssertionError: expected "vi.fn()" to be called with arguments: [ Array(1) ]
Received:
  1st vi.fn() call:
  [
-   "tlon dropped channels event: Tlon firehose event is too deeply nested to store.",
+   "[tlon] Starting monitor for ~zod",
  ]
  2nd vi.fn() call:
  [
-   "tlon dropped channels event: Tlon firehose event is too deeply nested to store.",
+   "[tlon] Attempting authentication to http://127.0.0.1:46003...",
  ]
  3rd vi.fn() call:
  [
-   "tlon dropped channels event: Tlon firehose event is too deeply nested to store.",
+   "[tlon] Migrated dmAllowlist from config to settings store",
  ]
  4th vi.fn() call:
  [
-   "tlon dropped channels event: Tlon firehose event is too deeply nested to store.",
+   "[tlon] Migrated groupChannels from config to settings store",
  ]
  5th vi.fn() call:
  [
```

### extension-providers :: extension-providers extensions/anthropic/session-catalog-transcript.test.ts > pages deeply nested Claude content without losing text

```
 FAIL   extension-providers  extensions/anthropic/session-catalog-transcript.test.ts > pages deeply nested Claude metadata without losing text
AssertionError: expected { type: 'agentMessage', …(6) } to match object { type: 'agentMessage', …(4) }
(3 matching properties omitted from actual)
- Expected
+ Received
  {
    "model": "fixture-model",
    "timestamp": "2026-01-01T00:00:00Z",
-   "truncated": true,
    "type": "agentMessage",
    "uuid": "latest",
  }
 ❯ extensions/anthropic/session-catalog-transcript.test.ts:<redacted len=5>
     32|     const page = await readLocalClaudeTranscriptPage({ threadId, limit…
     33|     const item = page.items[0];
     34|     expect(item).toMatchObject({
       |                  ^
     35|       type: "agentMessage",
     36|       uuid: "latest",
⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/2]⎯
 Test Files  1 failed | 318 passed | 1 skipped (320)
      Tests  2 failed | 3794 passed | 1 skipped (3797)
   Start at  07:19:53
   Duration  284.64s (tests 63%, transform 22%, import 12%, setup 3%)
```

### extension-providers :: extension-providers extensions/anthropic/session-catalog-transcript.test.ts > pages deeply nested Claude metadata without losing text

```
AssertionError: expected { type: 'agentMessage', …(6) } to match object { type: 'agentMessage', …(4) }
(3 matching properties omitted from actual)
- Expected
+ Received
  {
    "model": "fixture-model",
    "timestamp": "2026-01-01T00:00:00Z",
-   "truncated": true,
    "type": "agentMessage",
    "uuid": "latest",
  }
 ❯ extensions/anthropic/session-catalog-transcript.test.ts:<redacted len=5>
     32|     const page = await readLocalClaudeTranscriptPage({ threadId, limit…
     33|     const item = page.items[0];
     34|     expect(item).toMatchObject({
       |                  ^
     35|       type: "agentMessage",
     36|       uuid: "latest",
⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/2]⎯
 Test Files  1 failed | 318 passed | 1 skipped (320)
      Tests  2 failed | 3794 passed | 1 skipped (3797)
   Start at  07:19:53
   Duration  284.64s (tests 63%, transform 22%, import 12%, setup 3%)
verifying completed generation before cleanup
```
