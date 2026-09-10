# Continuation rebuild evidence

Bound issue: `openclaw/openclaw#129388`

## Named-ref contract

| Category | Named ref | Full SHA | Equality before evidence |
|---|---|---|---|
| Product/base ref | `openclaw/openclaw:main` | `00a859634fbf259b8de773a8f116aeb5094070b9` | local product base equals the workorder's write-byte upstream |
| Safe lane ref | `karmaterminal/openclaw:codeagent/rebuild-continuation-current-upstream-v2` | `00a859634fbf259b8de773a8f116aeb5094070b9` | local = tracking = server |
| CI/workflow ref | N/A | N/A | Actions are explicitly excluded; this lane uses focused-only acceptance |
| Presentation ref | N/A | N/A | No PR or presentation change is authorized |
| Docs/proof ref | `karmaterminal/openclaw:codeagent/rebuild-continuation-current-upstream-v2` | `00a859634fbf259b8de773a8f116aeb5094070b9` | `output.md` begins on the published safe lane and will be frozen with the implementation |

## Rebuild audit

**Verdict: BLOCKED before implementation.** The authorized semantic inputs do
not contain the continuation feature baseline needed to receive their deltas,
and the workorder explicitly prohibits using the only named baseline snapshot,
`f16aa2e0118b616d1a1c31bb64a56b7da756a224`.

Current upstream has no matches for `request_compaction`, `continue_work`, or
`continue_delegate` in the production source tree and has no
`src/auto-reply/continuation/` directory. The nine inputs are incremental
modifications atop trees that already contain those files:

| Input | Parent | Touched | Added by input | Touched paths absent on fresh base |
|---|---|---:|---:|---:|
| `4f3ed1f13dd4b562ced2a293c9f980bf8a6dd170` | `f16aa2e0118b616d1a1c31bb64a56b7da756a224` | 3 | 0 | 3 |
| `af4d5c901ff7ed43882812d2be3caec38dd48953` | `4f3ed1f13dd4b562ced2a293c9f980bf8a6dd170` | 2 | 0 | 2 |
| `f2139b3497f9f16ee498302892bcf8e24d6ae71f` | `af4d5c901ff7ed43882812d2be3caec38dd48953` | 1 | 0 | 1 |
| `dedcc84b1c57cb94be7df4c8c47c968cc724b5ba` | `7152de29eb25335e6afe1c83a6250ae4984fa1b8` | 7 | 0 | 5 |
| `1bfe94efa22f09808345babe413326d6bd02f50a` | `dedcc84b1c57cb94be7df4c8c47c968cc724b5ba` | 2 | 0 | 2 |
| `d3f8c4958a294b84094e3b8c4faa259345905cd7` | `1bfe94efa22f09808345babe413326d6bd02f50a` | 18 | 0 | 15 |
| `fc4e29c12aec3512bfa97877706dfa7e31e6b939` | `d3f8c4958a294b84094e3b8c4faa259345905cd7` | 2 | 0 | 2 |
| `e7eec0e6eefe2c90584d60988a5c962933e09a40` | `e159fd6fe16f982a83395ed25921b97c5fda2062` | 17 | 1 | 12 |
| `64a21f17cbc9f8861f8999f6e77b100409dcc133` | `a84db0b626d3c57ec60fd554b943bcd6960bdefe` | 21 | 4 | 19 |

Representative object-level three-way evidence:

| Path | Fresh-base blob | Input-parent blob | Input blob | Result blob | Decision |
|---|---|---|---|---|---|
| `src/agents/tools/request-compaction-tool.ts` | absent | `8fc820eed56efa203f4dcb732b321237a6ce63ce` | `a4bf1e326395c6ea2c968add837c928eff35e9a5` (`dedcc84b`) | absent | Dropped because the authorized input only modifies an excluded baseline file; inventing the missing tool would exceed the named inputs. |
| `src/auto-reply/continuation/delegate-dispatch.ts` | absent | `84bf9e32f3139e411844005910bae7141b38a86c` | `c569e37c6d2579c2ad66f5ed54d8677db6cdb4e1` (`e7eec0e`) | absent | Dropped because the authorized input only modifies an excluded baseline file; importing its full input blob would silently retain historical snapshot content rather than re-derive the hunk. |

The same dependency gap prevents the required deterministic negative controls:
there is no fresh-base continuation composition boundary on which the named
fixes can fail for their expected owner-fencing reasons. Creating tests or
production files from the input blobs would erase the required negative
control and violate the prohibition on replaying the historical snapshot.

No production, test, fixture, Mac, Telegram, generated budget, or heartbeat
bytes were changed. No `a81ea4b005c`, `c39c700980c`, or `f16aa2e0` content was
patched, cherry-picked, or retained.

## Validation

- Published the unchanged safe lane and verified local, tracking, and server
  equality at `00a859634fbf259b8de773a8f116aeb5094070b9`.
- Inspected every authorized input's parent, changed-path status, and
  fresh-base object presence with `git diff-tree`, `git cat-file`, and
  `git rev-parse`.
- CI path: `focused-only`; no Actions were dispatched, as required.
- Focused tests, build, extension QA, generated budgets, heartbeat tests, and
  fixture boundaries were not run because implementation is blocked before a
  valid negative control can be constructed.

Unblocking requires an explicitly authorized continuation feature baseline (or
the complete continuation-owned file/blob manifest independent of
`f16aa2e0`) against which the nine named incremental inputs can be re-derived.
