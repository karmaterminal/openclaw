import type { ChannelIngressMonitorLifecycle } from "openclaw/plugin-sdk/channel-outbound";

export type SlackIngressTurnLifecycle = Omit<
  ChannelIngressMonitorLifecycle,
  "onAdoptionFinalizing"
> & {
  onSessionRouted?: (sessionKey: string) => Promise<void>;
  /** A logical duplicate awaits its existing owner before session routing. */
  onDispatchWaiting?: () => void;
  /** Protected work fills the reply queue: a paced retry that spends no retry budget. */
  onBackpressure?: () => Promise<void>;
};
