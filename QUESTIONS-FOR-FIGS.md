# Questions for figs — v2026.4.29 exploratory rebase candidate

No blocking `(d) merge-required` conflict markers remain. These are semantic ratification questions for prince/figs review before treating the candidate as a direction.

## 1. Visible-reply policy vs blocked-liveness marker

The candidate composes v29 visible-reply enforcement with the cohort's blocked-liveness channel-visible marker. Should blocked-liveness markers bypass visible-reply suppression as operational liveness notices, or should they obey `messages.visibleReplies` / `messages.groupChat.visibleReplies` like ordinary assistant replies?

Best guess in candidate: keep the marker channel-visible so humans see terminal blocked state; review config edge cases before landing.

## 2. Abort wait semantics vs reply-run registry cleanup

v29 aligned abort wait semantics across gateway session methods; the cohort reply-run registry cleanup and `ReplyRunAlreadyActiveError` shielding remain in place. Should registry cleanup wait for the upstream abort completion point, or is the candidate's current clear/retry behavior acceptable?

Best guess in candidate: compose and monitor; no textual conflict remains, but this is the surface related to the prior Ronan `ReplyRunAlreadyActiveError` leak.

## 3. Subagent orphan recovery ordering vs continuation delegate drains

v29 adds orphan recovery/tombstone state while the cohort adds continuation delegate drains, post-compaction release, and subagent announce wake/silent behavior. Should orphan recovery run before continuation drain replay, after it, or only after tombstone classification?

Best guess in candidate: compose current ordering; require prince review around wedged-session recovery so a recovered/orphaned subagent does not double-deliver a continuation result.

## 4. Diagnostics-OTEL continuation tracer SDK seam

v29 removed the plugin-specific `src/plugin-sdk/diagnostics-otel.ts` facade. The candidate keeps that deletion and exposes continuation tracer registration/types through the generic `openclaw/plugin-sdk/diagnostic-runtime` seam for `extensions/diagnostics-otel`.

Best guess in candidate: this is the correct v29-style boundary. Please ratify that `diagnostic-runtime` is the desired public home rather than adding a new `continuation-tracer` SDK subpath.
