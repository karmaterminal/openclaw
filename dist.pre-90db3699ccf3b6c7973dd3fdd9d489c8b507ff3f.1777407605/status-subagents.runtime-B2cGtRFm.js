import { i as countPendingDescendantRuns } from "./subagent-registry-QM0aZmYG.js";
import { l as resolveSubagentLabel } from "./model-selection-display-BieDnK9c.js";
import { o as listControlledSubagentRuns } from "./subagent-control-DHfYYkBw.js";
//#region src/auto-reply/reply/commands-status-subagents.ts
function buildSubagentsStatusLine(params) {
	const { runs, verboseEnabled, pendingDescendantsForRun } = params;
	if (runs.length === 0) return;
	const active = runs.filter((entry) => !entry.endedAt || pendingDescendantsForRun(entry) > 0);
	const done = runs.length - active.length;
	if (verboseEnabled) {
		const labels = active.map((entry) => resolveSubagentLabel(entry, "")).filter(Boolean).slice(0, 3);
		const labelText = labels.length ? ` (${labels.join(", ")})` : "";
		return `🤖 Subagents: ${active.length} active${labelText} · ${done} done`;
	}
	if (active.length > 0) return `🤖 Subagents: ${active.length} active`;
}
//#endregion
export { buildSubagentsStatusLine, countPendingDescendantRuns, listControlledSubagentRuns };
