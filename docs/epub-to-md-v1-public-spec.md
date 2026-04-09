# EPUB to Markdown v1 Public Spec

## Overview

`mark-epub-down` is a Node.js CLI that converts a single EPUB into a single Markdown document.

The v1 output is intended as source material for LLM knowledge bases, wikis, and related ingestion pipelines. The project prioritizes semantic preservation, source correctness, and low-risk transformation over reader-oriented Markdown polish.

## Scope

- Input: one `.epub` file
- Output: one `.md` file
- Supported runtime targets: Node.js `20`, `22`, and `24`
- Implementation language: TypeScript

## Goals

- Preserve meaningful document structure and content semantics.
- Keep source order aligned with the EPUB spine.
- Include EPUB-native table-of-contents information in the output.
- Prefer conservative transformations over aggressive normalization.
- Produce Markdown that works well as downstream ingestion source.

## Non-goals

- Perfect visual reproduction of EPUB layout or CSS presentation
- Viewer-specific Markdown tuning as the primary goal
- Heuristic reconstruction of missing structure
- Chapter-splitting output in the v1 baseline

## CLI

The v1 CLI keeps a small surface:

```text
epub2md <input.epub>
epub2md <input.epub> -o <output.md>
epub2md -h
epub2md --help
epub2md -V
epub2md --version
```

- The input EPUB is a positional argument.
- `-o` and `--output` select an explicit output path.
- If no output path is provided, the tool derives one from the input filename with a `.md` extension.
- Existing output files are not overwritten silently.

## Output Structure

The generated Markdown document uses this high-level structure:

1. minimal YAML front matter
2. top-level book title
3. dedicated `## TOC` section
4. merged body content in spine order

The front matter stays minimal and only includes values available from EPUB package metadata:

- `title`
- `creator`
- `language`
- `identifier`
- `publisher`
- `date`

Missing metadata fields are omitted rather than guessed.

## Conversion Rules

### Table of contents

- The EPUB-native TOC is the authoritative TOC source.
- The TOC is rendered as a hierarchical Markdown list under `## TOC`.
- Entries become Markdown links only when the target can be mapped confidently.
- Unresolved TOC items remain plain text.

### Document structure

- Source heading levels are preserved.
- Source headings are not globally shifted to compensate for the inserted book title.
- The merged body follows the source document's own heading structure.

### Links, anchors, and notes

- Internal targets are rewritten into collision-safe identifiers for merged single-file output.
- TOC targets, internal links, and note-related links are rewritten conservatively.
- When a link target cannot be rewritten safely, the output degrades conservatively instead of guessing.
- Footnote and note structure is preserved as close to the original topology as possible.

### Content cleanup

- Cleanup is based on DOM/XHTML elements, not page-type inference.
- The strategy is conservative blacklist removal.
- Only high-confidence non-text elements are removed by default.
- Empty containers may be removed only when they carry no visible text, no preserved children, and no necessary structure.

The default removable set includes:

- `script`
- `style`
- `img`
- `svg`
- `canvas`
- `audio`
- `video`
- `source`
- `track`
- `iframe`
- `object`
- `embed`
- `form`
- `input`
- `button`
- `select`
- `option`
- `textarea`

Containers such as `figure`, `figcaption`, `aside`, `section`, `nav`, `div`, and `span` are not removed purely by tag name.

### Core element mapping

- `h1` to `h6` map to Markdown headings
- `p` maps to paragraphs
- `blockquote` maps to Markdown blockquotes
- `hr` maps to `---`
- `em` and `i` map to emphasis
- `strong` and `b` map to strong emphasis
- `code` maps to inline code
- safe `a[href]` targets map to Markdown links

Definition lists are degraded into Markdown list structures instead of being dropped.

## Errors and Warnings

Fatal errors stop conversion and return a non-zero exit code. Typical fatal cases include:

- missing input file
- invalid or unreadable EPUB container
- missing or unreadable OPF/package document
- unreadable spine content required for conversion
- unwritable output path
- output target already exists and overwrite is not confirmed

Warnings still allow output generation and keep a success exit code. Typical warning cases include:

- missing TOC
- unresolved TOC targets
- links that cannot be safely rewritten
- dropped elements caused by cleanup rules
- incomplete metadata
- source structures that cannot be represented perfectly in Markdown

## Validation Boundary

- Fixed Layout EPUB (FXL) is out of scope for v1.
- Validation should cover nested TOCs, footnotes, CJK ruby content, tables, image-heavy EPUBs, degraded TOC metadata, incomplete metadata, and RTL samples.
