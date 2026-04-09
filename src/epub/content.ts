import { readFile } from "node:fs/promises";
import path from "node:path";

import { JSDOM } from "jsdom";

import { ConversionError } from "../domain/errors";
import type { SpineDocument } from "../domain/types";

export interface LoadedSpineDocument {
  spineDocument: SpineDocument;
  dom: JSDOM;
}

export async function loadSpineDocuments(
  workingDirectory: string,
  spineDocuments: SpineDocument[],
): Promise<LoadedSpineDocument[]> {
  return Promise.all(
    spineDocuments.map(async (spineDocument) => {
      const absolutePath = path.join(workingDirectory, spineDocument.relativePath);

      let source: string;
      try {
        source = await readFile(absolutePath, "utf8");
      } catch {
        throw ConversionError.fatal(
          "CONTENT_UNREADABLE",
          `spine content resource could not be read: ${spineDocument.relativePath}`,
        );
      }

      try {
        return {
          spineDocument,
          dom: new JSDOM(source, {
            contentType: "application/xhtml+xml",
          }),
        };
      } catch {
        throw ConversionError.fatal(
          "CONTENT_INVALID",
          `spine content resource could not be parsed as XHTML: ${spineDocument.relativePath}`,
        );
      }
    }),
  );
}
