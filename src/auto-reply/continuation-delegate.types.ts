/**
 * Re-export shim — canonical types live at `./continuation/types.js`.
 *
 * The boolean-based `PendingContinuationDelegate` shape (with `silent?` /
 * `silentWake?`) has been replaced by the `mode`-based shape. This file
 * exists only for import path compatibility.
 */

export type {
  PendingContinuationDelegate,
  DelayedContinuationReservation,
  StagedPostCompactionDelegate,
  ContinuationRuntimeConfig,
  ContinueWorkRequest,
  ChainState,
  ContinuationSignal,
} from "./continuation/types.js";
