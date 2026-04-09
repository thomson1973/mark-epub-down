# EPUB to Markdown v1 Technical Selection

This document records the implementation choices made strictly from `epub-to-md-v1-spec.md`.

## Runtime and language

- Runtime target: Node.js `20.14.x`
- Language: TypeScript
- Module output: CommonJS for a simple Node CLI distribution path

## Package choices

| Concern | Package | Why this fits the spec |
| --- | --- | --- |
| CLI parsing | `commander` | Mature, minimal, standard `-h/-V/-o` surface |
| EPUB unzip to temp dir | `extract-zip` | Small, established, matches the "unpack into temporary working area" pipeline |
| XML parsing | `fast-xml-parser` | Mature, fast, good fit for `container.xml`, OPF, and NCX |
| XHTML/DOM handling | `jsdom@26.1.0` | Stable DOM API and compatible with Node `20.14.x` |
| HTML to Markdown | `turndown` | Widely used baseline converter for conservative Markdown generation |
| GFM table support | `turndown-plugin-gfm` | Provides a starting point for simple-table conversion without inventing a custom renderer too early |

## Project skeleton

The codebase is split by the pipeline described in the spec:

- `src/cli.ts`
  - CLI surface and exit handling
- `src/application/convert-epub.ts`
  - end-to-end orchestration of the v1 pipeline
- `src/epub/`
  - archive extraction, `container.xml`, OPF parsing, TOC parsing, spine indexing, spine content loading
- `src/transform/`
  - DOM cleanup, anchor rewriting, internal-link rewriting, Markdown conversion primitives
- `src/output/`
  - front matter, title, and TOC rendering
- `src/domain/`
  - spec constants, shared types, warnings, and fatal error model
- `src/utils/`
  - path derivation and conservative output handling

## Current MVP coverage

The current implementation now covers the minimum viable pipeline:

1. input/output path validation
2. temp-dir creation and EPUB extraction
3. `container.xml` parsing
4. OPF metadata/manifest/spine parsing
5. TOC source detection and parsing
6. spine index construction
7. spine XHTML loading
8. conservative DOM cleanup
9. internal target collection from `id` / `name` / `xml:id`, with merged-document anchor generation
10. low-risk internal link, TOC target, and explicit footnote/backlink rewriting
11. XHTML-to-Markdown conversion
12. front matter, book title, TOC, and merged body rendering
13. final Markdown file emission
14. stderr warning emission

## Still intentionally deferred

The following spec areas are still intentionally partial rather than fully complete:

1. deeper footnote edge cases beyond explicit source anchors and note/backlink semantics
2. richer table strategy, especially complex-table HTML fallback detection
3. overwrite confirmation UX for interactive terminals
4. warning wording/policy refinement
5. broader malformed-EPUB tolerance and regression coverage

## Regression Harness

The repo now includes a small regression suite using Node's built-in `node:test` runner:

- run with `npm test`
- tests generate temporary EPUB fixtures on the fly
- current coverage includes:
  - output skeleton generation
  - warning suppression for expected dropped elements
  - `<br>` rendered as plain newline for downstream Markdown tool compatibility
  - explicit footnote/backlink preservation
  - simple vs complex table handling
  - invalid nav downgraded to warning instead of fatal failure
  - NCX fallback when nav parsing fails
  - unreadable NCX downgraded to warning instead of fatal failure
  - invalid NCX downgraded to warning instead of fatal failure
  - missing-TOC warning behavior
  - conservative output-file overwrite failure

## Known Divergences

The current implementation intentionally diverges from one point in the draft spec:

- `<br>` currently renders as a plain newline, not trailing `\`
  - reason: downstream tools in actual use, including Obsidian/MarkEdit in this workflow, do not reliably interpret the trailing-backslash hard-break form
