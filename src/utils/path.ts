import { access } from "node:fs/promises";
import path from "node:path";

import { ConversionError } from "../domain/errors";

export function deriveOutputPath(inputPath: string, outputPath: string | undefined, cwd: string): string {
  if (outputPath) {
    return path.resolve(cwd, outputPath);
  }

  const parsed = path.parse(inputPath);
  return path.join(parsed.dir, `${parsed.name}.md`);
}

export async function ensureOutputPathAvailable(outputPath: string): Promise<void> {
  try {
    await access(outputPath);
    throw ConversionError.fatal(
      "OUTPUT_EXISTS",
      `output file already exists and will not be overwritten: ${outputPath}`,
    );
  } catch (error) {
    if (error instanceof ConversionError) {
      throw error;
    }
  }
}
