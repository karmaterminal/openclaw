import type { EmbeddedRunAttemptParamsV2 as EmbeddedRunAttemptParams } from "openclaw/plugin-sdk/agent-harness-runtime";

type OpenClawCodingToolsOptions = NonNullable<
  Parameters<(typeof import("openclaw/plugin-sdk/agent-harness"))["createOpenClawCodingTools"]>[0]
>;

type ScheduledWorkToolOptionKey =
  | "cronCreatorToolAllowlistRef"
  | "cronCreatorToolAllowlistCaptureRef"
  | "cronCreatorAuthorityUnavailableReason"
  | "drainsContinuationDelegateQueue"
  | "continueWorkOpts"
  | "requestCompactionOpts"
  | "disableContinuationTools";

/**
 * Tool-surface options that let a Codex turn schedule later work: cron-creator
 * authority for scheduled jobs and continuation (continue_work / delegate /
 * compaction) wiring. Key order matches the options literal this spreads into.
 */
export function resolveCodexScheduledWorkToolOptions(
  params: EmbeddedRunAttemptParams,
  input: {
    cronCreatorToolAllowlistRef?: OpenClawCodingToolsOptions["cronCreatorToolAllowlistRef"];
    cronCreatorToolAllowlistCaptureRef?: OpenClawCodingToolsOptions["cronCreatorToolAllowlistCaptureRef"];
    cronCreatorAuthorityUnavailableReason?: OpenClawCodingToolsOptions["cronCreatorAuthorityUnavailableReason"];
    disableContinuationTools?: boolean;
  },
): Pick<OpenClawCodingToolsOptions, ScheduledWorkToolOptionKey> {
  return {
    cronCreatorToolAllowlistRef: input.cronCreatorToolAllowlistRef,
    cronCreatorToolAllowlistCaptureRef: input.cronCreatorToolAllowlistCaptureRef,
    cronCreatorAuthorityUnavailableReason: input.cronCreatorAuthorityUnavailableReason,
    drainsContinuationDelegateQueue: params.drainsContinuationDelegateQueue,
    continueWorkOpts: params.continueWorkOpts,
    requestCompactionOpts: params.requestCompactionOpts,
    disableContinuationTools: input.disableContinuationTools,
  };
}
