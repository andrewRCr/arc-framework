/** Pure schema and decoding for persisted pre-publication replay inputs. */
import { z } from "zod";
import { RecordVersionSchema } from "../../../lib/store/identity.js";
import { canonicalize } from "../../../lib/kernel/canonical/canonical-json.js";
import { ReviewLaneJudgmentSchema } from "./review-policy-driver.js";
import { PrePublicationLaneJudgmentsSchema } from "./pre-publication-request.js";
import { CanonicalDigestSchema } from "../../../lib/kernel/index.js";
import { GitObjectIdSchema, ReviewTargetSchema } from "../core/gate-contract-v2-schema.js";

export const AttestationOrderingRecoverySchema = z.strictObject({
  candidateId: CanonicalDigestSchema,
  candidateSubjectDigest: CanonicalDigestSchema,
  reviewedHead: GitObjectIdSchema,
  currentHead: GitObjectIdSchema,
  expectedBoundaryVersion: RecordVersionSchema,
});
export const PrePublicationReplayInputSchema = z.strictObject({
  candidateId: CanonicalDigestSchema.optional(),
  candidateSubjectDigest: CanonicalDigestSchema.optional(),
  selfReview: z.literal("settled").optional(),
  changeSet: z.json().optional(),
  lanes: z.json().optional(),
  scopeJudgmentTarget: ReviewTargetSchema.optional(),
  frontlineCeilingHeadSha: GitObjectIdSchema.optional(),
  attestationOrderingRecovery: AttestationOrderingRecoverySchema.optional(),
}).refine(
  (replay) => (replay.candidateId === undefined) === (replay.candidateSubjectDigest === undefined),
  "Candidate replay identity requires both Candidate ID and subject digest",
);
export type PrePublicationReplayInput = z.infer<typeof PrePublicationReplayInputSchema>;

/** Decode the selected backend contract while retaining the repository replay shape for orchestration. */
export function decodePrePublicationReplay(token: string, schemaVersion: 1 | 2 = 1): PrePublicationReplayInput {
  if (schemaVersion === 2) return PrePublicationReplayInputSchema.parse(decodePrePublicationReplayV2(token));
  return PrePublicationReplayInputSchema.parse(JSON.parse(Buffer.from(token, "base64url").toString("utf8")));
}

/** Read the exact opaque token from its persisted pre-publication command. */
export function replayTokenFromAction(command: string, workUnit: string): string {
  const argv = command.split(" ");
  if (argv.length !== 6
    || argv[0] !== "arc"
    || argv[1] !== "review"
    || argv[2] !== "pre-publication"
    || argv[3] !== workUnit
    || argv[4] !== "--resume") {
    throw new Error("The pending post-attest continuation has no exact opaque replay command.");
  }
  return z.string().regex(/^[A-Za-z0-9_-]+$/u).parse(argv[5]);
}


const ReplayCallLaneSchema = ReviewLaneJudgmentSchema.unwrap().pick({ scopeMode: true, invocation: true });
const ReplayCallLanesSchema = PrePublicationLaneJudgmentsSchema.pipe(z.strictObject({
  frontline: ReplayCallLaneSchema.optional(), standard: ReplayCallLaneSchema.optional(),
}));
export const AttestationOrderingRecoveryV2Schema = AttestationOrderingRecoverySchema.extend({
  expectedBoundaryVersion: RecordVersionSchema,
});
export const PrePublicationReplayInputV2Schema = z.strictObject({
  candidateId: CanonicalDigestSchema.optional(), candidateSubjectDigest: CanonicalDigestSchema.optional(),
  selfReview: z.literal("settled").optional(), changeSet: z.json().optional(),
  lanes: ReplayCallLanesSchema.optional(), scopeJudgmentTarget: ReviewTargetSchema.optional(),
  attestationOrderingRecovery: AttestationOrderingRecoveryV2Schema.optional(),
}).refine((replay) => (replay.candidateId === undefined) === (replay.candidateSubjectDigest === undefined),
  "Candidate replay identity requires both Candidate ID and subject digest");
export type PrePublicationReplayInputV2 = z.infer<typeof PrePublicationReplayInputV2Schema>;

/** Encode caller-owned inputs with opaque store ordering versions and no saved review decisions. */
export function encodePrePublicationReplayV2(input: unknown): string {
  return Buffer.from(canonicalize(PrePublicationReplayInputV2Schema.parse(input)), "utf8").toString("base64url");
}

/** Decode a store-backed continuation under its strict caller-input schema. */
export function decodePrePublicationReplayV2(token: string): PrePublicationReplayInputV2 {
  return PrePublicationReplayInputV2Schema.parse(JSON.parse(Buffer.from(token, "base64url").toString("utf8")));
}


/** Encode the selected replay contract without carrying native review decisions in a continuation. */
export function encodePrePublicationReplay(input: unknown, schemaVersion: 1 | 2 = 1): string {
  if (schemaVersion === 2) return encodePrePublicationReplayV2(input);
  return Buffer.from(canonicalize(PrePublicationReplayInputSchema.parse(input)), "utf8").toString("base64url");
}
