/** Closed carried-map and reauthoring reports for a read-only revision starter. */
import { z } from "zod";
import { CutMapSchema, CutMapStarterSchema } from "./cut-map-schema.js";
import { CutCompletedAuthoringSchema } from "./cut-map-authoring.js";
import { CutMapIssueCodeSchema } from "./cut-map-issues.js";

/** A machine mismatch or the precise completed-map rule that prevents carrying authoring. */
export const DecomposeRevisionReasonSchema = z.union([z.enum([
  "source-identity", "planning-profile", "source-units", "source-unit-ambiguous", "incoming-edges", "outgoing-edges",
]), CutMapIssueCodeSchema]);
/** Full authoring preserved either in a compatible map or beside fresh author slots. */
export const DecomposeRevisionStarterReportSchema = z.discriminatedUnion("status", [
  z.strictObject({ status: z.literal("carried"), map: CutMapSchema }),
  z.strictObject({ status: z.literal("reauthor"), reason: DecomposeRevisionReasonSchema, locus: z.string().min(1),
    starter: CutMapStarterSchema, storedAuthoring: CutCompletedAuthoringSchema }),
]);
/** The complete read-only revision result. */
export type DecomposeRevisionStarterReport = z.infer<typeof DecomposeRevisionStarterReportSchema>;
/** The first boundary where the existing authoring must be reconsidered. */
export type DecomposeRevisionMismatch = Pick<Extract<DecomposeRevisionStarterReport, { status: "reauthor" }>, "reason" | "locus">;
