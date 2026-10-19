/** Inventory repository-common review sources before an import can publish state. */
import { join } from "node:path";
import { resolveGitCommonDir } from "../../../git/exec.js";
import type { RefBackendContext } from "../context.js";
import type { MigrateReport } from "../../commands.js";

/** Refuse opaque review facts until the review family's mapping can account for them. */
export async function inspectUnmappedReviewGate(context: RefBackendContext, report: MigrateReport): Promise<void> {
  try {
    const common = await resolveGitCommonDir(context.exec, context.checkoutRoot);
    const files = await listGateFiles(context, common, "arc/review-gate", true);
    for (const path of files) {
      // The existing identity reader already carries this value into the project registry.
      if (path === "arc/review-gate/identity/repository-identity.json") continue;
      report.notices.push({ condition: `Review source ${path} has no import mapping.`,
        remedy: { text: "Install the review family's import mapping before retrying arc store migrate --import." } });
    }
  } catch (error) {
    report.notices.push({ condition: `Cannot inventory arc/review-gate/: ${error instanceof Error ? error.message : String(error)}`,
      remedy: { text: "Restore access to the review gate's files, then retry arc store migrate --import." } });
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
