// Covers OPENCLAW_TMP_DIR under a stubbed process.platform, as in CI shards' Windows tests.
import fs from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useAutoCleanupTempDirTracker } from "../../test/helpers/temp-dir.js";
import { withMockedWindowsPlatform } from "../test-utils/vitest-spies.js";
import { resolvePreferredOpenClawTmpDir } from "./tmp-openclaw-dir.js";

describe.skipIf(process.platform === "win32")("OPENCLAW_TMP_DIR host path rules", () => {
  const tempDirs = useAutoCleanupTempDirTracker(afterEach);

  // The override names a directory on this host, whatever platform a test stands in.
  it.each(["missing", "existing"] as const)(
    "judges %s overrides by this host's path rules while process.platform reads win32",
    (state) => {
      const uid = process.getuid?.();
      if (uid === undefined) {
        throw new Error("POSIX temp directory proof requires a process uid");
      }
      const root = tempDirs.make("openclaw-tmp-override-");
      // A setgid TMPDIR would pass its bit to the roots made here; they are plain 0700.
      fs.chmodSync(root, 0o700);
      const override = path.join(root, "shard-1");
      if (state === "existing") {
        fs.mkdirSync(override, { mode: 0o700 });
      }
      vi.stubEnv("OPENCLAW_TMP_DIR", override);
      const tmpdir = vi.fn(() => root);
      const warn = vi.fn();
      const resolve = () =>
        withMockedWindowsPlatform(() => resolvePreferredOpenClawTmpDir({ tmpdir, warn }));

      expect(resolve()).toBe(override);
      const stat = fs.lstatSync(override, { bigint: true });
      expect(stat.isDirectory()).toBe(true);
      expect(stat.uid).toBe(BigInt(uid));
      expect(stat.mode & 0o7777n).toBe(0o700n);
      expect(tmpdir).not.toHaveBeenCalled();
      expect(warn).not.toHaveBeenCalled();

      // This host's refusals still apply.
      fs.chmodSync(override, 0o770);
      expect(resolve).toThrow("other users can write to it");
      vi.stubEnv("OPENCLAW_TMP_DIR", "D:\\ci\\openclaw-tmp");
      expect(resolve).toThrow("it is not an absolute path");
    },
  );
});
