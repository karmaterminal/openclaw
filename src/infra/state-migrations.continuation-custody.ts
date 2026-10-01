// Continuation custody import wiring for the core legacy state migration graph
// (RFC docs/design/continue-work-signal-v2.md §5.4.5). Kept beside
// state-migrations.doctor.ts so the graph only names detection, preview and step.
import {
  detectContinuationTaskFlowCustodyImport,
  type ContinuationTaskFlowImportDetection,
} from "../auto-reply/continuation/custody/legacy-taskflow-migration-source.js";
import { resolveOpenClawStateSqlitePath } from "../state/openclaw-state-db.paths.js";
import type { LegacyStateMigrationStep } from "./state-migrations.types.js";

function detectContinuationCustodyMigration(
  params: { artifactPreservingReadOnly?: boolean },
  stateDir: string,
  env: NodeJS.ProcessEnv,
): ContinuationTaskFlowImportDetection {
  return detectContinuationTaskFlowCustodyImport({
    env: { ...env, OPENCLAW_STATE_DIR: stateDir },
    artifactPreservingReadOnly: params.artifactPreservingReadOnly,
  });
}

function continuationCustodyPreview(
  detection: ContinuationTaskFlowImportDetection,
): readonly [hasLegacy: boolean, message: string] {
  const sources = detection.pendingSources === 1 ? "source" : "sources";
  return [
    detection.hasLegacy,
    `- Continuation custody: ${detection.pendingSources} legacy TaskFlow ${sources} → continuation custody store`,
  ];
}

/**
 * The import step exists only when detection found legacy work, like the
 * other detector-owned steps whose absence leaves the ordered graph unchanged.
 * It is not in the unresolved blocked layout: when detection itself is blocked,
 * nothing is known about legacy rows, and they stay in place for the next run.
 * Startup runs it too (it is not Doctor-scoped), and it runs on the file
 * detection fast path because its evidence is database rows, not files.
 */
function buildContinuationCustodySteps(
  detection: ContinuationTaskFlowImportDetection | undefined,
  params: { env: NodeJS.ProcessEnv; stateDir: string; now: () => number },
): LegacyStateMigrationStep[] {
  if (detection?.hasLegacy !== true) {
    return [];
  }
  const env = { ...params.env, OPENCLAW_STATE_DIR: params.stateDir };
  // The import reads and writes only the shared state database (flow_runs,
  // continuation_records, the session queue and receipts) plus payload files.
  const stateDatabase = { kind: "sqlite" as const, path: resolveOpenClawStateSqlitePath(env) };
  return [
    {
      id: "continuation-taskflow-custody-import",
      phase: "final",
      source: [stateDatabase],
      target: [stateDatabase],
      requiredness: "required",
      reversibility: "checkpoint-required",
      collectNotices: true,
      runWithoutFileDetection: true,
      run: async () => {
        const { migrateContinuationTaskFlowCustody } =
          await import("../auto-reply/continuation/custody/legacy-taskflow-import.js");
        return migrateContinuationTaskFlowCustody({ env, now: params.now });
      },
    },
  ];
}

/** The graph's only handle on continuation custody: detection, preview and step. */
export const continuationCustodyMigration = {
  detect: detectContinuationCustodyMigration,
  preview: continuationCustodyPreview,
  steps: buildContinuationCustodySteps,
} as const;
