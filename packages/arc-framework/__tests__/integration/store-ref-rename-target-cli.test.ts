/** Rename target admission shares creation's ranked namespace over both backends. */
import { describe, expect, it } from "vitest";
import { createKindRegistry } from "../../src/lib/store/index.js";
import { PRODUCTION_REGISTRATIONS } from "../../src/lib/store/kinds/registrations.js";
import { ArchiveQuarterSchema, SlugSchema } from "../../src/lib/kernel/index.js";
import { createRefFixture } from "../helpers/store/ref-fixture.js";
import { createReferenceFixture } from "../helpers/store/reference-fixture.js";
import { seed, success } from "../helpers/store/suite-tools.js";
import { makeMetaFixture } from "../helpers/meta-fixture.js";
import { repairCliFixture, repairCli } from "../helpers/repair-cli.js";
import { recordPut } from "../../src/lib/store/lifecycle-write.js";
import { writeMetaDependsOn } from "../../src/lib/store/kinds/meta/writers.js";

const production = createKindRegistry(PRODUCTION_REGISTRATIONS);
const completed = { kind: "completed" as const, quarter: ArchiveQuarterSchema.parse("2026-q4") };

async function fixture(backend: "reference" | "ref") {
  const cli = await repairCliFixture();
  const native = backend === "ref" ? await createRefFixture(production) : undefined;
  const state = native ?? createReferenceFixture({}, production);
  const storeFactory = async () => {
    if (native === undefined) return state.store;
    const { createRefStore } = await import("../../src/lib/store/create.js");
    const { createDefaultRefStorePorts } = await import("../../src/lib/store/default-ports.js");
    const fresh = createDefaultRefStorePorts({ checkoutRoot: native.root, backingRepository: async () => null });
    return createRefStore({ ...fresh, registry: native.ports.registry, identity: native.ports.identity,
      actor: native.ports.actor, clock: native.ports.clock, random: native.ports.random });
  };
  return { ...state, cli, invoke: (args: readonly string[]) => repairCli(cli, args, { storeFactory }) };
}

describe.each(["reference", "ref"] as const)("rename target reuse over %s", backend => {
  it("settles the subject and a stub against one shared archived provider", async () => {
    const f = await fixture(backend), sourceRef = f.reference("work-item/meta", "source"), targetRef = f.reference("work-item/meta", "target");
    const target = await seed(f, targetRef, makeMetaFixture(targetRef.owner.name, { state: "Shipped", currentWorkflow: null }), completed);
    const source = await seed(f, sourceRef, makeMetaFixture(sourceRef.owner.name,
      { state: "Planning", currentWorkflow: null, dependsOn: [target.reference.owner.name] }), { kind: "backlog", commitment: "planned" });
    const stubRef = f.reference("work-item/meta", "waiting");
    const stub = await seed(f, stubRef, makeMetaFixture(stubRef.owner.name,
      { state: "Planning", currentWorkflow: null, dependsOn: [target.reference.owner.name] }), { kind: "backlog", commitment: "planned" });
    if (source.reference.owner.type !== "work-item" || source.reference.owner.uid === undefined) throw new Error("Expected source UID");
    const result = await f.invoke(["rename", source.reference.owner.uid, target.reference.owner.name, "--json"]);
    expect(result.exitCode ?? 0, result.stdout + result.stderr).toBe(0);
    for (const record of [source, stub]) {
      expect(success(await f.store.read({ reference: record.reference })).fields).toMatchObject({ dependsOn: [] });
    }
    expect(success(await f.store.read({ reference: target.reference }))).toEqual(target);
    const histories = await Promise.all([source, stub].map(async record => success(await f.store.history({ reference: record.reference }))));
    const own = histories[0]?.[0]?.provenance, settled = histories[1]?.[0]?.provenance;
    if (own === undefined || settled === undefined || !("batchId" in own) || !("batchId" in settled)) throw new Error("Expected atomic rename provenance");
    expect(own.batchId).toBe(settled.batchId);
  }, 60_000);

  it.each(["in-flight", "both-names"] as const)("keeps the %s dependency refusal and lands after explicit repair", async kind => {
    const f = await fixture(backend), sourceRef = f.reference("work-item/meta", "source"), targetRef = f.reference("work-item/meta", "target");
    const target = await seed(f, targetRef, makeMetaFixture(targetRef.owner.name, { state: "Shipped", currentWorkflow: null }), completed);
    const source = await seed(f, sourceRef, makeMetaFixture(sourceRef.owner.name, { state: "Planning", currentWorkflow: null }),
      { kind: "backlog", commitment: "provisional" });
    const stubRef = f.reference("work-item/meta", "waiting"), active = kind === "in-flight";
    const waiting = await seed(f, stubRef, makeMetaFixture(stubRef.owner.name, { state: active ? "Active" : "Planning",
      currentWorkflow: active ? "process-task-loop" : null,
      dependsOn: active ? [target.reference.owner.name] : [source.reference.owner.name, target.reference.owner.name] }),
    active ? { kind: "active" } : { kind: "backlog", commitment: "planned" });
    if (source.reference.owner.type !== "work-item" || source.reference.owner.uid === undefined) throw new Error("Expected source UID");
    const argv = ["rename", source.reference.owner.uid, target.reference.owner.name, "--json"], before = success(await f.store.version());
    const refused = await f.invoke(argv);
    expect(refused.exitCode).toBe(1);
    expect(refused.result).toMatchObject({ status: "rejected", refusal: { rule: "work-item.slug-edges" },
      remedy: { text: expect.stringContaining(active ? "arc wu reconcile --apply" : "Anyone may edit a stub's edge") } });
    expect(success(await f.store.version())).toBe(before);
    for (const record of [source, target, waiting]) expect(success(await f.store.read({ reference: record.reference }))).toEqual(record);
    success(await f.store.write({ ...recordPut(waiting, { content: writeMetaDependsOn(waiting.content, active ? [] : [source.reference.owner.name]) }),
      provenance: { verb: "write-back", lifecycleAction: "edit" } }));
    const renamed = await f.invoke(argv);
    expect(renamed.exitCode ?? 0, renamed.stdout + renamed.stderr).toBe(0);
    expect(success(await f.store.read({ reference: waiting.reference })).fields).toMatchObject({ dependsOn: active ? [] : [target.reference.owner.name] });
    expect(success(await f.store.read({ reference: target.reference }))).toEqual(target);
  }, 60_000);

  it("settles a stub's edge to the archived target in the rename's single batch", async () => {
    const f = await fixture(backend), sourceRef = f.reference("work-item/meta", "source"), targetRef = f.reference("work-item/meta", "target");
    const target = await seed(f, targetRef, makeMetaFixture(targetRef.owner.name, { state: "Shipped", currentWorkflow: null }), completed);
    const source = await seed(f, sourceRef, makeMetaFixture(sourceRef.owner.name, { state: "Planning", currentWorkflow: null }),
      { kind: "backlog", commitment: "provisional" });
    const stubRef = f.reference("work-item/meta", "waiting");
    const stub = await seed(f, stubRef, makeMetaFixture(stubRef.owner.name,
      { state: "Planning", currentWorkflow: null, dependsOn: [target.reference.owner.name] }), { kind: "backlog", commitment: "planned" });
    if (source.reference.owner.type !== "work-item" || source.reference.owner.uid === undefined) throw new Error("Expected source UID");
    const result = await f.invoke(["rename", source.reference.owner.uid, target.reference.owner.name, "--json"]);
    expect(result.exitCode ?? 0, result.stdout + result.stderr).toBe(0);
    expect(success(await f.store.read({ reference: source.reference })).reference.owner.name).toBe(target.reference.owner.name);
    expect(success(await f.store.read({ reference: stub.reference })).fields).toMatchObject({ dependsOn: [] });
    expect(success(await f.store.read({ reference: target.reference }))).toEqual(target);
    const ownHistory = success(await f.store.history({ reference: source.reference })), stubHistory = success(await f.store.history({ reference: stub.reference }));
    const own = ownHistory[0]?.provenance, settled = stubHistory[0]?.provenance;
    if (own === undefined || settled === undefined || !("batchId" in own) || !("batchId" in settled)) throw new Error("Expected atomic rename provenance");
    expect(settled.batchId).toBe(own.batchId);
    expect(stubHistory.filter(entry => "batchId" in entry.provenance && entry.provenance.batchId === own.batchId)).toHaveLength(1);
  }, 60_000);

  it("reuses an archived work unit's current slug without changing that owner", async () => {
    const f = await fixture(backend), sourceRef = f.reference("work-item/meta", "source"), targetRef = f.reference("work-item/meta", "target");
    const target = await seed(f, targetRef, makeMetaFixture(targetRef.owner.name, { state: "Shipped", currentWorkflow: null }), completed);
    const source = await seed(f, sourceRef, makeMetaFixture(sourceRef.owner.name, { state: "Planning", currentWorkflow: null }),
      { kind: "backlog", commitment: "provisional" });
    if (source.reference.owner.type !== "work-item" || source.reference.owner.uid === undefined) throw new Error("Expected source UID");
    const result = await f.invoke(["rename", source.reference.owner.uid, target.reference.owner.name, "--json"]);
    expect(result.exitCode ?? 0, result.stdout + result.stderr).toBe(0);
    const renamed = success(await f.store.read({ reference: source.reference }));
    expect(renamed.reference.owner).toEqual({ ...source.reference.owner, name: target.reference.owner.name });
    expect(success(await f.store.read({ reference: target.reference }))).toEqual(target);
    expect(success(await f.store.lookup({ kind: "slug", slug: SlugSchema.parse(target.reference.owner.name) })).reference).toEqual(renamed.reference);
    expect(result.result).toMatchObject({ status: "renamed", reference: renamed.reference });
  }, 60_000);
});
