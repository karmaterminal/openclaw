import path from "node:path";
import type { Command } from "commander";
import { theme } from "../../packages/terminal-core/src/theme.js";
import {
  loadAgentSovereignPrompts,
  loadSovereignPromptSnapshot,
  resolveSovereignPromptTarget,
} from "../agents/sovereign-prompts/loader.js";
import {
  describeSovereignPromptsLoaded,
  describeSovereignPromptsRefused,
  SovereignPromptRefusal,
} from "../agents/sovereign-prompts/snapshot.js";
import { captureRuntimeConfigAsyncReader } from "../config/config.js";
import { defaultRuntime } from "../runtime.js";
import { formatDocsHelp, formatHelpExamples } from "./help-format.js";
import { exitCliAfterOutput } from "./one-shot-exit.js";

type SovereignOptions = { agent: string; json?: boolean };

type SovereignResult = { ok: boolean; payload: Record<string, unknown>; lines: string[] };

function refusedResult(agentId: string, refusal: SovereignPromptRefusal): SovereignResult {
  const { line, fields } = describeSovereignPromptsRefused(agentId, refusal);
  return { ok: false, payload: { ok: false, ...fields }, lines: [line] };
}

/** Output is content-free by construction: codes, names, sizes, digests and paths only. */
async function runSovereignCommand(
  opts: SovereignOptions,
  run: (target: ReturnType<typeof resolveSovereignPromptTarget>) => SovereignResult,
): Promise<void> {
  let agentId = opts.agent;
  let result: SovereignResult;
  try {
    const target = resolveSovereignPromptTarget(await captureRuntimeConfigAsyncReader()(), agentId);
    agentId = target.agentId;
    result = run(target);
  } catch (error) {
    if (!(error instanceof SovereignPromptRefusal)) {
      throw error;
    }
    result = refusedResult(agentId, error);
  }
  if (opts.json) {
    defaultRuntime.writeJson(result.payload);
  } else if (result.ok) {
    defaultRuntime.log(result.lines.join("\n"));
  } else {
    defaultRuntime.error(result.lines.join("\n"));
  }
  if (!result.ok) {
    exitCliAfterOutput(defaultRuntime, 1);
  }
}

export function registerSovereignCli(program: Command) {
  const sovereign = program
    .command("sovereign")
    .description("Locate and check an agent's sovereign prompt files without printing them")
    .addHelpText(
      "after",
      () =>
        `\n${theme.heading("Examples:")}\n${formatHelpExamples([
          ["openclaw sovereign paths --agent main --json", "Show the agent's sovereign root."],
          [
            "openclaw sovereign check --agent main --json",
            "Check the generation CURRENT points to.",
          ],
          [
            "openclaw sovereign check --agent main --generation <dir> --json",
            "Check a candidate generation before publishing it.",
          ],
        ])}\n${formatDocsHelp("/cli/sovereign")}`,
    );

  sovereign
    .command("paths")
    .description("Show the agent's sovereign prompt root and switch state; reads no file")
    .requiredOption("--agent <id>", "Agent id")
    .option("--json", "Print JSON", false)
    .action(async (opts: SovereignOptions) => {
      await runSovereignCommand(opts, (target) => {
        const { agentId, mode, root, current, generations } = target;
        const startup = loadAgentSovereignPrompts(target);
        const lines = [`agent: ${agentId}`, `mode: ${mode}`, `root: ${root}`];
        if (startup.state === "refused") {
          const refused = refusedResult(agentId, startup.refusal);
          return {
            ok: false,
            payload: { ...refused.payload, mode, root, current, generations },
            lines: [...lines, ...refused.lines],
          };
        }
        return {
          ok: true,
          payload: { ok: true, agentId, mode, state: startup.state, root, current, generations },
          lines,
        };
      });
    });

  sovereign
    .command("check")
    .description("Check a generation mechanically and print codes, names, sizes and digests")
    .requiredOption("--agent <id>", "Agent id")
    .option(
      "--generation <dir>",
      "Candidate generation directory (default: the generation CURRENT points to)",
    )
    .option("--json", "Print JSON", false)
    .action(async (opts: SovereignOptions & { generation?: string }) => {
      await runSovereignCommand(opts, (target) => {
        const snapshot = loadSovereignPromptSnapshot({
          agentId: target.agentId,
          target: opts.generation
            ? { generationDir: path.resolve(opts.generation) }
            : { root: target.root },
        });
        const { line, fields } = describeSovereignPromptsLoaded(snapshot);
        return { ok: true, payload: { ok: true, ...fields }, lines: [line] };
      });
    });
}
