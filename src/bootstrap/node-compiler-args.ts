import {
  getEnvironmentData,
  isMainThread,
  setEnvironmentData,
  type WorkerOptions,
} from "node:worker_threads";
import { isNodeCompilerArg } from "../../node-runtime-env.mjs";

// V8 flags are process-wide, but a Worker given its own execArgv cannot carry them.
const COMPILER_ARGS_KEY = "openclaw.nodeCompilerArgs.v1";

/** Forward explicit compiler policy into OpenClaw-owned Node child processes. */
export function resolveForwardedNodeCompilerArgs(): string[] {
  const own = process.execArgv.filter(isNodeCompilerArg);
  if (isMainThread || own.length > 0) {
    return own;
  }
  const inherited = getEnvironmentData(COMPILER_ARGS_KEY);
  return Array.isArray(inherited) ? inherited.filter(isNodeCompilerArg) : [];
}

/**
 * Options for an OpenClaw-owned Worker constructed next. Threads already run under the process's
 * V8 flags and Node rejects them in Worker execArgv, so they leave execArgv and are published for
 * the thread's own children instead. Each Worker copies that data at construction, so publishing
 * at launch rather than at import still reaches it; a parent without a policy publishes nothing.
 */
export function prepareWorkerCompilerPolicy(options?: WorkerOptions): WorkerOptions | undefined {
  const policy = isMainThread ? resolveForwardedNodeCompilerArgs() : [];
  if (policy.length > 0) {
    setEnvironmentData(COMPILER_ARGS_KEY, policy);
  }
  return options?.execArgv
    ? { ...options, execArgv: options.execArgv.filter((arg) => !isNodeCompilerArg(arg)) }
    : options;
}
