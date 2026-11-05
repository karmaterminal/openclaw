// Memory Core tests cover the #1536 bound on transcript bytes held by session indexing.
import fs from "node:fs/promises";
import path from "node:path";
import { resolveSessionTranscriptsDirForAgent } from "openclaw/plugin-sdk/memory-core-host-engine-foundation";
import { describe, expect, it, vi } from "vitest";
import {
  createManagerIndexFixture,
  memoryIndexFixtureWriter,
} from "./manager-index.test-support.js";
import type { MemoryIndexWorkItem } from "./manager-sync-base.js";

const { preparedGroups } = vi.hoisted(() => ({ preparedGroups: [] as string[][] }));
vi.mock("openclaw/plugin-sdk/memory-core-host-engine-sessions", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("openclaw/plugin-sdk/memory-core-host-engine-sessions")>();
  return {
    ...actual,
    // mock-isolation: record each prepared group; the real reader still builds every entry.
    buildSessionEntries: async (inputs: Parameters<typeof actual.buildSessionEntries>[0]) => {
      preparedGroups.push(inputs.map(({ absPath }) => absPath));
      return await actual.buildSessionEntries(inputs);
    },
  };
});

const memory = await import("./index.js");

const MIB = 1024 * 1024;
// The stated bound: transcript bytes one session indexing group holds before publication.
const SESSION_GROUP_BUDGET_BYTES = 16 * MIB;

describe("session indexing memory bound", () => {
  const fixture = createManagerIndexFixture(memory);

  it("never holds more than one group's transcript bytes during a full rebuild", async () => {
    const sessionsDir = resolveSessionTranscriptsDirForAgent("main");
    await fs.mkdir(sessionsDir, { recursive: true });
    // Non-message records cost the reader their bytes but render no indexed text.
    const padding = JSON.stringify({ type: "custom", data: "x".repeat(MIB) });
    const transcripts: string[] = [];
    for (let index = 0; index < 3; index++) {
      const file = path.join(sessionsDir, `budget-${index}.jsonl.deleted.2026-10-01T00-00-00.000Z`);
      const marker = JSON.stringify({
        type: "message",
        message: { role: "user", content: `budgetmarker ${index}` },
      });
      await fs.writeFile(file, `${[marker, ...Array<string>(6).fill(padding)].join("\n")}\n`);
      transcripts.push(file);
    }
    const bytes = new Map<string, number>();
    for (const file of transcripts) {
      bytes.set(file, (await fs.stat(file)).size);
    }
    const groupBytes = (files: readonly string[]) =>
      files.reduce((total, file) => total + (bytes.get(file) ?? 0), 0);
    expect(groupBytes(transcripts)).toBeGreaterThan(SESSION_GROUP_BUDGET_BYTES);

    fixture.provider.forceNoProvider = true;
    const manager = await fixture.getFreshManager(
      fixture.createConfig({
        provider: "none",
        sources: ["sessions"],
        sessionMemory: true,
        vectorEnabled: false,
      }),
    );
    const indexFiles = vi.spyOn(
      manager as unknown as {
        indexFiles(items: MemoryIndexWorkItem[]): Promise<MemoryIndexWorkItem[]>;
      },
      "indexFiles",
    );
    preparedGroups.length = 0;
    // A foreground rebuild admits the widest file-count groups.
    await manager.sync({ reason: "cli", force: true });

    const prepared = preparedGroups.filter((group) => group.some((file) => bytes.has(file)));
    const published = indexFiles.mock.calls.map(([items]) =>
      items.filter((item) => item.source === "sessions").map((item) => item.entry.absPath),
    );
    expect(prepared.flat().toSorted()).toEqual(transcripts);
    expect(published.flat().toSorted()).toEqual(transcripts);
    // Only a lone transcript may exceed the budget; this corpus has none that large.
    const overBudget = (groups: string[][]) =>
      groups.filter((group) => groupBytes(group) > SESSION_GROUP_BUDGET_BYTES);
    expect(overBudget(prepared)).toEqual([]);
    expect(overBudget(published)).toEqual([]);
    expect(
      memoryIndexFixtureWriter(manager)
        .prepare(
          "SELECT DISTINCT path FROM memory_index_chunks WHERE source = 'sessions' ORDER BY path",
        )
        .all(),
    ).toHaveLength(transcripts.length);
  });
});
