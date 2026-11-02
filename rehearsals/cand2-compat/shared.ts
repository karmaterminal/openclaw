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

/** The exact product commit each label names. */
export const PRODUCT_SHAS: Record<ReaderLabel, string> = {
  "cand2-15aa7e93": "15aa7e9333a242debb32586afacd09a3bad816ce",
  "old-22f49a43": "22f49a43a118f86dfd8c95dd5b2850420aa8bcad",
  "old-3d3364dd": "3d3364ddc5a88282b9d1cc71d8a529e83c18f0b0",
};

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

function gitSucceeds(args: string[]): boolean {
  try {
    execFileSync("git", args, { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

/**
 * The product commit this checkout runs: HEAD descends from it and differs from it only under
 * rehearsals/ (the lane branch carries rehearsal-only commits on top of CAND2; old readers are
 * detached at their exact SHA with the rehearsal copied in untracked).
 */
export function productSha(): string {
  const match = Object.values(PRODUCT_SHAS).find(
    (sha) =>
      gitSucceeds(["merge-base", "--is-ancestor", sha, "HEAD"]) &&
      gitSucceeds(["diff", "--quiet", sha, "HEAD", "--", ".", ":(exclude)rehearsals"]),
  );
  if (!match) {
    throw new Error(`HEAD ${headSha()} is not a rehearsal-only descendant of a named product SHA`);
  }
  // Tracked files outside rehearsals/ must also be unmodified in the working tree.
  if (!gitSucceeds(["diff", "--quiet", "HEAD", "--", ".", ":(exclude)rehearsals"])) {
    throw new Error("the checkout has tracked modifications outside rehearsals/");
  }
  return match;
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
  writeCheckoutHead: string;
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
    : {
        writeSha: productSha(),
        writeCheckoutHead: headSha(),
        writtenAt: new Date().toISOString(),
        surfaces: {},
      };
  if (manifest.writeSha !== productSha()) {
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
    : { readSha: productSha(), readCheckoutHead: headSha(), rows: [] };
  if (results.readSha !== productSha()) {
    throw new Error(`results for ${reader} were recorded by ${String(results.readSha)}`);
  }
  (results.rows as unknown[]).push({ surface, test, ...outcome });
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(results, null, 2)}\n`);
}

export function errorText(error: unknown): string {
  return error instanceof Error ? `${error.name}: ${error.message}` : String(error);
}
