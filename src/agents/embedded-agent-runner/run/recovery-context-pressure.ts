import { resolveContinuationRuntimeConfig } from "../../../auto-reply/continuation/config.js";
import { emitPersistedContextPressure } from "../../../auto-reply/continuation/context-pressure.js";
import { resolveBuiltInCompactionTrigger } from "../../../auto-reply/reply/memory-flush-plan.js";
import { SESSION_TOTAL_TOKENS_VERSION, type SessionEntry } from "../../../config/sessions.js";
import { loadExactSessionEntryReadOnly } from "../../../config/sessions/session-accessor.js";
import { log } from "../logger.js";
import type { EmbeddedRunCompactionRecoveryInput } from "./compaction-runtime.js";

/** Routes recovery pressure through the durable continuation policy owner. */
export async function emitRecoveryContextPressure(
  input: EmbeddedRunCompactionRecoveryInput,
  totalTokens: number,
): Promise<void> {
  if (input.runParams.sessionPersistence === "detached") {
    return;
  }
  // Recovery can only name tools admitted for this exact run. A hot reload
  // changes the next run's inventory, not the already-prepared attempt.
  const runtimeConfig = resolveContinuationRuntimeConfig(input.runParams.config ?? {});
  if (!runtimeConfig.enabled) {
    return;
  }
  const activeSession = input.getActiveSession();
  const sessionKey =
    activeSession.target?.sessionKey ??
    input.runParams.sessionTarget?.sessionKey ??
    input.resolvedSessionKey;
  const storePath = activeSession.target?.storePath ?? input.runParams.sessionTarget?.storePath;
  const agentId = activeSession.target?.agentId ?? input.runParams.sessionTarget?.agentId;
  if (!sessionKey || !storePath) {
    log.warn(
      "[context-pressure] recovery event skipped because the durable session target is missing",
    );
    return;
  }
  let sessionEntry: SessionEntry | undefined;
  try {
    sessionEntry = loadExactSessionEntryReadOnly({
      agentId,
      sessionKey,
      storePath,
    })?.entry;
  } catch (error) {
    log.warn(
      `[context-pressure] recovery event skipped because session state could not be read for ${sessionKey}: ${String(error)}`,
    );
    return;
  }
  if (!sessionEntry) {
    log.warn(
      `[context-pressure] recovery event skipped because no durable session row exists for ${sessionKey}`,
    );
    return;
  }
  const contextWindowTokens = input.contextTokenBudget ?? 0;
  try {
    await emitPersistedContextPressure({
      agentId,
      sessionEntry: {
        ...sessionEntry,
        totalTokens,
        totalTokensFresh: true,
        totalTokensVersion: SESSION_TOTAL_TOKENS_VERSION,
      },
      sessionKey,
      storePath,
      expectedSessionId: activeSession.id,
      continuationEnabled: runtimeConfig.enabled,
      contextPressureThreshold: runtimeConfig.contextPressureThreshold,
      contextWindowTokens,
      earlyWarningBand: runtimeConfig.earlyWarningBand,
      // Both recovery callers require generic compaction, so the built-in trigger applies.
      compactionTriggerTokens: resolveBuiltInCompactionTrigger({
        cfg: input.runParams.config ?? {},
        contextWindowTokens,
        provider: input.modelSelection.provider,
        modelId: input.modelSelection.model,
      }),
    });
  } catch (error) {
    log.warn(
      `[context-pressure] recovery event skipped because its band could not be persisted for ${sessionKey}: ${String(error)}`,
    );
  }
}
