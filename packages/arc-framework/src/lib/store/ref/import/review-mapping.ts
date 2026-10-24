/** Acquisition of the review mapping's opaque legacy source inputs, and landing of what it returns. */
import type { RefBackendContext } from "../context.js";
import type { ImportRecord } from "./source.js";
import type { MigrateReport } from "../../commands.js";
import { resolveCandidateRecordRelativePath } from "../../../work-unit/candidate-record-store.js";
import { resolveArcPath } from "../../../layout/index.js";
import { SlugSchema } from "../../../kernel/schema/slug.js";
import { readImportReviewGate, inspectUnmappedReviewGate } from "./review-gate.js";
import { inspectReviewCoverage } from "./review-coverage.js";
import { importReviewWorkItems } from "./review-work-items.js";
import { RecordReferenceSchema } from "../../identity.js";

/** Replace live review bytes only after the mapping has accounted for the supplied sources. */
export async function mapImportReview(context: RefBackendContext, records: ImportRecord[], report: MigrateReport, projectId: string): Promise<ImportRecord[]> {
  const gate = await readImportReviewGate(context, report);
  const workItems = await importReviewWorkItems(context, records, report);
  if (!context.reviewMapping) { inspectUnmappedReviewGate(gate, report); return records; }
  const live = new Set(workItems.filter(item => item.live).map(item => item.uid));
  const review = records.filter(record => (record.reference.kind === "review/candidate" || record.reference.kind === "review/integration-boundary")
    && record.reference.owner.type === "work-item" && live.has(record.reference.owner.uid ?? ""));
  const candidates = workItems.filter(item => item.live).flatMap(item => {
    const candidate = review.find(record => record.reference.kind === "review/candidate" && record.reference.owner.type === "work-item" && record.reference.owner.uid === item.uid);
    const boundary = review.find(record => record.reference.kind === "review/integration-boundary" && record.reference.owner.type === "work-item" && record.reference.owner.uid === item.uid);
    return candidate || boundary ? [{ workItem: item.uid, versions: candidate?.versions ?? [], current: candidate?.content ?? null, boundary: boundary?.content ?? null }] : [];
  });
  const mapped = context.reviewMapping({ projectId, gate, workItems, candidates });
  report.reviewMapping = mapped.listing;
  const sources = [...gate.map(file => file.path), ...review.flatMap(record => record.reference.kind === "review/candidate"
    ? [resolveCandidateRecordRelativePath(record.reference.owner.name),
      ...(record.versions ?? []).map(version => `${resolveCandidateRecordRelativePath(record.reference.owner.name)}@${version.commit}`)]
    : [resolveArcPath({ kind: "integration-boundary-record", slug: SlugSchema.parse(record.reference.owner.name) })])];
  report.notices.push(...inspectReviewCoverage(sources, mapped.listing));
  for (const item of mapped.listing.filter(item => item.outcome === "in-flight")) report.notices.push({
    condition: `Review source ${item.source} is in flight${item.reason ? `: ${item.reason}` : "."}`,
    remedy: { text: "Finish the named review, then retry arc store migrate --import." } });
  const result = records.filter(record => !review.includes(record));
  for (const record of mapped.records) {
    const parsed = RecordReferenceSchema.safeParse(record.reference);
    const remedy = { text: "Correct the review mapping's returned record, then retry arc store migrate --import." };
    if (!parsed.success) {
      report.notices.push({ condition: `Review mapping record ${JSON.stringify(record.reference)} has no valid reference.`, remedy });
      continue;
    }
    if (parsed.data.owner.type !== "work-item" || !live.has(parsed.data.owner.uid ?? "")) {
      report.refused.push({ reference: parsed.data, rule: "review-mapping" });
      report.notices.push({ condition: `Review mapping record ${JSON.stringify(record.reference)} names no supplied live work item.`, remedy });
      continue;
    }
    const content = record.contents.at(-1);
    if (content === undefined) {
      report.refused.push({ reference: record.reference, rule: "review-mapping" });
      report.notices.push({ condition: `Review mapping record ${JSON.stringify(record.reference)} has no content revisions.`,
        remedy });
      continue;
    }
    result.push({ reference: parsed.data, content, mappedVersions: record.contents });
  }
  return result;
}

