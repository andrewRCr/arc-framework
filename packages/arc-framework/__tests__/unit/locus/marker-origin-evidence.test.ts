/** Marker provenance and origin bindings survive reader-owned evidence projection. */
import { expect, it } from "vitest";
import { isWorktreeMarker, type WorktreeMarker } from "../../../src/lib/git/worktree-marker.js";
import { acquireDerivedLocusEvidence, type DerivedLocusEvidenceIO } from "../../../src/lib/locus/derived-evidence.js";

async function acquire(marker: WorktreeMarker) {
  if (!isWorktreeMarker(marker)) throw new Error("Invalid marker fixture");
  const bytes = Buffer.from(`${JSON.stringify(marker, null, 2)}\n`);
  const io: DerivedLocusEvidenceIO = {
    scanWorktrees: async () => ({ ok: true, worktrees: [{ folderPresent: true, path: "/repo", head: "a".repeat(40),
      branch: "main", detached: false, primary: true }] }),
    listDirectory: async () => [], readArchivedMeta: async () => ({ kind: "absent" }),
    readText: async () => "", readMarker: async () => ({ kind: "present", marker, bytes }),
    readIdentities: async () => ({ kind: "absent" }),
    readCompleted: async () => ({ status: "available", records: new Map() }),
    readPrimarySafety: async () => ({ kind: "complete", clean: true, onBase: true }),
    canonicalizePath: async (path) => path,
  };
  return acquireDerivedLocusEvidence({ identity: "andrew", io });
}

it("retains an anchored work-unit marker's own spawn provenance", async () => {
  const marker: WorktreeMarker = { spawnedByArc: false, createdFor: { kind: "work-unit", name: "demo" },
    spawningIdentity: "andrew", createdAt: "2026-10-16T00:00:00.000Z" };
  expect(await acquire(marker)).toMatchObject({ kind: "complete", checkouts: [{ marker: { kind: "present", marker: {
    spawnedByArc: false, createdFor: { kind: "work-unit", name: "demo" },
  } } }] });
});

it("retains a partial Errand's version-bound origin in acquired marker evidence", async () => {
  const marker: WorktreeMarker = { spawnedByArc: false, createdFor: { kind: "partial-errand", slug: "repair", claimId: null },
    provisioning: "ready", originEntry: "personal:abcd1234", originEntryVersion: "v1:0123456789abcdef",
    spawningIdentity: "andrew", createdAt: "2026-10-16T00:00:00.000Z" };
  expect(await acquire(marker)).toMatchObject({ kind: "complete", checkouts: [{ marker: { kind: "present", marker: {
    originEntry: "personal:abcd1234", originEntryVersion: "v1:0123456789abcdef",
  } } }] });
});
