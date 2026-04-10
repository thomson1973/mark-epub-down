import { access } from "node:fs/promises";
import path from "node:path";

import { ConversionError } from "../domain/errors";

export interface OutputPathAvailabilityOptions {
  interactive?: boolean;
  stdin?: NodeJS.ReadableStream;
  stderr?: NodeJS.WritableStream;
}

export function deriveOutputPath(inputPath: string, outputPath: string | undefined, cwd: string): string {
  if (outputPath) {
    return path.resolve(cwd, outputPath);
  }

  const parsed = path.parse(inputPath);
  return path.join(parsed.dir, `${parsed.name}.md`);
}

export async function ensureOutputPathAvailable(
  outputPath: string,
  options: OutputPathAvailabilityOptions = {},
): Promise<void> {
  try {
    await access(outputPath);
  } catch (error) {
    if (error instanceof ConversionError) {
      throw error;
    }

    return;
  }

  const interactive = options.interactive === true;
  const stdin = options.stdin;
  const stderr = options.stderr;

  if (interactive && stdin && stderr) {
    const confirmed = await confirmOverwrite(outputPath, stdin, stderr);
    if (confirmed) {
      return;
    }
  }

  throw ConversionError.fatal(
    "OUTPUT_EXISTS",
    `output file already exists and overwrite was not confirmed: ${outputPath}`,
  );
}

async function confirmOverwrite(
  outputPath: string,
  stdin: NodeJS.ReadableStream,
  stderr: NodeJS.WritableStream,
): Promise<boolean> {
  stderr.write(`overwrite existing output file? ${outputPath} (y/N) `);
  try {
    const answer = await readSingleLine(stdin);
    return answer !== null && isAffirmativeAnswer(answer);
  } catch {
    return false;
  }
}

function isAffirmativeAnswer(value: string): boolean {
  const normalized = value.trim().toLowerCase();
  return normalized === "y" || normalized === "yes";
}

async function readSingleLine(stdin: NodeJS.ReadableStream): Promise<string | null> {
  let buffered = "";

  for await (const chunk of stdin as AsyncIterable<string | Buffer>) {
    buffered += chunk.toString();

    const newlineIndex = buffered.indexOf("\n");
    if (newlineIndex >= 0) {
      return buffered.slice(0, newlineIndex).replace(/\r$/, "");
    }
  }

  return buffered.length > 0 ? buffered.replace(/\r$/, "") : null;
}
