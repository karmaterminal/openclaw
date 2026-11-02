import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { resolveSessionStorePathCore } from "../../config/sessions/paths.js";
import { preserveResetPluginInjectionOutcomes } from "../../config/sessions/plugin-host-cleanup.js";
import {
  loadSessionEntryReadOnly as readEntry,
  replaceSessionEntry as writeEntry,
} from "../../config/sessions/session-accessor.entry.js";
import type { OpenClawConfig } from "../../config/types.openclaw.js";
import { createOpenClawTestState } from "../../test-utils/openclaw-test-state.js";
import { drainPluginNextTurnInjectionContext as drain } from "../host-hook-state.js";
import { createEmptyPluginRegistry } from "../registry-empty.js";
import { clearActivePluginRegistry, setActivePluginRegistry } from "../runtime.js";
import { createPluginRecord } from "../status.test-helpers.js";

describe("next-turn injection drain limits", () => {
  let state: Awaited<ReturnType<typeof createOpenClawTestState>>;
  function sessionScope(cfg: OpenClawConfig, agentId: string, sessionKey: string) {
    const storePath = resolveSessionStorePathCore(cfg.session?.store, { agentId, env: state.env });
    return { agentId, sessionKey, storePath };
  }
  beforeEach(async () => {
    state = await createOpenClawTestState({ prefix: "host-hook-drain-limits-" });
    const registry = createEmptyPluginRegistry();
    registry.plugins.push(createPluginRecord({ id: "owner-fixture", status: "loaded" }));
    setActivePluginRegistry(registry);
  });
  afterEach(async () => {
    await clearActivePluginRegistry();
    await state.cleanup();
  });
  it("discards a persisted head that exceeds a lowered plugin byte budget", async () => {
    const cfg: OpenClawConfig = {
      agents: { entries: { main: {} } },
      plugins: { entries: { "owner-fixture": { hooks: { nextTurnInjectionDrainMaxBytes: 600 } } } },
    };
    const scope = sessionScope(cfg, "main", "agent:main:oversized-head");
    await writeEntry(scope, {
      sessionId: "oversized-head",
      updatedAt: 1,
      pluginNextTurnInjections: {
        "owner-fixture": ["x".repeat(1_000), "fits"].map((text, index) => ({
          id: String(index),
          pluginId: "owner-fixture",
          text,
          placement: "prepend_context" as const,
          createdAt: index,
        })),
      },
    });
    expect((await drain({ cfg, ...scope })).queuedInjections.map((record) => record.id)).toEqual([
      "1",
    ]);
  });

  it("applies an aliased owner's normalized entry cap at drain", async () => {
    const cfg: OpenClawConfig = {
      agents: { entries: { main: {} } },
      plugins: {
        entries: { "google-gemini-cli": { hooks: { nextTurnInjectionDrainMaxEntries: 1 } } },
      },
    };
    const scope = sessionScope(cfg, "main", "agent:main:alias-cap");
    const registry = createEmptyPluginRegistry();
    registry.plugins.push(createPluginRecord({ id: "google", status: "loaded" }));
    setActivePluginRegistry(registry);
    await writeEntry(scope, {
      sessionId: "alias-cap",
      updatedAt: 1,
      pluginNextTurnInjections: {
        google: ["first", "second"].map((text, index) => ({
          id: text,
          pluginId: "google",
          text,
          placement: "prepend_context" as const,
          createdAt: index,
        })),
      },
    });
    expect((await drain({ cfg, ...scope })).queuedInjections.map((item) => item.id)).toEqual([
      "first",
    ]);
    expect(readEntry(scope)?.pluginNextTurnInjections?.google).toHaveLength(1);
  });

  it("retains live TTL-only records until an unavailable owner returns", async () => {
    const cfg: OpenClawConfig = { agents: { entries: { main: {} } } };
    const scope = sessionScope(cfg, "main", "agent:main:ttl-owner-outage");
    await writeEntry(scope, {
      sessionId: "ttl-owner-outage",
      updatedAt: 1,
      pluginNextTurnInjections: {
        "owner-fixture": [
          {
            id: "pending",
            pluginId: "owner-fixture",
            text: "later",
            placement: "prepend_context",
            createdAt: Date.now(),
            ttlMs: 60_000,
            idempotencyKey: "pending",
          },
        ],
      },
    });
    setActivePluginRegistry(createEmptyPluginRegistry());
    expect((await drain({ cfg, ...scope })).queuedInjections).toEqual([]);
    expect(readEntry(scope)?.pluginNextTurnInjections?.["owner-fixture"]).toHaveLength(1);
    const registry = createEmptyPluginRegistry();
    registry.plugins.push(createPluginRecord({ id: "owner-fixture", status: "loaded" }));
    setActivePluginRegistry(registry);
    expect((await drain({ cfg, ...scope })).queuedInjections.map((item) => item.id)).toEqual([
      "pending",
    ]);
  });

  it("bounds one turn across plugin owners", async () => {
    const cfg: OpenClawConfig = { agents: { entries: { main: {} } } };
    const scope = sessionScope(cfg, "main", "agent:main:aggregate-budget");
    const registry = createEmptyPluginRegistry();
    for (const id of ["owner-fixture", "other-fixture"]) {
      registry.plugins.push(createPluginRecord({ id, status: "loaded" }));
    }
    setActivePluginRegistry(registry);
    await writeEntry(scope, {
      sessionId: "aggregate-budget",
      updatedAt: 1,
      pluginNextTurnInjections: Object.fromEntries(
        ["owner-fixture", "other-fixture"].map((pluginId, owner) => [
          pluginId,
          [0, 1].map((index) => ({
            id: `${owner}-${index}`,
            pluginId,
            text: "x".repeat(30_000),
            placement: "prepend_context" as const,
            createdAt: owner * 2 + index,
          })),
        ]),
      ),
    });
    expect((await drain({ cfg, ...scope })).queuedInjections.map((record) => record.id)).toEqual([
      "0-0",
      "0-1",
    ]);
    expect((await drain({ cfg, ...scope })).queuedInjections.map((record) => record.id)).toEqual([
      "1-0",
      "1-1",
    ]);
  });

  it("charges provenance wrappers and separators to the plugin byte budget", async () => {
    const cfg: OpenClawConfig = {
      agents: { entries: { main: {} } },
      plugins: { entries: { "owner-fixture": { hooks: { nextTurnInjectionDrainMaxBytes: 600 } } } },
    };
    const scope = sessionScope(cfg, "main", "agent:main:rendered-budget");
    await writeEntry(scope, {
      sessionId: "rendered-budget",
      updatedAt: 1,
      pluginNextTurnInjections: {
        "owner-fixture": Array.from({ length: 3 }, (_, index) => ({
          id: String(index),
          pluginId: "owner-fixture",
          text: "x",
          placement: "prepend_context" as const,
          provenance: { source: "fixture" },
          createdAt: index,
        })),
      },
    });
    const first = await drain({ cfg, ...scope });
    expect(first.queuedInjections.length).toBeGreaterThan(0);
    expect(first.queuedInjections.length).toBeLessThan(3);
    expect(Buffer.byteLength(first.prependContext ?? "", "utf8")).toBeLessThanOrEqual(600);
    const second = await drain({ cfg, ...scope });
    expect(second.queuedInjections.length).toBeGreaterThan(0);
    expect(Buffer.byteLength(second.prependContext ?? "", "utf8")).toBeLessThanOrEqual(600);
  });

  it("charges provenance wrappers to the aggregate budget across owners", async () => {
    const cfg: OpenClawConfig = { agents: { entries: { main: {} } } };
    const scope = sessionScope(cfg, "main", "agent:main:rendered-aggregate");
    const registry = createEmptyPluginRegistry();
    for (const id of ["owner-fixture", "other-fixture"]) {
      registry.plugins.push(createPluginRecord({ id, status: "loaded" }));
    }
    setActivePluginRegistry(registry);
    await writeEntry(scope, {
      sessionId: "rendered-aggregate",
      updatedAt: 1,
      pluginNextTurnInjections: Object.fromEntries(
        ["owner-fixture", "other-fixture"].map((pluginId, owner) => [
          pluginId,
          Array.from({ length: 16 }, (_, index) => ({
            id: `${owner}-${index}`,
            pluginId,
            text: "x".repeat(1900),
            placement: "prepend_context" as const,
            provenance: { source: "fixture" },
            createdAt: owner * 16 + index,
          })),
        ]),
      ),
    });
    const first = await drain({ cfg, ...scope });
    expect(first.queuedInjections.length).toBeLessThan(32);
    expect(Buffer.byteLength(first.prependContext ?? "", "utf8")).toBeLessThanOrEqual(64 * 1024);
    const second = await drain({ cfg, ...scope });
    expect(second.queuedInjections.length).toBeGreaterThan(0);
  });

  it("caps settled tombstones despite distant injection deadlines", async () => {
    const cfg: OpenClawConfig = { agents: { entries: { main: {} } } };
    const scope = sessionScope(cfg, "main", "agent:main:tombstone-cap");
    const now = Date.now();
    const record = {
      id: "distant",
      pluginId: "owner-fixture",
      text: "soon",
      idempotencyKey: "distant",
      placement: "prepend_context" as const,
      createdAt: now,
      expiresAt: now + 30 * 86_400_000,
    };
    await writeEntry(scope, {
      sessionId: "tombstone-cap",
      updatedAt: 1,
      pluginNextTurnInjections: { "owner-fixture": [record] },
    });
    await drain({ cfg, ...scope, clock: () => now });
    expect(
      readEntry(scope)?.pluginNextTurnInjectionOutcomes?.["owner-fixture"]?.distant?.retainUntil,
    ).toBeLessThanOrEqual(now + 86_400_000);
    const reset = preserveResetPluginInjectionOutcomes(
      { sessionId: "other", updatedAt: 1, pluginNextTurnInjections: { "owner-fixture": [record] } },
      now,
    );
    expect(reset?.["owner-fixture"]?.distant?.retainUntil).toBeLessThanOrEqual(now + 86_400_000);
  });

  it("retains the FIFO suffix behind a not-before head", async () => {
    const cfg: OpenClawConfig = { agents: { entries: { main: {} } } };
    const scope = sessionScope(cfg, "main", "agent:main:not-before-fifo");
    const now = Date.now();
    await writeEntry(scope, {
      sessionId: "not-before-fifo",
      updatedAt: 1,
      pluginNextTurnInjections: {
        "owner-fixture": [
          {
            id: "head",
            pluginId: "owner-fixture",
            text: "head",
            placement: "prepend_context",
            createdAt: now,
            notBefore: now + 1000,
          },
          {
            id: "suffix",
            pluginId: "owner-fixture",
            text: "suffix",
            placement: "prepend_context",
            createdAt: now + 1,
          },
        ],
      },
    });
    expect((await drain({ cfg, ...scope, clock: () => now })).queuedInjections).toEqual([]);
    expect(
      (await drain({ cfg, ...scope, clock: () => now + 2000 })).queuedInjections.map(
        (record) => record.id,
      ),
    ).toEqual(["head", "suffix"]);
  });
});
