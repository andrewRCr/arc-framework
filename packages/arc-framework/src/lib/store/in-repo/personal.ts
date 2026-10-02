/** Whole-file personal records rooted by the existing user-surface resolver. */
import { join, relative } from "node:path";
import { digestBytes } from "../../kernel/canonical/canonical-json.js";
import { RecordVersionSchema, type RecordReference } from "../identity.js";
import type { ReadInput, StoreRecord, ListInput, ListingOutcome, ListingDiagnostic } from "../read.js";
import type { InRepoContext } from "./context.js";
import { isMissing, notFound, unsupported } from "./refusals.js";
import { personalIdentity, personalSurfaces, personalPath, personalFileReference, personalPathRemedy, personalSingletonKey } from "./personal-paths.js";
import { SlugSchema } from "../../kernel/schema/slug.js";
import type { UserSurfaceResolver } from "../../user-surfaces.js";
import type { StoreDirectoryEntry } from "../ports.js";

/** Read a regular personal file, preserving missing paths separately from failed I/O.
 * @param context - Explicit filesystem access.
 * @param path - Absolute address resolved from the logical record.
 * @returns Exact bytes decoded as UTF-8, or null for absence and nonregular entries.
 */
export async function personalFileAt(context: InRepoContext, path: string): Promise<string | null> {
  try {
    const stat = await context.ports.fs.lstat(path);
    return stat.isFile() && !stat.isSymbolicLink() ? await context.ports.fs.readFile(path) : null;
  } catch (error) { if (isMissing(error)) return null; throw error; }
}
function personalRecord(reference: RecordReference, content: string): StoreRecord {
  return { reference, content, version: RecordVersionSchema.parse(digestBytes(Buffer.from(content))), formatVersion: 1, conflicts: [] };
}
/** Read a live personal record without acquiring the notes lock.
 * @param context - Explicit checkout dependencies.
 * @param input - Logical personal reference.
 * @returns Exact whole-file content and digest.
 */
export async function readPersonal(context: InRepoContext, input: ReadInput): Promise<StoreRecord> {
  const identity = await personalIdentity(context, input.reference);
  if (input.asOf !== undefined) return unsupported("uncovered-state-version", "Personal files are outside the branch's saved state", "Read the file using its current per-record version instead.");
  const path = personalPath(await personalSurfaces(context, identity), input.reference);
  if (path === undefined) return notFound(input.reference, personalPathRemedy(identity, input.reference));
  const content = await personalFileAt(context, path);
  return content === null ? notFound(input.reference) : personalRecord(input.reference, content);
}
/** Enumerate live personal files without acquiring the notes lock.
 * @param context - Explicit checkout dependencies.
 * @param input - Personal family selection.
 * @returns Complete records and per-file unreadability evidence.
 */
export async function listPersonal(context: InRepoContext, input: ListInput): Promise<ListingOutcome> {
  const identity = await context.ports.identity();
  if (identity === null || (input.owner !== undefined && input.owner.name !== identity)) return { status: "absent" };
  if (input.asOf !== undefined) return unsupported("uncovered-state-version", "Personal files are outside the branch's saved state", "List their current records instead.");
  const surfaces = await personalSurfaces(context, identity);
  const sources = await personalSources(context, surfaces, input);
  if ("status" in sources) return sources;
  const { paths, diagnostics } = sources;
  const records: StoreRecord[] = [];
  for (const source of paths) {
    const reference = personalFileReference(identity, source.key);
    if (reference === undefined || (input.kind !== undefined && reference.kind !== input.kind)) continue;
    try {
      const content = await personalFileAt(context, source.path);
      if (content !== null) records.push(personalRecord(reference, content));
    } catch (error) { if (!permissionFailure(error)) throw error; diagnostics.push(unreadable(source.path)); }
  }
  if (records.length === 0 && diagnostics.length === 0) return { status: "absent" };
  return { status: "complete", records, diagnostics, missed: diagnostics.length > 0 };
}
interface PersonalSources { paths: { path: string; key: string }[]; diagnostics: ListingDiagnostic[] }
async function personalSources(context: InRepoContext, surfaces: UserSurfaceResolver, input: ListInput): Promise<PersonalSources | Extract<ListingOutcome, { status: "unreadable" }>> {
  const diagnostics: ListingDiagnostic[] = [];
  const paths: { path: string; key: string }[] = [];
  const currentRoot = join(surfaces.cwd, ".arc", "user", surfaces.identity);
  try {
    if (input.kind === "personal/inbox" || input.kind === "personal/working-memory") {
      await rootDirectory(context, surfaces.identityGlobalRoot);
      return { paths: [personalSingletonSource(surfaces, input.kind)], diagnostics };
    }
    if (input.kind !== "personal/session-context") {
      for (const entry of await rootDirectory(context, surfaces.identityGlobalRoot)) {
        if (entry.isFile() && !entry.name.startsWith(".")) paths.push({ path: surfaces.identityGlobalPath(entry.name), key: entry.name });
      }
    }
    for (const entry of await rootDirectory(context, currentRoot)) {
      if (entry.isDirectory() && !entry.name.startsWith(".")) {
        if (input.kind === "personal/session-context") {
          paths.push(...personalSessionSources(surfaces, currentRoot, entry.name));
        }
        else await workspaceFiles(context, currentRoot, join(currentRoot, entry.name), paths, diagnostics);
      }
    }
  } catch (error) {
    if (!permissionFailure(error)) throw error;
    return { status: "unreadable", condition: "The personal family root cannot be enumerated.",
      remedy: { text: `Restore read access to ${surfaces.identityGlobalRoot} and ${currentRoot}, then list again.` } };
  }
  return { paths, diagnostics };
}
function personalSingletonSource(surfaces: UserSurfaceResolver, kind: "personal/inbox" | "personal/working-memory"): { path: string; key: string } {
  const key = personalSingletonKey(surfaces.identity, kind);
  const reference = personalFileReference(surfaces.identity, key);
  const path = reference === undefined ? undefined : personalPath(surfaces, reference);
  if (path === undefined) throw new Error("Personal singleton has no registered path");
  return { path, key };
}
function personalSessionSources(surfaces: UserSurfaceResolver, root: string, name: string): { path: string; key: string }[] {
  const workUnit = SlugSchema.safeParse(name);
  if (!workUnit.success) return [];
  const path = surfaces.sessionNotesPath(workUnit.data);
  return [{ path, key: relative(root, path).split("\\").join("/") }];
}
async function rootDirectory(context: InRepoContext, path: string): Promise<StoreDirectoryEntry[]> {
  try { return await context.ports.fs.readdir(path); }
  catch (error) { if (isMissing(error)) return []; throw error; }
}
function permissionFailure(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && (error.code === "EACCES" || error.code === "EPERM");
}
function unreadable(path: string): ListingDiagnostic {
  return { kind: "unreadable", key: path, condition: `The personal file or directory could not be read: ${path}`,
    remedy: { text: `Restore read access to ${path}, then list the records again.` } };
}
async function personalDirectory(context: InRepoContext, path: string, diagnostics: ListingDiagnostic[]) {
  try { return await context.ports.fs.readdir(path); }
  catch (error) {
    if (isMissing(error)) return [];
    if (!permissionFailure(error)) throw error;
    diagnostics.push(unreadable(path)); return [];
  }
}
async function workspaceFiles(context: InRepoContext, root: string, path: string, files: { path: string; key: string }[], diagnostics: ListingDiagnostic[]): Promise<void> {
  for (const entry of await personalDirectory(context, path, diagnostics)) {
    if (entry.name.startsWith(".")) continue;
    const target = join(path, entry.name);
    if (entry.isDirectory()) await workspaceFiles(context, root, target, files, diagnostics);
    else if (entry.isFile()) files.push({ path: target, key: relative(root, target).split("\\").join("/") });
  }
}
