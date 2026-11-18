// Synthetic sovereign prompt generations and the sentinel check every case runs.
import { createHash, randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { inspect } from "node:util";
import { expect, vi } from "vitest";
import { createTempDirTracker } from "../../../test/helpers/temp-dir.js";

/** Every fixture body carries this token; no captured surface may ever show it. */
export const SENTINEL = `sovereign-sentinel-${randomUUID()}`;

// Roots and generation directories the fixture wrote, whose files carry the sentinel by
// design. Keyed by device and inode, so a test that renames one keeps it a source.
const sourceDirs = new Set<string>();
const inodeKey = (stat: fs.Stats) => `${stat.dev}:${stat.ino}`;
export const GENERATION = "20261107T120000Z-0123456789ab";
const COMMIT = "0123456789ab".padEnd(40, "c");

type ManifestFile = { path: string; bytes: number; sha256: string };
type Manifest = {
  schema: string;
  agentId: string;
  generation: string;
  source: { repo: string; commit: string; path: string };
  files: ManifestFile[];
  setDigest: string;
};

/** The sentinel opens and closes every body, so a leaked excerpt from either end shows it. */
export function body(file: string): string {
  return `${SENTINEL} Synthetic fixture prose for ${file}. ${SENTINEL}\n`;
}

const sha256 = (data: string | Buffer) => createHash("sha256").update(data).digest("hex");

/** Independent of the loader: RFC 8785 JSON of `{bytes, path, sha256}` sorted by path. */
function setDigestOf(files: readonly ManifestFile[]): string {
  const sorted = files.toSorted((a, b) => (a.path < b.path ? -1 : 1));
  return sha256(
    JSON.stringify(sorted.map((f) => ({ bytes: f.bytes, path: f.path, sha256: f.sha256 }))),
  );
}

export type GenerationSpec = {
  /** Added or replaced bodies; `null` leaves the file out of the directory and the manifest. */
  files?: Record<string, string | Buffer | null>;
  generation?: string;
  /** Edits the manifest before `setDigest` is computed. */
  manifest?: (manifest: Manifest) => void;
  setDigest?: string;
};

export function writeGeneration(dir: string, spec: GenerationSpec = {}): void {
  const files: Record<string, string | Buffer | null> = {
    "identity-section.md": body("identity-section.md"),
    "safety-section.md": body("safety-section.md"),
    "tool-section.md": body("tool-section.md"),
    "tool-section.d/tooling.md": body("tool-section.d/tooling.md"),
    ...spec.files,
  };
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  sourceDirs.add(inodeKey(fs.statSync(dir)));
  const entries: ManifestFile[] = [];
  for (const [file, content] of Object.entries(files)) {
    if (content === null) {
      continue;
    }
    const target = path.join(dir, file);
    fs.mkdirSync(path.dirname(target), { recursive: true, mode: 0o700 });
    fs.writeFileSync(target, content, { mode: 0o600 });
    entries.push({ path: file, bytes: Buffer.byteLength(content), sha256: sha256(content) });
  }
  const generation = spec.generation ?? GENERATION;
  const manifest: Manifest = {
    schema: "openclaw.sovereign-prompts/1",
    agentId: "main",
    generation,
    source: { repo: "karmaterminal/fixture", commit: COMMIT, path: "sovereign/systemprompts" },
    files: entries,
    setDigest: "",
  };
  spec.manifest?.(manifest);
  manifest.setDigest = spec.setDigest ?? setDigestOf(manifest.files);
  fs.writeFileSync(path.join(dir, "MANIFEST.json"), JSON.stringify(manifest), { mode: 0o600 });
}

/** A root holding one generation and `CURRENT`; returns the generation directory. */
export function writeRoot(root: string, spec: GenerationSpec = {}): string {
  const generation = spec.generation ?? GENERATION;
  const dir = path.join(root, "generations", generation);
  writeGeneration(dir, spec);
  fs.writeFileSync(path.join(root, "CURRENT"), `${generation}\n`, { mode: 0o600 });
  sourceDirs.add(inodeKey(fs.statSync(root)));
  return dir;
}

/** Writes one generation for `agentId` at the default root under `agentDir` (§ 3.2). */
export function writeAgentGeneration(agentDir: string, agentId: string, spec: GenerationSpec = {}) {
  const root = path.join(agentDir, "sovereign", "systemprompts");
  fs.mkdirSync(root, { recursive: true, mode: 0o700 });
  const dir = writeRoot(root, {
    ...spec,
    manifest: (manifest) => {
      manifest.agentId = agentId;
      spec.manifest?.(manifest);
    },
  });
  return { root, dir };
}

/** Config whose `agents.entries` set each agent's dir and sovereign switch. */
export function sovereignAgentsConfig(
  entries: Record<string, { agentDir: string; mode?: "off" | "enforce" }>,
) {
  return {
    agents: {
      entries: Object.fromEntries(
        Object.entries(entries).map(([id, { agentDir, mode }]) => [
          id,
          { agentDir, ...(mode ? { sovereignPrompts: { mode } } : {}) },
        ]),
      ),
    },
  };
}

type Outcome = { value?: unknown; error?: unknown; logs: string[] };

/** Runs `run` with console and stdio captured, so log lines join the sentinel check. */
export async function capture(run: () => unknown): Promise<Outcome> {
  const logs: string[] = [];
  const record = (...args: unknown[]) => {
    const text = (arg: unknown) =>
      typeof arg === "string"
        ? arg
        : arg instanceof Uint8Array
          ? Buffer.from(arg).toString("utf8")
          : inspect(arg);
    logs.push(args.map(text).join(" "));
    return true;
  };
  const spies = [
    ...(["log", "info", "warn", "error", "debug"] as const).map((name) =>
      vi.spyOn(console, name).mockImplementation(record),
    ),
    vi.spyOn(process.stdout, "write").mockImplementation(record),
    vi.spyOn(process.stderr, "write").mockImplementation(record),
  ];
  try {
    return { value: await run(), logs };
  } catch (error) {
    return { error, logs };
  } finally {
    for (const spy of spies) {
      spy.mockRestore();
    }
  }
}

/**
 * The redaction assertion for every case: no log line, error (message, stack, cause,
 * inspect, JSON) or returned value shows the sentinel or any `forbidden` string, such
 * as a fixture's absolute path.
 */
export function expectNoSentinel(outcome: Outcome, forbidden: readonly string[] = []): void {
  const surfaces = [...outcome.logs];
  for (const value of [outcome.error, outcome.value]) {
    if (value === undefined) {
      continue;
    }
    surfaces.push(inspect(value, { depth: 8, showHidden: true }), JSON.stringify(value) ?? "");
    if (value instanceof Error) {
      surfaces.push(
        String(value),
        value.message,
        value.stack ?? "",
        inspect(value.cause, { depth: 8 }),
      );
    }
  }
  for (const surface of surfaces) {
    for (const token of [SENTINEL, ...forbidden]) {
      expect(surface).not.toContain(token);
    }
  }
}

/**
 * The file-surface assertion: no file under `dirs` carries the sentinel, outside the roots
 * and generations the fixture wrote. It reads `dirs` only and follows no symlink, so it
 * never opens a file outside them (another test's, or another user's).
 */
export function expectNoSentinelFilesIn(dirs: Iterable<string>): void {
  const leaked: string[] = [];
  const walk = (dir: string) => {
    let stat: fs.Stats;
    try {
      stat = fs.lstatSync(dir);
    } catch {
      // A case may remove its own fixture directory.
      return;
    }
    if (!stat.isDirectory() || sourceDirs.has(inodeKey(stat))) {
      return;
    }
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else if (entry.isFile() && fs.readFileSync(full).includes(SENTINEL)) {
        leaked.push(full);
      }
    }
  };
  for (const dir of dirs) {
    walk(dir);
  }
  if (leaked.length > 0) {
    throw new Error(`Files carry the sovereign sentinel:\n${leaked.join("\n")}`);
  }
}

/**
 * Temp dirs for one test file. After each test, before they are removed, every file a
 * product path wrote under them must be free of the sentinel (`expectNoSentinelFilesIn`).
 */
export function useSovereignTempDirs(registerCleanup: (cleanup: () => void) => unknown): {
  readonly dirs: ReadonlySet<string>;
  make(prefix: string, root?: string): string;
} {
  const tracker = createTempDirTracker();
  registerCleanup(() => {
    try {
      expectNoSentinelFilesIn(tracker.dirs);
    } finally {
      tracker.cleanup();
      // Removed directories free their inodes for reuse.
      sourceDirs.clear();
    }
  });
  return tracker;
}
