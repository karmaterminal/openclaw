import { getEnvironmentData, isMainThread, setEnvironmentData } from "node:worker_threads";
import { isNodeCompilerArg } from "../../node-runtime-env.mjs";

// V8 flags are process-wide, but a Worker's execArgv is its own; threads read the main thread's.
const COMPILER_ARGS_KEY = "openclaw.nodeCompilerArgs.v1";

/** Forward explicit compiler policy into OpenClaw-owned Node child processes. */
export function resolveForwardedNodeCompilerArgs(): string[] {
  const inherited = isMainThread ? undefined : getEnvironmentData(COMPILER_ARGS_KEY);
  return Array.isArray(inherited)
    ? inherited.filter(isNodeCompilerArg)
    : process.execArgv.filter(isNodeCompilerArg);
}

/** Worker threads already run under the process's V8 flags, and Node rejects them in Worker execArgv. */
export function withoutNodeCompilerArgs(execArgv: readonly string[]): string[] {
  return execArgv.filter((arg) => !isNodeCompilerArg(arg));
}

// Every Worker copies this at construction; Worker launch owners import this module first.
if (isMainThread) {
  setEnvironmentData(COMPILER_ARGS_KEY, resolveForwardedNodeCompilerArgs());
}
