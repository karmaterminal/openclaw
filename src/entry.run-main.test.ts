import { spawnSync } from "node:child_process";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { runMainOrRootHelp } from "./entry.js";

describe("entry run-main boundary", () => {
  it("retains JSON console routing through process finalization", async () => {
    const runCli = vi.fn(async () => undefined);

    await runMainOrRootHelp(["node", "openclaw", "status"], {
      loadRunCli: async () => ({ runCli }),
    });

    expect(runCli).toHaveBeenCalledWith(["node", "openclaw", "status"], {
      additionalStartupTrace: expect.any(Object),
      retainConsoleRoutingUntilProcessExit: true,
    });
  });

  it("keeps expected conditions at exit 1 without crash framing", () => {
    const message =
      'The `openclaw workboard` command is provided by the "workboard" plugin, but that bundled plugin is disabled by default. Run `openclaw plugins enable workboard` to enable that CLI surface.';
    const result = spawnSync(
      process.execPath,
      [
        "--disable-warning=ExperimentalWarning",
        "--import",
        "tsx",
        "--input-type=module",
        "-e",
        `
          import { ExpectedCliError } from "./src/cli/failure-output.ts";
          import { runMainOrRootHelp } from "./src/entry.ts";
          const message = ${JSON.stringify(message)};
          const error = new ExpectedCliError({
            message,
            humanOutput: message,
            machineOutput: message,
          });
          await runMainOrRootHelp(["node", "openclaw", "workboard", "list"], {
            loadRunCli: async () => ({
              runCli: async () => {
                throw error;
              },
            }),
          });
        `,
      ],
      {
        cwd: path.resolve(import.meta.dirname, ".."),
        encoding: "utf8",
        env: { ...process.env, OPENCLAW_TEST_CONSOLE: "1" },
      },
    );

    expect(result.status).toBe(1);
    expect(result.stderr).toContain(message);
    expect(result.stderr).not.toContain("OPENCLAW_DEBUG");
    expect(result.stderr).not.toContain("openclaw doctor");
    expect(result.stderr).not.toContain("Could not start the CLI");
  });
});
