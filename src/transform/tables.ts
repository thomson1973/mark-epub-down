const COMPLEX_TABLE_ATTRIBUTE = "data-epub2md-complex-table";

export interface TableProcessingResult {
  complexTableCount: number;
}

export function processTables(document: Document): TableProcessingResult {
  const tables = Array.from(document.querySelectorAll("table")) as HTMLTableElement[];
  let complexTableCount = 0;

  for (const table of tables) {
    if (isComplexTable(table)) {
      table.setAttribute(COMPLEX_TABLE_ATTRIBUTE, "true");
      complexTableCount += 1;
      continue;
    }

    table.removeAttribute(COMPLEX_TABLE_ATTRIBUTE);
  }

  return { complexTableCount };
}

export function isMarkedComplexTable(node: HTMLElement): boolean {
  return node.nodeName.toLowerCase() === "table" && node.getAttribute(COMPLEX_TABLE_ATTRIBUTE) === "true";
}

function isComplexTable(table: HTMLTableElement): boolean {
  if (table.querySelector("table")) {
    return true;
  }

  if (table.querySelector("caption, colgroup, tfoot")) {
    return true;
  }

  const headerRows = getHeaderRows(table);
  if (headerRows.length !== 1) {
    return true;
  }

  const allRows = getAllRows(table);
  if (allRows.length < 2) {
    return true;
  }

  const headerRow = headerRows[0];
  const headerCells = getDirectCells(headerRow);
  if (headerCells.length === 0 || !headerCells.every((cell) => cell.tagName.toLowerCase() === "th")) {
    return true;
  }

  const expectedColumnCount = headerCells.length;
  const bodyRows = allRows.filter((row) => row !== headerRow);
  if (bodyRows.length === 0) {
    return true;
  }

  if (hasUnsupportedSpan(headerCells)) {
    return true;
  }

  for (const row of bodyRows) {
    const cells = getDirectCells(row);
    if (cells.length !== expectedColumnCount) {
      return true;
    }

    if (cells.some((cell) => cell.tagName.toLowerCase() !== "td")) {
      return true;
    }

    if (hasUnsupportedSpan(cells)) {
      return true;
    }
  }

  return false;
}

function getHeaderRows(table: HTMLTableElement): HTMLTableRowElement[] {
  const normalizedThead = Array.from(table.children).find((child) => child.tagName.toLowerCase() === "thead");
  if (normalizedThead) {
    return Array.from(normalizedThead.children).filter((child): child is HTMLTableRowElement => {
      return child.tagName.toLowerCase() === "tr";
    });
  }

  const rows = getAllRows(table);
  const firstRow = rows[0];
  if (!firstRow) {
    return [];
  }

  const cells = getDirectCells(firstRow);
  if (cells.length > 0 && cells.every((cell) => cell.tagName.toLowerCase() === "th")) {
    return [firstRow];
  }

  return [];
}

function getAllRows(table: HTMLTableElement): HTMLTableRowElement[] {
  const rows: HTMLTableRowElement[] = [];

  for (const child of Array.from(table.children)) {
    const tagName = child.tagName.toLowerCase();

    if (tagName === "tr") {
      rows.push(child as HTMLTableRowElement);
      continue;
    }

    if (tagName === "thead" || tagName === "tbody") {
      rows.push(
        ...Array.from(child.children).filter((row): row is HTMLTableRowElement => row.tagName.toLowerCase() === "tr"),
      );
    }
  }

  return rows;
}

function getDirectCells(row: HTMLTableRowElement): HTMLTableCellElement[] {
  return Array.from(row.children).filter((child): child is HTMLTableCellElement => {
    const tagName = child.tagName.toLowerCase();
    return tagName === "td" || tagName === "th";
  });
}

function hasUnsupportedSpan(cells: HTMLTableCellElement[]): boolean {
  return cells.some((cell) => {
    const colspan = Number(cell.getAttribute("colspan") ?? "1");
    const rowspan = Number(cell.getAttribute("rowspan") ?? "1");
    return colspan > 1 || rowspan > 1;
  });
}
