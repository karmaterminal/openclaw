// Jump-12 rehearsal U12 refusal probe (karmaterminal/openclaw-bootstrap#1727); untracked, temporary.
import { createScopedVitestConfig } from "../test/vitest/vitest.scoped-config.ts";

export default createScopedVitestConfig(["j12-u12-refusal/*.probe.ts"], {
  dir: "j12-u12-refusal",
  name: "j12-u12-refusal",
  pool: "forks",
  excludeUnitFastTests: false,
});
