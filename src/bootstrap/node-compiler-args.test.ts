import { afterEach, describe, expect, it } from "vitest";
import { resolveForwardedNodeCompilerArgs, withoutNodeCompilerArgs } from "./node-compiler-args.js";

const originalExecArgv = process.execArgv;
afterEach(() => {
  process.execArgv = originalExecArgv;
});

describe("explicit Node compiler policy", () => {
  it("leaves default compilation untouched", () => {
    process.execArgv = [];
    expect(resolveForwardedNodeCompilerArgs()).toEqual([]);
  });

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
    // Node rejects V8 flags in Worker execArgv; threads already share the process flags.
    expect(withoutNodeCompilerArgs(process.execArgv)).toEqual([
      "--inspect",
      "--opt",
      "--stack-size=8192",
    ]);
  });
});
