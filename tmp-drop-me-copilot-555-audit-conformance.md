# Copilot dispatch journal: #555 vs frond-scribe otel-audit conformance

## Lane
silas/copilot-555-audit-conformance (gpt-5.5 xhigh via copilot CLI on silas-seat)

## Branch
silas/copilot-555-audit-conformance (based on silas/2026-05-03/rfc-6x-trace-context-propagation @ d090cedae3 = current PR #555 HEAD)

## Worktree
/tmp/silas-copilot-555-conformance/ (host: silas)

## Mission
Dispatch GitHub Copilot CLI (gpt-5.5 xhigh) to byte-walk PR #555's §6.8 trace-context propagation contract against frond-scribe's otel-audit final journal at branch `frond-scribe/20260503/otel-traceparent-audit:tmp-drop-me-otel-traceparent-audit.md` (final SHA 1e966b8a70).

The audit classified all 7 questions GAP/PARTIAL with byte-anchored file:line refs and 7 implementation seams. §6.8 specifies the contract spec built on those seams.

Question for copilot: does §6.8's prose conform shape-for-shape to what the audit found? Specifically:
- Are all 7 audit seams addressed in §6.8's seam map?
- Does the producer-IN table (5 surfaces) match the audit's Q1 GAP findings byte-for-byte?
- Does the return-OUT four-mode coverage (default/targeted/multi/fanout) match the audit's Q2-Q5 findings?
- Does the restart-resilience contract name the actual replay sinks the audit identified (Q6)?
- Does the anti-flood section preserve the chain-step-not-recipient-accounting rule the audit verified Q7 was missing?

Output: copilot writes a conformance verdict (CONFORMANT / PARTIAL / NON-CONFORMANT) per audit question, with byte-anchored deltas where §6.8 prose drifts from audit findings. If gaps surface, copilot proposes specific RFC prose changes.

## Conflict / decision policy
- Read-only on existing #555 prose unless copilot proposes changes
- All proposed changes → workorder summary, NOT direct edit on the RFC
- Silas (me) reviews copilot output and applies changes via separate commit on this branch if conformance gaps surface

## Scope guardrails
- WILL NOT touch any other RFC sections
- WILL NOT touch any code seams (this is doc-only conformance audit)
- WILL NOT push directly to PR #555 branch — proposals only

## Heartbeat
Will surface progress + completion to channel via message_tool from silas-seat (no webhook needed for this lane; one-shot conformance audit).

## Discoverability
git fetch origin silas/copilot-555-audit-conformance
git show origin/silas/copilot-555-audit-conformance:tmp-drop-me-copilot-555-audit-conformance.md | tail -80
