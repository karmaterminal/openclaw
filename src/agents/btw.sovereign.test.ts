// A /btw side question on a plugin harness runs on that harness's own thread state (a Codex
// fork restores the thread's creation base), so a sovereign prompt agent refuses it (#1321).
import { beforeEach, describe, expect, it } from "vitest";
import * as btw from "./btw.test-support.js";

const modelRef = { provider: "openai", model: "gpt-5.5" } as const;

describe("BTW side questions for a sovereign prompt agent", () => {
  btw.setupBtwTestHooks();
  beforeEach(() => {
    btw.mockOpenAIPlatformProfile();
    btw.mockResolvedModel({
      provider: modelRef.provider,
      id: modelRef.model,
      api: "openai-responses",
      baseUrl: "https://api.openai.com/v1",
    });
  });

  it("refuses a Codex side question before the harness runs; an off agent's still runs", async () => {
    const codexSideQuestion = btw.registerCodexSideQuestionHarness();
    await expect(
      btw.runSideQuestion({
        cfg: { agents: { entries: { main: { sovereignPrompts: { mode: "enforce" } } } } },
        ...modelRef,
      }),
    ).rejects.toMatchObject({
      name: "SovereignPromptRefusal",
      code: "route_unconverted",
      details: { route: "codex:side-question" },
    });
    expect(codexSideQuestion).not.toHaveBeenCalled();

    await btw.runSideQuestion({ cfg: { agents: { entries: { main: {} } } }, ...modelRef });
    expect(codexSideQuestion).toHaveBeenCalledOnce();
  });
});
