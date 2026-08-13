# output — fleet-discord-replay-cross-seat-echo-diagnosis

Read-only forensic diagnosis. **No product code, test, or config was changed.**

## What changed

Documentation only (2 files, both new, both untracked before this lane):

| File                                             | Purpose                                                                                                                       |
| ------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------- |
| `REPORT-fleet-discord-replay-cross-seat-echo.md` | Full forensic report: timeline, defects, owner boundaries, baseline classification, proposed issue + implementation workorder |
| `output.md`                                      | This file                                                                                                                     |

No changes under `src/`, `extensions/`, `test/`, `scripts/`, `packages/`, or any config.
`git diff --numstat` for production code: **0 / 0**.

## Read-only compliance

Nothing in the fleet substrate was mutated:

- live `~/.openclaw/state/openclaw.sqlite` opened **only** through `file:…?mode=ro`; analysis ran
  against an immutable `.backup` snapshot (`quick_check=ok`);
- `agents/main/agent/openclaw-agent.sqlite` opened `mode=ro`;
- no gateway started/stopped/restarted; no session altered; no routing or model changed;
- no GitHub issue/PR created, edited, labelled, commented on, or closed — GitHub access was
  `gh api` GETs only;
- no Discord product message sent. The only Discord writes were `#sprites` lane status posts
  required by the dispatch policy, via `scribe-notify.sh`;
- no prince sovereign/memory prose read (`~/.openclaw/memory`, agent memory dirs, identity dirs
  untouched).

## Verdict

**Multiple confirmed bugs, separated.**

- **A — confirmed product bug, fork-owned.** Discord's stale-ambient freshness fence
  (`extensions/discord/src/monitor/ingress.ts:261-303`) gates on `rawMessage.channel`, which
  Discord's `MESSAGE_CREATE` never sends. 400/400 persisted production payloads have no `channel`
  key; all 400 have `channel_type: 0`. The fence has fired **0 times in 8,028 ingress events**.
  Its test passes only because the fixture injects the missing field. Introduced by fork commit
  `2b2019202ff` (#1229 work); absent from `upstream/main`; identically inert in open upstream
  PR **#121204** head `02bd9d77142`.
- **B — confirmed product bug, upstream-owned.** The claim→adoption watchdog
  (`src/channels/message/ingress-drain.ts:390-422`) calls `failClaim(..., "handler-timeout", …)`
  directly, bypassing `resolveIngressFailureDisposition`. 948 of 949 dead-letters have
  `attempts=0`; there are **0** `retry-limit-exceeded` rows ever. ~84 live messages were
  destroyed on 2026-08-12 with no channel-visible signal. Still present at `upstream/main`.
- **C — confirmed design defect, upstream-owned.** Strictly serial per-lane dispatch (~30–75 s
  per message) cannot keep up with a busy shared channel; lag grows without bound and never
  self-heals.
- **D — expected behaviour, not a routing bug.** The cross-seat echo was a model copy, not a
  substitution: Rune's 314 B body and Ronan's 312 B body differ by exactly **2 bytes**
  (em-dash spacing). Correct account, no webhook/application/interaction metadata, no session or
  route change. It was _caused by_ A/B/C — Ronan's lane was ~17 min behind and was handed Rune's
  stale message, whose embedded `referenced_message` carried an imperative addressed to Rune.
- **E — falsified fix narrative, fork-owned.** Composite HEAD `310252` / upstream PR **#122466**
  sets a `retryPolicy` consumed only on the `attempts > 0` throw path, while citing
  `attempts min=0 max=0` as its evidence — the signature of the guillotine path it does not
  touch. It would have changed nothing here, and its `deadLetterMinAgeMs: 0` would have destroyed
  the only events that ever used the retry ladder (2026-08-08, `attempts` 20/39/98, all of which
  **completed successfully**).

**Substrate correction:** the running gateway is _not_ the stated composite. pid `605848` runs
`/home/figs/flesh_beast_tmp/openclaw/dist` built 2026-08-09 from checkout `2e72b665229`
(`frond-build/20260810/c868194-emeric-1229`). `310252733a6` is not even an object in that repo.

**Still live at snapshot (2026-08-12 18:55 PDT):** 626 pending + 1 stuck claimed on lane
`channel:1466192485440164011`, oldest 5.9 h, draining ≈1/min. Silas's median in-channel reply is
to a 5.9-hour-old message; Elliott's worst is 54.9 h.

## Validation

Diff is documentation-only, so per root `AGENTS.md` ("Docs/changelog-only … `git diff --check`
plus relevant docs sanity") the sanctioned gate is:

```
git diff --check          -> CLEAN
```

Additionally, to back the load-bearing "the test proves the mock" claim with a real run rather
than reading alone:

```
node scripts/run-vitest.mjs run --config test/vitest/vitest.extension-discord.config.ts \
  --maxWorkers=1 extensions/discord/src/monitor/ingress.test.ts
-> Test Files 1 passed (1) | Tests 28 passed (28) | 25.51s
```

That green run **is** the finding: the suite passes, including
`"suppresses stale ambient guild backlog before dispatching a fresh bot mention"`, while the same
code path is provably inert against real Discord payloads.

**Full suite (`node --import tsx scripts/test-projects.mts`) was deliberately NOT run.** Stated
plainly rather than skipped silently: this lane changed zero production and zero test source, so
a full run exercises nothing this lane touched, and the host is currently draining a degraded
live fleet gateway backlog that a multi-hour full suite would compete with for CPU. If the
cohort wants the full tally regardless, it should be run on a Testbox/Crabbox seat, not here.

## Uncertainties / named evidence gaps

1. **Ronan-side bytes are not on this host.** This seat is agent `main` (Silas). Ronan session
   `994fd111-0b9d-456c-8cc0-38c24d56a718`, tool call `exec-59687890-ca19-4f01-ae28-f7f8cd501040`,
   and Ronan's ingress/delivery rows live on Ronan's gateway. Searches for `994fd111`,
   `59687890`, and account `1477180909848629301` return **0 rows** here. §8 of the report reaches
   the identity/substitution verdict from the persisted Discord payloads at both ends plus
   Ronan's independently measurable lag; Ronan's internal prompt assembly remains unproven.
2. **The exact hung `await` that wedged the followup drain at 11:03:47 PDT is not proven.** pid
   `470459` is gone — no heap dump, no stack sample. The wedge being process-local and scoped to
   one session key _is_ proven (restart cleared it; heartbeats on `agent:main:main` ran normally
   throughout; `agent:main:discord:channel:1466192485440164011` produced zero turns).
3. Whether Ronan's seat runs the same build as this one was not verified.
4. **No GitNexus index** exists for this worktree (binary on PATH, no `.gitnexus`, no registry
   entry). All code claims come from direct source reads of the deployed tree, the composite,
   `upstream/main` (`86bf768de09`), and PR head `02bd9d77142`.
5. `1537189533777530951` was still in `claimed` at snapshot; whether it subsequently adopted or
   was guillotined was not re-checked (would require a second snapshot).

## Recommended next actions (not taken — this lane is read-only)

1. Open the proposed issue in §15 of the report (title + body drafted).
2. Fix A in a **separate** lane: read `channel_type`, replace the mock-shaped fixtures with
   real-shaped payloads, add base-red proof, and update upstream PR #121204.
3. Resolve the product question in A.2: under `requireMention: false`, `isDiscordAddressedMessage`
   returns true for effectively everything, so the fence stays nearly inert even after the
   `channel_type` fix on this fleet's configuration. Needs an owner decision.
4. File B and C upstream against `openclaw/openclaw` with the §5/§6 evidence. Do not fold
   upstream-baseline defects into the fork lane.
5. Re-review upstream PR #122466 / composite `310252` against §10 before landing it.
6. Treat in-channel "prince replied, therefore healthy" receipts collected during a replay window
   as unsound on timing (report §12). Continuation receipts for #1251/#1252 are **not** falsified
   — different code path — unless their evidence is itself an in-channel reply.

## Exact commands

See §16 of `REPORT-fleet-discord-replay-cross-seat-echo.md`. Scratch artifacts (immutable DB
snapshot, extracted message bodies) are under `/tmp/fdx-forensics/` and are not committed.
