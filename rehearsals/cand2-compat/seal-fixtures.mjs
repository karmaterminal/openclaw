// CAND2 backward-compat rehearsal (karmaterminal/openclaw#1415): run after the write phase's
// process has exited. SQLite checkpoints and seals its files when the writer shuts down, so the
// bytes a stopped CAND2 gateway leaves on disk are the post-exit bytes; readers compare their copy
// against these hashes.
//
//   CAND2_COMPAT_ROOT=<root> node rehearsals/cand2-compat/seal-fixtures.mjs
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const root = process.env.CAND2_COMPAT_ROOT;
if (!root || !path.isAbsolute(root)) {
  throw new Error("Set CAND2_COMPAT_ROOT to the lane's absolute temp root");
}
const manifestPath = path.join(root, "fixtures", "manifest.json");
const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));

function hashTree(dir) {
  const out = {};
  const walk = (current) => {
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

const dirs = new Set();
const collect = (value) => {
  if (!value || typeof value !== "object") {
    return;
  }
  for (const [key, child] of Object.entries(value)) {
    if ((key === "stateDir" || key === "controlStateDir") && typeof child === "string") {
      dirs.add(child);
    } else {
      collect(child);
    }
  }
};
collect(manifest.surfaces);
manifest.sealedAt = new Date().toISOString();
manifest.sealed = Object.fromEntries([...dirs].toSorted().map((dir) => [dir, hashTree(dir)]));
fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
for (const [dir, files] of Object.entries(manifest.sealed)) {
  console.log(`${path.relative(root, dir)}\t${Object.keys(files).join(",") || "(empty)"}`);
}
