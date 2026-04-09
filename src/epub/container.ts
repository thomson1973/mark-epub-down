import { readFile } from "node:fs/promises";
import path from "node:path";

import { XMLParser } from "fast-xml-parser";

import { ConversionError } from "../domain/errors";
import type { ContainerDocument } from "../domain/types";

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "",
  removeNSPrefix: true,
  trimValues: true,
});

export async function parseContainerDocument(workingDirectory: string): Promise<ContainerDocument> {
  const containerPath = path.join(workingDirectory, "META-INF", "container.xml");

  let containerXml: string;
  try {
    containerXml = await readFile(containerPath, "utf8");
  } catch {
    throw ConversionError.fatal(
      "CONTAINER_XML_MISSING",
      "EPUB container.xml is missing or unreadable.",
    );
  }

  let parsed: unknown;
  try {
    parsed = parser.parse(containerXml);
  } catch {
    throw ConversionError.fatal(
      "CONTAINER_XML_INVALID",
      "EPUB container.xml could not be parsed.",
    );
  }

  const rootfiles = asArray(
    (parsed as {
      container?: {
        rootfiles?: {
          rootfile?: Array<{ "full-path"?: string }> | { "full-path"?: string };
        };
      };
    }).container?.rootfiles?.rootfile,
  );

  const opfPath = rootfiles.find((rootfile) => typeof rootfile?.["full-path"] === "string")?.[
    "full-path"
  ];

  if (!opfPath) {
    throw ConversionError.fatal(
      "OPF_NOT_FOUND",
      "EPUB container.xml did not provide a package document path.",
    );
  }

  return { opfPath };
}

function asArray<T>(value: T | T[] | undefined): T[] {
  if (!value) {
    return [];
  }

  return Array.isArray(value) ? value : [value];
}
