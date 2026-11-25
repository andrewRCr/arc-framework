/** Produce a checkout frame from actual marker bytes and checked operational records. */
import { acquireDerivedLocusEvidence, type DerivedLocusEvidenceIO } from "../../../src/lib/locus/derived-evidence.js";
import { readDerivedLocusFrame } from "../../../src/lib/locus/derived-reader.js";
import type { SubjectMetaIO } from "../../../src/lib/locus/subject-meta.js";
import type { Store } from "../../../src/lib/store/contract.js";
import { readWorktreeMarkerGeneration } from "../../../src/lib/git/worktree-marker.js";

export async function claimFrame(store: Store, cwd: string) {
  const io: DerivedLocusEvidenceIO = { store, projectId: async () => "project", archiveCadence: "manual",
    scanWorktrees: async () => ({ ok: true, worktrees: [{ path: cwd, head: "a".repeat(40), branch: null,
      detached: true, primary: true, folderPresent: true }] }), canonicalizePath: async path => path,
    readMarker: readWorktreeMarkerGeneration,
    listDirectory: async () => { throw new Error("No checkout metadata"); }, readText: async () => { throw new Error("No checkout metadata"); },
    readArchivedMeta: async () => ({ kind: "absent" }), readIdentities: async () => ({ kind: "absent" }),
    readCompleted: async () => ({ status: "available", records: new Map() }),
    readPrimarySafety: async () => ({ kind: "complete", clean: true, onBase: true }) };
  const subjectMetaIO: SubjectMetaIO = { readFile: async () => { throw new Error("No checkout metadata"); },
    pathExists: async () => false, realpath: async path => path, lstat: async () => ({ isSymbolicLink: () => false }),
    projectCandidateTarget: async () => { throw new Error("No Candidate"); },
    readPendingCandidateReviewFixAuthority: async () => ({ status: "none" }), projectDeliveryCorrection: async () => ({ status: "none" }) };
  const evidence = await acquireDerivedLocusEvidence({ identity: "live-owner", io });
  if (evidence.kind !== "complete") throw new Error("Expected complete topology evidence");
  return readDerivedLocusFrame({ ...evidence, store, enteringCheckoutPath: cwd, identity: "live-owner",
    canonicalizePath: async path => path, subjectMetaIO });
}
