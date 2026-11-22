# #129388 `## Evidence` section for head a329243b (proposed, not applied)

- `evidence-section.txt`: the replacement section. `body-current.txt`: the live PR body as fetched 2026-11-22T15:17Z
  (sha256 `bb0ca78c…`), whose Evidence section describes `16541aa5`.
- `body-proposed.txt`: the live body's bytes before `## Evidence`, unchanged, plus the new section (the old section was
  the body's last). `evidence.diff`: one hunk, starting inside the Evidence section.
- `verdicts/`: upstream `evaluatePullRequestContext` (openclaw/openclaw `scripts/github/real-behavior-proof-policy.mjs`,
  blob `cfa3f9da52b99c80259c101fc1386a07a7e6e638` at main `8d1e59c2fddcfefb29b3000ca8faa091e7aa8d13`) on the live PR
  object with `body` replaced: live body `passed`, proposed body `passed`, negative controls `missing`, both orders
  with the proofs-tail script `passed`.
- `replace-evidence.py <pull.json|body.md> evidence-section.txt <out>`: replaces the one `## Evidence` section up to
  the next level-1/2 heading, the proofs-tail start marker or the end; refuses on zero or several Evidence headings.
  `evaluate-body.mjs <policy.mjs> <pull.json> <body>`.
- `derive/`: the 72 deterministic failures joined to their classifications (`derive-classes.py`), and their first
  errors compared with `16541aa5`'s (`cmp-first-errors-vs-16541aa5.py`).

Bound to openclaw/openclaw#129388. Applied only by the PR's presenter, after approval of the draft.

The bodies are `.txt` so the repository formatter leaves their bytes alone: `body-proposed.txt` is the exact PATCH
payload (sha256 `a4493b13f7c40f13b45b3e2811c0e26e96add66f5e82a07e665e94416c35b65e`).
