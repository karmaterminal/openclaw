// Process-wide activation latch for the subagent registry. Continuation custody
// recovery waits on it so upstream's restart recovery owns interrupted children
// before continuation reads their rows.
let resolveRegistryActivation: () => void = () => {};
const registryActivation = new Promise<void>((resolve) => {
  resolveRegistryActivation = resolve;
});

/** Runs one registry activation attempt and settles the latch however it ends. */
export function runSubagentRegistryActivation(activate: () => Promise<void>): Promise<void> {
  let activation: Promise<void>;
  try {
    activation = activate();
  } catch (error) {
    resolveRegistryActivation();
    throw error;
  }
  // Settle even when activation rejects: waiters then read persisted rows,
  // which the registry read path merges regardless of activation.
  return activation.finally(resolveRegistryActivation);
}

/**
 * Settles once this process attempted registry activation. Continuation custody
 * recovery waits on it so upstream's restart recovery owns interrupted
 * children before continuation reads their rows (RFC
 * docs/design/continue-work-signal-v2.md §5.4.4, crash-boundary table).
 */
export function whenSubagentRegistryActivated(): Promise<void> {
  return registryActivation;
}
