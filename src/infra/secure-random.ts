import { randomBytes, randomInt, randomUUID } from "node:crypto";

export function generateSecureUuid(): string {
  return randomUUID();
}

/**
 * Returns a UUIDv7 (RFC 9562) — time-ordered 128-bit identifier whose
 * first 48 bits are the unix-milliseconds timestamp at mint time. Used
 * for `SessionEntry.continuationChainId`: chain.id is minted on the 0->1
 * transition of `continuationChainCount` and stays stable for the lifetime of
 * the chain, so journal greps + sort-by-id give chronological order without a
 * separate timestamp lookup. Downstream OTEL collectors (Jaeger/Tempo) parse
 * UUID-shape natively.
 *
 * This function mirrors `v7()` from the `uuid` npm package, implemented inline
 * to avoid adding a new direct dependency. If `uuid` becomes a direct dependency
 * via other feature work, this can be replaced with `import { v7 as uuidV7 } from "uuid"`
 * and `return uuidV7()`. If node:crypto adopts RFC 9562 v7 in a future Node release,
 * this can be replaced with the stdlib call. Reference: RFC 9562 §5.7.
 */
export function generateChainId(): string {
  // RFC 9562 §5.7: 48-bit unix_ts_ms + 4-bit version + 12-bit rand_a + 2-bit variant + 62-bit rand_b
  const bytes = randomBytes(16);
  const ms = BigInt(Date.now());
  bytes[0] = Number((ms >> 40n) & 0xffn);
  bytes[1] = Number((ms >> 32n) & 0xffn);
  bytes[2] = Number((ms >> 24n) & 0xffn);
  bytes[3] = Number((ms >> 16n) & 0xffn);
  bytes[4] = Number((ms >> 8n) & 0xffn);
  bytes[5] = Number(ms & 0xffn);
  bytes[6] = (bytes[6] & 0x0f) | 0x70; // version 7 in top nibble of byte 6
  bytes[8] = (bytes[8] & 0x3f) | 0x80; // variant 10xx in top 2 bits of byte 8
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

export function generateSecureToken(bytes = 16): string {
  return randomBytes(bytes).toString("base64url");
}

export function generateSecureHex(bytes = 16): string {
  return randomBytes(bytes).toString("hex");
}

/** Returns a cryptographically secure fraction in the range [0, 1). */
export function generateSecureFraction(): number {
  return randomBytes(4).readUInt32BE(0) / 0x1_0000_0000;
}

export function generateSecureInt(maxExclusive: number): number;
export function generateSecureInt(minInclusive: number, maxExclusive: number): number;
export function generateSecureInt(a: number, b?: number): number {
  return typeof b === "number" ? randomInt(a, b) : randomInt(a);
}
