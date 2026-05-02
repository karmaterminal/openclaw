import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  collectSubstrateAdoptionAdvisories,
  findSubstrateAdoptionAdvisories,
  formatSubstrateAdoptionAdvisories,
} from "../../scripts/check-substrate-adoption.mjs";
import { createScriptTestHarness } from "./test-helpers.js";

const { createTempDir } = createScriptTestHarness();

describe("check-substrate-adoption", () => {
  it("flags timer-based bespoke polling loops with a registered substrate suggestion", () => {
    const source = `
      export function startSessionDeliveryPolling() {
        return setInterval(() => pollSessionDeliveryQueue(), 1000);
      }
    `;

    expect(findSubstrateAdoptionAdvisories(source)).toEqual([
      {
        path: "source.ts",
        line: 3,
        kind: "timer-polling",
        suggestedSubstrate: "session-delivery-queue",
        transportClass: "filesystem-queue",
      },
    ]);
  });

  it("flags in-process cross-session queues with TaskFlow as the default suggestion", () => {
    const source = `
      const pendingBySession = new Map<string, string[]>();
      export function enqueueSessionWork(sessionKey: string, task: string) {
        pendingBySession.set(sessionKey, [...(pendingBySession.get(sessionKey) ?? []), task]);
      }
    `;

    expect(findSubstrateAdoptionAdvisories(source)).toEqual([
      {
        path: "source.ts",
        line: 2,
        kind: "in-process-queue",
        suggestedSubstrate: "TaskFlow",
        transportClass: "sqlite-managed-workflow",
      },
    ]);
  });

  it("does not flag files that already use a registered substrate symbol", () => {
    const source = `
      import { enqueueSessionDelivery } from "../infra/session-delivery-queue-storage.js";

      export async function deliverLater(sessionKey: string, text: string) {
        return enqueueSessionDelivery({ kind: "systemEvent", sessionKey, text });
      }
    `;

    expect(findSubstrateAdoptionAdvisories(source)).toEqual([]);
  });

  it("honors line-level substrate exemptions with named reasons", () => {
    const source = `
      export function startLocalDebounce() {
        // SUBSTRATE-EXEMPT: UI-local debounce is not cross-session transport
        return setInterval(() => refreshLocalOnlyBadge(), 1000);
      }
    `;

    expect(findSubstrateAdoptionAdvisories(source)).toEqual([]);
  });

  it("honors top-of-file substrate exemptions", () => {
    const source = `
      // SUBSTRATE-EXEMPT: fixture intentionally exercises bespoke transport detection
      const pendingBySession = new Map<string, string[]>();
    `;

    expect(findSubstrateAdoptionAdvisories(source)).toEqual([]);
  });

  it("collects synthetic bespoke files while ignoring adopted files", async () => {
    const rootDir = createTempDir("openclaw-substrate-adoption-");
    const srcDir = path.join(rootDir, "src");
    fs.mkdirSync(srcDir, { recursive: true });
    fs.writeFileSync(
      path.join(srcDir, "bespoke.ts"),
      `
        import fs from "node:fs";
        export async function writeRelay(relayDir: string, sessionKey: string, payload: string) {
          await fs.promises.writeFile(path.join(relayDir, sessionKey + ".json"), payload);
        }
      `,
    );
    fs.writeFileSync(
      path.join(srcDir, "adopted.ts"),
      `
        import { createManagedTaskFlow } from "../../src/tasks/task-flow-runtime-internal.js";
        export function enqueueTask(ownerKey: string, goal: string) {
          return createManagedTaskFlow({ ownerKey, controllerId: "test", goal });
        }
      `,
    );

    const advisories = await collectSubstrateAdoptionAdvisories({
      roots: [srcDir],
      repoRoot: rootDir,
    });

    expect(advisories).toEqual([
      {
        path: "src/bespoke.ts",
        line: 4,
        kind: "filesystem-relay",
        suggestedSubstrate: "session-delivery-queue",
        transportClass: "filesystem-queue",
      },
    ]);
    expect(formatSubstrateAdoptionAdvisories(advisories)).toBe(
      "Bespoke transport detected at src/bespoke.ts:4. Registered substrate `session-delivery-queue` may carry this concern; if you have a named functional reason for bespoke, add a // SUBSTRATE-EXEMPT: <reason> comment naming it. Otherwise consider adopting `session-delivery-queue`.",
    );
  });
});
