import { type DeliveryContext } from "../utils/delivery-context.js";
export type SystemEvent = {
    text: string;
    ts: number;
    contextKey?: string | null;
    deliveryContext?: DeliveryContext;
};
type SystemEventOptions = {
    sessionKey: string;
    contextKey?: string | null;
    deliveryContext?: DeliveryContext;
};
export declare function isSystemEventContextChanged(sessionKey: string, contextKey?: string | null): boolean;
export declare function enqueueSystemEvent(text: string, options: SystemEventOptions): boolean;
export declare function drainSystemEventEntries(sessionKey: string): SystemEvent[];
export declare function drainSystemEvents(sessionKey: string): string[];
/**
 * Remove system events matching a predicate without draining the entire queue.
 * Returns the removed events; non-matching events stay queued.
 */
export declare function removeSystemEvents(sessionKey: string, predicate: (event: SystemEvent) => boolean): SystemEvent[];
export declare function peekSystemEventEntries(sessionKey: string): SystemEvent[];
export declare function peekSystemEvents(sessionKey: string): string[];
export declare function hasSystemEvents(sessionKey: string): boolean;
export declare function resolveSystemEventDeliveryContext(events: readonly SystemEvent[]): DeliveryContext | undefined;
export declare function resetSystemEventsForTest(): void;

