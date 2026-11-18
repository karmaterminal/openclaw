// The fixture's file-surface check (#1321): it reads only the dirs the fixture created, so a
// file it did not create is never opened, and it still reports a leak inside them.
import fs from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useAutoCleanupTempDirTracker } from "../../../test/helpers/temp-dir.js";
import {
  body,
  expectNoSentinelFilesIn,
  SENTINEL,
  useSovereignTempDirs,
  writeGeneration,
  writeRoot,
} from "./sovereign-fixture.test-support.js";

const ownedDirs = useAutoCleanupTempDirTracker(afterEach);
// Stands in for files the fixture did not create: another test's or another user's.
const outsideDirs = useAutoCleanupTempDirTracker(afterEach);

const within = (dir: string, target: string) =>
  target === dir || target.startsWith(`${dir}${path.sep}`);

describe.skipIf(process.platform === "win32")("sovereign fixture file check", () => {
  it("reads only its own dirs: a sentinel planted outside, or linked from inside, is never opened", () => {
    const owned = ownedDirs.make("openclaw-sovereign-owned-");
    const foreign = outsideDirs.make("openclaw-sovereign-foreign-");
    const planted = path.join(foreign, "planted.md");
    fs.writeFileSync(planted, body("planted"));
    fs.symlinkSync(planted, path.join(owned, "file-link.md"));
    fs.symlinkSync(foreign, path.join(owned, "dir-link"));
    fs.writeFileSync(path.join(owned, "clean.log"), "no sentinel here");
    const read = vi.spyOn(fs, "readFileSync");
    const list = vi.spyOn(fs, "readdirSync");
    try {
      expectNoSentinelFilesIn([owned]);
      const touched = [...read.mock.calls, ...list.mock.calls].map(([target]) => String(target));
      expect(touched.filter((target) => within(foreign, target))).toEqual([]);
      expect(touched.filter((target) => !within(owned, target))).toEqual([]);
      expect(touched).toContain(path.join(owned, "clean.log"));
    } finally {
      read.mockRestore();
      list.mockRestore();
    }
  });

  it("reports a sentinel a product path wrote, and skips the fixture's own roots", () => {
    const owned = ownedDirs.make("openclaw-sovereign-owned-");
    writeRoot(path.join(owned, "sovereign", "systemprompts"));
    // A case may move a generation it wrote; it stays a fixture source.
    writeGeneration(path.join(owned, ".staging-1"));
    fs.renameSync(path.join(owned, ".staging-1"), path.join(owned, "published"));
    expectNoSentinelFilesIn([owned]);
    const leak = path.join(owned, "sessions", "transcript.jsonl");
    fs.mkdirSync(path.dirname(leak));
    fs.writeFileSync(leak, JSON.stringify({ system: SENTINEL }));
    expect(() => expectNoSentinelFilesIn([owned])).toThrow(leak);
  });

  it("checks each test's dirs before removing them, and removes them when the check fails", () => {
    let afterTest: () => void = () => {};
    const dirs = useSovereignTempDirs((cleanup) => {
      afterTest = cleanup;
    });
    const dir = dirs.make("openclaw-sovereign-hook-");
    fs.writeFileSync(path.join(dir, "leak.txt"), SENTINEL);
    expect(afterTest).toThrow(path.join(dir, "leak.txt"));
    expect(fs.existsSync(dir)).toBe(false);
  });
});
