// Synthetic sovereign prompt generations and the sentinel check every case runs.
import { createHash, randomUUID } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { inspect } from "node:util";
import { expect, vi } from "vitest";

/** Every fixture body carries this token; no captured surface may ever show it. */
export const SENTINEL = `sovereign-sentinel-${randomUUID()}`;
export const GENERATION = "20261107T120000Z-0123456789ab";
const COMMIT = "0123456789ab".padEnd(40, "c");

type ManifestFile = { path: string; bytes: number; sha256: string };
export type Manifest = {
  schema: string;
  agentId: string;
  generation: string;
  source: { repo: string; commit: string; path: string };
  files: ManifestFile[];
  setDigest: string;
};

export function body(file: string): string {
  return `Synthetic fixture prose for ${file}. ${SENTINEL}\n`;
}

const sha256 = (data: string | Buffer) => createHash("sha256").update(data).digest("hex");

/** Independent of the loader: RFC 8785 JSON of `{bytes, path, sha256}` sorted by path. */
export function setDigestOf(files: readonly ManifestFile[]): string {
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
  return dir;
}

type Outcome = { value?: unknown; error?: unknown; logs: string[] };

/** Runs `run` with console and stdio captured, so log lines join the sentinel check. */
export async function capture(run: () => unknown): Promise<Outcome> {
  const logs: string[] = [];
  const record = (...args: unknown[]) => {
    logs.push(args.map((arg) => (typeof arg === "string" ? arg : inspect(arg))).join(" "));
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
 * inspect, JSON) or returned value shows the sentinel.
 */
export function expectNoSentinel(outcome: Outcome): void {
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
    expect(surface).not.toContain(SENTINEL);
  }
}

/**
 * Run once per file after fixtures are cleaned up: no file under the system temp root
 * written since `since` carries the sentinel. The token is unique per run.
 */
export function expectNoSentinelFilesSince(since: number): void {
  const leaked: string[] = [];
  const walk = (dir: string, depth: number) => {
    let entries: fs.Dirent[] = [];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {}
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      try {
        const stat = fs.lstatSync(full);
        if (stat.mtimeMs < since) {
          continue;
        }
        if (stat.isDirectory() && depth < 4) {
          walk(full, depth + 1);
        } else if (
          stat.isFile() &&
          stat.size < 1 << 20 &&
          fs.readFileSync(full, "utf8").includes(SENTINEL)
        ) {
          leaked.push(full);
        }
      } catch {}
    }
  };
  walk(fs.realpathSync(os.tmpdir()), 0);
  expect(leaked).toEqual([]);
}
