/** Fingerprint the exact personal and review sources acquired by the import. */
import type { WindowImportContext } from "./import-context.js";
import type { WindowCheckout } from "./checkouts.js";
import { readImportPersonalDisk, type ImportPersonalDisk } from "../../lib/store/ref/import/personal-disk.js";
import { createHash } from "node:crypto";
import { isAbsolute, relative, sep } from "node:path";
import { readImportReviewGate } from "../../lib/store/ref/import/review-gate.js";
import type { MigrateReport } from "../../lib/store/commands.js";
import { WindowRefusal } from "./result.js";

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

/** Fingerprint the import's complete review-gate read, preserving unreadable-source refusal. */
export async function readWindowReviewDigest(context: WindowImportContext): Promise<string> {
  const report: MigrateReport = { move: "import", refs: [], refused: [], brokenChains: [], reviewMapping: [], differingNotes: [], notices: [] };
  const files = await readImportReviewGate(context, report);
  if (report.notices.length > 0) throw new WindowRefusal(report.notices.map(notice => ({ subject: "review gate",
    condition: notice.condition, remedy: "Restore access to the review gate's files, then retry check." })));
  return digestEntries(files.filter(file => file.path !== "arc/review-gate/identity/repository-identity.json"));
}
