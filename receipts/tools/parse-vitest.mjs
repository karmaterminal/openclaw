// Parse a Vitest verbose log (CI in-flight log or local shard-runner log) into per-file counts.
// usage: node parse-vitest.mjs <log> <out.json> [project-label]
// - Counts only result lines that carry the project label, so nested Vitest runs inside tests
//   (their own footers and unlabeled result lines) never enter the totals.
// - Splits the log into slices at "[test] starting <config>" and keeps the last footer of each
//   slice (a nested run's footer can sit inside a slice; the slice's own footer is its last).
// - Collects "FAIL <project> <file> ..." summary lines, which also catch file/suite-level
//   failures that never print a per-test line.
import { readFileSync, writeFileSync } from "node:fs";

const [logPath, outPath, project = "extension-database-workers"] = process.argv.slice(2);
const raw = readFileSync(logPath, "utf8");
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const strip = (line) =>
  line.replace(/\x1b\[[0-9;]*[A-Za-z]/g, "").replace(/^\[shard:[^\]]*\] /, "");
const MARK = { "✓": "pass", "×": "fail", "↓": "skip" };
const resultRe = new RegExp(
  `^ +(✓|×|↓) +${esc(project)} +(\\S+?\\.test\\.[cm]?[jt]sx?)(?: > (.*))?$`,
  "s",
);
const failSummaryRe = new RegExp(
  `^ *FAIL +${esc(project)} +(\\S+?\\.test\\.[cm]?[jt]sx?)(?: > (.*)| \\[ .* \\])?$`,
  "s",
);
const files = new Map();
const fails = [];
const skips = [];
const failSummary = [];
const slices = [];
let slice = null;
const newSlice = (startLine) => {
  slice = { startLine, results: 0, files: new Set(), footer: { testFiles: null, tests: null } };
  slices.push(slice);
};
raw.split("\n").forEach((rawLine, index) => {
  const line = strip(rawLine);
  if (/^\[test\] starting /.test(line)) {
    newSlice(index + 1);
    return;
  }
  const m = resultRe.exec(line);
  if (m) {
    if (!slice) newSlice(null);
    const kind = MARK[m[1]];
    const file = m[2];
    const test = (m[3] ?? "").replace(/ \d+ms$/, "");
    const entry = files.get(file) ?? { pass: 0, fail: 0, skip: 0 };
    entry[kind] += 1;
    files.set(file, entry);
    slice.results += 1;
    slice.files.add(file);
    if (kind === "fail") fails.push({ file, test });
    if (kind === "skip") skips.push({ file, test });
    return;
  }
  const f = failSummaryRe.exec(line);
  if (f) {
    failSummary.push({ file: f[1], test: f[2] ?? "(file/suite level)" });
    return;
  }
  const footer = /^ +(Test Files|Tests) {2}(.*)$/.exec(line);
  if (footer && slice) {
    slice.footer[footer[1] === "Test Files" ? "testFiles" : "tests"] = footer[2].trim();
  }
});
const totals = { files: files.size, pass: 0, fail: 0, skip: 0 };
for (const e of files.values()) {
  totals.pass += e.pass;
  totals.fail += e.fail;
  totals.skip += e.skip;
}
totals.tests = totals.pass + totals.fail + totals.skip;
// Footer arithmetic: sum each slice's last "Tests" footer (passed/failed/skipped/todo).
const footerTotals = {
  passed: 0,
  failed: 0,
  skipped: 0,
  todo: 0,
  total: 0,
  files: 0,
  slicesWithFooter: 0,
};
for (const s of slices) {
  if (!s.footer.tests) continue;
  footerTotals.slicesWithFooter += 1;
  for (const [, n, k] of s.footer.tests.matchAll(/(\d+) (passed|failed|skipped|todo)/g)) {
    footerTotals[k] += Number(n);
  }
  const total = /\((\d+)\)/.exec(s.footer.tests);
  if (total) footerTotals.total += Number(total[1]);
  const fileTotal = s.footer.testFiles && /\((\d+)\)/.exec(s.footer.testFiles);
  if (fileTotal) footerTotals.files += Number(fileTotal[1]);
}
const failedFiles = [
  ...new Set([...fails.map((x) => x.file), ...failSummary.map((x) => x.file)]),
].sort();
const out = {
  log: logPath,
  project,
  totals,
  footerTotals,
  slices: slices.map((s) => ({ ...s, files: [...s.files].sort() })),
  failedFiles,
  fails,
  failSummary,
  skips,
  files: Object.fromEntries([...files].sort(([a], [b]) => a.localeCompare(b))),
};
writeFileSync(outPath, JSON.stringify(out, null, 2) + "\n");
console.log(
  JSON.stringify({
    totals,
    footerTotals,
    slices: slices.length,
    failedFiles,
    failSummaryCount: failSummary.length,
  }),
);
