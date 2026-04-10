# mark-epub-down Workflow Reference

## Purpose

Use this project to convert one EPUB into one Markdown source document for LLM knowledge bases, wikis, and related ingestion workflows.

Prefer semantic preservation, source correctness, and conservative degradation over reader-oriented polish.

## Trigger Checklist

Use this skill when the user asks to:

- turn an EPUB into Markdown for RAG, wiki, note, or knowledge-base ingestion
- use `epub2llm`
- use the `mark-epub-down` npm package
- inspect conversion warnings or degraded TOC/link behavior
- verify whether output stays inside this repo's public v1 boundaries

Do not use this skill when the main goal is:

- visual EPUB reproduction
- CSS/layout preservation
- arbitrary ebook editing
- aggressive cleanup or guessed structure repair

## Choose An Execution Mode

Prefer the narrowest execution path that already exists in the environment.

If you are working inside the `mark-epub-down` repository, prefer the local repository path first so the agent uses the checked-out code instead of the published npm package.

1. Local repository build

```bash
npm run build
node dist/cli.js input.epub
node dist/cli.js input.epub -o output.md
```

2. Local repository Node API

```js
const { convertEpub } = require("./dist/index.js");

await convertEpub({
  inputPath: "input.epub",
  outputPath: "output.md",
});
```

3. Installed CLI

```bash
epub2llm input.epub
epub2llm input.epub -o output.md
```

4. Package invocation without global install

```bash
npx --package mark-epub-down epub2llm input.epub
```

5. Published package Node API

```js
const { convertEpub } = require("mark-epub-down");

await convertEpub({
  inputPath: "input.epub",
  outputPath: "output.md",
});
```

## Operating Rules

- Convert one EPUB into one Markdown file unless the user explicitly asks for another pipeline around it.
- When operating inside this repository, prefer local build or local API paths before `npx` so the run reflects the checked-out repo state.
- Keep overwrite behavior conservative.
- If output already exists, do not assume overwrite is safe.
- Treat warnings as user-relevant signal, not noise to hide.
- When targets cannot be rewritten safely, describe the degradation plainly instead of pretending success.
- Keep claims aligned with current public docs and implementation.

## Expected Output Shape

Check for this high-level structure:

1. minimal YAML front matter from EPUB package metadata
2. top-level book title
3. `## TOC` section derived from EPUB-native TOC data
4. merged body content in spine order

Do not expect:

- visual fidelity to EPUB presentation
- chapter-split output in the baseline
- perfect preservation of all internal targets
- default retention of images or other high-confidence non-text media
- all tables to behave the same way; simpler tables may become Markdown, while more complex tables may remain as HTML fallback

## Validation Checklist

After conversion, verify the points that matter most for LLM-ingestion use:

- output file exists where expected
- front matter is minimal and does not invent metadata
- document title is present
- TOC exists when EPUB navigation data exists
- spine order appears preserved
- headings stay meaningful instead of being flattened
- warnings are surfaced when links or TOC targets could not be mapped safely
- degradation is conservative rather than fabricated
- table behavior is described precisely instead of being lumped together with dropped non-text media

## Reporting Guidance

Summarize results in terms of:

- command or API path used
- output path produced
- warnings or degraded areas
- any clear next validation step if the EPUB appears malformed or unusually media-heavy

Avoid vague statements like "fully preserved" unless you actually checked the relevant structures.
