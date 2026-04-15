import { access } from "node:fs/promises";
import path from "node:path";

import { ConversionError } from "../domain/errors";
import type { OutputLayout } from "../domain/types";

export interface OutputPlan {
  markdownOutputPath: string;
  outputLayout: OutputLayout;
  assetDirectoryPath?: string;
  assetLinkPrefix?: string;
}

export function deriveOutputPath(inputPath: string, outputPath: string | undefined, cwd: string): string {
  if (outputPath) {
    return path.resolve(cwd, outputPath);
  }

  const parsed = path.parse(inputPath);
  return path.join(parsed.dir, `${parsed.name}.md`);
}

export function deriveOutputPlan(inputPath: string, outputPath: string | undefined, cwd: string, options?: {
  extractImages?: boolean;
  outputLayout?: OutputLayout;
  splitRootDir?: string;
}): OutputPlan {
  const extractImages = options?.extractImages === true;
  const outputLayout = options?.outputLayout ?? "co-located";
  const splitRootDir = options?.splitRootDir ? path.resolve(cwd, options.splitRootDir) : undefined;

  validateOutputOptions({
    outputPath,
    extractImages,
    outputLayout,
    splitRootDir,
  });

  if (outputLayout === "split") {
    return deriveSplitOutputPlan(inputPath, outputPath, cwd, splitRootDir);
  }

  const markdownOutputPath = deriveOutputPath(inputPath, outputPath, cwd);
  const assetDirectoryPath = options?.extractImages
    ? path.join(path.dirname(markdownOutputPath), `${path.parse(markdownOutputPath).name}.assets`)
    : undefined;

  return {
    markdownOutputPath,
    outputLayout,
    assetDirectoryPath,
    assetLinkPrefix: assetDirectoryPath ? toPosixPath(path.relative(path.dirname(markdownOutputPath), assetDirectoryPath)) : undefined,
  };
}

export async function ensureOutputPathAvailable(
  outputPath: string,
  overwrite = false,
): Promise<void> {
  try {
    await access(outputPath);
  } catch (error) {
    if (error instanceof ConversionError) {
      throw error;
    }

    return;
  }

  if (overwrite) {
    return;
  }

  throw ConversionError.fatal(
    "OUTPUT_EXISTS",
    `output file already exists and overwrite is disabled: ${outputPath}`,
  );
}

export async function ensureOutputPlanAvailable(plan: OutputPlan, overwrite = false): Promise<void> {
  for (const targetPath of listPlannedOutputPaths(plan)) {
    try {
      await access(targetPath);
    } catch (error) {
      if (error instanceof ConversionError) {
        throw error;
      }

      continue;
    }

    if (overwrite) {
      continue;
    }

    throw ConversionError.fatal(
      "OUTPUT_EXISTS",
      `output path already exists and overwrite is disabled: ${targetPath}`,
    );
  }
}

export function describeOutputPlan(plan: OutputPlan): string {
  return listPlannedOutputPaths(plan).join(" and ");
}

export function listPlannedOutputPaths(plan: OutputPlan): string[] {
  return [plan.markdownOutputPath, plan.assetDirectoryPath].filter((value): value is string => Boolean(value));
}

function validateOutputOptions(input: {
  outputPath: string | undefined;
  extractImages: boolean;
  outputLayout: OutputLayout;
  splitRootDir: string | undefined;
}): void {
  if (input.splitRootDir && input.outputPath) {
    throw ConversionError.fatal(
      "INVALID_OPTIONS",
      "outputPath and splitRootDir cannot be used together",
    );
  }

  if (input.splitRootDir && input.outputLayout !== "split") {
    throw ConversionError.fatal(
      "INVALID_OPTIONS",
      "splitRootDir is only supported when outputLayout is split",
    );
  }

  if (input.outputLayout === "split" && !input.extractImages) {
    throw ConversionError.fatal(
      "INVALID_OPTIONS",
      "split layout requires image extraction to be enabled",
    );
  }
}

function deriveSplitOutputPlan(
  inputPath: string,
  outputPath: string | undefined,
  cwd: string,
  splitRootDir: string | undefined,
): OutputPlan {
  const markdownOutputPath = outputPath
    ? path.resolve(cwd, outputPath)
    : path.join(splitRootDir ?? path.dirname(inputPath), "sources", `${path.parse(inputPath).name}.md`);
  const splitPaths = resolveSplitPaths(markdownOutputPath);

  if (!splitPaths) {
    throw ConversionError.fatal(
      "INVALID_OPTIONS",
      "split layout requires outputPath to be under a sources directory",
    );
  }

  const assetDirectoryPath = path.join(
    splitPaths.splitRootDir,
    "assets",
    splitPaths.relativeDirectory,
    path.parse(markdownOutputPath).name,
  );

  return {
    markdownOutputPath,
    outputLayout: "split",
    assetDirectoryPath,
    assetLinkPrefix: toPosixPath(path.relative(path.dirname(markdownOutputPath), assetDirectoryPath)),
  };
}

function resolveSplitPaths(markdownOutputPath: string): {
  splitRootDir: string;
  relativeDirectory: string;
} | undefined {
  const resolvedPath = path.resolve(markdownOutputPath);
  const pathParts = splitPathParts(resolvedPath);
  const sourcesIndex = pathParts.lastIndexOf("sources");

  if (sourcesIndex === -1 || sourcesIndex === pathParts.length - 1) {
    return undefined;
  }

  const root = path.parse(resolvedPath).root;
  const splitRootDir = path.join(root, ...pathParts.slice(0, sourcesIndex));
  const relativePathWithinSources = path.join(...pathParts.slice(sourcesIndex + 1));

  return {
    splitRootDir,
    relativeDirectory: path.dirname(relativePathWithinSources),
  };
}

function splitPathParts(value: string): string[] {
  return path.relative(path.parse(value).root, value).split(path.sep).filter(Boolean);
}

function toPosixPath(value: string): string {
  return value.split(path.sep).join("/");
}
