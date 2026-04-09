import { NON_BLACKLISTED_STRUCTURAL_CONTAINERS, REMOVABLE_TAGS } from "../domain/spec";

export interface CleanupResult {
  removedTags: string[];
}

export function cleanXhtmlDocument(document: Document): CleanupResult {
  const removedTags: string[] = [];

  for (const tagName of REMOVABLE_TAGS) {
    const nodes = Array.from(document.getElementsByTagName(tagName));
    for (const node of nodes) {
      node.remove();
      removedTags.push(tagName);
    }
  }

  cleanupEmptyContainers(document.body);

  return { removedTags };
}

function cleanupEmptyContainers(root: HTMLElement | null): void {
  if (!root) {
    return;
  }

  for (const child of Array.from(root.children)) {
    cleanupEmptyContainers(child as HTMLElement);

    const tagName = child.tagName.toLowerCase();
    if (!NON_BLACKLISTED_STRUCTURAL_CONTAINERS.has(tagName)) {
      continue;
    }

    if (child.children.length > 0) {
      continue;
    }

    const hasVisibleText = child.textContent?.trim().length;
    const hasStructuralId = child.hasAttribute("id");

    if (!hasVisibleText && !hasStructuralId) {
      child.remove();
    }
  }
}
