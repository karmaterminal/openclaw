//#region src/media/pdf-extract.ts
const CANVAS_MODULE = "@napi-rs/canvas";
const PDFJS_MODULE = "pdfjs-dist/legacy/build/pdf.mjs";
let canvasModulePromise = null;
let pdfJsModulePromise = null;
async function loadCanvasModule() {
	if (!canvasModulePromise) canvasModulePromise = import(CANVAS_MODULE).catch((err) => {
		canvasModulePromise = null;
		throw new Error(`Optional dependency @napi-rs/canvas is required for PDF image extraction: ${String(err)}`);
	});
	return canvasModulePromise;
}
async function loadPdfJsModule() {
	if (!pdfJsModulePromise) pdfJsModulePromise = import(PDFJS_MODULE).catch((err) => {
		pdfJsModulePromise = null;
		throw new Error(`Optional dependency pdfjs-dist is required for PDF extraction: ${String(err)}`);
	});
	return pdfJsModulePromise;
}
async function extractPdfContent(params) {
	const { buffer, maxPages, maxPixels, minTextChars, pageNumbers, onImageExtractionError } = params;
	const pdf = await (await loadPdfJsModule()).getDocument({
		data: new Uint8Array(buffer),
		disableWorker: true
	}).promise;
	const effectivePages = pageNumbers ? pageNumbers.filter((p) => p >= 1 && p <= pdf.numPages).slice(0, maxPages) : Array.from({ length: Math.min(pdf.numPages, maxPages) }, (_, i) => i + 1);
	const textParts = [];
	for (const pageNum of effectivePages) {
		const pageText = (await (await pdf.getPage(pageNum)).getTextContent()).items.map((item) => "str" in item ? item.str : "").filter(Boolean).join(" ");
		if (pageText) textParts.push(pageText);
	}
	const text = textParts.join("\n\n");
	if (text.trim().length >= minTextChars) return {
		text,
		images: []
	};
	let canvasModule;
	try {
		canvasModule = await loadCanvasModule();
	} catch (err) {
		onImageExtractionError?.(err);
		return {
			text,
			images: []
		};
	}
	const images = [];
	const pixelBudget = Math.max(1, maxPixels);
	for (const pageNum of effectivePages) {
		const page = await pdf.getPage(pageNum);
		const viewport = page.getViewport({ scale: 1 });
		const pagePixels = viewport.width * viewport.height;
		const scale = Math.min(1, Math.sqrt(pixelBudget / Math.max(1, pagePixels)));
		const scaled = page.getViewport({ scale: Math.max(.1, scale) });
		const canvas = canvasModule.createCanvas(Math.ceil(scaled.width), Math.ceil(scaled.height));
		await page.render({
			canvas,
			viewport: scaled
		}).promise;
		const png = canvas.toBuffer("image/png");
		images.push({
			type: "image",
			data: png.toString("base64"),
			mimeType: "image/png"
		});
	}
	return {
		text,
		images
	};
}
//#endregion
export { extractPdfContent as t };
