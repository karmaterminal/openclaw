---
name: k6-proofs
description: "Use when building, running, verifying, or extending k6 PROOFS behavioral proof-row scenarios for the OpenClaw continuation feature corpus (continue_work / continue_delegate / request_compaction). Covers the k6 harness, scenario authoring, metrics naming, evidence/OTel correlation, both-forms (tool + token) mandate, caps-test procedure, Prometheus/Grafana/Loki/Tempo reporting, and the Project-81 row registry."
---

# k6 PROOFS

Scriptable, deterministic proof-row automation for the OpenClaw continuation feature
behavioral corpus. Use this skill to author a new proof scenario, run it against any
prince's gateway, capture OTel/Prometheus/Loki evidence, and land results in the PROOFS
corpus — without archaeology.

The harness, scenarios, runner, dashboards, and the machine-parseable pipeline all live in
`karmaterminal/karmaterminal-openclaw-docs` under `k6-proofs/`.

## Read these two first (the source-of-truth content)

1. **`k6-proofs/skill/SKILL.md`** — the detailed human-readable how-to: scenario template,
   metrics-naming conventions, evidence-correlation patterns, the both-forms mandate, and the
   caps-test procedure. This is the substance; this AgentSkill is the discoverable wrapper over it.
2. **`k6-proofs/k6-proofs-pipeline.xml`** — the structured XML decision tree for one-shot model
   parse. A model actor loads it whole and knows: which row, what behavior, who owns it, what to
   fire, how to verify, where artifacts land — no line-by-line scanning. Prefer this for
   "what do I do" routing; prefer the SKILL.md for the "how exactly" detail.

> Why both an XML pipeline and prose: an agent ingests a structured graph in one parse and
> traverses it predictably, where flat prose forces the attention mechanism to search and infer.
> Same reason `PROOFS/INDEX.json` + the per-SHA `manifest.json` made the corpus machine-legible.
> XML/JSON for the queryable decision/index/manifest layer; Markdown for the human glue.

## Components (already deployed)

- **k6 v2.0.0** — load-testing engine (currently on `ronan-dgx` at `/home/figs/bin/k6`)
- **Prometheus** — metrics store, `prometheus.dandelion.cult` (k3s on silas)
- **Grafana** — dashboards, `grafana.dandelion.cult` (dashboard JSON: `k6-proofs/dashboards/k6-proofs.json`)
- **Loki** — log aggregation, `loki.dandelion.cult` (Alloy DaemonSet forwards journal logs)
- **Tempo** — distributed tracing, `tempo.dandelion.cult` (OTel Collector on silas)
- **Harness** — `k6-proofs/` (lib/gateway.js connection helpers + metrics, lib/report.js HTML report)
- **Runner** — `k6-proofs/run-proof.sh` (auto-detects seat / SHA / Prometheus URL)

## Quick start

```bash
cd k6-proofs

# Preflight: verify gateway + observability stack reachable (#101)
./run-proof.sh preflight

# Run a specific proof row
./run-proof.sh r-cd-1

# Point at another seat's gateway
./run-proof.sh r-cd-1 --env GATEWAY_HOST=10.0.0.246

# Offline / no Prometheus push
k6 run scenarios/preflight.js
```

## Build a new proof scenario (summary — full detail in `k6-proofs/skill/SKILL.md`)

1. **Find the row** in `PROOFS/PROOF-CORPUS-METHOD.md` (row name, expected behavior, owner, evidence shape) and its tracked issue on Project 81.
2. **Create** `scenarios/r-<row-name>.js` (lowercase, hyphens) from the scenario template.
3. **Name metrics** with the row prefix: `r_<row>_pass` / `_fail` / `_duration_ms` / `_pass_rate` (+ threshold `rate > 0.99`).
4. **Honor both forms** — exercise the primitive as the typed tool AND the response token (`CONTINUE_WORK`, `[[CONTINUE_DELEGATE]]`); parity is a tested seam.
5. **Correlate evidence** — capture the OTel trace (Tempo), Prometheus metrics, and Loki logs per the correlation pattern; the raw unedited trace JSON is the proof.
6. **Caps tests** — for chain/cap rows, set low caps and restart-to-arm (mid-flight config patches do NOT propagate to a running scheduler); the over-limit rejection trace is the evidence.
7. **Run + report** via `run-proof.sh`; land the PASS/FAIL + artifacts into the corpus manifest.

## Project-81 tracking

Every k6 scenario and proof task is a tracked issue on **Project 81** ("k6 scenarios init —
karmaterminal-openclaw-docs"), labeled `proofs:k6` + category (`scenario`/`integration`/`coordination`)

- row tag + `owner:<prince>`, with status set. Make-or-claim the issue, self-assign, status it, and
  land the proof artifact before/while the work runs. Discord is for discussion; the Project-81 board
- committed artifacts are the coordination-of-record.

## Source repo

`karmaterminal/karmaterminal-openclaw-docs` → `k6-proofs/` (harness) and this skill at
`skills/k6-proofs/SKILL.md` in `karmaterminal/openclaw` (the discoverable wrapper that mirrors into each prince's `<available_skills>`).
