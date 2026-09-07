/** Shared refusal and error vocabulary for Errand command results. */

import { z } from "zod";

export const ErrandResultOperationSchema = z.enum([
  "errand-open",
  "errand-link",
  "errand-leave",
  "errand-close",
  "errand-abandon",
  "errand-materialize",
  "errand-promote",
]);

export const ErrandRefusalReasonSchema = z.enum([
  "primary-occupied",
  "primary-dirty",
  "primary-off-base",
  "topology-unknown",
  "duplicate-locus",
  "checkout-missing",
  "role-conflict",
  "full-protection-required",
  "remote-unreachable",
  "identity-conflict",
  "change-request-open",
  "change-request-unverifiable",
  "partial-handoff-forbidden",
  "preservation-unproven",
  "inbox-link-conflict",
  "work-unit-name-taken",
  "promotion-source-invalid",
  "stub-ambiguous",
  "authority-unresolved",
  "generation-mismatch",
]);

export const ErrandErrorStageSchema = z.enum([
  "base",
  "base-ref",
  "basis",
  "change-request",
  "cleanup",
  "config",
  "failed",
  "frame",
  "handler",
  "host",
  "inbox",
  "input",
  "occupancy",
  "preservation",
  "protection",
  "provision",
  "push",
  "recover",
  "recovery",
  "refs",
  "resume",
  "resume-proof",
  "rollback",
  "state",
  "topology",
  "transform",
  "write",
  "ancestry",
  "fetch",
  "local-branch",
  "local-head",
  "remote-head",
  "identity",
  "identity-basis",
  "identity-cleanup",
  "identity-fetch",
  "identity-push",
  "identity-read",
  "identity-retire",
  "identity-transform",
  "identity-write",
  "pause-ancestry",
  "pause-cleanup",
  "pause-fetch",
  "pause-local-head",
  "pause-remote-head",
]);

export type ErrandErrorStage = z.infer<typeof ErrandErrorStageSchema>;
export type ErrandErrorCode = `locus.${z.infer<typeof ErrandResultOperationSchema>}.${ErrandErrorStage}`;

/** Compose the stable public error code for one Errand operation stage. */
export function errandErrorCode(
  operation: z.infer<typeof ErrandResultOperationSchema>,
  stage: ErrandErrorStage,
): ErrandErrorCode {
  return `locus.${operation}.${stage}`;
}

export const ErrandErrorCodeSchema = z.custom<ErrandErrorCode>(
  (value) => {
    if (typeof value !== "string") return false;
    const segments = value.split(".");
    return segments.length === 3
      && segments[0] === "locus"
      && ErrandResultOperationSchema.safeParse(segments[1]).success
      && ErrandErrorStageSchema.safeParse(segments[2]).success;
  },
  { error: "Error code must be `locus.<errand-operation>.<stage>`" },
);

export type ErrandRefusalReason = z.infer<typeof ErrandRefusalReasonSchema>;
