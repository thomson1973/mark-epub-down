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

- Public v1 spec: [docs/epub-to-md-v1-public-spec.md](docs/epub-to-md-v1-public-spec.md)
- Technical selection notes: [docs/v1-technical-selection.md](docs/v1-technical-selection.md)

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
npm run build
npm run typecheck
npm test
```
