# Issue 1229 — Discord durable-ingress backlog red reproducer

## Scope

- Issue: `karmaterminal/openclaw#1229`
- Branch: `codeagent/emeric-1229-ingress-backlog-red`
- Base: `bf0aadbc40c25a2d5231f7736633f5fa68ebca5b`
- Goal: add deterministic focused tests that reproduce the durable-ingress head-of-line/backlog behavior and fail on the unmodified product.
- Stop boundary: red test receipt only. Do not implement the product fix, open a PR, merge, deploy, mutate a live queue, or run broad CI.

## Grounded incident frame

- A same-channel head row completed after 496 attempts and 30.52 hours.
- Later pending rows drained oldest-first as fresh room turns.
- Bound direct-message examples were admitted 13.06 hours and 3.48 hours late.
- No second Discord ingress, dead-letter resubmit, outbound duplicate, or continuation cause is claimed.

## Required proof

Use controlled stores/fake time rather than sleeps or a live Discord gateway. Prefer the narrowest owning queue/monitor tests that prove:

1. a retry-delayed or recovered head event can block a newer event in the same lane;
2. an hours-old Discord ambient event can still be adopted as current after recovery because no freshness disposition exists; and
3. the focused test is green before the new assertion and red after it, with the exact failure captured.

Record touched files, exact commands, baseline/result, and the first missing ownership boundary here. Commit and push the test-only red reproducer; do not patch behavior.
