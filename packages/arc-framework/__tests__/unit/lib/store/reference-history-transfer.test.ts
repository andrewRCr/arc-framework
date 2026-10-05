/** Publication transfers accepted history independently of the current record tree. */
import { expect, it } from "vitest";
import { RecordReferenceSchema, WriteInputSchema } from "../../../../src/lib/store/index.js";
import { createReferenceFixture } from "../../../helpers/store/reference-fixture.js";
import { ReferenceBackend } from "../../../helpers/store/reference-backend.js";
import { seed, success, update } from "../../../helpers/store/suite-tools.js";

it("publishes every accepted intermediate version and original provenance, then deduplicates replay and reopen", async () => {
  const h = createReferenceFixture(), remote = h.remote(true)!;
  const from = success(await remote.version());
  let current = await seed(h, h.reference("personal/document"), "first\n");
  for (const [verb, content] of [["second", "second\n"], ["third", "third\n"]] as const) {
    success(await h.store.write(WriteInputSchema.parse({ ...update(h, current, content), provenance: { verb, lifecycleAction: "edit", codeHead: "d".repeat(40) } })));
    current = success(await h.store.read({ reference: current.reference }));
  }
  const expected = success(await h.store.history({ reference: current.reference }));
  expect(success(await h.store.sync()).publishes[0]?.status).toBe("pushed");
  expect(success(await remote.history({ reference: current.reference }))).toEqual(expected);
  const published = success(await remote.version());
  expect(success(await remote.changes({ from, to: published, references: [current.reference] }))).toEqual([...expected].reverse());
  for (let attempt = 0; attempt < 2; attempt++) {
    expect(success(await h.reopen().sync()).publishes[0]?.status).toBe("noop");
    expect(success(await remote.version())).toBe(published);
    expect(success(await remote.history({ reference: current.reference }))).toEqual(expected);
  }
});

it("imports every remote version with receiving-local snapshots and original caller facts", async () => {
  const h = createReferenceFixture(), remote = h.remote(true)!;
  const first = await seed(h, h.reference("personal/document"), "base\n");
  success(await h.store.sync());
  let unrelated = await seed(h, h.reference("project-registry/counter", "local-clock"));
  for (let index = 0; index < 5; index++) {
    success(await h.store.write(WriteInputSchema.parse(update(h, unrelated))));
    unrelated = success(await h.store.read({ reference: unrelated.reference }));
  }
  const from = success(await h.store.version());
  let current = success(await remote.read({ reference: first.reference }));
  for (const content of ["remote one\n", "remote two\n"]) {
    success(await remote.write(WriteInputSchema.parse({ ...update(h, current, content), provenance: { verb: "remote-edit", lifecycleAction: "edit" } })));
    current = success(await remote.read({ reference: first.reference }));
  }
  const expected = success(await remote.history({ reference: first.reference }));
  expect(success(await h.store.sync()).publishes[0]?.status).toBe("reconciled");
  expect(success(await h.store.history({ reference: first.reference }))).toEqual(expected);
  expect(success(await h.store.read({ reference: first.reference, asOf: from }))).toEqual(first);
  expect(success(await h.store.read({ reference: unrelated.reference, asOf: from }))).toEqual(unrelated);
  expect(success(await h.store.changes({ from, to: success(await h.store.version()), references: [first.reference] })))
    .toEqual(expected.slice(0, 2).reverse());
  expect(success(await h.reopen().history({ reference: first.reference }))).toEqual(expected);
});

it("publishes create/remove history even when the final tree is empty", async () => {
  const h = createReferenceFixture(), remote = h.remote(true)!;
  const reference = h.reference("personal/document"), from = success(await remote.version());
  for (const content of ["one\n", "two\n"]) {
    const record = await seed(h, reference, content);
    success(await h.store.write(WriteInputSchema.parse({ action: "remove", reference, expected: record.version,
      provenance: { verb: "delete", lifecycleAction: "remove" } })));
  }
  const expected = success(await h.store.history({ reference }));
  expect(expected).toHaveLength(4);
  expect(success(await h.store.sync()).publishes[0]?.status).toBe("pushed");
  expect(success(await remote.history({ reference }))).toEqual(expected);
  expect(await remote.read({ reference })).toMatchObject({ status: "refused", refusal: { code: "not-found" } });
  expect(success(await remote.changes({ from, to: success(await remote.version()), references: [reference] }))).toEqual([...expected].reverse());
  expect(success(await h.reopen().sync()).publishes[0]?.status).toBe("noop");
});

it("receives remote create/remove history even when neither current tree changes", async () => {
  const h = createReferenceFixture(), remote = h.remote(true)!;
  const reference = h.reference("personal/document"), from = success(await h.store.version());
  const creation = success(await remote.write(WriteInputSchema.parse({ action: "put", reference, expected: null,
    content: "remote temporary bytes\n", provenance: { verb: "remote-create", lifecycleAction: "create" } })));
  success(await remote.write(WriteInputSchema.parse({ action: "remove", reference, expected: creation.version,
    provenance: { verb: "remote-remove", lifecycleAction: "remove" } })));
  const expected = success(await remote.history({ reference }));
  expect(success(await h.store.sync()).publishes[0]?.status).toBe("reconciled");
  expect(success(await h.store.history({ reference }))).toEqual(expected);
  expect(success(await h.store.changes({ from, to: success(await h.store.version()), references: [reference] }))).toEqual([...expected].reverse());
  expect(await h.store.read({ reference })).toMatchObject({ status: "refused", refusal: { code: "not-found" } });
  expect(success(await h.store.sync()).publishes[0]?.status).toBe("noop");
});

it("defers identity-scope history while eligible project history publishes, then transfers it once", async () => {
  const h = createReferenceFixture(), remote = h.remote(true)!;
  const personal = await seed(h, h.reference("personal/document"), "personal one\n");
  success(await h.store.write(WriteInputSchema.parse(update(h, personal, "personal two\n"))));
  const project = await seed(h, h.reference("project-registry/counter"));
  const personalHistory = success(await h.store.history({ reference: personal.reference }));
  const projectHistory = success(await h.store.history({ reference: project.reference }));
  h.identity(undefined);
  expect(success(await h.store.sync()).states).toEqual(expect.arrayContaining([expect.objectContaining({ status: "no-identity" })]));
  expect(await remote.history({ reference: personal.reference })).toMatchObject({ status: "refused", refusal: { code: "not-found" } });
  expect(success(await remote.history({ reference: project.reference }))).toEqual(projectHistory);
  h.identity("test-user"); success(await h.store.sync());
  expect(success(await remote.history({ reference: personal.reference }))).toEqual(personalHistory);
  expect(success(await remote.history({ reference: project.reference }))).toEqual(projectHistory);
  expect(success(await h.store.sync()).publishes[0]?.status).toBe("noop");
});

it("publishes primary role and rename history without replacing its UID or caller provenance", async () => {
  const h = createReferenceFixture(), remote = h.remote(true)!;
  const first = await seed(h, h.reference("work-item/record"));
  const promoted = RecordReferenceSchema.parse({ ...first.reference, kind: "work-item/meta" });
  success(await h.store.write(WriteInputSchema.parse({ ...update(h, first), reference: promoted, content: h.content(promoted),
    links: { branches: [{ repository: "owner/repo", ref: "feat/example" }] }, provenance: { verb: "promote", lifecycleAction: "promote" } })));
  const current = success(await h.store.read({ reference: promoted }));
  const renamed = RecordReferenceSchema.parse({ ...promoted, owner: { ...promoted.owner, name: "renamed" } });
  success(await h.store.write(WriteInputSchema.parse({ ...update(h, current), reference: renamed,
    provenance: { verb: "rename", lifecycleAction: "rename" } })));
  const expected = success(await h.store.history({ reference: renamed }));
  expect(expected).toHaveLength(3);
  success(await h.store.sync());
  expect(success(await remote.history({ reference: renamed }))).toEqual(expected);
  expect(success(await remote.read({ reference: renamed }))).toEqual(success(await h.store.read({ reference: renamed })));
  expect(success(await remote.lookup({ kind: "slug", slug: first.reference.owner.name })).reference).toEqual(renamed);
});

it("retains conflict creation and implicit removal when resolution precedes the first publish", async () => {
  const h = createReferenceFixture(), remote = h.remote(true)!;
  const first = await seed(h, h.reference("personal/document"), "base\n");
  success(await h.store.write(WriteInputSchema.parse(update(h, first, "current\n"))));
  const clash = success(await h.store.write(WriteInputSchema.parse(update(h, first, "incoming\n"))));
  const conflict = clash.conflicts[0]!;
  const original = success(await h.store.read({ reference: conflict }));
  success(await h.store.write(WriteInputSchema.parse({ ...update(h, success(await h.store.read({ reference: first.reference })), "resolved\n"),
    resolves: [conflict], provenance: { verb: "resolve", lifecycleAction: "resolve" } })));
  const expected = success(await h.store.history({ reference: conflict }));
  success(await h.store.sync());
  expect(success(await remote.history({ reference: conflict }))).toEqual(expected);
  expect(expected).toMatchObject([{ version: null }, { content: original.content, provenance: { verb: "merge" } }]);
  expect(success(await remote.history({ reference: first.reference }))).toEqual(success(await h.store.history({ reference: first.reference })));
});

it("stages all history behind remote contention and publishes it once after repair", async () => {
  const h = createReferenceFixture(), remote = h.remote(true)!;
  let current = await seed(h, h.reference("personal/document"), "first\n");
  for (const content of ["second\n", "third\n"]) {
    success(await h.store.write(WriteInputSchema.parse(update(h, current, content))));
    current = success(await h.store.read({ reference: current.reference }));
  }
  if (!(h.store instanceof ReferenceBackend)) throw new Error("Expected the reference fixture's real backend");
  const before = structuredClone(h.store.state), expected = success(await h.store.history({ reference: current.reference }));
  h.remoteState("contended");
  expect(success(await h.store.sync()).publishes[0]).toMatchObject({ status: "failed", failure: { code: "retries-exhausted" } });
  expect(h.store.state).toEqual(before);
  expect(await remote.history({ reference: current.reference })).toMatchObject({ status: "refused", refusal: { code: "not-found" } });
  h.remoteState("available"); success(await h.store.sync());
  expect(success(await remote.history({ reference: current.reference }))).toEqual(expected);
  expect(success(await h.store.sync()).publishes[0]?.status).toBe("noop");
  expect(success(await remote.history({ reference: current.reference }))).toEqual(expected);
});
