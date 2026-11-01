import fs from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useAutoCleanupTempDirTracker } from "../../../test/helpers/temp-dir.js";
import { isPidAlive } from "../../shared/pid-alive.js";
import type { SpawnInput } from "./types.js";

const tempDirs = useAutoCleanupTempDirTracker(afterEach);
let invocationLog: string;
let supervisor: Awaited<ReturnType<typeof loadSupervisor>>;

/** Stands in for systemd-run --scope: records its argv, then execs the command in place. */
function installFakeSystemdRun() {
  const dir = tempDirs.make("openclaw-supervisor-child-scope-");
  invocationLog = path.join(dir, "invocations.log");
  fs.writeFileSync(
    path.join(dir, "systemd-run"),
    `#!/bin/sh\nprintf '%s\\n' "$*" >> '${invocationLog}'\nwhile [ "$#" -gt 0 ] && [ "$1" != "--" ]; do shift; done; shift; exec "$@"\n`,
    { mode: 0o755 },
  );
  vi.stubEnv("PATH", `${dir}${path.delimiter}${process.env.PATH ?? ""}`);
  vi.stubEnv("XDG_RUNTIME_DIR", "/run/user/openclaw-test");
}

function scopedInvocations(): string[] {
  return fs.existsSync(invocationLog)
    ? fs
        .readFileSync(invocationLog, "utf8")
        .trim()
        .split("\n")
        .filter((line) => line.includes("MemoryMax=") && !line.endsWith(" -- true"))
    : [];
}

// The scope caches its probe per process; each case starts from a fresh module graph.
async function loadSupervisor(enabled: boolean) {
  vi.resetModules();
  const snapshot = await import("../../config/runtime-snapshot.js");
  snapshot.setRuntimeConfigSnapshot({
    process: { childScope: { enabled, memoryMax: "1G", memorySwapMax: "0" } },
  });
  const { createProcessSupervisor } = await import("./supervisor.js");
  return createProcessSupervisor();
}

/** The command reports its own pid and a grandchild's, then waits on the grandchild. */
async function spawnTree(input: Pick<SpawnInput, "childMemoryScope">) {
  let reported!: (line: string) => void;
  const report = new Promise<string>((resolve) => {
    reported = resolve;
  });
  const run = await supervisor.spawn({
    mode: "child",
    argv: ["/bin/sh", "-c", 'sleep 30 & echo "$$ $!"; wait'],
    stdinMode: "pipe-closed",
    onStdout: (chunk) => reported(chunk),
    ...input,
  });
  const [root, grandchild] = (await report).trim().split(" ").map(Number);
  run.cancel("manual-cancel");
  const exit = await run.wait();
  await run.waitForExtinction?.();
  return {
    pidIsCommand: run.pid === root,
    exit: { reason: exit.reason, exitCode: exit.exitCode, exitSignal: exit.exitSignal },
    grandchildAlive: isPidAlive(grandchild!),
  };
}

async function runToExit(input: Pick<SpawnInput, "childMemoryScope"> & { mode: "child" | "pty" }) {
  const run = await supervisor.spawn({
    argv: ["/bin/sh", "-c", 'printf "pid=%s" "$$"; exit 7'],
    captureOutput: true,
    ...input,
  });
  const exit = await run.wait();
  return {
    output: exit.stdout.trim() === `pid=${run.pid}`,
    exit: { reason: exit.reason, exitCode: exit.exitCode, exitSignal: exit.exitSignal },
  };
}

describe.skipIf(process.platform !== "linux")("child memory scope process parity", () => {
  beforeEach(installFakeSystemdRun);

  afterEach(async () => {
    await supervisor?.shutdown();
    (await import("../../config/runtime-snapshot.js")).clearRuntimeConfigSnapshot();
    vi.unstubAllEnvs();
  });

  it("keeps pid, signal delivery and tree termination identical to a plain spawn", async () => {
    supervisor = await loadSupervisor(false);
    const plain = await spawnTree({ childMemoryScope: true });
    await supervisor.shutdown();
    supervisor = await loadSupervisor(true);
    const scoped = await spawnTree({ childMemoryScope: true });

    expect(scopedInvocations()).toEqual([
      expect.stringMatching(
        /^--user --scope --quiet --collect --description=OpenClaw heavy child -p MemoryMax=1G -p MemorySwapMax=0 -- \/bin\/sh -c sleep 30 &/,
      ),
    ]);
    expect(plain).toEqual({
      pidIsCommand: true,
      exit: { reason: "manual-cancel", exitCode: null, exitSignal: "SIGTERM" },
      grandchildAlive: false,
    });
    expect(scoped).toEqual(plain);
  });

  it.each(["child", "pty"] as const)(
    "keeps stdout, pid and exit status identical in %s mode",
    async (mode) => {
      supervisor = await loadSupervisor(false);
      const plain = await runToExit({ mode, childMemoryScope: true });
      await supervisor.shutdown();
      supervisor = await loadSupervisor(true);
      const scoped = await runToExit({ mode, childMemoryScope: true });

      expect(scopedInvocations()).toHaveLength(1);
      expect(plain).toEqual({
        output: true,
        exit: { reason: "exit", exitCode: 7, exitSignal: null },
      });
      expect(scoped).toEqual(plain);
    },
  );

  it("never wraps a spawn that does not opt in, even with the scope enabled", async () => {
    supervisor = await loadSupervisor(true);

    await expect(runToExit({ mode: "child" })).resolves.toMatchObject({ output: true });
    expect(scopedInvocations()).toEqual([]);
  });
});
