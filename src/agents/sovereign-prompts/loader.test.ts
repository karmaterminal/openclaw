import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { inspect } from "node:util";
import { afterAll, afterEach, describe, expect, it, vi } from "vitest";
import { useAutoCleanupTempDirTracker } from "../../../test/helpers/temp-dir.js";
import type { OpenClawConfig } from "../../config/types.js";
import {
  loadAgentSovereignPrompts,
  loadSovereignPromptSnapshot,
  resolveSovereignPromptTarget,
} from "./loader.js";
import { SovereignPromptRefusal, SovereignPromptSnapshot } from "./snapshot.js";
import {
  body,
  capture,
  expectNoSentinel,
  expectNoSentinelFilesSince,
  GENERATION,
  SENTINEL,
  writeGeneration,
  writeRoot,
  type GenerationSpec,
} from "./sovereign-fixture.test-support.js";

const startedAt = Date.now();
const tempDirs = useAutoCleanupTempDirTracker(afterEach);
afterAll(() => expectNoSentinelFilesSince(startedAt));

const OTHER_GENERATION = "20261107T130000Z-0123456789ab";
const TOOLING = "tool-section.d/tooling.md";

type Case = {
  name: string;
  code: SovereignPromptRefusal["code"];
  spec?: GenerationSpec;
  /** Raw filesystem change after a valid root is written. */
  mutate?: (paths: { root: string; dir: string }) => void;
};

function newRoot(): string {
  // Created 0700 under the canonical temp root.
  return tempDirs.make("openclaw-sovereign-");
}

async function loadRoot(
  root: string,
  extra: Partial<Parameters<typeof loadSovereignPromptSnapshot>[0]> = {},
) {
  return capture(() =>
    loadSovereignPromptSnapshot({ agentId: "main", target: { root }, ...extra }),
  );
}

function expectRefused(outcome: Awaited<ReturnType<typeof capture>>, code: string) {
  expect(outcome.error).toBeInstanceOf(SovereignPromptRefusal);
  expect((outcome.error as SovereignPromptRefusal).code).toBe(code);
  expectNoSentinel(outcome);
}

const replaceWith =
  (file: string, write: (target: string) => void) =>
  ({ dir }: { dir: string }) => {
    const target = path.join(dir, file);
    fs.rmSync(target, { recursive: true, force: true });
    write(target);
  };

// The runner's per-run temp root is user-owned. Under an injected euid every user-owned
// ancestor is refused first (root_unsafe), so the owner case needs a root-owned chain.
const rootOwnedTmp = (() => {
  const tmp = fs.realpathSync("/tmp");
  for (let dir = tmp; ; dir = path.dirname(dir)) {
    if (fs.lstatSync(dir).uid !== 0) {
      return undefined;
    }
    if (path.dirname(dir) === dir) {
      return tmp;
    }
  }
})();

// One case per design § 5.2 code, each on real files in a temp directory.
const cases: Case[] = [
  {
    name: "root missing",
    code: "root_missing",
    mutate: ({ root }) => fs.rmSync(root, { recursive: true }),
  },
  {
    name: "group-writable root",
    code: "root_unsafe",
    mutate: ({ root }) => fs.chmodSync(root, 0o770),
  },
  {
    name: "CURRENT missing",
    code: "pointer_missing",
    mutate: ({ root }) => fs.rmSync(path.join(root, "CURRENT")),
  },
  {
    name: "garbage CURRENT",
    code: "pointer_invalid",
    mutate: ({ root }) => fs.writeFileSync(path.join(root, "CURRENT"), "latest\n"),
  },
  {
    name: "CURRENT names an absent generation",
    code: "generation_missing",
    mutate: ({ root }) => fs.writeFileSync(path.join(root, "CURRENT"), `${OTHER_GENERATION}\n`),
  },
  {
    name: "manifest for another agent",
    code: "manifest_invalid",
    spec: { manifest: (manifest) => void (manifest.agentId = "other") },
  },
  {
    name: "manifest digest mismatch",
    code: "manifest_digest_mismatch",
    spec: { setDigest: "0".repeat(64) },
  },
  { name: "unknown slot", code: "unknown_slot", spec: { files: { "notes.md": body("notes.md") } } },
  {
    name: "stray name",
    code: "unexpected_file",
    mutate: ({ dir }) =>
      fs.writeFileSync(path.join(dir, "README"), body("README"), { mode: 0o600 }),
  },
  {
    name: "required file absent",
    code: "required_missing",
    spec: { files: { "safety-section.md": null } },
  },
  {
    name: "zero-byte required file",
    code: "required_empty",
    spec: { files: { "tool-section.md": "" } },
  },
  {
    name: "required file empty after normalization",
    code: "required_empty",
    spec: { files: { "identity-section.md": " \r\n\t\n" } },
  },
  {
    name: "symlinked file",
    code: "symlink",
    mutate: replaceWith("safety-section.md", (target) => {
      fs.writeFileSync(path.join(path.dirname(target), "..", "..", "elsewhere.md"), body("x"));
      fs.symlinkSync("../../elsewhere.md", target);
    }),
  },
  {
    name: "symlinked fragment parent",
    code: "symlink",
    mutate: ({ root, dir }) => {
      fs.renameSync(path.join(dir, "tool-section.d"), path.join(root, "outside.d"));
      fs.symlinkSync(path.join(root, "outside.d"), path.join(dir, "tool-section.d"));
    },
  },
  {
    name: "directory in place of a file",
    code: "not_regular",
    mutate: replaceWith("tool-section.md", (target) => fs.mkdirSync(target, { mode: 0o700 })),
  },
  {
    name: "FIFO in place of a file",
    code: "not_regular",
    mutate: replaceWith("tool-section.md", (target) => {
      expect(spawnSync("mkfifo", ["-m", "600", target]).status).toBe(0);
    }),
  },
  {
    name: "hardlink",
    code: "hardlink",
    mutate: ({ root, dir }) => fs.linkSync(path.join(dir, TOOLING), path.join(root, "linked-copy")),
  },
  {
    name: "group-readable file",
    code: "mode_unsafe",
    mutate: ({ dir }) => fs.chmodSync(path.join(dir, "safety-section.md"), 0o644),
  },
  {
    name: "oversize file",
    code: "size_exceeded",
    spec: { files: { [TOOLING]: `${SENTINEL}${"x".repeat(64 * 1024)}` } },
  },
  {
    name: "oversize set",
    code: "size_exceeded",
    spec: {
      files: Object.fromEntries(
        [
          "identity-section.md",
          "safety-section.md",
          "tool-section.md",
          TOOLING,
          "execution-section.md",
        ].map((file) => [file, `${SENTINEL}${"y".repeat(60 * 1024)}`]),
      ),
    },
  },
  {
    name: "size differs from the manifest",
    code: "partial_read",
    mutate: ({ dir }) => fs.appendFileSync(path.join(dir, TOOLING), "z"),
  },
  {
    name: "digest differs from the manifest",
    code: "digest_mismatch",
    spec: {
      manifest: (manifest) => {
        manifest.files = manifest.files.map((file, index) =>
          index === 0 ? { ...file, sha256: "f".repeat(64) } : file,
        );
      },
    },
  },
  {
    name: "invalid UTF-8",
    code: "encoding_invalid",
    spec: {
      files: { [TOOLING]: Buffer.concat([Buffer.from(SENTINEL), Buffer.from([0xc3, 0x28])]) },
    },
  },
  { name: "BOM", code: "encoding_bom", spec: { files: { [TOOLING]: `﻿${body(TOOLING)}` } } },
  {
    name: "NUL byte",
    code: "control_char",
    spec: { files: { [TOOLING]: `${body(TOOLING)}\u0000` } },
  },
  {
    name: "cache boundary marker",
    code: "reserved_token",
    spec: { files: { [TOOLING]: `${body(TOOLING)}<!-- OPENCLAW_CACHE_BOUNDARY -->` } },
  },
  {
    name: "code-matched heading line",
    code: "reserved_token",
    spec: { files: { [TOOLING]: `${body(TOOLING)}## Skills  \r\n` } },
  },
  {
    name: "malformed placeholder",
    code: "placeholder_invalid",
    spec: { files: { [TOOLING]: `${body(TOOLING)}{{oc:Tool exec}}` } },
  },
  {
    name: "placeholder outside the slot's facts",
    code: "placeholder_unknown",
    spec: { files: { [TOOLING]: `${body(TOOLING)}{{oc:tool:current}}` } },
  },
  {
    name: "listed file absent from the directory",
    code: "io_error",
    mutate: ({ dir }) => fs.rmSync(path.join(dir, TOOLING)),
  },
];

describe.skipIf(process.platform === "win32")("loadSovereignPromptSnapshot", () => {
  it.each(cases)("refuses: $name → $code", async ({ code, spec, mutate }) => {
    const root = newRoot();
    const dir = writeRoot(root, spec);
    mutate?.({ root, dir });
    expectRefused(await loadRoot(root), code);
  });

  it.skipIf(!rootOwnedTmp)("refuses an owner mismatch through the euid seam", async () => {
    const root = tempDirs.make("openclaw-sovereign-owner-", rootOwnedTmp);
    writeRoot(root);
    const euid = process.geteuid?.() ?? 0;
    expectRefused(await loadRoot(root, { getuid: () => euid + 1 }), "owner_mismatch");
  });

  it("refuses a symlinked root ancestor", async () => {
    const base = newRoot();
    const real = path.join(base, "real");
    fs.mkdirSync(real, { mode: 0o700 });
    writeRoot(real);
    fs.symlinkSync(real, path.join(base, "alias"));
    expectRefused(await loadRoot(path.join(base, "alias")), "root_unsafe");
  });

  it("retries once when CURRENT flips mid-load, then refuses generation_changed", async () => {
    const root = newRoot();
    writeRoot(root);
    writeGeneration(path.join(root, "generations", OTHER_GENERATION), {
      generation: OTHER_GENERATION,
    });
    let flips = 0;
    const flip = (limit: number) => () => {
      if (flips++ < limit) {
        const current = fs.readFileSync(path.join(root, "CURRENT"), "utf8").trim();
        fs.writeFileSync(
          path.join(root, "CURRENT"),
          current === GENERATION ? OTHER_GENERATION : GENERATION,
        );
      }
    };
    const retried = await loadRoot(root, { beforePointerRecheck: flip(1) });
    expect((retried.value as SovereignPromptSnapshot).generation).toBe(OTHER_GENERATION);
    flips = 0;
    expectRefused(await loadRoot(root, { beforePointerRecheck: flip(2) }), "generation_changed");
  });

  it("loads a generation into a snapshot that never prints a body", async () => {
    const root = newRoot();
    writeRoot(root, {
      files: {
        "execution-section.md": "  \n",
        "tool-section.d/media-dedupe.md": `${body("media")}{{oc:tool:current}}`,
      },
    });
    const outcome = await loadRoot(root);
    const snapshot = outcome.value as SovereignPromptSnapshot;
    expect(snapshot).toBeInstanceOf(SovereignPromptSnapshot);
    expect(snapshot.generation).toBe(GENERATION);
    expect(snapshot.files.map((file) => [file.path, file.slot, file.converted])).toEqual([
      ["execution-section.md", "execution/bias", true],
      ["identity-section.md", "identity/opening", true],
      ["safety-section.md", "safety/care", true],
      ["tool-section.d/media-dedupe.md", "tool/media-dedupe", true],
      [TOOLING, "tool/tooling", true],
      ["tool-section.md", "tool/call-style", true],
    ]);
    expect(snapshot.body("safety-section.md")).toBe(body("safety-section.md"));
    // An empty optional file is omitted, not refused.
    expect(snapshot.body("execution-section.md")).toBeUndefined();
    expectNoSentinel(outcome);
    for (const printed of [
      JSON.stringify(snapshot),
      inspect(snapshot, { depth: 8, showHidden: true }),
      `${snapshot}`,
      inspect(new Error("load failed", { cause: snapshot }), { depth: 8 }),
    ]) {
      expect(printed).not.toContain(SENTINEL);
      expect(printed).toContain(snapshot.setDigest.slice(0, 12));
    }
  });

  it("checks a candidate directory without a pointer or a generation-named directory", async () => {
    const root = newRoot();
    const staging = path.join(root, ".staging-1");
    writeGeneration(staging);
    const candidate = await capture(() =>
      loadSovereignPromptSnapshot({ agentId: "main", target: { generationDir: staging } }),
    );
    expect((candidate.value as SovereignPromptSnapshot).generation).toBe(GENERATION);
    expectNoSentinel(candidate);
    // Through CURRENT the directory must carry the manifest's generation id.
    fs.mkdirSync(path.join(root, "generations"), { mode: 0o700 });
    fs.renameSync(staging, path.join(root, "generations", OTHER_GENERATION));
    fs.writeFileSync(path.join(root, "CURRENT"), OTHER_GENERATION, { mode: 0o600 });
    expectRefused(await loadRoot(root), "manifest_invalid");
  });
});

describe.skipIf(process.platform === "win32")("loadAgentSovereignPrompts", () => {
  function configFor(
    agentDir: string,
    modes: { defaults?: "off" | "enforce"; entry?: "off" | "enforce" },
  ) {
    return {
      agents: {
        ...(modes.defaults ? { defaults: { sovereignPrompts: { mode: modes.defaults } } } : {}),
        entries: {
          main: { agentDir, ...(modes.entry ? { sovereignPrompts: { mode: modes.entry } } : {}) },
        },
      },
    } as OpenClawConfig;
  }

  it("off reads nothing at the loader's fs boundary; enforce refuses enforce_unwired", async () => {
    const agentDir = newRoot();
    const root = path.join(agentDir, "sovereign", "systemprompts");
    fs.mkdirSync(root, { recursive: true, mode: 0o700 });
    writeRoot(root);
    const spies = (
      ["lstatSync", "openSync", "readSync", "fstatSync", "readdirSync", "closeSync"] as const
    ).map((name) => vi.spyOn(fs, name));
    const fsCalls = () => spies.reduce((sum, spy) => sum + spy.mock.calls.length, 0);
    try {
      for (const modes of [{}, { entry: "off" }, { defaults: "enforce", entry: "off" }] as const) {
        const target = resolveSovereignPromptTarget(configFor(agentDir, modes), "main");
        expect(target.root).toBe(root);
        spies.forEach((spy) => spy.mockClear());
        expect(loadAgentSovereignPrompts(target)).toEqual({ state: "off" });
        expect(fsCalls()).toBe(0);
      }
      for (const modes of [{ entry: "enforce" }, { defaults: "enforce" }] as const) {
        const target = resolveSovereignPromptTarget(configFor(agentDir, modes), "main");
        spies.forEach((spy) => spy.mockClear());
        const outcome = await capture(() => loadAgentSovereignPrompts(target));
        expect(outcome.value).toMatchObject({
          state: "refused",
          refusal: { code: "enforce_unwired" },
        });
        expectNoSentinel(outcome);
        expect(fsCalls()).toBe(0);
      }
      // Positive control: the same spies see the loader's reads of this root.
      loadSovereignPromptSnapshot({ agentId: "main", target: { root } });
      expect(fsCalls()).toBeGreaterThan(0);
    } finally {
      spies.forEach((spy) => spy.mockRestore());
    }
  });
});
