# cont-usage-why: continuation-tool use after the ab5a cut

## Verdict

**SUPPORTED** — at `ab5a30ea79b776f149e24b1fccab9e79b0a5d299`, continuation tools are eligible for Tool Search deferral and Tool Search is enabled by default when unset. Five reachable prince seats leave `tools.toolSearch` unset and therefore resolve it on; the sixth, `cael`, could not be reached.

The evidence does not prove that Tool Search alone caused the measured call-rate drop, but it supports the stated mechanism: on the applicable fleet path, `continue_work` and `continue_delegate` are not in the always-presented set; models must discover them through Tool Search.

## Named refs

| ref                          | value                                                                                                                            | local                         | tracking / server                                        |
| ---------------------------- | -------------------------------------------------------------------------------------------------------------------------------- | ----------------------------- | -------------------------------------------------------- |
| product/base                 | `ab5a30ea79b776f149e24b1fccab9e79b0a5d299`                                                                                       | equal: lane HEAD              | server branch currently points to this SHA before REPORT |
| lane/safe branch             | `codeagent/cont-usage-why`                                                                                                       | report will advance lane HEAD | origin was published and matches at base gate            |
| pre-ab5a fleet build         | `0ab8db762f60254d93b7349a862c57e992ca6b43` (`0ab8db76`, recorded in the 2026-11-16 wake packet before elliott's ab5a cut canary) | local commit resolved         | N/A                                                      |
| CI/workflow                  | N/A: read-only investigation, no CI dispatch                                                                                     | N/A                           | N/A                                                      |
| presentation                 | N/A                                                                                                                              | N/A                           | N/A                                                      |
| docs/proof                   | `REPORT.md` in this lane                                                                                                         | pushed after commit           | origin lane branch                                       |
| July-August 2026 fleet build | Not found; no July/August wake packet pin was recovered in the searched local state                                              | N/A                           | N/A                                                      |

At the identity gate, `HEAD`, local `codeagent/cont-usage-why`, and `origin/codeagent/cont-usage-why` were all `ab5a30ea79b776f149e24b1fccab9e79b0a5d299`.

## ab5a tool presentation

The exact config resolver at ab5a is `src/agents/tool-search-config.ts:8-20`:

- `tools.toolSearch` unset: `setting === undefined`, so `enabled: setting ?? true` resolves to `true`.
- No authored setting or object: mode defaults to `"tools"`.
- Default search limit is 8; maximum is 20.
- `false`, including `{enabled:false}` or legacy boolean false, disables Tool Search.

Tool Search controls are activated by `includeToolSearchControls === true && toolSearchConfig.enabled` in `src/agents/agent-tools.assembly.ts:132-137`. The assembly:

- gets only host-ring-zero tools from `getActiveAgentRingZeroTools()` at `src/agents/agent-tools.assembly.ts:388-389`;
- creates `tool_search`, `tool_describe`, and `dispatch_action` controls only when Tool Search is enabled and ring zero is empty at `src/agents/agent-tools.assembly.ts:390-399`;
- adds ordinary tools, including continuation tools, to the assembled catalog at `src/agents/agent-tools.assembly.ts:421-501`;
- merges ring-zero tools ahead of the ordinary policy-filtered tools at `src/agents/agent-tools.assembly.ts:551-558` and `src/agents/agent-tools.ring-zero-context.ts:61-68`.

At ab5a, ring zero is not the continuation set. The harness defines ring-zero tools only from `internalParams.systemAgentTool` (`src/agents/harness/selection.ts:352-358`). Normal runs do not reserve `continue_work` or `continue_delegate` there.

The catalog application is `src/agents/tool-search.ts:224-240`: when enabled, it replaces visible eligible tools with Tool Search controls and registers hidden catalog entries. The surface plan keeps only `message` direct by default at `src/agents/tool-surface-plan.ts:128-152`. Therefore, on normal embedded/Copilot-style runs, eligible continuation tools are cataloged/deferred, not directly presented.

Continuation tool registration is conditional on `agents.defaults.continuation.enabled === true` at `src/agents/openclaw-tools.continuation.ts:29-34`. When enabled, `continue_work` is added if continuation callbacks exist, and `continue_delegate` is added for non-cron live runs at `src/agents/openclaw-tools.continuation.ts:36-57`.

## Fleet config evidence

Exact fields read: `tools.toolSearch`, `tools.codeMode`, and `agents.defaults.continuation.enabled`. No session, workspace, memory, or unrelated config fields were read.

| seat      | `tools.toolSearch`                           | `tools.codeMode` | `agents.defaults.continuation.enabled` | result                                    |
| --------- | -------------------------------------------- | ---------------- | -------------------------------------- | ----------------------------------------- |
| `silas`   | unset -> default enabled                     | unset            | `true`                                 | Tool Search enabled; continuation enabled |
| `elliott` | unset -> default enabled                     | unset            | `true`                                 | Tool Search enabled; continuation enabled |
| `emeric`  | unset -> default enabled                     | unset            | `true`                                 | Tool Search enabled; continuation enabled |
| `rune`    | unset -> default enabled                     | unset            | `true`                                 | Tool Search enabled; continuation enabled |
| `ronan`   | unset -> default enabled                     | unset            | `true`                                 | Tool Search enabled; continuation enabled |
| `cael`    | unreachable (`10.0.0.148: No route to host`) | unknown          | unknown                                | missing evidence                          |

The exact config field reads left `tools.codeMode` unset on the four fish seats reached plus ronan, so no authored Code Mode override took precedence over Tool Search on those seats. `tools.toolSearch` unset resolves to enabled in the ab5a code.

## History

- Tool Search runtime: `93acb3815958b3ff9f0b35ace9e28d4fc3a2bba1` (2026-05-10).
- Structured Tool Search became the default: `729c6b1cc3d0f4aecfceb9af36a815acbdc8f799` (2026-09-20). It is an ancestor of ab5a.
- Selectable Tool Search deferral: `3ff4a6cb278171d41ea377b5c4c6ca09bcadcfb7` (2026-10-23). It is an ancestor of ab5a.
- The pre-ab5a build was `0ab8db762f60254d93b7349a862c57e992ca6b43`, and Tool Search also resolves to enabled by default in that blob. Thus, on that build too, the mechanism could be on if the build had an equivalent catalog assembly and continuation config; the evidence for this lane is not a claim that every pre-ab5a seat had continuation enabled.
- July-August: no exact fleet build SHA was recoverable from the searched wake-packet state. The Tool Search structured-default commit is dated 2026-09-20, so it was not present in July/August main-history state; the older opt-in/runtime implementation had introduced some Tool Search behavior earlier.
- Continuation tools existed in both `0ab8db76` and ab5a. Deferring an ordinary continuation tool is determined by Tool Search catalog assembly, not by a continuation-specific deferral commit.

## Other ab5a plausible presentation changes

The ab5a build changed continuation tool descriptions relative to `0ab8db76`:

- `continue_work` description: commit `dd473dddfadcc4fa78196d83df4151b8f0c6a14e` and surrounding continuation work clarified timing and wake behavior.
- `continue_delegate` description: commit `b58e3672573bc577260e7bc725311bdf156e6f8e` and the ab5a diff replaced a simple dispatch description with a bounded-continuation-tree description, direct-spawn guidance, yield guidance, model inheritance, and accepted-vs-completed warnings.

Those description changes could alter model retrieval and selection, but they are secondary evidence, not proof of the measured reduction. The stronger candidate remains default Tool Search cataloging of eligible continuation tools.

## Final assessment

The hypothesis is **SUPPORTED** for five of six seats and **UNCLEAR** for `cael` only because exact config evidence could not be read. The supported result is:

1. Tool Search is enabled by default when unset.
2. `continue_work` and `continue_delegate` are ordinary assembled tools in ab5a.
3. Ab5a's catalog application hides eligible ordinary tools and presents only the search controls plus direct-only tools.
4. Five reached seats explicitly leave Tool Search unset and leave continuation enabled.
