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

/** An explicit fleet; `owner` is its recorded system agent, the owner of agentless calls. */
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

  it("renders stock for an agentless call an off owner resolves for, and never an enforce owner's text", () => {
    const main = writeAgent("main");
    const prince = writeAgent("prince");
    const entries = {
      main: { agentDir: main.agentDir },
      prince: { agentDir: prince.agentDir, mode: "enforce" as const },
    };
    const offOwner = fleet("main", entries);
    loadSovereignPromptsForProcess(offOwner, { log: recordingLog() });
    // The off owner's agentless renders and checks are untouched by the enforce agent beside it.
    expect(resolveSovereignPromptSnapshot({ config: offOwner })).toBeUndefined();
    expect(isSovereignPromptAgent(offOwner, undefined)).toBe(false);
    assertSovereignPromptRoute({ config: offOwner, route: "cli" });
    assertSovereignPromptNotReplaced(offOwner, undefined, "before_prompt_build");
    // The enforce agent is still checked under its own id.
    expectRefusal(
      () => assertSovereignPromptRoute({ config: offOwner, agentId: "prince", route: "cli" }),
      "route_unconverted",
    );
    // An enforce owner's text is never handed to a call that does not name it: that call alone
    // is refused, while a call naming the owner gets its snapshot.
    const enforceOwner = fleet("prince", entries);
    expectRefusal(() => resolveSovereignPromptSnapshot({ config: enforceOwner }), "agent_unknown");
    expect(
      resolveSovereignPromptSnapshot({ config: enforceOwner, agentId: "prince" })?.agentId,
    ).toBe("prince");
    expect(isSovereignPromptAgent(enforceOwner, undefined)).toBe(true);
    expectRefusal(
      () => assertSovereignPromptRoute({ config: enforceOwner, route: "cli" }),
      "route_unconverted",
    );
    expectRefusal(
      () => assertSovereignPromptNotReplaced(enforceOwner, undefined, "before_prompt_build"),
      "sovereign_override_denied",
    );
  });

  it("refuses only the call when no agent resolves, and only while a sovereign agent exists", () => {
    const main = writeAgent("main");
    const prince = writeAgent("prince");
    // An explicit fleet with no recorded owner: an agentless call could be the enforce agent's.
    const ownerless = fleet(undefined, {
      main: { agentDir: main.agentDir },
      prince: { agentDir: prince.agentDir, mode: "enforce" },
    });
    for (const agentId of [undefined, "%%%"]) {
      expect(isSovereignPromptAgent(ownerless, agentId)).toBe(true);
      expectRefusal(
        () => resolveSovereignPromptSnapshot({ config: ownerless, agentId }),
        "agent_unknown",
      );
      expectRefusal(
        () => assertSovereignPromptRoute({ config: ownerless, agentId, route: "cli" }),
        "route_unconverted",
      );
      expectRefusal(
        () => assertSovereignPromptNotReplaced(ownerless, agentId, "before_prompt_build"),
        "sovereign_override_denied",
      );
    }
    // Every named agent keeps its own answer in the same fleet.
    expect(resolveSovereignPromptSnapshot({ config: ownerless, agentId: "main" })).toBeUndefined();
    expect(resolveSovereignPromptSnapshot({ config: ownerless, agentId: "prince" })?.agentId).toBe(
      "prince",
    );
    // With no sovereign agent anywhere, nothing refuses.
    resetSovereignPromptRuntimeForTests();
    const off = fleet(undefined, {
      main: { agentDir: main.agentDir },
      prince: { agentDir: prince.agentDir },
    });
    expect(resolveSovereignPromptSnapshot({ config: off })).toBeUndefined();
    assertSovereignPromptRoute({ config: off, route: "cli" });
    assertSovereignPromptNotReplaced(off, undefined, "before_prompt_build");
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
