export async function confirmOverwrite(
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
