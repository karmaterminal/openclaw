import type { HookContext, HookEvent } from "./hook-runner-types.js";
import type { PluginHookName } from "./hook-types.js";

type BindVoidHook = <K extends PluginHookName>(
  hookName: K,
) => (event: HookEvent<K>, context: HookContext<K>) => Promise<void>;

/** Bind metadata-only lifecycle callbacks to the runner's normal void-hook policy. */
export function createSessionLifecycleHookMethods(bindVoidHook: BindVoidHook) {
  return {
    runSessionStart: bindVoidHook("session_start"),
    runSessionReset: bindVoidHook("session_reset"),
    runSessionDelete: bindVoidHook("session_delete"),
    runSubagentSpawned: bindVoidHook("subagent_spawned"),
    runSubagentProgress: bindVoidHook("subagent_progress"),
    runSubagentEnded: bindVoidHook("subagent_ended"),
  };
}
