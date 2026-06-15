// Active Memory shard test isolation: settle in-flight recalls between tests.
//
// extensions/active-memory/index.test.ts runs fake-timer recall tests (the
// near-limit preflight latency / delayed-recall-start cases) alongside
// real-timer tests in one non-isolated worker. A fake-timer recall can leave
// its embedded-agent call gated behind real `tempWorkspace()` fs setup; once
// real timers resume that call lands in a *later* test and consumes that
// test's `runEmbeddedAgent` mockImplementationOnce. The "no recall evidence"
// case then falls through to the default recall fixture and fails. Vitest's
// non-isolated runner only drains run state at file boundaries, so a late
// straggler recall survives between tests in the same file.
//
// Draining the macrotask queue in afterEach lets any straggler recall reach
// and finish its embedded-agent call within its originating test's teardown,
// before the next test swaps the shared mock. This keeps the shard
// order-independent without touching the byte-identical plugin source or test.
import { afterEach } from "vitest";

const DRAIN_CYCLES = 16;

afterEach(async () => {
  // Each cycle yields through the event loop's poll phase (setImmediate, never
  // faked by these tests) and then a real short timer, giving pending fs I/O
  // like `tempWorkspace()` mkdtemp wall-clock time to complete. A blind
  // setImmediate spin can race ahead of slow I/O, so the timer is what makes
  // the straggler recall reliably reach and finish its embedded-agent call
  // here, in its originating test's teardown, before the next test runs.
  for (let cycle = 0; cycle < DRAIN_CYCLES; cycle += 1) {
    await new Promise<void>((resolve) => {
      setImmediate(resolve);
    });
    await new Promise<void>((resolve) => {
      setTimeout(resolve, 1);
    });
  }
});
