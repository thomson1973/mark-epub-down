import { access } from "node:fs/promises";
import path from "node:path";

import { ConversionError } from "../domain/errors";

export interface OutputPlan {
  markdownOutputPath: string;
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
}): OutputPlan {
  const markdownOutputPath = deriveOutputPath(inputPath, outputPath, cwd);
  const assetDirectoryPath = options?.extractImages
    ? path.join(path.dirname(markdownOutputPath), `${path.parse(markdownOutputPath).name}.assets`)
    : undefined;

  return {
    markdownOutputPath,
    assetDirectoryPath,
    assetLinkPrefix: assetDirectoryPath ? path.basename(assetDirectoryPath) : undefined,
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
