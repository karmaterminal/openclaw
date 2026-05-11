# Gateway Leak Canary Runbook

Purpose: capture reproducible heap evidence from an isolated gateway canary without perturbing the live production gateway that is currently leaking.

This runbook assumes:

- the live gateway stays untouched while the leak is reproducing
- `scripts/embedded-run-abort-leak.ts` runs first as the cheap differential
- the canary uses isolated state
- snapshot checkpoints are pinned before firing

## Guardrails

- Do not restart, reconfigure, or attach inspector to the live production gateway.
- Do not share the production `OPENCLAW_STATE_DIR` with the canary.
- Do not symlink the canary state/config back to production.
- Do not leave `--inspect` enabled as ambient runtime state.
- `pnpm gateway:dev` is not the room-shape path for this lane because it sets `OPENCLAW_SKIP_CHANNELS=1`.

## Output

At the end of the lane, bank:

- harness verdicts from `embedded-run-abort-leak.ts`
- three `.heapsnapshot` files from the canary
- the exact launch command used
- commit SHA
- checkpoint notes for `S0`, `S1`, `S2`
- a short result note naming dominant growing constructors and retainer paths

## Preconditions

- Source checkout: `/home/figs/flesh_beast_tmp/openclaw`
- Runbook repo: `/home/figs/.openclaw/workspace/openclaw-bootstrap`
- Live gateway remains running on its current production port/state
- Canary will use a separate port, separate config path, and separate state dir

## Step 1: Create a run root

```bash
cd /home/figs/flesh_beast_tmp/openclaw

export RUN_TS="$(date +%Y%m%d-%H%M%S)"
export RUN_ROOT="/tmp/openclaw-heap-canary-$RUN_TS"
export CANARY_PORT="19021"
export INSPECT_PORT="9229"

mkdir -p "$RUN_ROOT"/{snaps,logs,state}
printf '%s\n' \
  "run_ts=$RUN_TS" \
  "repo=$(pwd)" \
  "sha=$(git rev-parse HEAD)" \
  "canary_port=$CANARY_PORT" \
  "inspect_port=$INSPECT_PORT" \
  > "$RUN_ROOT/run-meta.txt"
```

## Step 2: Run the cheap differential first

Run the embedded abort-path harness before touching the canary. Record whether the abort-path family is implicated.

Recommended first pass:

```bash
cd /home/figs/flesh_beast_tmp/openclaw

node --import tsx --expose-gc scripts/embedded-run-abort-leak.ts \
  --mode production \
  --iters 50 \
  --batches 5 \
  --snap-dir "$RUN_ROOT/harness-production" \
  | tee "$RUN_ROOT/logs/harness-production.log"

echo "exit_code=$?" | tee -a "$RUN_ROOT/logs/harness-production.log"
```

Recommended controls:

```bash
node --import tsx --expose-gc scripts/embedded-run-abort-leak.ts \
  --mode closure-extracted \
  --iters 50 \
  --batches 5 \
  --snap-dir "$RUN_ROOT/harness-closure-extracted" \
  | tee "$RUN_ROOT/logs/harness-closure-extracted.log"

echo "exit_code=$?" | tee -a "$RUN_ROOT/logs/harness-closure-extracted.log"

node --import tsx --expose-gc scripts/embedded-run-abort-leak.ts \
  --mode synthetic-leak \
  --iters 50 \
  --batches 5 \
  --snap-dir "$RUN_ROOT/harness-synthetic-leak" \
  | tee "$RUN_ROOT/logs/harness-synthetic-leak.log"

echo "exit_code=$?" | tee -a "$RUN_ROOT/logs/harness-synthetic-leak.log"
```

Interpretation:

- `production=FAIL` with controls behaving as expected: likely same-family leak, canary snapshots become confirmatory
- `production=PASS`: abort-path family not named by the cheap harness, proceed to discovery canary

## Step 3: Build the canary with symbols

For this lane, prefer a source-map build because the canary needs channels enabled and `pnpm gateway:dev` skips channels.

```bash
cd /home/figs/flesh_beast_tmp/openclaw

export OUTPUT_SOURCE_MAPS=1
pnpm clean:dist
pnpm build
```

Note:

- `pnpm gateway:dev` remains useful for isolated local debugging, but not for reproducing a channel-shaped leak because it sets `OPENCLAW_SKIP_CHANNELS=1`.

## Step 4: Prepare isolated canary state

Create an isolated config/state pair. Copy auth material, but do not share live mutable state.

```bash
cd /home/figs/flesh_beast_tmp/openclaw

cp ~/.openclaw/openclaw.json "$RUN_ROOT/openclaw.json"
mkdir -p "$RUN_ROOT/state/credentials"
if [ -d ~/.openclaw/credentials ]; then
  rsync -a ~/.openclaw/credentials/ "$RUN_ROOT/state/credentials/"
fi
```

Set the canary environment:

```bash
export OPENCLAW_CONFIG_PATH="$RUN_ROOT/openclaw.json"
export OPENCLAW_STATE_DIR="$RUN_ROOT/state"
export OPENCLAW_GATEWAY_PORT="$CANARY_PORT"
unset OPENCLAW_SKIP_CHANNELS
```

If the lane needs same-room-shape reproduction, verify the copied config/auth are sufficient for the canary to attach to the same provider/account substrate. Do not point the canary at the live state dir.

## Step 5: Pin checkpoints before boot

Write checkpoint intent before launching:

```bash
cat > "$RUN_ROOT/checkpoints.txt" <<'EOF'
S0 = fresh boot / quiescent baseline
S1 = after idle soak or first visible growth step
S2 = after message/tool burst or later growth plateau
EOF
```

These are the only three primary comparison checkpoints unless the cohort explicitly widens scope.

## Step 6: Launch the canary in capture mode

Run the canary from the snapshot directory so `--heapsnapshot-signal=SIGUSR2` writes files there.

```bash
cd /home/figs/flesh_beast_tmp/openclaw

(
  cd "$RUN_ROOT/snaps" && \
  OPENCLAW_CONFIG_PATH="$OPENCLAW_CONFIG_PATH" \
  OPENCLAW_STATE_DIR="$OPENCLAW_STATE_DIR" \
  OPENCLAW_GATEWAY_PORT="$OPENCLAW_GATEWAY_PORT" \
  node \
    --inspect=0.0.0.0:$INSPECT_PORT \
    --heapsnapshot-signal=SIGUSR2 \
    --enable-source-maps \
    ./dist/index.js gateway run \
    --port "$CANARY_PORT" \
    --bind loopback \
    --verbose \
    2>&1 | tee "$RUN_ROOT/logs/canary-capture.log"
) &

export CANARY_PID="$!"
echo "$CANARY_PID" | tee "$RUN_ROOT/canary-capture.pid"
printf '%s\n' \
  "capture_pid=$CANARY_PID" \
  "launch_cmd=node --inspect=0.0.0.0:$INSPECT_PORT --heapsnapshot-signal=SIGUSR2 --enable-source-maps ./dist/index.js gateway run --port $CANARY_PORT --bind loopback --verbose" \
  >> "$RUN_ROOT/run-meta.txt"
```

Verify:

- canary is on the alternate port
- channels are not skipped
- log does not say `skipping channel start (OPENCLAW_SKIP_CHANNELS=1 ...)`

## Step 7: Capture the three snapshots

Preferred low-interaction path: signal-driven snapshots.

### S0: Baseline

After the canary reaches quiescent boot:

```bash
kill -SIGUSR2 "$CANARY_PID"
sleep 2
ls -1t "$RUN_ROOT/snaps"/*.heapsnapshot | head -1 | tee -a "$RUN_ROOT/checkpoints.txt"
```

Append a note:

```bash
printf '%s\n' "S0 captured at $(date -Is) after quiescent boot" >> "$RUN_ROOT/checkpoints.txt"
```

### S1: Idle soak / first growth step

Let the canary sit through the first planned idle/growth window, then:

```bash
kill -SIGUSR2 "$CANARY_PID"
sleep 2
ls -1t "$RUN_ROOT/snaps"/*.heapsnapshot | head -1 | tee -a "$RUN_ROOT/checkpoints.txt"
printf '%s\n' "S1 captured at $(date -Is) after idle soak / first growth step" >> "$RUN_ROOT/checkpoints.txt"
```

### S2: Message/tool burst / later plateau

After the planned burst or later plateau:

```bash
kill -SIGUSR2 "$CANARY_PID"
sleep 2
ls -1t "$RUN_ROOT/snaps"/*.heapsnapshot | head -1 | tee -a "$RUN_ROOT/checkpoints.txt"
printf '%s\n' "S2 captured at $(date -Is) after message/tool burst / later plateau" >> "$RUN_ROOT/checkpoints.txt"
```

Alternative capture path:

- use Chrome DevTools Memory tab over `--inspect`
- still bank the files under deterministic names after export

## Step 8: Tear down capture mode

Important: inspector cannot be removed from a running Node process. If you want the canary to continue soaking without inspector, you must restart it without `--inspect`.

Stop the capture-mode canary:

```bash
kill "$CANARY_PID"
wait "$CANARY_PID" 2>/dev/null || true
```

If continued soak is needed, restart the same isolated canary without `--inspect`:

```bash
cd /home/figs/flesh_beast_tmp/openclaw

(
  cd "$RUN_ROOT/snaps" && \
  OPENCLAW_CONFIG_PATH="$OPENCLAW_CONFIG_PATH" \
  OPENCLAW_STATE_DIR="$OPENCLAW_STATE_DIR" \
  OPENCLAW_GATEWAY_PORT="$OPENCLAW_GATEWAY_PORT" \
  node \
    --heapsnapshot-signal=SIGUSR2 \
    --enable-source-maps \
    ./dist/index.js gateway run \
    --port "$CANARY_PORT" \
    --bind loopback \
    --verbose \
    2>&1 | tee "$RUN_ROOT/logs/canary-post-capture.log"
) &

echo "$!" | tee "$RUN_ROOT/canary-post-capture.pid"
```

## Step 9: Normalize snapshot names

Make the three primary files obvious:

```bash
mapfile -t SNAP_FILES < <(ls -1tr "$RUN_ROOT/snaps"/*.heapsnapshot)

cp "${SNAP_FILES[0]}" "$RUN_ROOT/snaps/S0-baseline.heapsnapshot"
cp "${SNAP_FILES[1]}" "$RUN_ROOT/snaps/S1-idle.heapsnapshot"
cp "${SNAP_FILES[2]}" "$RUN_ROOT/snaps/S2-growth.heapsnapshot"
```

If more than three snapshots were taken, note the extras explicitly in `checkpoints.txt` instead of silently ignoring them.

## Step 10: Diff and interpret

Use Chrome DevTools Memory Comparison, or the existing delta tool for a quick text read:

```bash
node .agents/skills/openclaw-test-heap-leaks/scripts/heapsnapshot-delta.mjs \
  "$RUN_ROOT/snaps/S0-baseline.heapsnapshot" \
  "$RUN_ROOT/snaps/S2-growth.heapsnapshot" \
  --top 30 \
  | tee "$RUN_ROOT/logs/heapsnapshot-delta.log"
```

Bring back:

- dominant growing constructors
- retainer paths keeping them alive
- retained-size leaders
- whether growth clusters around one family or several

Do not stop at:

- a single file path
- one hot stack frame without retained-object evidence
- vibes about memory growth

## Decision rule

- Harness `FAIL` and canary diffs agree: same-family leak, move to code path named by retainers
- Harness `PASS` and canary names another family: abort-path exonerated, chase the new dominant retainers
- Inconclusive: add one semantic probe next, not five

## Quick checklist

- [ ] Live production gateway left untouched
- [ ] Run root created
- [ ] Harness run on `production`
- [ ] Control harness runs captured
- [ ] Source-map build completed
- [ ] Canary config/state isolated
- [ ] Checkpoints pinned before boot
- [ ] Capture-mode canary launched on alternate gateway/inspector ports
- [ ] `S0`, `S1`, `S2` snapshots captured
- [ ] Capture-mode canary stopped
- [ ] Optional post-capture canary restarted without inspector
- [ ] Snapshot names normalized
- [ ] Diff output banked
- [ ] Verdict note written

## References

- `scripts/embedded-run-abort-leak.ts`
- `scripts/profile-extension-memory.mjs`
- `scripts/check-cli-startup-memory.mjs`
- `docs/help/debugging.md`
- `tsdown.config.ts`
