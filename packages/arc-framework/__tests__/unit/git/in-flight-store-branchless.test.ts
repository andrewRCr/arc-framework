/** Branchless grooming membership reaches both public discovery and code overlap. */
import { expect, it } from "vitest";
import { runActiveInFlight } from "../../../src/commands/active/in-flight.js";
import { runStoreErrandOverlap } from "../../../src/lib/errand/store-overlap.js";
import { TransientIdentityRecordSchema } from "../../../src/lib/errand/identity-record.js";
import { DerivedLocusFrameSchema } from "../../../src/lib/locus/derived-schema.js";
import { projectDerivedCheckoutRow } from "../../../src/lib/locus/derived-roster.js";
import { markerIdentitySnapshot, projectStoreIdentityDiscovery, readStoreIdentityEvidence } from "../../../src/lib/locus/store-identities.js";
import { OwnerIdentitySchema, recordReferences } from "../../../src/lib/store/identity.js";
import type { DormantMarkerGenerationEvidence } from "../../../src/lib/locus/derived-lifecycle-evidence.js";
import { createLifecycleHarness } from "../../helpers/store/lifecycle-harness.js";
import { scriptGitExec } from "../../helpers/git-exec-fake.js";

async function fixture(markerClaimId = "a".repeat(32)) {
  const h = createLifecycleHarness(); h.store.environment.identity = "alice";
  const slug = "groom-alpha", claimId = "a".repeat(32);
  const record = TransientIdentityRecordSchema.parse({ version: 3, kind: "groom", protection: "partial", slug, claimId,
    branch: null, anchorStub: "alpha", members: ["alpha"], openedBaseHead: "b".repeat(40), state: "open",
    changeRequest: null, createdAt: "2026-10-14T00:00:00Z", updatedAt: "2026-10-14T00:00:00Z" });
  await h.seed(recordReferences["claims/groom"](OwnerIdentitySchema.parse({ type: "person", name: "alice" }), slug), JSON.stringify(record));
  const evidence = await readStoreIdentityEvidence(h.store, "alice");
  const marker: DormantMarkerGenerationEvidence = { kind: "present", generation: "generation", marker: {
    spawnedByArc: false, provisioning: "ready", createdFor: { kind: "groom", slug, claimId: markerClaimId },
  } };
  const identities = await markerIdentitySnapshot(evidence, marker, h.store);
  const common = { activeMeta: { kind: "absent" } as const, completed: { status: "available", records: new Map() } as const,
    identities, primarySafety: { kind: "error", message: "Not selected for allocation" } as const };
  const holder = projectDerivedCheckoutRow({ ...common, marker,
    checkout: { path: "/holder", branch: "main", head: "b".repeat(40), detached: false, primary: true, folderPresent: true } });
  const caller = projectDerivedCheckoutRow({ ...common, marker: { kind: "absent" },
    checkout: { path: "/caller", branch: "chore/caller", head: "c".repeat(40), detached: false, primary: false, folderPresent: true } });
  const frame = DerivedLocusFrameSchema.parse({ roster: [holder, caller], entering: { kind: "selected", row: caller },
    primaryAvailability: holder.kind === "transient" ? { kind: "occupied", checkoutPath: "/holder", subject: holder.subject }
      : { kind: "unsafe", checkoutPath: "/holder", reasons: holder.diagnostics.map(item => item.message) },
    identityDiscovery: projectStoreIdentityDiscovery(evidence, [holder, caller]), active: null });
  return { ...h, frame, holder, slug };
}

it("lists an open partial grooming claim without inventing a branch or missing-branch residue", async () => {
  const h = await fixture();
  expect(h.holder).toMatchObject({ kind: "transient", subject: { kind: "groom", key: h.slug }, diagnostics: [] });
  const fake = scriptGitExec([{ match: { prefix: ["for-each-ref"] }, responses: [{ stdout: "" }] }]);
  const result = await runActiveInFlight({ store: h.store, exec: fake.exec, identity: "alice", teamMode: false,
    localOnly: true, projectId: async () => "project", roster: h.frame.roster });
  expect(result.entries).toEqual([{ kind: "errand", slug: h.slug, owner: "alice", worktreePath: "/holder", remoteOnly: false }]);
  expect(result).toMatchObject({ residue: [] });
  expect(result.warnings).toEqual([]);
});

it("keeps a branchless claim without borrowing a checkout from another marker generation", async () => {
  const h = await fixture("d".repeat(32));
  const fake = scriptGitExec([{ match: { prefix: ["for-each-ref"] }, responses: [{ stdout: "" }] }]);
  const result = await runActiveInFlight({ store: h.store, exec: fake.exec, identity: "alice", teamMode: false,
    localOnly: true, projectId: async () => "project", roster: h.frame.roster });
  expect(result.entries).toEqual([{ kind: "errand", slug: h.slug, owner: "alice", remoteOnly: false }]);
  expect(result).toMatchObject({ residue: [] });
});

it("reports code overlap from the exact branchless grooming checkout", async () => {
  const h = await fixture();
  const fake = scriptGitExec([
    { match: { prefix: ["for-each-ref"] }, responses: [{ stdout: "" }] },
    { match: ["rev-parse", "--verify", "origin/main"], responses: [{ stdout: "b".repeat(40) }] },
    { match: ["rev-parse", "--verify", "HEAD"], responses: [{ stdout: "b".repeat(40) }] },
    { match: ["rev-parse", "--verify", "--quiet", "MERGE_HEAD"], responses: [{ failure: { exitCode: 1 } }] },
    { match: ["status", "--porcelain", "--", "src/shared.ts"], responses: [{ stdout: " M src/shared.ts\n" }] },
  ]);
  const result = await runStoreErrandOverlap({ store: h.store, exec: fake.exec, cwd: "/caller", identity: "alice",
    teamMode: false, baseBranch: "main", projectId: async () => "project", readFrame: async () => h.frame, targetPaths: ["src/shared.ts"] });
  expect(result.result.overlaps).toEqual([{ workItem: h.slug, worktreePath: "/holder", matchedPaths: ["src/shared.ts"] }]);
  expect(result.warnings).toEqual([]);
});
