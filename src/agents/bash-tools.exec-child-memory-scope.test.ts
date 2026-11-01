import fs from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { useAutoCleanupTempDirTracker } from "../../test/helpers/temp-dir.js";
import {
  clearRuntimeConfigSnapshot,
  setRuntimeConfigSnapshot,
} from "../config/runtime-snapshot.js";
import { createProcessSupervisor } from "../process/supervisor/supervisor.js";
import { withEnvAsync } from "../test-utils/env.js";
import { resetProcessRegistryForTests } from "./bash-process-registry.test-support.js";
import { createExecTool } from "./bash-tools.exec-run.js";

vi.mock("../process/supervisor/index.js", () => ({
  getProcessSupervisor: () => supervisor,
}));

let supervisor: ReturnType<typeof createProcessSupervisor>;
const tempDirs = useAutoCleanupTempDirTracker(afterEach);
beforeEach(() => {
  supervisor = createProcessSupervisor();
});
afterEach(async () => {
  await supervisor.shutdown();
  resetProcessRegistryForTests();
  clearRuntimeConfigSnapshot();
});

it.skipIf(process.platform !== "linux")(
  "runs host exec commands in the capped child scope with unchanged output and exit status",
  async () => {
    const cwd = tempDirs.make("exec-child-memory-scope-");
    const bin = path.join(cwd, "bin");
    const invocationLog = path.join(cwd, "systemd-run.log");
    fs.mkdirSync(bin);
    // Stands in for systemd-run --scope: records its argv, then execs the command in place.
    fs.writeFileSync(
      path.join(bin, "systemd-run"),
      `#!/bin/sh\nprintf '%s\\n' "$*" >> '${invocationLog}'\nwhile [ "$#" -gt 0 ] && [ "$1" != "--" ]; do shift; done; shift; exec "$@"\n`,
      { mode: 0o755 },
    );
    setRuntimeConfigSnapshot({
      process: { childScope: { enabled: true, memoryMax: "1G", memorySwapMax: "0" } },
    });
    await withEnvAsync(
      {
        // The Gateway service path: host exec runs through the owned service-child relay.
        OPENCLAW_SERVICE_MARKER: "exec-child-memory-scope-test",
        OPENCLAW_STATE_DIR: path.join(cwd, "state"),
        OPENCLAW_HOME: cwd,
        OPENCLAW_EXEC_SHELL_SNAPSHOT: "0",
        SHELL: "/bin/sh",
        PATH: `${bin}${path.delimiter}${process.env.PATH ?? ""}`,
        XDG_RUNTIME_DIR: "/run/user/openclaw-test",
      },
      async () => {
        const exec = createExecTool({
          host: "gateway",
          mode: "full",
          ask: "off",
          allowBackground: false,
          notifyOnExit: false,
          scopeKey: "agent:main:exec-child-memory-scope",
          cwd,
        });
        const result = await exec.execute("scoped", { command: "printf scoped-output; exit 7" });

        expect(result.details).toMatchObject({
          exitCode: 7,
          aggregated: "scoped-output\n\n(Command exited with code 7)",
        });
        const scoped = fs
          .readFileSync(invocationLog, "utf8")
          .trim()
          .split("\n")
          .filter((line) => line.includes("MemoryMax="));
        expect(scoped).toEqual([
          expect.stringMatching(
            /^--user --scope --quiet --collect --description=OpenClaw heavy child -p MemoryMax=1G -p MemorySwapMax=0 -- \/bin\/sh -c .*printf scoped-output; exit 7$/,
          ),
        ]);
      },
    );
  },
);
