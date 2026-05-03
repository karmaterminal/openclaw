import { r as maybeResolvePluginMessagingTarget } from "./target-normalization-Ca8F0A2i.js";
//#region src/infra/outbound/target-id-resolution.ts
async function maybeResolveIdLikeTarget(params) {
	const target = await maybeResolvePluginMessagingTarget({
		...params,
		requireIdLike: true
	});
	if (!target) return;
	return target;
}
//#endregion
export { maybeResolveIdLikeTarget as t };
