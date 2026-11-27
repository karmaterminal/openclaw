import { describe, expect, it } from "vitest";
import { buildAgentSystemPrompt } from "./system-prompt.js";

/**
 * docs/design/continue-work-signal-v2.md §3.4: the system-prompt continuation
 * section branches on tool availability to teach either the tool-path-first
 * path or the fallback-only path. A regression that inverts the branch would
 * teach agents the wrong path and ship green.
 */
describe("buildAgentSystemPrompt — continuation section branching", () => {
  const baseParams = {
    workspaceDir: "/tmp/openclaw",
  } as const;

  describe("continuationEnabled: true with continuation tools", () => {
    const prompt = buildAgentSystemPrompt({
      ...baseParams,
      continuationEnabled: true,
      toolNames: ["continue_work", "continue_delegate", "request_compaction"],
    });

    it("includes the continuation section header", () => {
      expect(prompt).toContain("## Continuation & Delegation");
      expect(prompt).toContain("### Self-elected turns");
      expect(prompt).toContain("### Delegated continuation");
      expect(prompt).toContain("### Context pressure");
    });

    it("teaches the `continue_work` tool first", () => {
      expect(prompt).toContain("`continue_work` tool");
      expect(prompt).toContain("structured `reason`");
      expect(prompt).toContain(
        "Use it for a next step you've chosen, not to wait or stand by; do not use it to idle or keep the session alive.",
      );
    });

    it("mentions brackets only as fallback for continue_work", () => {
      expect(prompt).toContain("Fallback bracket syntax remains available: CONTINUE_WORK");
    });

    it("teaches the `continue_delegate` tool", () => {
      expect(prompt).toContain("`continue_delegate` tool");
      expect(prompt).toContain("background sub-agents");
      expect(prompt).toContain(
        "The typed `continue_delegate` tool can carry inline attachments into its new child workspace.",
      );
      expect(prompt.split("## Continuation & Delegation")[1]).not.toMatch(
        /sessions_spawn|sessions_yield/,
      );
    });

    it("leads with the wake model and drops RFC jargon", () => {
      expect(prompt).toContain("### How you wake");
      expect(prompt).toContain("can choose this session's next turn");
      expect(prompt).toContain(
        "A delegate can elect its own continue_work turns or further delegates",
      );
      expect(prompt).toContain("fan out to chain ancestors");
      expect(prompt).toContain(
        "You run when an inbound message arrives, a scheduled automation fires, a background command you started exits with a wake, or a continuation you armed wakes you.",
      );
      expect(prompt).toContain(
        [
          "If you end without arming a continuation, unfinished work won't schedule its own next turn; an inbound message or automation can still wake you.",
          "- Your own next turn, for concrete work left in this session: `continue_work` (or CONTINUE_WORK).",
          "- Work that should run beside you or later: `continue_delegate`.",
        ].join("\n"),
      );
      expect(prompt).not.toContain("nothing else wakes you");
      expect(prompt.indexOf("### How you wake")).toBeLessThan(
        prompt.indexOf("### Self-elected turns"),
      );
      expect(prompt).not.toContain("(a)-shape");
      expect(prompt).not.toContain("session-delivery-queue substrate");
      expect(prompt).not.toContain("broadcast/publish-stream");
    });

    it("teaches the `request_compaction` tool", () => {
      expect(prompt).toContain("`request_compaction`");
      expect(prompt).toContain("post-compaction shards as a bounded handoff for working state.");
    });

    it("does NOT present the bracket syntax as the primary path", () => {
      expect(prompt).not.toContain("End your response with CONTINUE_WORK to request");
      expect(prompt).not.toContain(
        "End your response with [[CONTINUE_DELEGATE: task description]]",
      );
    });
  });

  describe("continuationEnabled: true without continuation tools", () => {
    const prompt = buildAgentSystemPrompt({
      ...baseParams,
      continuationEnabled: true,
      toolNames: [],
    });

    it("includes the continuation section header", () => {
      expect(prompt).toContain("## Continuation & Delegation");
    });

    it("teaches bracket syntax for self-elected turns", () => {
      expect(prompt).toContain("End your response with CONTINUE_WORK to request another turn");
      expect(prompt).toContain("CONTINUE_WORK:30");
    });

    it("teaches bracket syntax for delegation", () => {
      expect(prompt).toContain("End your response with [[CONTINUE_DELEGATE: task description]]");
      expect(prompt).toContain("[[CONTINUE_DELEGATE: task +30s | silent-wake]]");
      expect(prompt).toContain(
        "Bracket `[[CONTINUE_DELEGATE: ...]]` syntax cannot carry attachment blobs",
      );
    });

    it("does NOT present `continue_work` as a tool", () => {
      expect(prompt).not.toContain("`continue_work` tool");
      expect(prompt).not.toContain("Fallback bracket syntax remains available");
    });

    it("does NOT present `continue_delegate` as a tool", () => {
      expect(prompt).not.toContain("`continue_delegate` tool");
    });

    it("does NOT teach `request_compaction` when the tool is absent", () => {
      expect(prompt).not.toContain("Use `request_compaction` to trigger compaction");
    });
  });

  describe("continuationEnabled: true with only some continuation tools", () => {
    it("teaches continue_work as a tool but continue_delegate as brackets when only continue_work is available", () => {
      const prompt = buildAgentSystemPrompt({
        ...baseParams,
        continuationEnabled: true,
        toolNames: ["continue_work"],
      });

      expect(prompt).toContain("`continue_work` tool");
      expect(prompt).toContain("End your response with [[CONTINUE_DELEGATE: task description]]");
      expect(prompt).toContain(
        "Bracket `[[CONTINUE_DELEGATE: ...]]` syntax cannot carry attachment blobs",
      );
      expect(prompt).not.toContain("`continue_delegate` tool");
      expect(prompt).not.toContain("Use `request_compaction` to trigger compaction");
    });

    it("teaches continue_delegate as a tool but continue_work as brackets when only continue_delegate is available", () => {
      const prompt = buildAgentSystemPrompt({
        ...baseParams,
        continuationEnabled: true,
        toolNames: ["continue_delegate"],
      });

      expect(prompt).toContain("End your response with CONTINUE_WORK to request another turn");
      expect(prompt).toContain("`continue_delegate` tool");
      expect(prompt).toContain(
        "The typed `continue_delegate` tool can carry inline attachments into its new child workspace.",
      );
      expect(prompt).not.toContain("`continue_work` tool");
    });
  });

  describe("continuationEnabled: false", () => {
    const prompt = buildAgentSystemPrompt({
      ...baseParams,
      continuationEnabled: false,
      toolNames: ["continue_work", "continue_delegate", "request_compaction"],
    });

    it("omits the continuation section entirely", () => {
      expect(prompt).not.toContain("## Continuation & Delegation");
      expect(prompt).not.toContain("### Self-elected turns");
      expect(prompt).not.toContain("### Delegated continuation");
    });

    it("does not mention continuation tools even when toolNames includes them", () => {
      // Tools may still appear in the unrelated tools-listing section, but the
      // continuation teaching narrative must be absent.
      expect(prompt).not.toContain("Use `continue_work`");
      expect(prompt).not.toContain("Use `continue_delegate` for background");
    });
  });

  describe("continuationEnabled omitted (default)", () => {
    it("omits the continuation section by default", () => {
      const prompt = buildAgentSystemPrompt({
        ...baseParams,
        toolNames: ["continue_work", "continue_delegate"],
      });

      expect(prompt).not.toContain("## Continuation & Delegation");
    });
  });

  describe("prompt-cache stability", () => {
    it("produces byte-identical output across repeated calls with the same inputs (tool path)", () => {
      const params = {
        ...baseParams,
        continuationEnabled: true,
        toolNames: ["continue_work", "continue_delegate", "request_compaction"],
      };

      const a = buildAgentSystemPrompt(params);
      const b = buildAgentSystemPrompt(params);
      const c = buildAgentSystemPrompt(params);

      expect(b).toBe(a);
      expect(c).toBe(a);
    });

    it("produces byte-identical output across repeated calls with the same inputs (bracket path)", () => {
      const params = {
        ...baseParams,
        continuationEnabled: true,
        toolNames: [],
      };

      const a = buildAgentSystemPrompt(params);
      const b = buildAgentSystemPrompt(params);

      expect(b).toBe(a);
    });

    it("produces different output when toolNames presence flips (cache invalidation expected)", () => {
      const withTools = buildAgentSystemPrompt({
        ...baseParams,
        continuationEnabled: true,
        toolNames: ["continue_work", "continue_delegate", "request_compaction"],
      });
      const withoutTools = buildAgentSystemPrompt({
        ...baseParams,
        continuationEnabled: true,
        toolNames: [],
      });

      expect(withoutTools).not.toBe(withTools);
    });

    it("produces different output when continuationEnabled flips", () => {
      const enabled = buildAgentSystemPrompt({
        ...baseParams,
        continuationEnabled: true,
        toolNames: [],
      });
      const disabled = buildAgentSystemPrompt({
        ...baseParams,
        continuationEnabled: false,
        toolNames: [],
      });

      expect(disabled).not.toBe(enabled);
    });
  });

  describe("turn-cycle line", () => {
    const render = (toolNames: string[]) =>
      buildAgentSystemPrompt({ ...baseParams, continuationEnabled: true, toolNames });
    it("omits the line when no turn control is exposed", () => {
      expect(render([])).not.toContain("You control your own turn cycle:");
    });
    it("names a single control with is", () => {
      expect(render(["continue_work"])).toContain(
        "You control your own turn cycle: `continue_work` is how.",
      );
    });
    it("names every exposed control with are", () => {
      expect(render(["continue_work", "continue_delegate", "request_compaction"])).toContain(
        "You control your own turn cycle: `continue_work`, `continue_delegate`, `request_compaction` are how.",
      );
    });
  });

  // Cron, toolsAllow-capped (the room heartbeat) and sub-agent runs get the minimal prompt.
  describe("minimal prompt", () => {
    const render = (toolNames: string[], promptMode?: "minimal") =>
      buildAgentSystemPrompt({ ...baseParams, continuationEnabled: true, toolNames, promptMode });
    const wakeBlock = (prompt: string) =>
      prompt.slice(prompt.indexOf("### How you wake"), prompt.indexOf("\n### Self-elected turns"));

    it("carries the full prompt's wake lines when a turn control is callable", () => {
      const prompt = render(["continue_work"], "minimal");
      const wake = wakeBlock(render(["continue_work"]));
      expect(wake).toContain("You control your own turn cycle: `continue_work` is how.");
      expect(prompt).toContain(`## Continuation & Delegation\n${wake}\n## Chain Delegation`);
      expect(prompt).not.toContain("### Self-elected turns");
    });

    it("keeps only the chain-delegation fallback when no turn control is callable", () => {
      const prompt = render([], "minimal");
      expect(prompt).toContain("## Chain Delegation");
      expect(prompt).not.toContain("### How you wake");
    });
  });

  describe("## Tooling list", () => {
    const work =
      "- continue_work: Take your own next turn, now or after a delay; no message needed.";
    const delegate =
      "- continue_delegate: Run bounded work beside you; its result returns to you (`silent-wake` wakes you).";
    const compaction =
      "- request_compaction: Compact at a moment you choose; stage working state first.";
    const toolLines = (toolNames: string[], promptMode?: "minimal") =>
      buildAgentSystemPrompt({ ...baseParams, continuationEnabled: true, toolNames, promptMode })
        .split("Tools policy-filtered. Names case-sensitive; call exact.\n")[1]
        ?.split("\nThe AGENTS.md Tools section guides usage")[0]
        ?.split("\n");

    it.each([undefined, "minimal"] as const)(
      "gives all three core slots beside sessions_yield (promptMode %s)",
      (promptMode) => {
        // Shuffled input: the renderer owns core order and alphabetical extras.
        const names =
          "zeta_x request_compaction continue_delegate subagents continue_work sessions_yield alpha_x";
        expect(toolLines(names.split(" "), promptMode)).toEqual([
          "- sessions_yield: End turn; await subagent events",
          work,
          delegate,
          compaction,
          "- subagents: Subagent status/cancel",
          "- alpha_x",
          "- zeta_x",
        ]);
      },
    );

    it("omits an unavailable tool and its summary", () => {
      expect(toolLines(["continue_work", "sessions_yield"])).toEqual([
        "- sessions_yield: End turn; await subagent events",
        work,
      ]);
      expect(toolLines(["continue_delegate"])).toEqual([delegate]);
    });
  });
});
