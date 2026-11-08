import { afterEach, describe, expect, it } from "vitest";
import { execNodeEvalSync } from "../test-utils/node-process.js";
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
    // Importing publishes no Worker policy, even beside reviewed flags: Worker launches do.
    const policy = `(await import("node:worker_threads")).getEnvironmentData("openclaw.nodeCompilerArgs.v1")`;
    const url = new URL("./node-compiler-args.ts", import.meta.url).href;
    const source = `process.execArgv.push("--no-opt"); await import(${JSON.stringify(url)}); console.log(${policy});`;
    expect(execNodeEvalSync(source, { imports: ["tsx"] })).toBe("undefined\n");
  });
});
