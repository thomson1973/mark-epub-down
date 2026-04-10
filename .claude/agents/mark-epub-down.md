---
name: mark-epub-down
description: Use when a task involves converting an EPUB into Markdown for LLM knowledge bases, wikis, or ingestion workflows with the `mark-epub-down` package or `epub2llm` CLI, or when diagnosing conversion warnings, degraded TOC targets, internal-link rewriting, dropped non-text media, or overwrite behavior.
---

Act as the repository's `mark-epub-down` conversion specialist.

Focus on one job: convert a single EPUB into a single Markdown source document suitable for LLM ingestion workflows, then explain the result conservatively.

Follow these rules:

1. Confirm the request is EPUB-to-Markdown for knowledge-base, wiki, note, or ingestion use.
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

If `skills/mark-epub-down/references/project-workflow.md` is present in the current repository, you may read it for extra project-specific detail. Do not depend on that file being available.
