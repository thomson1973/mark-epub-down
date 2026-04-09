# mark-epub-down

Convert a single EPUB into a single Markdown source document for LLM, wiki, and knowledge-base ingestion.

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

## Quick Start

Install dependencies and build:

```bash
npm install
npm run build
```

Convert an EPUB:

```bash
node dist/cli.js input.epub
```

Write to an explicit output path:

```bash
node dist/cli.js input.epub -o output.md
```

Show CLI help:

```bash
node dist/cli.js --help
```

## Output Shape

The generated Markdown follows this high-level structure:

```markdown
---
title: Example Book
creator: Example Author
language: en
---

# Example Book

## TOC

- [Chapter 1](#...)
- Chapter 2

## Chapter 1

...
```

## Docs

- Public v1 spec: [docs/epub-to-md-v1-public-spec.md](docs/epub-to-md-v1-public-spec.md)
- Technical selection notes: [docs/v1-technical-selection.md](docs/v1-technical-selection.md)

## Development

```bash
npm run build
npm run typecheck
npm test
```
