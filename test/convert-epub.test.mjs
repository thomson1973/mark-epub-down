import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
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

async function createOutputPath(name) {
  const dir = await mkdtemp(path.join(os.tmpdir(), "epub2md-out-"));
  return {
    outputPath: path.join(dir, name),
    cleanup: async () => rm(dir, { recursive: true, force: true }),
  };
}

function deriveAssetDirectory(outputPath) {
  return path.join(path.dirname(outputPath), `${path.parse(outputPath).name}.assets`);
}

function createBinaryFixture(label) {
  return Buffer.from(`fixture:${label}`, "utf8");
}

test("converts a basic EPUB into the expected document skeleton", async () => {
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

  try {
    const result = await convertEpub({
      inputPath: fixture.epubPath,
      outputPath: output.outputPath,
    });
    const markdown = await readFile(output.outputPath, "utf8");

    assert.equal(result.outputPath, output.outputPath);
    assert.match(markdown, /^---\ntitle: "Skeleton Book"/);
    assert.match(markdown, /\n# Skeleton Book\n/);
    assert.match(markdown, /\n## TOC\n\n- \[Intro\]\(#chapter1-intro\)\n/);
    assert.match(markdown, /\| A \| B \|\n\| --- \| --- \|\n\| 1 \| 2 \|/);
    assert.ok(result.warnings.some((warning) => warning.code === "ELEMENTS_DROPPED"));
  } finally {
    await fixture.cleanup();
    await output.cleanup();
  }
});

test("maps EPUB dc:date to published and normalizes full timestamps to YYYY-MM-DD", async () => {
  const fixture = await createEpubArchive({
    mimetype: "application/epub+zip\n",
    "META-INF/container.xml": buildContainerXml(),
    "OEBPS/content.opf": buildOpfXml({
      metadata: {
        title: "Published Book",
        date: "2026-04-09T11:22:33Z",
      },
      manifestItems: [{ id: "chapter1", href: "chapter1.xhtml", mediaType: "application/xhtml+xml" }],
      spineIds: ["chapter1"],
    }),
    "OEBPS/chapter1.xhtml": buildContentXhtml(`
      <h1>Chapter</h1>
    `),
  });
  const output = await createOutputPath("published.md");

  try {
    await convertEpub({
      inputPath: fixture.epubPath,
      outputPath: output.outputPath,
    });
    const markdown = await readFile(output.outputPath, "utf8");

    assert.match(markdown, /\npublished: "2026-04-09"\n/);
    assert.doesNotMatch(markdown, /\ndate: /);
  } finally {
    await fixture.cleanup();
    await output.cleanup();
  }
});

test("preserves partial EPUB dc:date precision instead of guessing a day", async () => {
  const fixture = await createEpubArchive({
    mimetype: "application/epub+zip\n",
    "META-INF/container.xml": buildContainerXml(),
    "OEBPS/content.opf": buildOpfXml({
      metadata: {
        title: "Partial Date Book",
        date: "2026-04",
      },
      manifestItems: [{ id: "chapter1", href: "chapter1.xhtml", mediaType: "application/xhtml+xml" }],
      spineIds: ["chapter1"],
    }),
    "OEBPS/chapter1.xhtml": buildContentXhtml(`
      <h1>Chapter</h1>
    `),
  });
  const output = await createOutputPath("partial-date.md");

  try {
    await convertEpub({
      inputPath: fixture.epubPath,
      outputPath: output.outputPath,
    });
    const markdown = await readFile(output.outputPath, "utf8");

    assert.match(markdown, /\npublished: "2026-04"\n/);
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
    });
    const markdown = await readFile(output.outputPath, "utf8");

    assert.match(markdown, /line 1\nline 2/);
    assert.doesNotMatch(markdown, /\\\nline 2/);
  } finally {
    await fixture.cleanup();
    await output.cleanup();
  }
});

test("renders ruby as explicit text fallback instead of raw ruby markup", async () => {
  const fixture = await createEpubArchive({
    mimetype: "application/epub+zip\n",
    "META-INF/container.xml": buildContainerXml(),
    "OEBPS/content.opf": buildOpfXml({
      metadata: { title: "Ruby Book", language: "ja" },
      manifestItems: [{ id: "chapter1", href: "chapter1.xhtml", mediaType: "application/xhtml+xml" }],
      spineIds: ["chapter1"],
    }),
    "OEBPS/chapter1.xhtml": buildContentXhtml(`
      <h1>第一章</h1>
      <p><ruby>漢字<rt>かんじ</rt></ruby> を読む。</p>
    `),
  });
  const output = await createOutputPath("ruby.md");

  try {
    await convertEpub({
      inputPath: fixture.epubPath,
      outputPath: output.outputPath,
    });
    const markdown = await readFile(output.outputPath, "utf8");

    assert.match(markdown, /漢字（かんじ） を読む。/);
    assert.doesNotMatch(markdown, /<ruby>|<rt>/);
  } finally {
    await fixture.cleanup();
    await output.cleanup();
  }
});

test("preserves RTL text in TOC and body content", async () => {
  const fixture = await createEpubArchive({
    mimetype: "application/epub+zip\n",
    "META-INF/container.xml": buildContainerXml(),
    "OEBPS/content.opf": buildOpfXml({
      metadata: { title: "RTL Book", language: "ar" },
      manifestItems: [
        { id: "nav", href: "nav.xhtml", mediaType: "application/xhtml+xml", properties: "nav" },
        { id: "chapter1", href: "chapter1.xhtml", mediaType: "application/xhtml+xml" },
      ],
      spineIds: ["chapter1"],
    }),
    "OEBPS/nav.xhtml": buildNavXhtml(`
      <nav epub:type="toc" dir="rtl">
        <ol>
          <li><a href="chapter1.xhtml#intro">الفصل الأول</a></li>
        </ol>
      </nav>
    `),
    "OEBPS/chapter1.xhtml": buildContentXhtml(`
      <h1 id="intro" dir="rtl">الفصل الأول</h1>
      <p dir="rtl">هذا نص عربي للاختبار.</p>
    `),
  });
  const output = await createOutputPath("rtl.md");

  try {
    await convertEpub({
      inputPath: fixture.epubPath,
      outputPath: output.outputPath,
    });
    const markdown = await readFile(output.outputPath, "utf8");

    assert.match(markdown, /\n## TOC\n\n- \[الفصل الأول\]\(#chapter1-intro\)\n/);
    assert.match(markdown, /\n# الفصل الأول\n/);
    assert.match(markdown, /هذا نص عربي للاختبار\./);
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
    });
    const markdown = await readFile(output.outputPath, "utf8");

    assert.match(markdown, /\n## TOC\n\n- \[Chapter\]\(#chapter1-start\)\n/);
    assert.match(markdown, /<a id="chapter1-start"><\/a>/);
  } finally {
    await fixture.cleanup();
    await output.cleanup();
  }
});

test("keeps unresolved TOC items as plain text and warns without dropping resolved siblings", async () => {
  const fixture = await createEpubArchive({
    mimetype: "application/epub+zip\n",
    "META-INF/container.xml": buildContainerXml(),
    "OEBPS/content.opf": buildOpfXml({
      metadata: { title: "Degraded TOC Book" },
      manifestItems: [
        { id: "nav", href: "nav.xhtml", mediaType: "application/xhtml+xml", properties: "nav" },
        { id: "chapter1", href: "chapter1.xhtml", mediaType: "application/xhtml+xml" },
      ],
      spineIds: ["chapter1"],
    }),
    "OEBPS/nav.xhtml": buildNavXhtml(`
      <nav epub:type="toc">
        <ol>
          <li><a href="chapter1.xhtml#intro">Resolved</a></li>
          <li><a href="chapter1.xhtml#missing-target">Unresolved</a></li>
          <li><span>Plain label</span></li>
        </ol>
      </nav>
    `),
    "OEBPS/chapter1.xhtml": buildContentXhtml(`
      <h1 id="intro">Chapter</h1>
      <p>Body</p>
    `),
  });
  const output = await createOutputPath("degraded-toc.md");

  try {
    const result = await convertEpub({
      inputPath: fixture.epubPath,
      outputPath: output.outputPath,
    });
    const markdown = await readFile(output.outputPath, "utf8");

    assert.ok(result.warnings.some((warning) => warning.code === "TOC_TARGET_UNRESOLVED"));
    assert.match(markdown, /\n## TOC\n\n- \[Resolved\]\(#chapter1-intro\)\n- Unresolved\n- Plain label\n/);
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

  try {
    await convertEpub({
      inputPath: fixture.epubPath,
      outputPath: output.outputPath,
    });
    const markdown = await readFile(output.outputPath, "utf8");

    assert.match(markdown, /Alpha<a id="chapter1-r1"><\/a>\[<sup>1<\/sup>\]\(#notes-n1\)\./);
    assert.match(markdown, /<a id="notes-n1"><\/a>\n\nFirst note \[↩\]\(#chapter1-r1\)/);
  } finally {
    await fixture.cleanup();
    await output.cleanup();
  }
});

test("preserves ordered list semantics for role-based endnotes stored as list items", async () => {
  const fixture = await createEpubArchive({
    mimetype: "application/epub+zip\n",
    "META-INF/container.xml": buildContainerXml(),
    "OEBPS/content.opf": buildOpfXml({
      metadata: {
        title: "Role Endnote Book",
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
      <p>Alpha<a id="r1" role="doc-noteref" href="notes.xhtml#n1"><sup>1</sup></a>.</p>
      <p>Beta<a id="r2" role="doc-noteref" href="notes.xhtml#n1"><sup>2</sup></a>.</p>
    `),
    "OEBPS/notes.xhtml": buildContentXhtml(`
      <section role="doc-endnotes">
        <ol>
          <li id="n1" role="doc-endnote">
            <p>Shared note <a role="doc-backlink" href="chapter1.xhtml#r1">↩1</a> <a role="doc-backlink" href="chapter1.xhtml#r2">↩2</a></p>
          </li>
        </ol>
      </section>
    `),
  });
  const output = await createOutputPath("role-endnotes.md");

  try {
    await convertEpub({
      inputPath: fixture.epubPath,
      outputPath: output.outputPath,
    });
    const markdown = await readFile(output.outputPath, "utf8");

    assert.match(markdown, /Alpha<a id="chapter1-r1"><\/a>\[<sup>1<\/sup>\]\(#notes-n1\)\./);
    assert.match(markdown, /Beta<a id="chapter1-r2"><\/a>\[<sup>2<\/sup>\]\(#notes-n1\)\./);
    assert.match(markdown, /\n1\.  <a id="notes-n1"><\/a>\s+Shared note \[↩1\]\(#chapter1-r1\) \[↩2\]\(#chapter1-r2\)/);
  } finally {
    await fixture.cleanup();
    await output.cleanup();
  }
});

test("keeps sparse text from image-heavy EPUB content while dropping media elements", async () => {
  const fixture = await createEpubArchive({
    mimetype: "application/epub+zip\n",
    "META-INF/container.xml": buildContainerXml(),
    "OEBPS/content.opf": buildOpfXml({
      metadata: { title: "Image Heavy Book" },
      manifestItems: [
        { id: "nav", href: "nav.xhtml", mediaType: "application/xhtml+xml", properties: "nav" },
        { id: "chapter1", href: "chapter1.xhtml", mediaType: "application/xhtml+xml" },
      ],
      spineIds: ["chapter1"],
    }),
    "OEBPS/nav.xhtml": buildNavXhtml(`
      <nav epub:type="toc">
        <ol>
          <li><a href="chapter1.xhtml">Gallery</a></li>
        </ol>
      </nav>
    `),
    "OEBPS/chapter1.xhtml": buildContentXhtml(`
      <section>
        <img src="plate-1.jpg" alt="plate 1"/>
        <svg><text>ignored</text></svg>
        <video src="clip.mp4"></video>
        <p>Caption-like surviving text.</p>
      </section>
    `),
  });
  const output = await createOutputPath("image-heavy.md");

  try {
    const result = await convertEpub({
      inputPath: fixture.epubPath,
      outputPath: output.outputPath,
    });
    const markdown = await readFile(output.outputPath, "utf8");

    assert.ok(result.warnings.some((warning) => warning.code === "ELEMENTS_DROPPED"));
    assert.match(markdown, /Caption-like surviving text\./);
    assert.doesNotMatch(markdown, /<img|<svg|<video/);
  } finally {
    await fixture.cleanup();
    await output.cleanup();
  }
});

test("extracts internal images into a co-located asset namespace and rewrites markdown links", async () => {
  const fixture = await createEpubArchive({
    mimetype: "application/epub+zip\n",
    "META-INF/container.xml": buildContainerXml(),
    "OEBPS/content.opf": buildOpfXml({
      metadata: { title: "Extracted Images Book" },
      manifestItems: [
        { id: "nav", href: "nav.xhtml", mediaType: "application/xhtml+xml", properties: "nav" },
        { id: "chapter1", href: "chapter1.xhtml", mediaType: "application/xhtml+xml" },
        { id: "cover", href: "images/cover.jpg", mediaType: "image/jpeg" },
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
      <p><img src="images/cover.jpg" alt="Cover image"/></p>
      <p>Body</p>
    `),
    "OEBPS/images/cover.jpg": createBinaryFixture("cover-jpg"),
  });
  const output = await createOutputPath("custom-name.md");
  const assetDirectory = deriveAssetDirectory(output.outputPath);

  try {
    const result = await convertEpub({
      inputPath: fixture.epubPath,
      outputPath: output.outputPath,
      extractImages: true,
    });
    const markdown = await readFile(output.outputPath, "utf8");
    const extractedImage = await readFile(path.join(assetDirectory, "images", "cover.jpg"));

    assert.equal(result.outputPath, output.outputPath);
    assert.equal(result.assetOutputPath, assetDirectory);
    assert.match(markdown, /!\[Cover image\]\(custom-name\.assets\/images\/cover\.jpg\)/);
    assert.deepEqual(extractedImage, createBinaryFixture("cover-jpg"));
  } finally {
    await fixture.cleanup();
    await output.cleanup();
  }
});

test("extracts cover images wrapped in SVG image elements", async () => {
  const fixture = await createEpubArchive({
    mimetype: "application/epub+zip\n",
    "META-INF/container.xml": buildContainerXml(),
    "OEBPS/content.opf": buildOpfXml({
      metadata: { title: "SVG Cover Book" },
      manifestItems: [
        { id: "nav", href: "nav.xhtml", mediaType: "application/xhtml+xml", properties: "nav" },
        { id: "cover-page", href: "cover.xhtml", mediaType: "application/xhtml+xml", properties: "svg" },
        { id: "cover", href: "images/cover.jpg", mediaType: "image/jpeg", properties: "cover-image" },
      ],
      spineIds: ["cover-page"],
    }),
    "OEBPS/nav.xhtml": buildNavXhtml(`
      <nav epub:type="toc">
        <ol><li><a href="cover.xhtml">Cover</a></li></ol>
      </nav>
    `),
    "OEBPS/cover.xhtml": `<?xml version="1.0" encoding="utf-8"?>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" xmlns:xlink="http://www.w3.org/1999/xlink">
  <body epub:type="cover">
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
      <image width="100" height="100" xlink:href="images/cover.jpg"/>
    </svg>
  </body>
</html>
`,
    "OEBPS/images/cover.jpg": createBinaryFixture("svg-cover"),
  });
  const output = await createOutputPath("svg-cover.md");
  const assetDirectory = deriveAssetDirectory(output.outputPath);

  try {
    await convertEpub({
      inputPath: fixture.epubPath,
      outputPath: output.outputPath,
      extractImages: true,
    });

    const markdown = await readFile(output.outputPath, "utf8");
    const extractedImage = await readFile(path.join(assetDirectory, "images", "cover.jpg"));

    assert.match(markdown, /!\[\]\(svg-cover\.assets\/images\/cover\.jpg\)/);
    assert.deepEqual(extractedImage, createBinaryFixture("svg-cover"));
  } finally {
    await fixture.cleanup();
    await output.cleanup();
  }
});

test("preserves nested image paths, reuses repeated references, and deduplicates colliding names safely", async () => {
  const fixture = await createEpubArchive({
    mimetype: "application/epub+zip\n",
    "META-INF/container.xml": buildContainerXml(),
    "OEBPS/content.opf": buildOpfXml({
      metadata: { title: "Nested Images Book" },
      manifestItems: [
        { id: "chapter1", href: "chapter1.xhtml", mediaType: "application/xhtml+xml" },
        { id: "nested", href: "illustrations/ch01/map.png", mediaType: "image/png" },
        { id: "package-root", href: "map.png", mediaType: "image/png" },
        { id: "archive-root", href: "../map.png", mediaType: "image/png" },
      ],
      spineIds: ["chapter1"],
    }),
    "OEBPS/chapter1.xhtml": buildContentXhtml(`
      <p><img src="illustrations/ch01/map.png" alt="Nested map"/></p>
      <p><img src="illustrations/ch01/map.png" alt="Nested map again"/></p>
      <p><img src="map.png" alt="Package root map"/></p>
      <p><img src="../map.png" alt="Archive root map"/></p>
    `),
    "OEBPS/illustrations/ch01/map.png": createBinaryFixture("nested-map"),
    "OEBPS/map.png": createBinaryFixture("package-root-map"),
    "map.png": createBinaryFixture("archive-root-map"),
  });
  const output = await createOutputPath("nested-images.md");
  const assetDirectory = deriveAssetDirectory(output.outputPath);

  try {
    await convertEpub({
      inputPath: fixture.epubPath,
      outputPath: output.outputPath,
      extractImages: "all",
    });

    const markdown = await readFile(output.outputPath, "utf8");
    const nestedImage = await readFile(path.join(assetDirectory, "illustrations", "ch01", "map.png"));
    const packageRootImage = await readFile(path.join(assetDirectory, "map.png"));
    const dedupedImage = await readFile(path.join(assetDirectory, "map-2.png"));

    assert.match(markdown, /!\[Nested map\]\(nested-images\.assets\/illustrations\/ch01\/map\.png\)/);
    assert.match(markdown, /!\[Nested map again\]\(nested-images\.assets\/illustrations\/ch01\/map\.png\)/);
    assert.match(markdown, /!\[Package root map\]\(nested-images\.assets\/map\.png\)/);
    assert.match(markdown, /!\[Archive root map\]\(nested-images\.assets\/map-2\.png\)/);
    assert.deepEqual(nestedImage, createBinaryFixture("nested-map"));
    assert.deepEqual(packageRootImage, createBinaryFixture("package-root-map"));
    assert.deepEqual(dedupedImage, createBinaryFixture("archive-root-map"));
  } finally {
    await fixture.cleanup();
    await output.cleanup();
  }
});

test("treats row-header tables as simple Markdown tables without HTML fallback", async () => {
  const fixture = await createEpubArchive({
    mimetype: "application/epub+zip\n",
    "META-INF/container.xml": buildContainerXml(),
    "OEBPS/content.opf": buildOpfXml({
      metadata: { title: "Row Header Table Book" },
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
        <thead>
          <tr><th>Term</th><th>Meaning</th></tr>
        </thead>
        <tbody>
          <tr><th scope="row">A</th><td>Alpha</td></tr>
          <tr><th scope="row">B</th><td>Beta</td></tr>
        </tbody>
      </table>
    `),
  });
  const output = await createOutputPath("row-header-table.md");

  try {
    const result = await convertEpub({
      inputPath: fixture.epubPath,
      outputPath: output.outputPath,
    });
    const markdown = await readFile(output.outputPath, "utf8");

    assert.ok(!result.warnings.some((warning) => warning.code === "COMPLEX_TABLE_PRESERVED"));
    assert.match(markdown, /\| Term \| Meaning \|\n\| --- \| --- \|\n\| A \| Alpha \|\n\| B \| Beta \|/);
    assert.doesNotMatch(markdown, /<table/);
  } finally {
    await fixture.cleanup();
    await output.cleanup();
  }
});

test("preserves complex tables as HTML and returns a warning", async () => {
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

  try {
    const result = await convertEpub({
      inputPath: fixture.epubPath,
      outputPath: output.outputPath,
    });
    const markdown = await readFile(output.outputPath, "utf8");

    assert.ok(result.warnings.some((warning) => warning.code === "COMPLEX_TABLE_PRESERVED"));
    assert.match(markdown, /<table xmlns="http:\/\/www\.w3\.org\/1999\/xhtml">/);
  } finally {
    await fixture.cleanup();
    await output.cleanup();
  }
});

test("treats a missing NCX manifest target as degraded TOC metadata instead of fatal OPF failure", async () => {
  const fixture = await createEpubArchive({
    mimetype: "application/epub+zip\n",
    "META-INF/container.xml": buildContainerXml(),
    "OEBPS/content.opf": buildOpfXml({
      metadata: { title: "Missing TOC Manifest Target Book" },
      manifestItems: [{ id: "chapter1", href: "chapter1.xhtml", mediaType: "application/xhtml+xml" }],
      spineIds: ["chapter1"],
      spineTocId: "missing-ncx",
    }),
    "OEBPS/chapter1.xhtml": buildContentXhtml(`
      <h1>Chapter</h1>
      <p>Body</p>
    `),
  });
  const output = await createOutputPath("missing-toc-manifest-target.md");

  try {
    const result = await convertEpub({
      inputPath: fixture.epubPath,
      outputPath: output.outputPath,
    });
    const markdown = await readFile(output.outputPath, "utf8");

    assert.ok(result.warnings.some((warning) => warning.code === "TOC_MISSING"));
    assert.match(markdown, /\n## TOC\n/);
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

  try {
    const result = await convertEpub({
      inputPath: fixture.epubPath,
      outputPath: output.outputPath,
    });
    const markdown = await readFile(output.outputPath, "utf8");

    assert.ok(result.warnings.some((warning) => warning.code === "TOC_MISSING"));
    assert.match(markdown, /\n## TOC\n/);
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

  try {
    const result = await convertEpub({
      inputPath: fixture.epubPath,
      outputPath: output.outputPath,
    });
    const markdown = await readFile(output.outputPath, "utf8");

    assert.ok(result.warnings.some((warning) => warning.code === "TOC_NAV_INVALID"));
    assert.ok(result.warnings.some((warning) => warning.code === "TOC_MISSING"));
    assert.match(markdown, /\n## TOC\n/);
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

  try {
    const result = await convertEpub({
      inputPath: fixture.epubPath,
      outputPath: output.outputPath,
    });
    const markdown = await readFile(output.outputPath, "utf8");

    assert.ok(result.warnings.some((warning) => warning.code === "TOC_NAV_INVALID"));
    assert.ok(!result.warnings.some((warning) => warning.code === "TOC_MISSING"));
    assert.match(markdown, /\n## TOC\n\n- \[Chapter\]\(#chapter1-intro\)\n/);
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

  try {
    const result = await convertEpub({
      inputPath: fixture.epubPath,
      outputPath: output.outputPath,
    });
    const markdown = await readFile(output.outputPath, "utf8");

    assert.ok(result.warnings.some((warning) => warning.code === "TOC_NCX_UNREADABLE"));
    assert.ok(result.warnings.some((warning) => warning.code === "TOC_MISSING"));
    assert.match(markdown, /\n## TOC\n/);
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

  try {
    const result = await convertEpub({
      inputPath: fixture.epubPath,
      outputPath: output.outputPath,
    });
    const markdown = await readFile(output.outputPath, "utf8");

    assert.ok(result.warnings.some((warning) => warning.code === "TOC_NCX_INVALID"));
    assert.ok(result.warnings.some((warning) => warning.code === "TOC_MISSING"));
    assert.match(markdown, /\n## TOC\n/);
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

test("fails conservatively when the asset namespace already exists", async () => {
  const fixture = await createEpubArchive({
    mimetype: "application/epub+zip\n",
    "META-INF/container.xml": buildContainerXml(),
    "OEBPS/content.opf": buildOpfXml({
      metadata: { title: "Existing Assets Book" },
      manifestItems: [
        { id: "chapter1", href: "chapter1.xhtml", mediaType: "application/xhtml+xml" },
        { id: "cover", href: "images/cover.jpg", mediaType: "image/jpeg" },
      ],
      spineIds: ["chapter1"],
    }),
    "OEBPS/chapter1.xhtml": buildContentXhtml(`<p><img src="images/cover.jpg" alt="Cover"/></p>`),
    "OEBPS/images/cover.jpg": createBinaryFixture("existing-assets"),
  });
  const output = await createOutputPath("existing-assets.md");
  const assetDirectory = deriveAssetDirectory(output.outputPath);

  try {
    await mkdir(assetDirectory, { recursive: true });
    await writeFile(path.join(assetDirectory, "stale.txt"), "stale", "utf8");

    await assert.rejects(
      () =>
        convertEpub({
          inputPath: fixture.epubPath,
          outputPath: output.outputPath,
          extractImages: true,
        }),
      (error) => {
        assert.ok(error instanceof ConversionError);
        assert.equal(error.code, "OUTPUT_EXISTS");
        assert.match(error.message, new RegExp(escapeForRegExp(assetDirectory)));
        return true;
      },
    );
  } finally {
    await fixture.cleanup();
    await output.cleanup();
  }
});

test("overwrites an existing output file when overwrite is enabled", async () => {
  const fixture = await createEpubArchive({
    mimetype: "application/epub+zip\n",
    "META-INF/container.xml": buildContainerXml(),
    "OEBPS/content.opf": buildOpfXml({
      metadata: { title: "Overwrite Confirmed Book" },
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
    "OEBPS/chapter1.xhtml": buildContentXhtml(`<h1>Chapter</h1><p>Updated body</p>`),
  });
  const output = await createOutputPath("overwrite-confirmed.md");

  try {
    await writeFile(output.outputPath, "already here", "utf8");

    await convertEpub({
      inputPath: fixture.epubPath,
      outputPath: output.outputPath,
      overwrite: true,
    });

    const markdown = await readFile(output.outputPath, "utf8");
    assert.match(markdown, /\n# Overwrite Confirmed Book\n/);
    assert.doesNotMatch(markdown, /already here/);
  } finally {
    await fixture.cleanup();
    await output.cleanup();
  }
});

test("rejects overwrite when overwrite remains disabled", async () => {
  const fixture = await createEpubArchive({
    mimetype: "application/epub+zip\n",
    "META-INF/container.xml": buildContainerXml(),
    "OEBPS/content.opf": buildOpfXml({
      metadata: { title: "Overwrite Rejected Book" },
      manifestItems: [{ id: "chapter1", href: "chapter1.xhtml", mediaType: "application/xhtml+xml" }],
      spineIds: ["chapter1"],
    }),
    "OEBPS/chapter1.xhtml": buildContentXhtml(`<h1>Chapter</h1>`),
  });
  const output = await createOutputPath("overwrite-rejected.md");

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
        assert.match(error.message, /overwrite is disabled/);
        return true;
      },
    );

    const existingContent = await readFile(output.outputPath, "utf8");
    assert.equal(existingContent, "already here");
  } finally {
    await fixture.cleanup();
    await output.cleanup();
  }
});

test("overwrites existing output when overwrite is explicitly enabled after a previous write", async () => {
  const fixture = await createEpubArchive({
    mimetype: "application/epub+zip\n",
    "META-INF/container.xml": buildContainerXml(),
    "OEBPS/content.opf": buildOpfXml({
      metadata: { title: "Overwrite Enabled Book" },
      manifestItems: [{ id: "chapter1", href: "chapter1.xhtml", mediaType: "application/xhtml+xml" }],
      spineIds: ["chapter1"],
    }),
    "OEBPS/chapter1.xhtml": buildContentXhtml(`<h1>Chapter</h1><p>Replaced body</p>`),
  });
  const output = await createOutputPath("overwrite-eof.md");

  try {
    await writeFile(output.outputPath, "already here", "utf8");

    const result = await convertEpub({
      inputPath: fixture.epubPath,
      outputPath: output.outputPath,
      overwrite: true,
    });

    const markdown = await readFile(output.outputPath, "utf8");
    assert.equal(result.outputPath, output.outputPath);
    assert.match(markdown, /\n# Overwrite Enabled Book\n/);
    assert.doesNotMatch(markdown, /already here/);
  } finally {
    await fixture.cleanup();
    await output.cleanup();
  }
});

test("overwrites both markdown and asset namespace together when image extraction is enabled", async () => {
  const fixture = await createEpubArchive({
    mimetype: "application/epub+zip\n",
    "META-INF/container.xml": buildContainerXml(),
    "OEBPS/content.opf": buildOpfXml({
      metadata: { title: "Overwrite Assets Book" },
      manifestItems: [
        { id: "chapter1", href: "chapter1.xhtml", mediaType: "application/xhtml+xml" },
        { id: "new-image", href: "images/new.jpg", mediaType: "image/jpeg" },
      ],
      spineIds: ["chapter1"],
    }),
    "OEBPS/chapter1.xhtml": buildContentXhtml(`
      <h1>Chapter</h1>
      <p><img src="images/new.jpg" alt="New image"/></p>
      <p>Replaced body</p>
    `),
    "OEBPS/images/new.jpg": createBinaryFixture("new-image"),
  });
  const output = await createOutputPath("overwrite-assets.md");
  const assetDirectory = deriveAssetDirectory(output.outputPath);

  try {
    await writeFile(output.outputPath, "already here", "utf8");
    await mkdir(assetDirectory, { recursive: true });
    await writeFile(path.join(assetDirectory, "stale.txt"), "stale", "utf8");

    const result = await convertEpub({
      inputPath: fixture.epubPath,
      outputPath: output.outputPath,
      overwrite: true,
      extractImages: true,
    });

    const markdown = await readFile(output.outputPath, "utf8");
    const extractedImage = await readFile(path.join(assetDirectory, "images", "new.jpg"));

    assert.equal(result.outputPath, output.outputPath);
    assert.equal(result.assetOutputPath, assetDirectory);
    assert.match(markdown, /!\[New image\]\(overwrite-assets\.assets\/images\/new\.jpg\)/);
    assert.doesNotMatch(markdown, /already here/);
    assert.deepEqual(extractedImage, createBinaryFixture("new-image"));

    await assert.rejects(() => readFile(path.join(assetDirectory, "stale.txt"), "utf8"));
  } finally {
    await fixture.cleanup();
    await output.cleanup();
  }
});

function escapeForRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
