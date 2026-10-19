/** Failed local ref reads preserve Store membership without inventing branch absence. */
import { expect, it } from "vitest";
import { deriveStoreInFlight } from "../../../src/lib/git/in-flight-store.js";
import { createLifecycleHarness } from "../../helpers/store/lifecycle-harness.js";
import { scriptGitExec } from "../../helpers/git-exec-fake.js";
import { OwnerIdentitySchema, recordReferences } from "../../../src/lib/store/identity.js";
import { TransientIdentityRecordV3Schema, serializeTransientIdentityRecord } from "../../../src/lib/errand/identity-record.js";

it("keeps active work and Errands indeterminate on a failed ref read, then clears uncertainty after repair", async () => {
  const h = createLifecycleHarness();
  await h.seedMeta("demo", {}, { kind: "active" }, { branches: [{ repository: "project", ref: "feat/demo", linkedAs: "created", excluded: [] }] });
  const record = TransientIdentityRecordV3Schema.parse({ version: 3, kind: "errand", purpose: "errand", slug: "fix-it", owner: "alice",
    intent: "Fix it", claimId: "a".repeat(32), branch: "chore/fix-it", origin: "description", originEntry: null,
    state: "open", savedHead: null, changeRequest: null, createdAt: "2026-10-18T00:00:00Z", updatedAt: "2026-10-18T00:00:00Z" });
  await h.seed(recordReferences["work-item/record"](OwnerIdentitySchema.parse({ type: "work-item", name: "fix-it" })),
    serializeTransientIdentityRecord(record), { kind: "active" }, { branches: [{ repository: "project", ref: "chore/fix-it", linkedAs: "created", excluded: [] }] });
  const fake = scriptGitExec([{ match: { prefix: ["for-each-ref"] }, responses: [
    { failure: { exitCode: 128, stderr: "Refs unreadable" } },
    { stdout: `refs/heads/feat/demo\t${"b".repeat(40)}\nrefs/heads/chore/fix-it\t${"c".repeat(40)}\n` },
  ] }]);
  const input = { store: h.store, exec: fake.exec, identity: "alice", teamMode: false, roster: [], projectId: async () => "project" };
  const blocked = await deriveStoreInFlight(input);
  expect(blocked.entries).toHaveLength(2);
  for (const entry of blocked.entries) expect(entry).toMatchObject({ remoteOnly: false, marks: ["degraded", "indeterminate"] });
  expect(blocked).toMatchObject({ marks: ["degraded", "indeterminate"], residue: [], snapshot: { refs: {}, worktrees: {} } });
  expect(blocked.warnings).toEqual([expect.objectContaining({ rendered: expect.stringMatching(/local.*ref.*git for-each-ref.*repair.*retry/iu) })]);
  const repaired = await deriveStoreInFlight(input);
  expect(repaired.entries).toHaveLength(2);
  for (const entry of repaired.entries) { expect(entry.remoteOnly).toBe(false); expect(entry).not.toHaveProperty("marks"); }
  expect(repaired).not.toHaveProperty("marks");
  expect(repaired.warnings).toEqual([]); expect(repaired.residue).toEqual([]);
  expect(repaired.snapshot.refs).toEqual({ "feat/demo": "b".repeat(40), "chore/fix-it": "c".repeat(40) });
  const unobserved = await deriveStoreInFlight({ ...input, roster: undefined });
  for (const entry of unobserved.entries) expect(entry).toMatchObject({ marks: ["degraded", "indeterminate"] });
  expect(unobserved.warnings).toHaveLength(2);
  expect(unobserved.warnings.every(warning => /roster was not available.*repair.*retry/iu.test(warning.rendered))).toBe(true);
});

it("retains independently known holders and branchless work when the ref inventory is unavailable", async () => {
  const h = createLifecycleHarness();
  await h.seedMeta("held", {}, { kind: "active" }, { branches: [{ repository: "project", ref: "feat/held", linkedAs: "created", excluded: [] }] });
  await h.seedMeta("planning", { state: "Planning", currentWorkflow: "draft-design" });
  const fake = scriptGitExec([{ match: { prefix: ["for-each-ref"] }, responses: [{ failure: { exitCode: 128 } }] }]);
  const result = await deriveStoreInFlight({ store: h.store, exec: fake.exec, identity: "alice", teamMode: false,
    projectId: async () => "project", findHoldingCheckout: async name => name === "held" ? "/holder" : null });
  expect(result.entries).toEqual(expect.arrayContaining([
    expect.objectContaining({ name: "held", worktreePath: "/holder", branch: "feat/held", remoteOnly: false }),
    expect.objectContaining({ name: "planning", remoteOnly: false }),
  ]));
  for (const entry of result.entries) expect(entry).not.toHaveProperty("marks");
  expect(result.marks).toEqual(["degraded", "indeterminate"]);
  expect(result.residue).toEqual([]);
});
