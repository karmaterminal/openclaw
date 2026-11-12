import { createHash } from "node:crypto";
import { appendCurrentInboundContext } from "../../../agents/embedded-agent-runner/run/runtime-context-prompt.js";
import { runAgentHarnessBeforeMessageWriteHook } from "../../../agents/harness/hook-helpers.js";
import { compareChannelAdmissionParticipants } from "../../../channels/message-access/admission-evidence.js";
import { racePromiseWithAbortSignal } from "../../../infra/abort-signal.js";
import { PluginInstanceUnavailableError } from "../../../plugins/plugin-instance-error.js";
import {
  getGatewayRestartDrainSignal,
  isGatewayRestartDrainError,
  isGatewayRestartDraining,
  runWithGatewayDetachedWorkContinuation,
} from "../../../process/gateway-work-admission.js";
import { defaultRuntime } from "../../../runtime.js";
import type { ReplyOperation } from "../../../sessions/session-controller.contracts.js";
import { deferSessionControllerClaimBeforeExecution } from "../../../sessions/session-controller.mailbox-claim.js";
import { isSessionControllerSourceQueued } from "../../../sessions/session-controller.mailbox-source.js";
import {
  detachSessionControllerSources,
  getExistingSessionControllerMailbox,
  releaseSessionControllerClaim,
  trackSessionControllerSourceWork,
  type SessionControllerMailbox,
  type SessionControllerMailboxClaim,
} from "../../../sessions/session-controller.mailbox.js";
import { runWithSessionControllerCleanup } from "../../../sessions/session-controller.owner-context.js";
import {
  getSessionControllerEntryForOperation,
  type SessionControllerEntry,
} from "../../../sessions/session-controller.state.js";
import { createUserTurnTranscriptRecorder } from "../../../sessions/user-turn-transcript.js";
import { AgentDatabaseExecutionAdmissionClosedError } from "../../../state/agent-database-admission-error.js";
import { buildCollectPrompt, previewQueueSummaryPrompt } from "../../../utils/queue-helpers.js";
import { attachAmbientOverflowContext } from "./ambient-context.js";
import {
  collectCurrentInboundContext,
  collectRuntimeMetadata,
  resolveFollowupReplyDeliveryKey,
  isRoomAggregateBatch,
  resolveFollowupDeliveryStorageKey,
  resolveRoomAggregateExecution,
} from "./delivery-context.js";
import { runOutsideAdmittedGenerationScopes } from "./drain-admission-scope.js";
import {
  buildCollectTranscriptInput,
  collectQueuedPromptMedia,
  createAggregateCancellation,
  createCollectUserTurnTranscriptRecorder,
  renderCollectItem,
  resolveAggregateOwner,
  resolveCollectSenderLabel,
  resolveFollowupTranscriptTarget,
  resolveOriginRoutingMetadata,
} from "./envelope.js";
import {
  admitFollowupRunLifecycle,
  completeFollowupRunLifecycle,
  isFollowupRunAdopted,
  retireFollowupRunCancellation,
  updateFollowupRetryHeartbeats,
} from "./lifecycle.js";
import { deferRoomAggregateForUnauditedPlugins } from "./room-aggregate-plugin-gate.js";
import { followupQueueSources, followupSourceRunners } from "./state.js";
import { isFollowupRunAborted, type FollowupRun } from "./types.js";

type AdmissionSessionRebind = { from: string; to: string };

/** The queued input owns this fact through preparation retries and consumes it with its turn. */
export function handoffCompletedSourceReply(operation: ReplyOperation, source: FollowupRun): void {
  const mailbox = getSessionControllerEntryForOperation(operation).mailbox;
  const next = mailbox?.entries.find(
    (input) =>
      !input.claim &&
      isSessionControllerSourceQueued(input) &&
      !input.retirementRequested &&
      !input.abortSignal.aborted,
  )?.source;
  if (
    operation.result ||
    operation.abortSignal.aborted ||
    !next ||
    (next.admissionSessionId ?? next.run.sessionId) !== operation.sessionId ||
    next.currentInboundEventKind === "room_event" ||
    next.run.sourceReplyDeliveryMode !== "message_tool_only" ||
    next.originatingChatId !== source.originatingChatId ||
    resolveFollowupReplyDeliveryKey(next) !== resolveFollowupReplyDeliveryKey(source)
  ) {
    return;
  }
  next.currentInboundContext = appendCurrentInboundContext(next.currentInboundContext, [
    {
      kind: "runtime-instruction",
      text: "The immediately preceding turn already delivered its final user-visible reply via the message tool. Treat the current queued content as a fresh request; do not replay that answer merely to finish the preceding turn. Answer the new request normally, including explicit requests to repeat or discuss the prior reply.",
    },
  ]);
}

function consumeQueueSummaryDelivery(
  queue: Pick<SessionControllerMailbox, "summaryEntries" | "summaryElisions" | "droppedCount">,
  delivery: { droppedCount: number; sources: readonly FollowupRun[] },
  settlement: "abandoned" | "cancelled" | "retained" = "abandoned",
): void {
  let consumedCount = delivery.sources.length === 0 ? delivery.droppedCount : 0;
  for (const source of delivery.sources) {
    const sourceIndex = queue.summaryEntries.findIndex((summary) => summary.source === source);
    const entry =
      sourceIndex < 0
        ? queue.summaryElisions.find(
            (candidate) =>
              candidate.entries.some((summary) => summary.source === source) ||
              candidate.sourceRefs.has(source),
          )
        : undefined;
    if (sourceIndex >= 0 || entry) {
      const index = entry
        ? entry.entries.findIndex(
            (summary) => summary.source === (entry.sourceRefs.get(source) ?? source),
          )
        : sourceIndex;
      if (index >= 0) {
        (entry?.entries ?? queue.summaryEntries).splice(index, 1);
      }
      consumedCount += 1;
      if (entry) {
        for (const [original, compact] of entry.sourceRefs) {
          if (compact === source || original === source) {
            entry.sourceRefs.delete(original);
          }
        }
        if (entry.entries.length === 0) {
          queue.summaryElisions.splice(queue.summaryElisions.indexOf(entry), 1);
        }
      }
    }
    if (settlement !== "retained") {
      completeFollowupRunLifecycle(source, settlement === "cancelled" ? "cancelled" : undefined);
    }
  }
  queue.droppedCount = Math.max(0, queue.droppedCount - consumedCount);
}

// Overflow retries must reuse one transcript identity, while the same provider-local
// message ID on a different channel route remains an independent user turn.
function buildOverflowTranscriptIdempotencyKey(source: FollowupRun, prompt: string): string {
  const promptHash = createHash("sha256").update(prompt).digest("hex");
  const routeHash = createHash("sha256")
    .update(resolveFollowupReplyDeliveryKey(source))
    .digest("hex");
  return `followup-overflow:${source.run.sessionId}:${routeHash}:${source.messageId ?? source.enqueuedAt}:${promptHash}`;
}

function resolveCollectedRun(
  items: readonly FollowupRun[],
  source: FollowupRun["run"],
  crossSender: boolean,
) {
  if (crossSender) {
    return resolveRoomAggregateExecution(source);
  }
  const participantComparison = compareChannelAdmissionParticipants(
    items.map((item) => item.channelAdmissionEvidence),
  );
  if (
    participantComparison === "same" ||
    !items.every(
      (item) => compareChannelAdmissionParticipants([item.channelAdmissionEvidence]) === "same",
    )
  ) {
    return source;
  }
  // Mixed or unverifiable people share no downstream sender authority. The
  // opaque admission aggregate records unknown identity at the run boundary.
  return {
    ...source,
    senderId: undefined,
    senderName: undefined,
    senderUsername: undefined,
    senderE164: undefined,
    senderIsOwner: false,
    traceAuthorized: false,
    ownerNumbers: [],
  };
}

/** Executes an already-selected claim. This adapter never chooses a successor. */
async function executeClaim(
  claim: SessionControllerMailboxClaim,
  execute: (run: FollowupRun) => Promise<void>,
  admissionSessionRebind?: AdmissionSessionRebind,
): Promise<void> {
  const queue = claim.mailbox;
  const generation = queue.abortController;
  const sources = [...claim.sources];
  const source = sources.at(-1);
  if (!source) {
    releaseSessionControllerClaim(claim);
    return;
  }
  const cancellation = createAggregateCancellation(sources);
  const aggregateOwner = resolveAggregateOwner(sources);
  const adopt = async () => {
    // Accepted collection consumes every source even when an ingress ack fails.
    detachSessionControllerSources(sources);
    const admissions = sources.map((item) => admitFollowupRunLifecycle(item));
    try {
      await Promise.all(admissions);
    } catch (error) {
      // Retry eligibility depends on every source's final adoption outcome.
      await Promise.allSettled(admissions);
      throw error;
    }
    cancellation.admit();
    for (const item of sources) {
      if (item !== aggregateOwner) {
        retireFollowupRunCancellation(item);
      }
    }
  };
  for (const item of sources) {
    attachAmbientOverflowContext(item);
    if (claim.summary) {
      queue.activeSummarySources.add(item);
    }
  }
  // A summary prompt shows only the newest cap lines; source context pairs with those lines.
  const summarizedSources = queue.cap > 0 ? sources.slice(-queue.cap) : sources;
  // Frond (karmaterminal, #1415): differing per-sender identities only batch through the room
  // aggregate key; that turn runs as the senderless room baseline, never as any one member, so
  // each summary line names its sender.
  const mixedSenders =
    sources.length > 1 && new Set(sources.map(resolveFollowupDeliveryStorageKey)).size > 1;
  const crossSender = mixedSenders && isRoomAggregateBatch(sources);
  // Frond (karmaterminal, #1415): any other mixed claim breaks the selection invariant. It fails
  // closed before execution, refused like a pre-execution rejection: each member retries alone,
  // or is released unadopted when the claim can no longer be deferred.
  const refuseMixedClaim = mixedSenders && !crossSender;
  const readSummaryLine = (item: FollowupRun) => {
    const entry = queue.summaryEntries.find((candidate) => candidate.source === item);
    if (entry) {
      return entry.line;
    }
    for (const elision of queue.summaryElisions) {
      const entry = elision.entries.find((candidate) => candidate.source === item);
      if (entry) {
        return entry.line;
      }
    }
    return item.summaryLine ?? item.prompt;
  };
  const summaryLines = summarizedSources.map((item) => {
    const line = readSummaryLine(item);
    const sender = crossSender ? resolveCollectSenderLabel(item) : undefined;
    return sender ? `(from ${sender}) ${line}` : line;
  });
  const prompt = claim.summary
    ? (previewQueueSummaryPrompt({ droppedCount: sources.length, summaryLines }) ?? "")
    : buildCollectPrompt({
        title: "[Queued messages while agent was busy]",
        items: sources,
        renderItem: renderCollectItem,
      });
  const settleSources = async (outcome?: "consumed") => {
    for (const item of sources) {
      completeFollowupRunLifecycle(item, outcome);
    }
    await Promise.all(sources.flatMap((item) => item.controllerInput?.custody.settling ?? []));
  };
  let run = source;
  if (!refuseMixedClaim && (claim.summary || sources.length > 1)) {
    const execution = resolveCollectedRun(sources, source.run, crossSender);
    // Frond (karmaterminal, #1415): the transcript turn records the authority the turn runs as.
    const recorder = claim.summary
      ? createUserTurnTranscriptRecorder({
          input: {
            text: prompt,
            idempotencyKey: buildOverflowTranscriptIdempotencyKey(source, prompt),
            senderIsOwner: execution.senderIsOwner,
            requesterOrigin: execution.requesterOrigin,
            provenance: source.run.inputProvenance,
          },
          pendingInputSources: sources.flatMap((item) => item.userTurnTranscriptRecorder ?? []),
          target: () => resolveFollowupTranscriptTarget(source),
          beforeMessageWrite: runAgentHarnessBeforeMessageWriteHook,
          errorContext: "mailbox overflow transcript",
        })
      : createCollectUserTurnTranscriptRecorder(sources, execution);
    run = {
      ...source,
      ...resolveOriginRoutingMetadata(sources),
      ...collectRuntimeMetadata(sources, cancellation.signal),
      ...collectQueuedPromptMedia(sources),
      ...(claim.summary
        ? { currentInboundContext: collectCurrentInboundContext(summarizedSources) }
        : {}),
      prompt,
      transcriptPrompt: claim.summary ? prompt : buildCollectTranscriptInput(sources).text,
      userTurnTranscriptRecorder: recorder,
      run: execution,
      // Frond (karmaterminal, #1415): the room baseline drops an owner memory audience too.
      memoryAudienceSenderIsOwner: crossSender ? undefined : source.memoryAudienceSenderIsOwner,
      controllerInput: source.controllerInput,
      controllerClaim: claim,
      turnAdoptionLifecycle: {
        admission: "cancel-only",
        cronCreatorAuthorityUnavailable: sources.find(
          (item) => item.turnAdoptionLifecycle?.cronCreatorAuthorityUnavailable,
        )?.turnAdoptionLifecycle?.cronCreatorAuthorityUnavailable,
        onAdopted: adopt,
        onAbandoned: () => settleSources(),
        onSettled: () => settleSources("consumed"),
      },
    };
  }
  let adoptionRefused = false;
  let waitForFreshKick = false;
  let pluginUnavailable = false;
  let executionFailed = false;
  try {
    if (refuseMixedClaim) {
      for (const item of sources) {
        item.disableCollectBatching = true;
      }
      const retry = deferSessionControllerClaimBeforeExecution(claim);
      defaultRuntime.error?.(
        `mailbox refused a mixed claim for ${queue.key}: not every member may run as the room ` +
          `baseline; ${sources.length} members ${retry ? "retry alone" : "released unadopted"}`,
      );
      return;
    }
    // Frond (karmaterminal, #1415): a plugin activated since selection splits the room again.
    if (crossSender && deferRoomAggregateForUnauditedPlugins(claim, source.run)) {
      return;
    }
    if (admissionSessionRebind && run.run.sessionId === admissionSessionRebind.from) {
      run = { ...run, admissionSessionId: admissionSessionRebind.to };
    }
    const runFollowup =
      (source.controllerInput && followupSourceRunners.get(source.controllerInput)) ?? execute;
    await runFollowup(run);
  } catch (error) {
    executionFailed = true;
    if (claim.retryBeforeExecution && error instanceof PluginInstanceUnavailableError) {
      pluginUnavailable = !error.replacement;
      if (error.replacement) {
        // Keep FIFO custody until replacement or rollback, but let channel stop
        // return the unexecuted source to ingress before disposing its instance.
        const signal = AbortSignal.any([
          claim.abortController.signal,
          generation.signal,
          getGatewayRestartDrainSignal(),
          ...(cancellation.signal ? [cancellation.signal] : []),
        ]);
        try {
          await racePromiseWithAbortSignal(error.replacement, signal);
        } catch (waitError) {
          if (!signal.aborted) {
            throw waitError;
          }
        }
      }
    }
    updateFollowupRetryHeartbeats(error, sources);
    adoptionRefused = sources.some((item) => {
      const custody = item.controllerInput?.custody;
      return (
        custody && !custody.adopted && custody.failure !== undefined && custody.failure === error
      );
    });
    if (adoptionRefused) {
      // Adoption is the last reversible producer boundary before model/tool work.
      // Match the custody owner's exact rejection so later execution errors cannot replay.
      deferSessionControllerClaimBeforeExecution(claim);
    }
    waitForFreshKick =
      claim.retryBeforeExecution === true &&
      error instanceof AgentDatabaseExecutionAdmissionClosedError;
    defaultRuntime.error?.("mailbox execution failed for " + queue.key + ": " + String(error));
  } finally {
    // Only a producer receipt retries within this mailbox. An escaped runner error
    // instead abandons unadopted lifecycle-backed input for durable ingress replay.
    const preparationRefused = claim.retryBeforeExecution === true;
    if (preparationRefused && !pluginUnavailable) {
      // Every retry yields so failed preparation cannot starve reload or cancellation.
      await new Promise<void>((resolve) => {
        setTimeout(resolve, 250).unref?.();
      });
    }
    // An unavailable owner without a replacement cannot recover in this drain.
    // Preserve the preparation refusal so its source records abandonment.
    const retrySources =
      claim.retryBeforeExecution && !pluginUnavailable
        ? sources.filter((item) => {
            try {
              item.operatorAuthority?.assertCurrent();
            } catch {
              return false;
            }
            return (
              !isFollowupRunAborted(item) &&
              !item.controllerInput?.retirementRequested &&
              (!adoptionRefused || !item.controllerInput?.custody.adopted) &&
              !item.controllerInput?.custody.completed
            );
          })
        : [];
    if (!retrySources.length) {
      claim.retryBeforeExecution = false;
    }
    const consumed = sources.filter((item) => !retrySources.includes(item));
    detachSessionControllerSources(consumed);
    if (claim.summary) {
      consumeQueueSummaryDelivery(
        queue,
        { sources: consumed, droppedCount: consumed.length },
        "retained",
      );
    }
    for (const item of retrySources) {
      item.controllerInput!.payload = claim.summary ? "summary" : "ready";
    }
    if (retrySources.length) {
      queue.lastEnqueuedAt = performance.now();
    }
    for (const item of sources) {
      queue.activeSummarySources.delete(item);
      for (const elision of queue.summaryElisions) {
        const compact = elision.sourceRefs.get(item);
        if (compact) {
          queue.activeSummarySources.delete(compact);
        }
      }
      if (retrySources.includes(item)) {
        continue;
      }
      try {
        // A run that returned normally without adopting this source never started
        // its model/tool work: it releases the source (an aborted owner cancels, an
        // unadmitted one abandons) instead of consuming its durable claim. Throws
        // keep upstream's no-replay rule unless the producer refused explicitly.
        const unadopted = !executionFailed && !isFollowupRunAdopted(item);
        completeFollowupRunLifecycle(
          item,
          preparationRefused || (executionFailed && item.turnAdoptionLifecycle) || unadopted
            ? undefined
            : "consumed",
        );
      } catch (error) {
        defaultRuntime.error?.("mailbox custody settlement failed: " + String(error));
      }
    }
    cancellation.dispose();
    if (!waitForFreshKick && queue.abortController === generation) {
      queue.dispatchEnabled = true;
    }
    releaseSessionControllerClaim(claim);
  }
}
export function rememberFollowupDrainCallback(
  key: string,
  runFollowup: (run: FollowupRun) => Promise<void>,
  captured?: SessionControllerMailbox,
  admissionSessionRebind?: AdmissionSessionRebind,
): void {
  const mailbox = captured ?? getExistingSessionControllerMailbox(key);
  if (!mailbox) {
    return;
  }
  mailbox.dispatch = async (claim) => {
    if (isGatewayRestartDraining() && deferSessionControllerClaimBeforeExecution(claim)) {
      mailbox.dispatchEnabled = false;
      releaseSessionControllerClaim(claim);
      return;
    }
    let entered = false;
    try {
      // The turn owns a fresh async work scope: tracked agent work must keep running
      // after the request that triggered the drain has closed its own scope.
      await runWithGatewayDetachedWorkContinuation(
        () =>
          runOutsideAdmittedGenerationScopes(() => {
            entered = true;
            // Consume this request; a kick during execution re-enables dispatch.
            mailbox.dispatchEnabled = false;
            // The retiring turn may wake this mailbox from its own async context.
            return runWithSessionControllerCleanup(() =>
              executeClaim(claim, runFollowup, admissionSessionRebind),
            );
          }),
        "session:mailbox-turn",
      );
    } catch (error) {
      if (
        !entered &&
        isGatewayRestartDrainError(error) &&
        !getGatewayRestartDrainSignal().aborted &&
        deferSessionControllerClaimBeforeExecution(claim)
      ) {
        // Rollback alone must not create a background backlog. The next ordinary
        // kick re-enables dispatch of the retained, unexecuted input.
        mailbox.dispatchEnabled = false;
        releaseSessionControllerClaim(claim);
        return;
      }
      defaultRuntime.error?.("mailbox root admission failed: " + String(error));
      for (const source of claim.sources) {
        completeFollowupRunLifecycle(source);
      }
      detachSessionControllerSources(claim.sources);
      if (claim.summary) {
        consumeQueueSummaryDelivery(
          mailbox,
          { sources: claim.sources, droppedCount: claim.sources.length },
          "retained",
        );
      }
      releaseSessionControllerClaim(claim);
    }
  };
}

export function scheduleFollowupDrain(
  key: string,
  runFollowup: (run: FollowupRun) => Promise<void>,
  owner?: SessionControllerEntry,
  admissionSessionRebind?: AdmissionSessionRebind,
): void {
  const mailbox = owner ? owner.mailbox : getExistingSessionControllerMailbox(key);
  if (!mailbox) {
    return;
  }
  rememberFollowupDrainCallback(key, runFollowup, mailbox, admissionSessionRebind);
  mailbox.dispatchEnabled = true;
  mailbox.wake();
}

export async function dropAbortedFollowups(
  queue: SessionControllerMailbox,
  runFollowup: (run: FollowupRun) => Promise<void>,
): Promise<number> {
  const sources = [...new Set(followupQueueSources(queue))].filter(
    (source) =>
      isFollowupRunAborted(source) &&
      source.controllerInput?.phase !== "injecting" &&
      !queue.inFlight.has(source),
  );
  detachSessionControllerSources(sources);
  consumeQueueSummaryDelivery(queue, { sources, droppedCount: 0 }, "retained");
  for (const source of sources) {
    const execute =
      (source.controllerInput && followupSourceRunners.get(source.controllerInput)) ?? runFollowup;
    const presentation = Promise.resolve().then(() => execute(source));
    if (source.controllerInput) {
      trackSessionControllerSourceWork(source.controllerInput, presentation);
    }
    // The owner aborted before admission: settle as cancelled, not abandoned.
    completeFollowupRunLifecycle(source, "cancelled");
    try {
      await presentation;
    } catch (error) {
      defaultRuntime.error?.("mailbox cancellation presentation failed: " + String(error));
    }
  }
  queue.wake();
  return sources.length;
}
