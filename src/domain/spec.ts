export const CLI_BINARY_NAME = "epub2md";
export const GENERATED_TOC_HEADING = "TOC";

export const FRONT_MATTER_FIELDS = [
  "title",
  "creator",
  "language",
  "identifier",
  "publisher",
  "published",
] as const;

export const REMOVABLE_TAGS = new Set([
  "script",
  "style",
  "img",
  "svg",
  "canvas",
  "audio",
  "video",
  "source",
  "track",
  "iframe",
  "object",
  "embed",
  "form",
  "input",
  "button",
  "select",
  "option",
  "textarea",
  "meta",
  "link",
  "noscript",
]);

export const NON_BLACKLISTED_STRUCTURAL_CONTAINERS = new Set([
  "figure",
  "figcaption",
  "aside",
  "section",
  "nav",
  "div",
  "span",
]);

export const NOTE_REFERENCE_TYPES = new Set(["noteref"]);
export const NOTE_BODY_TYPES = new Set(["footnote", "endnote", "rearnote"]);
export const NOTE_BACKLINK_TYPES = new Set(["backlink"]);
