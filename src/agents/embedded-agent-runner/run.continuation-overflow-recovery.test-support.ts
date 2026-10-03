import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { loadSessionEntry } from "../../config/sessions/session-accessor.js";
import { resetAgentEventsForTest } from "../../infra/agent-events.js";
import { peekSystemEventEntries, resetSystemEventsForTest } from "../../infra/system-events.js";
import {
  expectLogExcludes,
  expectMockCallFields,
  expectRecordFields,
} from "./run.continuation-fixture.test-support.js";
import {
  type makeAttemptResult,
  makeCompactionSuccess,
  makeOverflowError,
} from "./run.overflow-compaction.fixture.js";
import {
  mockedBuildEmbeddedRunPayloads,
  mockedCompactDirect,
  mockedLog,
  mockedRunEmbeddedAttempt,
  resetRunOverflowCompactionHarnessMocks,
} from "./run.overflow-compaction.harness.js";
import {
  createSharedRunIntegrationSession,
  loadSharedRunIntegrationHarness,
} from "./run.shared-integration-harness.test-support.js";

let runEmbeddedAgent: typeof import("./run.js").runEmbeddedAgent;
let fixture: Awaited<ReturnType<typeof createSharedRunIntegrationSession>> | undefined;
let overflowBaseRunParams: Awaited<
  ReturnType<typeof createSharedRunIntegrationSession>
>["runParams"];

/** Attempts report the case's own session id; the durable writer fence rejects any other. */
function makeCaseAttemptResult(
  overrides?: Parameters<typeof makeAttemptResult>[0],
): ReturnType<typeof makeAttemptResult> {
  if (!fixture) {
    throw new Error("overflow recovery case fixture is not initialized");
  }
  return fixture.makeAttemptResult(overrides);
}

function mockOverflowRetrySuccess(params: {
  runEmbeddedAttempt: {
    mockResolvedValueOnce: (value: ReturnType<typeof makeAttemptResult>) => unknown;
  };
  compactDirect: {
    mockImplementationOnce: (
      implementation: () => Promise<ReturnType<typeof makeCompactionSuccess>>,
    ) => unknown;
  };
  overflowMessage?: string;
  beforeCompact?: () => void;
}) {
  const overflowError = makeOverflowError(params.overflowMessage);

  params.runEmbeddedAttempt.mockResolvedValueOnce(
    makeCaseAttemptResult({ terminal: { kind: "failed", source: "prompt", error: overflowError } }),
  );
  params.runEmbeddedAttempt.mockResolvedValueOnce(makeCaseAttemptResult());
  params.compactDirect.mockImplementationOnce(async () => {
    params.beforeCompact?.();
    return makeCompactionSuccess({
      summary: "Compacted session",
      firstKeptEntryId: "entry-5",
      tokensBefore: 150000,
    });
  });

  return overflowError;
}

describe("runEmbeddedAgent overflow recovery continuation", () => {
  beforeAll(async () => {
    runEmbeddedAgent = await loadSharedRunIntegrationHarness();
  });

  beforeEach(async () => {
    fixture = await createSharedRunIntegrationSession();
    overflowBaseRunParams = fixture.runParams;
    resetAgentEventsForTest();
    resetSystemEventsForTest();
    resetRunOverflowCompactionHarnessMocks();
    mockedBuildEmbeddedRunPayloads.mockReturnValue([{ text: "ok" }]);
  });

  afterEach(async () => {
    try {
      await fixture?.cleanup();
    } finally {
      fixture = undefined;
      resetSystemEventsForTest();
    }
  });

  it("passes trigger=overflow when retrying compaction after context overflow", async () => {
    const config = {
      agents: {
        defaults: {
          continuation: {
            enabled: true,
            contextPressureThreshold: 0.8,
          },
        },
      },
    };
    const pressureEvents: ReturnType<typeof peekSystemEventEntries> = [];
    mockOverflowRetrySuccess({
      runEmbeddedAttempt: mockedRunEmbeddedAttempt,
      compactDirect: mockedCompactDirect,
      beforeCompact: () => {
        expect(loadSessionEntry(overflowBaseRunParams.sessionTarget!)).toMatchObject({
          lastContextPressureBand: 95,
        });
        pressureEvents.push(
          ...peekSystemEventEntries(overflowBaseRunParams.sessionKey).filter((event) =>
            event.text.includes("[system:context-pressure]"),
          ),
        );
      },
    });

    await runEmbeddedAgent({
      ...overflowBaseRunParams,
      config,
    });

    expect(mockedCompactDirect).toHaveBeenCalledTimes(1);
    const compactParams = expectMockCallFields(mockedCompactDirect, {
      sessionId: overflowBaseRunParams.sessionId,
      sessionTarget: expect.objectContaining({
        sessionId: overflowBaseRunParams.sessionId,
        sessionKey: overflowBaseRunParams.sessionKey,
      }),
    });
    expectRecordFields(compactParams.runtimeContext, {
      trigger: "overflow",
      authProfileId: "test-profile",
    });
    expect(pressureEvents).toHaveLength(1);
    expect(pressureEvents[0]?.text).toContain("preserve critical working state");
    expect(pressureEvents[0]?.text).not.toContain("continue_delegate");
  });

  it("does not enqueue overflow pressure guidance when continuation is disabled", async () => {
    const config = {
      agents: {
        defaults: {
          continuation: {
            enabled: false,
            contextPressureThreshold: 0.8,
          },
        },
      },
    };
    mockOverflowRetrySuccess({
      runEmbeddedAttempt: mockedRunEmbeddedAttempt,
      compactDirect: mockedCompactDirect,
    });

    await runEmbeddedAgent({
      ...overflowBaseRunParams,
      config,
    });

    expect(
      peekSystemEventEntries(overflowBaseRunParams.sessionKey).filter((event) =>
        event.text.includes("[system:context-pressure]"),
      ),
    ).toHaveLength(0);
    expect(loadSessionEntry(overflowBaseRunParams.sessionTarget!)).not.toHaveProperty(
      "lastContextPressureBand",
    );
  });

  it("uses the canonical session identity when sessionKey is empty on overflow path", async () => {
    const config = {
      agents: {
        defaults: {
          continuation: {
            enabled: true,
            contextPressureThreshold: 0.8,
          },
        },
      },
    };
    let sawCanonicalPressureEvent = false;
    mockOverflowRetrySuccess({
      runEmbeddedAttempt: mockedRunEmbeddedAttempt,
      compactDirect: mockedCompactDirect,
      beforeCompact: () => {
        sawCanonicalPressureEvent = peekSystemEventEntries(
          overflowBaseRunParams.sessionTarget.sessionKey,
        ).some((event) => event.text.includes("[system:context-pressure]"));
      },
    });

    await runEmbeddedAgent({ ...overflowBaseRunParams, sessionKey: "", config });

    expect(sawCanonicalPressureEvent).toBe(true);
    expectLogExcludes(mockedLog.warn, "[session-key:missing] site=pi-runner.overflow-compaction");
  });
});
