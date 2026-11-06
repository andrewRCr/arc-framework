/** A stale writer's pulled membership names its field repair after the cohort is removed. */
import { describe, expect, it } from "vitest";
import { RecordReferenceSchema, type Store, type StoreRecord } from "../../src/lib/store/index.js";
import { writeMetaCohort } from "../../src/lib/store/kinds/meta/writers.js";
import { recordPut } from "../../src/lib/store/lifecycle-write.js";
import { createLifecycleHarness } from "../helpers/store/lifecycle-harness.js";
import { createMemoryRemote } from "../helpers/store/sync.js";
import { refSyncFixture } from "../helpers/store/ref-sync.js";
import { success } from "../helpers/store/suite-tools.js";
import { repairCli, repairCliFixture } from "../helpers/repair-cli.js";
import { makeMetaFixture } from "../helpers/meta-fixture.js";

const provenance = { verb: "fixture", lifecycleAction: "create" };
const cohortContent = (name: string, parent?: string) => `# Cohort: \`${name}\`\n\n**Purpose:** Coordinate.\n${parent === undefined ? "" : `\n**Parent:** \`${parent}\`\n`}`;

async function topology(backend: "reference" | "ref") {
  if (backend === "reference") {
    const a = createLifecycleHarness(), b = createLifecycleHarness(), remote = createMemoryRemote();
    a.store.context.publication.remote = remote; b.store.context.publication.remote = remote;
    return { store: a.store, peer: b.store, storeFactory: async (): Promise<Store> => a.store };
  }
  const h = await refSyncFixture();
  const fresh = async (side: typeof h.a): Promise<Store> => {
    const { createRefStore } = await import("../../src/lib/store/create.js");
    const { createDefaultRefStorePorts } = await import("../../src/lib/store/default-ports.js");
    return createRefStore({ ...createDefaultRefStorePorts({ checkoutRoot: side.root, backingRepository: async () => null }),
      actor: side.ports.actor, clock: side.ports.clock, random: side.ports.random });
  };
  return { store: await fresh(h.a), peer: await fresh(h.b), storeFactory: () => fresh(h.a) };
}

async function seedCohort(store: Store, name: string, parent?: string): Promise<StoreRecord> {
  const made = success(await store.write({ action: "put", expected: null, provenance, content: cohortContent(name, parent),
    reference: RecordReferenceSchema.parse({ kind: "cohort/document", owner: { type: "cohort", name } }) }));
  return success(await store.read({ reference: made.reference }));
}

async function fixture(backend: "reference" | "ref", nested: boolean) {
  const cli = await repairCliFixture(), h = await topology(backend), group = await seedCohort(h.store, "removed");
  success(await h.store.push()); success(await h.peer.pull());
  success(await h.store.batch({ writes: [{ action: "remove", reference: group.reference, expected: group.version }],
    provenance: { verb: "cohort-remove", lifecycleAction: "remove" } }));
  if (nested) await seedCohort(h.peer, "child", "removed");
  const path = nested ? "removed/child" : "removed";
  const made = success(await h.peer.write({ action: "put", expected: null, provenance, placement: { kind: "active" },
    reference: RecordReferenceSchema.parse({ kind: "work-item/meta", owner: { type: "work-item", name: "arrived" } }),
    content: makeMetaFixture("arrived", { cohort: path }) }));
  success(await h.peer.push()); success(await h.store.pull());
  expect(await h.store.read({ reference: group.reference })).toMatchObject({ status: "refused", refusal: { code: "not-found" } });
  const member = success(await h.store.read({ reference: made.reference }));
  return { ...h, member, path, invoke: (args: readonly string[]) => repairCli(cli, args, { storeFactory: h.storeFactory }) };
}

describe.each(["reference", "ref"] as const)("missing cohort CLI repair over %s", backend => {
  it("refuses joining a child whose parent was removed and retries after restoring the parent", async () => {
    const h = await fixture(backend, true);
    const made = success(await h.store.write({ action: "put", expected: null, provenance, placement: { kind: "active" },
      reference: RecordReferenceSchema.parse({ kind: "work-item/meta", owner: { type: "work-item", name: "joining" } }),
      content: makeMetaFixture("joining") }));
    const member = success(await h.store.read({ reference: made.reference })), before = success(await h.store.version());
    const content = writeMetaCohort(member.content, h.path);
    const edit = { ...recordPut(member, { content }), provenance: { verb: "edit", lifecycleAction: "edit" } };
    expect(await h.store.write(edit)).toMatchObject({ status: "refused", refusal: { code: "record-malformed", rule: "meta.cohort",
      condition: expect.stringContaining("parent cohort document is absent") } });
    expect(success(await h.store.version())).toBe(before);
    expect(success(await h.store.read({ reference: member.reference }))).toEqual(member);
    await seedCohort(h.store, "removed");
    success(await h.store.write(edit));
    expect(success(await h.store.read({ reference: member.reference }))).toMatchObject({ content, fields: { cohort: h.path } });
  }, 60_000);

  it.each([false, true])("rename names the member's Cohort edit and succeeds after it, nested=%s", async nested => {
    const h = await fixture(backend, nested), before = success(await h.store.version());
    const refused = await h.invoke(["rename", "arrived", "renamed"]), text = refused.stdout + refused.stderr;
    expect(refused.exitCode).toBe(1);
    expect(text).toContain("arrived"); expect(text).toContain(h.path);
    expect(text).toMatch(/clear.*Cohort.*re-point/isu);
    expect(text).not.toContain("Pull state or name the owner by UID");
    expect(success(await h.store.version())).toBe(before);
    expect(success(await h.store.read({ reference: h.member.reference }))).toEqual(h.member);
    success(await h.store.write({ ...recordPut(h.member, { content: writeMetaCohort(h.member.content, null) }),
      provenance: { verb: "edit", lifecycleAction: "edit" } }));
    const renamed = await h.invoke(["rename", "arrived", "renamed"]);
    expect(renamed.exitCode ?? 0, renamed.stdout + renamed.stderr).toBe(0);
    expect(success(await h.store.read({ reference: h.member.reference })).reference.owner.name).toBe("renamed");
  }, 60_000);

  it.each([false, true])("archive names the member's Cohort edit and succeeds after it, nested=%s", async nested => {
    const h = await fixture(backend, nested), before = success(await h.store.version());
    const refused = await h.invoke(["archive", "arrived"]), text = refused.stdout + refused.stderr;
    expect(refused.exitCode).toBe(1);
    expect(text).toContain("arrived"); expect(text).toContain(h.path);
    expect(text).toMatch(/clear.*Cohort.*re-point/isu);
    expect(text).not.toContain("Pull state or name the owner by UID");
    expect(success(await h.store.version())).toBe(before);
    expect(success(await h.store.read({ reference: h.member.reference }))).toEqual(h.member);
    success(await h.store.write({ ...recordPut(h.member, { content: writeMetaCohort(h.member.content, null) }),
      provenance: { verb: "edit", lifecycleAction: "edit" } }));
    const archived = await h.invoke(["archive", "arrived"]);
    expect(archived.exitCode ?? 0, archived.stdout + archived.stderr).toBe(0);
    expect(success(await h.store.read({ reference: h.member.reference })).placement?.kind).toBe("completed");
  }, 60_000);
});
