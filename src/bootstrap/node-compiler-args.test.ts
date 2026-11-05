import { afterEach, describe, expect, it } from "vitest";
import { resolveForwardedNodeCompilerArgs } from "./node-compiler-args.js";

const originalExecArgv = process.execArgv;
afterEach(() => {
  process.execArgv = originalExecArgv;
});

describe("explicit Node compiler policy", () => {
  it("preserves operator and tooling overrides without injecting defaults", () => {
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
  });
});
