import { readFile } from "node:fs/promises";
import path from "node:path";

import { XMLParser } from "fast-xml-parser";

import { ConversionError } from "../domain/errors";
import type {
  BookMetadata,
  ManifestItem,
  ParsedPackageDocument,
  SpineItemRef,
} from "../domain/types";

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "",
  removeNSPrefix: true,
  trimValues: true,
});

export async function parsePackageDocument(
  workingDirectory: string,
  opfRelativePath: string,
): Promise<ParsedPackageDocument> {
  const opfPath = path.join(workingDirectory, opfRelativePath);

  let opfXml: string;
  try {
    opfXml = await readFile(opfPath, "utf8");
  } catch {
    throw ConversionError.fatal(
      "OPF_UNREADABLE",
      `package document could not be read: ${opfRelativePath}`,
    );
  }

  let parsed: unknown;
  try {
    parsed = parser.parse(opfXml);
  } catch {
    throw ConversionError.fatal(
      "OPF_INVALID",
      `package document could not be parsed: ${opfRelativePath}`,
    );
  }

  const packageNode = (parsed as {
    package?: {
      metadata?: Record<string, unknown>;
      manifest?: { item?: Array<Record<string, string>> | Record<string, string> };
      spine?: {
        itemref?: Array<Record<string, string>> | Record<string, string>;
        toc?: string;
      };
    };
  }).package;

  if (!packageNode?.manifest || !packageNode.spine) {
    throw ConversionError.fatal("OPF_MISSING_CORE_SECTIONS", "package document is missing manifest or spine.");
  }

  const manifestItems = asArray(packageNode.manifest.item).map(mapManifestItem);
  const manifestById = new Map(manifestItems.map((item) => [item.id, item]));
  const spine = asArray(packageNode.spine.itemref).map(mapSpineItem);

  if (spine.length === 0) {
    throw ConversionError.fatal("SPINE_EMPTY", "package document spine is empty.");
  }

  return {
    opfPath: opfRelativePath,
    opfDirectory: path.dirname(opfRelativePath),
    metadata: mapMetadata(packageNode.metadata ?? {}),
    manifestItems,
    manifestById,
    spine,
    navigation: {
      navItemId: manifestItems.find((item) => item.properties.includes("nav"))?.id,
      ncxItemId: packageNode.spine.toc,
    },
  };
}

function mapMetadata(metadataNode: Record<string, unknown>): BookMetadata {
  return {
    title: readFirstString(metadataNode.title),
    creator: readFirstString(metadataNode.creator),
    language: readFirstString(metadataNode.language),
    identifier: readFirstString(metadataNode.identifier),
    publisher: readFirstString(metadataNode.publisher),
    published: normalizePublishedDate(readFirstString(metadataNode.date)),
  };
}

function normalizePublishedDate(value: string | undefined): string | undefined {
  if (!value) {
    return undefined;
  }

  const trimmed = value.trim();

  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return trimmed;
  }

  if (/^\d{4}-\d{2}-\d{2}(?:[Tt ].+)$/.test(trimmed)) {
    return trimmed.slice(0, 10);
  }

  return trimmed;
}

function mapManifestItem(node: Record<string, string>): ManifestItem {
  const id = node.id;
  const href = node.href;
  const mediaType = node["media-type"];

  if (!id || !href || !mediaType) {
    throw ConversionError.fatal("MANIFEST_ITEM_INVALID", "manifest item is missing id, href, or media-type.");
  }

  return {
    id,
    href,
    mediaType,
    properties: node.properties ? node.properties.split(/\s+/).filter(Boolean) : [],
  };
}

function mapSpineItem(node: Record<string, string>): SpineItemRef {
  if (!node.idref) {
    throw ConversionError.fatal("SPINE_ITEM_INVALID", "spine item is missing idref.");
  }

  return {
    idref: node.idref,
    linear: node.linear !== "no",
  };
}

function readFirstString(value: unknown): string | undefined {
  if (typeof value === "string" && value.length > 0) {
    return value;
  }

  if (Array.isArray(value)) {
    const first = value.find((entry) => typeof entry === "string" && entry.length > 0);
    return typeof first === "string" ? first : undefined;
  }

  if (value && typeof value === "object" && "#text" in value) {
    const text = (value as { "#text"?: unknown })["#text"];
    return typeof text === "string" && text.length > 0 ? text : undefined;
  }

  return undefined;
}

function asArray<T>(value: T | T[] | undefined): T[] {
  if (!value) {
    return [];
  }

  return Array.isArray(value) ? value : [value];
}
