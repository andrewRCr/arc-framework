/** Fingerprint the exact personal and review sources acquired by the import. */
import type { WindowImportContext } from "./import-context.js";
import type { WindowCheckout } from "./checkouts.js";
import { readImportPersonalDisk, type ImportPersonalDisk } from "../../lib/store/ref/import/personal-disk.js";
import { createHash } from "node:crypto";
import { isAbsolute, relative, sep } from "node:path";

/** One acquisition retained for checkout conditions beside its per-checkout fingerprints. */
export interface WindowPersonalState { disk: ImportPersonalDisk; digests: Record<string, string> }

/** Read every present checkout's personal state once, retaining the import's exclusions and links. */
export async function readWindowPersonalState(context: WindowImportContext, checkouts: readonly WindowCheckout[]): Promise<WindowPersonalState> {
  const disk = await readImportPersonalDisk(context);
  return { disk, digests: deriveWindowPersonalDigests(disk, checkouts) };
}

/** Fingerprint acquired paths and contents under their physical registered checkout, independent of enumeration order. */
export function deriveWindowPersonalDigests(disk: Pick<ImportPersonalDisk, "files" | "links">,
  checkouts: readonly Pick<WindowCheckout, "path">[]): Record<string, string> {
  const inputs = [...disk.files.map(file => ({ physicalPath: file.physicalPath, bytes: Buffer.from(file.content) })),
    ...disk.links.map(link => ({ physicalPath: link.physicalPath, bytes: null }))];
  const roots = [...checkouts].sort((left, right) => right.path.length - left.path.length);
  const digests = Object.fromEntries(checkouts.map(checkout => {
    const entries = inputs.flatMap(input => {
      const owner = roots.find(root => checkoutRelativePath(root.path, input.physicalPath) !== null);
      if (owner?.path !== checkout.path) return [];
      const path = relative(checkout.path, input.physicalPath);
      return [{ path: path.split(sep).join("/"), bytes: input.bytes }];
    });
    return [checkout.path, digestEntries(entries)];
  }));
  return digests;
}

function checkoutRelativePath(root: string, physicalPath: string): string | null {
  const path = relative(root, physicalPath);
  return isAbsolute(path) || path === ".." || path.startsWith(`..${sep}`) ? null : path;
}

function digestEntries(entries: readonly { path: string; bytes: Uint8Array | null }[]): string {
  const hash = createHash("sha256");
  for (const entry of [...entries].sort((left, right) => left.path === right.path ? 0 : left.path < right.path ? -1 : 1)) {
    hash.update(JSON.stringify([entry.path, entry.bytes === null ? null : Buffer.from(entry.bytes).toString("base64")]) + "\n");
  }
  return hash.digest("hex");
}
