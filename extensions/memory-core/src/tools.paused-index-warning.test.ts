import { beforeEach, describe, expect, it, vi } from "vitest";

const { memoryLoggerWarn } = vi.hoisted(() => ({
  memoryLoggerWarn: vi.fn<(message: string, meta?: Record<string, unknown>) => void>(),
}));

vi.mock("openclaw/plugin-sdk/memory-core-host-engine-foundation", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("openclaw/plugin-sdk/memory-core-host-engine-foundation")>();
  return {
    ...actual,
    createSubsystemLogger: (subsystem: string) => ({
      ...actual.createSubsystemLogger(subsystem),
      warn: memoryLoggerWarn,
    }),
  };
});

import {
  resetMemoryToolMockState,
  setMemoryCustomStatus,
  setMemorySearchImpl,
} from "./memory-tool-manager-mock.js";
import { testing as memoryToolsTesting } from "./tools.js";
import { createMemorySearchToolOrThrow } from "./tools.test-helpers.js";

describe("memory_search paused-index loud warning", () => {
  beforeEach(() => {
    resetMemoryToolMockState({ searchImpl: async () => [] });
    memoryToolsTesting.resetMemorySearchToolCooldowns();
    memoryToolsTesting.resetPausedMemoryIndexWarningDedupe();
    memoryLoggerWarn.mockClear();
  });

  it("emits a loud subsystem warning the first time memory_search hits a paused index", async () => {
    setMemorySearchImpl(async () => []);
    const reason = "index was built for provider openai, expected ollama";
    setMemoryCustomStatus({
      indexIdentity: { status: "mismatched", reason },
    });

    const tool = createMemorySearchToolOrThrow({
      config: {
        agents: { list: [{ id: "main", default: true }] },
        memory: { citations: "off" },
      },
    });
    await tool.execute("paused-1", { query: "hello" });

    expect(memoryLoggerWarn).toHaveBeenCalledTimes(1);
    const [message] = memoryLoggerWarn.mock.calls[0] as [string];
    expect(message).toContain("memory search paused");
    expect(message).toContain(reason);
    expect(message).toContain("openclaw memory index --force");
  });

  it("dedupes the loud warning across repeated calls with the same reason", async () => {
    setMemorySearchImpl(async () => []);
    const reason = "index was built for provider openai, expected ollama";
    setMemoryCustomStatus({
      indexIdentity: { status: "mismatched", reason },
    });

    const tool = createMemorySearchToolOrThrow({
      config: {
        agents: { list: [{ id: "main", default: true }] },
        memory: { citations: "off" },
      },
    });
    await tool.execute("paused-2a", { query: "first" });
    await tool.execute("paused-2b", { query: "second" });
    await tool.execute("paused-2c", { query: "third" });

    expect(memoryLoggerWarn).toHaveBeenCalledTimes(1);
  });

  it("re-warns when the paused reason changes", async () => {
    setMemorySearchImpl(async () => []);
    setMemoryCustomStatus({
      indexIdentity: {
        status: "mismatched",
        reason: "first reason: provider mismatch",
      },
    });

    const tool = createMemorySearchToolOrThrow({
      config: {
        agents: { list: [{ id: "main", default: true }] },
        memory: { citations: "off" },
      },
    });
    await tool.execute("paused-3a", { query: "alpha" });

    setMemoryCustomStatus({
      indexIdentity: {
        status: "missing",
        reason: "second reason: index metadata is missing",
      },
    });
    await tool.execute("paused-3b", { query: "beta" });

    expect(memoryLoggerWarn).toHaveBeenCalledTimes(2);
    const messages = memoryLoggerWarn.mock.calls.map((call) => (call as [string])[0]);
    expect(messages[0]).toContain("first reason");
    expect(messages[1]).toContain("second reason");
  });

  it("does not warn when the index identity is healthy", async () => {
    setMemorySearchImpl(async () => []);
    setMemoryCustomStatus(undefined);

    const tool = createMemorySearchToolOrThrow({
      config: {
        agents: { list: [{ id: "main", default: true }] },
        memory: { citations: "off" },
      },
    });
    await tool.execute("healthy", { query: "hello" });

    expect(memoryLoggerWarn).not.toHaveBeenCalled();
  });
});
