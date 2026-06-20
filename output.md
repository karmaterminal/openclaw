# Understand + cure the honest openclaw-local-ci red set on `b7ed06ed`

Commit under test: `b7ed06ed590245bdc0c7b68c64d0a719851c40fe`
Faithful env: Node **24.17.0** (runner pin), npm 11, Linux. Worktree branch `codeagent/understand-honest-reds`.
Honest (allowlist-free) baseline reported by figs: **66223 pass / 18 reds**, deterministic, byte-identical to `upstream/main`.

Verdict in one line: **16 of the 18 reds (Class A) are a runner-only build/discovery artifact — the runner builds before it tests, and the product resolver prefers the build's *incomplete* bundled-plugin tree over the complete source tree. Class B (1) is a genuine PATH-coupled product *test* bug exposed by this runner. Class C (1) is a CPU-starvation timeout flake. Cure Class A + Class C runner-side; flag Class B for a prince. No allowlist.**

---

## Environment / how the faithful repro was built

My worktree's `node_modules` is a **symlink** to the main clone (`source/openclaw/node_modules`), which makes `process.argv[1]` realpath-escape to the main clone and resolve the *main clone's* (complete) `dist/extensions`. That makes the worktree **non-faithful** for the bundled-dir resolver. So I built a faithful clone with its **own** real `node_modules`:

```bash
export NVM_DIR="$HOME/.nvm"; export PATH="$NVM_DIR/versions/node/v24.17.0/bin:$PATH"   # Node 24.17.0
FAITHFUL=/home/figs/flesh_beast_best_beast/tmp-faithful-honest-reds
git clone --quiet . "$FAITHFUL" && cd "$FAITHFUL"
git checkout --quiet b7ed06ed590245bdc0c7b68c64d0a719851c40fe
CI=true pnpm install --frozen-lockfile --prefer-offline      # real node_modules, 1204 pkgs
CI=true pnpm protocol:gen
CI=true pnpm build:strict-smoke                              # <-- this is the runner's pre-test build gate
```

Note: in a worktree NEVER run `pnpm test` / `pnpm check` / the full `build` against the **symlinked** node_modules — pnpm tries to reconcile/remove the *shared* modules dir (`ERR_PNPM_ABORTED_REMOVE_MODULES_DIR_NO_TTY`). The faithful clone above has its own modules, so it is safe.

---

## Class A — provider/streaming-capability cluster (16 tests) — ROOT CAUSE (byte-proven) + CURE

### Isolation-vs-suite verdict (the first bisection the workorder asked for)
- **All 5 failing files PASS in isolation** (clean worktree, no dist, Node 24, `--maxWorkers=1`): provider-catalog-shared 14/14, model-compat 57/57, openai-transport-stream 272/272, image 28/28, qwen provider-catalog 3/3.
- **The full `agents-core` shard PASSES** (319 files / 5474 tests, single worker) — so it is **NOT** intra-shard test pollution.
- 5 *independent* shard processes all failing identically is the tell: the cause is a **shared on-disk condition**, namely the bundled-plugin tree the build leaves on disk, not per-shard pollution and not a module-singleton race.

### The mechanism (every step verified in source)
1. `supportsNativeStreamingUsageCompat` is true **iff** `endpointClass ∈ {moonshot-native, modelstudio-native}` (`src/agents/provider-attribution.ts:774`). The **version env is a red herring** for these 16 — `endpointClass` does not read `OPENCLAW_VERSION` et al.; it depends *only* on plugin-manifest discovery.
2. `endpointClass` for a base URL comes from `resolveProviderEndpoint` → `resolveManifestProviderEndpoint` → `loadManifestProviderEndpointCache()` → `collectManifestProviderEndpoints()` → `listOpenClawPluginManifestMetadata()` (`src/agents/provider-attribution.ts:421,395,347,329,331`). The dashscope→`modelstudio-native` mapping lives in **`extensions/qwen/openclaw.plugin.json`** `providerEndpoints`. If that manifest isn't discovered, the URL falls through to `custom` (`provider-attribution.ts:440`).
3. `listOpenClawPluginManifestMetadata()` scans the **bundled-plugins dir** from `resolveBundledPluginsDir()` (`src/plugins/manifest-metadata-scan.ts:148` + `src/plugins/bundled-dir.ts`).
4. `resolveBundledDirFromPackageRoot` in a source checkout **PREFERS `dist/extensions`, then `dist-runtime/extensions`, over source `extensions/`** when those built trees exist and look "usable" (any child has `package.json` or `openclaw.plugin.json`) — `src/plugins/bundled-dir.ts:166-197`.
5. The result is cached in an **unkeyed module singleton** with **no test-reset hook** (`provider-attribution.ts:190-191,347-359`); once a worker resolves the wrong (incomplete) dir, it's locked for that worker's life.

### Why the build's dist is incomplete (the genuine env/build dep)
`build:strict-smoke` only emits bundled plugins whose `package.json` does **not** set `openclaw.build.bundledDist: false` (`scripts/lib/bundled-plugin-build-entries.mjs:56` `shouldBuildBundledDistEntry`; `scripts/copy-bundled-plugin-metadata.mjs:271` gates the manifest copy on that same buildable set). At `b7ed06ed`, **27 plugins carry `bundledDist: false`** — provider plugins that are manifest-only (no compiled entry), including **qwen, deepseek, kimi-coding, groq, cerebras, chutes, perplexity, copilot, kilocode, qianfan, stepfun, …**. Those plugins are emitted to **neither** `dist/extensions` **nor** `dist-runtime/extensions`, yet the *other* ~106 plugins are — so the dist tree is **"usable" but manifest-incomplete**.

Proven on the faithful clone, right after a **green** `build:strict-smoke` (BUILD_RC=0):
```
dist/extensions exists?          yes (106 dirs, 102 with manifest)
dist-runtime/extensions exists?  yes
qwen in dist/extensions?         MISSING
qwen in dist-runtime/extensions? MISSING
deepseek / kimi-coding:          MISSING ;  moonshot / alibaba / openai / anthropic: present
```

### End-to-end faithful reproduction (the smoking gun)
In the faithful clone, **after the green build**, the runner's reds reproduce exactly:
```
plugin-sdk  src/plugin-sdk/provider-catalog-shared.test.ts
  ✗ native streaming usage compat > detects native streaming usage compat from the endpoint capabilities
  ✗ native streaming usage compat > opts models into streaming usage for native endpoints ...
  → 2 failed | 12 passed     (AssertionError: expected undefined to be true / expected false to be true)
```
Causal control (worktree, vitest-trusted override): pointing discovery at a "usable-but-no-qwen-manifest" dir reproduces it; pointing it at source `extensions/` greens it:
```bash
# RED  (manifest-incomplete bundled dir):
OPENCLAW_BUNDLED_PLUGINS_DIR=/tmp/fake-bundled \
  node scripts/run-vitest.mjs run --config test/vitest/vitest.plugin-sdk.config.ts --maxWorkers=1 src/plugin-sdk/provider-catalog-shared.test.ts
# GREEN (complete source tree):
OPENCLAW_BUNDLED_PLUGINS_DIR="$PWD/extensions" \
  node scripts/run-vitest.mjs run --config test/vitest/vitest.plugin-sdk.config.ts --maxWorkers=1 src/plugin-sdk/provider-catalog-shared.test.ts
```
Upstream passes the byte-identical tests because upstream's test job runs against **source `extensions/`** with **no prior build** — there is no dist to shadow it.

### CURE (runner-side, `karmaterminal/openclaw-bootstrap`) — proven
Make the **test** gate resolve the same complete `extensions/` tree upstream does, by removing the build's *incomplete* extension overlays after the build gate and before `pnpm test`. The build gate keeps its value (it already ran and set its rc); the core `dist/` is untouched.

In `tools/openclaw-local-ci-runner.sh`, immediately **before** `run_test_gate`:
```bash
# --- Class A faithful-env cure (openclaw-bootstrap#... ) --------------------------------
# build:strict-smoke emits dist/extensions + dist-runtime/extensions for only the bundled
# plugins WITHOUT package.json openclaw.build.bundledDist:false. The 27 manifest-only provider
# plugins flagged bundledDist:false (qwen, deepseek, kimi-coding, groq, cerebras, ...) are NOT
# emitted, so the built trees are "usable" but manifest-incomplete. The product resolver
# (src/plugins/bundled-dir.ts) PREFERS dist/extensions then dist-runtime/extensions over source
# extensions/ in a source checkout, so the test phase would discover an incomplete plugin set and
# misclassify those providers' endpoints (custom instead of modelstudio-native/deepseek-native),
# reddening ~16 manifest-driven classification tests that pass byte-identically upstream (whose
# test job runs against source extensions/, with no prior build). Restore upstream-faithful
# discovery by dropping the built extension overlays; core dist/ stays for anything that needs it.
log "restoring upstream-faithful bundled-plugin discovery for the test gate"
rm -rf dist/extensions dist-runtime/extensions
```

Validation on the faithful clone (post-build), all five files green after the cure:
```
provider-catalog-shared        14 passed (14)
model-compat + openai-transport-stream  329 passed (329)
image                          28 passed (28)
qwen provider-catalog          3 passed (3)
```
`scripts/test-projects.mjs` does **not** rebuild dist, so the removal sticks through the whole test gate.

Genuine reds stay red: source `extensions/` is byte-identical to upstream, so any real classification regression still fails.

> Alternative considered and rejected: exporting `OPENCLAW_BUNDLED_PLUGINS_DIR="$PWD/extensions"` for the test gate (works because test setup sets `OPENCLAW_TEST_TRUST_BUNDLED_PLUGINS_DIR=1`) — but it globally overrides discovery for *every* test, including e2e tests that manage the bundled dir themselves, so it is less clean than removing the overlays. Building the full plugin set into dist is not possible without a product change (no env forces `bundledDist:false` plugins into dist).

---

## Class B — `src/infra/exec-authorization-render.test.ts:106` (1 test) — PRODUCT TEST BUG, FLAG ONLY

### Root cause (precise)
Test "renders dispatch-wrapper safe-bin commands without quote-all argv rendering" runs `env rg -n needle` with `env: { PATH: "/usr/bin:/bin" }` and asserts the rendered command equals the **bare** `rg -n needle`. The renderer (`buildAuthorizedShellCommandFromPlan`, mode `safeBins`) **absolutizes** a safe-bin to its PATH-resolved path — and the *sibling* test at line 123 explicitly **expects** that absolutization for `tr`/`head` (`/.../tr`, `/.../head`). The `rg` assertion is only correct when `rg` is **not** resolvable on `/usr/bin:/bin`.

This runner has **system ripgrep installed at `/usr/bin/rg` and `/bin/rg`** (`-rwxr-xr-x root … Jan 12 2024`). So with `PATH=/usr/bin:/bin`, the renderer correctly resolves `rg → /usr/bin/rg`, producing `"/usr/bin/rg -n needle"` ≠ `"rg -n needle"` → `AssertionError: expected '/usr/bin/rg -n needle' to be 'rg -n needle'`.

The **product (renderer) is correct**; the **test is environment-fragile** — it assumes `rg` is not on the minimal POSIX PATH (true on dev machines / upstream CI, where ripgrep is the `@vscode/ripgrep` node-module binary, not in `/usr/bin`). The honest gate correctly surfaces it.

### Recommendation (for a prince / figs — no product edit by me)
Make the test PATH-independent, e.g. one of:
- Point the test's `PATH` at a temp dir that contains the other safe-bins but **not** `rg` (the test already has `makePathEnv`/`makeExecutable`/`makeTempDir` helpers for exactly this), or
- Assert the **absolutized** form (match `/.+\/rg -n needle`) to mirror the sibling `tr`/`head` test, or
- Inject/mock the safe-bin path resolver so resolution is deterministic regardless of the host filesystem.

### Can the runner legitimately avoid it?
Not cleanly. The only runner-side avoidance is to ensure `rg` is absent from `/usr/bin` and `/bin` during the run, which means removing a system tool the image legitimately ships — fragile and not recommended. This is a real test defect; it should be fixed in the product test, and until then it is a **legitimate red** (not an allowlist candidate, not laundered).

---

## Class C — `test/scripts/openclaw-cross-os-release-checks.test.ts` "closes static release artifact sockets left by aborted clients" (1 test) — STARVATION FLAKE + CURE

### Root cause (precise)
The test (line 962, `tooling` shard — `vitest.tooling.config.ts`) opens a raw TCP socket to a static file server, writes a partial HTTP request (aborted client), then enforces **hard 1000 ms real-timer deadlines** on `server.close()` and on the socket's `close` event:
```ts
await Promise.race([ server.close(),       delay(1_000).then(() => { throw new Error("close timed out"); }) ]);
await Promise.race([ new Promise(res => socket.once("close", res)),
                     delay(1_000).then(() => { throw new Error("socket close timed out"); }) ]);
```
`delay` is `node:timers/promises` (real timer; no fake timers here). Under the runner's concurrent shard fan-out (cap = `nproc`; this seat = 20-way / 121 GB), the event loop is oversubscribed and a 1 s window can elapse before `close()`/the `close` event lands → throw → **rc=1**. It is the **same starvation class as the codex `attempt-startup` test** and **trades places run-to-run** (this run: cross-os red + codex green; prior run: codex red + cross-os green) — i.e. non-deterministic, load-induced, not a code regression. Because it's a timeout throw (rc=1), the runner's existing **SIGSEGV-only** per-shard retry (`rc>=128`) does **not** catch it.

### CURE (runner-side) — confirm-determinism re-run (primary), cap reduction (optional)
Add a **single confirm-determinism re-run** of the *specific failing files* when the whole-suite fail count is **small** (a clearly-broken suite is not retried). A starvation flake re-runs green at low contention; a deterministic fail re-runs red — so this **cannot launder** Class A or Class B (their on-disk/PATH conditions persist on re-run).

Drop-in for `run_test_gate` in `tools/openclaw-local-ci-runner.sh`, after `total_fails` is computed and **only** when `crashes_unrecovered==0 && total_fails>0 && total_fails<=CONFIRM_DETERMINISM_MAX_FAILS` (default 2):
```bash
# Confirm-determinism re-run: starvation flakes (real-timer waits elapsing under oversubscribed
# event loop, e.g. cross-os socket-close / codex attempt-startup) FAIL by timeout (rc=1), so the
# SIGSEGV-only retry above misses them. Re-run ONLY the small set of failing files ONCE, serially
# (low contention). A flake greens; a deterministic fail (Class A dist state, Class B host PATH)
# re-reds and stays red -> never launders a real fail.
CONFIRM_DETERMINISM_MAX_FAILS="${OPENCLAW_CI_CONFIRM_DETERMINISM_MAX_FAILS:-2}"
if [ "${crashes_unrecovered}" -eq 0 ] && [ "${total_fails}" -gt 0 ] && [ "${total_fails}" -le "${CONFIRM_DETERMINISM_MAX_FAILS}" ]; then
  # Parse "FAIL  <project>  <file> > <name>" lines into unique <project>\t<file> pairs.
  mapfile -t _pairs < <(grep -aoE '(^|[[:space:]])FAIL[[:space:]]+[A-Za-z0-9._-]+[[:space:]]+[^ >]+\.test\.ts' "${glog}" \
    | sed -E 's/^.*FAIL[[:space:]]+([A-Za-z0-9._-]+)[[:space:]]+([^ >]+\.test\.ts).*$/\1\t\2/' | sort -u)
  still_red=0
  for _pair in "${_pairs[@]}"; do
    proj="${_pair%%$'\t'*}"; file="${_pair##*$'\t'}"
    cfg="test/vitest/vitest.${proj}.config.ts"
    [ -f "${cfg}" ] || { still_red=1; echo "CONFIRM_DETERMINISM: no config for project '${proj}' -> treat as real fail"; continue; }
    echo "CONFIRM_DETERMINISM: re-running ${proj} :: ${file} once (serial)"
    if node scripts/run-vitest.mjs run --config "${cfg}" --maxWorkers=1 "${file}" >>"${glog}" 2>&1; then
      echo "  FLAKE CONFIRMED (greened on isolated re-run): ${file}"
    else
      still_red=1; echo "  DETERMINISTIC (re-red on isolated re-run): ${file}"
    fi
  done
  if [ "${still_red}" -eq 0 ]; then
    echo "TEST_GATE: all ${total_fails} fail(s) greened on confirm-determinism re-run -> starvation flake(s), gate PASS"
    rc=0; total_fails=0
  fi
fi
```
(The existing `elif [ "${total_fails}" -gt 0 ]` real-fail branch then reds the gate iff any deterministic fail remains.)

Optional defense-in-depth: cap the shard fan-out at `nproc/2` to shrink the starvation window (the runner already caps at `nproc`; halving trades ~throughput for fewer flakes). Recommended only if flakes persist after the confirm-determinism re-run:
```bash
# in the OPENCLAW_TEST_PROJECTS_PARALLEL block, change the cpu cap:
_ncpu=$(nproc 2>/dev/null || echo 8); _ncpu=$(( _ncpu / 2 )); [ "${_ncpu}" -lt 1 ] && _ncpu=1
[ "${_par}" -gt "${_ncpu}" ] && _par="${_ncpu}"
```

This keeps the no-allowlist contract: a genuinely deterministic fail (incl. Class B) never passes a single isolated re-run, so it stays red.

---

## Net effect of the cures on this commit
- Class A (16): **fixed** by the runner removing the incomplete built extension overlays before the test gate (faithful to upstream). Proven green on the faithful clone.
- Class C (1): **cleared** by the confirm-determinism re-run as a starvation flake (and/or reduced by the cap).
- Class B (1): **stays red** — a genuine, environment-coupled product **test** bug; fixed by a prince/figs in the test, not by the runner, and not by an allowlist.

So the honest gate on `b7ed06ed` goes from **18 reds → 1 red (Class B)**, with that one red being a true, surfaced product test defect to fix — exactly the "understand the error, don't accept it" posture.

---

## Exact commands (reproduce each finding)

```bash
# Node 24.17.0 (runner pin)
export NVM_DIR="$HOME/.nvm"; export PATH="$NVM_DIR/versions/node/v24.17.0/bin:$PATH"

# ---- Class A: isolation passes (clean worktree, no dist) ----
node scripts/run-vitest.mjs run --config test/vitest/vitest.plugin-sdk.config.ts        --maxWorkers=1 src/plugin-sdk/provider-catalog-shared.test.ts
node scripts/run-vitest.mjs run --config test/vitest/vitest.agents-core.config.ts        --maxWorkers=1 src/agents/model-compat.test.ts src/agents/openai-transport-stream.test.ts
node scripts/run-vitest.mjs run --config test/vitest/vitest.media-understanding.config.ts --maxWorkers=1 src/media-understanding/image.test.ts
node scripts/run-vitest.mjs run --config test/vitest/vitest.extension-providers.config.ts --maxWorkers=1 extensions/qwen/provider-catalog.test.ts

# ---- Class A: causal proof via the vitest-trusted bundled-dir override ----
mkdir -p /tmp/fake-bundled/zzdummy && echo '{"name":"@openclaw/zzdummy","version":"0.0.0"}' > /tmp/fake-bundled/zzdummy/package.json
OPENCLAW_BUNDLED_PLUGINS_DIR=/tmp/fake-bundled  node scripts/run-vitest.mjs run --config test/vitest/vitest.plugin-sdk.config.ts --maxWorkers=1 src/plugin-sdk/provider-catalog-shared.test.ts   # RED
OPENCLAW_BUNDLED_PLUGINS_DIR="$PWD/extensions"  node scripts/run-vitest.mjs run --config test/vitest/vitest.plugin-sdk.config.ts --maxWorkers=1 src/plugin-sdk/provider-catalog-shared.test.ts   # GREEN

# ---- Class A: faithful end-to-end repro (real node_modules + the runner's build) ----
FAITHFUL=/home/figs/flesh_beast_best_beast/tmp-faithful-honest-reds
git clone --quiet . "$FAITHFUL" && cd "$FAITHFUL" && git checkout --quiet b7ed06ed59
CI=true pnpm install --frozen-lockfile --prefer-offline && CI=true pnpm protocol:gen && CI=true pnpm build:strict-smoke
ls dist/extensions/qwen/openclaw.plugin.json 2>/dev/null || echo "qwen MISSING from built dist"   # MISSING
node scripts/run-vitest.mjs run --config test/vitest/vitest.plugin-sdk.config.ts --maxWorkers=1 src/plugin-sdk/provider-catalog-shared.test.ts   # 2 failed (the runner's reds)
# CURE:
rm -rf dist/extensions dist-runtime/extensions
node scripts/run-vitest.mjs run --config test/vitest/vitest.plugin-sdk.config.ts --maxWorkers=1 src/plugin-sdk/provider-catalog-shared.test.ts   # 14 passed

# ---- Class B: confirm the host has system ripgrep on the minimal PATH ----
ls -la /usr/bin/rg /bin/rg     # both exist -> test's bare-rg assumption is violated

# ---- Class C: the failing case (hard 1s real-timer deadlines) ----
sed -n '962,996p' test/scripts/openclaw-cross-os-release-checks.test.ts
```

---

## Uncertainties / not pinned at the byte
- **Exact runner fail count (16 vs my faithful clone's 2-in-this-file).** I byte-proved the *mechanism* and reproduced the exact `provider-catalog-shared` reds end-to-end. The full 16 are the union of tests asserting classifications for the 27 `bundledDist:false` plugins absent from dist (qwen/dashscope/modelstudio, deepseek, kimi-coding, …). I did not run the entire 66k suite on the faithful clone post-build to enumerate all 16 by name (heavy); the per-file repros + the bundledDist:false enumeration cover the set. A full `scripts/test-projects.mjs` run with the cure applied is the recommended final confirmation (no new reds expected; upstream runs the same suite without dist).
- **Why `bundledDist:false` on these provider plugins at `b7ed06ed`** (vs older states where qwen was in dist) is a product decision; the runner must faithfully handle the current state regardless, which the cure does.
- **Class C cap value.** `nproc/2` is a reasonable mitigation but is a throughput trade; the confirm-determinism re-run is the robust primary cure. The exact starvation threshold is seat-dependent.
- **Confirm-determinism project→config mapping** assumes the vitest project name equals the config basename (`vitest.<project>.config.ts`), which holds for every shard observed; the snippet treats an unmapped project as a real fail (fail-closed), so it cannot launder.
