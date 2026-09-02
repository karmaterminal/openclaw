# Detached review: Mode-B 66-failure repair

## Verdict

`CONFIRMED_MODE_B_66_FAILURE_REPAIR`

The exact candidate `6f293138f960c82e376265b27a18edee8a201afa`
(tree `64a6c4f13a63ae1dd8b557e613e560fff47bb9a2`) repairs the 66
candidate-attributed failures without a reachable regression in provider runtime
policy, heartbeat trust ownership, or reply delivery/accounting.

## Object and scope

- Accepted base: `1a13e80181232f58bf43cc4deda9ce6ae3325344`
- Frozen upstream: `2e3f734017b9b1a5a32ba11d844d1fa7a5141de9`
- Protected presentation: `00c7f721a55554d0b9228337cc8bc6bec88f9e9f`
- Mode-B source run: `33582260380`
- Bootstrap workflow: `87fcc62a79b58c40f2c65c8e5e2ff6a39a36102f`

The accepted base is an ancestor of the candidate. The complete repair delta is
`+8/-31` in exactly these five files:

- `extensions/codex/src/app-server/run-attempt-tool-setup.ts`
- `src/agents/embedded-agent-subscribe.reply-delivery.ts`
- `src/infra/heartbeat-wake.ts`
- `src/plugin-sdk/heartbeat-runtime.ts`
- `src/plugins/runtime/runtime-system.ts`

There are no repair changes under `src/skills/**`, labeler/workflow paths,
documentation or proof paths, deployment paths, bootstrap, or presentation.

## Reproduced negatives

At the accepted base:

1. A canonical descendant fails while reading
   `attemptOptions.allowProviderRuntimePluginLoad` from absent attempt options.
2. Both CJS and TypeScript broad plugin runtime loading expose a
   `requestHeartbeat` wrapper whose identity differs from the scheduler export.
3. The orphaned tool-media block reply emits enumerable `text: undefined` and
   `isReasoning: false`, so the expected clean media-only payload is not counted.

These reproduce the three candidate-owned classes in the source-run attribution.

## Repair assessment

### Provider runtime policy

Optional access to `attemptOptions?.allowProviderRuntimePluginLoad` preserves
`undefined` as the upstream-safe default. It does not coerce an absent option to
either policy value. Explicit `false` still reaches runtime tool normalization,
and the durable registered-tool path still suppresses runtime loading through
its existing `ignoreRuntimePlan` ownership.

All 63 canonical-descendant cases pass at the candidate, including the explicit
provider-runtime suppression control.

### Heartbeat singleton and trust marker

The scheduler owner exports the one canonical `requestHeartbeat` function.
Plugin SDK and broad runtime registration now reuse that function directly, so
both CJS and TypeScript registry identity cases pass.

Sanitization is located at the singleton scheduler entrypoint:
`requestHeartbeatRaw({ ...opts })`. The spread retains public enumerable wake
fields while dropping the non-enumerable trusted-continuation marker. A direct
probe confirmed that a marked caller object arrives at scheduler ingestion
without trust. The internal continuation path retains ownership by explicitly
reconstructing and re-marking its request before raw scheduler entry.

The complete heartbeat owner suite passes, as do the prior heartbeat-silence
regressions.

### Media reply shape and accounting

Contextual `BlockReplyPayload` typing lets the media-only branch omit fields
rather than manufacturing `undefined` and `false` properties. The exact
orphaned-media case now emits the expected media/attachment/voice/trusted-local
shape, preserves source-reply suppression metadata, invokes delivery once, and
records one visible block reply plus one tool-media block reply.

The full subscriber owner suite (109 cases) and reply/lifecycle owners (52
cases) pass. The prior generic-commentary item-identity regression also passes.

## Covenant and static evidence

- Repaired Gateway covenant owners: pass.
- Covenant case 10: pass.
- Full covenant matrix: 24/24 unique generations pass.
- Node 24.17.0 `pnpm check`: pass.
- Node 24.17.0 `pnpm build`: pass.
- Node 24.17.0 Knip: pass.
- Gate 2: 36/36 primitive invariants pass (11 exact-upstream projections and
  three tombstones).
- Gate 2.7: 1,004 reviewer-visible paths, zero `FROZEN-STALE`.
- Barnacle owner regression: 47/47 pass.
- Scoped Autoreview through `gpt-5.6-sol` at high reasoning: scoped-clean, no
  accepted P0/P1 finding, overall correctness confidence 0.95.

The later bootstrap semantic-inventory implementation at `b32f8b5a7695b0ea16229bb710a34f066874640e`
is not the 79-file source-run Gate 2.5 substrate: it expands this historical
topology to 4,260 routed tests and reports one setup-only unmapped support
surface, `src/cli/update-cli/update-command-lease.test-support.ts`. That support
file and its importer are byte-identical at accepted base and candidate; the
repair does not introduce this newer parser/tooling mismatch. Repair-scoped
Gate 2.5 behavior is covered by the exact 66 identities, owner suites, registry
identity cases, heartbeat regressions, and covenant matrix above.

## Remaining Mode-B rerun

The remaining rerun set is infrastructure/load-only:

- `core-tooling-8`
- `core-tooling-9`
- `agentic-cli`
- `extensions`
- `core-runtime-infra-diagnostics-state`

`extension-acpx` is already green. The 19 other source-run reds remain
inherited or frozen-upstream and are not changed by this repair.
