/** Ordered authored repairs and retained branches reported by a logical rename. */
import type { RecordReference } from "../store/identity.js";
import type { Remedy } from "../store/refusal.js";
import type { CohortHoldingEdit } from "../store/kinds/cohort/holding-edits.js";

/** Exact owner of a reference that needs an authored repair. */
export type RenameReportRecord = CohortHoldingEdit["record"];

/** One concrete field, command, or document repair. */
export type RenameReferenceEdit =
  | ({ kind: "field" } & Omit<CohortHoldingEdit, "record">)
  | { kind: "field"; field: "dependsOn" | "waitsOn"; from: string; to: string }
  | { kind: "command"; argv: readonly string[] }
  | { kind: "text"; document: RecordReference; line: number; replacement: string };

/** Document edits carry no executable command. */
export interface RenameHeadingEdit { document: RecordReference; line: number; replacement: string }

/** Why a recorded link or published old branch remains after this invocation. */
export interface RenameKeptBranch {
  branch: string;
  reason: "adopted" | "another-holder" | "continuation" | "other-link";
  catchUp?: Remedy;
}

/** Array order and edit order are repair order; the same record may appear again. */
export interface RenameReport {
  references: readonly { record: RenameReportRecord; edits: readonly RenameReferenceEdit[] }[];
  memberHeadings: readonly RenameHeadingEdit[];
  formerSlugTies: readonly { slug: string; condition: string; remedy: Remedy }[];
  keptBranches: readonly RenameKeptBranch[];
}

/** Create an independent empty report for a rename with no authored repairs. */
export function emptyRenameReport(): RenameReport {
  return { references: [], memberHeadings: [], formerSlugTies: [], keptBranches: [] };
}
