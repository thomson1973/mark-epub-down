#!/usr/bin/env node

import { Command } from "commander";

import { CLI_BINARY_NAME } from "./domain/spec";
import { runConvertCommand } from "./cli/run-convert-command";

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
      process.exitCode = await runConvertCommand(input, options, {
        cwd: process.cwd(),
        stdin: process.stdin,
        stdout: process.stdout,
        stderr: process.stderr,
        interactive: Boolean(process.stdin.isTTY && process.stdout.isTTY),
      });
    });

  await program.parseAsync(process.argv);
}

void main();
