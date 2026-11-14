import { resolveFastModeState } from "../../agents/fast-mode.js";
import type { RunPreparedReplyParams } from "./get-reply-run.types.js";

/** Fast-mode fields admitted onto a reply run; the fast reply runtime always runs without it. */
export function resolveReplyRunFastMode({
  useFastReplyRuntime,
  cfg,
  provider,
  model,
  agentId,
  sessionEntry,
  params,
}: Parameters<typeof resolveFastModeState>[0] & {
  useFastReplyRuntime: boolean;
  params: Pick<
    RunPreparedReplyParams,
    | "resolvedFastMode"
    | "resolvedFastModeOverride"
    | "resolvedFastModeAutoOnSeconds"
    | "resolvedFastModeAutoOnSecondsOverride"
  >;
}) {
  if (useFastReplyRuntime) {
    return { fastMode: false, fastModeAutoOnSeconds: undefined, fastModeOverride: true };
  }
  const fastModeState = resolveFastModeState({
    cfg,
    provider,
    model,
    agentId,
    sessionEntry,
  });
  return {
    fastMode: params.resolvedFastModeOverride ? params.resolvedFastMode : fastModeState.requestMode,
    fastModeAutoOnSeconds: params.resolvedFastModeAutoOnSeconds ?? fastModeState.fastAutoOnSeconds,
    ...(params.resolvedFastModeOverride ? { fastModeOverride: true } : {}),
    ...(params.resolvedFastModeAutoOnSecondsOverride
      ? { fastModeAutoOnSecondsOverride: true }
      : {}),
  };
}
