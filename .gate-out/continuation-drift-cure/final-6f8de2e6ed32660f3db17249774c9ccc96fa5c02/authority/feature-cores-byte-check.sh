#!/usr/bin/env bash
# feature-cores-byte-check.sh — deterministic Gate 2 feature-byte preservation walker.
#
# HOME: karmaterminal/openclaw-bootstrap:tools/feature-cores-byte-check.sh
# DOC:  RUNBOOKS/PR-DRIFT-CURE-GATES-RUNBOOK.md — Gate 2 (Cure-bytes preserved)
# SIBLING: tools/drift-cure-gate.sh (Gate 2.7 — content-preservation, different gate)
#
# Run it FROM a karmaterminal/openclaw worktree.
#
# Reads the canonical primitive-cores list (tools/drift-cure-gate.primitive-cores.txt
# in openclaw-bootstrap) and checks feature-byte preservation.
#
# Directly unchanged blobs and explicit `!path` tombstones pass. With
# --upstream, a changed blob also passes when it is byte-identical to the exact
# result of applying merge-base..upstream to a temporary index seeded at
# PR-head. Overlaps that do not apply cleanly, candidate-only edits, and
# projected-blob mismatches fail closed.
#
# Why a separate script from drift-cure-gate.sh:
# - drift-cure-gate.sh = Gate 2.7 = upstream-content-preservation (HEAD vs upstream)
# - this script     = Gate 2   = LGTM-substrate preservation (HEAD vs PR-head)
# Different gates protect different invariants; conflating produces operator confusion.
#
# Usage:
#   tools/feature-cores-byte-check.sh <PR_HEAD_SHA> <CANDIDATE_SHA> [CORES_FILE] \
#     [--upstream <UPSTREAM_SHA>]
# Defaults: CORES_FILE = $OPENCLAW_BOOTSTRAP/tools/drift-cure-gate.primitive-cores.txt
#           or ../openclaw-bootstrap/tools/drift-cure-gate.primitive-cores.txt as fallback
#
# Exit codes:
#   0 = all primitive-cores preserved (Gate 2 PASS)
#   1 = at least one feature-core file is not preserved (Gate 2 FAIL)
#   2 = setup error (no cores file, no PR-head, etc.)
#
# READ-ONLY: never writes refs; only reads blobs.
set -u

PR_HEAD="${1:-}"
CANDIDATE="${2:-HEAD}"
CORES_FILE="${3:-}"
UPSTREAM_REF=""

if [ -z "$PR_HEAD" ]; then
  echo "usage: feature-cores-byte-check.sh <PR_HEAD_SHA> <CANDIDATE_SHA> [CORES_FILE] [--upstream <UPSTREAM_SHA>]" >&2
  echo "       (CANDIDATE defaults to HEAD; CORES_FILE auto-discovered)" >&2
  exit 2
fi

if [ "$CORES_FILE" = "--upstream" ]; then
  CORES_FILE=""
  UPSTREAM_REF="${4:-}"
elif [ "${4:-}" = "--upstream" ]; then
  UPSTREAM_REF="${5:-}"
elif [ -n "${4:-}" ]; then
  echo "::error::unknown argument: ${4}" >&2
  exit 2
fi

if { [ "${3:-}" = "--upstream" ] || [ "${4:-}" = "--upstream" ]; } && [ -z "$UPSTREAM_REF" ]; then
  echo "::error::--upstream requires a ref" >&2
  exit 2
fi

# Auto-discover cores file
if [ -z "$CORES_FILE" ]; then
  for candidate in \
    "${OPENCLAW_BOOTSTRAP:-}/tools/drift-cure-gate.primitive-cores.txt" \
    "../openclaw-bootstrap/tools/drift-cure-gate.primitive-cores.txt" \
    "../../openclaw-bootstrap/tools/drift-cure-gate.primitive-cores.txt"
  do
    if [ -f "$candidate" ]; then
      CORES_FILE="$candidate"
      break
    fi
  done
fi

if [ -z "$CORES_FILE" ] || [ ! -f "$CORES_FILE" ]; then
  echo "::error::primitive-cores file not found. Set OPENCLAW_BOOTSTRAP env var or pass explicitly." >&2
  echo "         tried: \$OPENCLAW_BOOTSTRAP/tools/drift-cure-gate.primitive-cores.txt" >&2
  echo "                ../openclaw-bootstrap/tools/drift-cure-gate.primitive-cores.txt" >&2
  exit 2
fi

# Verify refs exist
PR_HEAD_INPUT="$PR_HEAD"
CANDIDATE_INPUT="$CANDIDATE"
if ! PR_HEAD=$(git rev-parse --verify "${PR_HEAD_INPUT}^{commit}" 2>/dev/null); then
  echo "::error::PR_HEAD ref does not resolve: $PR_HEAD_INPUT" >&2
  exit 2
fi
if ! CANDIDATE=$(git rev-parse --verify "${CANDIDATE_INPUT}^{commit}" 2>/dev/null); then
  echo "::error::CANDIDATE ref does not resolve: $CANDIDATE_INPUT" >&2
  exit 2
fi

UPSTREAM_BASE=""
EXPECTED_INDEX=""
UPSTREAM_PATCH=""
APPLY_ERROR=""
if [ -n "$UPSTREAM_REF" ]; then
  UPSTREAM_INPUT="$UPSTREAM_REF"
  if ! UPSTREAM_REF=$(git rev-parse --verify "${UPSTREAM_INPUT}^{commit}" 2>/dev/null); then
    echo "::error::UPSTREAM ref does not resolve: $UPSTREAM_INPUT" >&2
    exit 2
  fi
  if ! git merge-base --is-ancestor "$PR_HEAD" "$CANDIDATE"; then
    echo "::error::PR_HEAD is not an ancestor of CANDIDATE" >&2
    exit 2
  fi
  if ! git merge-base --is-ancestor "$UPSTREAM_REF" "$CANDIDATE"; then
    echo "::error::UPSTREAM is not an ancestor of CANDIDATE" >&2
    exit 2
  fi
  if git merge-base --is-ancestor "$PR_HEAD" "$UPSTREAM_REF"; then
    echo "::error::UPSTREAM descends from PR_HEAD; supply the independent upstream parent" >&2
    exit 2
  fi
  if ! git rev-list --first-parent "$CANDIDATE" | grep -Fxq "$PR_HEAD"; then
    echo "::error::PR_HEAD is not on CANDIDATE's first-parent lineage" >&2
    exit 2
  fi
  upstream_parent_found=0
  while read -r _commit parents; do
    for parent in $parents; do
      if [ "$parent" = "$UPSTREAM_REF" ]; then
        upstream_parent_found=1
        break 2
      fi
    done
  done < <(git rev-list --first-parent --parents "$PR_HEAD..$CANDIDATE")
  if [ "$upstream_parent_found" -ne 1 ]; then
    echo "::error::UPSTREAM is not an exact merge parent on CANDIDATE's first-parent path" >&2
    exit 2
  fi
  UPSTREAM_BASE=$(git merge-base "$PR_HEAD" "$UPSTREAM_REF")
  if [ -z "$UPSTREAM_BASE" ]; then
    echo "::error::no merge-base between PR_HEAD and UPSTREAM" >&2
    exit 2
  fi
  EXPECTED_INDEX=$(mktemp)
  UPSTREAM_PATCH=$(mktemp)
  APPLY_ERROR=$(mktemp)
  rm -f "$EXPECTED_INDEX"
fi

trap '
  if [ -n "$EXPECTED_INDEX" ]; then rm -f "$EXPECTED_INDEX"; fi
  if [ -n "$UPSTREAM_PATCH" ]; then rm -f "$UPSTREAM_PATCH"; fi
  if [ -n "$APPLY_ERROR" ]; then rm -f "$APPLY_ERROR"; fi
' EXIT

echo "Gate 2 — feature-byte preservation check"
echo "  PR_HEAD:   $(git rev-parse --short "$PR_HEAD")"
echo "  CANDIDATE: $(git rev-parse --short "$CANDIDATE")"
if [ -n "$UPSTREAM_REF" ]; then
  echo "  UPSTREAM:  $(git rev-parse --short "$UPSTREAM_REF")"
  echo "  BASE:      $(git rev-parse --short "$UPSTREAM_BASE")"
fi
echo "  CORES:     $CORES_FILE"
echo

# Read cores list, strip comments + blank lines
cores_patterns=$(grep -vE '^[[:space:]]*#|^[[:space:]]*$' "$CORES_FILE" || true)
if [ -z "$cores_patterns" ]; then
  echo "::error::primitive-cores file is empty: $CORES_FILE" >&2
  exit 2
fi

# For each pattern, resolve to actual files via git ls-tree and check byte-identity.
#
# Pattern semantics (production resolver): `git ls-tree -r --name-only <SHA> -- "$pattern"`
#   - Explicit file paths: WORK
#   - Bare-directory pathspec (e.g. `src/foo`): WORKS via -r flag (dir-recursion)
#   - Tail-glob `*` as filename-fragment (e.g. `src/foo/bar*`): DOES NOT WORK (0 files)
#   - Pathspec magic `:(glob)`: NOT SUPPORTED ("pathspec magic not supported")
# 🪨 Rune `1510042016` substrate-of-record. See tools/drift-cure-gate.primitive-cores.txt header.
#
# 0-file resolution is a HARD ERROR (not a WARN) — silent-skip-of-feature-surface is the failure-mode
# the primitive-cores list was built to prevent. If a pattern resolves to 0 files, the cores list is
# substrate-of-record-broken; halt + surface so cohort can fix.

total=0
failed=0
upstream_preserved=0
tombstones_preserved=0
declare -a fail_list=()
declare -a empty_patterns=()
declare -A seen_files=()

projected_blob=""
projection_reason=""
project_upstream_blob() {
  local file="$1"
  local expected=""
  local apply_detail=""

  projected_blob=""
  projection_reason=""
  : > "$UPSTREAM_PATCH"
  : > "$APPLY_ERROR"

  git diff --binary --full-index "$UPSTREAM_BASE".."$UPSTREAM_REF" -- "$file" > "$UPSTREAM_PATCH"
  if [ ! -s "$UPSTREAM_PATCH" ]; then
    projection_reason="candidate changed but upstream has no delta for this path"
    return 1
  fi

  rm -f "$EXPECTED_INDEX"
  if ! GIT_INDEX_FILE="$EXPECTED_INDEX" git read-tree "$PR_HEAD"; then
    projection_reason="could not seed temporary index at PR_HEAD"
    return 1
  fi
  if ! GIT_INDEX_FILE="$EXPECTED_INDEX" git \
    -c apply.ignoreWhitespace=false \
    -c apply.whitespace=nowarn \
    apply --cached --3way --whitespace=nowarn "$UPSTREAM_PATCH" \
    >/dev/null 2>"$APPLY_ERROR"; then
    apply_detail=$(tr '\n' ' ' < "$APPLY_ERROR")
    projection_reason="upstream delta does not apply cleanly to PR_HEAD: ${apply_detail:-unknown git apply failure}"
    return 1
  fi

  expected=$(GIT_INDEX_FILE="$EXPECTED_INDEX" git rev-parse --verify --quiet ":$file" 2>/dev/null || true)
  projected_blob="$expected"
  return 0
}

while IFS= read -r pattern; do
  [ -z "$pattern" ] && continue
  if [[ "$pattern" == "!"* ]]; then
    tombstone="${pattern#!}"
    if [ -z "$tombstone" ]; then
      echo "  ERROR: empty tombstone pattern: $pattern" >&2
      empty_patterns+=("$pattern")
      continue
    fi
    total=$((total+1))
    tombstone_files=$(git ls-tree -r --name-only "$CANDIDATE" -- "$tombstone" 2>/dev/null || true)
    if [ -z "$tombstone_files" ]; then
      echo "  PASS-TOMBSTONE: $tombstone"
      tombstones_preserved=$((tombstones_preserved+1))
    else
      echo "  FAIL: $tombstone (tombstoned path is present in candidate)"
      failed=$((failed+1))
      fail_list+=("$tombstone")
    fi
    continue
  fi
  files=$(
    {
      git ls-tree -r --name-only "$PR_HEAD" -- "$pattern" 2>/dev/null || true
      git ls-tree -r --name-only "$CANDIDATE" -- "$pattern" 2>/dev/null || true
    } | sort -u
  )
  if [ -z "$files" ]; then
    echo "  ERROR: pattern resolves to 0 files in either tree: $pattern" >&2
    empty_patterns+=("$pattern")
    continue
  fi

  while IFS= read -r f; do
    [ -z "$f" ] && continue
    if [ -n "${seen_files[$f]:-}" ]; then
      continue
    fi
    seen_files["$f"]=1
    total=$((total+1))
    # Use blob hash comparison (faster + clearer than diff-bytes)
    head_blob=$(git rev-parse --verify --quiet "$PR_HEAD:$f" 2>/dev/null || echo "")
    cand_blob=$(git rev-parse --verify --quiet "$CANDIDATE:$f" 2>/dev/null || echo "")
    if [ "$head_blob" = "$cand_blob" ] && [ -n "$head_blob" ]; then
      echo "  PASS: $f"
    elif [ -n "$UPSTREAM_REF" ] && project_upstream_blob "$f" && [ "$projected_blob" = "$cand_blob" ]; then
      echo "  PASS-UPSTREAM: $f (exact projected blob $cand_blob)"
      upstream_preserved=$((upstream_preserved+1))
    else
      if [ -z "$head_blob" ]; then
        reason="absent in PR-head, present in candidate"
      elif [ -z "$cand_blob" ]; then
        reason="present in PR-head, absent in candidate — file deleted"
      else
        diff_bytes=$(git diff "$PR_HEAD".."$CANDIDATE" -- "$f" 2>/dev/null | wc -c)
        reason="blob $head_blob → $cand_blob; $diff_bytes bytes diff"
      fi
      if [ -n "$UPSTREAM_REF" ]; then
        if [ -n "$projection_reason" ]; then
          reason="$reason; $projection_reason"
        elif [ "$projected_blob" != "$cand_blob" ]; then
          reason="$reason; projected blob ${projected_blob:-<absent>} does not match candidate"
        fi
      fi
      echo "  FAIL: $f ($reason)"
      failed=$((failed+1))
      fail_list+=("$f")
    fi
  done <<< "$files"
done <<< "$cores_patterns"

echo
echo "Summary: $total primitive-core invariants; $failed FAIL; $upstream_preserved exact-upstream; $tombstones_preserved tombstone; ${#empty_patterns[@]} empty-pattern"
if [ "${#empty_patterns[@]}" -gt 0 ]; then
  echo "Gate 2 FAIL (setup-class) — ${#empty_patterns[@]} pattern(s) resolved to 0 files. Cores list is substrate-of-record-broken; fix before merge."
  echo
  echo "Empty patterns (likely tail-glob '*' or :(glob) magic that production resolver does not support):"
  for p in "${empty_patterns[@]}"; do echo "  - $p"; done
  exit 2
fi
if [ "$failed" -eq 0 ]; then
  if [ -n "$UPSTREAM_REF" ]; then
    echo "Gate 2 PASS — all feature-core blobs are byte-identical or exact upstream projections."
  else
    echo "Gate 2 PASS — all feature-cores byte-identical PR-head → CANDIDATE."
  fi
  exit 0
fi

echo "Gate 2 FAIL — $failed feature-core file(s) are neither byte-identical nor exact upstream projections."
echo
echo "Failed files:"
for f in "${fail_list[@]}"; do echo "  - $f"; done
exit 1
