import { describe, expect, it, vi } from "vitest";
import { ExpectedCliError } from "./cli/failure-output.js";
import { runMainOrRootHelp } from "./entry.js";
import { loggingState } from "./logging/state.js";
import {
  captureConsoleSnapshot,
  restoreConsoleSnapshot,
} from "./logging/test-helpers/console-snapshot.js";

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

  it("keeps expected conditions at exit 1 without crash framing", async () => {
    const previousExitCode = process.exitCode;
    const message =
      'The `openclaw workboard` command is provided by the "workboard" plugin, but that bundled plugin is disabled by default. Run `openclaw plugins enable workboard` to enable that CLI surface.';
    const error = new ExpectedCliError({
      message,
      humanOutput: message,
      machineOutput: message,
    });
    const consoleSnapshot = captureConsoleSnapshot();
    const previousConsolePatched = loggingState.consolePatched;
    const previousRawConsole = loggingState.rawConsole;
    const previousStreamErrorHandlersInstalled = loggingState.streamErrorHandlersInstalled;
    const previousCachedLogger = loggingState.cachedLogger;
    const previousCachedSettings = loggingState.cachedSettings;
    const previousCachedConsoleSettings = loggingState.cachedConsoleSettings;
    if (previousRawConsole) {
      console.log = previousRawConsole.log;
      console.info = previousRawConsole.info;
      console.warn = previousRawConsole.warn;
      console.error = previousRawConsole.error;
    }
    loggingState.consolePatched = false;
    loggingState.rawConsole = null;
    loggingState.streamErrorHandlersInstalled = true;
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    process.exitCode = undefined;

    try {
      await runMainOrRootHelp(["node", "openclaw", "workboard", "list"], {
        loadRunCli: async () => ({
          runCli: vi.fn(async () => {
            throw error;
          }),
        }),
      });

      expect(process.exitCode).toBe(1);
      expect(errorSpy.mock.calls).toEqual([[message]]);
      expect(errorSpy).not.toHaveBeenCalledWith(expect.stringContaining("OPENCLAW_DEBUG"));
      expect(errorSpy).not.toHaveBeenCalledWith(expect.stringContaining("openclaw doctor"));
      expect(errorSpy).not.toHaveBeenCalledWith(expect.stringContaining("Could not start the CLI"));
    } finally {
      errorSpy.mockRestore();
      restoreConsoleSnapshot(consoleSnapshot);
      loggingState.consolePatched = previousConsolePatched;
      loggingState.rawConsole = previousRawConsole;
      loggingState.streamErrorHandlersInstalled = previousStreamErrorHandlersInstalled;
      loggingState.cachedLogger = previousCachedLogger;
      loggingState.cachedSettings = previousCachedSettings;
      loggingState.cachedConsoleSettings = previousCachedConsoleSettings;
      process.exitCode = previousExitCode;
    }
  });
});
