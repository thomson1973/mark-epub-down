import { readFile } from "node:fs/promises";
import path from "node:path";

import type { LoadedSpineDocument } from "../epub/content";
import type { ExtractedAssetRecord, ManifestItem, ParsedPackageDocument } from "../domain/types";
import { WarningCollector } from "../domain/warnings";
import { normalizeEpubPath, resolveEpubHref } from "../utils/epub-path";

export interface ExtractImagesInput {
  workingDirectory: string;
  packageDocument: ParsedPackageDocument;
  loadedDocuments: LoadedSpineDocument[];
  assetLinkPrefix: string;
  warnings: WarningCollector;
}

export function prepareImageElementsForExtraction(loadedDocuments: LoadedSpineDocument[]): void {
  rewriteSvgImageElements(loadedDocuments);
}

export async function extractAndRewriteImages(
  input: ExtractImagesInput,
): Promise<ExtractedAssetRecord[]> {
  prepareImageElementsForExtraction(input.loadedDocuments);

  const manifestByResourcePath = new Map<string, ManifestItem>(
    input.packageDocument.manifestItems.map((item) => [
      normalizeEpubPath(path.posix.join(input.packageDocument.opfDirectory, item.href)),
      item,
    ]),
  );
  const extractedBySourcePath = new Map<string, ExtractedAssetRecord>();
  const sourceByOutputPath = new Map<string, string>();

  for (const loadedDocument of input.loadedDocuments) {
    const imageNodes = Array.from(loadedDocument.dom.window.document.getElementsByTagName("img"));

    for (const node of imageNodes) {
      const rawSource = node.getAttribute("src")?.trim();

      if (!rawSource) {
        node.remove();
        continue;
      }

      const resolved = resolveEpubHref(loadedDocument.spineDocument.relativePath, rawSource);
      if (resolved.kind !== "internal" || !resolved.resourcePath) {
        input.warnings.add(
          "IMAGE_REFERENCE_SKIPPED",
          `skipped non-internal image reference from ${loadedDocument.spineDocument.relativePath}: ${rawSource}`,
        );
        node.remove();
        continue;
      }

      const manifestItem = manifestByResourcePath.get(resolved.resourcePath);
      if (manifestItem && !manifestItem.mediaType.startsWith("image/")) {
        input.warnings.add(
          "IMAGE_REFERENCE_SKIPPED",
          `skipped non-image manifest target from ${loadedDocument.spineDocument.relativePath}: ${rawSource}`,
        );
        node.remove();
        continue;
      }

      const assetRecord = await getOrCreateAssetRecord(
        resolved.resourcePath,
        manifestItem,
        input,
        extractedBySourcePath,
        sourceByOutputPath,
      );

      if (!assetRecord) {
        node.remove();
        continue;
      }

      node.setAttribute(
        "src",
        normalizeEpubPath(path.posix.join(input.assetLinkPrefix, assetRecord.outputRelativePath)),
      );
    }
  }

  return [...extractedBySourcePath.values()];
}

function rewriteSvgImageElements(loadedDocuments: LoadedSpineDocument[]): void {
  for (const loadedDocument of loadedDocuments) {
    const svgNodes = Array.from(loadedDocument.dom.window.document.getElementsByTagName("svg"));

    for (const svgNode of svgNodes) {
      const replacementImages = Array.from(svgNode.getElementsByTagName("image"))
        .map((imageNode) => buildReplacementImageNode(svgNode.ownerDocument, imageNode))
        .filter((node): node is HTMLImageElement => node !== null);

      if (replacementImages.length === 0) {
        continue;
      }

      for (const imageNode of replacementImages) {
        svgNode.parentNode?.insertBefore(imageNode, svgNode);
      }

      svgNode.remove();
    }
  }
}

function buildReplacementImageNode(document: Document, imageNode: Element): HTMLImageElement | null {
  const source = readImageHref(imageNode);
  if (!source) {
    return null;
  }

  const replacement = document.createElement("img");
  replacement.setAttribute("src", source);

  const alt = imageNode.getAttribute("aria-label")
    ?? imageNode.getAttribute("title")
    ?? imageNode.getAttribute("alt")
    ?? "";
  replacement.setAttribute("alt", alt);

  return replacement;
}

function readImageHref(imageNode: Element): string | null {
  const directHref = imageNode.getAttribute("href") ?? imageNode.getAttribute("xlink:href");
  if (directHref && directHref.trim().length > 0) {
    return directHref.trim();
  }

  const namespacedHref = imageNode.getAttributeNS("http://www.w3.org/1999/xlink", "href");
  return namespacedHref && namespacedHref.trim().length > 0 ? namespacedHref.trim() : null;
}

async function getOrCreateAssetRecord(
  sourceResourcePath: string,
  manifestItem: ManifestItem | undefined,
  input: ExtractImagesInput,
  extractedBySourcePath: Map<string, ExtractedAssetRecord>,
  sourceByOutputPath: Map<string, string>,
): Promise<ExtractedAssetRecord | undefined> {
  const existing = extractedBySourcePath.get(sourceResourcePath);
  if (existing) {
    return existing;
  }

  const absoluteSourcePath = path.join(input.workingDirectory, sourceResourcePath);

  let data: Uint8Array;
  try {
    data = await readFile(absoluteSourcePath);
  } catch {
    input.warnings.add("IMAGE_REFERENCE_SKIPPED", `image resource could not be read: ${sourceResourcePath}`);
    return undefined;
  }

  const candidateOutputPath = buildCandidateOutputPath(input.packageDocument.opfDirectory, sourceResourcePath);
  const outputRelativePath = dedupeOutputPath(candidateOutputPath, sourceResourcePath, sourceByOutputPath);
  const assetRecord: ExtractedAssetRecord = {
    sourceResourcePath,
    outputRelativePath,
    mediaType: manifestItem?.mediaType ?? "image/*",
    data,
  };

  extractedBySourcePath.set(sourceResourcePath, assetRecord);
  sourceByOutputPath.set(outputRelativePath, sourceResourcePath);
  return assetRecord;
}

function buildCandidateOutputPath(opfDirectory: string, sourceResourcePath: string): string {
  const relativeToPackage = normalizeEpubPath(path.posix.relative(opfDirectory, sourceResourcePath));
  const safeRelativePath = sanitizeRelativePath(relativeToPackage);
  return safeRelativePath.length > 0 ? safeRelativePath : path.posix.basename(sourceResourcePath);
}

function sanitizeRelativePath(value: string): string {
  const parts = normalizeEpubPath(value)
    .split("/")
    .filter((part) => part.length > 0 && part !== "." && part !== "..");

  return parts.join("/");
}

function dedupeOutputPath(
  candidateOutputPath: string,
  sourceResourcePath: string,
  sourceByOutputPath: Map<string, string>,
): string {
  const normalizedCandidate = normalizeEpubPath(candidateOutputPath);
  const existingSource = sourceByOutputPath.get(normalizedCandidate);

  if (!existingSource || existingSource === sourceResourcePath) {
    return normalizedCandidate;
  }

  const parsed = path.posix.parse(normalizedCandidate);
  let suffix = 2;

  while (true) {
    const nextCandidate = normalizeEpubPath(
      path.posix.join(parsed.dir, `${parsed.name}-${suffix}${parsed.ext}`),
    );
    const conflictingSource = sourceByOutputPath.get(nextCandidate);

    if (!conflictingSource || conflictingSource === sourceResourcePath) {
      return nextCandidate;
    }

    suffix += 1;
  }
}
