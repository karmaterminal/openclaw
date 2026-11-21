// Compare parsed extension-database-workers runs: local candidate, local control, CI partials.
// usage: node compare.mjs <cand.parsed.json> <ctrl.parsed.json|-> <ci93.parsed.json> <ciRegate.parsed.json> <out.json>
// A CI partial's last slice was cut by SIGTERM, so only files of its completed slices are
// compared count-for-count; files of the cut slice are checked for presence only.
import { readFileSync, writeFileSync } from "node:fs";

const [candPath, ctrlPath, ci93Path, ciRegPath, outPath] = process.argv.slice(2);
const load = (p) => (p && p !== "-" ? JSON.parse(readFileSync(p, "utf8")) : null);
const cand = load(candPath);
const ctrl = load(ctrlPath);
const ci93 = load(ci93Path);
const ciReg = load(ciRegPath);

const completedFiles = (run) => {
  const done = new Set();
  for (const s of run.slices) if (s.footer.tests) for (const f of s.files) done.add(f);
  return done;
};
const sameCounts = (a, b) => a && b && a.pass === b.pass && a.fail === b.fail && a.skip === b.skip;

function countMatch(local, ci, label) {
  const done = completedFiles(ci);
  const ciFiles = Object.keys(ci.files);
  const missing = ciFiles.filter((f) => !local.files[f]);
  const differing = [];
  for (const f of done) {
    if (!sameCounts(local.files[f], ci.files[f])) {
      differing.push({ file: f, ci: ci.files[f], local: local.files[f] ?? null });
    }
  }
  const ciDoneTests = [...done].reduce(
    (n, f) => n + ci.files[f].pass + ci.files[f].fail + ci.files[f].skip,
    0,
  );
  const localOnDone = [...done].reduce(
    (n, f) =>
      n + (local.files[f] ? local.files[f].pass + local.files[f].fail + local.files[f].skip : 0),
    0,
  );
  return {
    label,
    ciTotals: ci.totals,
    ciCompletedSlices: ci.slices.filter((s) => s.footer.tests).length,
    ciCompletedFiles: done.size,
    ciCompletedTests: ciDoneTests,
    localTestsOnCiCompletedFiles: localOnDone,
    ciFilesMissingLocally: missing,
    completedFilesWithDifferentCounts: differing,
    localFilesNotInCiPartial: Object.keys(local.files).filter((f) => !ci.files[f]).length,
  };
}

const redRows = [];
const redFiles = new Set([...(cand?.failedFiles ?? []), ...(ctrl?.failedFiles ?? [])]);
for (const file of [...redFiles].sort()) {
  const testsAt = (run) =>
    run
      ? [
          ...new Set([
            ...run.fails.filter((x) => x.file === file).map((x) => x.test),
            ...run.failSummary.filter((x) => x.file === file).map((x) => x.test),
          ]),
        ]
      : null;
  redRows.push({
    file,
    cand: { counts: cand?.files[file] ?? null, failing: testsAt(cand) },
    ctrl: { counts: ctrl?.files[file] ?? null, failing: testsAt(ctrl) },
    ci93: { counts: ci93.files[file] ?? null, failing: testsAt(ci93) },
    ciRegate: { counts: ciReg.files[file] ?? null, failing: testsAt(ciReg) },
  });
}

let candVsCtrl = null;
if (cand && ctrl) {
  const onlyCand = Object.keys(cand.files)
    .filter((f) => !ctrl.files[f])
    .sort();
  const onlyCtrl = Object.keys(ctrl.files)
    .filter((f) => !cand.files[f])
    .sort();
  const differing = Object.keys(cand.files)
    .filter((f) => ctrl.files[f] && !sameCounts(cand.files[f], ctrl.files[f]))
    .sort()
    .map((f) => ({ file: f, cand: cand.files[f], ctrl: ctrl.files[f] }));
  candVsCtrl = {
    onlyCand: onlyCand.map((f) => ({ file: f, ...cand.files[f] })),
    onlyCtrl: onlyCtrl.map((f) => ({ file: f, ...ctrl.files[f] })),
    differing,
  };
}

const out = {
  totals: {
    cand: cand ? { ...cand.totals, slices: cand.slices.length, footer: cand.footerTotals } : null,
    ctrl: ctrl ? { ...ctrl.totals, slices: ctrl.slices.length, footer: ctrl.footerTotals } : null,
    ci93: { ...ci93.totals, slices: ci93.slices.length, footer: ci93.footerTotals },
    ciRegate: { ...ciReg.totals, slices: ciReg.slices.length, footer: ciReg.footerTotals },
  },
  countMatch: cand
    ? [
        countMatch(cand, ciReg, "cand vs CI re-gate 44917878785 @16541aa5 (same SHA)"),
        countMatch(cand, ci93, "cand vs CI 44871298969 @93a1e356"),
      ]
    : null,
  countMatchCtrl: ctrl
    ? countMatch(ctrl, ci93, "ctrl vs CI 44871298969 @93a1e356 (different tree)")
    : null,
  redRows,
  candVsCtrl,
};
writeFileSync(outPath, JSON.stringify(out, null, 2) + "\n");
console.log(JSON.stringify({ totals: out.totals, red: redRows.map((r) => r.file) }, null, 1));
for (const m of out.countMatch ?? []) {
  console.log(
    `${m.label}: ciCompletedFiles=${m.ciCompletedFiles} ciCompletedTests=${m.ciCompletedTests} localOnThem=${m.localTestsOnCiCompletedFiles} missing=${m.ciFilesMissingLocally.length} differing=${m.completedFilesWithDifferentCounts.length}`,
  );
}
