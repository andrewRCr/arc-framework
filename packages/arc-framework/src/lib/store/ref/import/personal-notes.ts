/** Select each live workspace's newest saved note independently of checkout ancestry. */
import type { RefBackendContext } from "../context.js";
import { readBatchObjects, type BatchObject } from "../batch-read.js";
import { notePathToCommit, NOTES_COMPACTION_SNAPSHOT_MESSAGE } from "../../../user-sync/notes-ref.js";
import { parseImportNoteFiles } from "./personal-note-manifest.js";
import { importPersonalExcluded } from "./personal-disk.js";
import type { MigrateReport } from "../../commands.js";

interface NoteVersion { annotated: string; blob: string }
interface NoteChange { compacted: boolean; versions: NoteVersion[] }
/** Selected workspace bytes and paths any retained note version has saved. */
export interface ImportWorkspaceSnapshot { files: Record<string, string>; savedPaths: Set<string> }

/** Read the ref's own complete history, batching note objects and compaction ordering evidence. */
export async function readImportWorkspaces(context: RefBackendContext, live: ReadonlySet<string>, tip: string | null,
  informational: MigrateReport["notices"]): Promise<ImportWorkspaceSnapshot> {
  const source = context.importSource;
  if (!source) throw new Error("No import source bound");
  if (!live.size) return { files: {}, savedPaths: new Set() };
  if (!tip) return { files: {}, savedPaths: new Set() };
  const { stdout } = await source.ports.exec("git", ["--no-replace-objects", "log", "--topo-order", "--format=%x1e%H%x00%s%x00",
    "--raw", "--diff-merges=first-parent", "-z", "--no-abbrev", "--root", "-M100%", "--diff-filter=AM", tip],
  { cwd: source.ports.checkoutRoot, objectAccess: "local-only" });
  const changes = noteChanges(stdout);
  const physical = { ...context, rawExec: source.ports.rawExec, checkoutRoot: source.ports.checkoutRoot, readSource: undefined, blobStage: undefined };
  const commits = [...new Set(changes.filter(change => change.compacted).flatMap(change => change.versions.map(version => version.annotated)))];
  const dates = await readBatchObjects(physical, commits);
  const chronology = new Map(commits.map(annotated => {
    const time = committedAt(dates.get(annotated));
    if (time === null) informational.push({ condition: `A retained note's annotated commit ${annotated} has no readable committer date; it sorts after commits with readable dates.` });
    return [annotated, time ?? Number.NEGATIVE_INFINITY] as const;
  }));
  const remaining = new Set(live), result: ImportWorkspaceSnapshot = { files: {}, savedPaths: new Set() };
  const versions = changes.flatMap(change => change.compacted
    ? [...change.versions].sort((left, right) => (chronology.get(right.annotated) ?? Number.NEGATIVE_INFINITY)
      - (chronology.get(left.annotated) ?? Number.NEGATIVE_INFINITY) || left.annotated.localeCompare(right.annotated))
    : change.versions);
  for (let offset = 0; offset < versions.length; offset += 64) {
    const batch = versions.slice(offset, offset + 64);
    const objects = await readBatchObjects(physical, [...new Set(batch.map(version => version.blob))]);
    for (const version of batch) {
      const files = manifestFiles(objects.get(version.blob));
      for (const path of Object.keys(files)) if (path.includes("/") && live.has(path.split("/", 1)[0] ?? "")) result.savedPaths.add(path);
      takeWorkspaces(files, remaining, result.files);
    }
  }
  return result;
}

function noteChanges(output: string): NoteChange[] {
  return output.split("\x1e").slice(1).map(section => {
    const [, subject, ...raw] = section.split("\0");
    const versions: NoteVersion[] = [];
    const tokens = raw.join("\0").split("\0");
    for (let index = 0; index < tokens.length; index += 1) {
      const header = /^\n?:(?:\d{6}) (?:\d{6}) [0-9a-f]{40,64} ([0-9a-f]{40,64}) [AM]$/u.exec(tokens[index] ?? "");
      if (!header?.[1]) continue;
      const annotated = notePathToCommit(tokens[++index] ?? "");
      if (annotated) versions.push({ annotated, blob: header[1] });
    }
    return { compacted: subject === NOTES_COMPACTION_SNAPSHOT_MESSAGE, versions };
  });
}

function committedAt(object: BatchObject | null | undefined): number | null {
  if (object?.type !== "commit") return null;
  const header = Buffer.from(object.bytes).toString("utf8").split("\n\n", 1)[0] ?? "";
  const time = /^committer .* (\d+) [+-]\d{4}$/mu.exec(header)?.[1];
  return time ? Number(time) : null;
}

function manifestFiles(object: BatchObject | null | undefined): Record<string, string> {
  if (object?.type !== "blob") throw new Error("A saved workspace note is unreadable");
  return parseImportNoteFiles(new TextDecoder("utf-8", { fatal: true }).decode(object.bytes));
}

function takeWorkspaces(files: Record<string, string>, remaining: Set<string>, result: Record<string, string>): void {
  const held = new Set<string>();
  for (const [path, content] of Object.entries(files)) {
    const workspace = path.split("/", 1)[0] ?? "";
    if (path.includes("/") && remaining.has(workspace)) {
      held.add(workspace);
      if (!importPersonalExcluded(path)) result[path] = content;
    }
  }
  for (const workspace of held) remaining.delete(workspace);
}
