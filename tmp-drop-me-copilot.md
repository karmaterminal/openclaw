# Journal — cael/999-forcesender-cleanse (copilot lane)

**Lane:** cael/999-forcesender-cleanse
**Issue:** karmaterminal/openclaw#1001
**Branch:** cael/20260613/999-forcesender-cleanse (off frond-scribe/20260613/assembly-drift-cure @599f7ba0, pushed remote-first)
**Back-merge source:** upstream/main @13a079b3f8462ac4689eb944a5aebf33a2adee8c
**Driver:** copilot CLI gpt-5.5 --reasoning-effort xhigh --yolo
**tmux:** oc-cael-999
**Host:** cael
**Outer budget:** 444m

---

## Checkpoints

- 2026-06-13T18:57:30+00:00: lane bootstrapped by dispatch-delegate. Worktree created at /tmp/oc-999-wt off assembly tip 599f7ba0, branch pushed remote-first to origin (minute-0). Tracking issue #1001 filed (label code-agent). WORKORDER.md + this journal committed. Copilot lane dispatch next.
  - Pre-flight confirmed: copilot smoke-test RC=0; assembly tip 599f7ba0; upstream/main 13a079b3f84; vestige grep = 36 files; webhook resolves.
  - Task: back-merge upstream/main + DROP forceSenderIsOwnerFalse (drop-and-rely; upstream replaced #858 conditional sanitize with unconditional sanitizeInboundSystemTags). 4 conflicts (3 keep-both + 1 toward-upstream). grep-gate=0 hard check (auto-merges invisibly). Gates: tsgo core+test+extensions + lint (+ full pnpm test if feasible). PR into ASSEMBLY branch only. NO merge — cohort byte-walks.
