/** Bind review identities to imported work and prove archived branches have landed. */
import type { RefBackendContext } from "../context.js";
import type { ImportRecord } from "./source.js";
import type { MigrateReport } from "../../commands.js";
import type { ReviewMappingInput } from "./review-mapping.js";
import { TransientIdentityRecordSchema } from "../../../errand/identity-record.js";
import { parseMetaRecord } from "../../../active/meta-reader.js";
import { readImportCodeTip } from "./branch-tip.js";
import { isLandedInBaseStrict } from "../../../git/branch-containment.js";

/** Every held Errand stays live; terminal work units retain their distinct store identities. */
export async function importReviewWorkItems(context: RefBackendContext, records: readonly ImportRecord[], report: MigrateReport): Promise<ReviewMappingInput["workItems"]> {
  const result: ReviewMappingInput["workItems"] = [];
  for (const record of records) {
    const owner = record.reference.owner;
    if (owner.type !== "work-item" || !owner.uid) continue;
    if (record.reference.kind === "work-item/meta") result.push({ slug: owner.name, uid: owner.uid, kind: "work-unit",
      live: record.placement?.kind !== "completed" || await archivedWorkLive(context, record, report) });
    else if (record.reference.kind === "lineage/transition") result.push({ slug: owner.name, uid: owner.uid, kind: "work-unit", live: false });
    else if (record.reference.kind === "work-item/record") {
      const source = TransientIdentityRecordSchema.parse(JSON.parse(record.content));
      result.push({ slug: owner.name, uid: owner.uid, kind: "errand", live: true, claimId: source.claimId });
    }
  }
  return result;
}

async function archivedWorkLive(context: RefBackendContext, record: ImportRecord, report: MigrateReport): Promise<boolean> {
  const source = context.importSource;
  if (!source) throw new Error("No import source bound");
  const branch = parseMetaRecord(record.content).branch;
  if (!branch) return false;
  try {
    const tips = [...new Set((await Promise.all([`refs/heads/${branch}`, `refs/remotes/origin/${branch}`]
      .map(ref => readImportCodeTip(source, ref)))).filter((tip): tip is string => tip !== null))];
    if (!tips.length) return false;
    const base = await readImportCodeTip(source, `refs/remotes/origin/${source.baseBranch}`)
      ?? await readImportCodeTip(source, `refs/heads/${source.baseBranch}`);
    const exec: typeof source.ports.exec = (command, args, options) => source.ports.exec(command, ["--no-replace-objects", ...args],
      { ...options, cwd: source.ports.checkoutRoot, objectAccess: "local-only" });
    if (base && (await Promise.all(tips.map(tip => isLandedInBaseStrict(exec, tip, base)))).every(Boolean)) return false;
    report.notices.push({ condition: `Archived work '${record.reference.owner.name}' still holds branch '${branch}' that has not landed in the configured base.`,
      remedy: { text: "Merge its branch into base, or remove the branch if its changes already landed by a multi-commit squash or are no longer wanted; use arc teardown for a remotely held branch, then retry arc store migrate --import." } });
  } catch (error) {
    report.notices.push({ condition: `Cannot prove archived branch '${branch}' landed: ${error instanceof Error ? error.message : String(error)}`,
      remedy: { text: "Restore local access to the branch and configured base, then retry arc store migrate --import." } });
  }
  return true;
}
