# #129388 `## Evidence` section for head 16541aa5 (proposed, not applied)

- `evidence-section.txt`: the section. `body-current.txt`: the live PR body as fetched (sha256 `e04b6162…`).
- `body-proposed.txt`: the live body, byte for byte, plus the appended section. `evidence.diff`: the diff (0 removed lines).
- `verdicts/`: upstream `evaluatePullRequestContext` (openclaw/openclaw `scripts/github/real-behavior-proof-policy.mjs`,
  blob `cfa3f9da52b99c80259c101fc1386a07a7e6e638` at main `08f45d611b7daa405258aa14f234500140a60aaf`) on the live PR
  object with `body` replaced: live body `missing ["Evidence"]`, proposed body `passed`, negative controls `missing`.
- `apply-evidence.py <pull.json|body.md> evidence-section.txt <out>`: inserts before the proofs-tail start marker if
  present, else appends; refuses if an `Evidence` heading exists. `evaluate-body.mjs <policy.mjs> <pull.json> <body>`.

Bound to openclaw/openclaw#129388. Applied only by the PR's presenter, after the head moves to
`16541aa5a8ee81f1e505a414e2d21a758c43cbc2`.

The three bodies are `.txt` so the repository formatter leaves their bytes alone: `body-proposed.txt` is the exact
PATCH payload (sha256 `3e1b020082745d0bc6d95e7701f324c420ee9c518a3b46391f5f888044f83baf`).
