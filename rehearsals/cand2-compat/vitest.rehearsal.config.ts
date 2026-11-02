// CAND2 backward-compat rehearsal (karmaterminal/openclaw#1415). Not a repository test shard: it
// runs only the lane's rehearsal files, under the repository's own scoped-config factory.
// CAND2_COMPAT_PHASE selects write.rehearsal.ts (CAND2) or read.rehearsal.ts (any reader).
import { createScopedVitestConfig } from "../../test/vitest/vitest.scoped-config.ts";

const phase = process.env.CAND2_COMPAT_PHASE === "read" ? "read" : "write";

export default createScopedVitestConfig([`rehearsals/cand2-compat/${phase}.rehearsal.ts`], {
  dir: "rehearsals/cand2-compat",
  name: "cand2-compat-rehearsal",
  pool: "forks",
  excludeUnitFastTests: false,
});
