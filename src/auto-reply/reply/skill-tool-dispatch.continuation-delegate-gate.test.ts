import { describe, expect, it } from "vitest";
import type { OpenClawConfig } from "../../config/types.openclaw.js";
import type { MsgContext } from "../templating.js";
import { resolveSkillDispatchTools } from "./skill-tool-dispatch.runtime.js";

// RED-test-first cure for karmaterminal/openclaw#723 — skill-tool direct
// dispatch arm. See gateway/tool-resolution.continuation-delegate-gate.test.ts
// for the full cure-axis-decision substrate. Skill-tool dispatch fires the
// tool directly outside of an agent-turn finalization pass, so registering
// continue_delegate here would strand the queued delegate.

describe(
  "resolveSkillDispatchTools — #723 continue_delegate gated off skill-tool direct dispatch",
  { timeout: 240000 },
  () => {
    it("hides continue_delegate even when continuation.enabled=true", () => {
      const tools = resolveSkillDispatchTools({
        ctx: {} as MsgContext,
        cfg: {
          session: { mainKey: "main", scope: "per-sender" },
          agents: { defaults: { continuation: { enabled: true } } },
        } as unknown as OpenClawConfig,
        agentId: "main",
        sessionKey: "agent:main:skill:user:test",
        workspaceDir: "/tmp",
        provider: "anthropic",
        model: "sonnet-4.6",
        senderIsOwner: true,
      });

      expect(tools.some((tool) => tool.name === "continue_delegate")).toBe(false);
    });
  },
);
