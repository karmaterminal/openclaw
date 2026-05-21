import { describe, expect, it } from "vitest";
import type { OpenClawConfig } from "../config/types.openclaw.js";
import { resolveGatewayScopedTools } from "./tool-resolution.js";

// RED-test-first cure for karmaterminal/openclaw#723.
//
// continue_delegate stages a TaskFlow delegate that is drained only by an
// agent-turn finalization pass. Direct-invoke surfaces (gateway HTTP
// tools.invoke, MCP loopback) have no finalization drain — registering the
// tool there strands the queued work until an unrelated agent run drains it.
//
// Cure-axis (gate-out, per cael+silas cure-direction-decision-substrate):
// resolveGatewayScopedTools is invoked exclusively by direct-invoke paths
// (mcp-http.runtime, tools-invoke-shared). The createOpenClawTools call
// inside MUST pass drainsContinuationDelegateQueue:false so the gate at
// openclaw-tools.ts:528-535 hides continue_delegate from these surfaces.
// Agent-turn paths (agent-runner-execution) keep the tool by passing
// drainsContinuationDelegateQueue:true explicitly.

describe(
  "resolveGatewayScopedTools — #723 continue_delegate gated off direct-invoke surfaces",
  { timeout: 240000 },
  () => {
    const cfg = {
      session: { mainKey: "main", scope: "per-sender" },
      agents: { defaults: { continuation: { enabled: true } } },
    } as unknown as OpenClawConfig;

    it("hides continue_delegate on the http surface even when continuation.enabled=true", () => {
      const result = resolveGatewayScopedTools({
        cfg,
        sessionKey: "agent:main:gateway:user:test",
        messageProvider: "gateway",
        surface: "http",
      });

      expect(result.tools.some((tool) => tool.name === "continue_delegate")).toBe(false);
    });

    it("hides continue_delegate on the loopback surface even when continuation.enabled=true", () => {
      const result = resolveGatewayScopedTools({
        cfg,
        sessionKey: "agent:main:gateway:user:test",
        messageProvider: "gateway",
        surface: "loopback",
      });

      expect(result.tools.some((tool) => tool.name === "continue_delegate")).toBe(false);
    });
  },
);
