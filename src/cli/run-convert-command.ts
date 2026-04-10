import path from "node:path";

import { convertEpub } from "../application/convert-epub";
import { ConversionError } from "../domain/errors";
import { deriveOutputPath } from "../utils/path";
import { confirmOverwrite } from "./confirm-overwrite";
import { reportCliError, reportConversionResult } from "./reporting";

export interface RunConvertCommandContext {
  cwd: string;
  stdin: NodeJS.ReadableStream;
  stdout: NodeJS.WritableStream;
  stderr: NodeJS.WritableStream;
  interactive: boolean;
}

export async function runConvertCommand(
  input: string,
  options: { output?: string },
  context: RunConvertCommandContext,
): Promise<number> {
  try {
    const result = await convertEpub({
      inputPath: input,
      outputPath: options.output,
      cwd: context.cwd,
    });
    reportConversionResult(context.stdout, context.stderr, result);
    return 0;
  } catch (error) {
    if (!(error instanceof ConversionError)) {
      const message = error instanceof Error ? error.message : String(error);
      reportCliError(context.stderr, `unexpected error: ${message}`);
      return 1;
    }

    if (error.code === "OUTPUT_EXISTS" && context.interactive) {
      const inputPath = path.resolve(context.cwd, input);
      const outputPath = deriveOutputPath(inputPath, options.output, context.cwd);
      const confirmed = await confirmOverwrite(outputPath, context.stdin, context.stderr);
      if (confirmed) {
        try {
          const result = await convertEpub({
            inputPath: input,
            outputPath: options.output,
            cwd: context.cwd,
            overwrite: true,
          });
          reportConversionResult(context.stdout, context.stderr, result);
          return 0;
        } catch (retryError) {
          if (retryError instanceof ConversionError) {
            reportCliError(context.stderr, retryError.message);
            return retryError.exitCode;
          }

          const message = retryError instanceof Error ? retryError.message : String(retryError);
          reportCliError(context.stderr, `unexpected error: ${message}`);
          return 1;
        }
      }

      reportCliError(
        context.stderr,
        `output file already exists and overwrite was not confirmed: ${outputPath}`,
      );
      return 1;
    }

    reportCliError(context.stderr, error.message);
    return error.exitCode;
  }
}
