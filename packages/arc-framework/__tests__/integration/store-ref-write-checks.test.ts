import { describe, expect, it } from "vitest";
import { createRefFixture } from "../helpers/store/ref-fixture.js";
import { seed, success, testProvenance, update } from "../helpers/store/suite-tools.js";
import { HAND_EDIT_VERBS, RecordReferenceSchema, createKindRegistry, type BrokenRule, type WriteCheck } from "../../src/lib/store/index.js";
import { createRefStore } from "../../src/lib/store/create.js";
import { plantRef, removeLooseObject } from "../helpers/store/ref-plant.js";
import { makeGitExec, makeGitExecInput } from "../helpers/integration.js";
import { createRefReadFixture } from "../helpers/store/ref-read.js";
import { makeMetaFixture } from "../helpers/meta-fixture.js";
import { PRODUCTION_REGISTRATIONS } from "../../src/lib/store/kinds/registrations.js";

const broken = (rule: string): BrokenRule => ({ rule, condition: `Broken ${rule}`, remedy: { text: `Repair ${rule}, then retry.` } });

describe("registered ref write checks", () => {
  it("refuses the whole batch by rule identifier then caller write order, counting every broken pair", async () => {
    const check: WriteCheck = async ({ next }) => next?.content === "Corrected\n" ? [] : [broken("z.test"), broken("a.test")];
    const f = await createRefFixture({ "personal/document": { check }, "project-registry/counter": { check } });
    const references = [f.reference("personal/document", "two"), f.reference("personal/document", "one"), f.reference("project-registry/counter")];
    const before = await f.settle();
    expect(await f.store.batch({ writes: references.map((reference) => ({ action: "put", reference, expected: null,
      content: f.content(reference) })), provenance: testProvenance })).toMatchObject({ status: "refused", refusal: {
      code: "record-malformed", reference: references[0], rule: "a.test", condition: "Broken a.test (5 other (record, rule) pairs broken.)",
      remedy: { text: "Repair a.test, then retry." },
    } });
    expect(await f.settle()).toBe(before);
    for (const reference of references) expect(await f.store.read({ reference })).toMatchObject({ status: "refused", refusal: { code: "not-found" } });
    success(await f.store.write({ action: "put", reference: f.reference("personal/document"), expected: null,
      content: "Corrected\n", provenance: testProvenance }));
    expect(success(await f.store.read({ reference: f.reference("personal/document") })).content).toBe("Corrected\n");
  });

  it("reads and lists the whole prepared batch while lookup separates before and after", async () => {
    const check: WriteCheck = async ({ before, after, reference, next }) => {
      const query = { kind: "slug" as const, slug: reference.owner.name };
      expect(await before.lookup(query)).toMatchObject({ status: "refused", refusal: { code: "not-found" } });
      expect(success(await after.lookup(query))).toEqual({ reference });
      expect(await before.read({ reference })).toMatchObject({ status: "refused", refusal: { code: "not-found" } });
      expect(success(await after.read({ reference }))).toMatchObject({ content: next?.content, fields: { content: next?.content } });
      expect(success(await before.list({ family: "work-item", kind: "work-item/meta" })).status).toBe("absent");
      const records = success(await after.list({ family: "work-item", kind: "work-item/meta" }));
      expect(records).toMatchObject({ status: "complete", missed: false });
      if (records.status !== "complete") throw new Error("No prepared listing");
      expect(records.records.map((record) => record.reference.owner.name).sort()).toEqual(["work-item-one", "work-item-two"]);
      return [];
    };
    const f = await createRefFixture({ "work-item/meta": { check, parser: (content) => ({ success: true, data: { content } }) } });
    const references = [f.reference("work-item/meta"), f.reference("work-item/meta", "two")];
    success(await f.store.batch({ writes: references.map((reference) => ({ action: "put", reference, expected: null,
      content: f.content(reference), placement: { kind: "active" } })), provenance: testProvenance }));
    for (const reference of references) expect(success(await f.store.read({ reference })).content).toBe(f.content(reference));
  });

  it("passes merged stored bytes and fields as next, with the found bytes as prior", async () => {
    const check: WriteCheck = async ({ reference, prior, next, before, after }) => {
      if (prior?.content.startsWith("ONE")) {
        expect(prior.content).toBe("ONE\nmiddle\nthree\n");
        expect(next).toEqual({ content: "ONE\nmiddle\nTHREE\n", fields: { content: "ONE\nmiddle\nTHREE\n" } });
        expect(success(await before.read({ reference })).content).toBe(prior.content);
        expect(success(await after.read({ reference })).content).toBe(next?.content);
      }
      return [];
    };
    const f = await createRefFixture({ "personal/document": { check, parser: (content) => ({ success: true, data: { content } }) } });
    const base = await seed(f, f.reference("personal/document"), "one\nmiddle\nthree\n");
    success(await f.store.write(update(f, base, "ONE\nmiddle\nthree\n")));
    success(await f.store.write(update(f, base, "one\nmiddle\nTHREE\n")));
    expect(success(await f.store.read({ reference: base.reference })).content).toBe("ONE\nmiddle\nTHREE\n");
  });

  it("supplies an unparseable prior's content without a fields property", async () => {
    const f = await createRefFixture();
    const record = await seed(f, f.reference("personal/document"), "legacy\n");
    const registry = f.ports.registry;
    if (!registry) throw new Error("No fixture registry");
    const store = createRefStore({ ...f.ports, registry: { ...registry, "personal/document": { ...registry["personal/document"],
      parser: (content) => content === "valid\n" ? { success: true, data: { valid: true } } : { success: false, error: "Expected valid content" },
      check: async ({ prior, next }) => {
        expect(prior).toEqual({ content: "legacy\n" });
        expect(Object.hasOwn(prior ?? {}, "fields")).toBe(false);
        expect(next).toEqual({ content: "valid\n", fields: { valid: true } });
        return [];
      },
    } } });
    expect(await store.read({ reference: record.reference })).toMatchObject({ status: "refused", refusal: { code: "record-malformed" } });
    success(await store.write(update(f, record, "valid\n")));
    expect(success(await store.read({ reference: record.reference })).content).toBe("valid\n");
  });

  it("exposes newly generated clashes in the prepared view before publishing them", async () => {
    const check: WriteCheck = async ({ reference, prior, before, after }) => {
      if (prior?.content === "current\n") {
        expect(success(await before.read({ reference })).conflicts).toEqual([]);
        const record = success(await after.read({ reference }));
        expect(record.conflicts).toHaveLength(1);
        const conflict = success(await after.read({ reference: record.conflicts[0]! }));
        expect(JSON.parse(conflict.content)).toMatchObject({ current: { content: "current" }, incoming: { content: "incoming" } });
      }
      return [];
    };
    const f = await createRefFixture({ "personal/document": { check } });
    const base = await seed(f, f.reference("personal/document"), "base\n");
    success(await f.store.write(update(f, base, "current\n")));
    const result = success(await f.store.write(update(f, base, "incoming\n")));
    expect(result.conflicts).toHaveLength(1);
    expect(success(await f.store.read({ reference: base.reference })).conflicts).toEqual(result.conflicts);
  });

  it("keeps nonexistent conflict-resolution refs absent from the prepared view", async () => {
    const check: WriteCheck = async ({ before, after }) => {
      expect(success(await before.list({ family: "work-item" })).status).toBe("absent");
      expect(success(await after.list({ family: "work-item" })).status).toBe("absent");
      return [];
    };
    const f = await createRefFixture({ "personal/document": { check } });
    const conflict = RecordReferenceSchema.parse({ owner: { type: "work-item", name: "uncreated" }, kind: "work-item/conflict-record", key: "missing-clash" });
    success(await f.store.write({ action: "put", reference: f.reference("personal/document"), expected: null, content: "kept\n",
      resolves: [conflict], provenance: testProvenance }));
    expect(success(await f.store.list({ family: "work-item" })).status).toBe("absent");
  });

  it.each([...HAND_EDIT_VERBS, "handoff", "custom-verb"])("derives the writer for %s", async (verb) => {
    const expected = HAND_EDIT_VERBS.some((value) => value === verb) ? { kind: "hand-edit" } : { kind: "verb", verb };
    const check: WriteCheck = async ({ writer }) => JSON.stringify(writer) === JSON.stringify(expected) ? [] : [broken("writer.test")];
    const f = await createRefFixture({ "personal/document": { check } });
    success(await f.store.write({ action: "put", reference: f.reference("personal/document"), expected: null,
      content: "accepted\n", provenance: { verb, lifecycleAction: "edit" } }));
    expect(success(await f.store.read({ reference: f.reference("personal/document") })).content).toBe("accepted\n");
  });

  it("runs checks while holding every ref lock in the batch", async () => {
    const held = new Set<string>();
    const check: WriteCheck = async () => held.size === 2 ? [] : [broken("locks.test")];
    const f = await createRefFixture({ "personal/document": { check }, "project-registry/counter": { check } });
    const store = createRefStore({ ...f.ports, lock: async (ref, wait) => {
      const release = await f.ports.lock(ref, wait);
      held.add(ref);
      return async () => { held.delete(ref); await release(); };
    } });
    const references = [f.reference("personal/document"), f.reference("project-registry/counter")];
    success(await store.batch({ writes: references.map((reference) => ({ action: "put", reference, expected: null,
      content: f.content(reference) })), provenance: testProvenance }));
    for (const reference of references) expect(success(await store.read({ reference })).content).toBe(f.content(reference));
  });

  it("refuses an unavailable prior blob and succeeds after restoration", async () => {
    const f = await createRefFixture({ "personal/document": { check: async () => [] } });
    const record = await seed(f, f.reference("personal/document"), "old prior\n");
    const before = await f.settle();
    const oid = (await makeGitExec(f.root)("git", ["rev-parse", `refs/arc/user/test-user/personal:test-user/${record.reference.key}`])).stdout;
    await removeLooseObject(f.root, oid);
    expect(await f.store.write(update(f, record, "new content\n"))).toMatchObject({ status: "refused", refusal: {
      code: "state-unresolvable", reference: record.reference, remedy: { text: expect.stringMatching(/restore|fetch/iu) },
    } });
    expect(await f.settle()).toBe(before);
    await makeGitExecInput(f.root)(["hash-object", "-w", "--stdin"], record.content);
    success(await f.store.write(update(f, record, "new content\n")));
    expect(success(await f.store.read({ reference: record.reference })).content).toBe("new content\n");
  });

  it("runs shipped slug-edge protection over untouched dependents and same-batch settlement", async () => {
    const f = await createRefReadFixture();
    const store = createRefStore({ ...f.ports, registry: createKindRegistry(PRODUCTION_REGISTRATIONS) });
    const originUid = "00000000-0000-4000-8000-000000000001";
    const dependentUid = "00000000-0000-4000-8000-000000000002";
    const dependent = RecordReferenceSchema.parse({ owner: { type: "work-item", name: "dependent", uid: dependentUid }, kind: "work-item/meta" });
    await plantRef(f.root, `refs/arc/work/${dependentUid}`, [
      { path: `metadata-${dependentUid}.json`, content: JSON.stringify({ formatVersion: 1, formats: {}, slug: "dependent",
        primary: { role: "work-item/meta", placement: { kind: "active" } } }) },
      { path: "meta-dependent.md", content: makeMetaFixture("dependent", { dependsOn: ["origin"] }) },
    ]);
    await plantRef(f.root, "refs/arc/project/registry", [
      { path: "metadata-registry.json", content: JSON.stringify({ formatVersion: 1, formats: {}, lineage: { [originUid]: "origin" } }) },
      { path: `lineage/${originUid}.json`, content: JSON.stringify({ schemaVersion: 2, origin: { name: "origin", uid: originUid },
        kind: "abandon", successors: [], incoming: [] }) },
    ]);
    const reference = RecordReferenceSchema.parse({ owner: { type: "work-item", name: "origin" }, kind: "work-item/meta" });
    const create = { action: "put" as const, reference, expected: null, content: makeMetaFixture("origin"), placement: { kind: "active" as const } };
    const provenance = { verb: "activate", lifecycleAction: "activate" };
    const before = success(await store.version());
    expect(await store.write({ ...create, provenance })).toMatchObject({ status: "refused", refusal: {
      code: "record-malformed", rule: "work-item.slug-edges", condition: expect.stringContaining("dependent"),
    } });
    expect(success(await store.version())).toBe(before);
    const prior = success(await store.read({ reference: dependent }));
    const accepted = success(await store.batch({ writes: [create, { action: "put", reference: dependent, expected: prior.version,
      content: makeMetaFixture("dependent", { dependsOn: [] }), placement: { kind: "active" } }], provenance }));
    const created = accepted.writes[0]!.reference;
    expect(created.owner.type === "work-item" && created.owner.uid).not.toBe(originUid);
    expect(success(await store.read({ reference: dependent })).fields).toMatchObject({ dependsOn: [] });
  });
});
