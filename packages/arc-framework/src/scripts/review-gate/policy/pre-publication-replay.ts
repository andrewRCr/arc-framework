/** Pure schema and decoding for persisted pre-publication replay inputs. */
import { z } from "zod";
import { CanonicalDigestSchema } from "../../../lib/kernel/index.js";
import { GitObjectIdSchema, ReviewTargetSchema } from "../core/gate-contract-v2-schema.js";

export const AttestationOrderingRecoverySchema = z.strictObject({
  candidateId: CanonicalDigestSchema,
  candidateSubjectDigest: CanonicalDigestSchema,
  reviewedHead: GitObjectIdSchema,
  currentHead: GitObjectIdSchema,
  expectedBoundaryVersion: CanonicalDigestSchema,
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

/** Decode the legacy opaque replay payload with its original validation. */
export function decodePrePublicationReplay(token: string): PrePublicationReplayInput {
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

