---
name: mark-epub-down
description: Convert a single EPUB into a single Markdown source document with the `mark-epub-down` package or `epub2llm` CLI for LLM knowledge bases, wikis, and ingestion workflows. Use when Codex needs to run this converter, choose between CLI/package/local-repo execution, explain conservative conversion boundaries, or diagnose warnings and degradation around TOC targets, internal links, dropped non-text media, and overwrite behavior.
---

# mark-epub-down

Convert EPUB input into Markdown that is suitable as ingestion source, not reader-oriented presentation.

Read [references/project-workflow.md](references/project-workflow.md) when you need the project-specific execution modes, validation checklist, or output-boundary reminders.

## Work Flow

1. Confirm that the task is actually EPUB-to-Markdown for LLM-oriented ingestion.
2. If you are already inside the `mark-epub-down` repository, prefer the local repository path first so you test or use the checked-out version instead of downloading the published package.
3. Choose the smallest available interface in this order:
   - local repo build plus `node dist/cli.js` when working inside this repository
   - Node API via local `convertEpub()` when the task is clearly programmatic use inside this repository
   - installed `epub2llm`
   - `npx --package mark-epub-down epub2llm` only when a local repo path is not available or not appropriate
4. Run one-EPUB to one-Markdown conversion unless the user explicitly asks for a surrounding pipeline.
5. Inspect warnings and obvious degradation before claiming success.
6. Report what was preserved, what degraded, and any next step needed for malformed input.

## Boundaries

- Preserve semantics, source order, and safe target rewriting conservatively.
- Do not optimize primarily for visual EPUB reproduction.
- Do not promise chapter splitting in the current baseline.
- Do not guess missing structure aggressively.
- Do not hide overwrite safeguards or warning conditions.

## Output Expectations

Expect the generated Markdown to contain:

- minimal YAML front matter from EPUB metadata
- a top-level title
- a dedicated `## TOC` section when EPUB-native TOC data is available
- merged body content in spine order

If the EPUB cannot support perfect target rewriting or navigation fidelity, state that clearly instead of implying a lossless conversion.
