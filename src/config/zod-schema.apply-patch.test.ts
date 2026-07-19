import { describe, expect, it } from "vitest";
import { OpenClawSchema } from "./zod-schema.js";

describe("OpenClawSchema tools.exec.applyPatch.allowedRoots validation", () => {
  it("accepts absolute host directory roots", () => {
    const result = OpenClawSchema.safeParse({
      tools: { exec: { applyPatch: { allowedRoots: ["/tmp/oc-worktree"] } } },
    });
    expect(result.success).toBe(true);
  });

  it("rejects relative roots", () => {
    const result = OpenClawSchema.safeParse({
      tools: { exec: { applyPatch: { allowedRoots: ["../oc-worktree"] } } },
    });
    expect(result.success).toBe(false);
  });
});
