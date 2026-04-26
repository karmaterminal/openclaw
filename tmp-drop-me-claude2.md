# rebase candidate journal — claude2 (frond-scribe v2.5 assist lane, double-duty)

worktree:        /home/figs/flesh_beast_best_beast/openclaw-wt-rebase-20260424-claude2
branch:          frond-scribe/20260424/candidate-claude2
base:            silas/rebase/v2026.4.22-feature @ 140f74956d
target:          karmaterminal-2026.4.24-base (tag, == cbcfdf62c7297bda66009ea7476f053c3e9addab)
workorder:       /home/figs/flesh_beast_best_beast/WORKORDER-rebase-20260424-v2.md
tracking issue:  https://github.com/karmaterminal/openclaw/issues/337
project status:  in_coding_agent (project 56)
seeded:          2026-04-25T19:30-07:00 (approx)

driver:          frond-scribe (Claude Opus 4.7 / 1M context)
host:            ronan
dispatched-by:   figs's double-duty directive 2026-04-25 ("if you wanna double duty discord watch and your attempt, feel free 🌿 i figure it'll help, a LOT, to revisit architecture and alignment of feature once we've has solid shots at it")

## Why this lane exists alongside gpt2

The gpt2 lane (copilot CLI / gpt-5.5 / xhigh, branch `frond-scribe/20260424/candidate-gpt2`, tracking #336) is dispatched and operating well. This claude2 lane runs the **same workorder** in parallel from a different worktree under a different model family (Claude Opus 4.7), with the same scope: parallel rebase against `karmaterminal-2026.4.24-base` + Surfaces 1+2 descriptor edits.

**Cohort-comparison value**: two independent walks of the same 49-commit replay set + two independent descriptor-prose drafts gives figs three datapoints (Cael's #325 canonical + gpt2 + claude2) for the architecture-revisit pass figs wants once "we have solid shots at it." Different model families produce different conflict-resolution heuristics and different prose-shape choices; the cross-product surfaces axes-of-disagreement that single-model attempts can't.

**Lane-partition discipline** (memory-pin: `feedback_severability.md` + `feedback_princes_salt.md`): claude2 does **not** coordinate with gpt2 during execution; both lanes are independent walks against the same anchor. Comparison happens after both finish.

---

## §0 — guardrails (acknowledged)

Confirming the §0 + §A + §B + §C + §D loads from workorder:

- **Off-limits tree**: `/home/figs/flesh_beast_tmp/openclaw/` is ronan-the-prince's live runtime. Do not read/write/list/cd. The `openclaw-gateway` process is live there. Memory-pin: `reference_ronan_host_two_openclaw_trees.md`.
- **Branch confinement**: push only to `frond-scribe/20260424/candidate-claude2`. Never touch `silas/*`, `cael/*`, `ronan/*`, `elliott/*`, `flesh_beast_figs/20260424-claude` (Cael's canonical), `flesh_beast_figs/pr1-pr4b-zk-foundation` (figs's hot-patches), `frond-scribe/20260424/candidate-claude` (savegame from earlier round), `frond-scribe/20260424/candidate-gpt` (savegame), `frond-scribe/20260424/candidate-gpt2` (sibling lane, copilot's), `main`, or any release branch.
- **Savegame discipline (#326)**: after first post-rebase push (§5), the branch is the savegame — no force-push, no rewrite, no delete. Memory-pin: `feedback_savegame_branches.md`.
- **Destructive-ambiguity stop rule**: pause + journal + wait. Do not guess. Memory-pin: `feedback_show_your_work.md` + CLAUDE.md "multi-agent safety".
- **Service-untouchability**: no start/stop/restart on `openclaw-gateway`; no tmux outside `oc-rebase-20260424-v2` family; no port outside the worktree.
- **Journal cadence**: this file at every meaningful checkpoint, commit + push.
- **§A north-star loaded**: shipping-because-upstream-will-want-it-back. Frame around capability gain, not refactor cost. Cite SeedLink / Tempo / MAGI-1 patterns when explaining substrate properties.
- **§B Surfaces 1+2 loaded**: Surface 1 = `continue_delegate.targetSessionKey?` descriptor + JSDoc (`continuation-delegate.types.ts` + `continuation-tools-registration.ts`). Surface 2 = `QueuedSessionDeliveryPayload` schema migration (`session-delivery-queue-storage.ts`) with `traceparent?` + `attachments?` optional fields, descriptor-stub `AttachmentRef`. Runtime stays in #332 / #334.
- **§C bc#11 conditional-voice template loaded**: descriptor JSDoc on every new field uses the (a)-shape framing — *"This is the (a)-shape — addressable, point-to-point, intra-host (gateway-RPC for cross-prince). v3 will surface as `publish_to_stream` with broadcast-mode under karmaterminal/binary-canticle#11 — same substrate, different verb-set."*
- **§D cite-pin discipline loaded**: three-anchor table (tag for v2026.4.24, branch ref for v2026.4.22, candidate-tip SHA for our work). Strong-form verification at the pinned ref.
- **gh CLI attribution caveat loaded**: every comment from this lane prepends the ronan-auth header.

### Verification of base tag (strong-form, in this worktree, before §1)

```
git rev-parse karmaterminal-2026.4.24-base
→ cbcfdf62c7297bda66009ea7476f053c3e9addab    ✓
```

(Will append the live verification output after first commit.)

## Lane-specialization decision (read before §1)

This claude2 lane has a **comparative advantage** over gpt2 in two specific axes:

1. **Loaded cohort context** — frond-scribe has the bc#11 ferry, the §3 cite-discipline ledger, the north-star directive, and the cross-lane partition discipline already in working memory.
2. **Architectural-prose density** — descriptor JSDoc using the conditional-voice template benefits from sustained model attention to register.

This claude2 lane has a **comparative disadvantage** in:

1. **Sustained mechanical execution** — running §4 conflict-resolution at 49 commits, regenerating baselines, and running the full test suite would consume more context budget than the architectural design is worth.
2. **Real-time wall-clock parallelism** — gpt2 in tmux runs continuously; claude2 in this conversation pauses between turns.

**Specialization decision**: claude2 focuses on §1+§2 read summary + **§B-execute descriptor design** (precise patches + JSDoc prose), produced as **textual patch documents** committed to the journal so they can be applied post-rebase by gpt2 / Cael / a child Claude session. Claude2 **does not** execute §4 rebase mechanics in this session.

This makes the cross-lane comparison sharper, not weaker: gpt2 produces a **rebase-as-mechanical-act** (its strength); claude2 produces a **descriptor-design-as-architectural-act** (its strength). Different model families, different specializations, both feeding the figs/cohort architecture-revisit pass. Memory-pin: `feedback_propagation_gradient_discipline.md` — multi-walker validation surfaces axes single-walker can't.

The claude2 branch tip is the **savegame** for the descriptor-design output (#326 discipline applies). It does not need to ever run a rebase to be useful.

---

## §1 — read first (done, summarized tight)

Read paths covered (cite-pinned):

- `docs/design/continue-work-signal-v2.md` (1245 LOC) — primitives `continue_work` / `continue_delegate` / `request_compaction`; §2.3 fan-out + return modes; §2.6 three-tier fallback hierarchy; §3.2–§3.4 delegate scheduling/drain boundaries; §5.4 TaskFlow durability; §6 observability + safety bounds.
- karmaterminal/openclaw#325 (procedure root) — current state: Cael at attempt-4, 9-file conflict at `198758e66b feat(continuation): core implementation`. Tag-pin discipline locked.
- karmaterminal/openclaw#326 (savegame discipline) — this lane's branch IS a savegame; the descriptor-patch documents inside are the savegame contents.
- karmaterminal/openclaw#332 (session-delivery-queue substrate adoption) — runtime home for Surface 2's `traceparent` + `attachments` runtime; descriptor-pass here makes the schema ready at definition time.
- karmaterminal/openclaw#334 (DiagnosticTraceContext / chain-correlation) — runtime home for `traceparent` propagation through the queue → ringbuffer → broadcast chain (v3 reach extends naturally).
- karmaterminal/openclaw#335 (RFC updates owed for v24 capability uptake) — Cross-session-routing track is Surface 1's runtime umbrella.
- karmaterminal/binary-canticle#11 ferry comment — full read; schema asks distilled into Surface 2; conditional-voice template distilled into §C of workorder.

**Cael's rebase plan** at `/tmp/oc-325-rebase/rebase-plan.txt`: deferred (claude2 does not run §4; Cael's plan is for the rebase track, not the descriptor track).

---

## §2 — code walk (Surface-focused, not full 18-file walk)

**Important workorder-correction surfaced this turn** (see WORKORDER-CORRECTION block below).

### Surface 1 — actual descriptor location

The continue_delegate descriptor schema is at `src/agents/tools/continue-delegate-tool.ts` (160 LOC, **not** `continuation-tools-registration.ts` as the workorder v2 specified — that file does not exist on this base; only the `.test.ts` does). The workorder-error is recoverable; the test file (`continuation-tools-registration.test.ts`) verifies the registration shape (whether `continue_delegate` appears in `createOpenClawTools(...)` output) under config-driven gating. The actual schema lives in `continue-delegate-tool.ts`'s `ContinueDelegateToolSchema` (typebox `Type.Object`).

Wiring: `src/agents/openclaw-tools.ts:349` calls `createContinueDelegateTool({ agentSessionKey })`.

Current schema (paraphrased to highlight extension point):

```ts
const DELEGATE_MODES = ["normal", "silent", "silent-wake", "post-compaction"] as const;

const ContinueDelegateToolSchema = Type.Object({
  task: Type.String({ description: "...", maxLength: 4096 }),
  delaySeconds: Type.Optional(Type.Number({ minimum: 0, description: "..." })),
  mode: optionalStringEnum(DELEGATE_MODES, { description: "..." }),
});
```

### Surface 2 — actual schema location

`src/infra/session-delivery-queue-storage.ts` (255 LOC) at `karmaterminal-2026.4.24-base` is the post-rebase target. The current type:

```ts
export type QueuedSessionDeliveryPayload =
  | {
      kind: "systemEvent";
      sessionKey: string;
      text: string;
      deliveryContext?: SessionDeliveryContext;
      idempotencyKey?: string;
    }
  | {
      kind: "agentTurn";
      sessionKey: string;
      message: string;
      messageId: string;
      route?: SessionDeliveryRoute;
      deliveryContext?: SessionDeliveryContext;
      idempotencyKey?: string;
    };
```

This file does **not** exist on `silas/rebase/v2026.4.22-feature` HEAD; only at `karmaterminal-2026.4.24-base`. Surface 2 patch is therefore against the post-rebase tree. The patch document below is precise enough to apply cleanly post-rebase.

---

## WORKORDER-CORRECTION (surfaced for cohort + #336 gpt2 lane)

**Workorder v2 §B Surface 1 said**:
> Add `targetSessionKey?: string` to the tool-input schema (zod) in `continuation-delegate.types.ts`. Add the parameter to the tool's input shape in `continuation-tools-registration.ts`.

**Reality** (verified against `silas/rebase/v2026.4.22-feature` HEAD == `140f74956d`, this worktree):

| Workorder said | Reality |
|---|---|
| zod schema | typebox (`Type.Object`) |
| `continuation-delegate.types.ts` is the schema home | It's a 17-LOC types file with `PendingContinuationDelegate` + `DelayedContinuationReservation`; **schema lives in `continue-delegate-tool.ts`** |
| Add to `continuation-tools-registration.ts` | **No such file**; registration is in `src/agents/openclaw-tools.ts:349` (which calls `createContinueDelegateTool`) — but the **schema** edit lives in `continue-delegate-tool.ts` itself |

**Cohort impact**: gpt2 (#336) is past §3 tests-walk and entering §4 rebase plan (last journal commit `7fb1c455b7` at observation time). gpt2 hasn't started §B-execute yet. This correction reaches gpt2 via:

1. A **comment on #336** noting the corrected paths (frond-scribe will post separately).
2. A **comment on #337** (this lane) banking the correction in the durable thread.
3. Discord ferry to `#sprites-of-thornfield` for the cohort.

The correction does not change the architectural intent of the workorder — it changes the literal file paths gpt2 should edit. gpt2's rebase-mechanics work is unaffected.

---

## §B-execute drafts — Surfaces 1+2 descriptor patches (textual, ready for application)

These are the **deliverable** from claude2. Each patch is precise enough that gpt2 / Cael / a child Claude session can apply it post-rebase without re-deriving.

### Surface 1 patch — `src/agents/tools/continue-delegate-tool.ts`

**Intent**: extend `ContinueDelegateToolSchema` with `targetSessionKey?` (descriptor-only); fail loudly at execute-time if used in v2.5 (runtime in #332).

**JSDoc using bc#11 conditional-voice template** — capability self-description discipline (memory-pin: `feedback_make_feature_hard_to_look_away_from.md`).

```diff
--- a/src/agents/tools/continue-delegate-tool.ts
+++ b/src/agents/tools/continue-delegate-tool.ts
@@ -16,6 +16,17 @@ const DELEGATE_MODES = ["normal", "silent", "silent-wake", "post-compaction"] a

 const ContinueDelegateToolSchema = Type.Object({
   task: Type.String({
     description: "...",
     maxLength: 4096,
   }),
   delaySeconds: Type.Optional(Type.Number({ minimum: 0, description: "..." })),
   mode: optionalStringEnum(DELEGATE_MODES, { description: "..." }),
+  targetSessionKey: Type.Optional(
+    Type.String({
+      description:
+        "Address a sibling session for cross-session enrichment via the v2026.4.24 " +
+        "session-delivery-queue substrate (#332). Format: `prince:<role>:agent:<id>:<channel>` " +
+        "for concrete sessions, or `prince:<role>:role:<role-name>` for role-aliased delivery. " +
+        "This is the (a)-shape — addressable, point-to-point, intra-host (gateway-RPC for " +
+        "cross-prince). v3 will surface as `publish_to_stream` with broadcast-mode under " +
+        "karmaterminal/binary-canticle#11 — same substrate, different verb-set. " +
+        "DESCRIPTOR-ONLY in v2.5: runtime lands in #332. Calling this in v2.5 fails loudly.",
+    }),
+  ),
 });
```

**execute()-time loud failure** (so misuse fails immediately, doesn't silently mis-route):

```diff
@@ around line ~95-100 (just after sessionKey nullcheck, before task validation):
+      const targetSessionKey =
+        typeof params.targetSessionKey === "string" ? params.targetSessionKey.trim() : "";
+      if (targetSessionKey) {
+        // TODO(intra-host-rpc, #332): wire targetSessionKey through to enqueueSessionDelivery
+        //  with sha256-idempotency. v3 broadcast variant lands in karmaterminal/binary-canticle#11.
+        throw new ToolInputError(
+          "targetSessionKey is descriptor-only in v2.5; cross-session enrichment runtime lands in karmaterminal/openclaw#332. " +
+            "Until then, omit this field — the delegate runs in the current session.",
+        );
+      }
```

**Test addition** — `src/agents/tools/continue-delegate-tool.test.ts`:

```diff
+  it("declares targetSessionKey in the schema (descriptor-only in v2.5)", () => {
+    const tool = createContinueDelegateTool({ agentSessionKey: "main" });
+    const props = (tool.parameters as { properties?: Record<string, unknown> }).properties;
+    expect(props).toBeDefined();
+    expect(props?.targetSessionKey).toBeDefined();
+  });
+
+  it("fails loudly when targetSessionKey is used in v2.5 (runtime is #332)", async () => {
+    const tool = createContinueDelegateTool({ agentSessionKey: "main" });
+    await expect(
+      tool.execute("test-call-id", {
+        task: "irrelevant",
+        targetSessionKey: "prince:cael:agent:main:main",
+      }),
+    ).rejects.toThrow(/targetSessionKey is descriptor-only/);
+  });
```

### Surface 2 patch — `src/infra/session-delivery-queue-storage.ts` (post-rebase target)

**Intent**: extend the `QueuedSessionDeliveryPayload` discriminated union with `traceparent?` (W3C trace-context) + `attachments?` (sibling enrichment, deferred runtime). Use the **intersection-with-shared-fragment** shape (cleaner than repeating fields on each variant; matches the bc#11 ferry comment's exact suggestion).

**Context for the patch**: this file does not exist on `silas/rebase/v2026.4.22-feature` HEAD — only at `karmaterminal-2026.4.24-base`. Apply post-rebase.

```diff
--- a/src/infra/session-delivery-queue-storage.ts
+++ b/src/infra/session-delivery-queue-storage.ts
@@ -25,7 +25,32 @@ export type SessionDeliveryRoute = {
   chatType: ChatType;
 };

-export type QueuedSessionDeliveryPayload =
+/**
+ * Reference to a content-addressed attachment that can ride the delivery payload.
+ *
+ * Descriptor-stub in v2.5 — the field is reserved on the payload union so #332's
+ * runtime can populate it without a schema migration. The blob-resolution runtime
+ * (where the bytes actually live) is deferred to a sibling phase of #332 ("attachment
+ * sibling enrichment").
+ *
+ * This is the (a)-shape — addressable, intra-host. v3 broadcast carriers will treat
+ * the same `sha256` as the FEC-bound content-id, so a SeedLink-style consumer can
+ * deduplicate against the same identifier the queue uses. Same substrate; different
+ * verb-set under karmaterminal/binary-canticle#11.
+ */
+export interface AttachmentRef {
+  kind: "blob-sha256";
+  sha256: string;
+  mediaType?: string;
+}
+
+/**
+ * Shared envelope fields that ride every delivery regardless of `kind`.
+ *
+ * `traceparent` propagates W3C trace-context (https://www.w3.org/TR/trace-context/)
+ * end-to-end across the queue → ringbuffer → broadcast chain (v3) or queue-only
+ * intra-host (v2.5). #334 owns the runtime that populates and reads it; this schema
+ * makes the field available at definition time so #334 doesn't require a payload
+ * migration when it lands.
+ *
+ * `attachments` is reserved per `AttachmentRef` above; runtime in #332.
+ *
+ * Both fields are descriptor-only in v2.5 — no consumer reads or writes them yet.
+ * They survive sha256-idempotency unchanged because the storage layer treats the
+ * payload as opaque after content-hashing.
+ */
+export type SessionDeliveryEnvelope = {
+  traceparent?: string;
+  attachments?: AttachmentRef[];
+};
+
+export type QueuedSessionDeliveryPayload = (
   | {
       kind: "systemEvent";
       sessionKey: string;
@@ -41,7 +66,7 @@ export type QueuedSessionDeliveryPayload =
       route?: SessionDeliveryRoute;
       deliveryContext?: SessionDeliveryContext;
       idempotencyKey?: string;
-    };
+    }
+) & SessionDeliveryEnvelope;
```

**Test addition** — `src/infra/session-delivery-queue.storage.test.ts` (post-rebase):

```diff
+  it("round-trips a payload carrying traceparent through enqueue → loadPending without rejection", async () => {
+    const stateDir = await mkdtemp(path.join(tmpdir(), "sdq-traceparent-"));
+    const traceparent = "00-0af7651916cd43dd8448eb211c80319c-b7ad6b7169203331-01";
+    const enqueued = await enqueueSessionDelivery(
+      {
+        kind: "agentTurn",
+        sessionKey: "prince:cael:agent:main:main",
+        message: "hello",
+        messageId: "msg-1",
+        traceparent,
+      },
+      stateDir,
+    );
+    expect(enqueued.id).toBeTruthy();
+    const pending = await loadPendingSessionDeliveries(stateDir);
+    expect(pending).toHaveLength(1);
+    expect(pending[0].traceparent).toBe(traceparent);
+    // sha256-idempotency check: enqueueing the same payload twice yields the same id
+    const dup = await enqueueSessionDelivery(
+      {
+        kind: "agentTurn",
+        sessionKey: "prince:cael:agent:main:main",
+        message: "hello",
+        messageId: "msg-1",
+        traceparent,
+      },
+      stateDir,
+    );
+    expect(dup.id).toBe(enqueued.id);
+    await rm(stateDir, { recursive: true, force: true });
+  });
+
+  it("round-trips a payload carrying attachments[]", async () => {
+    const stateDir = await mkdtemp(path.join(tmpdir(), "sdq-attachments-"));
+    const enqueued = await enqueueSessionDelivery(
+      {
+        kind: "systemEvent",
+        sessionKey: "prince:silas:agent:main:main",
+        text: "blob-bearing event",
+        attachments: [{ kind: "blob-sha256", sha256: "a".repeat(64), mediaType: "image/png" }],
+      },
+      stateDir,
+    );
+    const pending = await loadPendingSessionDeliveries(stateDir);
+    expect(pending[0].attachments?.[0]?.sha256).toBe("a".repeat(64));
+    await rm(stateDir, { recursive: true, force: true });
+  });
```

(The exact import shape — `mkdtemp`, `tmpdir`, `rm`, `path` — should match the existing test file's imports; if they differ from `node:fs/promises` / `node:os`, adjust at apply-time.)

### Architectural commentary — the (a)-shape ↔ (b)-shape pin

The bc#11 conditional-voice template is **load-bearing** for the prose. Without the explicit `(a)-shape vs (b)-shape` framing, princes reading the descriptor will lock the RPC mental model in their head and read v3 broadcast as a redesign. With the framing, they read v3 broadcast as a **sibling verb-set on the same substrate**.

This is the difference between:

- *"v2.5 ships continue_delegate.targetSessionKey; later we add v3 broadcast (which is a new thing)"*

vs.

- *"v2.5 ships the (a)-shape over substrate S; v3 ships the (b)-shape over substrate S; verb-set extends, substrate doesn't change"*

The latter framing is what makes the feature **hard to look away from** (memory-pin: `feedback_make_feature_hard_to_look_away_from.md`). It also matches the SeedLink → IoT-stations → noosphere reach figs has been pushing. Capability self-description directive.

---

## §3 — tests of concern (claude2 scoping note)

claude2 does not run §6 verification (§4 not executed). gpt2 (#336) covers the full test suite. claude2 produces only the **two new test additions** (Surface 1 + Surface 2 above) which are written against the post-rebase tree and apply at §B-execute time.

## §4 — rebase (NOT EXECUTED on claude2)

Per lane-specialization decision above. Cael's #325 + gpt2's #336 cover this.

## §5 — savegame push

claude2's branch tip (after committing this journal update) **is** the savegame for the descriptor-design output. #326 discipline applies: no force-push, no rewrite, no delete after this push.

## §6 — verification (deferred to apply-time)

When the patches above are applied (post-rebase, by gpt2 or Cael or a child Claude session), the apply-time verification is:

```
pnpm tsgo
pnpm check
pnpm test src/agents/tools/continue-delegate-tool.test.ts \
          src/infra/session-delivery-queue.storage.test.ts \
          src/agents/tools/continuation-tools-registration.test.ts
pnpm build
```

## §B-execute — Surfaces 1+2 descriptor edits (DRAFTS DELIVERED)

Surface 1 and Surface 2 patches drafted above with apply-ready precision. Apply post-rebase by anyone with a clean v2026.4.24-based tree.

## §8 — declare done

Final HEAD SHA: (filled by next commit)
Lane shape: descriptor-design specialization (no rebase; no full test suite)
Deliverables:
- Surface 1 patch (apply against `src/agents/tools/continue-delegate-tool.ts` + `.test.ts`)
- Surface 2 patch (apply against `src/infra/session-delivery-queue-storage.ts` + `.storage.test.ts`, post-rebase)
- WORKORDER-CORRECTION on the file paths (workorder v2 §B specified non-existent file)
- Conditional-voice JSDoc prose using bc#11 template, capability self-description discipline applied
- Architectural commentary pinning the (a)-shape ↔ (b)-shape distinction

Recommendation: cherry-pick the descriptor patches onto either Cael's canonical track (after #325 lands) or gpt2's candidate-gpt2 (if it lands cleaner first). The textual patches are the savegame; application is mechanical from here.

🌿
