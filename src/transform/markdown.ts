import TurndownService from "turndown";
import { gfm } from "turndown-plugin-gfm";

import { NOTE_BODY_TYPES } from "../domain/spec";
import { isMarkedComplexTable } from "./tables";

export function createMarkdownConverter(): TurndownService {
  const service = new TurndownService({
    codeBlockStyle: "fenced",
    emDelimiter: "*",
    headingStyle: "atx",
  });

  service.use(gfm);

  service.addRule("anchorTarget", {
    // Preserve injected merge anchors verbatim so rewritten intra-book links
    // still have stable Markdown-visible targets after turndown runs.
    filter(node: HTMLElement) {
      return node.nodeName.toLowerCase() === "a" && node.hasAttribute("id") && !node.hasAttribute("href");
    },
    replacement(_content: string, node: Node) {
      const id = (node as Element).getAttribute("id");
      return id ? `<a id="${id}"></a>` : "";
    },
  });

  service.addRule("lineBreak", {
    filter: "br",
    replacement() {
      return "\n";
    },
  });

  service.addRule("noteContainer", {
    filter(node: HTMLElement) {
      return isExplicitNoteBody(node) && node.nodeName.toLowerCase() !== "li";
    },
    replacement(content: string) {
      const trimmed = content.trim();
      return trimmed.length > 0 ? `\n\n${trimmed}\n\n` : "\n\n";
    },
  });

  service.addRule("complexTable", {
    // Keep complex tables as HTML when flattening them to Markdown would lose
    // important structure or cell relationships.
    filter(node: HTMLElement) {
      return isMarkedComplexTable(node);
    },
    replacement(_content: string, node: Node) {
      const element = node as Element;
      element.removeAttribute("data-epub2md-complex-table");
      return `\n\n${element.outerHTML}\n\n`;
    },
  });

  service.addRule("ruby", {
    // Emit a readable inline fallback for ruby so the base text and reading
    // both survive in plain Markdown-oriented ingestion flows.
    filter: "ruby",
    replacement(_content: string, node: Node) {
      const base = Array.from(node.childNodes as NodeListOf<ChildNode>)
        .filter((child) => child.nodeName.toLowerCase() !== "rt" && child.nodeName.toLowerCase() !== "rp")
        .map((child) => child.textContent ?? "")
        .join("")
        .trim();

      const reading = Array.from(node.childNodes as NodeListOf<ChildNode>)
        .filter((child) => child.nodeName.toLowerCase() === "rt")
        .map((child) => child.textContent ?? "")
        .join("")
        .trim();

      return reading ? `${base}（${reading}）` : base;
    },
  });

  service.addRule("subsup", {
    filter(node: HTMLElement) {
      return node.nodeName === "SUP" || node.nodeName === "SUB";
    },
    replacement(content: string, node: Node) {
      const tagName = node.nodeName.toLowerCase();
      return `<${tagName}>${content}</${tagName}>`;
    },
  });

  service.addRule("definitionList", {
    filter: ["dl", "dt", "dd"],
    replacement(content: string, node: Node) {
      const tagName = node.nodeName.toLowerCase();

      if (tagName === "dt") {
        return `- ${content.trim()}\n`;
      }

      if (tagName === "dd") {
        return `  - ${content.trim()}\n`;
      }

      return `\n${content.trim()}\n`;
    },
  });

  return service;
}

function isExplicitNoteBody(node: HTMLElement): boolean {
  const tokens = [
    ...readSpaceSeparatedTokens(node.getAttribute("epub:type")),
    ...readSpaceSeparatedTokens(node.getAttribute("role")),
  ];

  return tokens.some((token) => NOTE_BODY_TYPES.has(token) || token === "doc-footnote" || token === "doc-endnote");
}

function readSpaceSeparatedTokens(value: string | null): string[] {
  return value ? value.split(/\s+/).map((token) => token.trim().toLowerCase()).filter(Boolean) : [];
}
