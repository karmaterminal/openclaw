// Focused continuation runtime controls for bundled plugin integration tests.

export {
  createContinueWorkTool,
  type ContinueWorkRequest,
} from "../agents/tools/continue-work-tool.js";
// Custody inspection and a simulated Gateway restart: drop the hot-path
// projection, then hydrate it from committed records as boot does.
export { resetContinuationCustodyProjection } from "../auto-reply/continuation/custody/custody-projection.js";
export {
  hydrateContinuationCustody,
  listContinuationRecords,
} from "../auto-reply/continuation/custody/custody-store.js";
export {
  cancelPendingDelegates,
  consumePendingDelegates,
} from "../auto-reply/continuation/delegate-store.js";
export { resetContinuationCustodyImportGateForTests } from "../auto-reply/continuation/custody-import-gate.js";
export { resetContinueDelegateTurnAdmissionForTests } from "../auto-reply/continuation/delegate-turn-admission.js";
export type { ContinuationRuntimeConfig } from "../auto-reply/continuation/types.js";
export { executePendingContinuationWork } from "../auto-reply/continuation/work-dispatch-execution.js";
export {
  classifyContinuationWorkReason,
  resetContinuationWorkDispatchForTests,
  scheduleContinuationWorkBatch,
} from "../auto-reply/continuation/work-dispatch.js";
export { decodeWorkState } from "../auto-reply/continuation/work-flow-state.js";
export { consumePendingWork } from "../auto-reply/continuation/work-store.js";
export {
  emitContinuationDelegateFireSpan,
  emitContinuationDelegateSpan,
  emitContinuationWorkFireSpan,
  emitContinuationWorkSpan,
} from "../infra/continuation-tracer.js";
