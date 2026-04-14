import { execFileSync } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

export async function createEpubArchive(files) {
  const rootDir = await mkdtemp(path.join(os.tmpdir(), "epub2md-test-"));

  for (const [relativePath, content] of Object.entries(files)) {
    const absolutePath = path.join(rootDir, relativePath);
    await mkdir(path.dirname(absolutePath), { recursive: true });
    if (typeof content === "string") {
      await writeFile(absolutePath, content, "utf8");
      continue;
    }

    await writeFile(absolutePath, content);
  }

  const epubPath = `${rootDir}.epub`;
  execFileSync("zip", ["-X0", epubPath, "mimetype"], { cwd: rootDir, stdio: "ignore" });

  const archiveEntries = Object.keys(files).filter((entry) => entry !== "mimetype");
  if (archiveEntries.length > 0) {
    execFileSync("zip", ["-Xr9D", epubPath, ...archiveEntries], { cwd: rootDir, stdio: "ignore" });
  }

  return {
    epubPath,
    cleanup: async () => {
      await rm(rootDir, { recursive: true, force: true });
      await rm(epubPath, { force: true });
    },
  };
}

export function buildContainerXml() {
  return `<?xml version="1.0"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>
`;
}

export function buildOpfXml(input) {
  const metadataLines = [
    input.metadata.title ? `<dc:title>${input.metadata.title}</dc:title>` : "",
    input.metadata.creator ? `<dc:creator>${input.metadata.creator}</dc:creator>` : "",
    input.metadata.language ? `<dc:language>${input.metadata.language}</dc:language>` : "",
    input.metadata.identifier ? `<dc:identifier id="BookId">${input.metadata.identifier}</dc:identifier>` : "",
    input.metadata.publisher ? `<dc:publisher>${input.metadata.publisher}</dc:publisher>` : "",
    input.metadata.date ? `<dc:date>${input.metadata.date}</dc:date>` : "",
  ].filter(Boolean);

  const manifestItems = input.manifestItems
    .map((item) => {
      const properties = item.properties ? ` properties="${item.properties}"` : "";
      return `<item id="${item.id}" href="${item.href}" media-type="${item.mediaType}"${properties}/>`;
    })
    .join("\n    ");

  const spineItems = input.spineIds.map((idref) => `<itemref idref="${idref}"/>`).join("\n    ");
  const spineToc = input.spineTocId ? ` toc="${input.spineTocId}"` : "";

  return `<?xml version="1.0" encoding="utf-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0"${input.metadata.identifier ? ' unique-identifier="BookId"' : ""}>
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    ${metadataLines.join("\n    ")}
  </metadata>
  <manifest>
    ${manifestItems}
  </manifest>
  <spine${spineToc}>
    ${spineItems}
  </spine>
</package>
`;
}

export function buildNavXhtml(body) {
  return `<?xml version="1.0" encoding="utf-8"?>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops">
  <body>
    ${body}
  </body>
</html>
`;
}

export function buildContentXhtml(body) {
  return `<?xml version="1.0" encoding="utf-8"?>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops">
  <body>
    ${body}
  </body>
</html>
`;
}
