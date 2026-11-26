// Synthetic sovereign prompt generations for Codex route tests (openclaw#1321). Fixture prose
// only; the sentinel shows where a body travels and proves none reaches an error or a log.
import { createHash, randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

export const SENTINEL = `codex-sovereign-sentinel-${randomUUID()}`;
export const GENERATION = "20261118T120000Z-0123456789ab";
export const STOCK_IDENTITY = "You are a personal assistant running inside OpenClaw.";

export const fixtureBody = (name: string) =>
  `${SENTINEL} Synthetic fixture prose for ${name}. ${SENTINEL}`;

export const SOVEREIGN_BODIES: Readonly<Record<string, string>> = {
  "identity-section.md": fixtureBody("identity"),
  "execution-section.md": fixtureBody("execution"),
  "runtime-context-section.md": fixtureBody("runtime-context"),
  "tool-section.md": fixtureBody("tool"),
  "safety-section.md": fixtureBody("safety"),
};

const sha256 = (data: string) => createHash("sha256").update(data).digest("hex");

/** One sealed generation at the agent's default sovereign root (loader design § 3.3). */
export function writeSovereignGeneration(
  agentDir: string,
  agentId: string,
  bodies: Readonly<Record<string, string>> = SOVEREIGN_BODIES,
) {
  const root = path.join(agentDir, "sovereign", "systemprompts");
  const dir = path.join(root, "generations", GENERATION);
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  const files = Object.entries(bodies)
    .map(([file, content]) => {
      fs.writeFileSync(path.join(dir, file), content, { mode: 0o600 });
      return { path: file, bytes: Buffer.byteLength(content), sha256: sha256(content) };
    })
    .toSorted((a, b) => (a.path < b.path ? -1 : 1));
  const manifest = {
    schema: "openclaw.sovereign-prompts/1",
    agentId,
    generation: GENERATION,
    source: {
      repo: "karmaterminal/fixture",
      commit: "0123456789ab".padEnd(40, "c"),
      path: "sovereign/systemprompts",
    },
    files,
    // RFC 8785 JSON of `{bytes, path, sha256}` sorted by path, as the loader recomputes it.
    setDigest: sha256(
      JSON.stringify(
        files.map(({ bytes, path: file, sha256: digest }) => ({
          bytes,
          path: file,
          sha256: digest,
        })),
      ),
    ),
  };
  fs.writeFileSync(path.join(dir, "MANIFEST.json"), JSON.stringify(manifest), { mode: 0o600 });
  fs.writeFileSync(path.join(root, "CURRENT"), `${GENERATION}\n`, { mode: 0o600 });
  return { setDigest: manifest.setDigest };
}
