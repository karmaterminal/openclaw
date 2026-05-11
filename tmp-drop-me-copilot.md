# Journal: elliott-oom-diagnostic-20260511 / copilot lane

## 2026-05-11 09:30 PDT — lane initialized

- Worktree: /tmp/oc-elliott-oom-diagnostic-20260511
- Branch: ronan/elliott-oom-diagnostic-20260511/copilot @ 7afc8dc10b (canonical frond/v2026.5.7/canonical)
- Tracking issue: karmaterminal/openclaw#649
- WORKORDER.md written, awaiting copilot dispatch
- Origin: figs canon msg 1503404825 2026-05-11 07:34 PDT — replace "stabbing" with method on Elliott V8-OOM 8-10x/hour
- Scope: READ-ONLY deep investigation. NO mutation. SSH to elliott permitted for read-only diagnostic ONLY.

## 2026-05-11 09:35 PDT — WORKORDER amendment (cite-pin from cohort byte-walk)

- 🩸 cael-seat byte-walk just landed at msg 1503405081
- AMENDED §1 + ADDED §1.5 LIVE COHORT BYTE-EVIDENCE
- Copied LOCAL-PRINCE-CODE-AGENT-RUNBOOK.md + LOCAL-GATEWAY-LEAK-CANARY-RUNBOOK.md + LOCAL-memory-2026-05-11.md into worktree (paths corrected from absolute to local)
- Cite-pin: cael-seat shows cache-invalidation cascade (14.4M-token drops) + 2× FailoverError "unknown error" 5m24s = same family figs named "5xx-shape"
- Sharpens hypothesis: investigate cache-invalidation-cascade as primary heap-pressure source on elliott (not just heap-fill from message volume)
- Producer-2 mechanism named: formatSkillsForPrompt re-allocating per rebuild → systemPrompt digest changes → cache invalidates → V8 retains fragments
