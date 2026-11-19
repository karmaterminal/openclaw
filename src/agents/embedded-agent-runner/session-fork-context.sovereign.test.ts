// A sovereign prompt agent's fork never replays a checkpointed prefix (#1321, design § 6.4):
// one written before the switch is stock text, and the agent writes no new ones.
import path from "node:path";
import { afterAll, afterEach, expect, it } from "vitest";
import { makeUserMessage } from "../../../test/helpers/user-message.js";
import { upsertSessionEntryCore } from "../../config/sessions/session-accessor.sqlite-entry.js";
import type { OpenClawConfig } from "../../config/types.js";
import { resetSovereignRedactionForTests } from "../../logging/sovereign-redaction.js";
import { useSessionStoreTempDirs } from "../../test-utils/session-state-cleanup.js";
import { sessionScope } from "../sessions/session-manager-fixtures.test-support.js";
import { SessionManager } from "../sessions/session-manager.js";
import { resetSovereignPromptRuntimeForTests } from "../sovereign-prompts/runtime.js";
import {
  body,
  sovereignAgentsConfig,
  writeAgentGeneration,
} from "../sovereign-prompts/sovereign-fixture.test-support.js";
import { makeProviderModelFixture } from "../test-helpers/provider-model-fixture.js";
import { prepareEmbeddedSessionForkContext } from "./session-fork-context.js";
import { buildSystemPromptRouteKey } from "./session-prompt-state.js";

const tempDirs = useSessionStoreTempDirs(afterAll, "openclaw-sovereign-fork-");
afterEach(() => {
  resetSovereignPromptRuntimeForTests();
  resetSovereignRedactionForTests();
});

it("a sovereign prompt agent's fork rebuilds instead of replaying a stock checkpoint", async () => {
  const dir = tempDirs.make();
  const scope = sessionScope(path.join(dir, "sessions.json"), "sovereign-fork");
  await upsertSessionEntryCore(scope, { sessionId: scope.sessionId, updatedAt: 1 });
  const source = await SessionManager.openAsync(scope, dir);
  await source.appendMessageAsync(makeUserMessage("hello", 1));
  const model = makeProviderModelFixture({
    provider: "openai",
    id: "gpt-4o",
    api: "openai-completions",
    baseUrl: "https://api.openai.com/v1",
  });
  // A route-matched checkpoint written while the agent was still "off".
  await source.appendCustomEntryAsync("openclaw.system-prompt", {
    routeKey: buildSystemPromptRouteKey({
      provider: model.provider,
      model: model.id,
      api: model.api,
      baseUrl: model.baseUrl,
      inHistorySystemUpdates: true,
      personalProfile: undefined,
    }),
    historyId: null,
    prefix: "Checkpointed stock prefix",
  });
  const agentDir = tempDirs.make();
  writeAgentGeneration(agentDir, "main");
  const fork = (mode?: "enforce") =>
    prepareEmbeddedSessionForkContext({
      target: scope,
      sessionFile: scope.sessionKey,
      model,
      workspaceDir: dir,
      agentDir,
      agentId: scope.agentId,
      config: {
        plugins: { enabled: false },
        ...sovereignAgentsConfig({ main: { agentDir, mode } }),
      } as OpenClawConfig,
      assertCurrent() {},
    });

  expect((await fork()).systemPrompt).toBe("Checkpointed stock prefix");
  const forked = await fork("enforce");
  expect(forked.systemPrompt).not.toContain("Checkpointed stock prefix");
  expect(forked.systemPrompt?.split("\n")[0]).toBe(body("identity-section.md").trim());
});
