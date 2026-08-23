#!/usr/bin/env bash
# drift-cure-gate.sh — upstream-content-preservation gate for long-running force-push-squash PRs.
#
# HOME: karmaterminal/openclaw-bootstrap:tools/drift-cure-gate.sh
# DOC:  tools/DRIFT-CURE-GATE.md (operator notes)
# GATE: RUNBOOKS/PR-DRIFT-CURE-GATES-RUNBOOK.md — Gate 2.7 (Upstream-Content-Preservation)
# CI:   .github/workflows/drift-cure-gate.yml (cross-repo runner against karmaterminal/openclaw)
#
# Run it FROM a karmaterminal/openclaw worktree (it walks that repo's git history).
#
# Problem it detects: a rebased/squashed feature branch silently shipping STALE copies of
# shared files, thereby reverting upstream fixes that landed after the feature's content was
# last reconciled. The squash captures a frozen working tree, so the squashed commit's own
# diff-vs-base *manufactures a revert* for every shared file frozen before the base — and git's
# 3-way merge resolves it with ZERO conflicts (only our side touched those files since base), so
# rerere / zdiff3 / -X strategies never engage. See DRIFT-CURE-GATE-REPORT.md §1 "reverse-clobber via frozen
# working tree" + PR-DRIFT-CURE-GATES-RUNBOOK.md Gate 2.7. Substrate-of-record: openclaw#85651
# N+7 (codex review comment 4524413167) — 4 hand-caught regressions; this gate finds 376/583.
#
# It classifies every reviewer-visible PR file into:
#   SAFE-NEW         file does not exist in upstream (pure feature addition)
#   SAFE-CURRENT     HEAD:file == upstream:file  (carries current upstream; legit absorption)
#   FROZEN-STALE     HEAD:file == a *historical* upstream blob (we dragged an old snapshot) [Layer B]
#   MIXED-CLOBBER    HEAD has genuine edits BUT drops upstream lines added after PR-creation [Layer C]
#   GENUINE          genuine feature content, no detectable upstream drop
#
# FROZEN-STALE is a high-confidence, auto-fixable pure clobber (FAIL the gate; baseline-INDEPENDENT).
# MIXED-CLOBBER is a ranked triage queue (count of dropped post-fork upstream lines + which commits).
#
# Usage:
#   tools/drift-cure-gate.sh [UPSTREAM_REF] [HEAD_REF] [PRCREATE_REF] [OUTDIR]
# Defaults: upstream/main  HEAD  <merge-base if PRCREATE unset>  ./gate-out
# Env:      HIST_CAP=200  (how far back to walk upstream history for a frozen-blob match)
#
# READ-ONLY: never writes to git refs; only reads blobs/history and writes report files to OUTDIR.
# Robust against SIGPIPE from history truncation: no pipefail, no errexit.
set -u

UPSTREAM="${1:-upstream/main}"
HEAD_REF="${2:-HEAD}"
HIST_CAP="${HIST_CAP:-200}"   # how far back to walk upstream history for a frozen-blob match

BASE="$(git merge-base "$UPSTREAM" "$HEAD_REF")"
# PRCREATE defaults to the merge-base (rebase base) when not supplied. Passing the TRUE
# PR-creation SHA sharpens the MIXED-CLOBBER ranking (Layer C) but never changes the FROZEN-STALE
# FAIL verdict (Layer B is baseline-free). Derive the true SHA via:
#   gh pr view <N> --repo karmaterminal/openclaw --json commits --jq '.commits[0].oid'
PRCREATE="${3:-$BASE}"

OUTDIR_DEFAULT="./gate-out"
OUTDIR="${4:-$OUTDIR_DEFAULT}"

mkdir -p "$OUTDIR"

TSV="$OUTDIR/classification.tsv"
: > "$TSV"
printf 'class\tdropped_lines\tfile\tdetail\n' >> "$TSV"

# Pre-resolve current-upstream tree blobs once: path<TAB>blob
declare -A UPBLOB
while read -r _ _ blob path; do
  UPBLOB["$path"]="$blob"
done < <(git ls-tree -r "$UPSTREAM")

# helper: strip diff noise (blank lines, lone punctuation) so trivial lines don't inflate counts
nontrivial() { grep -vE '^[[:space:]]*$' | grep -vE '^[[:space:]]*[][(){};,]+[[:space:]]*$'; }

files="$(git diff "$BASE...$HEAD_REF" --name-only)"
total=0
while IFS= read -r f; do
  [ -z "$f" ] && continue
  total=$((total+1))
  hblob="$(git rev-parse "$HEAD_REF:$f" 2>/dev/null || true)"
  ublob="${UPBLOB[$f]:-}"

  # SAFE-NEW: not in upstream at all
  if [ -z "$ublob" ]; then
    printf 'SAFE-NEW\t0\t%s\t-\n' "$f" >> "$TSV"; continue
  fi
  # SAFE-CURRENT: identical to current upstream
  if [ "$hblob" = "$ublob" ]; then
    printf 'SAFE-CURRENT\t0\t%s\t-\n' "$f" >> "$TSV"; continue
  fi

  # Layer B: does HEAD:f equal a *historical* upstream blob? -> FROZEN-STALE pure clobber.
  # One --raw log call per file (post-image blob is field 4 of the ':...' lines); no per-commit rev-parse.
  frozen=""
  cur_sha=""
  while IFS= read -r ln; do
    case "$ln" in
      :*) b="$(printf '%s' "$ln" | awk '{print $4}')"
          if [ "$b" = "$hblob" ]; then frozen="$cur_sha"; break; fi ;;
      ?*) cur_sha="$ln" ;;
    esac
  done < <(git log -n "$HIST_CAP" "$UPSTREAM" --no-renames --no-abbrev --format='%H' --raw -- "$f" 2>/dev/null)
  if [ -n "$frozen" ]; then
    d="$(git show -s --format='%cs %s' "$frozen" | cut -c1-60)"
    printf 'FROZEN-STALE\t-1\t%s\tHEAD==upstream@%s (%s)\n' "$f" "${frozen:0:10}" "$d" >> "$TSV"
    continue
  fi

  # Layer C: clobber lines = present in current upstream, absent from HEAD, absent from PR-creation.
  #   = upstream content gained AFTER our fork that our PR never picked up.
  up="$(git show "$UPSTREAM:$f" 2>/dev/null || true)"
  hd="$(git show "$HEAD_REF:$f" 2>/dev/null || true)"
  pc="$(git show "$PRCREATE:$f" 2>/dev/null || true)"
  clob="$(comm -23 \
            <(printf '%s\n' "$up" | sort -u) \
            <(printf '%s\n' "$hd" | sort -u) \
          | grep -Fxv -f <(printf '%s\n' "$pc") 2>/dev/null | nontrivial || true)"
  n="$(printf '%s' "$clob" | grep -c . || true)"
  if [ "${n:-0}" -gt 0 ]; then
    # name the upstream commit that introduced the first dropped line (Gate-0 evidence)
    first="${clob%%$'\n'*}"
    intro="$(git log -n1 -S"$first" --oneline "$PRCREATE..$UPSTREAM" -- "$f" 2>/dev/null | cut -c1-58)"
    printf 'MIXED-CLOBBER\t%s\t%s\t%s\n' "$n" "$f" "${intro:-?}" >> "$TSV"
  else
    printf 'GENUINE\t0\t%s\t-\n' "$f" >> "$TSV"
  fi
done <<< "$files"

# ---- summary ----
echo "drift-cure-gate: $UPSTREAM  HEAD=$HEAD_REF  base=$(git rev-parse --short "$BASE")  PRcreate=$(git rev-parse --short "$PRCREATE" 2>/dev/null || echo "$PRCREATE")"
echo "files examined: $total"
echo
awk -F'\t' 'NR>1{c[$1]++} END{for(k in c) printf "  %-14s %d\n", k, c[k]}' "$TSV" | sort
echo
echo "== FROZEN-STALE (high-confidence pure clobber; re-sync to upstream) =="
awk -F'\t' '$1=="FROZEN-STALE"{printf "  %-58s %s\n",$3,$4}' "$TSV"
echo
echo "== MIXED-CLOBBER (ranked by dropped post-fork upstream lines; triage top-down) =="
awk -F'\t' '$1=="MIXED-CLOBBER"{print}' "$TSV" | sort -t$'\t' -k2 -rn \
  | awk -F'\t' '{printf "  %5s  %-52s %s\n",$2,$3,$4}'
echo
echo "full TSV: $TSV"

# ---- exit code: FROZEN-STALE present => fail (Gate 2.7 FAIL condition) ----
frozen_count="$(awk -F'\t' '$1=="FROZEN-STALE"' "$TSV" | grep -c . || true)"
if [ "${frozen_count:-0}" -gt 0 ]; then
  echo
  echo "GATE 2.7 FAIL: ${frozen_count} FROZEN-STALE file(s) revert upstream content — re-sync before push."
  exit 1
fi
exit 0
