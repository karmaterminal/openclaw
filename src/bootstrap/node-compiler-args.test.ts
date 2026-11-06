import { getEnvironmentData } from "node:worker_threads";
import { afterEach, describe, expect, it, vi } from "vitest";
import { resolveForwardedNodeCompilerArgs } from "./node-compiler-args.js";

const originalExecArgv = process.execArgv;
afterEach(() => {
  process.execArgv = originalExecArgv;
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
    const published = getEnvironmentData("openclaw.nodeCompilerArgs.v1");
    process.execArgv = ["--inspect"];
    vi.resetModules();
    await import("./node-compiler-args.js");
    expect(getEnvironmentData("openclaw.nodeCompilerArgs.v1")).toEqual(published);
  });
});
