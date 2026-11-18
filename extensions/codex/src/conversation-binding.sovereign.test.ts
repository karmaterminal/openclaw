// A conversation bound to a Codex thread (`/codex bind`, a Codex CLI node session) runs on
// Codex's own base, never the agent's sovereign files (openclaw#1321). An enforce agent's
// message there refuses visibly before any handoff; an off agent's runs as before.
import { expect, it, vi } from "vitest";
import {
  createCodexTestBindingStore,
  createConversationInspection,
} from "./app-server/session-binding.test-helpers.js";
import { handleCodexConversationInboundClaim } from "./conversation-binding-hooks.js";
import {
  conversationMessage,
  createConversationClaimFixtures,
} from "./conversation-binding.test-helpers.js";

const turns = vi.hoisted(() => ({ runBound: vi.fn(async () => ({ text: "bound reply" })) }));

vi.mock(
  import("openclaw/plugin-sdk/conversation-binding-inspection-runtime"),
  async (original) => ({
    ...(await original()),
    inspectConversationBinding: (conversation) =>
      createConversationInspection(conversation, "binding-1"),
  }),
);

vi.mock(import("./app-server/sandbox-guard.js"), async (original) => ({
  ...(await original()),
  prepareCodexNativeSandboxBlock: async () => ({
    block: undefined,
    assertCurrent: async () => {},
    release() {},
  }),
}));

vi.mock(import("./conversation-binding.js"), async (original) => ({
  ...(await original()),
  runBoundTurnWithMissingThreadRecovery: turns.runBound,
}));

const config = (mode: "enforce" | "off") => ({
  agents: { entries: { main: { sovereignPrompts: { mode } } } },
});

const bindings = {
  "codex:conversation-binding": {
    kind: "codex-app-server-session",
    version: 2,
    bindingId: "binding-1",
    workspaceDir: "/repo",
    agentId: "main",
  },
  "codex:cli-node-session": {
    kind: "codex-cli-node-session",
    version: 1,
    nodeId: "node-1",
    sessionId: "session-1",
    agentId: "main",
    cwd: "/repo",
  },
};

it.each(Object.entries(bindings))(
  "refuses an enforce agent's message on %s before any turn, and runs an off agent's",
  async (route, data) => {
    turns.runBound.mockClear();
    const bindingStore = createCodexTestBindingStore();
    const claims = createConversationClaimFixtures(() => "/codex", bindingStore);
    const resumeCodexCliSessionOnNode = vi.fn(async () => ({
      ok: true as const,
      sessionId: "session-1",
      text: "node reply",
    }));
    const claim = (mode: "enforce" | "off") =>
      handleCodexConversationInboundClaim(
        conversationMessage("continue", { senderIsOwner: true, sessionKey: "agent:main:bound" }),
        claims.conversationClaimContext(data, "agent:main:bound"),
        { bindingStore, config: config(mode), resumeCodexCliSessionOnNode },
      );

    const refused = await claim("enforce");
    expect(refused).toEqual({
      handled: true,
      reply: {
        text: expect.stringMatching(
          // Chat display escapes the underscore.
          new RegExp(
            `turn failed: sovereign prompts refused: code=route.unconverted route=${route}$`,
          ),
        ),
      },
    });
    expect(turns.runBound).not.toHaveBeenCalled();
    expect(resumeCodexCliSessionOnNode).not.toHaveBeenCalled();

    const ran = await claim("off");
    expect(ran?.reply?.text).toMatch(/bound reply|node reply/);
  },
);
