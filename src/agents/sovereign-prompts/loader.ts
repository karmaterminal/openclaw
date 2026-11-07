/**
 * Sovereign prompt loader (#1321, design § 3 and § 5).
 *
 * Loads one immutable generation of an agent's sovereign prompt files, checks only
 * mechanics (bytes, structure, filesystem metadata, digests) and freezes the result.
 * Every failure refuses with a content-free code; nothing falls back to code text.
 *
 * Layout under the per-agent root (default `<agentDir>/sovereign/systemprompts`):
 *   CURRENT                       one line, the generation id
 *   generations/<id>/MANIFEST.json and the registry files it lists
 */
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { TextDecoder } from "node:util";
import { normalizeStructuredPromptSection } from "@openclaw/ai/internal/shared";
import { z } from "zod";
import type { OpenClawConfig } from "../../config/types.js";
import { normalizeAgentIdStrict } from "../../routing/session-key.js";
import { resolveAgentConfig, resolveEffectiveAgentDir } from "../agent-scope-config.js";
import {
  containsReservedSovereignToken,
  findSovereignPlaceholderProblem,
  lookupSovereignPromptFile,
  SOVEREIGN_PROMPT_FRAGMENT_DIRS,
  SOVEREIGN_PROMPT_REQUIRED_FILES,
} from "./registry.js";
import { SovereignPromptRefusal, SovereignPromptSnapshot } from "./snapshot.js";

const CURRENT_FILE = "CURRENT";
const GENERATIONS_DIR = "generations";
const MANIFEST_FILE = "MANIFEST.json";
const MANIFEST_SCHEMA = "openclaw.sovereign-prompts/1";
const GENERATION_ID = /^[0-9]{8}T[0-9]{6}Z-[0-9a-f]{12}$/;
const POINTER_MAX_BYTES = 128;
const MANIFEST_MAX_BYTES = 64 * 1024;
// Provisional until metadata-only size measurements exist (design open question 18).
const FILE_MAX_BYTES = 64 * 1024;
const SET_MAX_BYTES = 256 * 1024;
const PRIVATE_FILE_MODES: ReadonlySet<number> = new Set([0o400, 0o600]);
const PRIVATE_DIR_MODES: ReadonlySet<number> = new Set([0o500, 0o700]);
const READ_FLAGS =
  fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW ?? 0) | (fs.constants.O_NONBLOCK ?? 0);

type RefusalCode = SovereignPromptRefusal["code"];
type RefusalDetails = SovereignPromptRefusal["details"];
type LoadContext = { agentId: string; euid: number };

const Sha256HexSchema = z.string().regex(/^[0-9a-f]{64}$/);
const ManifestSchema = z.strictObject({
  schema: z.literal(MANIFEST_SCHEMA),
  agentId: z.string(),
  generation: z.string().regex(GENERATION_ID),
  source: z.strictObject({
    repo: z.string().min(1).max(256),
    commit: z.string().regex(/^[0-9a-f]{40}(?:[0-9a-f]{24})?$/),
    path: z.string().min(1).max(256),
  }),
  files: z
    .array(
      z.strictObject({
        path: z.string().max(256),
        bytes: z.number().int().nonnegative(),
        sha256: Sha256HexSchema,
      }),
    )
    .max(512),
  setDigest: Sha256HexSchema,
});
type ManifestFile = z.infer<typeof ManifestSchema>["files"][number];

function refuse(code: RefusalCode, details?: RefusalDetails): never {
  throw new SovereignPromptRefusal(code, details);
}

/** Errno names only; native messages can carry paths. */
function errnoOf(error: unknown): string {
  const code = (error as NodeJS.ErrnoException | undefined)?.code;
  return typeof code === "string" && /^E[A-Z0-9]+$/.test(code) ? code : "EUNKNOWN";
}

function octal(mode: number): string {
  return mode.toString(8).padStart(4, "0");
}

/** Code-unit order, which RFC 8785 also uses and equals byte order for registry names. */
function byPath(left: { path: string }, right: { path: string }): number {
  return left.path < right.path ? -1 : left.path > right.path ? 1 : 0;
}

function sha256Hex(data: string | Uint8Array): string {
  return createHash("sha256").update(data).digest("hex");
}

/**
 * `setDigest`: sha256 of the RFC 8785 (JCS) JSON of the manifest `files` array, sorted by
 * path. It names a generation by its content without containing any.
 */
function computeSetDigest(files: readonly ManifestFile[]): string {
  const canonical = files
    .map(({ bytes, path: file, sha256 }) => ({ bytes, path: file, sha256 }))
    .toSorted(byPath);
  return sha256Hex(JSON.stringify(canonical));
}

function lstatIfPresent(target: string, details?: RefusalDetails): fs.BigIntStats | undefined {
  try {
    return fs.lstatSync(target, { bigint: true });
  } catch (error) {
    if (errnoOf(error) === "ENOENT") {
      return undefined;
    }
    return refuse("io_error", { ...details, errno: errnoOf(error) });
  }
}

/** Components above the root: canonical, owned by root or the euid, no unprotected shared write. */
function assertSafeAncestors(dir: string, ctx: LoadContext, missing: RefusalCode): void {
  const ancestors: string[] = [];
  for (let current = path.dirname(dir); ; current = path.dirname(current)) {
    ancestors.unshift(current);
    if (path.dirname(current) === current) {
      break;
    }
  }
  for (const ancestor of ancestors) {
    const stat = lstatIfPresent(ancestor) ?? refuse(missing);
    const uid = Number(stat.uid);
    const mode = Number(stat.mode) & 0o7777;
    if (stat.isSymbolicLink() || !stat.isDirectory() || (uid !== 0 && uid !== ctx.euid)) {
      refuse("root_unsafe", { uid });
    }
    // A sticky shared directory such as /tmp keeps other users from replacing our entries.
    if ((mode & 0o022) !== 0 && (mode & 0o1000) === 0) {
      refuse("root_unsafe", { mode: octal(mode) });
    }
  }
}

function assertOwner(stat: fs.BigIntStats, ctx: LoadContext, details?: RefusalDetails): void {
  const uid = Number(stat.uid);
  if (uid !== ctx.euid) {
    refuse("owner_mismatch", { ...details, uid });
  }
}

/** The root, `generations/` and a generation directory (§ 5.2 "Root safe" and "Permissions"). */
function assertPrivateDir(
  dir: string,
  ctx: LoadContext,
  missing: RefusalCode,
  details?: RefusalDetails,
): void {
  const stat = lstatIfPresent(dir, details) ?? refuse(missing, details);
  if (stat.isSymbolicLink() || !stat.isDirectory()) {
    refuse("root_unsafe", details);
  }
  assertOwner(stat, ctx, details);
  const mode = Number(stat.mode) & 0o777;
  if ((mode & 0o022) !== 0) {
    refuse("root_unsafe", { ...details, mode: octal(mode) });
  }
  if (!PRIVATE_DIR_MODES.has(mode)) {
    refuse("mode_unsafe", { ...details, mode: octal(mode) });
  }
}

type PrivateFileRead = {
  maxBytes: number;
  /** Read exactly this many bytes (the manifest's count). */
  expectedBytes?: number;
  details?: RefusalDetails;
  /** Code for an absent file; `io_error` with ENOENT when unset. */
  missing?: RefusalCode;
  /** Pointer and manifest fold their own shape failures into one code (§ 5.2). */
  invalid?: RefusalCode;
};

/**
 * Opens without following symlinks, reads exactly the expected bytes and refuses any
 * change across the read. fs-safe's regular-file reader folds symlink and non-regular
 * failures into one uncoded error, and each needs its own § 5.2 code here.
 */
function readPrivateFile(filePath: string, ctx: LoadContext, read: PrivateFileRead): Buffer {
  const details = read.details;
  const before = lstatIfPresent(filePath, details);
  if (!before) {
    return refuse(
      read.missing ?? "io_error",
      read.missing ? details : { ...details, errno: "ENOENT" },
    );
  }
  if (before.isSymbolicLink()) {
    refuse(read.invalid ?? "symlink", details);
  }
  // Checked before open: opening a FIFO or device could block or have side effects.
  if (!before.isFile()) {
    refuse(read.invalid ?? "not_regular", details);
  }
  let fd: number;
  try {
    fd = fs.openSync(filePath, READ_FLAGS);
  } catch (error) {
    return refuse(errnoOf(error) === "ELOOP" ? (read.invalid ?? "symlink") : "io_error", {
      ...details,
      errno: errnoOf(error),
    });
  }
  try {
    const opened = fs.fstatSync(fd, { bigint: true });
    if (!opened.isFile()) {
      refuse(read.invalid ?? "not_regular", details);
    }
    if (opened.dev !== before.dev || opened.ino !== before.ino) {
      refuse("partial_read", details);
    }
    if (opened.nlink !== 1n) {
      refuse(read.invalid ?? "hardlink", details);
    }
    assertOwner(opened, ctx, details);
    const mode = Number(opened.mode) & 0o777;
    if (!PRIVATE_FILE_MODES.has(mode)) {
      refuse("mode_unsafe", { ...details, mode: octal(mode) });
    }
    const size = Number(opened.size);
    if (size > read.maxBytes) {
      refuse(read.invalid ?? "size_exceeded", { ...details, bytes: size, limit: read.maxBytes });
    }
    const length = read.expectedBytes ?? size;
    // One spare byte proves EOF at exactly `length`.
    const buffer = Buffer.alloc(length + 1);
    let total = 0;
    while (total < buffer.length) {
      const n = fs.readSync(fd, buffer, total, buffer.length - total, null);
      if (n === 0) {
        break;
      }
      total += n;
    }
    const after = fs.fstatSync(fd, { bigint: true });
    if (
      total !== length ||
      after.size !== opened.size ||
      after.mtimeNs !== opened.mtimeNs ||
      after.ctimeNs !== opened.ctimeNs ||
      after.ino !== opened.ino
    ) {
      refuse("partial_read", details);
    }
    return buffer.subarray(0, length);
  } catch (error) {
    if (error instanceof SovereignPromptRefusal) {
      throw error;
    }
    return refuse("io_error", { ...details, errno: errnoOf(error) });
  } finally {
    fs.closeSync(fd);
  }
}

function readPointer(root: string, ctx: LoadContext): string {
  const text = readPrivateFile(path.join(root, CURRENT_FILE), ctx, {
    maxBytes: POINTER_MAX_BYTES,
    details: { file: CURRENT_FILE },
    missing: "pointer_missing",
    invalid: "pointer_invalid",
  }).toString("latin1");
  const id = text.endsWith("\n") ? text.slice(0, -1) : text;
  return GENERATION_ID.test(id) ? id : refuse("pointer_invalid", { file: CURRENT_FILE });
}

function readManifest(dir: string, ctx: LoadContext, expectedGeneration: string | undefined) {
  const details = {
    file: MANIFEST_FILE,
    ...(expectedGeneration ? { generation: expectedGeneration } : {}),
  };
  const buffer = readPrivateFile(path.join(dir, MANIFEST_FILE), ctx, {
    maxBytes: MANIFEST_MAX_BYTES,
    details,
    missing: "manifest_invalid",
    invalid: "manifest_invalid",
  });
  let parsed: unknown;
  try {
    parsed = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(buffer));
  } catch {
    return refuse("manifest_invalid", details);
  }
  const result = ManifestSchema.safeParse(parsed);
  if (!result.success) {
    return refuse("manifest_invalid", details);
  }
  const manifest = result.data;
  if (
    manifest.agentId !== ctx.agentId ||
    (expectedGeneration !== undefined && manifest.generation !== expectedGeneration) ||
    !manifest.generation.endsWith(manifest.source.commit.slice(0, 12)) ||
    new Set(manifest.files.map((file) => file.path)).size !== manifest.files.length
  ) {
    return refuse("manifest_invalid", details);
  }
  if (computeSetDigest(manifest.files) !== manifest.setDigest) {
    refuse("manifest_digest_mismatch", details);
  }
  return manifest;
}

/** Resolves every manifest path against the registry; required files are listed; the set fits. */
function resolveManifestFiles(files: readonly ManifestFile[]) {
  // A name outside the registry is never echoed.
  const resolved = files.map((file) => ({
    ...file,
    entry: lookupSovereignPromptFile(file.path) ?? refuse("unknown_slot"),
  }));
  for (const required of SOVEREIGN_PROMPT_REQUIRED_FILES) {
    if (!files.some((file) => file.path === required)) {
      refuse("required_missing", {
        slot: lookupSovereignPromptFile(required)?.slot.slot,
        file: required,
      });
    }
  }
  // Also bounds the read buffers, which are sized from manifest counts.
  const total = files.reduce((sum, file) => sum + file.bytes, 0);
  if (total > SET_MAX_BYTES) {
    refuse("size_exceeded", { bytes: total, limit: SET_MAX_BYTES });
  }
  // Path order, as in `setDigest`, so receipts do not depend on manifest order.
  return resolved.toSorted(byPath);
}

/** No directory entry outside the manifest; fragment directories are real, private directories. */
function assertListing(dir: string, listed: ReadonlySet<string>, ctx: LoadContext): void {
  const list = (target: string) => {
    try {
      return fs.readdirSync(target, { withFileTypes: true });
    } catch (error) {
      return refuse("io_error", { errno: errnoOf(error) });
    }
  };
  for (const entry of list(dir)) {
    if (entry.name === MANIFEST_FILE || listed.has(entry.name)) {
      continue;
    }
    const details = { file: entry.name };
    const stat = SOVEREIGN_PROMPT_FRAGMENT_DIRS.has(entry.name)
      ? lstatIfPresent(path.join(dir, entry.name), details)
      : undefined;
    if (stat?.isSymbolicLink()) {
      // Opening a file through a symlinked parent would follow it despite O_NOFOLLOW.
      refuse("symlink", details);
    }
    if (!stat?.isDirectory()) {
      refuse("unexpected_file");
    }
    assertOwner(stat, ctx, details);
    const mode = Number(stat.mode) & 0o777;
    if (!PRIVATE_DIR_MODES.has(mode)) {
      refuse("mode_unsafe", { ...details, mode: octal(mode) });
    }
    for (const child of list(path.join(dir, entry.name))) {
      if (!listed.has(`${entry.name}/${child.name}`)) {
        refuse("unexpected_file");
      }
    }
  }
}

function decodeBody(buffer: Buffer, details: RefusalDetails): string {
  if (buffer[0] === 0xef && buffer[1] === 0xbb && buffer[2] === 0xbf) {
    refuse("encoding_bom", details);
  }
  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(buffer);
  } catch {
    return refuse("encoding_invalid", details);
  }
  // Bytes below 0x20 never occur inside a UTF-8 multibyte sequence.
  if (buffer.some((byte) => byte < 0x20 && byte !== 0x09 && byte !== 0x0a && byte !== 0x0d)) {
    refuse("control_char", details);
  }
  return text;
}

/** § 5.1 steps 4–6 against one generation directory. */
function loadGeneration(
  dir: string,
  ctx: LoadContext,
  expectedGeneration: string | undefined,
): SovereignPromptSnapshot {
  const manifest = readManifest(dir, ctx, expectedGeneration);
  const files = resolveManifestFiles(manifest.files);
  assertListing(dir, new Set(manifest.files.map((file) => file.path)), ctx);
  const bodies = new Map<string, string>();
  const receipts = [];
  let bytes = 0;
  for (const { entry, ...file } of files) {
    const details = { slot: entry.slot.slot, file: file.path };
    const buffer = readPrivateFile(path.join(dir, entry.path), ctx, {
      maxBytes: FILE_MAX_BYTES,
      expectedBytes: file.bytes,
      details,
    });
    if (sha256Hex(buffer) !== file.sha256) {
      refuse("digest_mismatch", details);
    }
    const text = decodeBody(buffer, details);
    const normalized = normalizeStructuredPromptSection(text);
    if (containsReservedSovereignToken(text, normalized)) {
      refuse("reserved_token", details);
    }
    const placeholder = findSovereignPlaceholderProblem(text, entry.slot.facts);
    if (placeholder) {
      refuse(placeholder, details);
    }
    if (normalized) {
      bodies.set(entry.path, text);
    } else if (entry.slot.required) {
      refuse("required_empty", details);
    }
    bytes += file.bytes;
    receipts.push({
      path: entry.path,
      slot: entry.slot.slot,
      bytes: file.bytes,
      sha256: file.sha256,
      converted: entry.converted,
    });
  }
  return new SovereignPromptSnapshot(
    {
      agentId: ctx.agentId,
      generation: manifest.generation,
      setDigest: manifest.setDigest,
      bytes,
      files: receipts,
    },
    bodies,
  );
}

function assertCanonicalAbsolute(target: string): void {
  if (!path.isAbsolute(target) || path.resolve(target) !== target) {
    refuse("root_unsafe");
  }
}

/**
 * Loads and freezes one generation, or throws a content-free `SovereignPromptRefusal`.
 *
 * `root` runs the whole § 5.1 sequence through `CURRENT`. `generationDir` checks a
 * candidate directory before it is published (§ 9.2 step 6): the same checks with no
 * pointer, and no requirement that the directory is named by its generation id.
 */
export function loadSovereignPromptSnapshot(params: {
  agentId: string;
  target: { root: string } | { generationDir: string };
  /** Effective uid seam, as in `resolvePreferredOpenClawTmpDir`. */
  getuid?: () => number | undefined;
  /** § 10.1 injection point between the generation read and the `CURRENT` re-check. */
  beforePointerRecheck?: () => void;
}): SovereignPromptSnapshot {
  const euid = params.getuid ? params.getuid() : process.geteuid?.();
  if (euid === undefined) {
    // Ownership cannot be established without POSIX ids (design § 5.2, POSIX seats).
    refuse("root_unsafe");
  }
  const ctx: LoadContext = { agentId: params.agentId, euid };
  if ("generationDir" in params.target) {
    const dir = params.target.generationDir;
    assertCanonicalAbsolute(dir);
    assertSafeAncestors(dir, ctx, "generation_missing");
    assertPrivateDir(dir, ctx, "generation_missing");
    return loadGeneration(dir, ctx, undefined);
  }
  const root = params.target.root;
  assertCanonicalAbsolute(root);
  assertSafeAncestors(root, ctx, "root_missing");
  assertPrivateDir(root, ctx, "root_missing");
  const generations = path.join(root, GENERATIONS_DIR);
  assertPrivateDir(generations, ctx, "generation_missing");
  for (let attempt = 0; ; attempt += 1) {
    const generation = readPointer(root, ctx);
    const dir = path.join(generations, generation);
    assertPrivateDir(dir, ctx, "generation_missing", { generation });
    const snapshot = loadGeneration(dir, ctx, generation);
    params.beforePointerRecheck?.();
    let current: string | undefined;
    try {
      current = readPointer(root, ctx);
    } catch (error) {
      if (!(error instanceof SovereignPromptRefusal)) {
        throw error;
      }
    }
    if (current === generation) {
      return snapshot;
    }
    if (attempt >= 1) {
      refuse("generation_changed", { generation });
    }
  }
}

/** Resolves an agent's sovereign prompt mode and root from config; reads no file. */
export function resolveSovereignPromptTarget(
  config: OpenClawConfig,
  agentId: string,
  env: NodeJS.ProcessEnv = process.env,
) {
  const normalized = normalizeAgentIdStrict(agentId);
  const id = normalized.ok ? normalized.value : refuse("agent_unknown");
  const agent = resolveAgentConfig(config, id) ?? refuse("agent_unknown");
  const root = path.join(
    resolveEffectiveAgentDir(config, id, { env }),
    "sovereign",
    "systemprompts",
  );
  return {
    agentId: id,
    mode: agent.sovereignPrompts?.mode ?? "off",
    root,
    current: path.join(root, CURRENT_FILE),
    generations: path.join(root, GENERATIONS_DIR),
  };
}

/**
 * The per-agent start-time load. `off` reads nothing and changes nothing. `enforce` is
 * refused until the snapshot is wired into prompt assembly, so a seat cannot flip
 * early and nothing falls back to code text.
 */
export function loadAgentSovereignPrompts(
  target: Pick<ReturnType<typeof resolveSovereignPromptTarget>, "mode">,
): { state: "off" } | { state: "refused"; refusal: SovereignPromptRefusal } {
  if (target.mode === "off") {
    return { state: "off" };
  }
  return { state: "refused", refusal: new SovereignPromptRefusal("enforce_unwired") };
}
