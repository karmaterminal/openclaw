// Streamed block-tag helpers: trailing tag/fence fragment splitting and final-tag stripping.
import { findFinalTagMatches } from "../shared/text/final-tags.js";

const STREAM_STRIPPED_BLOCK_TAG_NAMES = [
  "final",
  "think",
  "thinking",
  "thought",
  "antthinking",
  "antml:think",
  "antml:thinking",
  "antml:thought",
  "mm:think",
  "mm:thinking",
  "mm:thought",
] as const;

function isPotentialTrailingBlockTagFragment(fragment: string): boolean {
  if (!fragment.startsWith("<") || fragment.includes(">")) {
    return false;
  }
  const body = fragment.toLowerCase().slice(1).trimStart().replace(/^\//, "").trimStart();
  if (!body) {
    return true;
  }
  const namePart = body.split(/[\s/>]/, 1)[0] ?? "";
  if (!namePart) {
    return true;
  }
  return STREAM_STRIPPED_BLOCK_TAG_NAMES.some((name) => {
    return name.startsWith(namePart) || namePart === name;
  });
}

export function splitTrailingBlockTagFragment(
  text: string,
  isInsideCodeSpan: (index: number) => boolean,
): { text: string; pendingTagFragment?: string } {
  const fragmentStart = text.lastIndexOf("<");
  if (fragmentStart === -1 || isInsideCodeSpan(fragmentStart)) {
    return { text };
  }
  const fragment = text.slice(fragmentStart);
  if (!isPotentialTrailingBlockTagFragment(fragment)) {
    return { text };
  }
  return {
    text: text.slice(0, fragmentStart),
    pendingTagFragment: fragment,
  };
}

export function splitTrailingFenceFragment(
  text: string,
  startsAtLineStart: boolean,
): { text: string; pendingFenceFragment?: string } {
  const lineStart = text.lastIndexOf("\n") + 1;
  const line = text.slice(lineStart);
  if ((!startsAtLineStart && lineStart === 0) || !/^(?: {0,3})(?:`+|~+)$/.test(line)) {
    return { text };
  }
  return {
    text: text.slice(0, lineStart),
    pendingFenceFragment: line,
  };
}

export const stripFinalTagsOutsideCodeSpans = (
  text: string,
  isInside: (index: number) => boolean,
) => {
  let output = "";
  let lastIndex = 0;
  for (const match of findFinalTagMatches(text)) {
    const idx = match.index;
    if (isInside(idx)) {
      continue;
    }
    output += text.slice(lastIndex, idx);
    lastIndex = idx + match.text.length;
  }
  output += text.slice(lastIndex);
  return output;
};
