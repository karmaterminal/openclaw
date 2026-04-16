import { describe, expect, it } from "vitest";
import { AgentDefaultsSchema } from "./zod-schema.agent-defaults.js";
import { AgentEntrySchema } from "./zod-schema.agent-runtime.js";

describe("agent defaults schema", () => {
  it("accepts subagent archiveAfterMinutes=0 to disable archiving", () => {
    expect(() =>
      AgentDefaultsSchema.parse({
        subagents: {
          archiveAfterMinutes: 0,
        },
      }),
    ).not.toThrow();
  });

  it("accepts videoGenerationModel", () => {
    expect(() =>
      AgentDefaultsSchema.parse({
        videoGenerationModel: {
          primary: "qwen/wan2.6-t2v",
          fallbacks: ["minimax/video-01"],
        },
      }),
    ).not.toThrow();
  });

  it("accepts mediaGenerationAutoProviderFallback", () => {
    expect(() =>
      AgentDefaultsSchema.parse({
        mediaGenerationAutoProviderFallback: false,
      }),
    ).not.toThrow();
  });

  it("accepts contextInjection: always", () => {
    const result = AgentDefaultsSchema.parse({ contextInjection: "always" })!;
    expect(result.contextInjection).toBe("always");
  });

  it("accepts contextInjection: continuation-skip", () => {
    const result = AgentDefaultsSchema.parse({ contextInjection: "continuation-skip" })!;
    expect(result.contextInjection).toBe("continuation-skip");
  });

  it("rejects invalid contextInjection values", () => {
    expect(() => AgentDefaultsSchema.parse({ contextInjection: "never" })).toThrow();
  });

  it("accepts embeddedPi.executionContract", () => {
    const result = AgentDefaultsSchema.parse({
      embeddedPi: {
        executionContract: "strict-agentic",
      },
    })!;
    expect(result.embeddedPi?.executionContract).toBe("strict-agentic");
  });

  it("accepts positive heartbeat timeoutSeconds on defaults and agent entries", () => {
    const defaults = AgentDefaultsSchema.parse({
      heartbeat: { timeoutSeconds: 45 },
    })!;
    const agent = AgentEntrySchema.parse({
      id: "ops",
      heartbeat: { timeoutSeconds: 45 },
    });

    expect(defaults.heartbeat?.timeoutSeconds).toBe(45);
    expect(agent.heartbeat?.timeoutSeconds).toBe(45);
  });

  it("rejects zero heartbeat timeoutSeconds", () => {
    expect(() => AgentDefaultsSchema.parse({ heartbeat: { timeoutSeconds: 0 } })).toThrow();
    expect(() => AgentEntrySchema.parse({ id: "ops", heartbeat: { timeoutSeconds: 0 } })).toThrow();
  });

  it("accepts continuation defaults", () => {
    const result = AgentDefaultsSchema.parse({
      continuation: {
        enabled: true,
        defaultDelayMs: 0,
        minDelayMs: 0,
        maxDelayMs: 30_000,
        maxChainLength: 4,
        costCapTokens: 500_000,
        maxDelegatesPerTurn: 3,
        contextPressureThreshold: 0.8,
      },
    })!;

    expect(result.continuation).toMatchObject({
      enabled: true,
      defaultDelayMs: 0,
      minDelayMs: 0,
      maxDelayMs: 30_000,
      maxChainLength: 4,
      costCapTokens: 500_000,
      maxDelegatesPerTurn: 3,
      contextPressureThreshold: 0.8,
    });
  });

  it("rejects non-positive continuation context pressure thresholds", () => {
    expect(() =>
      AgentDefaultsSchema.parse({
        continuation: { contextPressureThreshold: 0 },
      }),
    ).toThrow();
  });
});
