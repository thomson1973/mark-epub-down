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
const { convertEpub, ConversionError } = require("../dist/index.js");

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

async function createOutputPath(name) {
  const dir = await mkdtemp(path.join(os.tmpdir(), "epub2md-out-"));
  return {
    outputPath: path.join(dir, name),
    cleanup: async () => rm(dir, { recursive: true, force: true }),
  };
}

test("converts a basic EPUB into the expected document skeleton and suppresses dropped-element CLI noise", async () => {
  const fixture = await createEpubArchive({
    mimetype: "application/epub+zip\n",
    "META-INF/container.xml": buildContainerXml(),
    "OEBPS/content.opf": buildOpfXml({
      metadata: {
        title: "Skeleton Book",
        creator: "Codex",
        language: "en",
        identifier: "urn:test:skeleton",
      },
      manifestItems: [
        { id: "nav", href: "nav.xhtml", mediaType: "application/xhtml+xml", properties: "nav" },
        { id: "chapter1", href: "chapter1.xhtml", mediaType: "application/xhtml+xml" },
      ],
      spineIds: ["chapter1"],
    }),
    "OEBPS/nav.xhtml": buildNavXhtml(`
      <nav epub:type="toc">
        <ol>
          <li><a href="chapter1.xhtml#intro">Intro</a></li>
        </ol>
      </nav>
    `),
    "OEBPS/chapter1.xhtml": buildContentXhtml(`
      <h1 id="intro">Intro</h1>
      <p>Hello <em>world</em>.</p>
      <table>
        <thead><tr><th>A</th><th>B</th></tr></thead>
        <tbody><tr><td>1</td><td>2</td></tr></tbody>
      </table>
      <img src="cover.jpg" alt="cover"/>
    `),
  });
  const output = await createOutputPath("skeleton.md");
  const stdout = createCaptureStream();
  const stderr = createCaptureStream();

  try {
    const result = await convertEpub({
      inputPath: fixture.epubPath,
      outputPath: output.outputPath,
      stdout: stdout.stream,
      stderr: stderr.stream,
    });
    const markdown = await readFile(output.outputPath, "utf8");

    assert.equal(result.outputPath, output.outputPath);
    assert.match(markdown, /^---\ntitle: "Skeleton Book"/);
    assert.match(markdown, /\n# Skeleton Book\n/);
    assert.match(markdown, /\n## TOC\n\n- \[Intro\]\(#chapter1-intro\)\n/);
    assert.match(markdown, /\| A \| B \|\n\| --- \| --- \|\n\| 1 \| 2 \|/);
    assert.ok(result.warnings.some((warning) => warning.code === "ELEMENTS_DROPPED"));
    assert.equal(stderr.text(), "");
    assert.equal(stdout.text(), `wrote ${output.outputPath}\n`);
  } finally {
    await fixture.cleanup();
    await output.cleanup();
  }
});

test("renders br as a plain newline instead of a trailing backslash hard break", async () => {
  const fixture = await createEpubArchive({
    mimetype: "application/epub+zip\n",
    "META-INF/container.xml": buildContainerXml(),
    "OEBPS/content.opf": buildOpfXml({
      metadata: { title: "Line Break Book" },
      manifestItems: [{ id: "chapter1", href: "chapter1.xhtml", mediaType: "application/xhtml+xml" }],
      spineIds: ["chapter1"],
    }),
    "OEBPS/chapter1.xhtml": buildContentXhtml(`
      <p>line 1<br/>line 2</p>
    `),
  });
  const output = await createOutputPath("line-break.md");

  try {
    await convertEpub({
      inputPath: fixture.epubPath,
      outputPath: output.outputPath,
      stdout: createCaptureStream().stream,
      stderr: createCaptureStream().stream,
    });
    const markdown = await readFile(output.outputPath, "utf8");

    assert.match(markdown, /line 1\nline 2/);
    assert.doesNotMatch(markdown, /\\\nline 2/);
  } finally {
    await fixture.cleanup();
    await output.cleanup();
  }
});

test("preserves synthetic start anchors for file-level TOC targets", async () => {
  const fixture = await createEpubArchive({
    mimetype: "application/epub+zip\n",
    "META-INF/container.xml": buildContainerXml(),
    "OEBPS/content.opf": buildOpfXml({
      metadata: { title: "Start Anchor Book" },
      manifestItems: [
        { id: "nav", href: "nav.xhtml", mediaType: "application/xhtml+xml", properties: "nav" },
        { id: "chapter1", href: "chapter1.xhtml", mediaType: "application/xhtml+xml" },
      ],
      spineIds: ["chapter1"],
    }),
    "OEBPS/nav.xhtml": buildNavXhtml(`
      <nav epub:type="toc">
        <ol>
          <li><a href="chapter1.xhtml">Chapter</a></li>
        </ol>
      </nav>
    `),
    "OEBPS/chapter1.xhtml": buildContentXhtml(`
      <p><a id="mokuji-0001"></a></p>
      <p>Chapter title</p>
    `),
  });
  const output = await createOutputPath("start-anchor.md");

  try {
    await convertEpub({
      inputPath: fixture.epubPath,
      outputPath: output.outputPath,
      stdout: createCaptureStream().stream,
      stderr: createCaptureStream().stream,
    });
    const markdown = await readFile(output.outputPath, "utf8");

    assert.match(markdown, /\n## TOC\n\n- \[Chapter\]\(#chapter1-start\)\n/);
    assert.match(markdown, /<a id="chapter1-start"><\/a>/);
  } finally {
    await fixture.cleanup();
    await output.cleanup();
  }
});

test("preserves explicit footnote references and backlinks across merged output", async () => {
  const fixture = await createEpubArchive({
    mimetype: "application/epub+zip\n",
    "META-INF/container.xml": buildContainerXml(),
    "OEBPS/content.opf": buildOpfXml({
      metadata: {
        title: "Footnote Book",
        language: "en",
      },
      manifestItems: [
        { id: "nav", href: "nav.xhtml", mediaType: "application/xhtml+xml", properties: "nav" },
        { id: "chapter1", href: "chapter1.xhtml", mediaType: "application/xhtml+xml" },
        { id: "notes", href: "notes.xhtml", mediaType: "application/xhtml+xml" },
      ],
      spineIds: ["chapter1", "notes"],
    }),
    "OEBPS/nav.xhtml": buildNavXhtml(`
      <nav epub:type="toc">
        <ol>
          <li><a href="chapter1.xhtml">Chapter 1</a></li>
          <li><a href="notes.xhtml#n1">Notes</a></li>
        </ol>
      </nav>
    `),
    "OEBPS/chapter1.xhtml": buildContentXhtml(`
      <h1>Chapter 1</h1>
      <p>Alpha<a id="r1" epub:type="noteref" href="notes.xhtml#n1"><sup>1</sup></a>.</p>
    `),
    "OEBPS/notes.xhtml": buildContentXhtml(`
      <section epub:type="endnotes">
        <aside id="n1" epub:type="footnote">
          <p>First note <a epub:type="backlink" href="chapter1.xhtml#r1">↩</a></p>
        </aside>
      </section>
    `),
  });
  const output = await createOutputPath("footnote.md");
  const stdout = createCaptureStream();
  const stderr = createCaptureStream();

  try {
    await convertEpub({
      inputPath: fixture.epubPath,
      outputPath: output.outputPath,
      stdout: stdout.stream,
      stderr: stderr.stream,
    });
    const markdown = await readFile(output.outputPath, "utf8");

    assert.match(markdown, /Alpha<a id="chapter1-r1"><\/a>\[<sup>1<\/sup>\]\(#notes-n1\)\./);
    assert.match(markdown, /<a id="notes-n1"><\/a>\n\nFirst note \[↩\]\(#chapter1-r1\)/);
    assert.equal(stderr.text(), "");
    assert.equal(stdout.text(), `wrote ${output.outputPath}\n`);
  } finally {
    await fixture.cleanup();
    await output.cleanup();
  }
});

test("preserves complex tables as HTML and emits a visible warning", async () => {
  const fixture = await createEpubArchive({
    mimetype: "application/epub+zip\n",
    "META-INF/container.xml": buildContainerXml(),
    "OEBPS/content.opf": buildOpfXml({
      metadata: { title: "Complex Table Book" },
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
  const output = await createOutputPath("complex-table.md");
  const stdout = createCaptureStream();
  const stderr = createCaptureStream();

  try {
    const result = await convertEpub({
      inputPath: fixture.epubPath,
      outputPath: output.outputPath,
      stdout: stdout.stream,
      stderr: stderr.stream,
    });
    const markdown = await readFile(output.outputPath, "utf8");

    assert.ok(result.warnings.some((warning) => warning.code === "COMPLEX_TABLE_PRESERVED"));
    assert.match(markdown, /<table xmlns="http:\/\/www\.w3\.org\/1999\/xhtml">/);
    assert.match(stderr.text(), /warning \[COMPLEX_TABLE_PRESERVED\]: preserved 1 complex table as HTML/);
    assert.match(stdout.text(), /\(1 warning\)\n$/);
  } finally {
    await fixture.cleanup();
    await output.cleanup();
  }
});

test("treats missing TOC as a warning and still writes markdown", async () => {
  const fixture = await createEpubArchive({
    mimetype: "application/epub+zip\n",
    "META-INF/container.xml": buildContainerXml(),
    "OEBPS/content.opf": buildOpfXml({
      metadata: { title: "No TOC Book" },
      manifestItems: [{ id: "chapter1", href: "chapter1.xhtml", mediaType: "application/xhtml+xml" }],
      spineIds: ["chapter1"],
    }),
    "OEBPS/chapter1.xhtml": buildContentXhtml(`
      <h1>Chapter</h1>
      <p>Body</p>
    `),
  });
  const output = await createOutputPath("no-toc.md");
  const stdout = createCaptureStream();
  const stderr = createCaptureStream();

  try {
    const result = await convertEpub({
      inputPath: fixture.epubPath,
      outputPath: output.outputPath,
      stdout: stdout.stream,
      stderr: stderr.stream,
    });
    const markdown = await readFile(output.outputPath, "utf8");

    assert.ok(result.warnings.some((warning) => warning.code === "TOC_MISSING"));
    assert.match(markdown, /\n## TOC\n/);
    assert.match(stderr.text(), /warning \[TOC_MISSING\]: EPUB TOC metadata is missing or unreadable\./);
    assert.match(stdout.text(), /\(1 warning\)\n$/);
  } finally {
    await fixture.cleanup();
    await output.cleanup();
  }
});

test("treats an invalid nav document as a warning and still writes markdown", async () => {
  const fixture = await createEpubArchive({
    mimetype: "application/epub+zip\n",
    "META-INF/container.xml": buildContainerXml(),
    "OEBPS/content.opf": buildOpfXml({
      metadata: { title: "Broken Nav Book" },
      manifestItems: [
        { id: "nav", href: "nav.xhtml", mediaType: "application/xhtml+xml", properties: "nav" },
        { id: "chapter1", href: "chapter1.xhtml", mediaType: "application/xhtml+xml" },
      ],
      spineIds: ["chapter1"],
    }),
    "OEBPS/nav.xhtml": `<?xml version="1.0" encoding="utf-8"?>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops">
  <body>
    <nav epub:type="toc"><ol><li><a href="chapter1.xhtml">Broken</a>
  </body>
</html>
`,
    "OEBPS/chapter1.xhtml": buildContentXhtml(`
      <h1>Chapter</h1>
      <p>Body</p>
    `),
  });
  const output = await createOutputPath("broken-nav.md");
  const stdout = createCaptureStream();
  const stderr = createCaptureStream();

  try {
    const result = await convertEpub({
      inputPath: fixture.epubPath,
      outputPath: output.outputPath,
      stdout: stdout.stream,
      stderr: stderr.stream,
    });
    const markdown = await readFile(output.outputPath, "utf8");

    assert.ok(result.warnings.some((warning) => warning.code === "TOC_NAV_INVALID"));
    assert.ok(result.warnings.some((warning) => warning.code === "TOC_MISSING"));
    assert.match(markdown, /\n## TOC\n/);
    assert.match(stderr.text(), /warning \[TOC_NAV_INVALID\]: EPUB nav document could not be parsed: OEBPS\/nav.xhtml/);
    assert.match(stderr.text(), /warning \[TOC_MISSING\]: EPUB TOC metadata is missing or unreadable\./);
    assert.match(stdout.text(), /\(2 warnings\)\n$/);
  } finally {
    await fixture.cleanup();
    await output.cleanup();
  }
});

test("falls back to NCX when nav is invalid", async () => {
  const fixture = await createEpubArchive({
    mimetype: "application/epub+zip\n",
    "META-INF/container.xml": buildContainerXml(),
    "OEBPS/content.opf": buildOpfXml({
      metadata: { title: "NCX Fallback Book" },
      manifestItems: [
        { id: "nav", href: "nav.xhtml", mediaType: "application/xhtml+xml", properties: "nav" },
        { id: "ncx", href: "toc.ncx", mediaType: "application/x-dtbncx+xml" },
        { id: "chapter1", href: "chapter1.xhtml", mediaType: "application/xhtml+xml" },
      ],
      spineIds: ["chapter1"],
      spineTocId: "ncx",
    }),
    "OEBPS/nav.xhtml": `<?xml version="1.0" encoding="utf-8"?>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops">
  <body><nav epub:type="toc"><ol><li>`,
    "OEBPS/toc.ncx": `<?xml version="1.0" encoding="utf-8"?>
<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1">
  <navMap>
    <navPoint id="navPoint-1" playOrder="1">
      <navLabel><text>Chapter</text></navLabel>
      <content src="chapter1.xhtml#intro"/>
    </navPoint>
  </navMap>
</ncx>
`,
    "OEBPS/chapter1.xhtml": buildContentXhtml(`
      <h1 id="intro">Chapter</h1>
      <p>Body</p>
    `),
  });
  const output = await createOutputPath("ncx-fallback.md");
  const stdout = createCaptureStream();
  const stderr = createCaptureStream();

  try {
    const result = await convertEpub({
      inputPath: fixture.epubPath,
      outputPath: output.outputPath,
      stdout: stdout.stream,
      stderr: stderr.stream,
    });
    const markdown = await readFile(output.outputPath, "utf8");

    assert.ok(result.warnings.some((warning) => warning.code === "TOC_NAV_INVALID"));
    assert.ok(!result.warnings.some((warning) => warning.code === "TOC_MISSING"));
    assert.match(markdown, /\n## TOC\n\n- \[Chapter\]\(#chapter1-intro\)\n/);
    assert.match(stderr.text(), /warning \[TOC_NAV_INVALID\]: EPUB nav document could not be parsed: OEBPS\/nav.xhtml/);
    assert.doesNotMatch(stderr.text(), /TOC_MISSING/);
    assert.match(stdout.text(), /\(1 warning\)\n$/);
  } finally {
    await fixture.cleanup();
    await output.cleanup();
  }
});

test("treats an unreadable NCX document as a warning and still writes markdown", async () => {
  const fixture = await createEpubArchive({
    mimetype: "application/epub+zip\n",
    "META-INF/container.xml": buildContainerXml(),
    "OEBPS/content.opf": buildOpfXml({
      metadata: { title: "Missing NCX Book" },
      manifestItems: [
        { id: "ncx", href: "toc.ncx", mediaType: "application/x-dtbncx+xml" },
        { id: "chapter1", href: "chapter1.xhtml", mediaType: "application/xhtml+xml" },
      ],
      spineIds: ["chapter1"],
      spineTocId: "ncx",
    }),
    "OEBPS/chapter1.xhtml": buildContentXhtml(`
      <h1>Chapter</h1>
      <p>Body</p>
    `),
  });
  const output = await createOutputPath("missing-ncx.md");
  const stdout = createCaptureStream();
  const stderr = createCaptureStream();

  try {
    const result = await convertEpub({
      inputPath: fixture.epubPath,
      outputPath: output.outputPath,
      stdout: stdout.stream,
      stderr: stderr.stream,
    });
    const markdown = await readFile(output.outputPath, "utf8");

    assert.ok(result.warnings.some((warning) => warning.code === "TOC_NCX_UNREADABLE"));
    assert.ok(result.warnings.some((warning) => warning.code === "TOC_MISSING"));
    assert.match(markdown, /\n## TOC\n/);
    assert.match(stderr.text(), /warning \[TOC_NCX_UNREADABLE\]: EPUB NCX document could not be read: OEBPS\/toc\.ncx/);
    assert.match(stderr.text(), /warning \[TOC_MISSING\]: EPUB TOC metadata is missing or unreadable\./);
    assert.match(stdout.text(), /\(2 warnings\)\n$/);
  } finally {
    await fixture.cleanup();
    await output.cleanup();
  }
});

test("treats an invalid NCX document as a warning and still writes markdown", async () => {
  const fixture = await createEpubArchive({
    mimetype: "application/epub+zip\n",
    "META-INF/container.xml": buildContainerXml(),
    "OEBPS/content.opf": buildOpfXml({
      metadata: { title: "Invalid NCX Book" },
      manifestItems: [
        { id: "ncx", href: "toc.ncx", mediaType: "application/x-dtbncx+xml" },
        { id: "chapter1", href: "chapter1.xhtml", mediaType: "application/xhtml+xml" },
      ],
      spineIds: ["chapter1"],
      spineTocId: "ncx",
    }),
    "OEBPS/toc.ncx": `<?xml version="1.0" encoding="utf-8"?>
<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1"><
`,
    "OEBPS/chapter1.xhtml": buildContentXhtml(`
      <h1>Chapter</h1>
      <p>Body</p>
    `),
  });
  const output = await createOutputPath("invalid-ncx.md");
  const stdout = createCaptureStream();
  const stderr = createCaptureStream();

  try {
    const result = await convertEpub({
      inputPath: fixture.epubPath,
      outputPath: output.outputPath,
      stdout: stdout.stream,
      stderr: stderr.stream,
    });
    const markdown = await readFile(output.outputPath, "utf8");

    assert.ok(result.warnings.some((warning) => warning.code === "TOC_NCX_INVALID"));
    assert.ok(result.warnings.some((warning) => warning.code === "TOC_MISSING"));
    assert.match(markdown, /\n## TOC\n/);
    assert.match(stderr.text(), /warning \[TOC_NCX_INVALID\]: EPUB NCX document could not be parsed: OEBPS\/toc\.ncx/);
    assert.match(stderr.text(), /warning \[TOC_MISSING\]: EPUB TOC metadata is missing or unreadable\./);
    assert.match(stdout.text(), /\(2 warnings\)\n$/);
  } finally {
    await fixture.cleanup();
    await output.cleanup();
  }
});

test("fails conservatively when output already exists", async () => {
  const fixture = await createEpubArchive({
    mimetype: "application/epub+zip\n",
    "META-INF/container.xml": buildContainerXml(),
    "OEBPS/content.opf": buildOpfXml({
      metadata: { title: "Existing Output Book" },
      manifestItems: [{ id: "chapter1", href: "chapter1.xhtml", mediaType: "application/xhtml+xml" }],
      spineIds: ["chapter1"],
    }),
    "OEBPS/chapter1.xhtml": buildContentXhtml(`<h1>Chapter</h1>`),
  });
  const output = await createOutputPath("existing.md");

  try {
    await writeFile(output.outputPath, "already here", "utf8");

    await assert.rejects(
      () =>
        convertEpub({
          inputPath: fixture.epubPath,
          outputPath: output.outputPath,
        }),
      (error) => {
        assert.ok(error instanceof ConversionError);
        assert.equal(error.code, "OUTPUT_EXISTS");
        return true;
      },
    );
  } finally {
    await fixture.cleanup();
    await output.cleanup();
  }
});
