import { describe, expect, it } from "vitest";
import { createRefFixture } from "../helpers/store/ref-fixture.js";
import { success, testProvenance, seed, update } from "../helpers/store/suite-tools.js";
import { removeLooseObject } from "../helpers/store/ref-plant.js";
import { createRefStore } from "../../src/lib/store/create.js";
import { RecordReferenceSchema } from "../../src/lib/store/index.js";
import { fixtureGit } from "../helpers/store/ref-fixture-git.js";

const projectId = "abcdefab-cdef-4abc-8def-abcdefabcdef";

describe.each(["default", "separate"] as const)("the ref store's one project (%s)", (layout) => {
  it("returns its project owner without a UID before identity creation and with its ID afterward", async () => {
    const f = await createRefFixture({}, layout);
    const git = fixtureGit(f);
    const counter = f.reference("project-registry/counter");
    const inbox = f.reference("project-inbox/inbox");
    for (const reference of [counter, inbox]) success(await f.store.write({ action: "put", reference, expected: null, content: f.content(reference), provenance: testProvenance }));
    for (const reference of [counter, inbox]) {
      expect(success(await f.store.read({ reference })).reference.owner).toEqual({ type: "project", name: "project" });
    }
    expect((await git("git", ["show", "-s", "--format=%B", "refs/arc/project/registry"])).stdout).not.toContain("Arc-Owner:");
    const identity = f.reference("project-registry/identity");
    const created = success(await f.store.write({ action: "put", reference: identity, expected: null, content: JSON.stringify({ projectId }), provenance: testProvenance }));
    const owner = { type: "project", name: "project", uid: projectId };
    expect(created.reference.owner).toEqual(owner);
    expect((await git("git", ["show", "-s", "--format=%B", "refs/arc/project/registry"])).stdout).toContain(`Arc-Owner: ${projectId}`);
    for (const reference of [counter, inbox, identity]) expect(success(await f.store.read({ reference })).reference.owner).toEqual(owner);
    for (const entry of success(await f.store.history({ reference: counter }))) expect(entry.reference.owner).toEqual(owner);
    for (const family of ["project-registry", "project-inbox"] as const) {
      const listing = success(await f.store.list({ family }));
      expect(listing.status).toBe("complete");
      if (listing.status !== "complete") throw new Error("No project listing");
      expect(listing.records.length).toBeGreaterThan(0);
      for (const record of listing.records) expect(record.reference.owner).toEqual(owner);
    }
    const next = f.reference("project-registry/counter", "two");
    expect(success(await f.store.write({ action: "put", reference: next, expected: null, content: f.content(next), provenance: testProvenance })).reference.owner).toEqual(owner);
    expect((await git("git", ["show", "-s", "--format=%B", "refs/arc/project/registry"])).stdout).toContain(`Arc-Owner: ${projectId}`);
  });
  it("expires the removed identity's UID handle while allowing absence reads and recreation", async () => {
    const f = await createRefFixture({}, layout);
    const reference = f.reference("project-registry/identity");
    const created = await seed(f, reference, JSON.stringify({ projectId }));
    expect(created.reference.owner).toEqual({ type: "project", name: "project", uid: projectId });
    const removed = success(await f.store.write({ action: "remove", reference: created.reference, expected: created.version, provenance: testProvenance }));
    expect(removed.version).toBeUndefined();
    expect(await f.store.read({ reference: created.reference })).toMatchObject({ status: "refused", refusal: { code: "identity-mismatch", actual: reference } });
    expect(await f.store.read({ reference })).toMatchObject({ status: "refused", refusal: { code: "not-found" } });
    const recreated = success(await f.store.write({ action: "put", reference, expected: null, content: JSON.stringify({ projectId }), provenance: testProvenance }));
    expect(recreated.reference).toEqual(created.reference);
    expect(success(await f.store.read({ reference: recreated.reference })).content).toBe(created.content);
  });

  it.each([{ name: "other-project" }, { name: "project", uid: "00000000-0000-4000-8000-000000000099" }])("refuses a different project handle across reads, history, and writes: %j", async (handle) => {
    const f = await createRefFixture({}, layout);
    const identity = f.reference("project-registry/identity");
    success(await f.store.write({ action: "put", reference: identity, expected: null, content: JSON.stringify({ projectId }), provenance: testProvenance }));
    const counter = f.reference("project-registry/counter");
    success(await f.store.write({ action: "put", reference: counter, expected: null, content: f.content(counter), provenance: testProvenance }));
    const prior = success(await f.store.read({ reference: counter }));
    const foreign = RecordReferenceSchema.parse({ ...counter, owner: { type: "project", ...handle } });
    const refusal = { status: "refused", refusal: { code: "identity-mismatch", expected: foreign,
      actual: { ...counter, owner: { type: "project", name: "project", uid: projectId } } } };
    const before = success(await f.store.version());
    expect(await f.store.read({ reference: foreign })).toMatchObject(refusal);
    expect(await f.store.history({ reference: foreign })).toMatchObject(refusal);
    expect(await f.store.write({ action: "put", reference: foreign, expected: prior.version, content: '{"count": 2}', provenance: testProvenance })).toMatchObject(refusal);
    expect(success(await f.store.version())).toBe(before);
    expect(success(await f.store.read({ reference: counter })).content).toBe(prior.content);
  });

  it("checks canonical parsed identity bytes against project owners in independent before and after views", async () => {
    const counter = RecordReferenceSchema.parse({ owner: { type: "project", name: "project" }, kind: "project-registry/counter", key: "one" });
    const f = await createRefFixture({ "project-registry/identity": { parser: null, check: async ({ before, after, next }) => {
      expect(next).toEqual({ content: JSON.stringify({ projectId }), fields: { projectId } });
      expect(success(await before.read({ reference: counter })).reference.owner).toEqual({ type: "project", name: "project" });
      expect(success(await after.read({ reference: counter })).reference.owner).toEqual({ type: "project", name: "project", uid: projectId });
      const listed = success(await after.list({ family: "project-registry", owner: counter.owner }));
      expect(listed.status).toBe("complete");
      if (listed.status !== "complete") throw new Error("No prepared project listing");
      expect(listed.records).toHaveLength(2);
      for (const record of listed.records) expect(record.reference.owner).toEqual({ type: "project", name: "project", uid: projectId });
      return [];
    } } }, layout);
    success(await f.store.write({ action: "put", reference: counter, expected: null, content: f.content(counter), provenance: testProvenance }));
    const identity = f.reference("project-registry/identity");
    success(await f.store.write({ action: "put", reference: identity, expected: null, content: ` { "projectId" : "${projectId}" }\n`, provenance: testProvenance }));
    expect((await fixtureGit(f)("git", ["show", "refs/arc/project/registry:identity.json"])).stdout).toBe(JSON.stringify({ projectId }));
    expect(success(await f.store.read({ reference: identity })).fields).toEqual({ projectId });
  });

  it("binds every project write to an identity created later in the same batch", async () => {
    const f = await createRefFixture({}, layout);
    const inbox = f.reference("project-inbox/inbox");
    const identity = RecordReferenceSchema.parse({ ...f.reference("project-registry/identity"), owner: { type: "project", name: "project", uid: projectId } });
    const result = success(await f.store.batch({ writes: [
      { action: "put", reference: inbox, expected: null, content: f.content(inbox) },
      { action: "put", reference: identity, expected: null, content: JSON.stringify({ projectId }) },
    ], provenance: testProvenance }));
    for (const write of result.writes) expect(write.reference.owner).toEqual(identity.owner);
    for (const ref of ["refs/arc/project/inbox", "refs/arc/project/registry"]) {
      expect((await fixtureGit(f)("git", ["show", "-s", "--format=%B", ref])).stdout).toContain(`Arc-Owner: ${projectId}`);
    }
  });

  it("keeps identity acquisition inside the two-process read and four-process listing", async () => {
    const f = await createRefFixture({}, layout);
    success(await f.store.write({ action: "put", reference: f.reference("project-registry/identity"), expected: null, content: JSON.stringify({ projectId }), provenance: testProvenance }));
    const reference = f.reference("project-inbox/inbox");
    success(await f.store.write({ action: "put", reference, expected: null, content: f.content(reference), provenance: testProvenance }));
    success(await f.store.version());
    let processes = 0;
    const store = createRefStore({ ...f.ports, rawExec: async (...args) => { processes += 1; return f.ports.rawExec(...args); } });
    expect(success(await store.read({ reference })).reference.owner).toMatchObject({ uid: projectId });
    expect(processes).toBe(2);
    const listing = success(await store.list({ family: "project-inbox", owner: reference.owner }));
    expect(listing).toMatchObject({ status: "complete", records: [expect.objectContaining({ reference: expect.objectContaining({ owner: expect.objectContaining({ uid: projectId }) }) })] });
    expect(processes).toBe(6);
  });

  it("refuses an unavailable identity blob and resumes after restoring it", async () => {
    const f = await createRefFixture({}, layout);
    const content = JSON.stringify({ projectId });
    success(await f.store.write({ action: "put", reference: f.reference("project-registry/identity"), expected: null, content, provenance: testProvenance }));
    const reference = f.reference("project-inbox/inbox");
    const oid = (await fixtureGit(f)("git", ["rev-parse", "refs/arc/project/registry:identity.json"])).stdout.trim();
    await removeLooseObject(f.root, oid, f.gitDir);
    const write = { action: "put" as const, reference, expected: null, content: f.content(reference), provenance: testProvenance };
    expect(await f.store.write(write)).toMatchObject({ status: "refused", refusal: { code: "state-unresolvable", remedy: { text: expect.stringMatching(/restore|fetch/iu) } } });
    await f.ports.execInput([...f.gitDir ? [`--git-dir=${f.gitDir}`] : [], "hash-object", "-w", "--stdin"], content, { cwd: f.root });
    const accepted = success(await f.store.write(write));
    expect(accepted.reference.owner).toMatchObject({ uid: projectId });
    expect(success(await f.store.read({ reference })).reference.owner).toEqual(accepted.reference.owner);
  });

  it("keeps earlier project conflicts attached when the identity gains a UID", async () => {
    const f = await createRefFixture({}, layout);
    const base = await seed(f, f.reference("project-inbox/inbox"));
    success(await f.store.write(update(f, base, f.content(base.reference, "changed"))));
    const conflicted = success(await f.store.write(update(f, base, f.content(base.reference, "changed-again"))));
    expect(conflicted.conflicts).toHaveLength(1);
    success(await f.store.write({ action: "put", reference: f.reference("project-registry/identity"), expected: null, content: JSON.stringify({ projectId }), provenance: testProvenance }));
    const record = success(await f.store.read({ reference: base.reference }));
    expect(record.conflicts).toHaveLength(1);
    expect(record.conflicts[0]?.owner).toEqual({ type: "project", name: "project", uid: projectId });
    const listing = success(await f.store.list({ family: "project-inbox" }));
    expect(listing.status).toBe("complete");
    if (listing.status !== "complete") throw new Error("No project listing");
    expect(listing.records.find(({ reference }) => reference.kind === "project-inbox/inbox")?.conflicts).toEqual(record.conflicts);
    success(await f.store.write({ ...update(f, record, f.content(record.reference)), resolves: record.conflicts }));
    expect(success(await f.store.read({ reference: record.reference })).conflicts).toEqual([]);
  });

});
