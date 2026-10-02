// Security: never re-export the RAW `infra/system-events` producers, which honor
// `trusted: true`. Every SDK subpath goes through the `plugins/runtime/system-events`
// facade, which forces `trusted: false` and strips ack/trace fields a plugin must not inject.
export {
  consumeSelectedSystemEventEntriesFromSdk as consumeSelectedSystemEventEntries,
  drainSystemEventEntriesFromSdk as drainSystemEventEntries,
  drainSystemEventsFromSdk as drainSystemEvents,
  enqueueRoutedSystemEvent,
  enqueueSystemEventFromSdk as enqueueSystemEvent,
  enqueueSystemEventEntryFromSdk as enqueueSystemEventEntry,
  hasSystemEventsFromSdk as hasSystemEvents,
  isSystemEventContextChangedFromSdk as isSystemEventContextChanged,
  peekSystemEventEntriesFromSdk as peekSystemEventEntries,
  peekSystemEventsFromSdk as peekSystemEvents,
  resolveSystemEventDeliveryContext,
  type SystemEvent,
} from "../plugins/runtime/system-events.js";
export { resolveMainSessionKeyFromConfig } from "../config/sessions/main-session.runtime.js";
