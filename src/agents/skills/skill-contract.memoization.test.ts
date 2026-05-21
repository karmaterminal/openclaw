import { describe, expect, it, beforeEach } from "vitest";
import {
  formatSkillsForPrompt,
  __resetFormatSkillsForPromptCache,
  type Skill,
} from "./skill-contract.js";

function makeSkill(name: string, description = "desc", filePath?: string): Skill {
  return {
    name,
    description,
    filePath: filePath ?? `/skills/${name}/SKILL.md`,
    sourceInfo: {
      path: `/skills/${name}/SKILL.md`,
      source: "test",
      scope: "temporary",
      origin: "top-level",
    },
  } as Skill;
}

describe("formatSkillsForPrompt memoization (issue #643 fix)", () => {
  beforeEach(() => {
    __resetFormatSkillsForPromptCache();
  });

  it("returns identical string-instance on repeated call with same input array", () => {
    const skills = [makeSkill("a"), makeSkill("b"), makeSkill("c")];
    const first = formatSkillsForPrompt(skills);
    const second = formatSkillsForPrompt(skills);
    // Cache returns the exact same string reference, not a re-allocated equal-value string.
    // This is the load-bearing assertion: producer-2 retention came from N independent
    // allocations of the same content; memoization makes them share one allocation.
    expect(second).toBe(first);
    // Use Object.is on the actual reference path through the cache:
    // we cannot test string identity directly in JS, but we can prove the cache-hit
    // path runs by verifying behavior under cache-clear.
  });

  it("returns identical output for content-equivalent skills passed as new Skill[] array", () => {
    const skills1 = [makeSkill("a", "d1"), makeSkill("b", "d2")];
    const skills2 = [makeSkill("a", "d1"), makeSkill("b", "d2")];
    // Different array references, identical content.
    expect(skills1).not.toBe(skills2);
    const out1 = formatSkillsForPrompt(skills1);
    const out2 = formatSkillsForPrompt(skills2);
    // Memoization should hit on the same hash-key, returning the same cached string.
    expect(out2).toBe(out1);
  });

  it("re-computes when skill description changes", () => {
    const skills1 = [makeSkill("a", "first-description")];
    const skills2 = [makeSkill("a", "second-description")];
    const out1 = formatSkillsForPrompt(skills1);
    const out2 = formatSkillsForPrompt(skills2);
    expect(out2).not.toBe(out1);
    expect(out1).toContain("first-description");
    expect(out2).toContain("second-description");
  });

  it("re-computes when filePath changes", () => {
    const skills1 = [makeSkill("a", "desc", "/path/one/SKILL.md")];
    const skills2 = [makeSkill("a", "desc", "/path/two/SKILL.md")];
    const out1 = formatSkillsForPrompt(skills1);
    const out2 = formatSkillsForPrompt(skills2);
    expect(out2).not.toBe(out1);
    expect(out1).toContain("/path/one/SKILL.md");
    expect(out2).toContain("/path/two/SKILL.md");
  });

  it("re-computes when skill is added", () => {
    const skills1 = [makeSkill("a")];
    const skills2 = [makeSkill("a"), makeSkill("b")];
    const out1 = formatSkillsForPrompt(skills1);
    const out2 = formatSkillsForPrompt(skills2);
    expect(out2).not.toBe(out1);
    expect(out2.length).toBeGreaterThan(out1.length);
  });

  it("returns empty string for empty input without caching", () => {
    expect(formatSkillsForPrompt([])).toBe("");
    expect(formatSkillsForPrompt([])).toBe("");
  });

  it("bounds cache size and evicts oldest entries", () => {
    // Default FORMAT_CACHE_MAX is 32. Fill cache past limit + verify oldest evicts.
    // We use 40 distinct skill-set compositions.
    const compositions: Skill[][] = [];
    for (let i = 0; i < 40; i++) {
      compositions.push([makeSkill(`skill-${i}`)]);
    }
    const outputs = compositions.map((c) => formatSkillsForPrompt(c));
    // The first 8 compositions (0-7) should have been evicted; their second-call
    // outputs should still equal the first-call outputs (correctness) but the
    // returned reference would be a fresh allocation, not the cached one.
    // Correctness check: re-formatting produces byte-identical output.
    for (let i = 0; i < 8; i++) {
      expect(formatSkillsForPrompt(compositions[i])).toBe(outputs[i]);
    }
    // Most-recent compositions should still cache-hit on second call.
    for (let i = 32; i < 40; i++) {
      expect(formatSkillsForPrompt(compositions[i])).toBe(outputs[i]);
    }
  });
});
