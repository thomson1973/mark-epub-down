import path from "node:path";

export interface ResolvedEpubHref {
  kind: "internal" | "external";
  href: string;
  resourcePath?: string;
  fragment?: string;
  targetKey?: string;
}

export function normalizeEpubPath(value: string): string {
  const normalized = value.replace(/\\/g, "/");
  return path.posix.normalize(normalized).replace(/^\.\//, "");
}

export function splitEpubHref(href: string): {
  pathPart: string;
  fragment?: string;
} {
  const [pathPart, fragment] = href.split("#", 2);
  return {
    pathPart,
    fragment: fragment && fragment.length > 0 ? fragment : undefined,
  };
}

export function buildTargetKey(resourcePath: string, fragment?: string): string {
  return fragment ? `${normalizeEpubPath(resourcePath)}#${fragment}` : normalizeEpubPath(resourcePath);
}

export function resolveEpubHref(baseDocumentPath: string, href: string): ResolvedEpubHref {
  const trimmedHref = href.trim();

  if (isExternalHref(trimmedHref)) {
    return {
      kind: "external",
      href: trimmedHref,
    };
  }

  if (trimmedHref.startsWith("#")) {
    const fragment = trimmedHref.slice(1);
    return {
      kind: "internal",
      href: trimmedHref,
      resourcePath: normalizeEpubPath(baseDocumentPath),
      fragment,
      targetKey: buildTargetKey(baseDocumentPath, fragment),
    };
  }

  const { pathPart, fragment } = splitEpubHref(trimmedHref);
  const resourcePath = normalizeEpubPath(
    path.posix.join(path.posix.dirname(normalizeEpubPath(baseDocumentPath)), pathPart),
  );

  return {
    kind: "internal",
    href: trimmedHref,
    resourcePath,
    fragment,
    targetKey: buildTargetKey(resourcePath, fragment),
  };
}

function isExternalHref(href: string): boolean {
  return /^[a-z][a-z0-9+.-]*:/i.test(href) || href.startsWith("//");
}
