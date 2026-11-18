// Harness routes (Codex) frame workspace files with their own preamble; a sovereign prompt
// agent's personal USER.md line there is its own fragment, never the built-in one (#1321).
import path from "node:path";
import { afterAll, afterEach, expect, it, vi } from "vitest";
import { useAutoCleanupTempDirTracker } from "../../../test/helpers/temp-dir.js";
import type { OpenClawConfig } from "../../config/types.js";
import { resetSovereignRedactionForTests } from "../../logging/sovereign-redaction.js";
import * as bootstrapRuntime from "../bootstrap-files.js";
import { resetSovereignPromptRuntimeForTests } from "../sovereign-prompts/runtime.js";
import {
  body,
  expectNoSentinelFilesSince,
  sovereignAgentsConfig,
  writeAgentGeneration,
} from "../sovereign-prompts/sovereign-fixture.test-support.js";
import { PERSONAL_USER_CONTEXT_INSTRUCTIONS } from "../system-prompt-context-files.js";
import { prepareAgentWorkspaceContext } from "./workspace-context.js";

const startedAt = Date.now();
const tempDirs = useAutoCleanupTempDirTracker(afterEach);
afterAll(() => expectNoSentinelFilesSince(startedAt));
afterEach(() => {
  vi.restoreAllMocks();
  resetSovereignPromptRuntimeForTests();
  resetSovereignRedactionForTests();
});

const workspaceDir = path.resolve("workspace-context-sovereign-fixture");
const PERSONAL = "project-context-section.d/personal-user.md";

it("uses the agent's own personal-user line, omits it when absent, and keeps stock when off", async () => {
  vi.spyOn(bootstrapRuntime, "resolveBootstrapFilesForRun").mockResolvedValue([
    {
      name: "USER.md",
      path: path.join(workspaceDir, "users/alice/USER.md"),
      content: "alice.",
      missing: false,
      personalUser: true,
    },
    {
      name: "SOUL.md",
      path: path.join(workspaceDir, "SOUL.md"),
      content: "Agent voice.",
      missing: false,
    },
  ] as Awaited<ReturnType<typeof bootstrapRuntime.resolveBootstrapFilesForRun>>);
  const withFragment = tempDirs.make("openclaw-sovereign-persona-");
  writeAgentGeneration(withFragment, "framed", { files: { [PERSONAL]: body(PERSONAL) } });
  const withoutFragment = tempDirs.make("openclaw-sovereign-persona-");
  writeAgentGeneration(withoutFragment, "bare");
  const config = sovereignAgentsConfig({
    framed: { agentDir: withFragment, mode: "enforce" },
    bare: { agentDir: withoutFragment, mode: "enforce" },
    plain: { agentDir: withoutFragment },
  }) as OpenClawConfig;
  const persona = async (agentId: string) =>
    (
      await prepareAgentWorkspaceContext({
        workspaceDir,
        scope: "full",
        config,
        agentId,
        bootstrapUserProfileId: "alice",
      })
    ).personaInstructions ?? "";

  const framed = await persona("framed");
  expect(framed).toContain(body(PERSONAL).trim());
  expect(framed).not.toContain(PERSONAL_USER_CONTEXT_INSTRUCTIONS);
  const bare = await persona("bare");
  expect(bare).toContain("alice.");
  expect(bare).not.toContain(PERSONAL_USER_CONTEXT_INSTRUCTIONS);
  expect(await persona("plain")).toContain(PERSONAL_USER_CONTEXT_INSTRUCTIONS);
});
