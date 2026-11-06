import { getEnvironmentData, setEnvironmentData } from "node:worker_threads";
import { afterEach, describe, expect, it, vi } from "vitest";
import { resolveForwardedNodeCompilerArgs } from "./node-compiler-args.js";

const originalExecArgv = process.execArgv;
const publishedPolicy = getEnvironmentData("openclaw.nodeCompilerArgs.v1");
afterEach(() => {
  process.execArgv = originalExecArgv;
  setEnvironmentData("openclaw.nodeCompilerArgs.v1", publishedPolicy);
});

describe("explicit Node compiler policy", () => {
  it("preserves operator and tooling overrides without injecting defaults", async () => {
    process.execArgv = [
      "--inspect",
      "--maglev",
      "--no_concurrent_sparkplug",
      "--no-maglev",
      "--no-opt",
      "--opt",
      "--stack-size=8192",
    ];
    const actual = resolveForwardedNodeCompilerArgs();
    expect(actual).toEqual(["--maglev", "--no_concurrent_sparkplug", "--no-maglev", "--no-opt"]);
    process.execArgv = ["--inspect"];
    setEnvironmentData("openclaw.nodeCompilerArgs.v1", undefined);
    vi.resetModules();
    await import("./node-compiler-args.js");
    expect(getEnvironmentData("openclaw.nodeCompilerArgs.v1")).toBeUndefined();
  });
});
