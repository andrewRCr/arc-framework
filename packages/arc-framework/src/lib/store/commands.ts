/** Results and validated inputs owned by the explicit ref-store commands. */

import { z } from "zod";
import { RecordReferenceSchema } from "./identity.js";
import { RemedySchema, StoreRefusalSchema } from "./refusal.js";

/** A complete account of the refs and source records a move examined. */
export const MigrateReportSchema = z.strictObject({
  move: z.enum(["layout", "remote", "import"]),
  refs: z.array(z.strictObject({ ref: z.string().min(1), scope: z.enum(["project", "identity"]),
    person: z.string().min(1).optional(), action: z.enum(["copy", "merge", "create", "delete"]) })),
  refused: z.array(z.strictObject({ reference: RecordReferenceSchema, rule: z.string().min(1) })),
  brokenChains: z.array(z.strictObject({ reference: RecordReferenceSchema, condition: z.string().min(1) })),
  reviewMapping: z.array(z.strictObject({ source: z.string().min(1), outcome: z.enum(["mapped", "left-behind", "in-flight"]),
    reason: z.string().min(1).optional(), records: z.array(RecordReferenceSchema) })),
  differingNotes: z.array(z.strictObject({ person: z.string().min(1), path: z.string().min(1), kind: z.enum(["differs", "snapshot-only", "disk-only"]) })),
  notices: z.array(z.strictObject({ condition: z.string().min(1), remedy: RemedySchema.optional() })),
});
/** A move's complete build and recovery report. */
export type MigrateReport = z.infer<typeof MigrateReportSchema>;

const explained = { condition: z.string().min(1), remedy: RemedySchema };
/** Command refusals remain separate from the storage operation's closed refusal vocabulary. */
export const StoreCommandRefusalSchema = z.discriminatedUnion("code", [
  z.strictObject({ code: z.enum(["unsupported", "request-invalid"]), class: z.literal("terminal"), ...explained }),
  z.strictObject({ code: z.enum(["no-state-remote", "role-conflict", "move-incomplete", "move-unfinished",
    "move-record-malformed", "moved", "follow-refused"]), class: z.literal("recoverable"), ...explained }),
  z.strictObject({ code: z.literal("import-refused"), class: z.literal("recoverable"), ...explained, report: MigrateReportSchema }),
  z.strictObject({ code: z.literal("store"), refusal: StoreRefusalSchema }),
]);
/** An explicit command's refusal, preserving a store refusal unchanged in its own arm. */
export type StoreCommandRefusal = z.infer<typeof StoreCommandRefusalSchema>;
/** Shared success/refusal envelope for the ref-store command entries. */
export type StoreCommandResult<T> = { status: "ok"; result: T } | { status: "refused"; refusal: StoreCommandRefusal };

/** The hidden migrate command's input, also used by interrupted-move recovery. */
export const StoreMigrateInputSchema = z.strictObject({
  to: z.string().min(1).optional(), trial: z.boolean().optional(), leaveSource: z.boolean().optional(), import: z.boolean().optional(),
});
/** Requested move or no-target reconciliation. */
export type StoreMigrateInput = z.infer<typeof StoreMigrateInputSchema>;
/** Roles may be inspected without selecting a remote or changed by one explicit setting. */
export const StoreRemoteInputSchema = z.strictObject({
  remote: z.string().min(1).optional(), role: z.enum(["push", "read", "off"]).optional(), ownState: z.boolean().optional(),
});
/** A role inspection or setting. */
export type StoreRemoteInput = z.infer<typeof StoreRemoteInputSchema>;
/** Clone-local roles and the layout move a setting performed, if any. */
export interface StoreRemoteView {
  remotes: { name: string; role?: "push" | "read" | "off"; url: string; repository: "code" | "backing" }[];
  report?: MigrateReport;
}
/** A follow asks about a destination without performing a synchronous prompt. */
export interface StoreDesignationQuestion {
  status: "designation-needed"; remote: string; choices: ("push" | "read" | "off")[]; remedy: z.infer<typeof RemedySchema>;
}
/** A setting that needs explicit publication authority carries what accepting it publishes. */
export interface StoreRemoteConfirmation {
  status: "confirmation-needed"; repository: string; condition: string; remedy: z.infer<typeof RemedySchema>;
}
/** The migrate entry's complete result. */
export type StoreMigrateResult = StoreCommandResult<MigrateReport> | StoreDesignationQuestion;
/** The remote entry's complete result. */
export type StoreRemoteResult = StoreCommandResult<StoreRemoteView> | StoreRemoteConfirmation;
