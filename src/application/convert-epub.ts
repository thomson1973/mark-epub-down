import { access, mkdir, mkdtemp, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";

import { convertEpubDocument } from "./convert-epub-document";
import { ConversionError } from "../domain/errors";
import type { ExtractImagesMode, ExtractedAssetRecord, OutputLayout, WarningRecord } from "../domain/types";
import { deriveOutputPlan, ensureOutputPlanAvailable, type OutputPlan } from "../utils/path";

export interface ConvertEpubOptions {
  inputPath: string;
  outputPath?: string;
  cwd?: string;
  overwrite?: boolean;
  extractImages?: boolean | ExtractImagesMode;
  outputLayout?: OutputLayout;
  splitRootDir?: string;
}

export interface ConvertEpubResult {
  inputPath: string;
  outputPath: string;
  assetOutputPath?: string;
  warnings: WarningRecord[];
}

export async function convertEpub(options: ConvertEpubOptions): Promise<ConvertEpubResult> {
  const cwd = options.cwd ?? process.cwd();
  const inputPath = path.resolve(cwd, options.inputPath);
  const extractImages = normalizeExtractImagesMode(options.extractImages);
  const outputPlan = deriveOutputPlan(inputPath, options.outputPath, cwd, {
    extractImages: extractImages === "all",
    outputLayout: options.outputLayout,
    splitRootDir: options.splitRootDir,
  });

  await assertInputExists(inputPath);
  await ensureOutputPlanAvailable(outputPlan, options.overwrite === true);

  const result = await convertEpubDocument({
    inputPath,
    extractImages,
    assetLinkPrefix: outputPlan.assetLinkPrefix,
  });
  await writeOutputSet(outputPlan, result.markdown, result.assets, options.overwrite === true);

  return {
    inputPath: result.inputPath,
    outputPath: outputPlan.markdownOutputPath,
    assetOutputPath: outputPlan.assetDirectoryPath,
    warnings: result.warnings,
  };
}

async function assertInputExists(inputPath: string): Promise<void> {
  try {
    await access(inputPath);
  } catch {
    throw ConversionError.fatal(
      "INPUT_NOT_FOUND",
      `input EPUB does not exist: ${inputPath}`,
    );
  }
}

function normalizeExtractImagesMode(value: boolean | ExtractImagesMode | undefined): ExtractImagesMode | undefined {
  if (value === true || value === "all") {
    return "all";
  }

  return undefined;
}

async function writeOutputSet(
  outputPlan: OutputPlan,
  markdown: string,
  assets: ExtractedAssetRecord[],
  overwrite: boolean,
): Promise<void> {
  await mkdir(path.dirname(outputPlan.markdownOutputPath), { recursive: true });

  const stagingRoot = await mkdtemp(
    path.join(path.dirname(outputPlan.markdownOutputPath), ".epub2llm-output-"),
  );
  const stagedMarkdownPath = path.join(stagingRoot, path.basename(outputPlan.markdownOutputPath));
  const stagedAssetDirectoryPath = outputPlan.assetDirectoryPath
    ? path.join(stagingRoot, path.basename(outputPlan.assetDirectoryPath))
    : undefined;

  try {
    await writeFile(stagedMarkdownPath, markdown, "utf8");

    if (stagedAssetDirectoryPath) {
      await mkdir(stagedAssetDirectoryPath, { recursive: true });
      await writeAssets(stagedAssetDirectoryPath, assets);
    }

    if (overwrite) {
      await removeExistingOutputSet(outputPlan);
    }

    if (stagedAssetDirectoryPath && outputPlan.assetDirectoryPath) {
      await mkdir(path.dirname(outputPlan.assetDirectoryPath), { recursive: true });
      await rename(stagedAssetDirectoryPath, outputPlan.assetDirectoryPath);
    }

    await rename(stagedMarkdownPath, outputPlan.markdownOutputPath);
  } finally {
    await rm(stagingRoot, { recursive: true, force: true });
  }
}

async function writeAssets(stagingAssetDirectoryPath: string, assets: ExtractedAssetRecord[]): Promise<void> {
  for (const asset of assets) {
    const outputPath = path.join(stagingAssetDirectoryPath, asset.outputRelativePath);
    await mkdir(path.dirname(outputPath), { recursive: true });
    await writeFile(outputPath, asset.data);
  }
}

async function removeExistingOutputSet(outputPlan: OutputPlan): Promise<void> {
  await rm(outputPlan.markdownOutputPath, { force: true });

  if (outputPlan.assetDirectoryPath) {
    await rm(outputPlan.assetDirectoryPath, { recursive: true, force: true });
  }
}
