// Offline room-event churn audit script tests cover #1135/#1138 detector behavior.
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  analyzeRouting,
  detectNoopClusters,
  readSessionJsonl,
  readTrajectoryJsonl,
} from "../../scripts/audit-room-event-churn.mjs";
import { createScriptTestHarness } from "./test-helpers.js";

const { createTempDir } = createScriptTestHarness();

function writeJsonl(filePath: string, rows: unknown[]) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${rows.map((row) => JSON.stringify(row)).join("\n")}\n`);
}

function assistantTurn(timestamp: string, content: unknown[]) {
  return {
    timestamp,
    type: "message",
    sessionKey: "agent:main:discord:channel:1466192485440164011",
    message: {
      role: "assistant",
      content,
    },
  };
}

describe("audit-room-event-churn", () => {
  it("detects repeated zero-delay continue_work parking turns without user input", () => {
    const root = createTempDir("openclaw-room-event-churn-");
    const sessionFile = path.join(root, "session.jsonl.reset.2026-06-30T12-49-30Z");
    writeJsonl(sessionFile, [
      {
        timestamp: "2026-06-30T01:00:00.000Z",
        type: "message",
        sessionKey: "agent:main:discord:channel:1466192485440164011",
        message: { role: "user", content: "[OpenClaw room event]\ninbound_event_kind: room_event" },
      },
      assistantTurn("2026-06-30T01:00:05.000Z", [
        {
          type: "toolCall",
          name: "message",
          input: { action: "send", message: "NO_REPLY" },
        },
      ]),
      assistantTurn("2026-06-30T01:00:10.000Z", [
        {
          type: "toolCall",
          name: "continue_work",
          input: {
            delaySeconds: 0,
            reason: "Waiting in silence for proof batch. No visible message needed.",
          },
        },
      ]),
      assistantTurn("2026-06-30T01:00:20.000Z", [
        {
          type: "toolCall",
          name: "sessions_yield",
          input: { message: "parking" },
        },
      ]),
      assistantTurn("2026-06-30T01:00:30.000Z", [
        {
          type: "toolCall",
          name: "continue_work",
          input: {
            delaySeconds: 0,
            reason: "Waiting in silence for proof batch. No visible message needed.",
          },
        },
      ]),
      assistantTurn("2026-06-30T01:00:40.000Z", [
        {
          type: "toolCall",
          name: "continue_work",
          input: {
            delaySeconds: 0,
            reason: "Waiting in silence for proof batch. No visible message needed.",
          },
        },
      ]),
    ]);

    const trajectoryFile = path.join(root, "session.trajectory.jsonl");
    writeJsonl(trajectoryFile, [
      {
        timestamp: "2026-06-30T01:00:30.500Z",
        name: "model.completed",
        sessionKey: "agent:main:discord:channel:1466192485440164011",
        data: {
          model: "gemini-3.1-pro-preview",
          usage: { totalTokens: 250000, cacheReadTokens: 200000 },
        },
      },
    ]);

    const sessionEvents = readSessionJsonl(sessionFile);
    const trajectoryEvents = readTrajectoryJsonl(trajectoryFile);
    const clusters = detectNoopClusters(sessionEvents, trajectoryEvents, [], {
      minNoopTurns: 4,
      windowMs: 60_000,
    });

    expect(clusters).toHaveLength(1);
    expect(clusters[0]).toMatchObject({
      sessionKey: "agent:main:discord:channel:1466192485440164011",
      noOpTurns: 5,
      model: "gemini-3.1-pro-preview",
      trajectoryModelEvents: 1,
    });
    expect(clusters[0]?.repeatedZeroDelayReasons).toEqual([
      {
        reason: "Waiting in silence for proof batch. No visible message needed.",
        count: 3,
      },
    ]);
    expect(clusters[0]?.signals["zero-delay-continue_work"]).toBe(3);
  });

  it("breaks clusters at user-origin input", () => {
    const root = createTempDir("openclaw-room-event-churn-user-break-");
    const sessionFile = path.join(root, "session.jsonl");
    writeJsonl(sessionFile, [
      assistantTurn("2026-06-30T01:00:05.000Z", [
        { type: "toolCall", name: "sessions_yield", input: {} },
      ]),
      assistantTurn("2026-06-30T01:00:10.000Z", [
        { type: "toolCall", name: "sessions_yield", input: {} },
      ]),
      {
        timestamp: "2026-06-30T01:00:15.000Z",
        type: "message",
        sessionKey: "agent:main:discord:channel:1466192485440164011",
        message: { role: "user", content: "fresh user input" },
      },
      assistantTurn("2026-06-30T01:00:20.000Z", [
        { type: "toolCall", name: "sessions_yield", input: {} },
      ]),
      assistantTurn("2026-06-30T01:00:25.000Z", [
        { type: "toolCall", name: "sessions_yield", input: {} },
      ]),
    ]);

    const clusters = detectNoopClusters(readSessionJsonl(sessionFile), [], [], {
      minNoopTurns: 3,
      windowMs: 60_000,
    });

    expect(clusters).toEqual([]);
  });

  it("keeps child-parent routing split conditional unless a mismatch is present", () => {
    const mainEvents = [
      {
        kind: "user",
        roomEvent: true,
        sessionKey: "agent:main:discord:channel:1466192485440164011",
        filePath: "/tmp/main.jsonl",
      },
    ];

    expect(
      analyzeRouting(
        [
          {
            flowId: "flow-main",
            ownerKey: "agent:main:discord:channel:1466192485440164011",
            stateSessionKey: "agent:main:discord:channel:1466192485440164011",
            status: "queued",
            goal: "core/continuation-work",
          },
        ],
        mainEvents,
      ).disposition,
    ).toBe("keep-in-room-event-self-rearm-family");

    const split = analyzeRouting(
      [
        {
          flowId: "flow-child",
          ownerKey: "agent:main:subagent:child",
          stateSessionKey: "agent:main:discord:channel:1466192485440164011",
          parentRunId: "run-parent",
          status: "queued",
          goal: "core/continuation-work",
        },
      ],
      mainEvents,
    );

    expect(split.disposition).toBe("split-child-parent-binding-after-byte-review");
    expect(split.flowRoutingMismatches.map((entry) => entry.classification)).toContain(
      "owner-state-session-mismatch",
    );
  });
});
