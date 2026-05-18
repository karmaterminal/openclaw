import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { displayPath } from "../utils.js";
import { formatConfigPath, formatConfigUpdatedMessage, logConfigUpdated } from "./logging.js";
import { resolveConfigPath } from "./paths.js";

describe("config logging", () => {
  it("formats the live config path when no explicit path is provided", () => {
    expect(formatConfigPath()).toBe(displayPath(resolveConfigPath()));
  });

  it("logs the live config path when no explicit path is provided", () => {
    const runtime = { log: vi.fn() };
    logConfigUpdated(runtime as never);
    expect(runtime.log).toHaveBeenCalledWith(`Updated config: ${displayPath(resolveConfigPath())}`);
  });

  it("formats backup as an indented detail when present", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "openclaw-config-log-"));
    const configPath = path.join(dir, "openclaw.json");
    const backupPath = `${configPath}.bak`;
    fs.writeFileSync(backupPath, "{}", "utf8");

    expect(
      formatConfigUpdatedMessage(configPath, {
        backupPath,
      }),
    ).toBe(`Updated config: ${configPath}\n  Backup: ${backupPath}`);
  });
});
