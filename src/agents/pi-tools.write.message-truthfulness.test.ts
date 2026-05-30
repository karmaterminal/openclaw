import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  createHostWorkspaceWriteTool,
  wrapToolMemoryFlushAppendOnlyWrite,
} from "./agent-tools.read.js";

describe("write tool result message truthfulness", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "openclaw-truthfulness-test-"));
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it("regular write says 'Successfully wrote', never 'Appended'", async () => {
    const tool = createHostWorkspaceWriteTool(tmpDir);
    const result = await tool.execute("id1", { path: "test.md", content: "hello" });
    const text = result.content.find((c) => c.type === "text")?.text ?? "";
    expect(text).toMatch(/successfully wrote/i);
    expect(text.toLowerCase()).not.toContain("appended");
  });

  it("flush wrapper says 'Appended content to' (correct behavior, not a bug)", async () => {
    const base = createHostWorkspaceWriteTool(tmpDir);
    const flushTool = wrapToolMemoryFlushAppendOnlyWrite(base, {
      root: tmpDir,
      relativePath: "memory/2026-04-30.md",
    });
    const result = await flushTool.execute("id2", {
      path: "memory/2026-04-30.md",
      content: "flush content",
    });
    const text = result.content.find((c) => c.type === "text")?.text ?? "";
    expect(text.toLowerCase()).toContain("appended");
    expect((result.details as Record<string, unknown>)?.appendOnly).toBe(true);
  });
});
