## Independent Mode-B receipt review

- Reviewer: `mode-b-receipt-reviewer` — GPT-5.6 Terra rubber-duck.
- Run: `32642373348`
- Candidate: `6f8de2e6ed32660f3db17249774c9ccc96fa5c02`
- Workflow: `6dd6c3a7712c8ae02937a29054525b2ddacb89c1`

The reviewer independently recomputed:

- 163/163 routed shards;
- 69/69 unique batch receipts;
- zero target, workflow, ruleset, planner, or run-ID mismatch;
- 55 hosted, 12 self-hosted, and two self-hosted-dist batches;
- 163,370 passed tests, 37 initial failures, 24 greened flakes, and 13
  deterministic rows;
- all five static owners green.

The exact workflow conclusion remains `failure`. The reviewer accepted both red
families as baseline-proven infrastructure:

1. `agentic-commands-doctor`: one hosted timeout despite byte-identical
   accepted/upstream/candidate test and owner; exact candidate focused and
   two-CPU full-file reruns passed.
2. `core-runtime-tui-pty`: 12 startup failures from a missing preinstalled
   `@openclaw/ai` package output whose manifest/source are byte-identical across
   accepted source, frozen upstream, and candidate; a correct isolated build
   contains the file and exact local real-backend cases pass.

Final disposition: **PASS as a complete baseline-classified receipt**. The
workflow is not represented as green. No candidate finding.
