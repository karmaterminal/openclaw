import { n as stylePromptMessage, t as stylePromptHint } from "./prompt-style-CCSFhHbg.js";
import { select } from "@clack/prompts";
//#region src/commands/doctor.ts
async function doctorCommand(runtime, options) {
	await (await import("./doctor-health-DDlGnuJh.js")).doctorCommand(runtime, options);
}
//#endregion
//#region src/terminal/prompt-select-styled.ts
function selectStyled(params) {
	return select({
		...params,
		message: stylePromptMessage(params.message),
		options: params.options.map((opt) => opt.hint === void 0 ? opt : {
			...opt,
			hint: stylePromptHint(opt.hint)
		})
	});
}
//#endregion
export { doctorCommand as n, selectStyled as t };
