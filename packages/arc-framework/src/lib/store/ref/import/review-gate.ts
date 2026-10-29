/** Inventory repository-common review sources before an import can publish state. */
import { join } from "node:path";
import { resolveGitCommonDir } from "../../../git/exec.js";
import type { RefBackendContext } from "../context.js";
import type { MigrateReport } from "../../commands.js";

/** Read every regular gate file without decoding bytes or filtering private materializations. */
export async function readImportReviewGate(context: RefBackendContext, report: MigrateReport): Promise<{ path: string; bytes: Uint8Array }[]> {
  try {
    const common = await resolveGitCommonDir(context.exec, context.checkoutRoot);
    const files = await listGateFiles(context, common, "arc/review-gate", true);
    return await Promise.all(files.map(async path => ({ path, bytes: await context.fs.readBytes(join(common, path)) })));
  } catch (error) {
    report.notices.push({ condition: `Cannot inventory arc/review-gate/: ${error instanceof Error ? error.message : String(error)}`,
      remedy: { text: "Restore access to the review gate's files, then retry arc store migrate --import." } });
    return [];
  }
}

/** The existing identity reader already carries the identity into the project registry. */
export function inspectUnmappedReviewGate(files: readonly { path: string }[], report: MigrateReport): void {
  for (const { path } of files) {
    if (path === "arc/review-gate/identity/repository-identity.json") continue;
    report.notices.push({ condition: `Review source ${path} has no import mapping.`,
      remedy: { text: "Install the review family's import mapping before retrying arc store migrate --import." } });
  }
}

async function listGateFiles(context: RefBackendContext, common: string, path: string, root = false): Promise<string[]> {
  let entries;
  try { entries = await context.fs.readdir(join(common, path)); }
  catch (error) {
    if (root && typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT") return [];
    throw error;
  }
  const files: string[] = [];
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    const child = `${path}/${entry.name}`;
    if (entry.isFile()) files.push(child);
    else if (entry.isDirectory()) files.push(...await listGateFiles(context, common, child));
    else throw new Error(`Review source ${child} is not a regular file or directory`);
  }
  return files;
}
