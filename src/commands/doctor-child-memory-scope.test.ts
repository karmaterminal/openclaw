import fs from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { useAutoCleanupTempDirTracker } from "../../test/helpers/temp-dir.js";
import { collectChildMemoryScopeHealthFindings } from "./doctor-child-memory-scope.js";

const tempDirs = useAutoCleanupTempDirTracker(afterEach);
const enabled = { process: { childScope: { enabled: true } } };

beforeEach(() => {
  vi.stubEnv("XDG_RUNTIME_DIR", "/run/user/openclaw-test");
});
afterEach(() => {
  vi.unstubAllEnvs();
});

it.skipIf(process.platform !== "linux")(
  "reports an enabled child scope this host cannot provide",
  async () => {
    vi.stubEnv("PATH", tempDirs.make("doctor-child-scope-empty-path-"));

    await expect(collectChildMemoryScopeHealthFindings({})).resolves.toEqual([]);
    await expect(collectChildMemoryScopeHealthFindings(enabled)).resolves.toEqual([
      expect.objectContaining({
        checkId: "core/doctor/child-memory-scope",
        severity: "warning",
        message:
          "child memory scope unavailable: systemd-run is not on PATH; heavy children share the gateway cgroup",
        path: "process.childScope.enabled",
      }),
    ]);
  },
);

it.skipIf(process.platform !== "linux")(
  "stays quiet when the host can start a capped user scope",
  async () => {
    const bin = tempDirs.make("doctor-child-scope-bin-");
    fs.writeFileSync(
      path.join(bin, "systemd-run"),
      '#!/bin/sh\nwhile [ "$#" -gt 0 ] && [ "$1" != "--" ]; do shift; done; shift; exec "$@"\n',
      { mode: 0o755 },
    );
    vi.stubEnv("PATH", `${bin}${path.delimiter}${process.env.PATH ?? ""}`);

    await expect(collectChildMemoryScopeHealthFindings(enabled)).resolves.toEqual([]);
  },
);
