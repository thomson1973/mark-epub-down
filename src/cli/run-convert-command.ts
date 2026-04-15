import path from "node:path";

import { convertEpub } from "../application/convert-epub";
import { ConversionError } from "../domain/errors";
import { deriveOutputPlan, describeOutputPlan } from "../utils/path";
import { confirmOverwrite } from "./confirm-overwrite";
import { reportCliError, reportConversionResult } from "./reporting";

export interface RunConvertCommandOptions {
  output?: string;
  extractImages?: "all";
  outputLayout?: "co-located" | "split";
  splitRoot?: string;
}

export interface RunConvertCommandContext {
  cwd: string;
  stdin: NodeJS.ReadableStream;
  stdout: NodeJS.WritableStream;
  stderr: NodeJS.WritableStream;
  interactive: boolean;
}

export async function runConvertCommand(
  input: string,
  options: RunConvertCommandOptions,
  context: RunConvertCommandContext,
): Promise<number> {
  try {
    const result = await convertEpub({
      inputPath: input,
      outputPath: options.output,
      cwd: context.cwd,
      extractImages: options.extractImages,
      outputLayout: options.outputLayout,
      splitRootDir: options.splitRoot,
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
      const outputPlan = deriveOutputPlan(inputPath, options.output, context.cwd, {
        extractImages: options.extractImages === "all",
        outputLayout: options.outputLayout,
        splitRootDir: options.splitRoot,
      });
      const confirmed = await confirmOverwrite(
        describeOutputPlan(outputPlan),
        context.stdin,
        context.stderr,
      );
      if (confirmed) {
        try {
          const result = await convertEpub({
            inputPath: input,
            outputPath: options.output,
            cwd: context.cwd,
            overwrite: true,
            extractImages: options.extractImages,
            outputLayout: options.outputLayout,
            splitRootDir: options.splitRoot,
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
        `output path already exists and overwrite was not confirmed: ${describeOutputPlan(outputPlan)}`,
      );
      return 1;
    }

    reportCliError(context.stderr, error.message);
    return error.exitCode;
  }
}
