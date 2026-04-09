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

  return `${parts.join("\n\n")}\n`;
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
