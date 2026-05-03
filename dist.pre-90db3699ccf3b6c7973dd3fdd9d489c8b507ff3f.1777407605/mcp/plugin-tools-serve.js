import { i as formatErrorMessage } from "../errors-CS5wW5eD.js";
import { c as routeLogsToStderr } from "../subsystem-CJBoMDt5.js";
import { n as VERSION } from "../version-Bym9kFjy.js";
import { a as loadConfig } from "../io-CBRjt33P.js";
import "../config-BjiV0z87.js";
import { r as resolvePluginTools } from "../tools-CjyAaC4m.js";
import { a as wrapToolWithBeforeToolCallHook, r as isToolWrappedWithBeforeToolCallHook } from "../pi-tools.before-tool-call-BRx8QWc6.js";
import { pathToFileURL } from "node:url";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
//#region src/mcp/plugin-tools-handlers.ts
function resolveJsonSchemaForTool(tool) {
	const params = tool.parameters;
	if (params && typeof params === "object" && "type" in params) return params;
	return {
		type: "object",
		properties: {}
	};
}
function createPluginToolsMcpHandlers(tools) {
	const wrappedTools = tools.map((tool) => {
		if (isToolWrappedWithBeforeToolCallHook(tool)) return tool;
		return wrapToolWithBeforeToolCallHook(tool);
	});
	const toolMap = /* @__PURE__ */ new Map();
	for (const tool of wrappedTools) toolMap.set(tool.name, tool);
	return {
		listTools: async () => ({ tools: wrappedTools.map((tool) => ({
			name: tool.name,
			description: tool.description ?? "",
			inputSchema: resolveJsonSchemaForTool(tool)
		})) }),
		callTool: async (params) => {
			const tool = toolMap.get(params.name);
			if (!tool) return {
				content: [{
					type: "text",
					text: `Unknown tool: ${params.name}`
				}],
				isError: true
			};
			try {
				const result = await tool.execute(`mcp-${Date.now()}`, params.arguments ?? {});
				return { content: Array.isArray(result.content) ? result.content : [{
					type: "text",
					text: String(result.content)
				}] };
			} catch (err) {
				return {
					content: [{
						type: "text",
						text: `Tool error: ${formatErrorMessage(err)}`
					}],
					isError: true
				};
			}
		}
	};
}
//#endregion
//#region src/mcp/plugin-tools-serve.ts
/**
* Standalone MCP server that exposes OpenClaw plugin-registered tools
* (e.g. memory-lancedb's memory_recall, memory_store, memory_forget)
* so ACP sessions running Claude Code can use them.
*
* Run via: node --import tsx src/mcp/plugin-tools-serve.ts
* Or: bun src/mcp/plugin-tools-serve.ts
*/
function resolveTools(config) {
	return resolvePluginTools({
		context: { config },
		suppressNameConflicts: true
	});
}
function createPluginToolsMcpServer(params = {}) {
	const cfg = params.config ?? loadConfig();
	const handlers = createPluginToolsMcpHandlers(params.tools ?? resolveTools(cfg));
	const server = new Server({
		name: "openclaw-plugin-tools",
		version: VERSION
	}, { capabilities: { tools: {} } });
	server.setRequestHandler(ListToolsRequestSchema, handlers.listTools);
	server.setRequestHandler(CallToolRequestSchema, async (request) => {
		return await handlers.callTool(request.params);
	});
	return server;
}
async function servePluginToolsMcp() {
	routeLogsToStderr();
	const config = loadConfig();
	const tools = resolveTools(config);
	const server = createPluginToolsMcpServer({
		config,
		tools
	});
	if (tools.length === 0) process.stderr.write("plugin-tools-serve: no plugin tools found\n");
	const transport = new StdioServerTransport();
	let shuttingDown = false;
	const shutdown = () => {
		if (shuttingDown) return;
		shuttingDown = true;
		process.stdin.off("end", shutdown);
		process.stdin.off("close", shutdown);
		process.off("SIGINT", shutdown);
		process.off("SIGTERM", shutdown);
		server.close();
	};
	process.stdin.once("end", shutdown);
	process.stdin.once("close", shutdown);
	process.once("SIGINT", shutdown);
	process.once("SIGTERM", shutdown);
	await server.connect(transport);
}
if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) servePluginToolsMcp().catch((err) => {
	process.stderr.write(`plugin-tools-serve: ${formatErrorMessage(err)}\n`);
	process.exit(1);
});
//#endregion
export { createPluginToolsMcpServer, servePluginToolsMcp };
