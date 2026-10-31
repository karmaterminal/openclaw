// Jump-12 live-shape rehearsal (karmaterminal/openclaw-bootstrap#1727). Not a repository test
// shard: it runs only the rehearsal file, under the repository's own scoped-config factory.
import { createScopedVitestConfig } from "../test/vitest/vitest.scoped-config.ts";

export default createScopedVitestConfig(["j12-rehearsal/*.rehearsal.ts"], {
  dir: "j12-rehearsal",
  name: "j12-rehearsal",
  pool: "forks",
  excludeUnitFastTests: false,
});
