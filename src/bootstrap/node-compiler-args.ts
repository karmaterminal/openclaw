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

/** Worker threads already run under the process's V8 flags, and Node rejects them in Worker execArgv. */
export function withoutNodeCompilerArgs(options?: WorkerOptions): WorkerOptions | undefined {
  return options?.execArgv
    ? { ...options, execArgv: options.execArgv.filter((arg) => !isNodeCompilerArg(arg)) }
    : options;
}

// Every Worker copies a reviewed policy at construction; Worker launch owners import this module
// first. A parent without one publishes nothing, so Workers fall back to the same empty policy.
const policy = isMainThread ? resolveForwardedNodeCompilerArgs() : [];
if (policy.length > 0) {
  setEnvironmentData(COMPILER_ARGS_KEY, policy);
}
