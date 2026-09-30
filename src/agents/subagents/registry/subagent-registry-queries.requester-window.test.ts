// Subagent registry requester-window tests cover direct child listings scoped to
// one requester run, including children bound to that run by requesterTurnRunId.
// Split from subagent-registry-queries.test.ts to keep both under the test
// max-lines cap.
import { describe, expect, it } from "vitest";
import {
  createSubagentRunRecord,
  type SubagentRunRecordOverrides,
} from "../../subagent-test-fixtures.test-helpers.js";
import { listRunsForRequesterFromRuns } from "./subagent-registry-queries.js";
import type { SubagentRunRecord } from "./subagent-registry.types.js";

function makeRun(overrides: Partial<SubagentRunRecordOverrides>): SubagentRunRecord {
  const runId = overrides.runId ?? "run-default";
  const childSessionKey = overrides.childSessionKey ?? `agent:main:subagent:${runId}`;
  const requesterSessionKey = overrides.requesterSessionKey ?? "agent:main:main";
  return createSubagentRunRecord({
    runId,
    childSessionKey,
    requesterSessionKey,
    requesterDisplayKey: requesterSessionKey,
    task: "test task",
    cleanup: "keep",
    createdAt: overrides.createdAt ?? 1,
    ...overrides,
  });
}

function toRunMap(runs: SubagentRunRecord[]): Map<string, SubagentRunRecord> {
  return new Map(runs.map((run) => [run.runId, run]));
}

describe("subagent registry query regressions", () => {
  it("scopes direct child listings to the requester run window when requesterRunId is provided", () => {
    const requesterSessionKey = "agent:main:subagent:orchestrator";
    const runs = toRunMap([
      makeRun({
        runId: "run-parent-old",
        childSessionKey: requesterSessionKey,
        requesterSessionKey: "agent:main:main",
        createdAt: 100,
        startedAt: 100,
        endedAt: 150,
      }),
      makeRun({
        runId: "run-parent-current",
        childSessionKey: requesterSessionKey,
        requesterSessionKey: "agent:main:main",
        createdAt: 200,
        startedAt: 200,
        endedAt: 260,
      }),
      makeRun({
        runId: "run-child-stale",
        childSessionKey: `${requesterSessionKey}:subagent:stale`,
        requesterSessionKey,
        createdAt: 130,
      }),
      makeRun({
        runId: "run-child-current-a",
        childSessionKey: `${requesterSessionKey}:subagent:current-a`,
        requesterSessionKey,
        createdAt: 210,
      }),
      makeRun({
        runId: "run-child-current-b",
        childSessionKey: `${requesterSessionKey}:subagent:current-b`,
        requesterSessionKey,
        createdAt: 220,
      }),
      makeRun({
        runId: "run-child-future",
        childSessionKey: `${requesterSessionKey}:subagent:future`,
        requesterSessionKey,
        createdAt: 270,
      }),
      makeRun({
        runId: "run-child-bound-current-late",
        requesterTurnRunId: "run-parent-current",
        childSessionKey: `${requesterSessionKey}:subagent:bound-current-late`,
        requesterSessionKey,
        createdAt: 270,
      }),
      makeRun({
        runId: "run-child-bound-other-in-window",
        requesterTurnRunId: "run-parent-old",
        childSessionKey: `${requesterSessionKey}:subagent:bound-other-in-window`,
        requesterSessionKey,
        createdAt: 230,
      }),
    ]);

    const scoped = listRunsForRequesterFromRuns(runs, requesterSessionKey, {
      requesterRunId: "run-parent-current",
    });
    const scopedRunIds = scoped.map((entry) => entry.runId).toSorted();

    expect(scopedRunIds).toEqual([
      "run-child-bound-current-late",
      "run-child-current-a",
      "run-child-current-b",
    ]);
  });
});
