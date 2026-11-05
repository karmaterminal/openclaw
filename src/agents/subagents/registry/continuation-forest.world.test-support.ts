// The forest world the build, fire, oracle and trouble modules act on. ContinuationForest
// (continuation-forest.test-support.ts) implements it and calls those modules; they depend on this
// leaf contract rather than on the class, so the world and its verbs form no import cycle.
import type { cancelOwnedContinuationRecords } from "../../../auto-reply/continuation/session-reset.js";
import type {
  Adoption,
  AnnexElection,
  AnnexNode,
  AnnexShape,
  AttemptLogLine,
  Handover,
  Report,
} from "./continuation-forest.model.test-support.js";
import type { WorkMark } from "./continuation-forest.seams.test-support.js";

export interface ForestWorld {
  readonly stateDir: string;
  readonly storePath: string;
  shape: AnnexShape;
  t0: number;
  generation: number;
  childrenSettleOnReport: boolean;
  seq: number;
  readonly nodes: Map<string, AnnexNode>;
  readonly princes: AnnexNode[];
  readonly rooms: Set<string>;
  readonly elections: Map<string, AnnexElection>;
  readonly attempts: AttemptLogLine[];
  readonly attemptsByElection: Map<string, AttemptLogLine[]>;
  readonly bits: Map<string, 0 | 1>;
  readonly reports: Map<string, Report>;
  readonly stopped: Map<string, string>;
  readonly adoptions: Adoption[];
  readonly adoptionCounts: Map<string, number>;
  readonly adoptedBlocks: Array<{ sessionKey: string; text: string; at: number }>;
  readonly wakes: Array<{ sessionKey: string; deliveryIds: readonly string[] }>;
  readonly adoptedDeliveryIds: Set<string>;
  disposed: boolean;
  readonly spawns: Array<{ electionId: string; childRunId: string; at: number }>;
  readonly deliveredLines: Array<{ keys: string[]; from: string; at: number }>;
  readonly logLines: Array<{ subsystem: string; message: string; at: number }>;
  readonly handovers: Handover[];
  readonly downtimes: Array<{ from: number; to: number }>;
  readonly drops: Map<string, number>;
  readonly rows: Map<string, string>;
  readonly cancelReceipts: Array<Awaited<ReturnType<typeof cancelOwnedContinuationRecords>>>;
  readonly expectedRefusals: Map<string, string>;
  readonly failures: string[];
  readonly timings: Record<string, number>;
  readonly runners: Map<string, AnnexElection[]>;
  readonly providerTurns: Array<{ sessionKey: string; who: string; at: number }>;
  dying: { flowId: string; mark: WorkMark; died: () => void } | undefined;
  stopDeliveryRuntime: (() => Promise<void>) | undefined;
  electionOf(node: AnnexNode): AnnexElection;
  runIdOf(election: AnnexElection): string;
  logAttempt(electionId: string, kind: AttemptLogLine["kind"]): void;
  time(name: string, startedAt: number): void;
  childReportsFor(node: AnnexNode): Set<string>;
  addRoom(sessionKey: string): void;
  recordDrops(sessionKeys: Iterable<string>): void;
  build(shape: AnnexShape): Promise<void>;
  startDeliveryRuntime(): void;
  gate(point: string): Promise<void>;
  sleep(ms: number): Promise<void>;
  run<T>(work: () => Promise<T>): Promise<T>;
  settle(): Promise<void>;
  advance(ms: number, stepMs?: number): Promise<void>;
  whileTimePasses<T>(work: Promise<T>, what: string, maxMs?: number): Promise<T>;
}
