import path from "node:path";
import type { Command } from "commander";
import { theme } from "../../packages/terminal-core/src/theme.js";
import {
  loadSovereignPromptSnapshot,
  resolveSovereignPromptTarget,
  toSovereignPromptRefusal,
} from "../agents/sovereign-prompts/loader.js";
import { describeSovereignPromptRegistry } from "../agents/sovereign-prompts/registry.js";
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
  const config = await captureRuntimeConfigAsyncReader()();
  try {
    const target = resolveSovereignPromptTarget(config, agentId);
    agentId = target.agentId;
    result = run(target);
  } catch (error) {
    // An unexpected failure is io_error too (§ 5.2), so native error text never prints.
    result = refusedResult(agentId, toSovereignPromptRefusal(error));
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
          ["openclaw sovereign slots --json", "List the slots this build declares and renders."],
        ])}\n${formatDocsHelp("/cli/sovereign")}`,
    );

  sovereign
    .command("paths")
    .description("Show the agent's sovereign prompt root and switch state; reads no file")
    .requiredOption("--agent <id>", "Agent id")
    .option("--json", "Print JSON", false)
    .action(async (opts: SovereignOptions) => {
      await runSovereignCommand(opts, ({ agentId, mode, root, current, generations }) => ({
        ok: true,
        payload: { ok: true, agentId, mode, root, current, generations },
        lines: [`agent: ${agentId}`, `mode: ${mode}`, `root: ${root}`],
      }));
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
        // An empty value is a scripting error, never a request for the live generation.
        if (opts.generation?.trim() === "") {
          throw new SovereignPromptRefusal("generation_missing");
        }
        const snapshot = loadSovereignPromptSnapshot({
          agentId: target.agentId,
          target:
            opts.generation === undefined
              ? { root: target.root }
              : { generationDir: path.resolve(opts.generation) },
        });
        const { line, fields } = describeSovereignPromptsLoaded(snapshot);
        return { ok: true, payload: { ok: true, ...fields }, lines: [line] };
      });
    });

  sovereign
    .command("slots")
    .description("List the slots, files and reserved tokens this build declares; reads no file")
    .option("--json", "Print JSON", false)
    .action((opts: { json?: boolean }) => {
      const registry = describeSovereignPromptRegistry();
      if (opts.json) {
        defaultRuntime.writeJson({ ok: true, ...registry });
        return;
      }
      defaultRuntime.log(
        registry.slots
          .map(
            ({ slot, files, required, phase, converted }) =>
              `${slot} phase=${phase}${required ? " required" : ""}${converted ? " converted" : ""}: ${files.join(", ")}`,
          )
          .join("\n"),
      );
    });
}
