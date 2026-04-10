import { readFile } from "node:fs/promises";
import path from "node:path";

import { XMLParser } from "fast-xml-parser";
import { JSDOM } from "jsdom";

import type { ParsedPackageDocument, TocDocument, TocItem } from "../domain/types";
import { WarningCollector } from "../domain/warnings";
import { resolveEpubHref } from "../utils/epub-path";

const xmlParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "",
  removeNSPrefix: true,
  trimValues: true,
});

export async function parseTocDocument(
  workingDirectory: string,
  packageDocument: ParsedPackageDocument,
  warnings: WarningCollector,
): Promise<TocDocument> {
  const navItemId = packageDocument.navigation.navItemId;
  if (navItemId) {
    const navItem = packageDocument.manifestById.get(navItemId);
    if (navItem) {
      const navDocumentPath = path.posix.join(packageDocument.opfDirectory, navItem.href);
      const navPath = path.join(workingDirectory, packageDocument.opfDirectory, navItem.href);
      const navDocument = await parseNavDocument(navPath, navDocumentPath, warnings);
      if (navDocument) {
        return navDocument;
      }
    }
  }

  const ncxItemId = packageDocument.navigation.ncxItemId;
  if (ncxItemId) {
    const ncxItem = packageDocument.manifestById.get(ncxItemId);
    if (ncxItem) {
      const ncxDocumentPath = path.posix.join(packageDocument.opfDirectory, ncxItem.href);
      const ncxPath = path.join(workingDirectory, packageDocument.opfDirectory, ncxItem.href);
      const ncxDocument = await parseNcxDocument(ncxPath, ncxDocumentPath, warnings);
      if (ncxDocument) {
        return ncxDocument;
      }
    }
  }

  warnings.add("TOC_MISSING", "table of contents metadata could not be read; the generated TOC section will be empty.");

  return {
    source: "missing",
    items: [],
  };
}

async function parseNavDocument(
  navPath: string,
  navDocumentPath: string,
  warnings: WarningCollector,
): Promise<TocDocument | null> {
  let navContent: string;
  try {
    navContent = await readFile(navPath, "utf8");
  } catch {
    warnings.add("TOC_NAV_UNREADABLE", `nav TOC document could not be read; trying other TOC sources: ${navDocumentPath}`);
    return null;
  }

  let dom: JSDOM;
  try {
    dom = new JSDOM(navContent, {
      contentType: "application/xhtml+xml",
    });
  } catch {
    warnings.add("TOC_NAV_INVALID", `nav TOC document could not be parsed; trying other TOC sources: ${navDocumentPath}`);
    return null;
  }

  const navNodes = Array.from(dom.window.document.querySelectorAll("nav")) as Element[];
  const tocNode = navNodes.find((node) => {
    const type = node.getAttribute("epub:type") ?? node.getAttribute("type");
    return type === "toc";
  });

  if (!tocNode) {
    return null;
  }

  const list = tocNode.querySelector("ol, ul");

  return {
    source: "nav",
    items: list ? readNavList(list, navDocumentPath) : [],
  };
}

function readNavList(list: Element, navDocumentPath: string): TocItem[] {
  const items: TocItem[] = [];

  for (const child of Array.from(list.children)) {
    if (child.tagName.toLowerCase() !== "li") {
      continue;
    }

    const link = child.querySelector(":scope > a");
    const labelNode = link ?? child.querySelector(":scope > span");
    const nestedList = child.querySelector(":scope > ol, :scope > ul");

    items.push({
      label: labelNode?.textContent?.trim() ?? "",
      href: resolveTocHref(navDocumentPath, link?.getAttribute("href")),
      children: nestedList ? readNavList(nestedList, navDocumentPath) : [],
    });
  }

  return items.filter((item) => item.label.length > 0);
}

async function parseNcxDocument(
  ncxPath: string,
  ncxDocumentPath: string,
  warnings: WarningCollector,
): Promise<TocDocument | null> {
  let ncxContent: string;
  try {
    ncxContent = await readFile(ncxPath, "utf8");
  } catch {
    warnings.add("TOC_NCX_UNREADABLE", `NCX TOC document could not be read; trying other TOC sources: ${ncxDocumentPath}`);
    return null;
  }

  let parsed: {
    ncx?: {
      navMap?: {
        navPoint?: Array<Record<string, unknown>> | Record<string, unknown>;
      };
    };
  };
  try {
    parsed = xmlParser.parse(ncxContent) as {
      ncx?: {
        navMap?: {
          navPoint?: Array<Record<string, unknown>> | Record<string, unknown>;
        };
      };
    };
  } catch {
    warnings.add("TOC_NCX_INVALID", `NCX TOC document could not be parsed; trying other TOC sources: ${ncxDocumentPath}`);
    return null;
  }

  const navPoints = asArray(parsed.ncx?.navMap?.navPoint);

  return {
    source: "ncx",
    items: navPoints.map((navPoint) => readNavPoint(navPoint, ncxDocumentPath)).filter((item) => item.label.length > 0),
  };
}

function readNavPoint(navPoint: Record<string, unknown>, ncxDocumentPath: string): TocItem {
  const label = readText(navPoint.navLabel) ?? "";
  const href = resolveTocHref(ncxDocumentPath, readContentSource(navPoint.content));

  return {
    label,
    href,
    children: asArray(navPoint.navPoint).map((child) =>
      readNavPoint(child as Record<string, unknown>, ncxDocumentPath),
    ),
  };
}

function resolveTocHref(baseDocumentPath: string, href: string | null | undefined): string | undefined {
  if (!href) {
    return undefined;
  }

  const resolved = resolveEpubHref(baseDocumentPath, href);
  return resolved.kind === "internal" ? resolved.targetKey : undefined;
}

function readText(value: unknown): string | undefined {
  if (!value || typeof value !== "object") {
    return undefined;
  }

  const textNode = (value as { text?: unknown }).text;

  if (typeof textNode === "string") {
    return textNode;
  }

  if (Array.isArray(textNode)) {
    const first = textNode.find((entry) => typeof entry === "string");
    return typeof first === "string" ? first : undefined;
  }

  return undefined;
}

function readContentSource(value: unknown): string | undefined {
  if (!value || typeof value !== "object") {
    return undefined;
  }

  const src = (value as { src?: unknown }).src;
  return typeof src === "string" ? src : undefined;
}

function asArray<T>(value: T | T[] | undefined): T[] {
  if (!value) {
    return [];
  }

  return Array.isArray(value) ? value : [value];
}
