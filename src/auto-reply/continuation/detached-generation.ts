// Continuation (karmaterminal): a detached continuation re-entry (timer, retry, retained operator
// scope) admits on the plugin generation current when it runs, never the arming turn's. Upstream's
// helper drops the inherited generation scopes; the prepared reply dispatch runtime pins the arming
// request's generation too (get-reply-run acquires on it), so it goes with them.
import { bindPreparedReplyDispatchRuntime } from "../reply/prepared-reply-dispatch-context.js";
import { runOutsideAdmittedGenerationScopes } from "../reply/queue/drain-admission-scope.js";

export function runOnCurrentPluginGeneration<T>(run: () => T): T {
  return runOutsideAdmittedGenerationScopes(bindPreparedReplyDispatchRuntime(undefined, run));
}
