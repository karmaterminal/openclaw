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

## 2026-08-27 repair retry

The orchestrator rebuilt only the pinned fork dependency and directed the lane to retry. Before the
retry:

- Local `HEAD`, tracking, and server refs all matched
  `70cbd14d1a2e608469758c227178ac62ada19cf3`; its parent remained exact product base
  `4f85d9974f6b9b180dc2304fdf672bbca154da66`.
- The tracked tree was clean.
- The dependency clone remained clean at exact base, all three manifest/lock/workspace blobs
  matched the product worktree, and the required `node_modules` symlink was unchanged.
- The pinned fork origin, HEAD, CLI version, and Node version remained exact.
- The repaired native byte existed at
  `/home/figs/flesh_beast_best_beast/source/GitNexus/gitnexus/node_modules/@ladybugdb/core/lbugjs.node`,
  was 27,740,456 bytes, and had SHA-256
  `1e4a305ac4d5b48e20e81ea404aa460623f64b93cd443352fa8894e543c05f3c`.
- Exact upstream product CI run `33130949624` resolved in `openclaw/openclaw` as successful at
  `4f85d9974f6b9b180dc2304fdf672bbca154da66`.
- Exact docs main resolved in `karmaterminal/karmaterminal-openclaw-docs` as
  `1d023b1b9e48edcb409ddceda8988532ef1efc7d`; the pinned proof corpus resolved there.

The exact mandatory index command was rerun unchanged. It failed with exit status `1` before
creating a creditable index:

```text
Error: No native build was found for platform=linux arch=x64 runtime=node abi=137 uv=1 libc=glibc node=24.18.0
    loaded from: /home/figs/flesh_beast_best_beast/source/GitNexus/gitnexus/node_modules/tree-sitter-kotlin
```

The renewed instruction again requires a hard stop if the repaired exact fork fails. No alternate
runtime, rebuild, package reconciliation, global CLI, graph fallback, product inspection, or
product/test edit was attempted. The required registry, query, context, and impact gates therefore
remain unsatisfied.

## 2026-08-27 complete native rebuild retry

The orchestrator rebuilt all dependencies in the pinned fork under Node `v24.18.0` with
`GITNEXUS_SKIP_OPTIONAL_GRAMMARS=1`. Exact clean lane, server/tracking equality, dependency clone
equality, and the required `node_modules` symlink were reverified.

Native artifacts verified before the retry:

| Artifact      | Path                                                                                                                                                  | SHA-256                                                            |
| ------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| LadybugDB     | `/home/figs/flesh_beast_best_beast/source/GitNexus/gitnexus/node_modules/@ladybugdb/core/lbugjs.node`                                                 | `1e4a305ac4d5b48e20e81ea404aa460623f64b93cd443352fa8894e543c05f3c` |
| Kotlin parser | `/home/figs/flesh_beast_best_beast/source/GitNexus/gitnexus/node_modules/tree-sitter-kotlin/build/Release/obj.target/tree_sitter_kotlin_binding.node` | `d298e442621171a38c8c929407a1dfbcbee2af1805c4b7d57a47ba671db6ccf7` |

The exact mandatory command was rerun unchanged. Both repaired dependencies loaded, but the command
still exited `1`:

```text
[gitnexus] Swift parsing disabled: vendored `tree-sitter-swift` (under
`gitnexus/vendor/tree-sitter-swift`) failed to load.
Cannot find module 'tree-sitter-swift'
Skipping 1125 swift file(s) — swift parser not available
```

No `.gitnexus` output was created and no registry artifact was found. Consequently the required
alias is not creditable, and no query, context, or impact call was attempted. The instruction for
any further index/query failure requires another hard stop before product inspection or edits.

## 2026-08-27 reviewed v1.6.10 candidate

Candidate of record:

- Repository: `karmaterminal/GitNexus`
- Branch: `codeagent/gitnexus-upstream-sync-20260828`
- Head: `90f97c2c8130db42e606c4b99e6201007b00c9c9`
- Version: `1.6.10`
- Integration commit: `673b8ed92bf26baebcdf9dcb401d56a94577269c`
- Integration parents:
  `3c1e686edfc1acaac882927cada121ddd7c47bcc` and
  `6088d2e309de134688cb465fc76988ce801e06c6`
- Dedicated checkout:
  `/home/figs/flesh_beast_best_beast/source/GitNexus-129388-90f97c2c`
- CLI:
  `/home/figs/flesh_beast_best_beast/source/GitNexus-129388-90f97c2c/gitnexus/dist/cli/index.js`

The candidate was installed and built only in the dedicated checkout. Because the runner's bundled
`npm` launcher has a broken relative module path, a session-local wrapper invoked its exact npm CLI
with Node `v24.18.0`; candidate source and lockfiles remained clean.

Native loads and hashes:

| Artifact                                                                         | Load   | SHA-256                                                            |
| -------------------------------------------------------------------------------- | ------ | ------------------------------------------------------------------ |
| `gitnexus/node_modules/@ladybugdb/core/lbugjs.node`                              | loaded | `2e7f7e899990d8eab58079763358c99315c37c6e2d8c4936db878ca1f62c0c0d` |
| `gitnexus/vendor/tree-sitter-kotlin/prebuilds/linux-x64/tree-sitter-kotlin.node` | loaded | `220f109e4e2ce3f27e5889bd326cf7dc1ec83c5a99ec022f60f023c240fc52a8` |
| `gitnexus/vendor/tree-sitter-swift/prebuilds/linux-x64/tree-sitter-swift.node`   | loaded | `9376099fff5847941bac216afa7142d7b3e98d8c2e5bc8c8c2de486693eeeaf6` |

The index target was clean and detached at exact product SHA
`4f85d9974f6b9b180dc2304fdf672bbca154da66`, with no pre-existing `.gitnexus`.
The reviewed candidate was then invoked with the required command shape:

```bash
GITNEXUS_SKIP_OPTIONAL_GRAMMARS=1 /usr/bin/time -v \
  /home/figs/actions-runner/actions-runner/externals.2.336.0/node24/bin/node \
  /home/figs/flesh_beast_best_beast/source/GitNexus-129388-90f97c2c/gitnexus/dist/cli/index.js \
  analyze --index-only --skip-git \
  --name openclaw-129388-recipient-authority-4f85 \
  --workers 12 --worker-timeout 60 .
```

Hard-stop result:

- Process exit: `1`
- Wall duration: `2:49.40`
- User/system CPU: `1516.97s` / `51.26s`
- Peak RSS: `13,147,132 KiB`
- Swift skipped: `1,125` files
- Kotlin skipped: `441` files
- Reason: candidate `1.6.10` treats `GITNEXUS_SKIP_OPTIONAL_GRAMMARS=1` as a runtime opt-out even
  when the verified native parsers load successfully.
- Terminal symbol/relationship/process counts: none; analysis stopped before a successful terminal
  summary.
- Partial artifact size: `8.6G`; it contained parse-cache and parsed-file worker output, not a
  readable registered index.
- Registry alias: absent from candidate `list` output.

The required retained TypeScript/JavaScript/Swift surface and clean terminal completion therefore
failed. The inspected partial `.gitnexus` directory was removed from the exact target, restoring its
clean tracked/untracked state. The full log is retained outside the repository at
`files/gitnexus-analyze-90f97c2c.log` in this Copilot session.

Per the hard gate, no recipient-authority graph queries, implementation-file reads, product/test
edits, or design verdict followed.
