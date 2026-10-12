import { trySafeFileURLToPath } from "@openclaw/fs-safe/advanced";
import { readOpenClawTmpDirOverridePath } from "../../../infra/tmp-openclaw-dir.js";
import {
  isImageMediaFact,
  normalizeMediaFacts,
  type MediaFact,
} from "../../../media/media-facts.js";
import { resolveUserPath } from "../../../utils.js";

const URL_SCHEME_PATTERN = /^[a-z][a-z0-9+.-]*:/i;
const WINDOWS_DRIVE_PATH_PATTERN = /^[A-Za-z]:[\\/]/;

export type MediaFileRef = {
  raw: string;
  type: "path" | "media-uri";
  resolved: string;
};

export type MediaImageRef = MediaFileRef & {
  aliases: string[];
  detect?: boolean;
  factIndex: number;
  hydrate: boolean;
  workspaceDir?: string;
};

export function isOpenClawCliImageCachePath(filePath: string): boolean {
  const parts = filePath.replaceAll("\\", "/").split("/");
  return parts.some((part, index) => {
    if (part === ".openclaw-cli-images") {
      return true;
    }
    if (part !== "openclaw-cli-images") {
      return false;
    }
    // The CLI runner caches temp-scope images in its temp root: a directory named openclaw or
    // openclaw-<uid>, or the one OPENCLAW_TMP_DIR names.
    const parent = parts[index - 1] ?? "";
    return (
      /^openclaw(?:-\d+)?$/.test(parent) ||
      parts.slice(0, index).join("/") === readOpenClawTmpDirOverridePath()?.replaceAll("\\", "/")
    );
  });
}

export function resolveMediaFactLocalRef(fact: MediaFact): MediaFileRef | undefined {
  const mediaUri = [fact.url, fact.path].find((value) => value?.startsWith("media://inbound/"));
  const identity = mediaUri ?? fact.path ?? fact.url;
  if (!identity) {
    return undefined;
  }
  let resolved = mediaUri;
  if (!resolved && /^file:/i.test(identity)) {
    resolved = trySafeFileURLToPath(identity);
  } else if (
    !resolved &&
    (!URL_SCHEME_PATTERN.test(identity) || WINDOWS_DRIVE_PATH_PATTERN.test(identity))
  ) {
    resolved = identity;
  }
  if (!resolved) {
    return undefined;
  }
  return {
    raw: identity,
    type: mediaUri ? "media-uri" : "path",
    resolved: resolved.startsWith("~") ? resolveUserPath(resolved) : resolved,
  };
}

export function mediaFactToImageRef(fact: MediaFact, factIndex: number): MediaImageRef | undefined {
  if (!isImageMediaFact(fact)) {
    return undefined;
  }
  const localRef = resolveMediaFactLocalRef(fact);
  const identity = localRef?.raw ?? fact.path ?? fact.url;
  if (!identity && fact.hydrationSuppressed !== true) {
    return undefined;
  }
  const usableRef =
    localRef && !isOpenClawCliImageCachePath(localRef.resolved) ? localRef : undefined;
  return {
    ...(usableRef ?? { raw: identity ?? "", type: "path", resolved: identity ?? "" }),
    aliases: [fact.path, fact.url, usableRef?.resolved].filter((value): value is string =>
      Boolean(value),
    ),
    ...(!usableRef ? { detect: false } : {}),
    factIndex,
    hydrate: Boolean(usableRef) && fact.hydrationSuppressed !== true,
    ...(fact.workspaceDir ? { workspaceDir: fact.workspaceDir } : {}),
  };
}

// Guards for transports that cannot carry attachments (paired-node CLI): only
// facts that will actually hydrate an image count; described/remote-only facts
// whose hydration is suppressed must not block text-only prompts.
export function hasHydratableMediaImages(media?: readonly MediaFact[]): boolean {
  return normalizeMediaFacts(media)
    .map(mediaFactToImageRef)
    .some((ref) => ref?.hydrate === true);
}
