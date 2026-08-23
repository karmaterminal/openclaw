## Gate 5 intent packet — mandatory stop

### Frozen identities

- Presentation and live PR head:
  `c3a0e5a314ecbf572911d4b2e84595bd06f64d69`
- Proposed presentation target:
  `6f8de2e6ed32660f3db17249774c9ccc96fa5c02`
- Frozen upstream:
  `ab7d5c92ace7029727d9bacb537b069be9c32f03`
- Accepted source:
  `09b553e5fc7c2b3a26954046c1d9f52c55af4b40`
- Mode-B workflow:
  `6dd6c3a7712c8ae02937a29054525b2ddacb89c1`
- Durable Gate 4 proof checkpoint:
  `f902e51b589f88845bbb1867172b67c75e81e746`

Presentation remained untouched. Its tip is an ancestor of the proposed target
and a plain fast-forward is structurally possible.

### Required later ceremony

1. Figs shape review must explicitly decide whether the presentation may retain
   the candidate's 140 `.gate-out/` paths and `tmp-drop-me-claude.md`. If not,
   create a new candidate and rerun all invalidated gates and Mode-B; do not
   strip, rebase, squash, or rewrite this candidate.
2. Announce live Gate 5 intent naming the exact presentation and target SHAs.
3. Observe at least one frond tick.
4. Obtain a new explicit go signal.
5. Load the required presentation identity only in that later ceremony.
6. Re-verify presentation equality, candidate/proof freshness, and plain
   fast-forward geometry immediately before motion.
7. Perform only the authorized plain fast-forward, then verify exact equality.
8. Consider proof fire only after presentation resolves exactly to the accepted
   target.

`ronan-auth` was not loaded or used. No presentation credential was used. No
presentation push, PR-head mutation, deploy, runtime smoke, or behavioral proof
occurred.

**Stop at Gate 5. Gate 6 is not authorized.**
