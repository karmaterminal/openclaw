// Detects a CoT-frame "speaker" prefix at the start of a message body, e.g.
// `[cael] ...`, `[the dandelion cult - ronan] ...`, `[ronan 🌊] ...`.
//
// When the frame is present the entire payload is treated as leaked internal
// narration and suppressed silently by `normalize-reply` (mirrors the
// trailing-NO_REPLY silent-class semantics introduced in 7c3c986dd7).
// See issue karmaterminal/openclaw#269.
//
// The speaker set is intentionally limited to the prince names observed in
// the #269 receipts (`cael|silas|ronan|elliott`) to avoid false positives on
// legitimate text like `[user] reported a bug`.  Glyphs accept optional
// VS16 (U+FE0F) so emitters that drop the variation selector still match.
const COT_FRAME_PREFIX_RE =
  /^\s*\[(?:the dandelion cult - )?(?:cael|silas|ronan|elliott)(?:\s*(?:🌻|🌫|🩸|🌊)\uFE0F?)?\]/iu;

export function hasCotFramePrefix(text: string): boolean {
  if (!text) {
    return false;
  }
  return COT_FRAME_PREFIX_RE.test(text);
}
