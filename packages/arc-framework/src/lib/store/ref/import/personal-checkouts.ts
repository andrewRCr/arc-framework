/** Recognize nested checkouts before personal acquisition reads any of their files. */
import type { Slug } from "../../../kernel/schema/slug.js";
import type { StoreDirectoryEntry } from "../../ports.js";
import type { MigrateReport } from "../../commands.js";

/** A checkout excluded from one identity's logical personal namespace. */
export interface ImportPersonalCheckout { person: Slug; path: string; physicalPath: string }

/** A Git entry excludes the whole directory, whether it is a repository or a linked worktree. */
export function containsImportCheckout(entries: readonly StoreDirectoryEntry[]): boolean {
  return entries.some(entry => entry.name === ".git");
}

/** Report one blocked directory with the repair that removes it from personal state. */
export function importCheckoutNotice(checkout: ImportPersonalCheckout): MigrateReport["notices"][number] {
  return { condition: `Git checkout at ${checkout.physicalPath} (${checkout.person}/${checkout.path}) holds a .git entry and cannot be imported as personal files.`,
    remedy: { text: "Move the checkout outside personal state (use git worktree move for a registered worktree), or remove it, then retry arc store migrate --import." } };
}

/** Deliberately unwalked checkout files are not missing personal materializations. */
export function importPathInCheckout(path: string, roots: ReadonlySet<string>): boolean {
  if (roots.has("")) return true;
  let prefix = "";
  for (const part of path.split("/")) {
    prefix = prefix ? `${prefix}/${part}` : part;
    if (roots.has(prefix)) return true;
  }
  return false;
}
