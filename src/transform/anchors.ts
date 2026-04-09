export function normalizeAnchorToken(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
}

export function buildMergedAnchor(idref: string, fragmentOrToken: string): string {
  const prefix = normalizeAnchorToken(idref) || "item";
  const suffix = normalizeAnchorToken(fragmentOrToken) || "section";
  return `${prefix}-${suffix}`;
}
