/**
 * Content-free carriers for sovereign prompt load results (#1321).
 *
 * A refusal names its code and metadata only. A snapshot keeps bodies in a private
 * field and prints metadata through every serialization path, so logging, JSON,
 * interpolation or a crash dump of either never shows a body byte.
 */
import { inspect } from "node:util";

type SovereignPromptRefusalCode =
  | "root_missing"
  | "root_unsafe"
  | "pointer_missing"
  | "pointer_invalid"
  | "generation_missing"
  | "manifest_invalid"
  | "manifest_digest_mismatch"
  | "unknown_slot"
  | "unexpected_file"
  | "required_missing"
  | "required_empty"
  | "symlink"
  | "not_regular"
  | "hardlink"
  | "owner_mismatch"
  | "mode_unsafe"
  | "size_exceeded"
  | "partial_read"
  | "digest_mismatch"
  | "encoding_invalid"
  | "encoding_bom"
  | "control_char"
  | "reserved_token"
  | "placeholder_invalid"
  | "placeholder_unknown"
  | "generation_changed"
  | "io_error"
  // Phase A wiring into the prompt is not present at this build, so enforce cannot load.
  | "enforce_unwired"
  | "agent_unknown";

/** Metadata a refusal may carry; never content, native error text or absolute paths. */
type SovereignPromptRefusalDetails = {
  /** Registry slot id. */
  slot?: string;
  /** Registry path relative to the generation; names outside the registry are never echoed. */
  file?: string;
  generation?: string;
  bytes?: number;
  limit?: number;
  uid?: number;
  /** Octal permission bits. */
  mode?: string;
  /** Errno name, never the native message. */
  errno?: string;
};

export class SovereignPromptRefusal extends Error {
  readonly code: SovereignPromptRefusalCode;
  readonly details: Readonly<SovereignPromptRefusalDetails>;

  constructor(code: SovereignPromptRefusalCode, details: SovereignPromptRefusalDetails = {}) {
    super(`sovereign prompts refused: code=${code}${details.file ? ` file=${details.file}` : ""}`);
    this.name = "SovereignPromptRefusal";
    this.code = code;
    this.details = Object.freeze({ ...details });
  }

  toJSON() {
    return { code: this.code, ...this.details };
  }
}

type SovereignPromptFileReceipt = {
  path: string;
  slot: string;
  bytes: number;
  sha256: string;
  /** Whether this build renders the slot from the snapshot (§ 4.1). */
  converted: boolean;
};

type SovereignPromptSnapshotMetadata = {
  agentId: string;
  generation: string;
  setDigest: string;
  bytes: number;
  files: readonly SovereignPromptFileReceipt[];
};

export class SovereignPromptSnapshot {
  readonly agentId: string;
  readonly generation: string;
  readonly setDigest: string;
  readonly bytes: number;
  readonly files: readonly SovereignPromptFileReceipt[];
  // An empty optional file is the same as an absent one, so it has no body here.
  readonly #bodies: ReadonlyMap<string, string>;

  constructor(metadata: SovereignPromptSnapshotMetadata, bodies: ReadonlyMap<string, string>) {
    this.agentId = metadata.agentId;
    this.generation = metadata.generation;
    this.setDigest = metadata.setDigest;
    this.bytes = metadata.bytes;
    this.files = Object.freeze(metadata.files.map((file) => Object.freeze({ ...file })));
    this.#bodies = new Map(bodies);
    Object.freeze(this);
  }

  /** The decoded body of a non-empty registry file, for the renderer only. */
  body(file: string): string | undefined {
    return this.#bodies.get(file);
  }

  toJSON(): SovereignPromptSnapshotMetadata {
    return {
      agentId: this.agentId,
      generation: this.generation,
      setDigest: this.setDigest,
      bytes: this.bytes,
      files: this.files,
    };
  }

  [inspect.custom]() {
    return this.toJSON();
  }

  toString(): string {
    return `[sovereign prompts agent:${this.agentId} generation=${this.generation} set=sha256:${this.setDigest.slice(0, 12)}]`;
  }

  [Symbol.toPrimitive](): string {
    return this.toString();
  }
}

/** The § 5.3 refusal diagnostic: one line plus structured, content-free fields. */
export function describeSovereignPromptsRefused(agentId: string, refusal: SovereignPromptRefusal) {
  const { slot, file, generation } = refusal.details;
  const line =
    `[SOVEREIGN_PROMPTS_REFUSED] agent:${agentId} code=${refusal.code}` +
    (slot ? ` slot=${slot}` : "") +
    (file ? ` file=${file}` : "") +
    (generation ? ` generation=${generation}` : "");
  return { line, fields: { event: "sovereign_prompts.refused", agentId, ...refusal.toJSON() } };
}

/** The § 5.3 load diagnostic. */
export function describeSovereignPromptsLoaded(snapshot: SovereignPromptSnapshot) {
  const line =
    `[SOVEREIGN_PROMPTS_LOADED] agent:${snapshot.agentId} generation=${snapshot.generation} ` +
    `set=sha256:${snapshot.setDigest.slice(0, 12)} files=${snapshot.files.length} bytes=${snapshot.bytes}`;
  return { line, fields: { event: "sovereign_prompts.loaded", ...snapshot.toJSON() } };
}
