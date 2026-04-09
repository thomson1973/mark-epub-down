import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import extract from "extract-zip";

export async function createWorkingDirectory(): Promise<string> {
  return mkdtemp(path.join(tmpdir(), "epub2md-"));
}

export async function extractArchive(inputPath: string, workingDirectory: string): Promise<void> {
  await extract(inputPath, { dir: workingDirectory });
}

export async function cleanupWorkingDirectory(workingDirectory: string): Promise<void> {
  await rm(workingDirectory, { recursive: true, force: true });
}
