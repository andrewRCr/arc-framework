/** Real repository fixtures for tracked writer behavior and canonical store comparisons. */
import { onTestFinished } from "vitest";
import { createTempRepo, cleanupTempDir, makeGitExec, makeGitExecInput } from "../integration.js";
import { testStorePorts } from "./in-repo-ports.js";
import { createStore } from "../../../src/lib/store/create.js";
import { withTrackedWriteLock } from "../../../src/lib/store/tracked-lock.js";
import { OwnerIdentitySchema, RecordReferenceSchema, RecordVersionSchema } from "../../../src/lib/store/identity.js";
import { canonicalDigest, digestBytes } from "../../../src/lib/kernel/canonical/canonical-json.js";
import { createCandidateAttestation, createCandidateSubjectSnapshot } from "../../../src/lib/work-unit/candidate-attestation.js";
import type { KindId } from "../../../src/lib/store/catalog.js";

/** Open an independently cleaned repository with actual filesystem and checkout write locks.
 * @returns Explicit writer dependencies and role-based reference constructors.
 */
export async function trackedWriteFixture() {
  const root = await createTempRepo("arc-tracked-writer-");
  onTestFinished(async () => cleanupTempDir(root));
  const exec = makeGitExec(root);
  const ports = testStorePorts(root, exec, makeGitExecInput(root));
  ports.clock = () => new Date();
  ports.locks.tracked = (operation) => withTrackedWriteLock({ exec, checkoutRoot: root }, operation);
  return { root, exec, ports, store: createStore(ports),
    reference: (kind: KindId, name = "example", key?: string) => RecordReferenceSchema.parse({ kind,
      owner: OwnerIdentitySchema.parse({ type: "work-item", name }), ...(key === undefined ? {} : { key }) }) };
}
/** Compute the mutation basis of exact persisted bytes.
 * @param content - Whole record file content.
 * @returns Branded record version of those bytes.
 */
export function trackedDigest(content: string) { return RecordVersionSchema.parse(digestBytes(Buffer.from(content))); }
/** Build a valid Candidate using the producer's subject and attestation constructors.
 * @param workUnit - Owning work-unit slug.
 * @returns A canonical-schema Candidate managed record.
 */
export function candidateFixture(workUnit = "example") {
  const subject = createCandidateSubjectSnapshot([{ path: "src/example.ts", mode: "100644", digest: canonicalDigest({ value: 1 }), treatment: "reviewable" }]);
  return { schemaVersion: 1 as const, semanticsVersion: "candidate-attestation/v1" as const,
    attestation: createCandidateAttestation({ workUnit, subject, baseRevision: "a".repeat(40), attestedBy: "andrew",
      attestedAt: "2026-08-12T14:00:00.000Z", verificationEvidenceRef: "tasks-example.md#verification" }),
    subject, transitions: [], lineageAttestations: [] };
}
/** A current or legacy publication boundary accepted by the existing parser.
 * @param workUnit - Owning work-unit slug.
 * @returns The producer's JSON input shape, before canonical upgrade.
 */
export function boundaryFixture(workUnit = "example") {
  return { schemaVersion: 1, mode: "integration-boundary", workUnit, candidateId: `sha256:${"a".repeat(64)}`,
    candidateSubjectDigest: null, locus: "candidate-review-pending", nextAction: { kind: "run-self-review",
      command: "arc review pre-publication example", interactionText: "Run or resume pre-publication review." },
    policy: null, reservation: null, terminus: null, deliveryReviewTermini: [] };
}

/** Bind writer ports to another checkout of the same real repository.
 * @param root - Existing checkout to own these filesystem paths and locks.
 * @returns A fresh public store targeting that checkout alone.
 */
export function trackedCheckoutStore(root: string) {
  const exec = makeGitExec(root);
  const ports = testStorePorts(root, exec, makeGitExecInput(root));
  ports.clock = () => new Date();
  ports.locks.tracked = (operation) => withTrackedWriteLock({ exec, checkoutRoot: root }, operation);
  return createStore(ports);
}
