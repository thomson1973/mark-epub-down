import type { ConvertEpubResult } from "../application/convert-epub";
import { CLI_BINARY_NAME } from "../domain/spec";
import type { WarningRecord } from "../domain/types";
import { getCliVisibleWarnings, summarizeWarnings } from "../domain/warnings";

export function reportConversionResult(
  stdout: NodeJS.WritableStream,
  stderr: NodeJS.WritableStream,
  result: ConvertEpubResult,
): void {
  const cliWarnings = summarizeWarnings(getCliVisibleWarnings(result.warnings));
  emitWarnings(stderr, cliWarnings);
  emitSuccess(stdout, result.outputPath, result.assetOutputPath, cliWarnings.length);
}

export function reportCliError(stderr: NodeJS.WritableStream, message: string): void {
  stderr.write(`${CLI_BINARY_NAME}: ${message}\n`);
}

function emitWarnings(stderr: NodeJS.WritableStream, warnings: WarningRecord[]): void {
  for (const warning of warnings) {
    stderr.write(`warning [${warning.code}]: ${warning.message}\n`);
  }
}

function emitSuccess(
  stdout: NodeJS.WritableStream,
  outputPath: string,
  assetOutputPath: string | undefined,
  warningCount: number,
): void {
  const suffix = warningCount > 0 ? ` (${warningCount === 1 ? "1 warning" : `${warningCount} warnings`})` : "";
  const outputDescription = assetOutputPath ? `${outputPath} and ${assetOutputPath}` : outputPath;
  stdout.write(`wrote ${outputDescription}${suffix}\n`);
}
