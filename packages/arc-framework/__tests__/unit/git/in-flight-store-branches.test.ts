/** In-flight branch hints share lifecycle selection and retain historical link ownership. */
import { expect, it } from "vitest";
import { deriveStoreInFlight } from "../../../src/lib/git/in-flight-store.js";
import { createLifecycleHarness, lifecycleSuccess } from "../../helpers/store/lifecycle-harness.js";
import { scriptGitExec } from "../../helpers/git-exec-fake.js";

it("selects the current project work branch and keeps retained links out of residue", async () => {
  const h = createLifecycleHarness();
  await h.seedMeta("promoted", {}, { kind: "active" }, { branches: [
    { repository: "project", ref: "chore/original", linkedAs: "created", excluded: [] },
    { repository: "project", ref: "refs/heads/feat/promoted", linkedAs: "created", excluded: [] },
    { repository: "other-project", ref: "feat/elsewhere", linkedAs: "created", excluded: [] },
  ] });
  const fake = scriptGitExec([{ match: { prefix: ["for-each-ref"] }, responses: [{ stdout:
    `refs/heads/chore/original\t${"a".repeat(40)}\nrefs/heads/feat/promoted\t${"b".repeat(40)}\n` }] }]);
  const result = await deriveStoreInFlight({ store: h.store, exec: fake.exec, identity: "test-user", teamMode: false, roster: [], projectId: async () => "project" });
  expect(result.entries).toEqual([expect.objectContaining({ name: "promoted", branch: "feat/promoted", remoteOnly: false })]);
  expect(result.snapshot.refs).toEqual({ "feat/promoted": "b".repeat(40) });
  expect(result.residue).toEqual([]);
  expect(result.warnings).toEqual([]);
});

it("withholds an ambiguous canonical branch hint, reports its repair, then accepts repaired links", async () => {
  const h = createLifecycleHarness();
  const meta = await h.seedMeta("demo", {}, { kind: "active" }, { branches: [
    { repository: "project", ref: "feat/demo", linkedAs: "created", excluded: [] },
    { repository: "project", ref: "refs/heads/feat/demo", linkedAs: "created", excluded: [] },
  ] });
  const fake = scriptGitExec([{ match: { prefix: ["for-each-ref"] }, responses: [{ stdout: `refs/heads/feat/demo\t${"a".repeat(40)}\n` }] }]);
  const input = { store: h.store, exec: fake.exec, identity: "test-user", teamMode: false, roster: [], projectId: async () => "project" };
  const unresolved = await deriveStoreInFlight(input);
  expect(unresolved.entries[0]).not.toHaveProperty("branch");
  expect(unresolved.marks).toEqual(["degraded"]);
  expect(unresolved.warnings).toEqual([expect.objectContaining({ rendered: expect.stringMatching(/duplicate canonical.*repair/iu) })]);
  lifecycleSuccess(await h.store.write({ action: "put", reference: meta.reference, expected: meta.version, content: meta.content,
    placement: { kind: "active" }, links: { branches: [{ repository: "project", ref: "feat/demo", linkedAs: "created", excluded: [] }] },
    provenance: { verb: "repair", lifecycleAction: "repair" } }));
  const repaired = await deriveStoreInFlight(input);
  expect(repaired.entries[0]).toMatchObject({ name: "demo", branch: "feat/demo" });
  expect(repaired.warnings).toEqual([]);
  expect(repaired).not.toHaveProperty("marks");
});
