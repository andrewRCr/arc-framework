/** The aside folder's copies and staged files: where each lives, and what its name records. */
import { createHash, randomBytes } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { isManagedPath } from "../../kernel/index.js";
import { BlobIdSchema } from "./index-schema.js";
import { PROJECTION_ASIDE_ROOT, PROJECTION_LOCAL_ROOT } from "./paths.js";

/** The folder under the aside folder that mirrors each moved file's path. */
export const ASIDE_FILES_ROOT = `${PROJECTION_ASIDE_ROOT}/aside`;

const PROCESS_INSTANCE = /^[0-9A-Za-z-]+$/u;
// `<base blob id>.<pid>-<instance>-<scope digest>.<nonce>.<role>`; the instance may hold hyphens, the others cannot.
const NAME = /^([0-9a-f]{40}|[0-9a-f]{64})\.([1-9][0-9]*)-([0-9A-Za-z-]+)-([0-9a-f]{16})\.([0-9a-f]{16})\.(aside|staged)$/u;

/** A copy a swap moved aside, or the staged file it links into place. */
export type AsideRole = "aside" | "staged";

/** The process that wrote a copy or staged file, as the projection lock records a holder. */
export interface AsideWriterInput {
  readonly pid: number;
  readonly processInstance: string;
  readonly processScope: string;
}

/** The writer a name records, its process scope as a short digest. */
export interface AsideWriter {
  readonly pid: number;
  readonly processInstance: string;
  readonly scopeDigest: string;
}

/** What a copy's or staged file's folder and name record. */
export interface AsideFile {
  readonly path: string;
  readonly base: string;
  readonly writer: AsideWriter;
  readonly nonce: string;
  readonly role: AsideRole;
}

/**
 * Name a new copy or staged file for one move of a projected file; each call draws its own nonce.
 * @param input - The file's repository-relative path, the base blob id it replaced, its writer, and its role.
 * @returns Its repository-relative location in the aside folder.
 */
export function nameAsideFile(input: {
  path: string; base: string; writer: AsideWriterInput; role: AsideRole;
}): string {
  const { pid, processInstance, processScope } = input.writer;
  if (!isProjectedPath(input.path)) throw new Error(`Only a projected file under .arc/ is moved aside: ${input.path}`);
  if (!BlobIdSchema.safeParse(input.base).success) throw new Error(`Expected a blob id: ${input.base}`);
  if (!Number.isSafeInteger(pid) || pid < 1 || !PROCESS_INSTANCE.test(processInstance)) {
    throw new Error(`A writer's name must hold its process ID and instance: ${pid}-${processInstance}`);
  }
  const writer = `${pid}-${processInstance}-${processScopeDigest(processScope)}`;
  const name = `${input.base}.${writer}.${randomBytes(8).toString("hex")}.${input.role}`;
  return `${ASIDE_FILES_ROOT}/${input.path.slice(".arc/".length)}/${name}`;
}

/**
 * Digest a process scope for a file name, since a scope holds characters a name cannot.
 * @param scope - A process-visibility scope, such as `pid:[4026531836]` or `win32:host`.
 * @returns Its short hex digest.
 */
export function processScopeDigest(scope: string): string {
  return createHash("sha256").update(scope, "utf8").digest("hex").slice(0, 16);
}

/**
 * Read back what a copy's or staged file's location records.
 * @param location - Its repository-relative location in the aside folder.
 * @returns What it records, or undefined where the location is not one this module names.
 */
export function parseAsideFile(location: string): AsideFile | undefined {
  const prefix = `${ASIDE_FILES_ROOT}/`;
  if (!location.startsWith(prefix)) return undefined;
  const folders = location.slice(prefix.length).split("/");
  const match = NAME.exec(folders.pop() ?? "");
  const path = `.arc/${folders.join("/")}`;
  if (match === null || folders.length === 0 || !isProjectedPath(path)) return undefined;
  const [, base = "", pid = "", processInstance = "", scopeDigest = "", nonce = "", role = ""] = match;
  return { path, base, writer: { pid: Number(pid), processInstance, scopeDigest }, nonce, role: role as AsideRole };
}

function isProjectedPath(path: string): boolean {
  return path.startsWith(".arc/") && isManagedPath(path) && !path.startsWith(`${PROJECTION_LOCAL_ROOT}/`);
}

/**
 * Create a staged file at its location, never over another.
 * @param checkout - The checkout root.
 * @param location - Its repository-relative location, as {@link nameAsideFile} named it.
 * @param content - Its content.
 */
export async function createStagedFile(checkout: string, location: string, content: string | Uint8Array): Promise<void> {
  const target = join(checkout, location);
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, content, { flag: "wx" });
}
