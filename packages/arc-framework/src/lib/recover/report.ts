/** Runtime authority for the complete recovery-audit report wire shape. */

import { z } from "zod";

import { SessionRecoverProbeResultSchema } from "../../commands/status/schema.js";
import {
  COMPACTION_SEED_LOCUS_HINT_FIELDS,
  COMPACTION_SEED_SCHEMA_VERSION,
  CompactionSeedLocusHintSchema,
} from "../compaction-seed/schema.js";
import { RecoveryAuditVerdictSchema } from "./audit.js";
import { assertSessionEnvelopeContract } from "../session-envelope/validation.js";

const NON_EMPTY_TEXT = z.string().refine((value) => value.trim().length > 0, "value must not be empty");

/** Compaction-seed identity fields surfaced by recovery reports. */
export const RecoverAuditSeedSummarySchema = z.strictObject({
  schemaVersion: z.literal(COMPACTION_SEED_SCHEMA_VERSION),
  emittedAt: NON_EMPTY_TEXT,
  head: NON_EMPTY_TEXT,
  branch: NON_EMPTY_TEXT,
  sessionType: z.enum(["planning", "execution", "integration"]).nullable(),
  locus: CompactionSeedLocusHintSchema,
});

const RecoverAuditReportObjectSchema = z.strictObject({
  mode: z.literal("recover-audit"),
  seedPath: NON_EMPTY_TEXT.nullable(),
  seed: RecoverAuditSeedSummarySchema.nullable(),
  recover: SessionRecoverProbeResultSchema.nullable(),
  verdict: RecoveryAuditVerdictSchema,
});

/** Complete recovery-audit report with early-stop/live-state coherence. */
export const RecoverAuditReportSchema = RecoverAuditReportObjectSchema.superRefine((value, context) => {
  if (value.seedPath === null && (value.seed !== null || value.recover !== null)) {
    context.addIssue({
      code: "custom",
      path: ["seedPath"],
      message: "seed and recovery state require a resolved seed path",
    });
  }
  if (value.seed === null && value.recover !== null) {
    context.addIssue({
      code: "custom",
      path: ["recover"],
      message: "recovery state requires a valid seed summary",
    });
  }
  if (value.recover === null && value.verdict.status === "ready") {
    context.addIssue({
      code: "custom",
      path: ["recover"],
      message: "ready reports require a recovery envelope",
    });
  }
  if (value.verdict.status === "ready" && value.seed === null) {
    context.addIssue({
      code: "custom",
      path: ["seed"],
      message: "ready reports require a seed summary",
    });
  }
  if (value.verdict.status === "ready" && value.seed !== null) {
    const comparison = value.verdict.locusHint;
    if (comparison === null) {
      context.addIssue({
        code: "custom",
        path: ["verdict", "locusHint"],
        message: "ready reports with a seed locus require a fresh locus comparison",
      });
    } else if (!sameLocusHint(comparison.expected, value.seed.locus)) {
      context.addIssue({
        code: "custom",
        path: ["verdict", "locusHint"],
        message: "ready locus comparison must match the seed locus",
      });
    }
  }
});

function sameLocusHint(
  left: z.infer<typeof CompactionSeedLocusHintSchema> | null,
  right: z.infer<typeof CompactionSeedLocusHintSchema>,
): boolean {
  return left !== null
    && COMPACTION_SEED_LOCUS_HINT_FIELDS.every((field) => left[field] === right[field]);
}

/** Recovery-audit report derived from its complete runtime authority. */
export type RecoverAuditReport = z.infer<typeof RecoverAuditReportSchema>;

/** Validate a recovery-audit report for effect while retaining its original object. */
export function assertRecoverAuditReport(value: unknown): asserts value is RecoverAuditReport {
  assertSessionEnvelopeContract("recovery-audit-report", RecoverAuditReportSchema, value);
}
