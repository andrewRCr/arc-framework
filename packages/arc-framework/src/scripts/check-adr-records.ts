/** Validate architectural decision record status and number uniqueness over exact Git trees. */

import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

/** One ADR's path, number, and Git object identity. */
export interface AdrEntry {
  path: string;
  number: number | null;
  objectId: string;
}

/** The first Status section and its leading status line. */
export interface StatusSection {
  line: string;
  text: string;
  proposed: boolean;
}

/** Read the numeric identity in an ADR file name. */
export function adrNumber(path: string): number | null {
  const digits = /^adr-(\d+)/u.exec(path.slice(path.lastIndexOf("/") + 1))?.[1];
  return digits === undefined ? null : Number(digits);
}

interface Heading {
  level: number;
  text: string;
  first: number;
  last: number;
}

interface HeadingScan {
  fence: { marker: string; length: number } | undefined;
  paragraphStart: number | undefined;
}

function atxHeading(line: string, index: number): Heading | undefined {
  const match = /^ {0,3}(#{1,6})(?:[\t ]+(.*)|[\t ]*)$/u.exec(line);
  if (match === null) return undefined;
  const text = (match[2] ?? "").replace(/[\t ]+#+[\t ]*$/u, "").trim();
  return { level: match[1]?.length ?? 0, text, first: index, last: index };
}

function closesFence(delimiter: RegExpExecArray | null, fence: { marker: string; length: number }): boolean {
  const markers = delimiter?.[1] ?? "";
  return markers.charAt(0) === fence.marker && markers.length >= fence.length && delimiter?.[2]?.trim() === "";
}

function consumeFence(line: string, state: HeadingScan): boolean {
  const delimiter = /^ {0,3}(`{3,}|~{3,})(.*)$/u.exec(line);
  if (state.fence !== undefined) {
    if (closesFence(delimiter, state.fence)) state.fence = undefined;
    return true;
  }
  if (delimiter === null) return false;
  const markers = delimiter[1] ?? "";
  state.fence = { marker: markers.charAt(0), length: markers.length };
  state.paragraphStart = undefined;
  return true;
}

function scanHeading(lines: string[], index: number, state: HeadingScan): Heading | undefined {
  const line = lines[index] ?? "";
  if (consumeFence(line, state)) return undefined;
  const atx = atxHeading(line, index);
  if (atx !== undefined) {
    state.paragraphStart = undefined;
    return atx;
  }
  const underline = /^ {0,3}(=+|-+)[\t ]*$/u.exec(line)?.[1];
  const first = state.paragraphStart;
  if (underline !== undefined && first !== undefined) {
    state.paragraphStart = undefined;
    return { level: underline.startsWith("=") ? 1 : 2, text: lines.slice(first, index).join("\n").trim(), first, last: index };
  }
  if (line.trim() === "" || underline?.startsWith("-") || (first === undefined && /^(?: {4}|\t)/u.test(line))) {
    state.paragraphStart = undefined;
  } else {
    state.paragraphStart ??= index;
  }
  return undefined;
}

function statusSectionLines(lines: string[]): string[] {
  const state: HeadingScan = { fence: undefined, paragraphStart: undefined };
  let start: number | undefined;
  for (const index of lines.keys()) {
    const heading = scanHeading(lines, index, state);
    if (heading === undefined || heading.level > 2) continue;
    if (start !== undefined) return lines.slice(start, heading.first);
    if (heading.level === 2 && heading.text === "Status") start = heading.last + 1;
  }
  return start === undefined ? [] : lines.slice(start);
}

/** Read the first real Status section, ignoring fenced code. */
export function parseStatusSection(content: string): StatusSection | null {
  const text = statusSectionLines(content.split(/\r?\n/u)).join("\n").trim();
  const line = text.split("\n").find(candidate => candidate.trim() !== "")?.trim();
  if (line === undefined) return null;
  const firstWord = (line.split(/\s+/u)[0] ?? "").replace(/^[*_]+/u, "").replace(/[\p{P}\p{S}]+$/u, "");
  return { line, text, proposed: firstWord.toLowerCase() === "proposed" };
}

/** Find the same-path base record, or a uniquely paired same-number rename. */
export function resolveBaseVersion<T extends AdrEntry>(entry: AdrEntry, tree: readonly AdrEntry[], base: readonly T[]): T | undefined {
  const samePath = base.find(candidate => candidate.path === entry.path);
  if (samePath !== undefined || entry.number === null) return samePath;
  const treePaths = new Set(tree.map(candidate => candidate.path));
  const basePaths = new Set(base.map(candidate => candidate.path));
  const removed = base.filter(candidate => candidate.number === entry.number && !treePaths.has(candidate.path));
  const added = tree.filter(candidate => candidate.number === entry.number && !basePaths.has(candidate.path));
  return removed.length === 1 && added.length === 1 ? removed[0] : undefined;
}

/** An ADR listing entry with its parsed Status section. */
export interface AdrRecord extends AdrEntry {
  status: StatusSection | null;
}

/** Pure status-rule inputs, including the caller's local calendar date. */
export interface StatusCheckInput {
  tree: readonly AdrRecord[];
  base: readonly AdrRecord[] | undefined;
  paths: readonly string[];
  today: string;
  baseLabel: string;
}

/** Select changed ADR arguments by path and object identity. */
export function selectExaminedAdrs<T extends AdrEntry>(tree: readonly T[], base: readonly AdrEntry[], paths: readonly string[]): T[] {
  const requested = new Set(paths);
  return tree.filter(entry => {
    if (!requested.has(entry.path) || !/^\.arc\/reference\/adr\/adr-[^/]*\.md$/u.test(entry.path)) return false;
    const original = resolveBaseVersion(entry, tree, base);
    return original === undefined || original.path !== entry.path || original.objectId !== entry.objectId;
  });
}

const NO_STATUS_BASE = [
  "No base to compare ADRs against: the base branch did not resolve, or it has no single merge base with HEAD.",
  "Make the base branch resolvable (its upstream or local branch) and rerun, or name the merge base itself:",
  "arc check run lint:adr:status --range <merge-base>",
].join("\n");

function newStatusFailure(record: AdrRecord, today: string): string | undefined {
  if (record.status === null) {
    return `${record.path} is a new ADR with no Status section. Add "## Status" reading "Accepted (${today})" in this change before it merges.`;
  }
  if (record.status.proposed) {
    return `${record.path} is a new ADR reading Proposed. A new ADR merges Accepted: set its Status to "Accepted (${today})" in this change before it merges.`;
  }
  return undefined;
}

function statusFailure(record: AdrRecord, original: AdrRecord | undefined, today: string, baseLabel: string): string | undefined {
  if (original === undefined) return newStatusFailure(record, today);
  if (original.status === null) return undefined;
  let reason: string;
  if (record.status === null) reason = "removes its Status section";
  else if (record.status.proposed && !original.status.proposed) reason = "returns an ADR to Proposed";
  else return undefined;
  const restored = original.status.text.split("\n").map(line => `  ${line}`).join("\n");
  return `${record.path} ${reason}. Restore the Status section of its base version (${original.path} at ${baseLabel}):\n${restored}`;
}

/** Report every failing status rule, or the missing-base refusal. */
export function checkStatuses(input: StatusCheckInput): string[] {
  const { tree, base, paths, today, baseLabel } = input;
  if (base === undefined) return [NO_STATUS_BASE];
  return selectExaminedAdrs(tree, base, paths).flatMap(record => {
    const failure = statusFailure(record, resolveBaseVersion(record, tree, base), today, baseLabel);
    return failure === undefined ? [] : [failure];
  });
}

function collidingNumbers(tree: readonly AdrEntry[]): [number, AdrEntry[]][] {
  const groups = new Map<number, AdrEntry[]>();
  for (const record of tree) {
    if (record.number === null) continue;
    const group = groups.get(record.number) ?? [];
    group.push(record);
    groups.set(record.number, group);
  }
  return [...groups].filter(([, records]) => records.length > 1).sort(([left], [right]) => left - right);
}

function renumberRemedy(records: readonly AdrEntry[], base: ReadonlySet<string> | undefined, allocate: (count: number) => string[]): string {
  if (base === undefined) {
    return "Renumber the one this change adds, either when it adds both; when it adds neither, in a separate change keep only the one that landed first in the base branch's first-parent history. Make the base branch resolvable and rerun to have the file named.";
  }
  const added = records.filter(record => !base.has(record.path)).sort((left, right) => left.path.localeCompare(right.path));
  if (added.length === 0) {
    return `In a separate change, renumber every path except the one that landed first in the base branch's first-parent history to ${allocate(records.length - 1).join(", ")}.`;
  }
  if (added.length === records.length) {
    const targets = allocate(added.length - 1).join(", ");
    return added.length === 2 ? `Renumber either added path to ${targets}.` : `Renumber any ${added.length - 1} added paths to ${targets}, keeping one unchanged.`;
  }
  const targets = allocate(added.length);
  return added.map((record, index) => `Renumber ${record.path} to ${targets[index]}.`).join("\n");
}

/** Report number collisions and consecutive renumbering remedies. */
export function checkNumbers(tree: readonly AdrEntry[], base?: readonly AdrEntry[]): string[] {
  let next = Math.max(0, ...[...tree, ...(base ?? [])].map(record => record.number ?? 0)) + 1;
  const allocate = (count: number): string[] => Array.from({ length: count }, () => `ADR-${String(next++).padStart(3, "0")}`);
  const basePaths = base === undefined ? undefined : new Set(base.map(record => record.path));
  return collidingNumbers(tree).map(([number, records]) => [
    `ADR-${String(number).padStart(3, "0")} is shared by:`,
    ...records.map(record => `  ${record.path}`),
    renumberRemedy(records, basePaths, allocate),
    "Also update the records that cite the renumbered ADR by number.",
  ].join("\n"));
}

/** Git object reads needed by the ADR checks. */
export interface AdrReader {
  list(revision: string): AdrEntry[];
  read(revision: string, path: string): string;
}

/** One script invocation's exit status and diagnostics. */
export interface AdrCheckResult {
  exitCode: number;
  diagnostics: string[];
}

/** Format a date using its local calendar fields. */
export function localCalendarDate(date: Date): string {
  return [date.getFullYear(), String(date.getMonth() + 1).padStart(2, "0"), String(date.getDate()).padStart(2, "0")].join("-");
}

function gitOutput(args: string[]): string {
  return execFileSync("git", args, { encoding: "utf8", maxBuffer: 16 * 1024 * 1024 });
}

const gitReader: AdrReader = {
  list(revision) {
    const output = gitOutput(["ls-tree", "-r", "-z", "--full-tree", revision, "--", ".arc/reference/adr/"]);
    return output.split("\0").filter(Boolean).flatMap(row => {
      const tab = row.indexOf("\t");
      const [, kind, objectId] = row.slice(0, tab).split(" ");
      const path = row.slice(tab + 1);
      if (tab < 0 || objectId === undefined) throw new Error("Malformed git ls-tree output");
      if (kind !== "blob" || !/^\.arc\/reference\/adr\/adr-[^/]*\.md$/u.test(path)) return [];
      return [{ path, objectId, number: adrNumber(path) }];
    });
  },
  read: (revision, path) => gitOutput(["show", `${revision}:${path}`]),
};

function readStatusInputs(reader: AdrReader, coordinates: { tree: string; base: string }, paths: readonly string[]): { tree: AdrRecord[]; base: AdrRecord[] } {
  const tree = reader.list(coordinates.tree);
  const base = reader.list(coordinates.base);
  const examined = selectExaminedAdrs(tree, base, paths);
  const neededTree = new Set(examined.map(entry => entry.path));
  const neededBase = new Set(examined.flatMap(entry => {
    const original = resolveBaseVersion(entry, tree, base);
    return original === undefined ? [] : [original.path];
  }));
  const records = (entries: AdrEntry[], revision: string, needed: ReadonlySet<string>): AdrRecord[] => entries.map(entry => ({
    ...entry, status: needed.has(entry.path) ? parseStatusSection(reader.read(revision, entry.path)) : null,
  }));
  return { tree: records(tree, coordinates.tree, neededTree), base: records(base, coordinates.base, neededBase) };
}

function result(diagnostics: string[]): AdrCheckResult {
  return { exitCode: diagnostics.length === 0 ? 0 : 1, diagnostics };
}

/** Run one rule against supplied content coordinates and a Git reader. */
export function runAdrCheck(
  args: readonly string[],
  environment: Readonly<Record<string, string | undefined>>,
  reader: AdrReader = gitReader,
  today = localCalendarDate(new Date()),
): AdrCheckResult {
  const rule = args[0];
  if (rule !== "status" && rule !== "numbers") return result(["Usage: lint:adr status <paths...> | lint:adr numbers"]);
  const tree = environment.ARC_CHECK_TREE;
  const base = environment.ARC_CHECK_BASE;
  if (!tree) return result([`ARC_CHECK_TREE is required. Run arc check run lint:adr:${rule}.`]);
  if (rule === "status" && !base) return result([NO_STATUS_BASE]);
  try {
    if (rule === "numbers") return result(checkNumbers(reader.list(tree), base ? reader.list(base) : undefined));
    const coordinates = { tree, base: base ?? "" };
    return result(checkStatuses({ ...readStatusInputs(reader, coordinates, args.slice(1)), paths: args.slice(1), today, baseLabel: coordinates.base.slice(0, 7) }));
  } catch (error) {
    return result([error instanceof Error ? error.message : String(error)]);
  }
}

if (fileURLToPath(import.meta.url) === process.argv[1]) {
  const outcome = runAdrCheck(process.argv.slice(2), process.env);
  for (const diagnostic of outcome.diagnostics) process.stderr.write(`${diagnostic}\n`);
  process.exitCode = outcome.exitCode;
}
