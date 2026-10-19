/** Errand terminal fixtures derived from the independent acquisition/frame providers. */
import { createLifecycleHarness } from "./store/lifecycle-harness.js";
import { OwnerIdentitySchema, recordReferences } from "../../src/lib/store/identity.js";
import { SlugSchema } from "../../src/lib/kernel/index.js";
import { TransientIdentityRecordV3Schema, serializeTransientIdentityRecord } from "../../src/lib/errand/identity-record.js";
import { acquireDerivedLocusEvidence, type DerivedLocusEvidenceIO } from "../../src/lib/locus/derived-evidence.js";
import { readDerivedLocusFrame } from "../../src/lib/locus/derived-reader.js";
import type { SubjectMetaIO } from "../../src/lib/locus/subject-meta.js";
import type { WorktreeMarker } from "../../src/lib/git/worktree-marker.js";
const subjectMetaIO: SubjectMetaIO = {
  readFile: async () => { throw new Error("Unexpected checkout metadata"); }, pathExists: async () => false,
  realpath: async path => path, lstat: async () => ({ isSymbolicLink: () => false }),
  projectCandidateTarget: async () => { throw new Error("No Candidate"); },
  readPendingCandidateReviewFixAuthority: async () => ({ status: "none" }), projectDeliveryCorrection: async () => ({ status: "none" }),
};
/** Open a UID-carrying Errand and derive its checkout from the exact marker claim. */
export async function terminalStoreFixture() {
  const h = createLifecycleHarness(); h.store.environment.identity = "alice";
  const record = TransientIdentityRecordV3Schema.parse({ version: 3, kind: "errand", purpose: "errand", slug: "repair", claimId: "a".repeat(32),
    intent: "Repair it", owner: "alice", branch: "chore/repair", createdAt: "2026-10-16T00:00:00Z", updatedAt: "2026-10-16T00:00:00Z",
    origin: "description", originEntry: null, state: "open", savedHead: null, changeRequest: null });
  if (record.kind !== "errand" || record.purpose !== "errand") throw new Error("Expected ordinary Errand");
  const saved = await h.seed(recordReferences["work-item/record"](OwnerIdentitySchema.parse({ type: "work-item", name: "repair" })),
    serializeTransientIdentityRecord(record), { kind: "active" });
  const subject = { kind: "errand" as const, slug: record.slug, claimId: record.claimId };
  const marker: WorktreeMarker = { spawnedByArc: true, spawningIdentity: "alice", createdAt: record.createdAt,
    parentCheckoutPath: "/repo", createdFor: { kind: "errand", slug: record.slug, claimId: record.claimId }, provisioning: "ready" };
  const io: DerivedLocusEvidenceIO = {
    store: h.store, projectId: async () => "project-id",
    scanWorktrees: async () => ({ ok: true, worktrees: [
      { path: "/repo", head: "b".repeat(40), primary: true, detached: false, branch: "main", folderPresent: true },
      { path: "/repo/repair", head: "c".repeat(40), primary: false, detached: false, branch: record.branch, folderPresent: true },
    ] }),
    readMarker: async cwd => cwd === "/repo/repair" ? { kind: "present", marker, bytes: Buffer.from(`${JSON.stringify(marker, null, 2)}\n`) } : { kind: "absent" },
    listDirectory: async () => [], readText: async () => { throw new Error("Checkout state is not authoritative"); },
    readArchivedMeta: async () => ({ kind: "absent" }), readCompleted: async () => ({ status: "available", records: new Map() }),
    readIdentities: async () => { throw new Error("Legacy snapshot must not serve the store arm"); },
    readPrimarySafety: async () => ({ kind: "complete", clean: true, onBase: true }), canonicalizePath: async path => path,
  };
  return { ...h, saved, record, subject, io, async frame(enteringCheckoutPath = "/repo/repair") {
    const evidence = await acquireDerivedLocusEvidence({ identity: SlugSchema.parse("alice"), io });
    if (evidence.kind !== "complete") throw new Error("Expected topology");
    return readDerivedLocusFrame({ ...evidence, store: h.store, identity: "alice", enteringCheckoutPath,
      canonicalizePath: async path => path, subjectMetaIO });
  } };
}
