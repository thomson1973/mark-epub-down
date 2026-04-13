import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";

const require = createRequire(import.meta.url);
const { normalizeMarkdownSpacing, renderDocument } = require("../dist/output/render.js");

test("normalizeMarkdownSpacing collapses repeated blank lines outside fenced code blocks", () => {
  const markdown = "Alpha\n\n\n\nBeta\n\n\nGamma";

  assert.equal(
    normalizeMarkdownSpacing(markdown),
    "Alpha\n\nBeta\n\nGamma",
  );
});

test("normalizeMarkdownSpacing preserves repeated blank lines inside fenced code blocks", () => {
  const markdown = "Before\n\n\n```txt\nline 1\n\n\nline 4\n```\n\n\nAfter";

  assert.equal(
    normalizeMarkdownSpacing(markdown),
    "Before\n\n```txt\nline 1\n\n\nline 4\n```\n\nAfter",
  );
});

test("renderDocument applies spacing normalization to the merged output", () => {
  const markdown = renderDocument({
    metadata: { title: "Spacing Book" },
    toc: [],
    body: "Alpha\n\n\n\nBeta",
  });

  assert.match(markdown, /\nAlpha\n\nBeta\n$/);
  assert.doesNotMatch(markdown, /\nAlpha\n\n\nBeta\n$/);
});
