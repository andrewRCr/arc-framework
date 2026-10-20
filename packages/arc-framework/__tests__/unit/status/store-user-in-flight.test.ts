/** User in-flight rows share the operational membership model and its diagnostics. */
import { expect, it } from "vitest";
import { readStoreUserInFlight } from "../../../src/lib/status/store-user-in-flight.js";
import { createLifecycleHarness, lifecycleSuccess } from "../../helpers/store/lifecycle-harness.js";
import { scriptGitExec } from "../../helpers/git-exec-fake.js";
import { MetaPauseSchema } from "../../../src/lib/active/meta-schema.js";
import { writeMetaPause } from "../../../src/lib/store/kinds/meta/writers.js";
import { recordPut } from "../../../src/lib/store/lifecycle-write.js";
import { createReferenceFixture } from "../../helpers/store/reference-fixture.js";
import { makeMetaFixture } from "../../helpers/meta-fixture.js";
import { parseMetaRecord } from "../../../src/lib/active/meta-reader.js";
import { OwnerIdentitySchema, recordReferences } from "../../../src/lib/store/identity.js";
import { testProvenance } from "../../helpers/store/suite-tools.js";
import { serializeTransientIdentityRecord, TransientIdentityRecordV3Schema } from "../../../src/lib/errand/identity-record.js";
import { deriveStoreInFlight } from "../../../src/lib/git/in-flight-store.js";

it("builds branchless and paused rows from active placement", async () => {
  const h = createLifecycleHarness();
  await h.seedMeta("branchless", { state: "Planning", currentWorkflow: "draft-design", owner: "alice" });
  const paused = await h.seedMeta("paused", { owner: "alice" });
  lifecycleSuccess(await h.store.write({ ...recordPut(paused, { content: writeMetaPause(paused.content,
    MetaPauseSchema.parse({ pausedBy: "alice", since: "2026-10-01T12:00:00.000Z", reason: "Waiting" })) }),
    provenance: { verb: "pause", lifecycleAction: "pause" } }));
  const { exec } = scriptGitExec([{ match: { prefix: ["for-each-ref"] }, responses: [{ stdout: "" }] }]);
  const result = await readStoreUserInFlight({ store: h.store, exec, identity: "alice", teamMode: false, projectId: async () => "project", roster: [] });
  expect(result.rows).toMatchObject([{ workUnit: "branchless", state: "Planning" }, { workUnit: "paused", state: "Paused" }]);
  expect(result.warnings).toEqual([]);
});

it("keeps the identity's own and unowned work in team mode", async () => {
  const h = createReferenceFixture();
  // Unowned metadata is an admitted read shape even though creation requires an owner.
  for (const [name, owner] of [["mine", "alice"], ["unowned", null], ["foreign", "bob"]] as const) {
    const reference = recordReferences["work-item/meta"](OwnerIdentitySchema.parse({ type: "work-item", name }));
    const fields = { ...parseMetaRecord(makeMetaFixture(name)), owner };
    lifecycleSuccess(await h.store.write({ action: "put", reference, expected: null, content: JSON.stringify(fields),
      placement: { kind: "active" }, provenance: testProvenance }));
  }
  const { exec } = scriptGitExec([{ match: { prefix: ["for-each-ref"] }, responses: [{ stdout: "" }] }]);
  const result = await readStoreUserInFlight({ store: h.store, exec, identity: "alice", teamMode: true, projectId: async () => "project", roster: [] });
  expect(result.rows.map(row => row.workUnit)).toEqual(["mine", "unowned"]);
});

it("drops project Errands from the user work-unit rows", async () => {
  const h = createLifecycleHarness();
  const record = TransientIdentityRecordV3Schema.parse({ version: 3, kind: "errand", purpose: "errand", slug: "fix-it", owner: "alice",
    intent: "Fix it", claimId: "a".repeat(32), branch: "chore/fix-it", origin: "description", originEntry: null,
    state: "open", savedHead: null, changeRequest: null, createdAt: "2026-10-18T00:00:00Z", updatedAt: "2026-10-18T00:00:00Z" });
  await h.seed(recordReferences["work-item/record"](OwnerIdentitySchema.parse({ type: "work-item", name: "fix-it" })),
    serializeTransientIdentityRecord(record), { kind: "active" },
    { branches: [{ repository: "project", ref: "chore/fix-it", linkedAs: "created", excluded: [] }] });
  const { exec } = scriptGitExec([{ match: { prefix: ["for-each-ref"] }, responses: [{ stdout: "" }] }]);
  const result = await readStoreUserInFlight({ store: h.store, exec, identity: "alice", teamMode: true, projectId: async () => "project", roster: [] });
  expect(result.rows).toEqual([]);
});

it("retains the selected in-flight reader's warning text", async () => {
  const h = createLifecycleHarness();
  const { exec } = scriptGitExec([{ match: { prefix: ["for-each-ref"] }, responses: [{ stdout: "" }] }]);
  const { exec: unavailable } = scriptGitExec([{ match: { prefix: ["for-each-ref"] }, responses: [{ failure: { exitCode: 128, stderr: "Refs unavailable" } }] }]);
  const input = { store: h.store, exec, identity: "alice", teamMode: false, projectId: async () => "project", roster: [] };
  const snapshot = await deriveStoreInFlight({ ...input, exec: unavailable });
  expect(snapshot.warnings.length).toBeGreaterThan(0);
  const result = await readStoreUserInFlight({ ...input, readInFlight: async () => snapshot });
  expect(result.warnings).toEqual(expect.arrayContaining(snapshot.warnings.map(warning => warning.rendered)));
});

it("adds the user-view retry route when membership is marked degraded", async () => {
  const h = createLifecycleHarness();
  const { exec } = scriptGitExec([{ match: { prefix: ["for-each-ref"] }, responses: [{ failure: { exitCode: 128, stderr: "Refs unavailable" } }] }]);
  const result = await readStoreUserInFlight({ store: h.store, exec, identity: "alice", teamMode: false, projectId: async () => "project", roster: [] });
  expect(result.warnings).toContain("The in-flight slice may be incomplete. Repair the reported evidence, then retry arc status --user.");
});
