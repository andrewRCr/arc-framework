/** Acquire every person's physical files without the notes serializer's lossy filtering. */
import { join } from "node:path";
import type { StoreFileAccess } from "../../ports.js";
import type { RefBackendContext } from "../context.js";
import { scanRegisteredWorktrees } from "../../../git/worktree-roster.js";
import { SlugSchema, type Slug } from "../../../kernel/schema/slug.js";
import { IDENTITY_STATUS_FILENAME } from "../../../user-surfaces.js";
import { isAllowedFile, MAX_FILE_SIZE } from "../../../git/user-sync.js";
import { legacyRootSessionNotesName } from "./personal-layout.js";

/** One materialization, retaining the original manifest path and physical origin. */
export interface ImportPersonalFile { person: Slug; path: string; physicalPath: string; content: string; size: number }
/** All identities and their materializations, including identities with notes alone. */
export interface ImportPersonalDisk { people: Set<Slug>; files: ImportPersonalFile[] }

/** Exclude machine-local folders and the identity's generated status cache on both sides. */
export function importPersonalExcluded(path: string): boolean {
  return path.split("/").includes(".internal") || path === IDENTITY_STATUS_FILENAME;
}

/** Mirror the file-level exclusions of notes serialization without dropping disk-only files. */
export function notesCanSaveFile(path: string, size: number): boolean {
  const segments = path.split("/"), name = segments.at(-1) ?? path;
  // Save/load explicitly excludes the legacy root file; workspace SESSION-NOTES remains saveable.
  return path !== legacyRootSessionNotesName && !segments.some(segment => segment.startsWith("."))
    && name !== "README.md" && isAllowedFile(name) && size <= MAX_FILE_SIZE;
}

/** Enumerate registered, present checkouts once; no configured-identity or primary-only selection. */
export async function readImportPersonalDisk(context: RefBackendContext): Promise<ImportPersonalDisk> {
  const source = context.importSource;
  if (!source) throw new Error("No import source bound");
  const exec: typeof source.ports.exec = (command, args, options) => source.ports.exec(command, args,
    { ...options, cwd: source.ports.checkoutRoot, objectAccess: "local-only" });
  const roster = await scanRegisteredWorktrees(exec, path => source.ports.fs.lstat(path));
  if (!roster.ok) throw new Error(`Cannot enumerate personal materializations: ${roster.message}`);
  const result: ImportPersonalDisk = { people: new Set(), files: [] };
  const refs = await exec("git", ["for-each-ref", "--format=%(refname)", "refs/notes/arc/user/"]);
  for (const ref of refs.stdout.trim().split("\n")) {
    const person = SlugSchema.safeParse(ref.slice("refs/notes/arc/user/".length));
    if (person.success) result.people.add(person.data);
  }
  for (const checkout of roster.worktrees.filter(checkout => checkout.folderPresent)) {
    const root = join(checkout.path, ".arc", "user");
    for (const entry of await directories(source.ports.fs, root)) {
      if (!entry.isDirectory() || entry.name.startsWith(".")) continue;
      const person = SlugSchema.safeParse(entry.name);
      if (!person.success) throw new Error(`Personal identity directory ${join(root, entry.name)} has an invalid slug name ${JSON.stringify(entry.name)}. Rename it to a valid identity slug before retrying.`);
      result.people.add(person.data);
      await walk(source.ports.fs, result.files, person.data, join(root, person.data), "");
    }
  }
  return result;
}

async function directories(fs: StoreFileAccess, path: string) {
  try { return await fs.readdir(path); }
  catch (error) {
    if (typeof error === "object" && error !== null && "code" in error && (error.code === "ENOENT" || error.code === "ENOTDIR")) return [];
    throw personalReadError(path, error);
  }
}

async function walk(fs: StoreFileAccess, files: ImportPersonalFile[], person: Slug, root: string, prefix: string): Promise<void> {
  for (const entry of await directories(fs, join(root, prefix))) {
    const path = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (importPersonalExcluded(path)) continue;
    const physicalPath = join(root, path), stat = await readPersonalPath(physicalPath, () => fs.lstat(physicalPath));
    if (stat.isSymbolicLink()) continue;
    if (stat.isDirectory()) await walk(fs, files, person, root, path);
    else if (stat.isFile()) files.push({ person, path, physicalPath, size: stat.size,
      content: await readPersonalPath(physicalPath, () => fs.readFile(physicalPath)) });
  }
}

async function readPersonalPath<T>(path: string, read: () => Promise<T>): Promise<T> {
  try { return await read(); }
  catch (error) { throw personalReadError(path, error); }
}

function personalReadError(path: string, error: unknown): Error {
  return new Error(`Cannot read personal path ${path}: ${error instanceof Error ? error.message : String(error)}`, { cause: error });
}
