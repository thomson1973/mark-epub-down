import { access, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { cleanupWorkingDirectory, createWorkingDirectory, extractArchive } from "../epub/archive";
import { loadSpineDocuments } from "../epub/content";
import { parseContainerDocument } from "../epub/container";
import { parsePackageDocument } from "../epub/opf";
import { buildSpineIndex } from "../epub/spine";
import { parseTocDocument } from "../epub/toc";
import { ConversionError } from "../domain/errors";
import type { WarningRecord } from "../domain/types";
import { WarningCollector, getCliVisibleWarnings, summarizeWarnings } from "../domain/warnings";
import { renderDocument } from "../output/render";
import { cleanXhtmlDocument } from "../transform/cleanup";
import { rewriteInternalLinks, rewriteTocTargets, buildAnchorMap, injectAnchorTargets } from "../transform/links";
import { createMarkdownConverter } from "../transform/markdown";
import { processTables } from "../transform/tables";
import { deriveOutputPath, ensureOutputPathAvailable } from "../utils/path";

export interface ConvertEpubOptions {
  inputPath: string;
  outputPath?: string;
  cwd?: string;
  interactive?: boolean;
  stdout?: NodeJS.WritableStream;
  stderr?: NodeJS.WritableStream;
}

export interface ConvertEpubResult {
  inputPath: string;
  outputPath: string;
  warnings: WarningRecord[];
}

export async function convertEpub(options: ConvertEpubOptions): Promise<ConvertEpubResult> {
  const cwd = options.cwd ?? process.cwd();
  const inputPath = path.resolve(cwd, options.inputPath);
  const outputPath = deriveOutputPath(inputPath, options.outputPath, cwd);
  const warnings = new WarningCollector();
  const stdout = options.stdout ?? process.stdout;
  const stderr = options.stderr ?? process.stderr;

  await assertInputExists(inputPath);
  await ensureOutputPathAvailable(outputPath);

  const workingDirectory = await createWorkingDirectory();

  try {
    await extractArchive(inputPath, workingDirectory);

    const container = await parseContainerDocument(workingDirectory);
    const packageDocument = await parsePackageDocument(workingDirectory, container.opfPath);
    const toc = await parseTocDocument(workingDirectory, packageDocument, warnings);
    const spineDocuments = buildSpineIndex(packageDocument);
    const loadedDocuments = await loadSpineDocuments(workingDirectory, spineDocuments);

    for (const loadedDocument of loadedDocuments) {
      const cleanup = cleanXhtmlDocument(loadedDocument.dom.window.document);
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
          `preserved ${tableResult.complexTableCount} complex ${noun} as HTML in ${loadedDocument.spineDocument.relativePath}`,
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

    await mkdir(path.dirname(outputPath), { recursive: true });
    await writeFile(outputPath, markdown, "utf8");

    const allWarnings = warnings.list();
    const cliWarnings = summarizeWarnings(getCliVisibleWarnings(allWarnings));
    emitWarnings(stderr, cliWarnings);
    emitSuccess(stdout, outputPath, cliWarnings.length);

    return {
      inputPath,
      outputPath,
      warnings: allWarnings,
    };
  } finally {
    await cleanupWorkingDirectory(workingDirectory);
  }
}

async function assertInputExists(inputPath: string): Promise<void> {
  try {
    await access(inputPath);
  } catch {
    throw ConversionError.fatal(
      "INPUT_NOT_FOUND",
      `input EPUB does not exist: ${inputPath}`,
    );
  }
}

function emitWarnings(stderr: NodeJS.WritableStream, warnings: WarningRecord[]): void {
  for (const warning of warnings) {
    stderr.write(`warning [${warning.code}]: ${warning.message}\n`);
  }
}

function emitSuccess(stdout: NodeJS.WritableStream, outputPath: string, warningCount: number): void {
  const suffix = warningCount > 0 ? ` (${warningCount} warning${warningCount === 1 ? "" : "s"})` : "";
  stdout.write(`wrote ${outputPath}${suffix}\n`);
}
