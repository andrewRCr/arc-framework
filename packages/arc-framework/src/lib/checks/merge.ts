/** Paths authored or historically conflicted during an active merge. */
import { readFile as fsReadFile } from "node:fs/promises";
import type { GitExec } from "../git/exec.js";
import { isGitObjectId } from "../git/object-id.js";

/** Active parents and the exact paths whose conclusion needs checking. */
export interface MergeCheckPaths { merged: string[]; paths: string[]; unresolved?: true }
/** Filesystem boundary for checkout-private merge metadata. */
export type MergeMetadataReader = (path: string) => Promise<string>;

/**
 * Unite recorded conflicts with staged paths that differ from every parent.
 * @param git - Git process boundary scoped to the checkout
 * @param root - Repository root
 * @param head - Captured first-parent commit
 * @param tree - Exact staged tree
 * @param readFile - Merge metadata filesystem boundary
 * @returns Active merge coordinates, or no observation outside a merge
 */
export async function readMergeCheckPaths(
  git: GitExec, root: string, head: string, tree: string,
  readFile: MergeMetadataReader = path => fsReadFile(path, "utf8"),
): Promise<MergeCheckPaths | undefined> {
  const headPath = await mergeMetadataPath(git, root, "MERGE_HEAD");
  let parentText: string;
  try { parentText = await readFile(headPath); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw error;
  }
  const merged = parentText.trim().split(/\r?\n/u);
  if (!merged.every(isGitObjectId)) {
    throw new Error("MERGE_HEAD does not contain complete parent object identifiers");
  }
  const message = await readFile(await mergeMetadataPath(git, root, "MERGE_MSG"));
  const conflicts = await readRecordedConflicts(git, root, message, [tree, head, ...merged]);
  const output = (await git("git", ["diff", "--name-only", "-z", "--no-renames", tree, head, ...merged, "--"], {
    cwd: root, preserveOutput: true, clearPathspecEnvironment: true,
  })).stdout;
  const authored = nulPaths(output, "combined Git tree diff");
  return { merged, paths: [...new Set([...conflicts.paths, ...authored])],
    ...(conflicts.unresolved ? { unresolved: true } : {}) };
}

async function readRecordedConflicts(git: GitExec, root: string, message: string, refs: string[]): Promise<{
  paths: string[]; unresolved?: true;
}> {
  const lines = message.split("\n");
  // Git comments physical lines without quoting pathnames. A newline followed by a tab can mimic another record.
  const prefixes = [...new Set(["", ...lines.flatMap(line => {
    const header = /^(.*?) ?Conflicts:$/u.exec(line);
    return header?.[1] === undefined ? [] : [header[1]];
  })])];
  const first = lines.findIndex(line => prefixes.some(prefix => line.startsWith(`${prefix}\t`)));
  if (first === -1) return { paths: [] };
  const trees = await Promise.all([...new Set(refs)].map(async ref => nulPaths((await git("git", [
    "ls-tree", "-r", "--name-only", "-z", ref,
  ], { cwd: root, preserveOutput: true, clearPathspecEnvironment: true })).stdout, "Git tree paths")));
  const candidates = new Map<string, { path: string; record: string }[]>();
  for (const path of new Set(trees.flat())) {
    for (const prefix of prefixes) {
      const record = commentedRecord(path, prefix);
      const firstLine = record.slice(0, record.indexOf("\n") + 1);
      const group = candidates.get(firstLine) ?? [];
      group.push({ path, record });
      candidates.set(firstLine, group);
    }
  }
  return decodeConflictRecords(lines.slice(first).join("\n"), candidates);
}

function commentedRecord(path: string, prefix: string): string {
  const raw = `\t${path}\n`;
  if (prefix === "") return raw;
  return raw.slice(0, -1).split("\n").map(line =>
    `${prefix}${line === "" || line.startsWith("\t") ? "" : " "}${line}\n`).join("");
}

interface ConflictPartition { count: 1 | 2; path?: string; next?: number }

function decodeConflictRecords(text: string, candidates: Map<string, { path: string; record: string }[]>): {
  paths: string[]; unresolved?: true;
} {
  // Count complete partitions, capped at two. Only a unique partition establishes exact conflict names.
  const states = new Map<number, ConflictPartition>([[text.length, { count: 1 }]]);
  const offsets = [0, ...Array.from(text.matchAll(/\n/gu), match => match.index + 1)];
  for (const offset of offsets.reverse()) {
    if (offset === text.length) continue;
    const firstLine = text.slice(offset, text.indexOf("\n", offset) + 1);
    const state = conflictPartition(text, offset, candidates.get(firstLine) ?? [], states);
    if (state !== undefined) states.set(offset, state);
  }
  if (states.get(0)?.count !== 1) return { paths: [], unresolved: true };
  const paths: string[] = [];
  let offset = 0;
  while (offset < text.length) {
    const state = states.get(offset);
    if (state?.path === undefined || state.next === undefined) return { paths: [], unresolved: true };
    paths.push(state.path);
    offset = state.next;
  }
  return { paths };
}

function conflictPartition(
  text: string, offset: number, candidates: { path: string; record: string }[], states: Map<number, ConflictPartition>,
): ConflictPartition | undefined {
  let found: ConflictPartition | undefined;
  for (const { path, record } of candidates) {
    if (!text.startsWith(record, offset)) continue;
    const next = offset + record.length;
    const suffix = states.get(next);
    if (suffix === undefined) continue;
    if (found !== undefined || suffix.count === 2) return { count: 2 };
    found = { count: 1, path, next };
  }
  return found;
}

function nulPaths(output: string, description: string): string[] {
  const paths = output === "" ? [] : output.split("\0");
  if (output !== "" && (paths.pop() !== "" || paths.some(path => path === ""))) {
    throw new Error(`Malformed ${description}`);
  }
  return paths;
}

async function mergeMetadataPath(git: GitExec, root: string, name: string): Promise<string> {
  return (await git("git", ["rev-parse", "--path-format=absolute", "--git-path", name], { cwd: root })).stdout.trim();
}
