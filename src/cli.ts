#!/usr/bin/env node

import { Command, InvalidArgumentError, Option } from "commander";

import { CLI_BINARY_NAME } from "./domain/spec";
import { runConvertCommand, type RunConvertCommandOptions } from "./cli/run-convert-command";

async function main(): Promise<void> {
  const program = new Command();

  program
    .name(CLI_BINARY_NAME)
    .description("Convert a single EPUB into a single Markdown source document.")
    .version("0.1.0", "-V, --version", "output the version number")
    .argument("<input>", "input EPUB file")
    .option("-o, --output <path>", "output Markdown path")
    .showHelpAfterError("(add -h for usage)")
    .action(async (input: string, options: RunConvertCommandOptions) => {
      process.exitCode = await runConvertCommand(input, options, {
        cwd: process.cwd(),
        stdin: process.stdin,
        stdout: process.stdout,
        stderr: process.stderr,
        interactive: Boolean(process.stdin.isTTY && process.stdout.isTTY),
      });
    });

  program.addOption(
    new Option(
      "--extract-images [mode]",
      "extract internal images into per-output asset directories (supported mode: all)",
    )
      .preset("all")
      .argParser(parseExtractImagesMode),
  );
  program.addOption(
    new Option(
      "--output-layout <layout>",
      "set the extracted-image output layout (supported layouts: co-located, split)",
    ).argParser(parseOutputLayout),
  );
  program.addOption(
    new Option(
      "--split-root <dir>",
      "set the split-layout root directory; requires --output-layout=split and cannot be combined with --output",
    ),
  );

  await program.parseAsync(process.argv);
}

void main();

function parseExtractImagesMode(value: string): "all" {
  if (value === "all") {
    return value;
  }

  throw new InvalidArgumentError(`expected "all", received "${value}"`);
}

function parseOutputLayout(value: string): "co-located" | "split" {
  if (value === "co-located" || value === "split") {
    return value;
  }

  throw new InvalidArgumentError(`expected "co-located" or "split", received "${value}"`);
}
