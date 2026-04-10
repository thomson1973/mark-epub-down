---
name: mark-epub-down
description: Convert a single EPUB into a single Markdown source document for LLM knowledge bases, wikis, and ingestion workflows with the mark-epub-down package or epub2llm CLI. Use when the user wants EPUB-to-Markdown conversion, warning review, TOC or internal-link degradation checks, or conservative output validation.
disable-model-invocation: true
argument-hint: [input.epub] [optional-output.md]
---

Convert one EPUB into one Markdown source document and report the result conservatively.

Follow these rules:

1. Confirm the task is EPUB-to-Markdown for knowledge-base, wiki, note, or ingestion use.
2. If you are already inside the `mark-epub-down` repository, prefer the local repository path first so you use the checked-out version rather than downloading the published package.
3. Prefer the smallest available execution path in this order:
   - local repo build plus `node dist/cli.js` when working inside this repository
   - local Node API via `convertEpub()` when the task is clearly programmatic use inside this repository
   - installed `epub2llm`
   - `npx --package mark-epub-down epub2llm` only when a local repo path is not available or not appropriate
4. Preserve semantics, source order, and safe rewriting over reader-facing polish.
5. Treat warnings and degradation as signal to report, not details to hide.
6. Do not promise visual fidelity, aggressive structure repair, or chapter-split output by default.

Use these output checks before claiming success:

- confirm the output file exists where expected
- check that front matter stays minimal and does not invent metadata
- check that the document has a top-level title
- check for a `## TOC` section when EPUB-native navigation data exists
- check that the merged body still follows meaningful source order and headings
- check whether warnings mention unresolved TOC targets, internal-link degradation, or dropped non-text elements
- do not describe tables as simply dropped by default; complex tables may remain as HTML fallback, while images and other high-confidence non-text media are more commonly dropped by default

Use this reporting style:

- state which execution path you used
- state the output path
- summarize warnings or degradation in plain language
- say what was preserved and what degraded
- avoid vague claims like "fully preserved" unless you actually checked the relevant structures
