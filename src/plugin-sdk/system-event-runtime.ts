// System event queue helpers without the broad infra-runtime barrel.

import {
  enqueueSystemEvent as enqueueSystemEventInternal,
  peekSystemEventEntries,
  resetSystemEventsForTest,
} from "../infra/system-events.js";

type SystemEventOptions = Parameters<typeof enqueueSystemEventInternal>[1];

export function enqueueSystemEvent(text: string, options: SystemEventOptions): boolean {
  const {
    trusted: _trusted,
    forceSenderIsOwnerFalse: _forceSenderIsOwnerFalse,
    ...safeOptions
  } = options;
  return enqueueSystemEventInternal(text, safeOptions);
}

export { peekSystemEventEntries, resetSystemEventsForTest };
