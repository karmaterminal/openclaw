# GitNexus Preflight

Status: **BLOCKED before product edits**

## Named refs

| Category                       | Named ref                                                                | Full SHA                                   | Equality / evidence status                                                                                                                                                                                                                                   |
| ------------------------------ | ------------------------------------------------------------------------ | ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Product / base                 | `karmaterminal/openclaw@4f85d9974f6b9b180dc2304fdf672bbca154da66`        | `4f85d9974f6b9b180dc2304fdf672bbca154da66` | Local `HEAD` matched the workorder base before preflight.                                                                                                                                                                                                    |
| Safe lane                      | `codeagent/129388-recipient-authority-epoch-4f85-20260828`               | `4f85d9974f6b9b180dc2304fdf672bbca154da66` | Local, tracking, and server refs matched after publishing the unchanged branch.                                                                                                                                                                              |
| CI / workflow                  | N/A                                                                      | N/A                                        | No acceptance workflow was dispatched before the hard pre-edit failure. The workorder identifies prior product run `33130949624` at the base SHA, but the current GitHub identity received HTTP 404 while resolving it, so this lane credits no CI evidence. |
| Presentation                   | `codeagent/85651-upstream-1ba243c8-gates`                                | `4f85d9974f6b9b180dc2304fdf672bbca154da66` | Local tracking and server refs matched; read-only.                                                                                                                                                                                                           |
| Docs / proof                   | `openclaw/docs@main`, `PROOFS/4f85d9974f6b9b180dc2304fdf672bbca154da66/` | `1d023b1b9e48edcb409ddceda8988532ef1efc7d` | Workorder-pinned read-only ref; no docs evidence is credited by this blocked lane.                                                                                                                                                                           |
| Runtime composite / deployment | read-only composite                                                      | `b70aeb305f7a5d12b42baa6e164c50008924cee6` | Out of scope; no evidence credited.                                                                                                                                                                                                                          |

## Tool substrate

Verified before invoking the index:

- Fork origin: `https://github.com/karmaterminal/GitNexus.git`
- Fork HEAD: `3c1e686edfc1acaac882927cada121ddd7c47bcc`
- CLI: `/home/figs/flesh_beast_best_beast/source/GitNexus/gitnexus/dist/cli/index.js`
- CLI version: `1.6.5`
- Node: `/home/figs/actions-runner/externals.2.336.0/node24/bin/node`, `v24.18.0`
- Memory at preflight: 188 GiB total, 169 GiB available
- Dependency clone: clean detached `4f85d9974f6b9b180dc2304fdf672bbca154da66`
- Worktree `node_modules`: symlinked to the required exact dependency clone

The dispatch-created `BRIEF.md` and `launch.sh` were specifically excluded in the shared clone's
local `.git/info/exclude`; they were neither deleted nor committed. Product bytes were clean and
unchanged at the base SHA.

## Failed command

```bash
GITNEXUS_SKIP_OPTIONAL_GRAMMARS=1 \
  /home/figs/actions-runner/externals.2.336.0/node24/bin/node \
  /home/figs/flesh_beast_best_beast/source/GitNexus/gitnexus/dist/cli/index.js \
  analyze --index-only --skip-git \
  --name openclaw-129388-recipient-authority-4f85 \
  --workers 12 --worker-timeout 60 .
```

Exit status: `1`

```text
LadybugDB native binary (lbugjs.node) is missing.

This usually happens when the install lifecycle script was skipped.

To repair:
  node /home/figs/flesh_beast_best_beast/source/GitNexus/gitnexus/node_modules/@ladybugdb/core/install.js
```

The workorder says any indexing failure is a hard stop. The suggested installer was not run. No
global or upstream GitNexus fallback was used, none of the required pre-edit queries were attempted,
and no product or test bytes were edited.
