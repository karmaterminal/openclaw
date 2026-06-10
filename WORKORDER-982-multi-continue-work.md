# WORKORDER — #982: multi-`continue_work()` silent-drop (single-variable capture)

## Brief
- **Repo:** `karmaterminal/openclaw`
- **Base branch:** `frond-scribe/20260609/assembly-token-wiring` (= `4bbd3aec096…`). **The bug lives ONLY on this assembly lineage — it is NOT on `main` or upstream** (introduced by `8e04d27f1a`, the continuation-replay). Base + PR-target this branch, NOT main.
- **Issue:** #982 — multiple `continue_work()` tool-calls in one response all return `{status:"scheduled"}` but only the LAST survives; the first N-1 are **silently dropped** (no warning, no log, no rejection).
- **Success:** N `continue_work()` calls in one response each schedule + each deliver as a distinct turn at its own offset. No silent drops. Full `pnpm test` suite green on the fix HEAD.

## Root cause (byte-confirmed)
The continuation **store + dispatch + TaskFlow already support N concurrent flows** (keyed by `flowId`). The bottleneck is a **single-variable capture** in the tool-callback closure that collapses N requests → 1 before they reach TaskFlow. The same pattern exists at **three sibling closures** (half-symmetric — fixing one leaves the others dropping):

| File | decl | overwrite | consumption |
|---|---|---|---|
| `src/agents/command/attempt-execution.ts` | L706 | L710 `attemptContinueWorkRequest = request` | L935 (spawn-init/turn-1 subagent) |
| `src/auto-reply/reply/agent-runner-execution.ts` | L2481 | L2552 | L2951 (main reply lane — the user-repro path) |
| `src/auto-reply/reply/followup-runner.ts` | L766 | L1045 | L1267 / L1309 (followup) |

## Steps
1. At **each of the 3 closures**: change the single capture (`let req: ContinueWorkRequest | undefined` + `req = request`) to an **array accumulate** (`const requests: ContinueWorkRequest[] = []` + `requests.push(request)` in the `requestContinuation` callback).
2. At **each consumption site** (L935 / L2951 / L1267-1309): iterate the array and schedule **each** request (call the existing schedule path per-element). A single `continue_work` is just a 1-element array — no semantic change for the common case. The downstream work-store/work-dispatch already handle N (unique `flowId`, soonest-timer, drain-all-due).
3. **Lying-status cure:** if for any lane multi-schedule is intentionally out-of-scope, the 2nd+ call must return `{status:"rejected", reason:...}` — NEVER `{status:"scheduled"}` then drop. Silent-accept-and-drop is the dangerous shape and must die regardless.
4. Add a **3-fire unit test** (vitest) asserting 3 `continue_work()` in one turn → 3 distinct scheduled flows (distinct flowIds / 3 hedge-arms), not 1.

## Tests (completion criterion — NOT a subset)
- **MUST run the full suite:** `pnpm build && pnpm check && pnpm test` (full `scripts/test-projects.mjs`, not `vitest run` on touched files). Capture exit codes + per-shard pass/fail tallies into `output.md`.
- Classify any failing shard as (a) cure-introduced, (b) pre-existing, or (c) baseline-drift (per PR-DRIFT-CURE-GATES Gate-3 matrix). Completion = full-suite green on fix HEAD (modulo documented not-ours).

## Output (`output.md`)
- exact diff per closure + consumption site
- the new 3-fire test + its result
- full-suite `pnpm test` exit code + per-shard tallies + classification of any fails
- confirmation all 3 closures fixed (no half-symmetric residue)

## Constraints
- Do NOT touch unrelated code. Surgical: the 3 captures + their consumption sites + the lying-status guard + the test.
- Preserve single-`continue_work` semantics exactly (1-element array path).
- Reviewer: 🌫 Silas (filed the issue, has the repro).
