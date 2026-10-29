// Process-wide activation latch for the subagent registry. Continuation custody
// recovery waits on it so the registry has hydrated child rows before continuation
// reads them.
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
  // which the registry read path merges regardless of activation. Callers still
  // observe the rejection on the returned promise.
  void activation.then(resolveRegistryActivation, resolveRegistryActivation);
  return activation;
}

/**
 * Settles once this process attempted registry activation. Continuation custody
 * recovery waits on it so the registry has hydrated child rows before
 * continuation reads them (RFC docs/design/continue-work-signal-v2.md §5.4.4).
 */
export function whenSubagentRegistryActivated(): Promise<void> {
  return registryActivation;
}
