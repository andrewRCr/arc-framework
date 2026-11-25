/** Preserve import admission causes while using only the report's defined refusal rules. */
import type { MigrateReport } from "../../commands.js";
import type { StoreRefusal } from "../../refusal.js";
import type { RefBackendContext } from "../context.js";
import type { ImportRecord } from "./source.js";
import { checkRefEntryProblem } from "../prepare-content.js";

type SourceRecord = Pick<ImportRecord, "reference" | "mappedVersions">;
type Problem = Pick<StoreRefusal, "condition" | "remedy">;

/** Every admission row has an explanation; other blocking faults need only their notice. */
export function reportImportAdmission(report: MigrateReport, record: SourceRecord, problem: Problem, rule?: string): void {
  const mapped = record.mappedVersions !== undefined;
  const refusalRule = mapped ? "review-mapping" : rule;
  if (refusalRule) report.refused.push({ reference: record.reference, rule: refusalRule });
  report.notices.push({ condition: `${JSON.stringify(record.reference)}: ${problem.condition}`,
    remedy: mapped ? { ...problem.remedy,
      text: `${problem.remedy.text} Correct the review mapping's returned record, then retry arc store migrate --import.` } : problem.remedy });
}

/** Parser and registry failures are distinct from entry stamping and duplicate-ID failures. */
export function reportImportPutFailure(registry: RefBackendContext["registry"], report: MigrateReport,
  record: SourceRecord & Pick<ImportRecord, "content">, failure: StoreRefusal): void {
  const grammar = registry[record.reference.kind].entry;
  const entry = grammar ? checkRefEntryProblem(record.reference, record.content, grammar) : undefined;
  if (failure.code === "record-malformed" && entry) {
    reportImportAdmission(report, record, entry, "entry-id");
    if (entry.condition !== failure.condition) reportImportAdmission(report, record, failure);
    return;
  }
  reportImportAdmission(report, record, failure);
}

/** Missing queue or inbound syntax is a registry fault rather than an entry ID fault. */
export function reportImportGrammar(report: MigrateReport, reference: ImportRecord["reference"]): void {
  reportImportAdmission(report, { reference }, {
    condition: `No usable entry grammar with a section is declared for ${reference.kind}.`,
    remedy: { text: `Declare an entry grammar with at least one section for ${reference.kind} in the constructed registry, then retry arc store migrate --import.` },
  });
}
