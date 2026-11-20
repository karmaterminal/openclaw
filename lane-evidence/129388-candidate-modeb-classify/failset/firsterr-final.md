### compact-large-13 :: runtime-config  src/config/sessions/session-entry-deletion.test.ts > prepares retained-window references before BEGIN and rechecks writes (false)
```
AssertionError: expected [ false, true ] to deeply equal [ false ]
- Expected
+ Received
  [
    false,
+   true,
  ]
 ❯ src/config/sessions/session-entry-deletion.test.ts:<redacted len=6>
    251|       statements.unsubscribe(observe);
    252|     }
    253|     expect(scans).toEqual(changed ? [false, true] : [false]);
       |                   ^
    254|     expect(
    255|       database.db
⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯
 Test Files  1 failed | 60 passed | 1 skipped (62)
```

### compact-large-16 :: cron  src/cron/maintenance-lifecycle.test.ts > finishes retention and rearms after a notifying preparation ends during a read
```
Error: Test timed out in 120000ms.
If this is a long-running test, pass a timeout value as the last argument or configure it globally with "testTimeout".
 ❯ src/cron/maintenance-lifecycle.test.ts:130:1
    128| });
    129|
    130| it("finishes retention and rearms after a notifying preparation ends d…
       | ^
    131|   const readEntered = createDeferredCore();
    132|   const readReply = createDeferredCore();
⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[2/17]⎯
 FAIL   cron  src/cron/maintenance-lifecycle.test.ts > runs healthy retention independently, pending=false, notification=none
 FAIL   cron  src/cron/maintenance-lifecycle.test.ts > runs healthy retention independently, pending=true, notification=none
 FAIL   cron  src/cron/maintenance-lifecycle.test.ts > runs healthy retention independently, pending=true, notification=agent
 FAIL   cron  src/cron/maintenance-lifecycle.test.ts > runs healthy retention independently, pending=true, notification=history
AssertionError: expected "vi.fn()" to be called once, but got 0 times
 ❯ src/cron/maintenance-lifecycle.test.ts:191:31
```

### compact-large-16 :: cron  src/cron/maintenance-lifecycle.test.ts > keeps pending database admission private when its publisher wakes retention
```
AssertionError: expected last "vi.fn()" call to have been called with [ …(2) ]
- Expected:
[
  "Session registry maintenance completed",
  ObjectContaining {
    "skippedStores": 1,
  },
]
+ Received:
undefined
 ❯ src/cron/maintenance-lifecycle.test.ts:117:24
    115|     sessionChanges.emit({ all: true, scope: { agentId: "main", topolog…
    116|     await clock.advanceBy(0);
    117|     expect(mocks.info).toHaveBeenLastCalledWith(
       |                        ^
    118|       "Session registry maintenance completed",
```

### compact-large-16 :: cron  src/cron/maintenance-lifecycle.test.ts > retains a registry invalidation received during its read
```
Error: Test timed out in 120000ms.
If this is a long-running test, pass a timeout value as the last argument or configure it globally with "testTimeout".
 ❯ src/cron/maintenance-lifecycle.test.ts:255:42
    253| );
    254|
    255| it.each(["registry", "history"] as const)(
       |                                          ^
    256|   "retains a %s invalidation received during its read",
    257|   async (owner) => {
⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[6/17]⎯
 FAIL   cron  src/cron/maintenance-snapshot.test.ts > handles snapshot invalidation: pending deletion through the real maintenance scheduler
 FAIL   cron  src/cron/maintenance-snapshot.test.ts > handles snapshot invalidation: completed deletion through the real maintenance scheduler
 FAIL   cron  src/cron/maintenance-snapshot.test.ts > handles snapshot invalidation: registration removal through the real maintenance scheduler
 FAIL   cron  src/cron/maintenance-snapshot.test.ts > handles snapshot invalidation: after healthy target through the real maintenance scheduler
 FAIL   cron  src/cron/maintenance-snapshot.test.ts > handles snapshot invalidation: stop before retry through the real maintenance scheduler
Error: Test timed out in 120000ms.
```

### compact-large-16 :: cron  src/cron/maintenance-lifecycle.test.ts > runs healthy retention independently, pending=false, notification=none
```
 FAIL   cron  src/cron/maintenance-lifecycle.test.ts > runs healthy retention independently, pending=true, notification=none
 FAIL   cron  src/cron/maintenance-lifecycle.test.ts > runs healthy retention independently, pending=true, notification=agent
 FAIL   cron  src/cron/maintenance-lifecycle.test.ts > runs healthy retention independently, pending=true, notification=history
AssertionError: expected "vi.fn()" to be called once, but got 0 times
 ❯ src/cron/maintenance-lifecycle.test.ts:191:31
    189|       const tick = clock.advanceBy(5_000);
    190|       try {
    191|         expect(mocks.history).toHaveBeenCalledOnce();
       |                               ^
    192|         await tick;
    193|         expect(mocks.history).toHaveBeenCalledOnce();
 ❯ src/state/agent-database-startup.ts:738:15
 ❯ AsyncContext.run src/shared/async-context.ts:30:14
 ❯ withAgentDatabasePreparationContext src/state/agent-database-preparation-context.ts:71:72
 ❯ src/state/agent-database-startup.ts:736:7
 ❯ Module.withAgentDatabaseStartupAdmission src/state/agent-database-startup.ts:735:35
```

### compact-large-16 :: cron  src/cron/maintenance-lifecycle.test.ts > runs healthy retention independently, pending=true, notification=agent
```
 FAIL   cron  src/cron/maintenance-lifecycle.test.ts > runs healthy retention independently, pending=true, notification=history
AssertionError: expected "vi.fn()" to be called once, but got 0 times
 ❯ src/cron/maintenance-lifecycle.test.ts:191:31
    189|       const tick = clock.advanceBy(5_000);
    190|       try {
    191|         expect(mocks.history).toHaveBeenCalledOnce();
       |                               ^
    192|         await tick;
    193|         expect(mocks.history).toHaveBeenCalledOnce();
 ❯ src/state/agent-database-startup.ts:738:15
 ❯ AsyncContext.run src/shared/async-context.ts:30:14
 ❯ withAgentDatabasePreparationContext src/state/agent-database-preparation-context.ts:71:72
 ❯ src/state/agent-database-startup.ts:736:7
 ❯ Module.withAgentDatabaseStartupAdmission src/state/agent-database-startup.ts:735:35
 ❯ src/cron/maintenance-lifecycle.test.ts:175:11
⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[3/17]⎯
```

### compact-large-16 :: cron  src/cron/maintenance-lifecycle.test.ts > runs healthy retention independently, pending=true, notification=history
```
AssertionError: expected "vi.fn()" to be called once, but got 0 times
 ❯ src/cron/maintenance-lifecycle.test.ts:191:31
    189|       const tick = clock.advanceBy(5_000);
    190|       try {
    191|         expect(mocks.history).toHaveBeenCalledOnce();
       |                               ^
    192|         await tick;
    193|         expect(mocks.history).toHaveBeenCalledOnce();
 ❯ src/state/agent-database-startup.ts:738:15
 ❯ AsyncContext.run src/shared/async-context.ts:30:14
 ❯ withAgentDatabasePreparationContext src/state/agent-database-preparation-context.ts:71:72
 ❯ src/state/agent-database-startup.ts:736:7
 ❯ Module.withAgentDatabaseStartupAdmission src/state/agent-database-startup.ts:735:35
 ❯ src/cron/maintenance-lifecycle.test.ts:175:11
⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[3/17]⎯
 FAIL   cron  src/cron/maintenance-lifecycle.test.ts > sleeps until the retained session deadline when history is empty
```

### compact-large-16 :: cron  src/cron/maintenance-lifecycle.test.ts > runs healthy retention independently, pending=true, notification=none
```
 FAIL   cron  src/cron/maintenance-lifecycle.test.ts > runs healthy retention independently, pending=true, notification=agent
 FAIL   cron  src/cron/maintenance-lifecycle.test.ts > runs healthy retention independently, pending=true, notification=history
AssertionError: expected "vi.fn()" to be called once, but got 0 times
 ❯ src/cron/maintenance-lifecycle.test.ts:191:31
    189|       const tick = clock.advanceBy(5_000);
    190|       try {
    191|         expect(mocks.history).toHaveBeenCalledOnce();
       |                               ^
    192|         await tick;
    193|         expect(mocks.history).toHaveBeenCalledOnce();
 ❯ src/state/agent-database-startup.ts:738:15
 ❯ AsyncContext.run src/shared/async-context.ts:30:14
 ❯ withAgentDatabasePreparationContext src/state/agent-database-preparation-context.ts:71:72
 ❯ src/state/agent-database-startup.ts:736:7
 ❯ Module.withAgentDatabaseStartupAdmission src/state/agent-database-startup.ts:735:35
 ❯ src/cron/maintenance-lifecycle.test.ts:175:11
```

### compact-large-16 :: cron  src/cron/maintenance-lifecycle.test.ts > sleeps until the retained session deadline when history is empty
```
AssertionError: expected "vi.fn()" to be called once, but got 0 times
 ❯ src/cron/maintenance-lifecycle.test.ts:219:25
    217|   await clock.advanceBy(5_000);
    218|   await clock.advanceTo(65_000);
    219|   expect(mocks.history).toHaveBeenCalledOnce();
       |                         ^
    220|   expect(mocks.registry).toHaveBeenCalledOnce();
    221|   expect(mocks.registry).toHaveBeenLastCalledWith(expect.objectContain…
⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[4/17]⎯
 FAIL   cron  src/cron/maintenance-lifecycle.test.ts > wakes for committed session changes and replaces their previous expiry without polling unrelated sessions
 FAIL   cron  src/cron/maintenance-lifecycle.test.ts > wakes for committed stores changes and replaces their previous expiry without polling unrelated sessions
 FAIL   cron  src/cron/maintenance-lifecycle.test.ts > wakes for committed config changes and replaces their previous expiry without polling unrelated sessions
 FAIL   cron  src/cron/maintenance-lifecycle.test.ts > wakes for committed agent-ready changes and replaces their previous expiry without polling unrelated sessions
AssertionError: expected "vi.fn()" to be called once, but got 0 times
 ❯ src/cron/maintenance-lifecycle.test.ts:238:28
    236|     sessionChanges.emit({ sessionKey: "<redacted len=15>", scope: "sessi…
```

### compact-large-16 :: cron  src/cron/maintenance-lifecycle.test.ts > wakes for committed agent-ready changes and replaces their previous expiry without polling unrelated sessions
```
AssertionError: expected "vi.fn()" to be called once, but got 0 times
 ❯ src/cron/maintenance-lifecycle.test.ts:238:28
    236|     sessionChanges.emit({ sessionKey: "<redacted len=15>", scope: "sessi…
    237|     await clock.advanceTo(65_000);
    238|     expect(mocks.registry).toHaveBeenCalledOnce();
       |                            ^
    239|
    240|     mocks.registry.mockResolvedValueOnce({ nextSweepAtMs: 500_000 });
⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[5/17]⎯
 FAIL   cron  src/cron/maintenance-lifecycle.test.ts > retains a registry invalidation received during its read
Error: Test timed out in 120000ms.
If this is a long-running test, pass a timeout value as the last argument or configure it globally with "testTimeout".
 ❯ src/cron/maintenance-lifecycle.test.ts:255:42
    253| );
    254|
    255| it.each(["registry", "history"] as const)(
```

### compact-large-16 :: cron  src/cron/maintenance-lifecycle.test.ts > wakes for committed config changes and replaces their previous expiry without polling unrelated sessions
```
 FAIL   cron  src/cron/maintenance-lifecycle.test.ts > wakes for committed agent-ready changes and replaces their previous expiry without polling unrelated sessions
AssertionError: expected "vi.fn()" to be called once, but got 0 times
 ❯ src/cron/maintenance-lifecycle.test.ts:238:28
    236|     sessionChanges.emit({ sessionKey: "<redacted len=15>", scope: "sessi…
    237|     await clock.advanceTo(65_000);
    238|     expect(mocks.registry).toHaveBeenCalledOnce();
       |                            ^
    239|
    240|     mocks.registry.mockResolvedValueOnce({ nextSweepAtMs: 500_000 });
⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[5/17]⎯
 FAIL   cron  src/cron/maintenance-lifecycle.test.ts > retains a registry invalidation received during its read
Error: Test timed out in 120000ms.
If this is a long-running test, pass a timeout value as the last argument or configure it globally with "testTimeout".
 ❯ src/cron/maintenance-lifecycle.test.ts:255:42
    253| );
    254|
```

### compact-large-16 :: cron  src/cron/maintenance-lifecycle.test.ts > wakes for committed session changes and replaces their previous expiry without polling unrelated sessions
```
 FAIL   cron  src/cron/maintenance-lifecycle.test.ts > wakes for committed stores changes and replaces their previous expiry without polling unrelated sessions
 FAIL   cron  src/cron/maintenance-lifecycle.test.ts > wakes for committed config changes and replaces their previous expiry without polling unrelated sessions
 FAIL   cron  src/cron/maintenance-lifecycle.test.ts > wakes for committed agent-ready changes and replaces their previous expiry without polling unrelated sessions
AssertionError: expected "vi.fn()" to be called once, but got 0 times
 ❯ src/cron/maintenance-lifecycle.test.ts:238:28
    236|     sessionChanges.emit({ sessionKey: "<redacted len=15>", scope: "sessi…
    237|     await clock.advanceTo(65_000);
    238|     expect(mocks.registry).toHaveBeenCalledOnce();
       |                            ^
    239|
    240|     mocks.registry.mockResolvedValueOnce({ nextSweepAtMs: 500_000 });
⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[5/17]⎯
 FAIL   cron  src/cron/maintenance-lifecycle.test.ts > retains a registry invalidation received during its read
Error: Test timed out in 120000ms.
If this is a long-running test, pass a timeout value as the last argument or configure it globally with "testTimeout".
 ❯ src/cron/maintenance-lifecycle.test.ts:255:42
```

### compact-large-16 :: cron  src/cron/maintenance-lifecycle.test.ts > wakes for committed stores changes and replaces their previous expiry without polling unrelated sessions
```
 FAIL   cron  src/cron/maintenance-lifecycle.test.ts > wakes for committed config changes and replaces their previous expiry without polling unrelated sessions
 FAIL   cron  src/cron/maintenance-lifecycle.test.ts > wakes for committed agent-ready changes and replaces their previous expiry without polling unrelated sessions
AssertionError: expected "vi.fn()" to be called once, but got 0 times
 ❯ src/cron/maintenance-lifecycle.test.ts:238:28
    236|     sessionChanges.emit({ sessionKey: "<redacted len=15>", scope: "sessi…
    237|     await clock.advanceTo(65_000);
    238|     expect(mocks.registry).toHaveBeenCalledOnce();
       |                            ^
    239|
    240|     mocks.registry.mockResolvedValueOnce({ nextSweepAtMs: 500_000 });
⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[5/17]⎯
 FAIL   cron  src/cron/maintenance-lifecycle.test.ts > retains a registry invalidation received during its read
Error: Test timed out in 120000ms.
If this is a long-running test, pass a timeout value as the last argument or configure it globally with "testTimeout".
 ❯ src/cron/maintenance-lifecycle.test.ts:255:42
    253| );
```

### compact-large-16 :: cron  src/cron/maintenance-snapshot.test.ts > handles snapshot invalidation: after healthy target through the real maintenance scheduler
```
 FAIL   cron  src/cron/maintenance-snapshot.test.ts > handles snapshot invalidation: stop before retry through the real maintenance scheduler
Error: Test timed out in 120000ms.
If this is a long-running test, pass a timeout value as the last argument or configure it globally with "testTimeout".
 ❯ src/cron/maintenance-snapshot.test.ts:39:3
     37|   "after healthy target",
     38|   "stop before retry",
     39| ])("handles snapshot invalidation: %s through the real maintenance sch…
       |   ^
     40|   await withOpenClawTestState({ scenario: "minimal" }, async (state) =…
     41|     resetGatewayWorkAdmission();
⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[7/17]⎯
 Test Files  2 failed | 106 passed (108)
      Tests  17 failed | 1067 passed | 1 skipped (1085)
   Start at  12:52:19
   Duration  782.71s (tests 93%, transform 4%, import 2%)
[test] failed 1 Vitest shard in 783.92s
```

### compact-large-16 :: cron  src/cron/maintenance-snapshot.test.ts > handles snapshot invalidation: completed deletion through the real maintenance scheduler
```
 FAIL   cron  src/cron/maintenance-snapshot.test.ts > handles snapshot invalidation: registration removal through the real maintenance scheduler
 FAIL   cron  src/cron/maintenance-snapshot.test.ts > handles snapshot invalidation: after healthy target through the real maintenance scheduler
 FAIL   cron  src/cron/maintenance-snapshot.test.ts > handles snapshot invalidation: stop before retry through the real maintenance scheduler
Error: Test timed out in 120000ms.
If this is a long-running test, pass a timeout value as the last argument or configure it globally with "testTimeout".
 ❯ src/cron/maintenance-snapshot.test.ts:39:3
     37|   "after healthy target",
     38|   "stop before retry",
     39| ])("handles snapshot invalidation: %s through the real maintenance sch…
       |   ^
     40|   await withOpenClawTestState({ scenario: "minimal" }, async (state) =…
     41|     resetGatewayWorkAdmission();
⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[7/17]⎯
 Test Files  2 failed | 106 passed (108)
      Tests  17 failed | 1067 passed | 1 skipped (1085)
   Start at  12:52:19
```

### compact-large-16 :: cron  src/cron/maintenance-snapshot.test.ts > handles snapshot invalidation: pending deletion through the real maintenance scheduler
```
 FAIL   cron  src/cron/maintenance-snapshot.test.ts > handles snapshot invalidation: completed deletion through the real maintenance scheduler
 FAIL   cron  src/cron/maintenance-snapshot.test.ts > handles snapshot invalidation: registration removal through the real maintenance scheduler
 FAIL   cron  src/cron/maintenance-snapshot.test.ts > handles snapshot invalidation: after healthy target through the real maintenance scheduler
 FAIL   cron  src/cron/maintenance-snapshot.test.ts > handles snapshot invalidation: stop before retry through the real maintenance scheduler
Error: Test timed out in 120000ms.
If this is a long-running test, pass a timeout value as the last argument or configure it globally with "testTimeout".
 ❯ src/cron/maintenance-snapshot.test.ts:39:3
     37|   "after healthy target",
     38|   "stop before retry",
     39| ])("handles snapshot invalidation: %s through the real maintenance sch…
       |   ^
     40|   await withOpenClawTestState({ scenario: "minimal" }, async (state) =…
     41|     resetGatewayWorkAdmission();
⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[7/17]⎯
 Test Files  2 failed | 106 passed (108)
      Tests  17 failed | 1067 passed | 1 skipped (1085)
```

### compact-large-16 :: cron  src/cron/maintenance-snapshot.test.ts > handles snapshot invalidation: registration removal through the real maintenance scheduler
```
 FAIL   cron  src/cron/maintenance-snapshot.test.ts > handles snapshot invalidation: after healthy target through the real maintenance scheduler
 FAIL   cron  src/cron/maintenance-snapshot.test.ts > handles snapshot invalidation: stop before retry through the real maintenance scheduler
Error: Test timed out in 120000ms.
If this is a long-running test, pass a timeout value as the last argument or configure it globally with "testTimeout".
 ❯ src/cron/maintenance-snapshot.test.ts:39:3
     37|   "after healthy target",
     38|   "stop before retry",
     39| ])("handles snapshot invalidation: %s through the real maintenance sch…
       |   ^
     40|   await withOpenClawTestState({ scenario: "minimal" }, async (state) =…
     41|     resetGatewayWorkAdmission();
⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[7/17]⎯
 Test Files  2 failed | 106 passed (108)
      Tests  17 failed | 1067 passed | 1 skipped (1085)
   Start at  12:52:19
   Duration  782.71s (tests 93%, transform 4%, import 2%)
```

### compact-large-16 :: cron  src/cron/maintenance-snapshot.test.ts > handles snapshot invalidation: stop before retry through the real maintenance scheduler
```
Error: Test timed out in 120000ms.
If this is a long-running test, pass a timeout value as the last argument or configure it globally with "testTimeout".
 ❯ src/cron/maintenance-snapshot.test.ts:39:3
     37|   "after healthy target",
     38|   "stop before retry",
     39| ])("handles snapshot invalidation: %s through the real maintenance sch…
       |   ^
     40|   await withOpenClawTestState({ scenario: "minimal" }, async (state) =…
     41|     resetGatewayWorkAdmission();
⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[7/17]⎯
 Test Files  2 failed | 106 passed (108)
      Tests  17 failed | 1067 passed | 1 skipped (1085)
   Start at  12:52:19
   Duration  782.71s (tests 93%, transform 4%, import 2%)
[test] failed 1 Vitest shard in 783.92s
[test] FAILED (exit 1)
```

### compact-large-19 :: gateway-database-workers  src/gateway/operator-approval-placement-grants.test.ts > placement standing grants > skips the second launch and re-prompts after the placement generation changes
```
AssertionError: expected true to be false // Object.is equality
- Expected
+ Received
- false
+ true
 ❯ src/gateway/operator-approval-placement-grants.test.ts:512:71
    510|       const { record: staleApproval, pending: staleLaunch } = await re…
    511|       placementAuthorityActive = false;
    512|       expect(await manager.resolve(staleApproval.id, "allow-always")).…
       |                                                                       ^
    513|       await expect(staleLaunch).resolves.toMatchObject({ ok: false, co…
    514|       placementAuthorityActive = true;
 ❯ src/gateway/exec-approval-manager.test-support.ts:135:20
⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯
 Test Files  1 failed | 31 passed (32)
      Tests  1 failed | 289 passed | 1 skipped (291)
```

### compact-large-19 :: gateway-methods  src/gateway/server-methods/environments.test.ts > fails closed and redacts environments.status {"environmentId":"missing"} read failures
```
AssertionError: expected [ false, undefined, { …(3) } ] to deeply equal [ false, undefined, { …(2) } ]
- Expected
+ Received
  [
    false,
    undefined,
    {
      "code": "UNAVAILABLE",
-     "message": "environment status unavailable",
+     "message": "TypeError: Cannot read properties of undefined (reading 'bindings')",
    },
  ]
 ❯ src/gateway/server-methods/environments.test.ts:306:20
    304|     });
    305|     const result = await call(method, params, { service });
    306|     expect(result).toEqual([false, undefined, { code: ErrorCodes.UNAVA…
```

### compact-large-19 :: gateway-methods  src/gateway/server-methods/environments.test.ts > preserves pairing ownership for destroyed static-ssh workers bound to node-live
```
 FAIL   gateway-methods  src/gateway/server-methods/environments.test.ts > preserves pairing ownership for ready device workers bound to node-live
AssertionError: expected false to be true // Object.is equality
- Expected
+ Received
- true
+ false
 ❯ src/gateway/server-methods/environments.test.ts:274:16
    272|     });
    273|     const [ok, payload] = await call("environments.list", {}, { servic…
    274|     expect(ok).toBe(true);
       |                ^
    275|     const { environments } = payload as EnvironmentsListResult;
    276|     expect(environments.some((entry) => entry.id === "node:node-live")…
⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[3/8]⎯
 FAIL   gateway-methods  src/gateway/server-methods/environments.test.ts > fails closed and redacts environments.status {"environmentId":"missing"} read failures
AssertionError: expected [ false, undefined, { …(3) } ] to deeply equal [ false, undefined, { …(2) } ]
```

### compact-large-19 :: gateway-methods  src/gateway/server-methods/environments.test.ts > preserves pairing ownership for failed static-ssh workers bound to node-live
```
 FAIL   gateway-methods  src/gateway/server-methods/environments.test.ts > preserves pairing ownership for orphaned static-ssh workers bound to undefined
 FAIL   gateway-methods  src/gateway/server-methods/environments.test.ts > preserves pairing ownership for destroyed static-ssh workers bound to node-live
 FAIL   gateway-methods  src/gateway/server-methods/environments.test.ts > preserves pairing ownership for ready device workers bound to node-live
AssertionError: expected false to be true // Object.is equality
- Expected
+ Received
- true
+ false
 ❯ src/gateway/server-methods/environments.test.ts:274:16
    272|     });
    273|     const [ok, payload] = await call("environments.list", {}, { servic…
    274|     expect(ok).toBe(true);
       |                ^
    275|     const { environments } = payload as EnvironmentsListResult;
    276|     expect(environments.some((entry) => entry.id === "node:node-live")…
⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[3/8]⎯
```

### compact-large-19 :: gateway-methods  src/gateway/server-methods/environments.test.ts > preserves pairing ownership for orphaned static-ssh workers bound to undefined
```
 FAIL   gateway-methods  src/gateway/server-methods/environments.test.ts > preserves pairing ownership for destroyed static-ssh workers bound to node-live
 FAIL   gateway-methods  src/gateway/server-methods/environments.test.ts > preserves pairing ownership for ready device workers bound to node-live
AssertionError: expected false to be true // Object.is equality
- Expected
+ Received
- true
+ false
 ❯ src/gateway/server-methods/environments.test.ts:274:16
    272|     });
    273|     const [ok, payload] = await call("environments.list", {}, { servic…
    274|     expect(ok).toBe(true);
       |                ^
    275|     const { environments } = payload as EnvironmentsListResult;
    276|     expect(environments.some((entry) => entry.id === "node:node-live")…
⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[3/8]⎯
 FAIL   gateway-methods  src/gateway/server-methods/environments.test.ts > fails closed and redacts environments.status {"environmentId":"missing"} read failures
```

### compact-large-19 :: gateway-methods  src/gateway/server-methods/environments.test.ts > preserves pairing ownership for ready device workers bound to node-live
```
AssertionError: expected false to be true // Object.is equality
- Expected
+ Received
- true
+ false
 ❯ src/gateway/server-methods/environments.test.ts:274:16
    272|     });
    273|     const [ok, payload] = await call("environments.list", {}, { servic…
    274|     expect(ok).toBe(true);
       |                ^
    275|     const { environments } = payload as EnvironmentsListResult;
    276|     expect(environments.some((entry) => entry.id === "node:node-live")…
⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[3/8]⎯
 FAIL   gateway-methods  src/gateway/server-methods/environments.test.ts > fails closed and redacts environments.status {"environmentId":"missing"} read failures
AssertionError: expected [ false, undefined, { …(3) } ] to deeply equal [ false, undefined, { …(2) } ]
- Expected
```

### compact-large-19 :: gateway-methods  src/gateway/server-methods/environments.test.ts > probes disabled host setup only when requested without advertising or granting desktop access
```
AssertionError: expected false to be true // Object.is equality
- Expected
+ Received
- true
+ false
 ❯ src/gateway/server-methods/environments.test.ts:74:21
     72|   });
     73|   const [defaultOk, defaultPayload] = await call("environments.list", …
     74|   expect(defaultOk).toBe(true);
       |                     ^
     75|   expect(probe).not.toHaveBeenCalled();
     76|   expect(defaultPayload).not.toHaveProperty("environments.0.desktopSet…
⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/8]⎯
 FAIL   gateway-methods  src/gateway/server-methods/environments.test.ts > projects live and offline node facts consistently through list and status
AssertionError: expected false to be true // Object.is equality
- Expected
```

### compact-large-19 :: gateway-methods  src/gateway/server-methods/environments.test.ts > projects live and offline node facts consistently through list and status
```
AssertionError: expected false to be true // Object.is equality
- Expected
+ Received
- true
+ false
 ❯ src/gateway/server-methods/environments.test.ts:164:14
    162|   };
    163|   const [ok, payload] = await invoke("environments.list", { includeDes…
    164|   expect(ok).toBe(true);
       |              ^
    165|   const { environments }: EnvironmentsListResult = payload;
    166|   const find = (id: string) => environments.find((entry) => entry.id =…
⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[2/8]⎯
 FAIL   gateway-methods  src/gateway/server-methods/environments.test.ts > preserves pairing ownership for failed static-ssh workers bound to node-live
 FAIL   gateway-methods  src/gateway/server-methods/environments.test.ts > preserves pairing ownership for orphaned static-ssh workers bound to undefined
 FAIL   gateway-methods  src/gateway/server-methods/environments.test.ts > preserves pairing ownership for destroyed static-ssh workers bound to node-live
```

### compact-large-19 :: gateway-methods  src/gateway/server-methods/environments.test.ts > rejects environments.status without a configured target
```
AssertionError: expected { code: 'UNAVAILABLE', …(2) } to deeply equal { code: 'INVALID_REQUEST', …(1) }
- Expected
+ Received
  {
-   "code": "INVALID_REQUEST",
-   "message": "unknown environmentId",
+   "code": "UNAVAILABLE",
+   "message": "TypeError: Cannot read properties of undefined (reading 'bindings')",
  }
 ❯ expectFailure src/gateway/server-methods/environments.test.ts:53:23
     51| function expectFailure(response: unknown[], code: string, message: str…
     52|   expect(response[0]).toBe(false);
     53|   expect(response[2]).toEqual({ code, message });
       |                       ^
     54| }
     55| let runtimeState: ReturnType<typeof collectNodeCatalogRuntimeState>;
```

### compact-large-20 :: infra  src/infra/shell-env.test.ts > shell env fallback > uses interactive Bash login startup before nounset reads PS1
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
```

### compact-large-24 :: gateway-core  src/gateway/agent-turn/agent-request-preflight.test.ts > agent request reserved continuation run ids > admits a continuation key from a backend caller as the run id verbatim
```
AssertionError: expected "vi.fn()" to not be called at all, but actually been called 1 times
Received:
  1st vi.fn() call:
    Array [
      false,
      undefined,
      Object {
        "code": "INVALID_REQUEST",
        "message": "continuation run ids are reserved for backend callers.",
      },
    ]
Number of calls: 1
 ❯ src/gateway/agent-turn/agent-request-preflight.test.ts:375:25
    373|     );
    374|
    375|     expect(respond).not.toHaveBeenCalled();
```

### compact-large-27 :: unit-src  src/state/openclaw-database-preflight.artifacts.test.ts > falls back to the private snapshot when the last owner closes during a preserving read
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
      Tests  1 failed | 2354 passed | 26 skipped (2381)
   Start at  13:06:50
   Duration  284.37s (tests 73%, transform 22%, import 3%, worker 1%, setup 1%)
[test] failed 1 Vitest shard in 285.85s
[test] FAILED (exit 1)
end (exit 1)
```

### compact-large-35 :: commands  src/commands/doctor-session-transcript-labels.reuse.test.ts > update Doctor retained transcript scan reuse > does not scan unchanged retained history twice across update passes
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
      Tests  1 failed | 415 passed (416)
   Start at  12:56:08
   Duration  697.09s (tests 96%, transform 2%, import 2%)
[test] failed 1 Vitest shard in 698.71s
[test] FAILED (exit 1)
end (exit 1)
```

### compact-large-35 :: infra  src/infra/package-update-permission-drift.test.ts > publication permission drift > repairs a recursive named-user POSIX ACL
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
Serialized Error: { errno: -2, code: 'ENOENT', syscall: 'spawnSync setfacl', path: 'setfacl', spawnargs: [ '-R', '-m', 'u:65534:rwX', '/tmp/oc4e43d9/.oc-ci-tmp/szjJ/t/oc-vt-up2jiv/oc-vt-t7O5V1/publication-permission-drift-nxlAYz' ], error: { stack: 'Error: spawnSync setfacl ENOENT
    at Object.spawnSync (node:internal/child_process:1175:20)
    at spawnSync (node:child_process:976:24)
    at execFileSync (node:child_process:1019:15)
    at /home/runner/_work/_temp/ci-batch-work-44733879344-1-local-batch-049/shard-0-compact-large-35/src/infra/package-update-permission-drift.test.ts:124:5
    at file:///home/runner/_work/_temp/ci-batch-work-44733879344-1-local-batch-049/shard-0-compact-large-35/node_modules/.pnpm/vitest@5.0.5_patch_hash=a2a78abe9470cc2ceb0d4eeb81acfc62d6180e9990bc866a7771ba60b1320ea_75661d0a5892d48edf76140ec77ed19d/node_modules/vitest/dist/chunks/run.BPv-BBRv.js:1632:35
    at file:///home/runner/_work/_temp/ci-batch-work-44733879344-1-local-batch-049/shard-0-compact-large-35/node_modules/.pnpm/vitest@5.0.5_patch_hash=a2a78abe9470cc2ceb0d4eeb81acfc62d6180e9990bc866a7771ba60b1320ea_75661d0a5892d48edf76140ec77ed19d/node_modules/vitest/dist/chunks/run.BPv-BBRv.js:2801:26
```

### compact-large-35 :: infra  src/infra/update-doctor-migration-attribution.test.ts > completes retirement after Doctor migrations and native parent bookkeeping
```
Error: Test timed out in 120000ms.
If this is a long-running test, pass a timeout value as the last argument or configure it globally with "testTimeout".
 ❯ src/infra/update-doctor-migration-attribution.test.ts:644:39
    642| );
    643|
    644| it.each(["native", "worker"] as const)(
       |                                       ^
    645|   "completes retirement after Doctor migrations and %s parent bookkeep…
    646|   async (parent) =>
⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[2/3]⎯
 FAIL   infra  src/infra/update-retained-runtime-imports.process.test.ts > keeps bun late imports on the old generation through replacement and CLI teardown
Error: [openclaw] CI job core-runtime-infra-system-runtime-hosted-2: Bun revision verification failed: spawnSync bun ENOENT. Run .github/actions/setup-test-bun before tests.
 ❯ requirePinnedBun scripts/lib/pinned-bun.mts:189:13
    187|       }
    188|     } catch (error) {
    189|       throw new Error(
```

### compact-large-35 :: infra  src/infra/update-retained-runtime-imports.process.test.ts > keeps bun late imports on the old generation through replacement and CLI teardown
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
```

### compact-large-35 :: unit-fast  src/infra/worker-task-pool.memory.test.ts > collects a completed large external payload while keeping the bounded worker warm
```
AssertionError: expected 71084839 to be less than 37727243
 ❯ src/infra/worker-task-pool.memory.test.ts:45:29
     43|       const allocationBytes = memoryKind === "heap" ? 100 * 1024 * 102…
     44|       expect(allocated[counter]).toBeGreaterThan(warm[counter] + alloc…
     45|       expect(idle[counter]).toBeLessThan(warm[counter] + 32 * 1024 * 1…
       |                             ^
     46|       expect(cachedDataVersionTag()).toBe(cacheVersion);
     47|       const reused = await pool.run({}, {});
⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/2]⎯
 FAIL   unit-fast  test/scripts/bench-session-history.test.ts > keeps the source benchmark JSON parseable across all history readers
AssertionError: [state/agent-db] agent database clean-close receipt: written; agent=main
small/recent measured
small/page measured
: expected Error: spawnSync /home/runner/_work/_tool… { …(5) } to be undefined
- Expected:
undefined
```

### compact-large-35 :: unit-fast  test/scripts/bench-session-history.test.ts > keeps the source benchmark JSON parseable across all history readers
```
AssertionError: [state/agent-db] agent database clean-close receipt: written; agent=main
small/recent measured
small/page measured
: expected Error: spawnSync /home/runner/_work/_tool… { …(5) } to be undefined
- Expected:
undefined
+ Received:
Error {
  "message": "spawnSync /home/runner/_work/_tool/node/26.12.1/x64/bin/node ETIMEDOUT",
  "errno": -110,
  "code": "ETIMEDOUT",
  "syscall": "spawnSync /home/runner/_work/_tool/node/26.12.1/x64/bin/node",
  "path": "/home/runner/_work/_tool/node/26.12.1/x64/bin/node",
  "spawnargs": [
    "--import",
    "./scripts/tsx.mjs",
```

### compact-large-36 :: ui  ui/src/test-helpers/new-session-page-opener.node.test.ts > captures New Session failures before closing their contexts and starting the next test
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
```

### compact-large-38 :: gateway-server (gateway-server-parallel)  src/gateway/server.config-record-keys.test.ts > allows nested destructive array patches inside id-keyed arrays with replacePaths
```
 FAIL   gateway-server (gateway-server-parallel)  src/gateway/server.config-write-reread.test.ts > gateway config canonical rereads > config.set settles when an external edit invalidates the canonical reread
GatewayClientRequestTimeoutError: gateway request timeout for config.apply
 ❯ Object.createRequestTimeoutError packages/gateway-client/src/client.ts:285:9
    283|       createRequestError: (error) => new GatewayClientRequestError(err…
    284|       createRequestTimeoutError: (method, timeoutMs, requestSent) =>
    285|         new GatewayClientRequestTimeoutError({ method, timeoutMs, requ…
       |         ^
    286|       createRequestAbortError: (method) =>
    287|         createAbortError(`gateway request aborted for ${method}`),
 ❯ Timeout.<anonymous> packages/gateway-client/src/pending-request.ts:243:23
⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯
Serialized Error: { code: 'CLIENT_TIMEOUT', method: 'config.apply', timeoutMs: 10000, requestSent: true }
⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/2]⎯
 Test Files  2 failed | 12 passed (14)
      Tests  2 failed | 26 passed (28)
   Start at  14:46:01
```

### compact-large-38 :: gateway-server (gateway-server-parallel)  src/gateway/server.config-write-reread.test.ts > gateway config canonical rereads > config.set settles when an external edit invalidates the canonical reread
```
GatewayClientRequestTimeoutError: gateway request timeout for config.apply
 ❯ Object.createRequestTimeoutError packages/gateway-client/src/client.ts:285:9
    283|       createRequestError: (error) => new GatewayClientRequestError(err…
    284|       createRequestTimeoutError: (method, timeoutMs, requestSent) =>
    285|         new GatewayClientRequestTimeoutError({ method, timeoutMs, requ…
       |         ^
    286|       createRequestAbortError: (method) =>
    287|         createAbortError(`gateway request aborted for ${method}`),
 ❯ Timeout.<anonymous> packages/gateway-client/src/pending-request.ts:243:23
⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯
Serialized Error: { code: 'CLIENT_TIMEOUT', method: 'config.apply', timeoutMs: 10000, requestSent: true }
⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/2]⎯
 Test Files  2 failed | 12 passed (14)
      Tests  2 failed | 26 passed (28)
   Start at  14:46:01
   Duration  157.71s (tests 93%, transform 3%, import 3%)
```

### compact-large-41 :: gateway-server (gateway-server-native)  src/gateway/server.plugin-reload-send-revocation.product.test.ts > runs Bob's allowed and revoked retained sends in a prebound owned process
```
Error: Test timed out in 120000ms.
If this is a long-running test, pass a timeout value as the last argument or configure it globally with "testTimeout".
 ❯ definePluginReloadProductTest src/gateway/server.plugin-reload-product-fixture.test-support.ts:139:3
    137|     throw error;
    138|   }
    139|   it(options.name, async ({ signal }) =>
       |   ^
    140|     lifetime.run(async () => {
    141|       const root = lifetime.createTempDir(options.prefix);
 ❯ src/gateway/server.plugin-reload-send-revocation.product.test.ts:6:1
⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯
 Test Files  1 failed | 12 passed (13)
      Tests  1 failed | 158 passed (159)
   Start at  14:33:10
   Duration  329.67s (tests 87%, import 11%, transform 1%)
[test] failed 5 Vitest shards in 638.00s
```

### compact-small-12 :: tooling-isolated  test/scripts/check-extension-package-tsc-boundary.test.ts > compiles packaged roots and invalidates them when exports or inherited paths change
```
AssertionError: node:internal/modules/esm/resolve:241
    throw new ERR_MODULE_NOT_FOUND(
          ^
Error [ERR_MODULE_NOT_FOUND]: Cannot find module '/tmp/oca4898a/.oc-ci-tmp/sW29/t/oc-vt-mzHCm9/oc-vt-v9sFJH/openclaw-boundary-canary-QnZ3sl/node-runtime-env.mjs' imported from /tmp/oca4898a/.oc-ci-tmp/sW29/t/oc-vt-mzHCm9/oc-vt-v9sFJH/openclaw-boundary-canary-QnZ3sl/scripts/lib/dist-artifact-ownership.mts
    at finalizeResolution (node:internal/modules/esm/resolve:241:11)
    at moduleResolve (node:internal/modules/esm/resolve:846:10)
    at defaultResolve (node:internal/modules/esm/resolve:973:11)
    at #cachedDefaultResolve (node:internal/modules/esm/loader:708:20)
    at #resolveAndMaybeBlockOnLoaderThread (node:internal/modules/esm/loader:728:38)
    at ModuleLoader.resolveSync (node:internal/modules/esm/loader:766:56)
    at #resolve (node:internal/modules/esm/loader:690:17)
    at ModuleLoader.getOrCreateModuleJob (node:internal/modules/esm/loader:610:35)
    at ModuleJob.syncLink (node:internal/modules/esm/module_job:277:33)
    at ModuleJob.link (node:internal/modules/esm/module_job:389:17) {
  code: 'ERR_MODULE_NOT_FOUND',
  url: 'file:///tmp/oca4898a/.oc-ci-tmp/sW29/t/oc-vt-mzHCm9/oc-vt-v9sFJH/openclaw-boundary-canary-QnZ3sl/node-runtime-env.mjs'
```

### compact-small-14 :: tooling  test/scripts/package-acceptance-workflow.test.ts > package acceptance workflow > resolves broad release evidence and exact-binds every publish child
```
Error: Expected workflow step Download full release validation manifest
 ❯ workflowStep test/scripts/package-acceptance-workflow.test.ts:2882:11
    2880|   const step = job.steps?.find((candidate) => candidate.name === stepN…
    2881|   if (!step) {
    2882|     throw new Error(`Expected workflow step ${stepName}`);
       |           ^
    2883|   }
    2884|   return step;
 ❯ test/scripts/package-acceptance-workflow.test.ts:7326:14
⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/4]⎯
 FAIL   tooling  test/scripts/package-acceptance-workflow.test.ts > package artifact reuse > prepares one immutable candidate for release validation children
AssertionError: expected undefined to be 'scripts' // Object.is equality
- Expected:
"scripts"
+ Received:
undefined
```

### compact-small-14 :: tooling  test/scripts/package-acceptance-workflow.test.ts > package artifact reuse > keeps release publish artifacts and release-note ordering wired
```
Error: Expected workflow step Download full release validation manifest
 ❯ workflowStep test/scripts/package-acceptance-workflow.test.ts:2882:11
    2880|   const step = job.steps?.find((candidate) => candidate.name === stepN…
    2881|   if (!step) {
    2882|     throw new Error(`Expected workflow step ${stepName}`);
       |           ^
    2883|   }
    2884|   return step;
 ❯ test/scripts/package-acceptance-workflow.test.ts:15083:29
⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[4/4]⎯
 Test Files  1 failed (1)
      Tests  4 failed | 583 passed (587)
   Start at  14:54:27
   Duration  273.53s (tests 99%)
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 4 ⎯⎯⎯⎯⎯⎯⎯
 FAIL   tooling  test/scripts/package-acceptance-workflow.test.ts > package acceptance workflow > resolves broad release evidence and exact-binds every publish child
```

### compact-small-14 :: tooling  test/scripts/package-acceptance-workflow.test.ts > package artifact reuse > prepares one immutable candidate for release validation children
```
AssertionError: expected undefined to be 'scripts' // Object.is equality
- Expected:
"scripts"
+ Received:
undefined
 ❯ test/scripts/package-acceptance-workflow.test.ts:10269:50
    10267|       workflowStep(summary, "Checkout release state verifier"),
    10268|     ]) {
    10269|       expect(checkout.with?.["sparse-checkout"]).toBe("scripts");
       |                                                  ^
    10270|     }
    10271|     expect(discovery.outputs?.state).toBe("${{ steps.discover.outputs.…
⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[2/4]⎯
 FAIL   tooling  test/scripts/package-acceptance-workflow.test.ts > package artifact reuse > wires evidence attempts into the acceptance gate
Error: Expected workflow step Download full release validation manifest
 ❯ workflowStep test/scripts/package-acceptance-workflow.test.ts:2882:11
```

### compact-small-14 :: tooling  test/scripts/package-acceptance-workflow.test.ts > package artifact reuse > wires evidence attempts into the acceptance gate
```
Error: Expected workflow step Download full release validation manifest
 ❯ workflowStep test/scripts/package-acceptance-workflow.test.ts:2882:11
    2880|   const step = job.steps?.find((candidate) => candidate.name === stepN…
    2881|   if (!step) {
    2882|     throw new Error(`Expected workflow step ${stepName}`);
       |           ^
    2883|   }
    2884|   return step;
 ❯ test/scripts/package-acceptance-workflow.test.ts:15040:29
⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[3/4]⎯
 FAIL   tooling  test/scripts/package-acceptance-workflow.test.ts > package artifact reuse > keeps release publish artifacts and release-note ordering wired
Error: Expected workflow step Download full release validation manifest
 ❯ workflowStep test/scripts/package-acceptance-workflow.test.ts:2882:11
    2880|   const step = job.steps?.find((candidate) => candidate.name === stepN…
    2881|   if (!step) {
    2882|     throw new Error(`Expected workflow step ${stepName}`);
```

### compact-small-21 :: tooling  test/scripts/ci-node-test-plan.test.ts > scripts/lib/ci-node-test-plan.mts > keeps the scheduled main inventory within its reserved compact capacity (github, extra group: false)
```
Error: compact github node test plan exceeds 77 jobs (78 planned)
 ❯ createCompactNodeTestShardBundles scripts/lib/ci-node-test-plan.mts:5963:13
    5961|       });
    5962|     } else {
    5963|       throw new Error(
       |             ^
    5964|         `compact ${options.runnerBackend ?? "blacksmith"} node test pl…
    5965|       );
 ❯ createCompactNodeTestShardBundles scripts/lib/ci-node-test-plan.mts:5675:14
 ❯ createCompactNodeTestShardBundles scripts/lib/ci-node-test-plan.mts:5663:16
 ❯ createCompactNodeTestShardBundles scripts/lib/ci-node-test-plan.mts:5634:14
 ❯ Module.createNodeTestShardBundles scripts/lib/ci-node-test-plan.mts:3337:7
 ❯ test/scripts/ci-node-test-plan.test.ts:657:29
⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯
 Test Files  1 failed | 1 passed (2)
      Tests  1 failed | 207 passed (208)
```

### compact-small-30 :: tooling  test/scripts/vitest-worker-shutdown.test.ts > ci wrapper joins admission work before honoring SIGINT
```
Error: Missing shutdown receipt: /home/runner/_work/_temp/ci-batch-work-44733879344-1-hosted-batch-004/shard-2-compact-small-30/.artifacts/worker proof-X7t8oz/verification-ready
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
Error: Missing shutdown receipt: /home/runner/_work/_temp/ci-batch-work-44733879344-1-hosted-batch-004/shard-2-compact-small-30/.artifacts/worker proof-6E2B7m/verification-ready
 ❯ test/scripts/vitest-worker-shutdown.test.ts:344:23
    342|               // separate transports can deliver command completion fi…
    343|               if (!fs.existsSync(filename) || fs.statSync(filename).si…
    344|                 throw new Error(`Missing shutdown receipt: ${filename}…
```

### compact-small-30 :: tooling  test/scripts/vitest-worker-shutdown.test.ts > ci wrapper joins admission work before honoring SIGTERM
```
Error: Missing shutdown receipt: /home/runner/_work/_temp/ci-batch-work-44733879344-1-hosted-batch-004/shard-2-compact-small-30/.artifacts/worker proof-6E2B7m/verification-ready
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
Error: Missing shutdown receipt: /home/runner/_work/_temp/ci-batch-work-44733879344-1-hosted-batch-004/shard-2-compact-small-30/.artifacts/worker proof-8lm3W5/verification-ready
 ❯ test/scripts/vitest-worker-shutdown.test.ts:344:23
    342|               // separate transports can deliver command completion fi…
    343|               if (!fs.existsSync(filename) || fs.statSync(filename).si…
    344|                 throw new Error(`Missing shutdown receipt: ${filename}…
```

### compact-small-30 :: tooling  test/scripts/vitest-worker-shutdown.test.ts > ci wrapper joins compilation work before honoring SIGINT
```
Error: Missing shutdown receipt: /home/runner/_work/_temp/ci-batch-work-44733879344-1-hosted-batch-004/shard-2-compact-small-30/.artifacts/worker proof-Hb9blV/compiler-ready
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
Error: Missing shutdown receipt: /home/runner/_work/_temp/ci-batch-work-44733879344-1-hosted-batch-004/shard-2-compact-small-30/.artifacts/worker proof-hllxqi/compiler-ready
 ❯ test/scripts/vitest-worker-shutdown.test.ts:344:23
    342|               // separate transports can deliver command completion fi…
    343|               if (!fs.existsSync(filename) || fs.statSync(filename).si…
    344|                 throw new Error(`Missing shutdown receipt: ${filename}…
```

### compact-small-30 :: tooling  test/scripts/vitest-worker-shutdown.test.ts > ci wrapper joins compilation work before honoring SIGTERM
```
Error: Missing shutdown receipt: /home/runner/_work/_temp/ci-batch-work-44733879344-1-hosted-batch-004/shard-2-compact-small-30/.artifacts/worker proof-hllxqi/compiler-ready
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
Error: Missing shutdown receipt: /home/runner/_work/_temp/ci-batch-work-44733879344-1-hosted-batch-004/shard-2-compact-small-30/.artifacts/worker proof-naAWpg/compiler-ready
 ❯ test/scripts/vitest-worker-shutdown.test.ts:344:23
    342|               // separate transports can deliver command completion fi…
    343|               if (!fs.existsSync(filename) || fs.statSync(filename).si…
    344|                 throw new Error(`Missing shutdown receipt: ${filename}…
```

### compact-small-30 :: tooling  test/scripts/vitest-worker-shutdown.test.ts > ci wrapper joins deletion work before honoring SIGINT
```
Error: Missing shutdown receipt: /home/runner/_work/_temp/ci-batch-work-44733879344-1-hosted-batch-004/shard-2-compact-small-30/.artifacts/worker proof-JuL6cj/verification-ready
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
Error: Missing shutdown receipt: /home/runner/_work/_temp/ci-batch-work-44733879344-1-hosted-batch-004/shard-2-compact-small-30/.artifacts/worker proof-Q9CcSt/verification-ready
 ❯ test/scripts/vitest-worker-shutdown.test.ts:344:23
    342|               // separate transports can deliver command completion fi…
    343|               if (!fs.existsSync(filename) || fs.statSync(filename).si…
    344|                 throw new Error(`Missing shutdown receipt: ${filename}…
```

### compact-small-30 :: tooling  test/scripts/vitest-worker-shutdown.test.ts > ci wrapper joins deletion work before honoring SIGTERM
```
Error: Missing shutdown receipt: /home/runner/_work/_temp/ci-batch-work-44733879344-1-hosted-batch-004/shard-2-compact-small-30/.artifacts/worker proof-Q9CcSt/verification-ready
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
Error: Missing shutdown receipt: /home/runner/_work/_temp/ci-batch-work-44733879344-1-hosted-batch-004/shard-2-compact-small-30/.artifacts/worker proof-eG3lXS/verification-ready
 ❯ test/scripts/vitest-worker-shutdown.test.ts:344:23
    342|               // separate transports can deliver command completion fi…
    343|               if (!fs.existsSync(filename) || fs.statSync(filename).si…
    344|                 throw new Error(`Missing shutdown receipt: ${filename}…
```

### compact-small-30 :: tooling  test/scripts/vitest-worker-shutdown.test.ts > ci wrapper joins disposal work before honoring SIGINT
```
Error: Missing shutdown receipt: /home/runner/_work/_temp/ci-batch-work-44733879344-1-hosted-batch-004/shard-2-compact-small-30/.artifacts/worker proof-8lm3W5/verification-ready
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
Error: Missing shutdown receipt: /home/runner/_work/_temp/ci-batch-work-44733879344-1-hosted-batch-004/shard-2-compact-small-30/.artifacts/worker proof-dA06lr/verification-ready
 ❯ test/scripts/vitest-worker-shutdown.test.ts:344:23
    342|               // separate transports can deliver command completion fi…
    343|               if (!fs.existsSync(filename) || fs.statSync(filename).si…
    344|                 throw new Error(`Missing shutdown receipt: ${filename}…
```

### compact-small-30 :: tooling  test/scripts/vitest-worker-shutdown.test.ts > ci wrapper joins disposal work before honoring SIGTERM
```
Error: Missing shutdown receipt: /home/runner/_work/_temp/ci-batch-work-44733879344-1-hosted-batch-004/shard-2-compact-small-30/.artifacts/worker proof-dA06lr/verification-ready
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
Error: Missing shutdown receipt: /home/runner/_work/_temp/ci-batch-work-44733879344-1-hosted-batch-004/shard-2-compact-small-30/.artifacts/worker proof-FfDhYl/verification-ready
 ❯ test/scripts/vitest-worker-shutdown.test.ts:344:23
    342|               // separate transports can deliver command completion fi…
    343|               if (!fs.existsSync(filename) || fs.statSync(filename).si…
    344|                 throw new Error(`Missing shutdown receipt: ${filename}…
```

### compact-small-30 :: tooling  test/scripts/vitest-worker-shutdown.test.ts > ci-disconnect wrapper joins admission work before honoring SIGTERM
```
Error: Missing shutdown receipt: /home/runner/_work/_temp/ci-batch-work-44733879344-1-hosted-batch-004/shard-2-compact-small-30/.artifacts/worker proof-FfDhYl/verification-ready
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
Error: Missing shutdown receipt: /home/runner/_work/_temp/ci-batch-work-44733879344-1-hosted-batch-004/shard-2-compact-small-30/.artifacts/worker proof-JuL6cj/verification-ready
 ❯ test/scripts/vitest-worker-shutdown.test.ts:344:23
    342|               // separate transports can deliver command completion fi…
    343|               if (!fs.existsSync(filename) || fs.statSync(filename).si…
    344|                 throw new Error(`Missing shutdown receipt: ${filename}…
```

### compact-small-30 :: tooling  test/scripts/vitest-worker-shutdown.test.ts > ci-shared wrapper joins compilation work before honoring SIGINT
```
Error: Missing shutdown receipt: /home/runner/_work/_temp/ci-batch-work-44733879344-1-hosted-batch-004/shard-2-compact-small-30/.artifacts/worker proof-naAWpg/compiler-ready
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
Error: Missing shutdown receipt: /home/runner/_work/_temp/ci-batch-work-44733879344-1-hosted-batch-004/shard-2-compact-small-30/.artifacts/worker proof-9ZwNaZ/compiler-ready
 ❯ test/scripts/vitest-worker-shutdown.test.ts:344:23
    342|               // separate transports can deliver command completion fi…
    343|               if (!fs.existsSync(filename) || fs.statSync(filename).si…
    344|                 throw new Error(`Missing shutdown receipt: ${filename}…
```

### compact-small-30 :: tooling  test/scripts/vitest-worker-shutdown.test.ts > ci-shared wrapper joins compilation work before honoring SIGTERM
```
Error: Missing shutdown receipt: /home/runner/_work/_temp/ci-batch-work-44733879344-1-hosted-batch-004/shard-2-compact-small-30/.artifacts/worker proof-9ZwNaZ/compiler-ready
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
Error: Missing shutdown receipt: /home/runner/_work/_temp/ci-batch-work-44733879344-1-hosted-batch-004/shard-2-compact-small-30/.artifacts/worker proof-X7t8oz/verification-ready
 ❯ test/scripts/vitest-worker-shutdown.test.ts:344:23
    342|               // separate transports can deliver command completion fi…
    343|               if (!fs.existsSync(filename) || fs.statSync(filename).si…
    344|                 throw new Error(`Missing shutdown receipt: ${filename}…
```

### compact-small-30 :: tooling  test/scripts/vitest-worker-shutdown.test.ts > direct wrapper joins admission work before honoring SIGINT
```
Error: Missing shutdown receipt: /home/runner/_work/_temp/ci-batch-work-44733879344-1-hosted-batch-004/shard-2-compact-small-30/.artifacts/worker proof-27zPMY/verification-ready
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
Error: Missing shutdown receipt: /home/runner/_work/_temp/ci-batch-work-44733879344-1-hosted-batch-004/shard-2-compact-small-30/.artifacts/worker proof-bOQ0KN/verification-ready
 ❯ test/scripts/vitest-worker-shutdown.test.ts:344:23
    342|               // separate transports can deliver command completion fi…
    343|               if (!fs.existsSync(filename) || fs.statSync(filename).si…
    344|                 throw new Error(`Missing shutdown receipt: ${filename}…
```

### compact-small-30 :: tooling  test/scripts/vitest-worker-shutdown.test.ts > direct wrapper joins admission work before honoring SIGTERM
```
Error: Missing shutdown receipt: /home/runner/_work/_temp/ci-batch-work-44733879344-1-hosted-batch-004/shard-2-compact-small-30/.artifacts/worker proof-bOQ0KN/verification-ready
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
Error: Missing shutdown receipt: /home/runner/_work/_temp/ci-batch-work-44733879344-1-hosted-batch-004/shard-2-compact-small-30/.artifacts/worker proof-ivupYF/compiler-ready
 ❯ test/scripts/vitest-worker-shutdown.test.ts:344:23
    342|               // separate transports can deliver command completion fi…
    343|               if (!fs.existsSync(filename) || fs.statSync(filename).si…
    344|                 throw new Error(`Missing shutdown receipt: ${filename}…
```

### compact-small-30 :: tooling  test/scripts/vitest-worker-shutdown.test.ts > direct wrapper joins compilation work before honoring SIGINT
```
Error: Missing shutdown receipt: /home/runner/_work/_temp/ci-batch-work-44733879344-1-hosted-batch-004/shard-2-compact-small-30/.artifacts/worker proof-ivupYF/compiler-ready
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
Error: Missing shutdown receipt: /home/runner/_work/_temp/ci-batch-work-44733879344-1-hosted-batch-004/shard-2-compact-small-30/.artifacts/worker proof-rekQnh/compiler-ready
 ❯ test/scripts/vitest-worker-shutdown.test.ts:344:23
    342|               // separate transports can deliver command completion fi…
    343|               if (!fs.existsSync(filename) || fs.statSync(filename).si…
    344|                 throw new Error(`Missing shutdown receipt: ${filename}…
```

### compact-small-30 :: tooling  test/scripts/vitest-worker-shutdown.test.ts > direct wrapper joins compilation work before honoring SIGTERM
```
Error: Missing shutdown receipt: /home/runner/_work/_temp/ci-batch-work-44733879344-1-hosted-batch-004/shard-2-compact-small-30/.artifacts/worker proof-rekQnh/compiler-ready
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
Error: Missing shutdown receipt: /home/runner/_work/_temp/ci-batch-work-44733879344-1-hosted-batch-004/shard-2-compact-small-30/.artifacts/worker proof-X4gr7I/compiler-ready
 ❯ test/scripts/vitest-worker-shutdown.test.ts:344:23
    342|               // separate transports can deliver command completion fi…
    343|               if (!fs.existsSync(filename) || fs.statSync(filename).si…
    344|                 throw new Error(`Missing shutdown receipt: ${filename}…
```

### compact-small-30 :: tooling  test/scripts/vitest-worker-shutdown.test.ts > direct wrapper joins deletion work before honoring SIGINT
```
Error: Missing shutdown receipt: /home/runner/_work/_temp/ci-batch-work-44733879344-1-hosted-batch-004/shard-2-compact-small-30/.artifacts/worker proof-eG3lXS/verification-ready
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
Error: Missing shutdown receipt: /home/runner/_work/_temp/ci-batch-work-44733879344-1-hosted-batch-004/shard-2-compact-small-30/.artifacts/worker proof-09RvW9/verification-ready
 ❯ test/scripts/vitest-worker-shutdown.test.ts:344:23
    342|               // separate transports can deliver command completion fi…
    343|               if (!fs.existsSync(filename) || fs.statSync(filename).si…
    344|                 throw new Error(`Missing shutdown receipt: ${filename}…
```

### compact-small-30 :: tooling  test/scripts/vitest-worker-shutdown.test.ts > direct wrapper joins deletion work before honoring SIGTERM
```
Error: Missing shutdown receipt: /home/runner/_work/_temp/ci-batch-work-44733879344-1-hosted-batch-004/shard-2-compact-small-30/.artifacts/worker proof-09RvW9/verification-ready
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
Error: Missing shutdown receipt: /home/runner/_work/_temp/ci-batch-work-44733879344-1-hosted-batch-004/shard-2-compact-small-30/.artifacts/worker proof-xPW4YG/verification-ready
 ❯ test/scripts/vitest-worker-shutdown.test.ts:344:23
    342|               // separate transports can deliver command completion fi…
    343|               if (!fs.existsSync(filename) || fs.statSync(filename).si…
    344|                 throw new Error(`Missing shutdown receipt: ${filename}…
```

### compact-small-30 :: tooling  test/scripts/vitest-worker-shutdown.test.ts > direct wrapper joins disposal work before honoring SIGINT
```
Error: Missing shutdown receipt: /home/runner/_work/_temp/ci-batch-work-44733879344-1-hosted-batch-004/shard-2-compact-small-30/.artifacts/worker proof-9ykmZs/verification-ready
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
Error: Missing shutdown receipt: /home/runner/_work/_temp/ci-batch-work-44733879344-1-hosted-batch-004/shard-2-compact-small-30/.artifacts/worker proof-RK49E2/verification-ready
 ❯ test/scripts/vitest-worker-shutdown.test.ts:344:23
    342|               // separate transports can deliver command completion fi…
    343|               if (!fs.existsSync(filename) || fs.statSync(filename).si…
    344|                 throw new Error(`Missing shutdown receipt: ${filename}…
```

### compact-small-30 :: tooling  test/scripts/vitest-worker-shutdown.test.ts > direct wrapper joins disposal work before honoring SIGTERM
```
Error: Missing shutdown receipt: /home/runner/_work/_temp/ci-batch-work-44733879344-1-hosted-batch-004/shard-2-compact-small-30/.artifacts/worker proof-RK49E2/verification-ready
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
Error: Missing shutdown receipt: /home/runner/_work/_temp/ci-batch-work-44733879344-1-hosted-batch-004/shard-2-compact-small-30/.artifacts/worker proof-EHVl1k/verification-ready
 ❯ test/scripts/vitest-worker-shutdown.test.ts:344:23
    342|               // separate transports can deliver command completion fi…
    343|               if (!fs.existsSync(filename) || fs.statSync(filename).si…
    344|                 throw new Error(`Missing shutdown receipt: ${filename}…
```

### compact-small-30 :: tooling  test/scripts/vitest-worker-shutdown.test.ts > serial wrapper joins compilation work before honoring SIGINT
```
Error: Missing shutdown receipt: /home/runner/_work/_temp/ci-batch-work-44733879344-1-hosted-batch-004/shard-2-compact-small-30/.artifacts/worker proof-X4gr7I/compiler-ready
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
Error: Missing shutdown receipt: /home/runner/_work/_temp/ci-batch-work-44733879344-1-hosted-batch-004/shard-2-compact-small-30/.artifacts/worker proof-nQ9Kc0/compiler-ready
 ❯ test/scripts/vitest-worker-shutdown.test.ts:344:23
    342|               // separate transports can deliver command completion fi…
    343|               if (!fs.existsSync(filename) || fs.statSync(filename).si…
    344|                 throw new Error(`Missing shutdown receipt: ${filename}…
```

### compact-small-30 :: tooling  test/scripts/vitest-worker-shutdown.test.ts > serial wrapper joins compilation work before honoring SIGTERM
```
Error: Missing shutdown receipt: /home/runner/_work/_temp/ci-batch-work-44733879344-1-hosted-batch-004/shard-2-compact-small-30/.artifacts/worker proof-nQ9Kc0/compiler-ready
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
Error: Missing shutdown receipt: /home/runner/_work/_temp/ci-batch-work-44733879344-1-hosted-batch-004/shard-2-compact-small-30/.artifacts/worker proof-Hb9blV/compiler-ready
 ❯ test/scripts/vitest-worker-shutdown.test.ts:344:23
    342|               // separate transports can deliver command completion fi…
    343|               if (!fs.existsSync(filename) || fs.statSync(filename).si…
    344|                 throw new Error(`Missing shutdown receipt: ${filename}…
```

### compact-small-30 :: tooling  test/scripts/vitest-worker-shutdown.test.ts > serial wrapper joins deletion work before honoring SIGINT
```
Error: Missing shutdown receipt: /home/runner/_work/_temp/ci-batch-work-44733879344-1-hosted-batch-004/shard-2-compact-small-30/.artifacts/worker proof-xPW4YG/verification-ready
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
Error: Missing shutdown receipt: /home/runner/_work/_temp/ci-batch-work-44733879344-1-hosted-batch-004/shard-2-compact-small-30/.artifacts/worker proof-2VfxHv/verification-ready
 ❯ test/scripts/vitest-worker-shutdown.test.ts:344:23
    342|               // separate transports can deliver command completion fi…
    343|               if (!fs.existsSync(filename) || fs.statSync(filename).si…
    344|                 throw new Error(`Missing shutdown receipt: ${filename}…
```

### compact-small-30 :: tooling  test/scripts/vitest-worker-shutdown.test.ts > serial wrapper joins deletion work before honoring SIGTERM
```
Error: Missing shutdown receipt: /home/runner/_work/_temp/ci-batch-work-44733879344-1-hosted-batch-004/shard-2-compact-small-30/.artifacts/worker proof-2VfxHv/verification-ready
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
   Start at  15:38:09
   Duration  56.00s (tests 94%, transform 3%, import 2%, worker 1%)
⎯⎯⎯⎯⎯⎯ Failed Tests 25 ⎯⎯⎯⎯⎯⎯⎯
 FAIL   tooling  test/scripts/vitest-worker-shutdown.test.ts > direct wrapper joins disposal work before honoring SIGINT
```

### compact-small-30 :: tooling  test/scripts/vitest-worker-shutdown.test.ts > serial wrapper joins disposal work before honoring SIGINT
```
Error: Missing shutdown receipt: /home/runner/_work/_temp/ci-batch-work-44733879344-1-hosted-batch-004/shard-2-compact-small-30/.artifacts/worker proof-EHVl1k/verification-ready
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
Error: Missing shutdown receipt: /home/runner/_work/_temp/ci-batch-work-44733879344-1-hosted-batch-004/shard-2-compact-small-30/.artifacts/worker proof-UcwEgp/verification-ready
 ❯ test/scripts/vitest-worker-shutdown.test.ts:344:23
    342|               // separate transports can deliver command completion fi…
    343|               if (!fs.existsSync(filename) || fs.statSync(filename).si…
    344|                 throw new Error(`Missing shutdown receipt: ${filename}…
```

### compact-small-30 :: tooling  test/scripts/vitest-worker-shutdown.test.ts > serial wrapper joins disposal work before honoring SIGTERM
```
Error: Missing shutdown receipt: /home/runner/_work/_temp/ci-batch-work-44733879344-1-hosted-batch-004/shard-2-compact-small-30/.artifacts/worker proof-UcwEgp/verification-ready
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
Error: Missing shutdown receipt: /home/runner/_work/_temp/ci-batch-work-44733879344-1-hosted-batch-004/shard-2-compact-small-30/.artifacts/worker proof-27zPMY/verification-ready
 ❯ test/scripts/vitest-worker-shutdown.test.ts:344:23
    342|               // separate transports can deliver command completion fi…
    343|               if (!fs.existsSync(filename) || fs.statSync(filename).si…
    344|                 throw new Error(`Missing shutdown receipt: ${filename}…
```

### compact-small-32 :: tooling  test/scripts/ci-node-test-plan-hosted-tail.test.ts > bounds hosted groups (main)
```
Error: compact github node test plan exceeds 77 jobs (78 planned)
 ❯ createCompactNodeTestShardBundles scripts/lib/ci-node-test-plan.mts:5963:13
    5961|       });
    5962|     } else {
    5963|       throw new Error(
       |             ^
    5964|         `compact ${options.runnerBackend ?? "blacksmith"} node test pl…
    5965|       );
 ❯ createCompactNodeTestShardBundles scripts/lib/ci-node-test-plan.mts:5675:14
 ❯ createCompactNodeTestShardBundles scripts/lib/ci-node-test-plan.mts:5663:16
 ❯ createCompactNodeTestShardBundles scripts/lib/ci-node-test-plan.mts:5634:14
 ❯ createNodeTestShardBundles scripts/lib/ci-node-test-plan.mts:3337:7
 ❯ test/scripts/ci-node-test-plan-hosted-tail.test.ts:54:16
⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯
 Test Files  1 failed | 6 passed (7)
      Tests  1 failed | 205 passed | 2 skipped (208)
```

### compact-small-33 :: tooling  test/helpers/openclaw-test-instance.test.ts > openclaw test instance > keeps claimed port offset 0 unavailable while its child starts
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
```

### compact-small-33 :: tooling  test/helpers/openclaw-test-instance.test.ts > openclaw test instance > keeps claimed port offset 1 unavailable while its child starts
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
```

### compact-small-36 :: tooling  test/scripts/bun-standalone-codegen.test.ts > standalone fixed code generation > captures remaining static programs (//!)
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
```

### compact-small-36 :: tooling  test/scripts/bun-standalone-codegen.test.ts > standalone fixed code generation > captures remaining static programs (//#region)
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
```

### compact-small-36 :: tooling  test/scripts/bun-standalone-codegen.test.ts > standalone fixed code generation > captures remaining static programs (//)
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
```

### compact-small-38 :: tooling  test/scripts/pr-cache-lifetime-collection.test.ts > PR cache crash collection > verifies the bootstrap-native lease and process inspection contracts
```
AssertionError: .......F....
======================================================================
FAIL: test_proc_scan_finds_cwd_descriptor_and_mapping (__main__.RetirementTests.test_proc_scan_finds_cwd_descriptor_and_mapping)
----------------------------------------------------------------------
Traceback (most recent call last):
  File "/home/runner/_work/_temp/ci-batch-work-44733879344-1-hosted-batch-008/shard-2-compact-small-38/test/scripts/pr-cache-lifetime-process.test.py", line 194, in test_proc_scan_finds_cwd_descriptor_and_mapping
    processes, references = OWNER.process_scan({str(self.anchor)})
                            ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
  File "/home/runner/_work/_temp/ci-batch-work-44733879344-1-hosted-batch-008/shard-2-compact-small-38/scripts/pr-lib/cache-lifetime-process.py", line 120, in process_scan
    return linux_scan(targets)
           ^^^^^^^^^^^^^^^^^^^
  File "/home/runner/_work/_temp/ci-batch-work-44733879344-1-hosted-batch-008/shard-2-compact-small-38/scripts/pr-lib/cache-lifetime-process.py", line 69, in linux_scan
    raise ValueError("zombie-group-has-threads")
ValueError: zombie-group-has-threads
During handling of the above exception, another exception occurred:
Traceback (most recent call last):
```

### compact-small-40 :: tooling  test/scripts-update-gateway-legacy.test.ts > published source shell reaches candidate build entry: begin-abort
```
AssertionError: From /tmp/oc64ef00/.oc-ci-tmp/s1xc/t/oc-vt-8D6YMD/oc-vt-Mvr87b/openclaw-legacy-source-template-DzFSAq/seed
 * branch            main       -> FETCH_HEAD
   37d43e5..589ed9f  main       -> origin/main
[update-gateway] stopping gateway before replacing hashed build chunks
/home/runner/_work/_temp/ci-batch-work-44733879344-1-hosted-batch-010/shard-0-compact-small-40/scripts/lib/source-update-build.mts:423
        ? new AggregateError([failure.error, error], "Source build and native settlement failed", {
          ^
AggregateError: Source build and native settlement failed
    at <anonymous> (/home/runner/_work/_temp/ci-batch-work-44733879344-1-hosted-batch-010/shard-0-compact-small-40/scripts/lib/source-update-build.mts:423:11)
    at async withDistArtifactOwnership (/home/runner/_work/_temp/ci-batch-work-44733879344-1-hosted-batch-010/shard-0-compact-small-40/scripts/lib/dist-artifact-lock.mts:213:12)
    ... 2 lines matching cause stack trace ...
    at async <anonymous> (/home/runner/_work/_temp/ci-batch-work-44733879344-1-hosted-batch-010/shard-0-compact-small-40/scripts/build-all.mts:748:24) {
  [cause]: Error: Source update interrupted; successful restart remains unconfirmed.
      at assertUninterrupted (/home/runner/_work/_temp/ci-batch-work-44733879344-1-hosted-batch-010/shard-0-compact-small-40/scripts/lib/source-update-build.mts:86:13)
      at Object.settle (/home/runner/_work/_temp/ci-batch-work-44733879344-1-hosted-batch-010/shard-0-compact-small-40/scripts/lib/source-update-build.mts:229:11)
      at async settle (/home/runner/_work/_temp/ci-batch-work-44733879344-1-hosted-batch-010/shard-0-compact-small-40/scripts/lib/source-update-build.mts:260:7)
```

### compact-small-40 :: tooling  test/scripts-update-gateway-legacy.test.ts > published source shell reaches candidate build entry: begin-unjoined
```
AssertionError: From /tmp/oc64ef00/.oc-ci-tmp/s1xc/t/oc-vt-8D6YMD/oc-vt-Mvr87b/openclaw-legacy-source-template-DzFSAq/seed
 * branch            main       -> FETCH_HEAD
   37d43e5..589ed9f  main       -> origin/main
[update-gateway] stopping gateway before replacing hashed build chunks
/home/runner/_work/_temp/ci-batch-work-44733879344-1-hosted-batch-010/shard-0-compact-small-40/scripts/lib/source-update-build.mts:423
        ? new AggregateError([failure.error, error], "Source build and native settlement failed", {
          ^
AggregateError: Source build and native settlement failed
    at <anonymous> (/home/runner/_work/_temp/ci-batch-work-44733879344-1-hosted-batch-010/shard-0-compact-small-40/scripts/lib/source-update-build.mts:423:11)
    at async withDistArtifactOwnership (/home/runner/_work/_temp/ci-batch-work-44733879344-1-hosted-batch-010/shard-0-compact-small-40/scripts/lib/dist-artifact-lock.mts:213:12)
    ... 2 lines matching cause stack trace ...
    at async <anonymous> (/home/runner/_work/_temp/ci-batch-work-44733879344-1-hosted-batch-010/shard-0-compact-small-40/scripts/build-all.mts:748:24) {
  [cause]: Error: Source update interrupted; successful restart remains unconfirmed.
      at assertUninterrupted (/home/runner/_work/_temp/ci-batch-work-44733879344-1-hosted-batch-010/shard-0-compact-small-40/scripts/lib/source-update-build.mts:86:13)
      at Object.settle (/home/runner/_work/_temp/ci-batch-work-44733879344-1-hosted-batch-010/shard-0-compact-small-40/scripts/lib/source-update-build.mts:229:11)
      at async settle (/home/runner/_work/_temp/ci-batch-work-44733879344-1-hosted-batch-010/shard-0-compact-small-40/scripts/lib/source-update-build.mts:260:7)
```

### compact-small-40 :: tooling  test/scripts-update-gateway-legacy.test.ts > published source shell reaches candidate build entry: build-throw-restart
```
AssertionError: expected 'From /tmp/oc64ef00/.oc-ci-tmp/s1xc/t/…' to contain 'fixture native restart failed'
- Expected
+ Received
- fixture native restart failed
+ From /tmp/oc64ef00/.oc-ci-tmp/s1xc/t/oc-vt-8D6YMD/oc-vt-Mvr87b/openclaw-legacy-source-template-DzFSAq/seed
+  * branch            main       -> FETCH_HEAD
+    37d43e5..589ed9f  main       -> origin/main
+ [update-gateway] stopping gateway before replacing hashed build chunks
+ [build-all] native-protocol
+ [update-gateway] restoring previous build output
+ [update-gateway] restarting gateway on previous build after update failure
+ /home/runner/_work/_temp/ci-batch-work-44733879344-1-hosted-batch-010/shard-0-compact-small-40/scripts/lib/source-update-build.mts:369
+             throw new AggregateError(
+                   ^
+
+ AggregateError: Source build recovery failed: busctl --user machine Manager.Version: exit 1; Failed to connect to bus: Protocol error
```

### compact-small-40 :: tooling  test/scripts-update-gateway-legacy.test.ts > published source shell reaches candidate build entry: build-throw-settle
```
AssertionError: From /tmp/oc64ef00/.oc-ci-tmp/s1xc/t/oc-vt-8D6YMD/oc-vt-Mvr87b/openclaw-legacy-source-template-DzFSAq/seed
 * branch            main       -> FETCH_HEAD
   37d43e5..589ed9f  main       -> origin/main
[update-gateway] stopping gateway before replacing hashed build chunks
[build-all] native-protocol
[update-gateway] restoring previous build output
[update-gateway] restarting gateway on previous build after update failure
/home/runner/_work/_temp/ci-batch-work-44733879344-1-hosted-batch-010/shard-0-compact-small-40/scripts/lib/source-update-build.mts:423
        ? new AggregateError([failure.error, error], "Source build and native settlement failed", {
          ^
AggregateError: Source build and native settlement failed
    at <anonymous> (/home/runner/_work/_temp/ci-batch-work-44733879344-1-hosted-batch-010/shard-0-compact-small-40/scripts/lib/source-update-build.mts:423:11)
    at async withDistArtifactOwnership (/home/runner/_work/_temp/ci-batch-work-44733879344-1-hosted-batch-010/shard-0-compact-small-40/scripts/lib/dist-artifact-lock.mts:213:12)
    ... 2 lines matching cause stack trace ...
    at async <anonymous> (/home/runner/_work/_temp/ci-batch-work-44733879344-1-hosted-batch-010/shard-0-compact-small-40/scripts/build-all.mts:748:24) {
  [cause]: AggregateError: Source-update native recovery did not settle.
```

### compact-small-40 :: tooling  test/scripts-update-gateway-legacy.test.ts > published source shell reaches candidate build entry: failure
```
AssertionError: From /tmp/oc64ef00/.oc-ci-tmp/s1xc/t/oc-vt-8D6YMD/oc-vt-Mvr87b/openclaw-legacy-source-template-DzFSAq/seed
 * branch            main       -> FETCH_HEAD
   37d43e5..589ed9f  main       -> origin/main
[update-gateway] stopping gateway before replacing hashed build chunks
[build-all] native-protocol
[build-all] native-protocol failed after 0ms
[build-all] phase timings: total 1ms; slowest native-protocol (failed) 0ms
[update-gateway] restoring previous build output
[update-gateway] restarting gateway on previous build after update failure
/home/runner/_work/_temp/ci-batch-work-44733879344-1-hosted-batch-010/shard-0-compact-small-40/scripts/lib/source-update-build.mts:369
            throw new AggregateError(
                  ^
AggregateError: Source build recovery failed: busctl --user machine Manager.Version: exit 1; Failed to connect to bus: Protocol error
No supported service manager detected. Manage the Gateway through the supervisor or terminal that started it.
    at <anonymous> (/home/runner/_work/_temp/ci-batch-work-44733879344-1-hosted-batch-010/shard-0-compact-small-40/scripts/lib/source-update-build.mts:369:19)
    at async Promise.allSettled (index 0)
```

### compact-small-40 :: tooling  test/scripts-update-gateway-legacy.test.ts > published source shell reaches candidate build entry: failure-scheduled
```
AssertionError: From /tmp/oc64ef00/.oc-ci-tmp/s1xc/t/oc-vt-8D6YMD/oc-vt-Mvr87b/openclaw-legacy-source-template-DzFSAq/seed
 * branch            main       -> FETCH_HEAD
   37d43e5..589ed9f  main       -> origin/main
[update-gateway] stopping gateway before replacing hashed build chunks
[build-all] native-protocol
[build-all] native-protocol failed after 0ms
[build-all] phase timings: total 1ms; slowest native-protocol (failed) 0ms
[update-gateway] restoring previous build output
[update-gateway] restarting gateway on previous build after update failure
/home/runner/_work/_temp/ci-batch-work-44733879344-1-hosted-batch-010/shard-0-compact-small-40/scripts/lib/source-update-build.mts:369
            throw new AggregateError(
                  ^
AggregateError: Source build recovery failed: busctl --user machine Manager.Version: exit 1; Failed to connect to bus: Protocol error
No supported service manager detected. Manage the Gateway through the supervisor or terminal that started it.
    at <anonymous> (/home/runner/_work/_temp/ci-batch-work-44733879344-1-hosted-batch-010/shard-0-compact-small-40/scripts/lib/source-update-build.mts:369:19)
    at async Promise.allSettled (index 0)
```

### compact-small-40 :: tooling  test/scripts-update-gateway-legacy.test.ts > published source shell reaches candidate build entry: partial-stop
```
 FAIL   tooling  test/scripts-update-gateway-legacy.test.ts > published source shell reaches candidate build entry: partial-stop-custom
 FAIL   tooling  test/scripts-update-gateway-legacy.test.ts > published source shell reaches candidate build entry: partial-stop-scheduled
AssertionError: From /tmp/oc64ef00/.oc-ci-tmp/s1xc/t/oc-vt-8D6YMD/oc-vt-Mvr87b/openclaw-legacy-source-template-DzFSAq/seed
 * branch            main       -> FETCH_HEAD
   37d43e5..589ed9f  main       -> origin/main
[update-gateway] stopping gateway before replacing hashed build chunks
/home/runner/_work/_temp/ci-batch-work-44733879344-1-hosted-batch-010/shard-0-compact-small-40/scripts/lib/source-update-build.mts:165
              throw new AggregateError(
                    ^
AggregateError: Source update stop and original-runtime recovery failed.
    at Object.stop (/home/runner/_work/_temp/ci-batch-work-44733879344-1-hosted-batch-010/shard-0-compact-small-40/scripts/lib/source-update-build.mts:165:21)
    at async <anonymous> (/home/runner/_work/_temp/ci-batch-work-44733879344-1-hosted-batch-010/shard-0-compact-small-40/scripts/lib/source-update-build.mts:269:25)
    at async Promise.allSettled (index 0)
    at async <anonymous> (/home/runner/_work/_temp/ci-batch-work-44733879344-1-hosted-batch-010/shard-0-compact-small-40/scripts/lib/source-update-build.mts:262:23)
    at async withDistArtifactOwnership (/home/runner/_work/_temp/ci-batch-work-44733879344-1-hosted-batch-010/shard-0-compact-small-40/scripts/lib/dist-artifact-lock.mts:213:12)
    at async runSourceUpdateBuild (/home/runner/_work/_temp/ci-batch-work-44733879344-1-hosted-batch-010/shard-0-compact-small-40/scripts/lib/source-update-build.mts:255:10)
```

### compact-small-40 :: tooling  test/scripts-update-gateway-legacy.test.ts > published source shell reaches candidate build entry: partial-stop-custom
```
 FAIL   tooling  test/scripts-update-gateway-legacy.test.ts > published source shell reaches candidate build entry: partial-stop-scheduled
AssertionError: From /tmp/oc64ef00/.oc-ci-tmp/s1xc/t/oc-vt-8D6YMD/oc-vt-Mvr87b/openclaw-legacy-source-template-DzFSAq/seed
 * branch            main       -> FETCH_HEAD
   37d43e5..589ed9f  main       -> origin/main
[update-gateway] stopping gateway before replacing hashed build chunks
/home/runner/_work/_temp/ci-batch-work-44733879344-1-hosted-batch-010/shard-0-compact-small-40/scripts/lib/source-update-build.mts:165
              throw new AggregateError(
                    ^
AggregateError: Source update stop and original-runtime recovery failed.
    at Object.stop (/home/runner/_work/_temp/ci-batch-work-44733879344-1-hosted-batch-010/shard-0-compact-small-40/scripts/lib/source-update-build.mts:165:21)
    at async <anonymous> (/home/runner/_work/_temp/ci-batch-work-44733879344-1-hosted-batch-010/shard-0-compact-small-40/scripts/lib/source-update-build.mts:269:25)
    at async Promise.allSettled (index 0)
    at async <anonymous> (/home/runner/_work/_temp/ci-batch-work-44733879344-1-hosted-batch-010/shard-0-compact-small-40/scripts/lib/source-update-build.mts:262:23)
    at async withDistArtifactOwnership (/home/runner/_work/_temp/ci-batch-work-44733879344-1-hosted-batch-010/shard-0-compact-small-40/scripts/lib/dist-artifact-lock.mts:213:12)
    at async runSourceUpdateBuild (/home/runner/_work/_temp/ci-batch-work-44733879344-1-hosted-batch-010/shard-0-compact-small-40/scripts/lib/source-update-build.mts:255:10)
    at async runLegacySourceUpdateBuild (/home/runner/_work/_temp/ci-batch-work-44733879344-1-hosted-batch-010/shard-0-compact-small-40/scripts/lib/source-update-build.mts:119:10)
```

### compact-small-40 :: tooling  test/scripts-update-gateway-legacy.test.ts > published source shell reaches candidate build entry: partial-stop-scheduled
```
AssertionError: From /tmp/oc64ef00/.oc-ci-tmp/s1xc/t/oc-vt-8D6YMD/oc-vt-Mvr87b/openclaw-legacy-source-template-DzFSAq/seed
 * branch            main       -> FETCH_HEAD
   37d43e5..589ed9f  main       -> origin/main
[update-gateway] stopping gateway before replacing hashed build chunks
/home/runner/_work/_temp/ci-batch-work-44733879344-1-hosted-batch-010/shard-0-compact-small-40/scripts/lib/source-update-build.mts:165
              throw new AggregateError(
                    ^
AggregateError: Source update stop and original-runtime recovery failed.
    at Object.stop (/home/runner/_work/_temp/ci-batch-work-44733879344-1-hosted-batch-010/shard-0-compact-small-40/scripts/lib/source-update-build.mts:165:21)
    at async <anonymous> (/home/runner/_work/_temp/ci-batch-work-44733879344-1-hosted-batch-010/shard-0-compact-small-40/scripts/lib/source-update-build.mts:269:25)
    at async Promise.allSettled (index 0)
    at async <anonymous> (/home/runner/_work/_temp/ci-batch-work-44733879344-1-hosted-batch-010/shard-0-compact-small-40/scripts/lib/source-update-build.mts:262:23)
    at async withDistArtifactOwnership (/home/runner/_work/_temp/ci-batch-work-44733879344-1-hosted-batch-010/shard-0-compact-small-40/scripts/lib/dist-artifact-lock.mts:213:12)
    at async runSourceUpdateBuild (/home/runner/_work/_temp/ci-batch-work-44733879344-1-hosted-batch-010/shard-0-compact-small-40/scripts/lib/source-update-build.mts:255:10)
    at async runLegacySourceUpdateBuild (/home/runner/_work/_temp/ci-batch-work-44733879344-1-hosted-batch-010/shard-0-compact-small-40/scripts/lib/source-update-build.mts:119:10)
    at async <anonymous> (/home/runner/_work/_temp/ci-batch-work-44733879344-1-hosted-batch-010/shard-0-compact-small-40/scripts/build-all.mts:748:24) {
```

### compact-small-40 :: tooling  test/scripts/check-line-cap-ratchet.test.ts > preserves failed child diagnostics for 1//Cannot load oxlint native binding
```
AssertionError: expected 'Error: Cannot resolve tooling depende…' to contain 'Cannot load oxlint native binding'
- Expected
+ Received
- Cannot load oxlint native binding
+ Error: Cannot resolve tooling dependencies at /tmp/oc64ef00/.oc-ci-tmp/s1xc/t/oc-vt-8D6YMD/oc-vt-Mvr87b/openclaw-line-cap-admission-srLGMh/tooling #root. Different repository. Install dependencies in this checkout or set OPENCLAW_PR_TOOLING_ROOT to an installed checkout of this repository.
+     at toolingDependencyOptions (file:///tmp/oc64ef00/.oc-ci-tmp/s1xc/t/oc-vt-8D6YMD/oc-vt-Mvr87b/openclaw-line-cap-admission-srLGMh/checkout/scripts/lib/tooling-dependencies.mjs:156:11)
+     at runTsxCliShim (file:///tmp/oc64ef00/.oc-ci-tmp/s1xc/t/oc-vt-8D6YMD/oc-vt-Mvr87b/openclaw-line-cap-admission-srLGMh/checkout/scripts/lib/tsx-cli-shim.mjs:280:23)
+     at async file:///tmp/oc64ef00/.oc-ci-tmp/s1xc/t/oc-vt-8D6YMD/oc-vt-Mvr87b/openclaw-line-cap-admission-srLGMh/checkout/scripts/check-line-cap-ratchet.mjs:4:1 {
+   [cause]: Error: Different repository.
+       at toolingDependencyOptions (file:///tmp/oc64ef00/.oc-ci-tmp/s1xc/t/oc-vt-8D6YMD/oc-vt-Mvr87b/openclaw-line-cap-admission-srLGMh/checkout/scripts/lib/tooling-dependencies.mjs:149:15)
+       at runTsxCliShim (file:///tmp/oc64ef00/.oc-ci-tmp/s1xc/t/oc-vt-8D6YMD/oc-vt-Mvr87b/openclaw-line-cap-admission-srLGMh/checkout/scripts/lib/tsx-cli-shim.mjs:280:23)
+       at async file:///tmp/oc64ef00/.oc-ci-tmp/s1xc/t/oc-vt-8D6YMD/oc-vt-Mvr87b/openclaw-line-cap-admission-srLGMh/checkout/scripts/check-line-cap-ratchet.mjs:4:1
+ }
+ [line-cap-ratchet] FAILED (exit 1)
+
 ❯ test/scripts/check-line-cap-ratchet.test.ts:254:29
```

### compact-small-40 :: tooling  test/scripts/check-line-cap-ratchet.test.ts > preserves failed child diagnostics for 1/Invalid oxlint configuration/
```
AssertionError: expected 'Error: Cannot resolve tooling depende…' to contain 'Invalid oxlint configuration'
- Expected
+ Received
- Invalid oxlint configuration
+ Error: Cannot resolve tooling dependencies at /tmp/oc64ef00/.oc-ci-tmp/s1xc/t/oc-vt-8D6YMD/oc-vt-Mvr87b/openclaw-line-cap-admission-lYy0qg/tooling #root. Different repository. Install dependencies in this checkout or set OPENCLAW_PR_TOOLING_ROOT to an installed checkout of this repository.
+     at toolingDependencyOptions (file:///tmp/oc64ef00/.oc-ci-tmp/s1xc/t/oc-vt-8D6YMD/oc-vt-Mvr87b/openclaw-line-cap-admission-lYy0qg/checkout/scripts/lib/tooling-dependencies.mjs:156:11)
+     at runTsxCliShim (file:///tmp/oc64ef00/.oc-ci-tmp/s1xc/t/oc-vt-8D6YMD/oc-vt-Mvr87b/openclaw-line-cap-admission-lYy0qg/checkout/scripts/lib/tsx-cli-shim.mjs:280:23)
+     at async file:///tmp/oc64ef00/.oc-ci-tmp/s1xc/t/oc-vt-8D6YMD/oc-vt-Mvr87b/openclaw-line-cap-admission-lYy0qg/checkout/scripts/check-line-cap-ratchet.mjs:4:1 {
+   [cause]: Error: Different repository.
+       at toolingDependencyOptions (file:///tmp/oc64ef00/.oc-ci-tmp/s1xc/t/oc-vt-8D6YMD/oc-vt-Mvr87b/openclaw-line-cap-admission-lYy0qg/checkout/scripts/lib/tooling-dependencies.mjs:149:15)
+       at runTsxCliShim (file:///tmp/oc64ef00/.oc-ci-tmp/s1xc/t/oc-vt-8D6YMD/oc-vt-Mvr87b/openclaw-line-cap-admission-lYy0qg/checkout/scripts/lib/tsx-cli-shim.mjs:280:23)
+       at async file:///tmp/oc64ef00/.oc-ci-tmp/s1xc/t/oc-vt-8D6YMD/oc-vt-Mvr87b/openclaw-line-cap-admission-lYy0qg/checkout/scripts/check-line-cap-ratchet.mjs:4:1
+ }
+ [line-cap-ratchet] FAILED (exit 1)
+
 ❯ test/scripts/check-line-cap-ratchet.test.ts:254:29
```

### compact-small-40 :: tooling  test/scripts/check-line-cap-ratchet.test.ts > preserves failed child diagnostics for 1/invalid report/Cannot load oxlint native binding
```
AssertionError: expected 'Error: Cannot resolve tooling depende…' to contain 'Cannot load oxlint native binding'
- Expected
+ Received
- Cannot load oxlint native binding
+ Error: Cannot resolve tooling dependencies at /tmp/oc64ef00/.oc-ci-tmp/s1xc/t/oc-vt-8D6YMD/oc-vt-Mvr87b/openclaw-line-cap-admission-Oqur6G/tooling #root. Different repository. Install dependencies in this checkout or set OPENCLAW_PR_TOOLING_ROOT to an installed checkout of this repository.
+     at toolingDependencyOptions (file:///tmp/oc64ef00/.oc-ci-tmp/s1xc/t/oc-vt-8D6YMD/oc-vt-Mvr87b/openclaw-line-cap-admission-Oqur6G/checkout/scripts/lib/tooling-dependencies.mjs:156:11)
+     at runTsxCliShim (file:///tmp/oc64ef00/.oc-ci-tmp/s1xc/t/oc-vt-8D6YMD/oc-vt-Mvr87b/openclaw-line-cap-admission-Oqur6G/checkout/scripts/lib/tsx-cli-shim.mjs:280:23)
+     at async file:///tmp/oc64ef00/.oc-ci-tmp/s1xc/t/oc-vt-8D6YMD/oc-vt-Mvr87b/openclaw-line-cap-admission-Oqur6G/checkout/scripts/check-line-cap-ratchet.mjs:4:1 {
+   [cause]: Error: Different repository.
+       at toolingDependencyOptions (file:///tmp/oc64ef00/.oc-ci-tmp/s1xc/t/oc-vt-8D6YMD/oc-vt-Mvr87b/openclaw-line-cap-admission-Oqur6G/checkout/scripts/lib/tooling-dependencies.mjs:149:15)
+       at runTsxCliShim (file:///tmp/oc64ef00/.oc-ci-tmp/s1xc/t/oc-vt-8D6YMD/oc-vt-Mvr87b/openclaw-line-cap-admission-Oqur6G/checkout/scripts/lib/tsx-cli-shim.mjs:280:23)
+       at async file:///tmp/oc64ef00/.oc-ci-tmp/s1xc/t/oc-vt-8D6YMD/oc-vt-Mvr87b/openclaw-line-cap-admission-Oqur6G/checkout/scripts/check-line-cap-ratchet.mjs:4:1
+ }
+ [line-cap-ratchet] FAILED (exit 1)
+
 ❯ test/scripts/check-line-cap-ratchet.test.ts:254:29
```

### compact-small-40 :: tooling  test/scripts/check-line-cap-ratchet.test.ts > rejects bin symlink before executing the oxlint CLI
```
AssertionError: expected 'Error: Cannot resolve tooling depende…' to contain 'The oxlint CLI bin must be a file ins…'
- Expected
+ Received
- The oxlint CLI bin must be a file inside its admitted package.
+ Error: Cannot resolve tooling dependencies at /tmp/oc64ef00/.oc-ci-tmp/s1xc/t/oc-vt-8D6YMD/oc-vt-Mvr87b/openclaw-line-cap-admission-UT0nBO/tooling #root. Different repository. Install dependencies in this checkout or set OPENCLAW_PR_TOOLING_ROOT to an installed checkout of this repository.
+     at toolingDependencyOptions (file:///tmp/oc64ef00/.oc-ci-tmp/s1xc/t/oc-vt-8D6YMD/oc-vt-Mvr87b/openclaw-line-cap-admission-UT0nBO/checkout/scripts/lib/tooling-dependencies.mjs:156:11)
+     at runTsxCliShim (file:///tmp/oc64ef00/.oc-ci-tmp/s1xc/t/oc-vt-8D6YMD/oc-vt-Mvr87b/openclaw-line-cap-admission-UT0nBO/checkout/scripts/lib/tsx-cli-shim.mjs:280:23)
+     at async file:///tmp/oc64ef00/.oc-ci-tmp/s1xc/t/oc-vt-8D6YMD/oc-vt-Mvr87b/openclaw-line-cap-admission-UT0nBO/checkout/scripts/check-line-cap-ratchet.mjs:4:1 {
+   [cause]: Error: Different repository.
+       at toolingDependencyOptions (file:///tmp/oc64ef00/.oc-ci-tmp/s1xc/t/oc-vt-8D6YMD/oc-vt-Mvr87b/openclaw-line-cap-admission-UT0nBO/checkout/scripts/lib/tooling-dependencies.mjs:149:15)
+       at runTsxCliShim (file:///tmp/oc64ef00/.oc-ci-tmp/s1xc/t/oc-vt-8D6YMD/oc-vt-Mvr87b/openclaw-line-cap-admission-UT0nBO/checkout/scripts/lib/tsx-cli-shim.mjs:280:23)
+       at async file:///tmp/oc64ef00/.oc-ci-tmp/s1xc/t/oc-vt-8D6YMD/oc-vt-Mvr87b/openclaw-line-cap-admission-UT0nBO/checkout/scripts/check-line-cap-ratchet.mjs:4:1
+ }
+ [line-cap-ratchet] FAILED (exit 1)
+
 ❯ test/scripts/check-line-cap-ratchet.test.ts:279:27
```

### compact-small-40 :: tooling  test/scripts/check-line-cap-ratchet.test.ts > rejects bin traversal before executing the oxlint CLI
```
AssertionError: expected 'Error: Cannot resolve tooling depende…' to contain 'The oxlint CLI bin must be a file ins…'
- Expected
+ Received
- The oxlint CLI bin must be a file inside its admitted package.
+ Error: Cannot resolve tooling dependencies at /tmp/oc64ef00/.oc-ci-tmp/s1xc/t/oc-vt-8D6YMD/oc-vt-Mvr87b/openclaw-line-cap-admission-8AjLNs/tooling #root. Different repository. Install dependencies in this checkout or set OPENCLAW_PR_TOOLING_ROOT to an installed checkout of this repository.
+     at toolingDependencyOptions (file:///tmp/oc64ef00/.oc-ci-tmp/s1xc/t/oc-vt-8D6YMD/oc-vt-Mvr87b/openclaw-line-cap-admission-8AjLNs/checkout/scripts/lib/tooling-dependencies.mjs:156:11)
+     at runTsxCliShim (file:///tmp/oc64ef00/.oc-ci-tmp/s1xc/t/oc-vt-8D6YMD/oc-vt-Mvr87b/openclaw-line-cap-admission-8AjLNs/checkout/scripts/lib/tsx-cli-shim.mjs:280:23)
+     at async file:///tmp/oc64ef00/.oc-ci-tmp/s1xc/t/oc-vt-8D6YMD/oc-vt-Mvr87b/openclaw-line-cap-admission-8AjLNs/checkout/scripts/check-line-cap-ratchet.mjs:4:1 {
+   [cause]: Error: Different repository.
+       at toolingDependencyOptions (file:///tmp/oc64ef00/.oc-ci-tmp/s1xc/t/oc-vt-8D6YMD/oc-vt-Mvr87b/openclaw-line-cap-admission-8AjLNs/checkout/scripts/lib/tooling-dependencies.mjs:149:15)
+       at runTsxCliShim (file:///tmp/oc64ef00/.oc-ci-tmp/s1xc/t/oc-vt-8D6YMD/oc-vt-Mvr87b/openclaw-line-cap-admission-8AjLNs/checkout/scripts/lib/tsx-cli-shim.mjs:280:23)
+       at async file:///tmp/oc64ef00/.oc-ci-tmp/s1xc/t/oc-vt-8D6YMD/oc-vt-Mvr87b/openclaw-line-cap-admission-8AjLNs/checkout/scripts/check-line-cap-ratchet.mjs:4:1
+ }
+ [line-cap-ratchet] FAILED (exit 1)
+
 ❯ test/scripts/check-line-cap-ratchet.test.ts:279:27
```

### compact-small-9 :: cli-process  src/cli/update-cli/update-command-lease.test.ts > update orchestration lifecycle ownership > repair completes missing source artifacts before consumers and leaves an exact online retry untouched
```
Error: Cannot find module '../../node-runtime-env.mjs' imported from /tmp/oc857271/.oc-ci-tmp/sLIt/t/oc-vt-5h2DTl/oc-vt-7AR31d/openclaw-test-state-update-lease-avMq6E/scripts/lib/dist-artifact-ownership.mts
 ❯ ../../../../../../tmp/oc857271/.oc-ci-tmp/sLIt/t/oc-vt-5h2DTl/oc-vt-7AR31d/openclaw-test-state-update-lease-avMq6E/scripts/lib/dist-artifact-ownership.mts:5:1
 ❯ src/cli/update-cli/update-command-runtime.ts:119:34
    117|         return await complete();
    118|       }
    119|       const ownership: unknown = await import(
       |                                  ^
    120|         pathToFileURL(path.join(root, "scripts", "lib", "dist-artifact…
    121|       );
⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯
Serialized Error: { code: 'ERR_MODULE_NOT_FOUND' }
⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[2/3]⎯
 FAIL   cli-process  src/cli/update-cli/update-command-lease.test.ts > update orchestration lifecycle ownership > resume preserves publication failure details when staging cleanup also fails
AssertionError: expected [Function] to throw error including 'Runtime completion and staging cleanu…' but got 'Cannot find module \'../../node-runti…'
Expected: "Runtime completion and staging cleanup failed"
Received: "Cannot find module '../../node-runtime-env.mjs' imported from /tmp/oc857271/.oc-ci-tmp/sLIt/t/oc-vt-5h2DTl/oc-vt-7AR31d/openclaw-test-state-update-lease-0X1jIW/scripts/lib/dist-artifact-ownership.mts"
```

### compact-small-9 :: cli-process  src/cli/update-cli/update-command-lease.test.ts > update orchestration lifecycle ownership > resume completes missing source artifacts before consumers and leaves an exact online retry untouched
```
Error: Cannot find module '../../node-runtime-env.mjs' imported from /tmp/oc857271/.oc-ci-tmp/sLIt/t/oc-vt-5h2DTl/oc-vt-7AR31d/openclaw-test-state-update-lease-sDFqVq/scripts/lib/dist-artifact-ownership.mts
 ❯ ../../../../../../tmp/oc857271/.oc-ci-tmp/sLIt/t/oc-vt-5h2DTl/oc-vt-7AR31d/openclaw-test-state-update-lease-sDFqVq/scripts/lib/dist-artifact-ownership.mts:5:1
 ❯ src/cli/update-cli/update-command-runtime.ts:119:34
    117|         return await complete();
    118|       }
    119|       const ownership: unknown = await import(
       |                                  ^
    120|         pathToFileURL(path.join(root, "scripts", "lib", "dist-artifact…
    121|       );
⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯
Serialized Error: { code: 'ERR_MODULE_NOT_FOUND' }
⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/3]⎯
 FAIL   cli-process  src/cli/update-cli/update-command-lease.test.ts > update orchestration lifecycle ownership > repair completes missing source artifacts before consumers and leaves an exact online retry untouched
Error: Cannot find module '../../node-runtime-env.mjs' imported from /tmp/oc857271/.oc-ci-tmp/sLIt/t/oc-vt-5h2DTl/oc-vt-7AR31d/openclaw-test-state-update-lease-avMq6E/scripts/lib/dist-artifact-ownership.mts
 ❯ ../../../../../../tmp/oc857271/.oc-ci-tmp/sLIt/t/oc-vt-5h2DTl/oc-vt-7AR31d/openclaw-test-state-update-lease-avMq6E/scripts/lib/dist-artifact-ownership.mts:5:1
 ❯ src/cli/update-cli/update-command-runtime.ts:119:34
```

### compact-small-9 :: cli-process  src/cli/update-cli/update-command-lease.test.ts > update orchestration lifecycle ownership > resume preserves publication failure details when staging cleanup also fails
```
AssertionError: expected [Function] to throw error including 'Runtime completion and staging cleanu…' but got 'Cannot find module \'../../node-runti…'
Expected: "Runtime completion and staging cleanup failed"
Received: "Cannot find module '../../node-runtime-env.mjs' imported from /tmp/oc857271/.oc-ci-tmp/sLIt/t/oc-vt-5h2DTl/oc-vt-7AR31d/openclaw-test-state-update-lease-0X1jIW/scripts/lib/dist-artifact-ownership.mts"
 ❯ src/cli/update-cli/update-command-lease.test.ts:353:37
    351|     });
    352|     try {
    353|       await expect(invoke("resume")).rejects.toThrow(
       |                                     ^
    354|         "Runtime completion and staging cleanup failed",
    355|       );
⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[3/3]⎯
 Test Files  1 failed | 10 passed (11)
      Tests  3 failed | 158 passed | 12 skipped (173)
   Start at  13:30:36
   Duration  802.85s (tests 91%, transform 7%, import 1%)
[test] failed 1 Vitest shard in 804.14s
```

### extension-browser :: extension-browser  extensions/browser/src/browser/chrome.headless-cleanup.test.ts > cleans up a one-shot darwin cache shell only when ownsProfile=false
```
AssertionError: expected undefined to be '/tmp/oc7e0127/.oc-ci-tmp/s0da/t/oc-vt…' // Object.is equality
- Expected:
"/tmp/oc7e0127/.oc-ci-tmp/s0da/t/oc-vt-hU16U6/openclaw-headless-cleanup-SHurum/browsers/chromium-100/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing"
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
```

### extension-browser :: extension-browser  extensions/browser/src/browser/chrome.headless-cleanup.test.ts > cleans up a one-shot darwin cache shell only when ownsProfile=true
```
AssertionError: expected undefined to be '/tmp/oc7e0127/.oc-ci-tmp/s0da/t/oc-vt…' // Object.is equality
- Expected:
"/tmp/oc7e0127/.oc-ci-tmp/s0da/t/oc-vt-hU16U6/openclaw-headless-cleanup-N4doy7/browsers/chromium-100/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing"
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
AssertionError: expected undefined to be '/tmp/oc7e0127/.oc-ci-tmp/s0da/t/oc-vt…' // Object.is equality
- Expected:
```

### extension-browser :: extension-browser  extensions/browser/src/browser/chrome.headless-cleanup.test.ts > recovers stale cache browser with configuredHeadless=false, ownsProfile=true, code=websocket_health_command_timeout
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
```

### extension-browser :: extension-browser  extensions/browser/src/browser/chrome.headless-cleanup.test.ts > recovers stale cache browser with configuredHeadless=true, ownsProfile=true, code=websocket_health_command_timeout
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
   Start at  15:29:06
   Duration  223.73s (tests 45%, transform 37%, import 13%, setup 4%)
verifying completed generation before cleanup
```

### extension-database-workers.in-flight :: extension-database-workers  extensions/tlon/src/monitor/index.test.ts > monitorTlonProvider shutdown > streams deeply nested poison and capped messages over real HTTP SSE through production handlers and recovers on the next messages
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
+   "[tlon] Attempting authentication to http://127.0.0.1:41665...",
  ]
  3rd vi.fn() call:
  [
-   "tlon dropped channels event: Tlon firehose event is too deeply nested to store.",
+   "[tlon] Migrated dmAllowlist from config to settings store",
```

### extension-providers :: extension-providers  extensions/anthropic/session-catalog-transcript.test.ts > pages deeply nested Claude content without losing text
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
```

### extension-providers :: extension-providers  extensions/anthropic/session-catalog-transcript.test.ts > pages deeply nested Claude metadata without losing text
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
```

