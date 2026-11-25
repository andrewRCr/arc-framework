/** Acquisition evidence for tracked namespaces, separate from their record parsers. */
import type { ListingDiagnostic } from "../read.js";
import type { StoreDirectoryEntry } from "../ports.js";
import type { InRepoContext } from "./context.js";
import { directoryAt } from "./files.js";

/** Recognize the filesystem's typed access refusals.
 * @param error - Failed filesystem acquisition.
 * @returns Whether access can be restored before retrying.
 */
export function isAccessDenied(error: unknown): boolean {
  return error !== null && typeof error === "object" && "code" in error && (error.code === "EACCES" || error.code === "EPERM");
}
/** Read one directory without concealing denied or unknown acquisition failures.
 * @param context - Repository dependencies.
 * @param path - Repository-relative namespace.
 * @param revision - Saved tree, or the working tree.
 * @param diagnostics - Listing-owned acquisition evidence; absent means failures throw.
 * @returns Available entries; only established absence or a reported denial yields none.
 */
export async function discoverDirectory(context: InRepoContext, path: string, revision?: string, diagnostics?: ListingDiagnostic[]): Promise<StoreDirectoryEntry[]> {
  try { return await directoryAt(context, path, revision); } catch (error) {
    if (!isAccessDenied(error) || diagnostics === undefined) throw error;
    diagnostics.push({ kind: "unreadable", key: path, condition: `The directory could not be read: ${path}`,
      remedy: { text: `Restore read access to ${path}, then list the records again.` } });
    return [];
  }
}
