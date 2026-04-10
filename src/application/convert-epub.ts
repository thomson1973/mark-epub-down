import { access, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { convertEpubDocument } from "./convert-epub-document";
import { ConversionError } from "../domain/errors";
import type { WarningRecord } from "../domain/types";
import { deriveOutputPath, ensureOutputPathAvailable } from "../utils/path";

export interface ConvertEpubOptions {
  inputPath: string;
  outputPath?: string;
  cwd?: string;
  overwrite?: boolean;
}

export interface ConvertEpubResult {
  inputPath: string;
  outputPath: string;
  warnings: WarningRecord[];
}

export async function convertEpub(options: ConvertEpubOptions): Promise<ConvertEpubResult> {
  const cwd = options.cwd ?? process.cwd();
  const inputPath = path.resolve(cwd, options.inputPath);
  const outputPath = deriveOutputPath(inputPath, options.outputPath, cwd);

  await assertInputExists(inputPath);
  await ensureOutputPathAvailable(outputPath, options.overwrite === true);

  const result = await convertEpubDocument({ inputPath });

  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, result.markdown, "utf8");

  return {
    inputPath: result.inputPath,
    outputPath,
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
