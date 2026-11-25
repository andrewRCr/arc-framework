/** Store migration behavior through production store and runtime boundaries. */
import { expect, it } from "vitest";
import { deriveStoreInFlight } from "../../../src/lib/git/in-flight-store.js";
import { createLifecycleHarness, lifecycleSuccess } from "../../helpers/store/lifecycle-harness.js";
import { scriptGitExec } from "../../helpers/git-exec-fake.js";
import { OwnerIdentitySchema, recordReferences } from "../../../src/lib/store/identity.js";
import { serializeTransientIdentityRecord, TransientIdentityRecordV3Schema } from "../../../src/lib/errand/identity-record.js";
it("derives branchless and paused work from active placement, retaining local tips and old refs only as residue", async () => {
  const h = createLifecycleHarness();
  await h.seedMeta("planning", { state: "Planning", currentWorkflow: "draft-design" });
  const paused = await h.seedMeta("paused", {}, { kind: "active" },
    { branches: [{ repository: "project", ref: "feat/paused", linkedAs: "created", excluded: [] }] });
  lifecycleSuccess(await h.store.write({ action: "put", reference: paused.reference, expected: paused.version,
    content: `${paused.content}\n## Pause\n\n- **Paused By:** \`test-user\`\n- **Since:** \`2026-10-15T00:00:00Z\`\n- **Reason:** Waiting\n`,
    placement: { kind: "active" }, provenance: { verb: "test", lifecycleAction: "pause" } }));
  const fake = scriptGitExec([{ match: { prefix: ["for-each-ref"] }, responses: [{ stdout:
    `refs/heads/feat/paused\t${"a".repeat(40)}\nrefs/remotes/origin/plan/shipped\t${"b".repeat(40)}\n` }] }]);
  const result = await deriveStoreInFlight({ store: h.store, exec: fake.exec, identity: "test-user", teamMode: false, projectId: async () => "project" });
  expect(result.entries).toEqual(expect.arrayContaining([expect.objectContaining({ name: "planning", remoteOnly: false }),
    expect.objectContaining({ name: "paused", branch: "feat/paused", scheduling: "paused" })]));
  expect(result.entries.find((entry) => entry.kind === "work-unit" && entry.name === "planning")).not.toHaveProperty("branch");
  expect(result.snapshot.refs["feat/paused"]).toBe("a".repeat(40));
  expect(result.residue).toContainEqual(expect.objectContaining({ branch: "plan/shipped" }));
});
it("filters foreign owners, retains active Errands with missing branch residue, and reports malformed active metadata", async () => {
  const h = createLifecycleHarness();
  await h.seedMeta("foreign", { owner: "bob" });
  const record = TransientIdentityRecordV3Schema.parse({ version: 3, slug: "fix-it", claimId: "a".repeat(32), createdAt: "2026-10-14T00:00:00Z", updatedAt: "2026-10-14T00:00:00Z",
    kind: "errand", purpose: "errand", owner: "alice", intent: "Fix", branch: "chore/fix-it", state: "open", savedHead: null, changeRequest: null, origin: "description", originEntry: null });
  if (record.kind !== "errand" || record.purpose !== "errand") throw new Error("Expected ordinary Errand");
  await h.seed(recordReferences["work-item/record"](OwnerIdentitySchema.parse({ type: "work-item", name: record.slug })),
    serializeTransientIdentityRecord(record), { kind: "active" },
    { branches: [{ repository: "project", ref: record.branch, linkedAs: "created", excluded: [] }] });
  const fake = scriptGitExec([{ match: { prefix: ["for-each-ref"] }, responses: [{ stdout: "" }] }]);
  const result = await deriveStoreInFlight({ store: h.store, exec: fake.exec, identity: "alice", teamMode: true, projectId: async () => "project" });
  expect(result.entries).toHaveLength(1); expect(result.entries[0]).toMatchObject({ kind: "errand", slug: "fix-it", owner: "alice" });
  expect(result.residue).toContainEqual({ branch: "chore/fix-it", slug: "fix-it", reason: "errand-record-without-branch" });
});
it("names an unlinked suffixed Errand branch's residue by the slug before its suffix", async () => {
  const h = createLifecycleHarness();
  const fake = scriptGitExec([{ match: { prefix: ["for-each-ref"] }, responses: [{ stdout: [
    `refs/heads/chore/fix-it-0a1b2c3d\t${"a".repeat(40)}`, `refs/heads/feat/fix-it-0a1b2c3d\t${"b".repeat(40)}`,
    `refs/heads/fix/plain\t${"c".repeat(40)}`, ""].join("\n") }] }]);
  const result = await deriveStoreInFlight({ store: h.store, exec: fake.exec, identity: "test-user", teamMode: false, projectId: async () => "project" });
  expect(result.residue).toEqual(expect.arrayContaining([
    { branch: "chore/fix-it-0a1b2c3d", slug: "fix-it", reason: "no-record-or-meta" },
    { branch: "feat/fix-it-0a1b2c3d", slug: "fix-it-0a1b2c3d", reason: "no-record-or-meta" },
    { branch: "fix/plain", slug: "plain", reason: "no-record-or-meta" },
  ]));
});
it("reports an unlinked suffixed hotfix branch as residue with an inspection warning", async () => {
  const { store } = createLifecycleHarness();
  const branch = "hotfix/fix-it-0a1b2c3d";
  const fake = scriptGitExec([{ match: { prefix: ["for-each-ref"] }, responses: [
    { stdout: `refs/heads/${branch}\t${"a".repeat(40)}\n` },
  ] }]);
  const result = await deriveStoreInFlight({ store, exec: fake.exec, identity: "test-user", teamMode: false, projectId: async () => "project" });
  expect(result).toMatchObject({
    residue: [{ branch, slug: "fix-it", reason: "no-record-or-meta" }],
    warnings: [{ branch, code: "branch-residue" }],
  });
});
it("keeps the full post-prefix name of nested branch residue", async () => {
  const { store } = createLifecycleHarness();
  const branch = "fix/team/widget-deadbeef";
  const fake = scriptGitExec([{ match: { prefix: ["for-each-ref"] }, responses: [
    { stdout: `refs/heads/${branch}\t${"a".repeat(40)}\n` },
  ] }]);
  const result = await deriveStoreInFlight({ store, exec: fake.exec, identity: "test-user", teamMode: false, projectId: async () => "project" });
  expect(result.residue).toEqual([{ branch, slug: "team/widget-deadbeef", reason: "no-record-or-meta" }]);
});
