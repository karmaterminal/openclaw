// Check Temp Path Guardrails tests cover repository-scale tracked path inventories.
import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const NODE_DEFAULT_MAX_BUFFER_BYTES = 1024 * 1024;
const TRACKED_FILE_COUNT = 5_000;
const LONG_PATH_FRAGMENT = "x".repeat(210);
const guardScriptPath = fileURLToPath(
  new URL("../../scripts/check-temp-path-guardrails.ts", import.meta.url),
);

describe("check-temp-path-guardrails", () => {
  it("handles tracked path inventories larger than Node's default child-process buffer", () => {
    const repoDir = fs.mkdtempSync(path.join(os.tmpdir(), "openclaw-temp-path-guard-"));
    try {
      execFileSync("git", ["init", "--quiet"], { cwd: repoDir });
      const emptyBlob = execFileSync("git", ["hash-object", "-w", "--stdin"], {
        cwd: repoDir,
        encoding: "utf8",
        input: "",
      }).trim();
      const indexEntries = Array.from(
        { length: TRACKED_FILE_COUNT },
        (_, index) =>
          `100644 ${emptyBlob}\tsrc/${String(index).padStart(5, "0")}-${LONG_PATH_FRAGMENT}.ts`,
      ).join("\n");
      execFileSync("git", ["update-index", "--index-info"], {
        cwd: repoDir,
        input: `${indexEntries}\n`,
      });

      const trackedPaths = execFileSync("git", ["ls-files", "--", "src", "extensions"], {
        cwd: repoDir,
        maxBuffer: 2 * NODE_DEFAULT_MAX_BUFFER_BYTES,
      });
      expect(trackedPaths.byteLength).toBeGreaterThan(NODE_DEFAULT_MAX_BUFFER_BYTES);

      const result = spawnSync(process.execPath, [guardScriptPath], {
        cwd: repoDir,
        encoding: "utf8",
        maxBuffer: 2 * NODE_DEFAULT_MAX_BUFFER_BYTES,
      });
      expect(result.error).toBeUndefined();
      expect(result.status, result.stderr).toBe(0);
    } finally {
      fs.rmSync(repoDir, { force: true, recursive: true });
    }
  });
});
