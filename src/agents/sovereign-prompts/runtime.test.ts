// The process registry (#1321): start-time load, the chokepoint lookup, route admission,
// the per-render view and receipts, on real files in temp directories.
import fs from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { OpenClawConfig } from "../../config/types.js";
import { resetSovereignRedactionForTests } from "../../logging/sovereign-redaction.js";
import * as loader from "./loader.js";
import {
  assertSovereignPromptNotReplaced,
  assertSovereignPromptRoute,
  describeSovereignPromptStatus,
  isSovereignPromptAgent,
  loadSovereignPromptsForProcess,
  resetSovereignPromptRuntimeForTests,
  resolveSovereignPromptSnapshot,
} from "./runtime.js";
import { SovereignPromptRefusal } from "./snapshot.js";
import {
  capture,
  expectNoSentinel,
  SENTINEL,
  sovereignAgentsConfig,
  useSovereignTempDirs,
  writeAgentGeneration,
  type GenerationSpec,
} from "./sovereign-fixture.test-support.js";

const tempDirs = useSovereignTempDirs(afterEach);
afterEach(() => {
  resetSovereignPromptRuntimeForTests();
  resetSovereignRedactionForTests();
});

/** One agent dir holding a generation for `agentId` at the default sovereign root. */
function writeAgent(agentId: string, spec: GenerationSpec = {}) {
  const agentDir = tempDirs.make("openclaw-sovereign-runtime-");
  return { agentDir, ...writeAgentGeneration(agentDir, agentId, spec) };
}

const configFor = (entries: Parameters<typeof sovereignAgentsConfig>[0]) =>
  sovereignAgentsConfig(entries) as OpenClawConfig;

/** An explicit fleet; `owner` is its recorded system agent, the default owner OpenClaw resolves. */
const fleet = (owner: string | undefined, entries: Parameters<typeof sovereignAgentsConfig>[0]) =>
  ({
    agents: {
      ownership: "explicit",
      ...(owner ? { defaults: { systemAgent: { agentId: owner } } } : {}),
      entries: sovereignAgentsConfig(entries).agents.entries,
    },
  }) as OpenClawConfig;

function recordingLog() {
  const lines: { level: "info" | "warn"; message: string; meta?: Record<string, unknown> }[] = [];
  return {
    lines,
    info: (message: string, meta?: Record<string, unknown>) =>
      lines.push({ level: "info", message, meta }),
    warn: (message: string, meta?: Record<string, unknown>) =>
      lines.push({ level: "warn", message, meta }),
  };
}

function expectRefusal(run: () => unknown, code: SovereignPromptRefusal["code"]) {
  let thrown: unknown;
  try {
    run();
  } catch (error) {
    thrown = error;
  }
  expect(thrown).toBeInstanceOf(SovereignPromptRefusal);
  expect((thrown as SovereignPromptRefusal).code).toBe(code);
  return thrown as SovereignPromptRefusal;
}

/** An identity body naming its agent, so one agent's text is never taken for another's. */
const ownIdentity = (agentId: string): GenerationSpec => ({
  files: { "identity-section.md": `${SENTINEL} identity of ${agentId}. ${SENTINEL}\n` },
});

/** A call naming no agent, or an invalid one, refuses its render and both checks. */
function expectNamelessRefused(config: OpenClawConfig) {
  for (const agentId of [undefined, "", "%%%"]) {
    expectRefusal(() => resolveSovereignPromptSnapshot({ config, agentId }), "agent_unknown");
    expect(isSovereignPromptAgent(config, agentId)).toBe(true);
    expectRefusal(
      () => assertSovereignPromptRoute({ config, agentId, route: "cli" }),
      "route_unconverted",
    );
    expectRefusal(
      () => assertSovereignPromptNotReplaced(config, agentId, "before_prompt_build"),
      "sovereign_override_denied",
    );
  }
}

/** A named agent that renders code text: no snapshot, and both checks pass. */
function expectStock(config: OpenClawConfig, agentId: string) {
  expect(resolveSovereignPromptSnapshot({ config, agentId })).toBeUndefined();
  expect(isSovereignPromptAgent(config, agentId)).toBe(false);
  assertSovereignPromptRoute({ config, agentId, route: "cli" });
  assertSovereignPromptNotReplaced(config, agentId, "before_prompt_build");
}

/** A named enforce agent: its own snapshot and no other agent's; unconverted routes refuse. */
function expectOwnSnapshot(config: OpenClawConfig, agentId: string, others: readonly string[]) {
  const snapshot = resolveSovereignPromptSnapshot({ config, agentId });
  expect(snapshot?.agentId).toBe(agentId);
  expect(snapshot?.body("identity-section.md")).toContain(`identity of ${agentId}.`);
  for (const other of others) {
    expect(snapshot?.body("identity-section.md")).not.toContain(`identity of ${other}.`);
  }
  expectRefusal(
    () => assertSovereignPromptRoute({ config, agentId, route: "cli" }),
    "route_unconverted",
  );
}

/** Counts every call into the fs module and fs.promises, so any read path is seen. */
function countFsCalls() {
  const spyAll = (target: object) =>
    Object.entries(target)
      .filter(([name, value]) => /^[a-z]/.test(name) && typeof value === "function")
      .map(([name]) => vi.spyOn(target as Record<string, (...args: unknown[]) => unknown>, name));
  const spies = [...spyAll(fs), ...spyAll(fs.promises)];
  return {
    count: () => spies.reduce((sum, spy) => sum + spy.mock.calls.length, 0),
    reset: () => spies.forEach((spy) => spy.mockClear()),
    restore: () => spies.forEach((spy) => spy.mockRestore()),
  };
}

// The design's refusal paths (§ 4.5, § 5.2, § 18 limits) at the start-time load. Each fails
// only the broken agent: the good one loads and the off one reads nothing.
const refusals: {
  name: string;
  code: SovereignPromptRefusal["code"];
  spec?: GenerationSpec;
  mutate?: (dir: string) => void;
}[] = [
  { name: "missing", code: "required_missing", spec: { files: { "tool-section.md": null } } },
  { name: "empty", code: "required_empty", spec: { files: { "safety-section.md": " \n\t\n" } } },
  {
    name: "unsafe permissions",
    code: "mode_unsafe",
    mutate: (dir) => fs.chmodSync(path.join(dir, "identity-section.md"), 0o644),
  },
  {
    name: "oversized",
    code: "size_exceeded",
    spec: { files: { "identity-section.md": `${SENTINEL}${"x".repeat(64 * 1024)}` } },
  },
];

describe.skipIf(process.platform === "win32")("sovereign prompt process registry", () => {
  it.each(refusals)(
    "start-time load refuses a $name required file for that agent only",
    async ({ code, spec, mutate }) => {
      const good = writeAgent("good");
      const bad = writeAgent("bad", spec);
      mutate?.(bad.dir);
      const plain = writeAgent("plain");
      const config = configFor({
        good: { agentDir: good.agentDir, mode: "enforce" },
        bad: { agentDir: bad.agentDir, mode: "enforce" },
        plain: { agentDir: plain.agentDir },
      });
      const log = recordingLog();
      const outcome = await capture(() => {
        loadSovereignPromptsForProcess(config, { log });
        return describeSovereignPromptStatus();
      });
      expect(
        log.lines.map(({ level, message }) => [level, message.split(" ").slice(0, 3)]),
      ).toEqual([
        [
          "info",
          ["[SOVEREIGN_PROMPTS_LOADED]", "agent:good", expect.stringMatching(/^generation=/)],
        ],
        ["warn", ["[SOVEREIGN_PROMPTS_REFUSED]", "agent:bad", `code=${code}`]],
      ]);
      expect(outcome.value).toEqual([
        expect.objectContaining({ agentId: "good", state: "loaded" }),
        expect.objectContaining({ agentId: "bad", state: "refused", code }),
      ]);
      expect(resolveSovereignPromptSnapshot({ config, agentId: "good" })?.agentId).toBe("good");
      expect(resolveSovereignPromptSnapshot({ config, agentId: "plain" })).toBeUndefined();
      const refused = await capture(() =>
        resolveSovereignPromptSnapshot({ config, agentId: "bad" }),
      );
      expect(refused.error).toBeInstanceOf(SovereignPromptRefusal);
      expect((refused.error as SovereignPromptRefusal).code).toBe(code);
      for (const result of [outcome, refused]) {
        expectNoSentinel(
          { ...result, logs: [...result.logs, ...log.lines.map((line) => JSON.stringify(line))] },
          [good.agentDir, bad.agentDir, plain.agentDir],
        );
      }
    },
  );

  it("start-time load refuses an agent whose load throws unexpectedly, as io_error, and goes on", async () => {
    const good = writeAgent("good");
    const crashing = writeAgent("crashing");
    const config = configFor({
      crashing: { agentDir: crashing.agentDir, mode: "enforce" },
      good: { agentDir: good.agentDir, mode: "enforce" },
    });
    const realLoad = loader.loadSovereignPromptSnapshot;
    const load = vi.spyOn(loader, "loadSovereignPromptSnapshot").mockImplementation((params) => {
      if (params.agentId === "crashing") {
        // Not a refusal: a bug or native failure whose message echoes a path and content.
        throw new TypeError(`cannot read ${crashing.root}: ${SENTINEL}`);
      }
      return realLoad(params);
    });
    try {
      const log = recordingLog();
      const outcome = await capture(() => {
        loadSovereignPromptsForProcess(config, { log });
        return describeSovereignPromptStatus();
      });
      expect(outcome.error).toBeUndefined();
      expect(outcome.value).toEqual([
        { agentId: "crashing", state: "refused", code: "io_error", errno: "EUNKNOWN" },
        expect.objectContaining({ agentId: "good", state: "loaded" }),
      ]);
      expect(log.lines.map(({ level, message }) => [level, message])).toEqual([
        ["warn", "[SOVEREIGN_PROMPTS_REFUSED] agent:crashing code=io_error"],
        ["info", expect.stringMatching(/^\[SOVEREIGN_PROMPTS_LOADED\] agent:good /)],
      ]);
      const refused = await capture(() =>
        resolveSovereignPromptSnapshot({ config, agentId: "crashing" }),
      );
      expect((refused.error as SovereignPromptRefusal).code).toBe("io_error");
      expect(resolveSovereignPromptSnapshot({ config, agentId: "good" })?.agentId).toBe("good");
      for (const result of [outcome, refused]) {
        expectNoSentinel(
          { ...result, logs: [...result.logs, ...log.lines.map((line) => JSON.stringify(line))] },
          [crashing.agentDir, good.agentDir, "cannot read"],
        );
      }
    } finally {
      load.mockRestore();
    }
  });

  it("refuses an enforce agent this process never loaded, and keeps a loaded one until restart", () => {
    const good = writeAgent("good");
    const late = writeAgent("late");
    const atStart = configFor({ good: { agentDir: good.agentDir, mode: "enforce" } });
    loadSovereignPromptsForProcess(atStart, { log: recordingLog() });
    // Hot reload adds an enforce agent: it has no snapshot until the next start (§ 6.3).
    const reloaded = configFor({
      good: { agentDir: good.agentDir, mode: "off" },
      late: { agentDir: late.agentDir, mode: "enforce" },
    });
    expectRefusal(
      () => resolveSovereignPromptSnapshot({ config: reloaded, agentId: "late" }),
      "not_loaded",
    );
    // Flipping a loaded agent off by hot reload is a stock-text downgrade; it waits for restart.
    expect(resolveSovereignPromptSnapshot({ config: reloaded, agentId: "good" })?.agentId).toBe(
      "good",
    );
    expect(isSovereignPromptAgent(reloaded, "good")).toBe(true);
    // The restart loads the new config.
    resetSovereignPromptRuntimeForTests();
    loadSovereignPromptsForProcess(reloaded, { log: recordingLog() });
    expect(resolveSovereignPromptSnapshot({ config: reloaded, agentId: "good" })).toBeUndefined();
    expect(resolveSovereignPromptSnapshot({ config: reloaded, agentId: "late" })?.agentId).toBe(
      "late",
    );
  });

  // A call that names no agent has lost its run identity (§ 4.6). No default owner stands in
  // for it: stock text, or the owner's own sovereign text, could reach the agent it lost.
  it("refuses an agentless call beside an enforce agent whoever owns the fleet; named agents keep their own answer", () => {
    const entries = {
      main: { agentDir: writeAgent("main").agentDir },
      prince: { agentDir: writeAgent("prince", ownIdentity("prince")).agentDir, mode: "enforce" },
    } as const;
    loadSovereignPromptsForProcess(fleet("main", entries), { log: recordingLog() });
    for (const owner of ["main", "prince", undefined]) {
      const config = fleet(owner, entries);
      expectNamelessRefused(config);
      expectStock(config, "main");
      expectOwnSnapshot(config, "prince", []);
    }
    // With no sovereign agent anywhere, nothing refuses.
    resetSovereignPromptRuntimeForTests();
    const off = fleet("main", {
      main: entries.main,
      prince: { agentDir: entries.prince.agentDir },
    });
    expect(resolveSovereignPromptSnapshot({ config: off })).toBeUndefined();
    expect(isSovereignPromptAgent(off, undefined)).toBe(false);
    assertSovereignPromptRoute({ config: off, route: "cli" });
    assertSovereignPromptNotReplaced(off, undefined, "before_prompt_build");
  });

  it("gives each of two enforce agents only its own snapshot, and refuses an agentless call", () => {
    const entries = {
      alpha: { agentDir: writeAgent("alpha", ownIdentity("alpha")).agentDir, mode: "enforce" },
      beta: { agentDir: writeAgent("beta", ownIdentity("beta")).agentDir, mode: "enforce" },
    } as const;
    loadSovereignPromptsForProcess(fleet("alpha", entries), { log: recordingLog() });
    for (const owner of ["alpha", "beta", undefined]) {
      const config = fleet(owner, entries);
      expectNamelessRefused(config);
      expectOwnSnapshot(config, "alpha", ["beta"]);
      expectOwnSnapshot(config, "beta", ["alpha"]);
    }
  });

  it("counts an agent that was enforce at load, loaded or refused, until restart", () => {
    const main = writeAgent("main");
    const prince = writeAgent("prince", ownIdentity("prince"));
    const broken = writeAgent("broken", { files: { "tool-section.md": null } });
    for (const [agentId, agentDir] of [
      ["prince", prince.agentDir],
      ["broken", broken.agentDir],
    ] as const) {
      const latched = (mode?: "enforce") => ({
        main: { agentDir: main.agentDir },
        [agentId]: { agentDir, mode },
      });
      loadSovereignPromptsForProcess(fleet("main", latched("enforce")), { log: recordingLog() });
      // Hot reload turns the agent off, so no agent is enforce in config any more (§ 6.3).
      const reloaded = fleet("main", latched());
      expectNamelessRefused(reloaded);
      expectStock(reloaded, "main");
      if (agentId === "prince") {
        expectOwnSnapshot(reloaded, "prince", []);
      } else {
        expectRefusal(
          () => resolveSovereignPromptSnapshot({ config: reloaded, agentId }),
          "required_missing",
        );
      }
      // The restart loads the new config: the agentless call and the agent render stock.
      resetSovereignPromptRuntimeForTests();
      loadSovereignPromptsForProcess(reloaded, { log: recordingLog() });
      expect(resolveSovereignPromptSnapshot({ config: reloaded })).toBeUndefined();
      expectStock(reloaded, agentId);
      resetSovereignPromptRuntimeForTests();
    }
  });

  it("an off agent reads nothing; the first render elsewhere loads once and never rereads", () => {
    const good = writeAgent("good");
    const fsCalls = countFsCalls();
    try {
      const off = configFor({ good: { agentDir: good.agentDir } });
      expect(resolveSovereignPromptSnapshot({ config: off, agentId: "good" })).toBeUndefined();
      expect(isSovereignPromptAgent(off, "good")).toBe(false);
      expect(fsCalls.count()).toBe(0);

      // A process with no Gateway start (the local agent command) loads at its first render.
      const enforced = configFor({ good: { agentDir: good.agentDir, mode: "enforce" } });
      const first = resolveSovereignPromptSnapshot({ config: enforced, agentId: "good" });
      expect(fsCalls.count()).toBeGreaterThan(0);
      fs.rmSync(good.root, { recursive: true, force: true });
      fsCalls.reset();
      // The hot path reads only the frozen snapshot, even with the files gone.
      expect(resolveSovereignPromptSnapshot({ config: enforced, agentId: "good" })).toBe(first);
      expect(fsCalls.count()).toBe(0);
    } finally {
      fsCalls.restore();
    }
  });
});
