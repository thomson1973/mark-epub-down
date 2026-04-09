import path from "node:path";

import { ConversionError } from "../domain/errors";
import type { ParsedPackageDocument, SpineDocument } from "../domain/types";
import { normalizeEpubPath } from "../utils/epub-path";

export function buildSpineIndex(packageDocument: ParsedPackageDocument): SpineDocument[] {
  return packageDocument.spine.map((spineItem) => {
    const manifestItem = packageDocument.manifestById.get(spineItem.idref);

    if (!manifestItem) {
      throw ConversionError.fatal(
        "SPINE_TARGET_MISSING",
        `spine item ${spineItem.idref} does not resolve to a manifest item.`,
      );
    }

    return {
      idref: spineItem.idref,
      linear: spineItem.linear,
      manifestItem,
      relativePath: normalizeEpubPath(path.posix.join(packageDocument.opfDirectory, manifestItem.href)),
      absolutePath: normalizeEpubPath(path.posix.join(path.posix.dirname(packageDocument.opfPath), manifestItem.href)),
    };
  });
}
