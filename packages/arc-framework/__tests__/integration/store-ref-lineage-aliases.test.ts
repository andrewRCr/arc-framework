/** Terminal lineage retains authenticated names without turning them into direct record aliases. */
import { expect, it } from "vitest";
import { RecordReferenceSchema } from "../../src/lib/store/index.js";
import { makeGitExec } from "../helpers/integration.js";
import { createRefFixture } from "../helpers/store/ref-fixture.js";
import { seed, success, testProvenance, update } from "../helpers/store/suite-tools.js";

it.each(["default", "separate"] as const)("retains a retired generation's former name across lineage removal and recreation in %s", async layout => {
  const fixture = await createRefFixture({}, layout), git = makeGitExec(fixture.root);
  const original = await seed(fixture, fixture.reference("work-item/meta"));
  const renamed = RecordReferenceSchema.parse({ ...original.reference, owner: { ...original.reference.owner, name: "renamed-terminal" } });
  success(await fixture.store.write({ ...update(fixture, original), reference: renamed }));
  const beforeTerminal = (await git("git", [...fixture.gitDir ? [`--git-dir=${fixture.gitDir}`] : [], "for-each-ref", "--format=%(refname)", "refs/arc/project/registry"])).stdout;
  expect(await fixture.store.lookup({ kind: "lineage", origin: original.reference.owner.name }))
    .toMatchObject({ status: "refused", refusal: { code: "not-found" } });
  const current = success(await fixture.store.read({ reference: renamed }));
  const lineage = await seed(fixture, RecordReferenceSchema.parse({ owner: current.reference.owner, kind: "lineage/transition" }));
  success(await fixture.store.write({ action: "remove", reference: current.reference, expected: current.version, provenance: testProvenance }));
  expect(success(await fixture.reopen().lookup({ kind: "lineage", origin: original.reference.owner.name })).reference).toEqual(lineage.reference);
  expect(beforeTerminal.trim()).toBe("refs/arc/project/registry");
  const owner = current.reference.owner;
  if (owner.type !== "work-item" || !owner.uid) throw new Error("Expected a generation-bound work item");
  expect(success(await fixture.store.lookup({ kind: "lineage", origin: owner.uid })).reference).toEqual(lineage.reference);
  success(await fixture.store.write({ action: "remove", reference: lineage.reference, expected: lineage.version, provenance: testProvenance }));
  expect(await fixture.store.lookup({ kind: "lineage", origin: original.reference.owner.name }))
    .toMatchObject({ status: "refused", refusal: { code: "not-found" } });
  await seed(fixture, lineage.reference);
  expect(success(await fixture.reopen().lookup({ kind: "lineage", origin: original.reference.owner.name })).reference).toEqual(lineage.reference);
}, 60_000);

it.each([["default", false], ["default", true], ["separate", false], ["separate", true]] as const)(
  "preserves direct-operation authority after retirement (%s, synced=%s)", async (layout, synced) => {
  const fixture = await createRefFixture({}, layout);
  const original = await seed(fixture, fixture.reference("work-item/meta"));
  const renamed = RecordReferenceSchema.parse({ ...original.reference, owner: { ...original.reference.owner, name: "retired-direct" } });
  success(await fixture.store.write({ ...update(fixture, original), reference: renamed }));
  const current = success(await fixture.store.read({ reference: renamed }));
  const draft = await seed(fixture, RecordReferenceSchema.parse({ owner: current.reference.owner, kind: "work-item/draft" }));
  const lineage = await seed(fixture, RecordReferenceSchema.parse({ owner: current.reference.owner, kind: "lineage/transition" }));
  success(await fixture.store.write({ action: "remove", reference: current.reference, expected: current.version, provenance: testProvenance }));
  const peer = synced ? fixture.remote(true) : undefined;
  if (synced && !peer) throw new Error("Expected a native remote store");
  if (synced) success(await fixture.store.push());
  const store = peer ?? fixture.store;
  const before = success(await store.version());
  const alias = RecordReferenceSchema.parse({ kind: "work-item/draft", owner: { type: "work-item", name: original.reference.owner.name } });
  const oldRead = await store.read({ reference: alias }), exactRead = await store.read({ reference: draft.reference });
  const oldWrite = await store.write({ ...update(fixture, draft), reference: alias });
  const exactWrite = await store.write(update(fixture, draft));
  expect(oldRead).toMatchObject({ status: "refused", refusal: { code: "not-found" } });
  expect(exactRead).toMatchObject({ status: "refused", refusal: { code: "not-found" } });
  expect(oldWrite).toMatchObject({ status: "refused", refusal: { code: "version-conflict" } });
  expect(exactWrite).toMatchObject({ status: "refused", refusal: { code: "not-found" } });
  expect(success(await store.list({ family: "work-item", owner: alias.owner })).status).toBe("absent");
  expect(await store.read({ reference: RecordReferenceSchema.parse({ ...lineage.reference, owner: alias.owner }), asOf: before }))
    .toMatchObject({ status: "refused", refusal: { code: "not-found" } });
  expect(success(await store.version())).toBe(before);
  expect(success(await store.read({ reference: lineage.reference }))).toEqual(lineage);
  expect(success(await store.lookup({ kind: "lineage", origin: original.reference.owner.name })).reference).toEqual(lineage.reference);
}, 60_000);


it("ranks current terminal names before ambiguous former names and keeps UUID-shaped origins exact", async () => {
  const fixture = await createRefFixture();
  const originalName = fixture.reference("work-item/meta").owner.name;
  const retire = async (name: string, from: string = originalName) => {
    const original = await seed(fixture, RecordReferenceSchema.parse({ kind: "work-item/meta", owner: { type: "work-item", name: from } }));
    const reference = RecordReferenceSchema.parse({ ...original.reference, owner: { ...original.reference.owner, name } });
    if (name !== from) success(await fixture.store.write({ ...update(fixture, original), reference }));
    const current = success(await fixture.store.read({ reference }));
    const lineage = await seed(fixture, RecordReferenceSchema.parse({ owner: current.reference.owner, kind: "lineage/transition" }));
    success(await fixture.store.write({ action: "remove", reference: current.reference, expected: current.version, provenance: testProvenance }));
    return lineage.reference;
  };
  const first = await retire("first-terminal"), second = await retire("second-terminal");
  expect(await fixture.store.lookup({ kind: "lineage", origin: originalName })).toMatchObject({ status: "refused", refusal: {
    code: "ambiguous-match", candidates: expect.arrayContaining([first, second]),
  } });
  const current = await retire(originalName);
  expect(success(await fixture.store.lookup({ kind: "lineage", origin: originalName })).reference).toEqual(current);
  const firstOwner = first.owner;
  if (firstOwner.type !== "work-item" || !firstOwner.uid) throw new Error("Expected a generation-bound origin");
  const unknownUid = "00000000-0000-4000-8000-000000000099";
  await retire(firstOwner.uid, unknownUid);
  expect(success(await fixture.store.lookup({ kind: "lineage", origin: firstOwner.uid })).reference).toEqual(first);
  expect(await fixture.store.lookup({ kind: "lineage", origin: unknownUid }))
    .toMatchObject({ status: "refused", refusal: { code: "not-found" } });
}, 60_000);
