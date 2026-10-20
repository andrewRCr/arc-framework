/** Padding-only comparison and raw-source alignment for GFM table merges. */
import { fromMarkdown } from "mdast-util-from-markdown";
import { gfmTableFromMarkdown } from "mdast-util-gfm-table";
import { gfmTable } from "micromark-extension-gfm-table";
import { displayWidth, padToDisplayWidth } from "../../markdown/display-width.js";

interface MarkdownNode {
  readonly type: string;
  readonly children?: readonly MarkdownNode[];
  readonly position?: {readonly start: {readonly line: number; readonly column: number}};
}

interface TableRow {
  readonly index: number;
  readonly prefix: string;
  readonly cells: readonly string[];
  readonly dividers: readonly number[];
  readonly unborderedEnd: number | undefined;
  readonly ending: string;
}

interface Table {
  readonly rows: readonly TableRow[];
  readonly aligned: boolean;
}

/** Comparison tokens retain exactly one element per original source line. */
export interface TableComparison {
  readonly normalized: string[];
  readonly tables: readonly Table[];
}

function splitRow(line: string, index: number, column: number): TableRow {
  const ending = line.endsWith("\r") ? "\r" : "";
  const prefix = line.slice(0, column - 1);
  const source = line.slice(prefix.length, ending === "" ? undefined : -1);
  const cells: string[] = [];
  const dividers: number[] = [];
  let start = 0;
  let backslashes = 0;
  for (let offset = 0; offset < source.length; offset += 1) {
    const character = source[offset];
    if (character === "|" && backslashes % 2 === 0) {
      cells.push(source.slice(start, offset).trim());
      dividers.push(displayWidth(prefix + source.slice(0, offset)));
      start = offset + 1;
    }
    backslashes = character === "\\" ? backslashes + 1 : 0;
  }
  cells.push(source.slice(start).trim());
  if (dividers.length > 0 && cells[0] === "") cells.shift();
  const trailingPipe = dividers.length > 0 && cells.at(-1) === "";
  if (trailingPipe) cells.pop();
  const unborderedEnd = trailingPipe ? undefined : displayWidth(prefix + source);
  return {index,prefix,cells,dividers,unborderedEnd,ending};
}

function isAligned(rows: readonly TableRow[]): boolean {
  const header = rows[0];
  if (header === undefined) return false;
  return rows.slice(1).every((row) => {
    // Without a final pipe, MD060 cannot see a compact table's varying last column.
    if (header.unborderedEnd !== undefined && row.unborderedEnd !== undefined && header.unborderedEnd !== row.unborderedEnd) return false;
    const remaining = new Set(header.dividers);
    return row.dividers.every((divider) => remaining.size === 0 || remaining.delete(divider));
  });
}

function tableRows(node: MarkdownNode, source: readonly string[]): TableRow[] {
  const header = node.children?.[0]?.position?.start;
  if (header === undefined) return [];
  const rows = (node.children ?? []).flatMap((row) => {
    const start = row.position?.start;
    const line = start === undefined ? undefined : source[start.line - 1];
    return start === undefined || line === undefined ? [] : [splitRow(line,start.line - 1,start.column)];
  });
  const delimiter = source[header.line];
  if (delimiter !== undefined) rows.splice(1,0,splitRow(delimiter,header.line,header.column));
  return rows;
}

/** Identify real GFM tables and ignore only cell-edge padding and delimiter hyphen counts. */
export function compareTablePadding(source: readonly string[]): TableComparison {
  const normalized = source.map((line) => JSON.stringify(["text",line]));
  const tables: Table[] = [];
  const content = source.join("\n");
  if (!/[|:]/u.test(content)) return {normalized,tables};
  const tree = fromMarkdown(content,{extensions:[gfmTable()],mdastExtensions:[gfmTableFromMarkdown()]});
  const visit = (node: MarkdownNode): void => {
    if (node.type === "table") {
      const rows = tableRows(node,source);
      tables.push({rows,aligned:isAligned(rows)});
      for (const [index,row] of rows.entries()) {
        const cells = index === 1 ? row.cells.map((cell) => cell.replaceAll("-","")) : row.cells;
        normalized[row.index] = JSON.stringify([index === 1 ? "delimiter" : "row",row.prefix,cells,row.ending]);
      }
    } else for (const child of node.children ?? []) visit(child);
  };
  visit(tree);
  return {normalized,tables};
}

function renderAligned(table: Table, current: Table): string[] {
  const delimiter = table.rows[1];
  const widths = delimiter?.cells.map((cell,index) => Math.max(3,cell.length,current.rows[1]?.cells[index]?.length ?? 0)) ?? [];
  for (const [rowIndex,row] of table.rows.entries()) {
    if (rowIndex === 1) continue;
    for (const [column,cell] of row.cells.entries()) {
      if (column < widths.length) widths[column] = Math.max(widths[column] ?? 0,displayWidth(cell));
    }
  }
  return table.rows.map((row,rowIndex) => {
    const cells = row.cells.map((cell,column) => {
      const width = widths[column] ?? displayWidth(cell);
      if (rowIndex !== 1) return padToDisplayWidth(cell,width);
      const left = cell.startsWith(":") ? ":" : "";
      const right = cell.endsWith(":") ? ":" : "";
      return left + "-".repeat(width - left.length - right.length) + right;
    });
    return `${row.prefix}| ${cells.join(" | ")} |${row.ending}`;
  });
}

/** Re-align merged tables only when their surviving source lines identify an aligned current table. */
export function alignMergedTables(source: string[], currentLines: readonly (number | undefined)[], current: TableComparison): string[] {
  const currentTables = new Map(current.tables.flatMap((table) => table.rows.map((row) => [row.index,table] as const)));
  for (const table of compareTablePadding(source).tables) {
    const candidates = new Set(table.rows.flatMap((row) => {
      const origin = currentLines[row.index];
      const original = origin === undefined ? undefined : currentTables.get(origin);
      return original === undefined ? [] : [original];
    }));
    if (candidates.size !== 1) continue;
    const original = [...candidates][0];
    if (original?.aligned !== true) continue;
    const rendered = renderAligned(table,original);
    for (const [index,row] of table.rows.entries()) source[row.index] = rendered[index] ?? source[row.index] ?? "";
  }
  return source;
}
