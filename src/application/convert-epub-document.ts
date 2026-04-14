import { cleanupWorkingDirectory, createWorkingDirectory, extractArchive } from "../epub/archive";
import { loadSpineDocuments } from "../epub/content";
import { parseContainerDocument } from "../epub/container";
import { parsePackageDocument } from "../epub/opf";
import { buildSpineIndex } from "../epub/spine";
import { parseTocDocument } from "../epub/toc";
import { ConversionError } from "../domain/errors";
import type { ExtractImagesMode, ExtractedAssetRecord, WarningRecord } from "../domain/types";
import { WarningCollector } from "../domain/warnings";
import { renderDocument } from "../output/render";
import { cleanXhtmlDocument } from "../transform/cleanup";
import { extractAndRewriteImages, prepareImageElementsForExtraction } from "../transform/images";
import { rewriteInternalLinks, rewriteTocTargets, buildAnchorMap, injectAnchorTargets } from "../transform/links";
import { createMarkdownConverter } from "../transform/markdown";
import { processTables } from "../transform/tables";

export interface ConvertEpubDocumentOptions {
  inputPath: string;
  extractImages?: ExtractImagesMode;
  assetLinkPrefix?: string;
}

export interface ConvertEpubDocumentResult {
  inputPath: string;
  markdown: string;
  assets: ExtractedAssetRecord[];
  warnings: WarningRecord[];
}

export async function convertEpubDocument(
  options: ConvertEpubDocumentOptions,
): Promise<ConvertEpubDocumentResult> {
  const warnings = new WarningCollector();
  const workingDirectory = await createWorkingDirectory();

  try {
    await extractArchive(options.inputPath, workingDirectory);

    const container = await parseContainerDocument(workingDirectory);
    const packageDocument = await parsePackageDocument(workingDirectory, container.opfPath);
    const toc = await parseTocDocument(workingDirectory, packageDocument, warnings);
    const spineDocuments = buildSpineIndex(packageDocument);
    const loadedDocuments = await loadSpineDocuments(workingDirectory, spineDocuments);
    const shouldExtractImages = options.extractImages === "all" && Boolean(options.assetLinkPrefix);

    if (shouldExtractImages) {
      prepareImageElementsForExtraction(loadedDocuments);
    }

    for (const loadedDocument of loadedDocuments) {
      const cleanup = cleanXhtmlDocument(loadedDocument.dom.window.document, {
        preserveImages: shouldExtractImages,
      });
      if (cleanup.removedTags.length > 0) {
        const uniqueTags = [...new Set(cleanup.removedTags)].join(", ");
        warnings.add(
          "ELEMENTS_DROPPED",
          `dropped non-text elements from ${loadedDocument.spineDocument.relativePath}: ${uniqueTags}`,
        );
      }

      const tableResult = processTables(loadedDocument.dom.window.document);
      if (tableResult.complexTableCount > 0) {
        const noun = tableResult.complexTableCount === 1 ? "table" : "tables";
        warnings.add(
          "COMPLEX_TABLE_PRESERVED",
          `preserved ${tableResult.complexTableCount} complex ${noun} as HTML because Markdown conversion would be lossy: ${loadedDocument.spineDocument.relativePath}`,
        );
      }
    }

    const anchorMap = buildAnchorMap(
      loadedDocuments.map((loadedDocument) => ({
        idref: loadedDocument.spineDocument.idref,
        relativePath: loadedDocument.spineDocument.relativePath,
        document: loadedDocument.dom.window.document,
      })),
      warnings,
    );

    for (const loadedDocument of loadedDocuments) {
      rewriteInternalLinks(
        loadedDocument.dom.window.document,
        loadedDocument.spineDocument.relativePath,
        anchorMap,
        warnings,
      );
      injectAnchorTargets(
        {
          idref: loadedDocument.spineDocument.idref,
          relativePath: loadedDocument.spineDocument.relativePath,
          document: loadedDocument.dom.window.document,
        },
        anchorMap,
      );
    }

    const rewrittenToc = rewriteTocTargets(toc.items, anchorMap, warnings);
    const assets = shouldExtractImages && options.assetLinkPrefix
      ? await extractAndRewriteImages({
        workingDirectory,
        packageDocument,
        loadedDocuments,
        assetLinkPrefix: options.assetLinkPrefix,
        warnings,
      })
      : [];
    const markdownConverter = createMarkdownConverter();
    const body = loadedDocuments
      .filter((loadedDocument) => loadedDocument.spineDocument.linear)
      .map((loadedDocument) => {
        const html = loadedDocument.dom.window.document.body?.innerHTML;
        if (!html) {
          throw ConversionError.fatal(
            "CONTENT_BODY_MISSING",
            `spine content document is missing a body element: ${loadedDocument.spineDocument.relativePath}`,
          );
        }

        return markdownConverter.turndown(html).trim();
      })
      .filter((fragment) => fragment.length > 0)
      .join("\n\n");

    const markdown = renderDocument({
      metadata: packageDocument.metadata,
      toc: rewrittenToc,
      body,
    });

    return {
      inputPath: options.inputPath,
      markdown,
      assets,
      warnings: warnings.list(),
    };
  } finally {
    await cleanupWorkingDirectory(workingDirectory);
  }
}
