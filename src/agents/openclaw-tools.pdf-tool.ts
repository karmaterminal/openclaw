// Run-scoped pdf tool construction, split from openclaw-tools.ts to keep that file under its line cap.
import type { OpenClawToolsOptions } from "./openclaw-tools.types.js";
import type { AnyAgentTool } from "./tools/common.js";
import { createPdfTool } from "./tools/pdf-tool.js";

type PdfToolRunContext = Pick<
  NonNullable<Parameters<typeof createPdfTool>[0]>,
  "agentId" | "workspaceDir" | "sandbox"
>;

/** Builds the pdf tool when the run's media plan admits it and the run has an agent dir. */
export function createOpenClawPdfToolForRun(
  options: OpenClawToolsOptions | undefined,
  enabled: boolean,
  run: PdfToolRunContext,
): AnyAgentTool | null {
  return enabled && options?.agentDir?.trim()
    ? createPdfTool({
        ...options,
        agentId: run.agentId,
        workspaceDir: run.workspaceDir,
        sandbox: run.sandbox,
        activeModel:
          options?.modelProvider && options.modelId
            ? {
                provider: options.modelProvider,
                model: options.modelId,
                supportsImages: options.modelHasVision === true,
              }
            : undefined,
      })
    : null;
}
