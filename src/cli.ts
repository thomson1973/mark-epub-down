#!/usr/bin/env node

import { Command } from "commander";

import { convertEpub } from "./application/convert-epub";
import { ConversionError } from "./domain/errors";
import { CLI_BINARY_NAME } from "./domain/spec";

async function main(): Promise<void> {
  const program = new Command();

  program
    .name(CLI_BINARY_NAME)
    .description("Convert a single EPUB into a single Markdown source document.")
    .version("0.1.0", "-V, --version", "output the version number")
    .argument("<input>", "input EPUB file")
    .option("-o, --output <path>", "output Markdown path")
    .showHelpAfterError("(add -h for usage)")
    .action(async (input: string, options: { output?: string }) => {
      try {
        await convertEpub({
          inputPath: input,
          outputPath: options.output,
          cwd: process.cwd(),
          stdout: process.stdout,
          stderr: process.stderr,
          interactive: Boolean(process.stdin.isTTY && process.stdout.isTTY),
        });
      } catch (error) {
        if (error instanceof ConversionError) {
          process.stderr.write(`${CLI_BINARY_NAME}: ${error.message}\n`);
          process.exitCode = error.exitCode;
          return;
        }

        const message = error instanceof Error ? error.message : String(error);
        process.stderr.write(`${CLI_BINARY_NAME}: unexpected error: ${message}\n`);
        process.exitCode = 1;
      }
    });

  await program.parseAsync(process.argv);
}

void main();
