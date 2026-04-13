import { FRONT_MATTER_FIELDS, GENERATED_TOC_HEADING } from "../domain/spec";
import type { BookMetadata, TocItem } from "../domain/types";

export function renderFrontMatter(metadata: BookMetadata): string {
  const entries = FRONT_MATTER_FIELDS.flatMap((field) => {
    const value = metadata[field];
    return typeof value === "string" && value.length > 0 ? [[field, value] as const] : [];
  });

  if (entries.length === 0) {
    return "";
  }

  const lines = ["---", ...entries.map(([key, value]) => `${key}: ${escapeYaml(value)}`), "---"];
  return `${lines.join("\n")}\n\n`;
}

export function renderTopLevelTitle(metadata: BookMetadata): string {
  return metadata.title ? `# ${metadata.title}\n\n` : "";
}

export function renderToc(items: TocItem[]): string {
  const lines = [`## ${GENERATED_TOC_HEADING}`, ""];

  if (items.length === 0) {
    return `${lines.join("\n")}\n`;
  }

  lines.push(...renderTocItems(items, 0), "");
  return `${lines.join("\n")}\n`;
}

export function renderDocument(input: {
  metadata: BookMetadata;
  toc: TocItem[];
  body: string;
}): string {
  const parts = [
    renderFrontMatter(input.metadata).trimEnd(),
    renderTopLevelTitle(input.metadata).trimEnd(),
    renderToc(input.toc).trimEnd(),
    input.body.trim(),
  ].filter((part) => part.length > 0);

  return `${normalizeMarkdownSpacing(parts.join("\n\n")).trim()}\n`;
}

export function normalizeMarkdownSpacing(markdown: string): string {
  const normalizedLines: string[] = [];
  const lines = markdown.split(/\r?\n/);
  let previousLineBlank = false;
  let activeFence: { marker: "`" | "~"; length: number } | null = null;

  for (const line of lines) {
    if (activeFence) {
      normalizedLines.push(line);

      if (isClosingFence(line, activeFence)) {
        activeFence = null;
      }

      previousLineBlank = false;
      continue;
    }

    const openingFence = parseFence(line);
    if (openingFence) {
      normalizedLines.push(line);
      activeFence = openingFence;
      previousLineBlank = false;
      continue;
    }

    if (line.trim().length === 0) {
      if (!previousLineBlank) {
        normalizedLines.push("");
      }

      previousLineBlank = true;
      continue;
    }

    normalizedLines.push(line);
    previousLineBlank = false;
  }

  return normalizedLines.join("\n");
}

function renderTocItems(items: TocItem[], depth: number): string[] {
  const indent = "  ".repeat(depth);
  const lines: string[] = [];

  for (const item of items) {
    const label = item.href ? `[${item.label}](${item.href})` : item.label;
    lines.push(`${indent}- ${label}`);

    if (item.children.length > 0) {
      lines.push(...renderTocItems(item.children, depth + 1));
    }
  }

  return lines;
}

function escapeYaml(value: string): string {
  return JSON.stringify(value);
}

function parseFence(line: string): { marker: "`" | "~"; length: number } | null {
  const match = line.match(/^ {0,3}([`~]{3,})(.*)$/);
  if (!match) {
    return null;
  }

  const marker = match[1][0];
  if (marker !== "`" && marker !== "~") {
    return null;
  }

  return {
    marker,
    length: match[1].length,
  };
}

function isClosingFence(line: string, fence: { marker: "`" | "~"; length: number }): boolean {
  const match = line.match(/^ {0,3}([`~]{3,})[ \t]*$/);
  return Boolean(match && match[1][0] === fence.marker && match[1].length >= fence.length);
}
