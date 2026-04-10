import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import { PassThrough } from "node:stream";
import test from "node:test";

import {
  buildContainerXml,
  buildContentXhtml,
  buildNavXhtml,
  buildOpfXml,
  createEpubArchive,
} from "./helpers/epub-fixture.mjs";

const require = createRequire(import.meta.url);
const { runConvertCommand } = require("../dist/cli/run-convert-command.js");

function createCaptureStream() {
  const stream = new PassThrough();
  const chunks = [];
  stream.on("data", (chunk) => {
    chunks.push(Buffer.from(chunk));
  });

  return {
    stream,
    text() {
      return Buffer.concat(chunks).toString("utf8");
    },
  };
}

function createInputStream(text = "") {
  const stream = new PassThrough();
  if (text.length > 0) {
    stream.end(text);
    return stream;
  }

  stream.end();
  return stream;
}

async function createOutputPath(name) {
  const dir = await mkdtemp(path.join(os.tmpdir(), "epub2md-cli-out-"));
  return {
    outputPath: path.join(dir, name),
    cleanup: async () => rm(dir, { recursive: true, force: true }),
  };
}

test("CLI reports successful conversion without warnings", async () => {
  const fixture = await createEpubArchive({
    mimetype: "application/epub+zip\n",
    "META-INF/container.xml": buildContainerXml(),
    "OEBPS/content.opf": buildOpfXml({
      metadata: { title: "CLI Success Book" },
      manifestItems: [
        { id: "nav", href: "nav.xhtml", mediaType: "application/xhtml+xml", properties: "nav" },
        { id: "chapter1", href: "chapter1.xhtml", mediaType: "application/xhtml+xml" },
      ],
      spineIds: ["chapter1"],
    }),
    "OEBPS/nav.xhtml": buildNavXhtml(`
      <nav epub:type="toc">
        <ol><li><a href="chapter1.xhtml">Chapter</a></li></ol>
      </nav>
    `),
    "OEBPS/chapter1.xhtml": buildContentXhtml(`<h1>Chapter</h1><p>Body</p>`),
  });
  const output = await createOutputPath("cli-success.md");
  const stdout = createCaptureStream();
  const stderr = createCaptureStream();

  try {
    const exitCode = await runConvertCommand(
      fixture.epubPath,
      { output: output.outputPath },
      {
        cwd: process.cwd(),
        stdin: createInputStream(),
        stdout: stdout.stream,
        stderr: stderr.stream,
        interactive: false,
      },
    );

    assert.equal(exitCode, 0);
    assert.equal(stderr.text(), "");
    assert.equal(stdout.text(), `wrote ${output.outputPath}\n`);
  } finally {
    await fixture.cleanup();
    await output.cleanup();
  }
});

test("CLI prints visible warnings and warning count", async () => {
  const fixture = await createEpubArchive({
    mimetype: "application/epub+zip\n",
    "META-INF/container.xml": buildContainerXml(),
    "OEBPS/content.opf": buildOpfXml({
      metadata: { title: "CLI Warning Book" },
      manifestItems: [
        { id: "nav", href: "nav.xhtml", mediaType: "application/xhtml+xml", properties: "nav" },
        { id: "chapter1", href: "chapter1.xhtml", mediaType: "application/xhtml+xml" },
      ],
      spineIds: ["chapter1"],
    }),
    "OEBPS/nav.xhtml": buildNavXhtml(`
      <nav epub:type="toc">
        <ol><li><a href="chapter1.xhtml">Chapter</a></li></ol>
      </nav>
    `),
    "OEBPS/chapter1.xhtml": buildContentXhtml(`
      <h1>Chapter</h1>
      <table>
        <tr><th>A</th><th>B</th></tr>
        <tr><td rowspan="2">1</td><td>2</td></tr>
        <tr><td>3</td></tr>
      </table>
    `),
  });
  const output = await createOutputPath("cli-warning.md");
  const stdout = createCaptureStream();
  const stderr = createCaptureStream();

  try {
    const exitCode = await runConvertCommand(
      fixture.epubPath,
      { output: output.outputPath },
      {
        cwd: process.cwd(),
        stdin: createInputStream(),
        stdout: stdout.stream,
        stderr: stderr.stream,
        interactive: false,
      },
    );

    assert.equal(exitCode, 0);
    assert.match(
      stderr.text(),
      /warning \[COMPLEX_TABLE_PRESERVED\]: preserved 1 complex table as HTML because Markdown conversion would be lossy: OEBPS\/chapter1.xhtml/,
    );
    assert.match(stdout.text(), new RegExp(`^wrote ${escapeForRegExp(output.outputPath)} \\(1 warning\\)\\n$`));
  } finally {
    await fixture.cleanup();
    await output.cleanup();
  }
});

test("CLI prompts before overwriting existing output and continues when confirmed", async () => {
  const fixture = await createEpubArchive({
    mimetype: "application/epub+zip\n",
    "META-INF/container.xml": buildContainerXml(),
    "OEBPS/content.opf": buildOpfXml({
      metadata: { title: "CLI Overwrite Confirmed Book" },
      manifestItems: [
        { id: "nav", href: "nav.xhtml", mediaType: "application/xhtml+xml", properties: "nav" },
        { id: "chapter1", href: "chapter1.xhtml", mediaType: "application/xhtml+xml" },
      ],
      spineIds: ["chapter1"],
    }),
    "OEBPS/nav.xhtml": buildNavXhtml(`
      <nav epub:type="toc">
        <ol><li><a href="chapter1.xhtml">Chapter</a></li></ol>
      </nav>
    `),
    "OEBPS/chapter1.xhtml": buildContentXhtml(`<h1>Chapter</h1><p>Updated body</p>`),
  });
  const output = await createOutputPath("cli-overwrite-confirmed.md");
  const stdout = createCaptureStream();
  const stderr = createCaptureStream();

  try {
    await writeFile(output.outputPath, "already here", "utf8");

    const exitCode = await runConvertCommand(
      fixture.epubPath,
      { output: output.outputPath },
      {
        cwd: process.cwd(),
        stdin: createInputStream("y\n"),
        stdout: stdout.stream,
        stderr: stderr.stream,
        interactive: true,
      },
    );

    const markdown = await readFile(output.outputPath, "utf8");
    assert.equal(exitCode, 0);
    assert.match(stderr.text(), /overwrite existing output file\?.+\(y\/N\) /);
    assert.match(stdout.text(), new RegExp(`^wrote ${escapeForRegExp(output.outputPath)}\\n$`));
    assert.match(markdown, /\n# CLI Overwrite Confirmed Book\n/);
    assert.doesNotMatch(markdown, /already here/);
  } finally {
    await fixture.cleanup();
    await output.cleanup();
  }
});

test("CLI rejects overwrite when interactive confirmation answer is negative", async () => {
  const fixture = await createEpubArchive({
    mimetype: "application/epub+zip\n",
    "META-INF/container.xml": buildContainerXml(),
    "OEBPS/content.opf": buildOpfXml({
      metadata: { title: "CLI Overwrite Rejected Book" },
      manifestItems: [{ id: "chapter1", href: "chapter1.xhtml", mediaType: "application/xhtml+xml" }],
      spineIds: ["chapter1"],
    }),
    "OEBPS/chapter1.xhtml": buildContentXhtml(`<h1>Chapter</h1>`),
  });
  const output = await createOutputPath("cli-overwrite-rejected.md");
  const stdout = createCaptureStream();
  const stderr = createCaptureStream();

  try {
    await writeFile(output.outputPath, "already here", "utf8");

    const exitCode = await runConvertCommand(
      fixture.epubPath,
      { output: output.outputPath },
      {
        cwd: process.cwd(),
        stdin: createInputStream("n\n"),
        stdout: stdout.stream,
        stderr: stderr.stream,
        interactive: true,
      },
    );

    const existingContent = await readFile(output.outputPath, "utf8");
    assert.equal(exitCode, 1);
    assert.equal(stdout.text(), "");
    assert.equal(existingContent, "already here");
    assert.match(stderr.text(), /overwrite existing output file\?.+\(y\/N\) /);
    assert.match(
      stderr.text(),
      new RegExp(`epub2llm: output file already exists and overwrite was not confirmed: ${escapeForRegExp(output.outputPath)}\\n$`),
    );
  } finally {
    await fixture.cleanup();
    await output.cleanup();
  }
});

test("CLI rejects overwrite when interactive confirmation receives EOF", async () => {
  const fixture = await createEpubArchive({
    mimetype: "application/epub+zip\n",
    "META-INF/container.xml": buildContainerXml(),
    "OEBPS/content.opf": buildOpfXml({
      metadata: { title: "CLI Overwrite EOF Book" },
      manifestItems: [{ id: "chapter1", href: "chapter1.xhtml", mediaType: "application/xhtml+xml" }],
      spineIds: ["chapter1"],
    }),
    "OEBPS/chapter1.xhtml": buildContentXhtml(`<h1>Chapter</h1>`),
  });
  const output = await createOutputPath("cli-overwrite-eof.md");
  const stdout = createCaptureStream();
  const stderr = createCaptureStream();

  try {
    await writeFile(output.outputPath, "already here", "utf8");

    const exitCode = await runConvertCommand(
      fixture.epubPath,
      { output: output.outputPath },
      {
        cwd: process.cwd(),
        stdin: createInputStream(),
        stdout: stdout.stream,
        stderr: stderr.stream,
        interactive: true,
      },
    );

    const existingContent = await readFile(output.outputPath, "utf8");
    assert.equal(exitCode, 1);
    assert.equal(stdout.text(), "");
    assert.equal(existingContent, "already here");
    assert.match(stderr.text(), /overwrite existing output file\?.+\(y\/N\) /);
    assert.match(
      stderr.text(),
      new RegExp(`epub2llm: output file already exists and overwrite was not confirmed: ${escapeForRegExp(output.outputPath)}\\n$`),
    );
  } finally {
    await fixture.cleanup();
    await output.cleanup();
  }
});

function escapeForRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
