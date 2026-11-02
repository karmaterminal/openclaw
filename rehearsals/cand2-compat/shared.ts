// CAND2 backward-compat rehearsal (karmaterminal/openclaw#1415): fixture paths, hashing and the
// manifest shared by the CAND2 writer and every old-SHA reader. Every byte lives under
// CAND2_COMPAT_ROOT, an isolated lane temp root; nothing here opens a seat's ~/.openclaw.
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

export const SURFACES = {
  discordIngress: "discord-ingress",
  pendingInput: "pending-input-aggregate",
  codexRegistration: "codex-registration",
  watermark: "room-history-watermark",
} as const;

/** Readers that get their own copy of each fixture (and their own live Codex orphan). */
export const READERS = ["cand2-15aa7e93", "old-22f49a43", "old-3d3364dd"] as const;
export type ReaderLabel = (typeof READERS)[number];

export function requireRoot(): string {
  const root = process.env.CAND2_COMPAT_ROOT?.trim();
  if (!root || !path.isAbsolute(root)) {
    throw new Error("Set CAND2_COMPAT_ROOT to the lane's absolute temp root");
  }
  return root;
}

export function fixtureDir(root: string, surface: string, ...rest: string[]): string {
  return path.join(root, "fixtures", surface, ...rest);
}

export function readerDir(root: string, reader: string, surface: string): string {
  return path.join(root, "read", reader, surface);
}

export function headSha(): string {
  return execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
}

/** sha256 of every regular file under dir, keyed by its relative path. */
export function hashTree(dir: string): Record<string, string> {
  const out: Record<string, string> = {};
  const walk = (current: string) => {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else if (entry.isFile()) {
        out[path.relative(dir, full)] = createHash("sha256")
          .update(fs.readFileSync(full))
          .digest("hex");
      }
    }
  };
  if (fs.existsSync(dir)) {
    walk(dir);
  }
  return Object.fromEntries(Object.entries(out).toSorted(([a], [b]) => a.localeCompare(b)));
}

/** A reader's private, byte-identical copy of the CAND2-written fixture. */
export function copyFixture(source: string, destination: string): Record<string, string> {
  fs.rmSync(destination, { recursive: true, force: true });
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.cpSync(source, destination, { recursive: true });
  return hashTree(destination);
}

export type Manifest = {
  writeSha: string;
  writtenAt: string;
  surfaces: Record<string, unknown>;
};

export function manifestPath(root: string): string {
  return path.join(root, "fixtures", "manifest.json");
}

export function readManifest(root: string): Manifest {
  return JSON.parse(fs.readFileSync(manifestPath(root), "utf8")) as Manifest;
}

export function writeManifestSurface(root: string, surface: string, value: unknown): void {
  const file = manifestPath(root);
  const manifest: Manifest = fs.existsSync(file)
    ? readManifest(root)
    : { writeSha: headSha(), writtenAt: new Date().toISOString(), surfaces: {} };
  if (manifest.writeSha !== headSha()) {
    throw new Error(`manifest was written by ${manifest.writeSha}, not this checkout`);
  }
  manifest.surfaces[surface] = value;
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(manifest, null, 2)}\n`);
}

/** One reader outcome row; RECEIPTS.md is built from these files. */
export function recordResult(
  root: string,
  reader: string,
  surface: string,
  test: string,
  outcome: Record<string, unknown>,
): void {
  const file = path.join(root, "results", `${reader}.json`);
  const results = fs.existsSync(file)
    ? (JSON.parse(fs.readFileSync(file, "utf8")) as Record<string, unknown>)
    : { readSha: headSha(), rows: [] };
  if (results.readSha !== headSha()) {
    throw new Error(`results for ${reader} were recorded by ${String(results.readSha)}`);
  }
  (results.rows as unknown[]).push({ surface, test, ...outcome });
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(results, null, 2)}\n`);
}

export function errorText(error: unknown): string {
  return error instanceof Error ? `${error.name}: ${error.message}` : String(error);
}
