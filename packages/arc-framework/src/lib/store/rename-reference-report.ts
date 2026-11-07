/** Authored repairs for work-item references that a rename leaves in their resulting content. */
import { parseMetaRecord } from "../active/meta-reader.js";
import { sameOwner, sameReference, type RecordReference } from "./identity.js";
import type { LifecycleEntry } from "./lifecycle-index.js";
import type { StoreRecord } from "./read.js";
import type { RenameReferenceResolution } from "./rename-reference-resolution.js";
import { emptyRenameReport, type RenameReport, type RenameReferenceEdit, type RenameReportRecord } from "../work-unit/rename-report.js";
import { rewriteBacktickedArtifactReferences } from "../work-unit/rename-reference-sweep.js";
import type { RecordObservation } from "./write.js";

interface WorkUnitRenameReportInput {
  primary: StoreRecord; records: readonly StoreRecord[]; entries: readonly LifecycleEntry[];
  resolution: RenameReferenceResolution; source: string; target: string; artifactRenames: ReadonlyMap<string, string>;
}
type AppendRepair = (reference: RecordReference, edit: RenameReferenceEdit) => void;

/** Describe only omitted rewrites within the work-unit rename's reference authority. */
export function workUnitRenameReferenceReport(input: WorkUnitRenameReportInput): RenameReport {
  if (input.resolution === "other") return emptyRenameReport();
  const references: { record: RenameReportRecord; edits: RenameReferenceEdit[] }[] = [];
  const shared = input.records.filter(record => !sameOwner(record.reference.owner, input.primary.reference.owner));
  const append: AppendRepair = (reference, edit) => {
    const record = reportOwner(reference);
    const row = references.find(item => item.record.type === record.type && item.record.uid === record.uid);
    if (row === undefined) references.push({ record, edits: [edit] }); else row.edits.push(edit);
  };
  reportDependencies(input, shared, append);
  if (input.resolution === "ambiguous") reportText(input, shared, append);
  return { ...emptyRenameReport(), references };
}

/** Bind report-only dependents without adding their authored content to the writable reference sweep. */
export function workUnitRenameReportObservations(input: Pick<WorkUnitRenameReportInput, "entries" | "records">,
  report: RenameReport): RecordObservation[] {
  return input.entries.filter(entry => !input.records.some(record => sameReference(record.reference, entry.reference))
    && report.references.some(row => row.record.type === "work-unit" && entry.reference.owner.type === "work-item"
      && row.record.uid === entry.reference.owner.uid))
    .map(entry => ({ reference: entry.reference, expected: { version: entry.version, conflicts: [] } }));
}

function reportDependencies(input: WorkUnitRenameReportInput, shared: readonly StoreRecord[], append: AppendRepair): void {
  for (const entry of input.entries) {
    if (sameOwner(entry.reference.owner, input.primary.reference.owner)) continue;
    const acquired = shared.find(record => sameReference(record.reference, entry.reference));
    const fields = acquired === undefined ? entry.fields : parseMetaRecord(acquired.content);
    if (fields.dependsOn.includes(input.source)) append(entry.reference, {
      kind: "field", field: "dependsOn", from: input.source, to: input.target,
    });
    if (fields.pause?.waitsOn?.kind === "work-unit" && fields.pause.waitsOn.slug === input.source) append(entry.reference, {
      kind: "field", field: "waitsOn", from: input.source, to: input.target,
    });
  }
}

function reportText(input: WorkUnitRenameReportInput, shared: readonly StoreRecord[], append: AppendRepair): void {
  for (const record of shared) {
    if (record.reference.kind === "work-item/cut-map") continue;
    for (const [index, line] of record.content.split("\n").entries()) {
      let replacement = rewriteBacktickedArtifactReferences(line, input.source, input.target);
      for (const [from, to] of input.artifactRenames) replacement = replacement.replaceAll(`\`${from}\``, `\`${to}\``);
      if (replacement !== line) append(record.reference, { kind: "text", document: record.reference, line: index + 1, replacement });
    }
  }
}

function reportOwner(reference: RecordReference): RenameReportRecord {
  const owner = reference.owner;
  if ((owner.type !== "work-item" && owner.type !== "cohort") || owner.uid === undefined) throw new Error("Rename repairs require an exact owner UID.");
  return { type: owner.type === "cohort" ? "cohort" : "work-unit", name: owner.name, uid: owner.uid };
}
