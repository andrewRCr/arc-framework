/** Compare coherent notes snapshots with all copies before preparing personal records. */
import type { RefBackendContext } from "../context.js";
import type { ImportRecord } from "./source.js";
import type { MigrateReport } from "../../commands.js";
import { readImportPersonalDisk, notesCanSaveFile, importPersonalExcluded, type ImportPersonalFile } from "./personal-disk.js";
import { readRecentUserNotes } from "../../../user-sync/notes-ref.js";
import { mergeCrossWuFromNotes } from "../../../../commands/user/save-load.js";
import { projectManifest } from "../../../user-sync/projection.js";
import { personalFileReference } from "../../in-repo/personal-paths.js";
import { importPersonalPath } from "./personal-layout.js";
import { foldImportSession } from "./session-context.js";
import { readImportWorkspaces } from "./personal-notes.js";
import { RecordReferenceSchema } from "../../identity.js";
import type { Slug } from "../../../kernel/schema/slug.js";

/** Read notes using load's own flat merge and refuse every content disagreement before landing. */
export async function appendImportPersonal(context: RefBackendContext, report: MigrateReport, records: ImportRecord[]): Promise<void> {
  let disk: Awaited<ReturnType<typeof readImportPersonalDisk>>;
  try { disk = await readImportPersonalDisk(context); }
  catch (error) { reportReadFailure(report, "personal materializations", error); return; }
  const live = new Set(records.filter(record => record.reference.kind === "work-item/meta" && record.placement?.kind !== "completed").map(record => record.reference.owner.name));
  for (const person of [...disk.people].sort()) {
    try { await appendPerson(context, report, records, person, disk.files.filter(file => file.person === person), live); }
    catch (error) { reportReadFailure(report, `${person}'s personal notes snapshot at refs/notes/arc/user/${person} in ${context.importSource?.ports.checkoutRoot ?? context.checkoutRoot}`, error); }
  }
}

async function appendPerson(context: RefBackendContext, report: MigrateReport, records: ImportRecord[], person: Slug,
  copies: ImportPersonalFile[], live: ReadonlySet<string>): Promise<void> {
  const source = context.importSource;
  if (!source) throw new Error("No import source bound");
  const exec: typeof source.ports.exec = (command, args, options) => source.ports.exec(command, args,
    { ...options, cwd: source.ports.checkoutRoot, objectAccess: "local-only" });
  const merged = mergeCrossWuFromNotes(await readRecentUserNotes(exec, person, undefined, context.clock()));
  const workspaces = await readImportWorkspaces(context, person, live);
  const snapshot = projectManifest({ version: 2, files: { ...merged.files, ...workspaces.files } }).files;
  const byPath = new Map<string, ImportPersonalFile[]>();
  for (const file of copies) byPath.set(file.path, [...(byPath.get(file.path) ?? []), file]);
  for (const path of [...new Set([...Object.keys(snapshot), ...byPath.keys()])].sort()) {
    if (importPersonalExcluded(path)) continue;
    comparePersonalFile(person, path, snapshot[path], byPath.get(path) ?? [], report, records, workspaces.savedPaths);
  }
}

function reportReadFailure(report: MigrateReport, subject: string, error: unknown): void {
  report.notices.push({ condition: `Cannot read all ${subject}: ${error instanceof Error ? error.message : String(error)}`,
    remedy: { text: "Repair the named personal source or identity directory and restore readable files and notes history in every registered checkout, then retry arc store migrate --import." } });
}

function comparePersonalFile(person: Slug, path: string, snapshot: string | undefined, copies: ImportPersonalFile[],
  report: MigrateReport, records: ImportRecord[], savedPaths: ReadonlySet<string>): void {
  const diskOnly = copies.length > 0 && (copies.some(file => !notesCanSaveFile(path, file.size))
    || path.includes("/") && !savedPaths.has(path));
  const projected = copies.map(file => projectManifest({ version: 2, files: { [path]: file.content } }).files[path]);
  const differs = new Set(projected).size > 1 || (!diskOnly && copies.length > 0 && projected.some(content => content !== snapshot));
  const kind = differs ? "differs" : diskOnly ? "disk-only" : copies.length === 0 && snapshot !== undefined ? "snapshot-only" : undefined;
  if (kind) report.differingNotes.push({ person, path, kind });
  if (differs || kind === "snapshot-only") report.notices.push({ condition: `Personal file ${person}/${path} ${kind} between notes and disk copies.`,
    remedy: { text: disagreementRemedy(person, path, diskOnly, kind) } });
  const content = diskOnly ? projected[0] : snapshot;
  if (content === undefined || differs || kind === "snapshot-only") return;
  appendPersonalRecord(person, path, content, records, report);
}

function appendPersonalRecord(person: Slug, path: string, content: string, records: ImportRecord[], report: MigrateReport): void {
  const original = personalFileReference(person, path) ?? RecordReferenceSchema.parse({ kind: "personal/document", owner: { type: "person", name: person }, key: path });
  if (original.kind === "personal/session-context" && foldImportSession({ reference: original, content }, records, report)) return;
  const reference = original.kind === "personal/document" || original.kind === "personal/session-context"
    ? RecordReferenceSchema.parse({ kind: "personal/document", owner: original.owner, key: importPersonalPath(path, records) }) : original;
  records.push({ reference, content, personalPath: path });
}

function disagreementRemedy(person: Slug, path: string, diskOnly: boolean, kind: string | undefined): string {
  if (kind === "snapshot-only") return `Run arc user load for ${person} from this workspace's checkout (or any checkout for root files) to restore ${path}, then retry arc store migrate --import.`;
  if (diskOnly) return `Reconcile every disk copy of ${person}/${path} by editing or copying the intended content until they agree, then retry arc store migrate --import.`;
  return `Run arc user save and arc user load for ${person} from this workspace's checkout (or any checkout for root files), reconcile every disk copy of ${path}, then retry arc store migrate --import.`;
}
