import type { FRONT_MATTER_FIELDS } from "./spec";

export type MetadataField = (typeof FRONT_MATTER_FIELDS)[number];

export type BookMetadata = Partial<Record<MetadataField, string>>;

export interface WarningRecord {
  code: string;
  message: string;
}

export interface ContainerDocument {
  opfPath: string;
}

export interface ManifestItem {
  id: string;
  href: string;
  mediaType: string;
  properties: string[];
}

export interface SpineItemRef {
  idref: string;
  linear: boolean;
}

export interface ParsedPackageDocument {
  opfPath: string;
  opfDirectory: string;
  metadata: BookMetadata;
  manifestItems: ManifestItem[];
  manifestById: Map<string, ManifestItem>;
  spine: SpineItemRef[];
  navigation: {
    navItemId?: string;
    ncxItemId?: string;
  };
}

export interface TocItem {
  label: string;
  href?: string;
  children: TocItem[];
}

export interface TocDocument {
  source: "nav" | "ncx" | "missing";
  items: TocItem[];
}

export interface SpineDocument {
  idref: string;
  linear: boolean;
  manifestItem: ManifestItem;
  absolutePath: string;
  relativePath: string;
}
