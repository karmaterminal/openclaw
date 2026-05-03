import { randomBytes, randomInt, randomUUID } from "node:crypto";
//#region node_modules/uuid/dist-node/stringify.js
const byteToHex = [];
for (let i = 0; i < 256; ++i) byteToHex.push((i + 256).toString(16).slice(1));
function unsafeStringify(arr, offset = 0) {
	return (byteToHex[arr[offset + 0]] + byteToHex[arr[offset + 1]] + byteToHex[arr[offset + 2]] + byteToHex[arr[offset + 3]] + "-" + byteToHex[arr[offset + 4]] + byteToHex[arr[offset + 5]] + "-" + byteToHex[arr[offset + 6]] + byteToHex[arr[offset + 7]] + "-" + byteToHex[arr[offset + 8]] + byteToHex[arr[offset + 9]] + "-" + byteToHex[arr[offset + 10]] + byteToHex[arr[offset + 11]] + byteToHex[arr[offset + 12]] + byteToHex[arr[offset + 13]] + byteToHex[arr[offset + 14]] + byteToHex[arr[offset + 15]]).toLowerCase();
}
//#endregion
//#region node_modules/uuid/dist-node/rng.js
const rnds8 = new Uint8Array(16);
function rng() {
	return crypto.getRandomValues(rnds8);
}
//#endregion
//#region node_modules/uuid/dist-node/v7.js
const _state = {};
function v7(options, buf, offset) {
	let bytes;
	if (options) bytes = v7Bytes(options.random ?? options.rng?.() ?? rng(), options.msecs, options.seq, buf, offset);
	else {
		const now = Date.now();
		const rnds = rng();
		updateV7State(_state, now, rnds);
		bytes = v7Bytes(rnds, _state.msecs, _state.seq, buf, offset);
	}
	return buf ?? unsafeStringify(bytes);
}
function updateV7State(state, now, rnds) {
	state.msecs ??= -Infinity;
	state.seq ??= 0;
	if (now > state.msecs) {
		state.seq = rnds[6] << 23 | rnds[7] << 16 | rnds[8] << 8 | rnds[9];
		state.msecs = now;
	} else {
		state.seq = state.seq + 1 | 0;
		if (state.seq === 0) state.msecs++;
	}
	return state;
}
function v7Bytes(rnds, msecs, seq, buf, offset = 0) {
	if (rnds.length < 16) throw new Error("Random bytes length must be >= 16");
	if (!buf) {
		buf = new Uint8Array(16);
		offset = 0;
	} else if (offset < 0 || offset + 16 > buf.length) throw new RangeError(`UUID byte range ${offset}:${offset + 15} is out of buffer bounds`);
	msecs ??= Date.now();
	seq ??= rnds[6] * 127 << 24 | rnds[7] << 16 | rnds[8] << 8 | rnds[9];
	buf[offset++] = msecs / 1099511627776 & 255;
	buf[offset++] = msecs / 4294967296 & 255;
	buf[offset++] = msecs / 16777216 & 255;
	buf[offset++] = msecs / 65536 & 255;
	buf[offset++] = msecs / 256 & 255;
	buf[offset++] = msecs & 255;
	buf[offset++] = 112 | seq >>> 28 & 15;
	buf[offset++] = seq >>> 20 & 255;
	buf[offset++] = 128 | seq >>> 14 & 63;
	buf[offset++] = seq >>> 6 & 255;
	buf[offset++] = seq << 2 & 255 | rnds[10] & 3;
	buf[offset++] = rnds[11];
	buf[offset++] = rnds[12];
	buf[offset++] = rnds[13];
	buf[offset++] = rnds[14];
	buf[offset++] = rnds[15];
	return buf;
}
//#endregion
//#region src/infra/secure-random.ts
function generateSecureUuid() {
	return randomUUID();
}
/**
* Returns a UUIDv7 (RFC 9562) — time-ordered 128-bit identifier whose
* first 48 bits are the unix-milliseconds timestamp at mint time. Used
* for `SessionEntry.continuationChainId`: chain.id is minted on the 0->1
* transition of `continuationChainCount` and stays stable for the lifetime of
* the chain, so journal greps + sort-by-id give chronological order without a
* separate timestamp lookup.
*
* Why v7 and not v4: lexicographic ordering preserved across mints,
* downstream OTEL collectors (Jaeger/Tempo) parse UUID-shape natively,
* and `uuid@14` is already a direct dependency.
*/
function generateChainId() {
	return v7();
}
function generateSecureToken(bytes = 16) {
	return randomBytes(bytes).toString("base64url");
}
function generateSecureHex(bytes = 16) {
	return randomBytes(bytes).toString("hex");
}
/** Returns a cryptographically secure fraction in the range [0, 1). */
function generateSecureFraction() {
	return randomBytes(4).readUInt32BE(0) / 4294967296;
}
function generateSecureInt(a, b) {
	return typeof b === "number" ? randomInt(a, b) : randomInt(a);
}
//#endregion
export { generateSecureToken as a, generateSecureInt as i, generateSecureFraction as n, generateSecureUuid as o, generateSecureHex as r, generateChainId as t };
