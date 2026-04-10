import { buildMergedAnchor } from "./anchors";
import { NOTE_BACKLINK_TYPES, NOTE_BODY_TYPES, NOTE_REFERENCE_TYPES } from "../domain/spec";
import { ConversionError } from "../domain/errors";
import type { TocItem } from "../domain/types";
import { WarningCollector } from "../domain/warnings";
import { buildTargetKey, resolveEpubHref } from "../utils/epub-path";

export function buildAnchorMap(
  documents: Array<{
    idref: string;
    relativePath: string;
    document: Document;
  }>,
  warnings: WarningCollector,
): Map<string, string> {
  const anchorMap = new Map<string, string>();

  for (const item of documents) {
    // Reserve a synthetic per-document anchor so whole-document TOC entries and
    // links can still target the merged single-file output.
    const docStartKey = buildTargetKey(item.relativePath);
    const docStartAnchor = buildMergedAnchor(item.idref, "start");
    setAnchor(anchorMap, docStartKey, docStartAnchor, warnings);

    const elementsWithTargets = Array.from(item.document.querySelectorAll("[id], a[name], [xml\\:id]")) as Element[];
    for (const element of elementsWithTargets) {
      for (const sourceTarget of readSourceTargets(element)) {
        const targetKey = buildTargetKey(item.relativePath, sourceTarget);
        const mergedAnchor = buildMergedAnchor(item.idref, sourceTarget);
        setAnchor(anchorMap, targetKey, mergedAnchor, warnings);
      }
    }
  }

  return anchorMap;
}

export function injectAnchorTargets(
  item: {
    idref: string;
    relativePath: string;
    document: Document;
  },
  anchorMap: Map<string, string>,
): void {
  const { document } = item;
  const body = document.body;
  const elementsWithTargets = Array.from(document.querySelectorAll("[id], a[name], [xml\\:id]")) as Element[];

  if (!body) {
    throw ConversionError.fatal(
      "CONTENT_BODY_MISSING",
      `spine content document is missing a body element: ${item.relativePath}`,
    );
  }

  const docStartAnchor = anchorMap.get(buildTargetKey(item.relativePath));
  if (docStartAnchor) {
    body.prepend(createAnchorElement(document, docStartAnchor));
  }

  for (const element of elementsWithTargets) {
    for (const sourceTarget of readSourceTargets(element)) {
      const mergedAnchor = anchorMap.get(buildTargetKey(item.relativePath, sourceTarget));
      if (!mergedAnchor) {
        continue;
      }

      injectAnchorTarget(element, createAnchorElement(document, mergedAnchor));
    }

    clearSourceTargetAttributes(element);
  }
}

export function rewriteInternalLinks(
  document: Document,
  currentDocumentPath: string,
  anchorMap: Map<string, string>,
  warnings: WarningCollector,
): void {
  const linkNodes = Array.from(document.querySelectorAll("a[href]")) as HTMLAnchorElement[];

  for (const linkNode of linkNodes) {
    const href = linkNode.getAttribute("href");
    if (!href) {
      continue;
    }

    const resolved = resolveEpubHref(currentDocumentPath, href);
    if (resolved.kind === "external") {
      continue;
    }

    if (resolved.targetKey && anchorMap.has(resolved.targetKey)) {
      linkNode.setAttribute("href", `#${anchorMap.get(resolved.targetKey)}`);
      continue;
    }

    // Degrade unresolved internal targets to plain text instead of emitting a
    // merged-document link that looks valid but points nowhere.
    warnings.add(...buildUnresolvedLinkWarning(linkNode, currentDocumentPath, href));
    unwrapNode(linkNode);
  }
}

export function rewriteTocTargets(
  items: TocItem[],
  anchorMap: Map<string, string>,
  warnings: WarningCollector,
): TocItem[] {
  return items.map((item) => {
    let href: string | undefined;

    if (item.href) {
      const targetAnchor = anchorMap.get(item.href);
      if (targetAnchor) {
        href = `#${targetAnchor}`;
      } else {
        warnings.add(
          "TOC_TARGET_UNRESOLVED",
          `TOC entry was left as plain text because its target could not be mapped exactly: ${item.href}`,
        );
      }
    }

    return {
      label: item.label,
      href,
      children: rewriteTocTargets(item.children, anchorMap, warnings),
    };
  });
}

function setAnchor(
  anchorMap: Map<string, string>,
  targetKey: string,
  mergedAnchor: string,
  warnings: WarningCollector,
): void {
  const existing = anchorMap.get(targetKey);
  if (existing && existing !== mergedAnchor) {
    // Keep the first stable mapping and warn rather than guessing between
    // colliding source targets from different spine documents.
    warnings.add("ANCHOR_COLLISION", `anchor collision detected; a later target may remain unresolved: ${targetKey}`);
    return;
  }

  anchorMap.set(targetKey, mergedAnchor);
}

function createAnchorElement(document: Document, anchorId: string): HTMLAnchorElement {
  const anchor = document.createElement("a");
  anchor.setAttribute("id", anchorId);
  return anchor;
}

function injectAnchorTarget(element: Element, anchor: HTMLAnchorElement): void {
  const tagName = element.tagName.toLowerCase();
  if (tagName === "li") {
    // Placing the anchor inside the list item preserves list structure in the
    // downstream Markdown conversion better than inserting a sibling before it.
    element.prepend(anchor);
    return;
  }

  element.before(anchor);
}

function unwrapNode(node: Element): void {
  const parent = node.parentNode;
  if (!parent) {
    return;
  }

  while (node.firstChild) {
    parent.insertBefore(node.firstChild, node);
  }

  parent.removeChild(node);
}

function readSourceTargets(element: Element): string[] {
  const sourceTargets = new Set<string>();

  for (const attributeName of ["id", "name", "xml:id"]) {
    const value = element.getAttribute(attributeName)?.trim();
    if (value) {
      sourceTargets.add(value);
    }
  }

  return [...sourceTargets];
}

function clearSourceTargetAttributes(element: Element): void {
  for (const attributeName of ["id", "name", "xml:id"]) {
    element.removeAttribute(attributeName);
  }
}

function buildUnresolvedLinkWarning(
  linkNode: HTMLAnchorElement,
  currentDocumentPath: string,
  href: string,
): [code: string, message: string] {
  const noteRole = classifyNoteLink(linkNode);
  if (noteRole) {
    return [
      "NOTE_LINK_UNRESOLVED",
      `${noteRole} link was left as plain text because its target could not be rewritten safely: ${currentDocumentPath} -> ${href}`,
    ];
  }

  return [
    "INTERNAL_LINK_UNRESOLVED",
    `internal link was left as plain text because its target could not be rewritten safely: ${currentDocumentPath} -> ${href}`,
  ];
}

function classifyNoteLink(linkNode: HTMLAnchorElement): "note-reference" | "note-backlink" | "note-link" | undefined {
  const tokens = [
    ...readSpaceSeparatedTokens(linkNode.getAttribute("epub:type")),
    ...readSpaceSeparatedTokens(linkNode.getAttribute("role")),
  ];

  if (tokens.some((token) => NOTE_REFERENCE_TYPES.has(token) || token === "doc-noteref")) {
    return "note-reference";
  }

  if (tokens.some((token) => NOTE_BACKLINK_TYPES.has(token) || token === "doc-backlink")) {
    return "note-backlink";
  }

  const closestNoteBody = linkNode.closest("[epub\\:type], [role]");
  if (closestNoteBody && isExplicitNoteBody(closestNoteBody)) {
    return "note-link";
  }

  return undefined;
}

function isExplicitNoteBody(element: Element): boolean {
  const tokens = [
    ...readSpaceSeparatedTokens(element.getAttribute("epub:type")),
    ...readSpaceSeparatedTokens(element.getAttribute("role")),
  ];

  return tokens.some((token) => NOTE_BODY_TYPES.has(token) || token === "doc-footnote" || token === "doc-endnote");
}

function readSpaceSeparatedTokens(value: string | null): string[] {
  return value ? value.split(/\s+/).map((token) => token.trim().toLowerCase()).filter(Boolean) : [];
}
