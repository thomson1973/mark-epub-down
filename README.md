# mark-epub-down

Convert a single EPUB into a single Markdown source document for LLM knowledge bases, wikis, and related ingestion pipelines.

## Why

This project focuses on producing semantically useful Markdown from EPUB input. The v1 goal is not visual EPUB reproduction. It prioritizes source order, document structure, TOC preservation, and conservative transformation rules.

## What v1 Does

- converts one EPUB into one Markdown file
- preserves spine order and source heading structure
- emits a dedicated `## TOC` section from EPUB-native TOC data
- includes minimal OPF-derived YAML front matter
- rewrites internal targets conservatively for merged single-file output

## What v1 Does Not Do

- visually reproduce EPUB layout or CSS
- guess missing structure aggressively
- optimize first for reader-specific Markdown rendering
- split output by chapter in the v1 baseline

## Requirements

- Node.js `20`, `22`, or `24`
- npm

## Install

Install the CLI globally:

```bash
npm install -g mark-epub-down
```

Or add the package to a Node.js project:

```bash
npm install mark-epub-down
```

## CLI Usage

Convert an EPUB:

```bash
epub2llm input.epub
```

Write to an explicit output path:

```bash
epub2llm input.epub -o output.md
```

Run without global install:

```bash
npx --package mark-epub-down epub2llm input.epub
```

Show CLI help:

```bash
epub2llm --help
```

Existing output files are never overwritten silently. In an interactive terminal session, the CLI may ask for explicit overwrite confirmation with a default `No` answer.

## Node API

The published package currently exposes a CommonJS API:

```js
const { convertEpub } = require("mark-epub-down");

(async () => {
  const result = await convertEpub({
    inputPath: "input.epub",
    outputPath: "output.md",
  });

  console.log(result.outputPath);
  console.log(result.warnings);
})();
```

If the output path already exists, `convertEpub()` throws unless `overwrite: true` is passed:

```js
(async () => {
  await convertEpub({
    inputPath: "input.epub",
    outputPath: "output.md",
    overwrite: true,
  });
})();
```

## Output Shape

The generated Markdown follows this high-level structure:

```markdown
---
title: Example Book
creator: Example Author
language: en
published: 2026-04-09
---

# Example Book

## TOC

- [Chapter 1](#...)
- Chapter 2

## Chapter 1

...
```

## Docs

- Public v1 spec: [docs/epub-to-md-v1-public-spec.md](https://github.com/thomson1973/mark-epub-down/blob/main/docs/epub-to-md-v1-public-spec.md)
- Technical selection notes: [docs/v1-technical-selection.md](https://github.com/thomson1973/mark-epub-down/blob/main/docs/v1-technical-selection.md)

## Limitations

- Fixed Layout EPUB (FXL) is out of scope for the v1 baseline
- some internal links or TOC targets may degrade to plain text when they cannot be rewritten safely
- complex tables may remain as HTML instead of being flattened into incorrect Markdown
- images and other high-confidence non-text media are removed by default in v1
- output files are never overwritten silently; interactive terminal use may ask for explicit confirmation

## Roadmap

- expand real-world sample coverage for malformed or inconsistent EPUB inputs
- refine deeper footnote and note-topology edge cases beyond explicit source anchors
- refine richer table fallback boundaries for more complex publisher markup

## Development

```bash
npm install
npm run build
npm run typecheck
npm test
```
