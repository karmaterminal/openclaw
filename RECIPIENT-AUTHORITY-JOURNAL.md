# Recipient Authority Journal

## 2026-08-27: blocked pre-edit

Issue binding: `openclaw/openclaw#129388`

The unchanged output lane was published at
`4f85d9974f6b9b180dc2304fdf672bbca154da66`. The exact cooperative GitNexus fork, CLI version, Node
runtime, memory, dependency clone, and lane identity were verified. The mandatory fresh index then
failed because the fork's installed `@ladybugdb/core` lacks `lbugjs.node`.

Per the workorder's hard gate, work stopped before graph queries, old-lane comparison, design
decisions, product edits, tests, `detect-changes`, build, or acceptance CI. No behavioral conclusion
or proof is claimed. See `GITNEXUS-PREFLIGHT.md` for exact refs, command, and failure output.

Limit: the current GitHub identity also received HTTP 404 when resolving prior run `33130949624`;
that prior run is not credited as lane evidence.

## 2026-08-27: repaired-byte retry blocked

The orchestrator materialized the missing LadybugDB native byte and directed a retry. The byte was
verified under the exact pinned fork and Node runtime, and corrected repository identities resolved
the prior product CI and docs refs successfully.

The unchanged mandatory index command then failed on a second pinned-fork native dependency:
`tree-sitter-kotlin` has no Linux x64 Node 24 ABI 137 build in the installed dependency tree. The
renewed workorder explicitly requires another stop if the exact repaired fork still fails.
Accordingly, no `.gitnexus` output or registry alias is credited, no required query ran, and no
product/test design or implementation work began.

Correction to the prior limit: run `33130949624` is in `openclaw/openclaw`, where it resolves as a
successful CI run for exact product SHA `4f85d9974f6b9b180dc2304fdf672bbca154da66`.

## 2026-08-27: complete native rebuild retry blocked

The full pinned-fork rebuild supplied working LadybugDB and Kotlin native artifacts; their exact
paths and SHA-256 hashes are recorded in `GITNEXUS-PREFLIGHT.md`.

The mandatory index advanced farther but exited `1` because vendored `tree-sitter-swift` remained
unloadable, causing 1,125 Swift files to be skipped. The command produced no `.gitnexus` directory
or creditable registered alias. Per the renewed hard gate, work stopped before every named graph
query and before any product/test inspection or edit.

## 2026-08-27: reviewed v1.6.10 scale gate blocked

The reviewed GitNexus candidate `90f97c2c8130db42e606c4b99e6201007b00c9c9` was cloned into a
dedicated checkout, installed and built under Node 24, and verified clean. Its LadybugDB, Kotlin,
and Swift native modules all loaded directly; hashes and ancestry are in `GITNEXUS-PREFLIGHT.md`.

The fresh exact-4f85 scale index nevertheless failed the workorder contract. With the mandated
`GITNEXUS_SKIP_OPTIONAL_GRAMMARS=1`, v1.6.10 explicitly disables optional grammars at runtime,
skipping the entire 1,125-file Swift and 441-file Kotlin surfaces before exiting `1`. No terminal
graph counts or registered alias were produced. Peak RSS was 13,147,132 KiB and wall time was
2:49.40.

The 8.6G partial parse artifact was inspected and removed from the dedicated exact-4f85 target.
That checkout and the product lane remain clean. This is a material candidate verdict: it cannot
satisfy the required OpenClaw-scale retained-Swift graph gate with the mandated environment.
Product/test implementation remains at zero bytes.
