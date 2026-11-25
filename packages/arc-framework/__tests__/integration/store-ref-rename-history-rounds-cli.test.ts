/** Registered renames pull only the successive histories their completed writes require. */
import { describe, expect, it } from "vitest";
import { refSyncFixture, type RefSyncFixture } from "../helpers/store/ref-sync.js";
import { success } from "../helpers/store/suite-tools.js";
import { makeMetaFixture } from "../helpers/meta-fixture.js";
import { repairCliFixture, repairCli } from "../helpers/repair-cli.js";
import { ArchiveQuarterSchema, SlugSchema } from "../../src/lib/kernel/index.js";
import { RecordReferenceSchema, createKindRegistry } from "../../src/lib/store/index.js";
import { PRODUCTION_REGISTRATIONS } from "../../src/lib/store/kinds/registrations.js";
import type { WritePlacement } from "../../src/lib/store/placement.js";
import { recordPut } from "../../src/lib/store/lifecycle-write.js";

async function productionStore(checkout: RefSyncFixture["a"]) {
  const { createRefStore } = await import("../../src/lib/store/create.js");
  const { createDefaultRefStorePorts } = await import("../../src/lib/store/default-ports.js");
  const fresh = createDefaultRefStorePorts({ checkoutRoot: checkout.root, backingRepository: async () => null });
  return createRefStore({ ...fresh, registry: createKindRegistry(PRODUCTION_REGISTRATIONS), identity: checkout.ports.identity,
    actor: checkout.ports.actor, clock: checkout.ports.clock, random: checkout.ports.random });
}

describe.each(["default", "separate"] as const)("rename history rounds in the %s layout", layout => {
  it("keeps the selected archived owner when its history pull imports a live namesake cohort", async () => {
    const h = await refSyncFixture(layout), a = await productionStore(h.a), b = await productionStore(h.b);
    const created = success(await a.write({ action: "put", expected: null,
      reference: RecordReferenceSchema.parse({ kind: "work-item/meta", owner: { type: "work-item", name: "before" } }),
      content: makeMetaFixture("before", { state: "Shipped", currentWorkflow: null }),
      placement: { kind: "completed", quarter: ArchiveQuarterSchema.parse("2026-q4") },
      provenance: { verb: "archive", lifecycleAction: "archive" } }));
    success(await a.push()); success(await b.pull());
    expect(success(await b.lookup({ kind: "slug", slug: SlugSchema.parse("before") })).reference).toEqual(created.reference);
    const arriving = success(await a.write({ action: "put", expected: null,
      reference: RecordReferenceSchema.parse({ kind: "cohort/document", owner: { type: "cohort", name: "before" } }),
      content: "# Cohort: `before`\n\n**Purpose:** Coordinate.\n", provenance: { verb: "create", lifecycleAction: "create" } }));
    const cli = await repairCliFixture();
    let published = false;
    const result = await repairCli(cli, ["rename", "before", "after", "--json"], { storeFactory: async () => {
      const store = await productionStore(h.b);
      return { ...store, pull: async input => {
        if (!published) { published = true; success(await a.push()); }
        return store.pull(input);
      } };
    } });
    expect(result.exitCode ?? 0, result.stdout + result.stderr).toBe(0);
    expect(result.result).toMatchObject({ status: "renamed", shape: "archived", reference: {
      kind: "work-item/meta", owner: { ...created.reference.owner, name: "after" },
    } });
    expect(success(await b.read({ reference: created.reference })).reference.owner.name).toBe("after");
    expect(success(await b.read({ reference: arriving.reference })).reference).toEqual(arriving.reference);
  }, 60_000);

  it("renames a mixed-state cohort while pulling only its completed holdings' histories", async () => {
    const h = await refSyncFixture(layout), a = await productionStore(h.a), b = await productionStore(h.b);
    const completed = { kind: "completed" as const, quarter: ArchiveQuarterSchema.parse("2026-q4") };
    const put = async (kind: "cohort/document" | "work-item/meta", name: string, content: string, placement?: WritePlacement) => {
      const written = success(await a.write({ action: "put", expected: null,
        reference: RecordReferenceSchema.parse({ kind, owner: { type: kind === "cohort/document" ? "cohort" : "work-item", name } }),
        content, ...(placement === undefined ? {} : { placement }), provenance: { verb: "create", lifecycleAction: "create" } }));
      return success(await a.read({ reference: written.reference }));
    };
    const document = (name: string, parent?: string) => `# Cohort: \`${name}\`\n\n**Purpose:** See \`cohort-parent.md\`.\n${parent === undefined ? "" : `\n**Parent:** \`${parent}\`\n`}`;
    const parent = await put("cohort/document", "parent", document("parent"));
    const open = await put("cohort/document", "open-child", document("open-child", "parent"));
    const child = await put("cohort/document", "closed-child", document("closed-child", "parent"));
    const members = [];
    for (const [name, state, cohort] of [["started", "Active", "parent"], ["completed", "Shipped", "parent"],
      ["closed-member", "Shipped", "parent/closed-child"], ["waiting", "Planning", "parent/open-child"]] as const) {
      members.push(await put("work-item/meta", name, `${makeMetaFixture(name,
        { state, currentWorkflow: state === "Active" ? "process-task-loop" : null, cohort })}\nSee \`cohort-parent.md\`.\n`,
      state === "Shipped" ? completed : state === "Active" ? { kind: "active" } : { kind: "backlog", commitment: "planned" }));
    }
    success(await a.write({ ...recordPut(child, { placement: completed }), provenance: { verb: "cohort-close", lifecycleAction: "close" } }));
    const closed = success(await a.read({ reference: child.reference }));
    const unrelated = await put("work-item/meta", "unrelated", makeMetaFixture("unrelated", { state: "Shipped", currentWorkflow: null }), completed);
    const history = (record: typeof parent) => {
      const owner = record.reference.owner;
      if (owner.type === "person" || owner.uid === undefined) throw new Error("Expected completed owner UID");
      return `refs/arc/history/${owner.type === "cohort" ? "cohort" : "work"}/${owner.uid}`;
    };
    const histories = [closed, ...members.filter(member => member.placement?.kind === "completed")].map(history);
    const unrelatedHistory = history(unrelated);
    success(await a.push()); success(await b.pull());
    for (const ref of [...histories, unrelatedHistory]) expect((await h.b.git(["for-each-ref", "--format=%(refname)", ref])).stdout).toBe("");
    const before = await Promise.all([parent, open, closed, ...members].map(async record => success(await b.read({ reference: record.reference }))));
    const retained = success(await b.read({ reference: unrelated.reference }));
    const owner = parent.reference.owner;
    if (owner.type !== "cohort" || owner.uid === undefined) throw new Error("Expected parent UID");
    const cli = await repairCliFixture();
    const result = await repairCli(cli, ["rename", owner.uid, "after", "--json"], { storeFactory: () => productionStore(h.b) });
    expect(result.exitCode ?? 0, result.stdout + result.stderr).toBe(0);
    expect(result.result).toMatchObject({ status: "renamed", shape: "cohort", recordBatch: "applied" });
    for (const ref of histories) expect((await h.b.git(["for-each-ref", "--format=%(refname)", ref])).stdout.trim()).toBe(ref);
    expect((await h.b.git(["for-each-ref", "--format=%(refname)", unrelatedHistory])).stdout).toBe("");
    const after = await Promise.all(before.map(async record => success(await b.read({ reference: record.reference }))));
    expect(after[0]?.content).toContain("# Cohort: `after`");
    for (const current of after.slice(0, 2)) expect(current.content).toContain("See `cohort-after.md`.");
    for (const current of after.slice(1, 3)) expect(current.fields).toMatchObject({ parent: "after" });
    expect(after[2]?.content).toContain("See `cohort-parent.md`.");
    for (const [index, current] of after.entries()) {
      expect(current.placement).toEqual(before[index]?.placement);
      if (index >= 3) expect(current.fields).toMatchObject({ cohort: index < 5 ? "after" : index === 5 ? "after/closed-child" : "after/open-child" });
    }
    expect(after[6]?.content).toContain("See `cohort-after.md`.");
    const events = await Promise.all(after.map(async record => success(await b.history({ reference: record.reference }))[0]?.provenance));
    const event = events[0];
    if (event === undefined || !("batchId" in event)) throw new Error("Expected composed cohort batch");
    for (const other of events) expect(other).toMatchObject({ batchId: event.batchId });
    expect(success(await b.read({ reference: unrelated.reference }))).toEqual(retained);
  }, 60_000);

  it("reuses an archived target and settles edges while pulling successive subject histories", async () => {
    const h = await refSyncFixture(layout);
    const a = await productionStore(h.a), b = await productionStore(h.b);
    const placement = { kind: "completed" as const, quarter: ArchiveQuarterSchema.parse("2026-q4") };
    const cohortRef = RecordReferenceSchema.parse({ owner: { type: "cohort", name: "group" }, kind: "cohort/document" });
    const createdCohort = success(await a.write({ action: "put", reference: cohortRef, expected: null,
      content: "# Cohort: `group`\n\n**Purpose:** Coordinate.\n\n## Members\n\n### `before`\n",
      provenance: { verb: "cohort", lifecycleAction: "create" } }));
    const cohort = success(await a.read({ reference: createdCohort.reference }));
    const member = success(await a.write({ action: "put", expected: null, placement,
      reference: RecordReferenceSchema.parse({ owner: { type: "work-item", name: "before" }, kind: "work-item/meta" }),
      content: makeMetaFixture("before", { state: "Shipped", currentWorkflow: null, cohort: "group" }),
      provenance: { verb: "archive", lifecycleAction: "archive" } }));
    success(await a.write({ ...recordPut(cohort, { content: cohort.content, placement }),
      provenance: { verb: "archive", lifecycleAction: "archive" } }));
    const target = success(await a.write({ action: "put", expected: null, placement,
      reference: RecordReferenceSchema.parse({ owner: { type: "work-item", name: "reused" }, kind: "work-item/meta" }),
      content: makeMetaFixture("reused", { state: "Shipped", currentWorkflow: null }),
      provenance: { verb: "archive", lifecycleAction: "archive" } }));
    const waiting = success(await a.write({ action: "put", expected: null, placement: { kind: "backlog", commitment: "planned" },
      reference: RecordReferenceSchema.parse({ owner: { type: "work-item", name: "waiting" }, kind: "work-item/meta" }),
      content: makeMetaFixture("waiting", { state: "Planning", currentWorkflow: null, dependsOn: ["reused"] }),
      provenance: { verb: "create", lifecycleAction: "create" } }));
    const unrelated = success(await a.write({ action: "put", expected: null, placement,
      reference: RecordReferenceSchema.parse({ owner: { type: "work-item", name: "unrelated" }, kind: "work-item/meta" }),
      content: makeMetaFixture("unrelated", { state: "Shipped", currentWorkflow: null }),
      provenance: { verb: "archive", lifecycleAction: "archive" } }));
    const memberOwner = member.reference.owner, cohortOwner = cohort.reference.owner, unrelatedOwner = unrelated.reference.owner;
    if (memberOwner.type !== "work-item" || cohortOwner.type !== "cohort" || unrelatedOwner.type !== "work-item"
      || memberOwner.uid === undefined || cohortOwner.uid === undefined || unrelatedOwner.uid === undefined) throw new Error("Expected owner UIDs");
    const histories = [`refs/arc/history/work/${memberOwner.uid}`, `refs/arc/history/cohort/${cohortOwner.uid}`];
    const unrelatedHistory = `refs/arc/history/work/${unrelatedOwner.uid}`;
    success(await a.push()); success(await b.pull());
    const targetOwner = target.reference.owner;
    if (targetOwner.type !== "work-item" || targetOwner.uid === undefined) throw new Error("Expected target UID");
    const targetHistory = `refs/arc/history/work/${targetOwner.uid}`;
    for (const history of [...histories, unrelatedHistory, targetHistory]) expect((await h.b.git(["for-each-ref", "--format=%(refname)", history])).stdout).toBe("");
    const before = success(await b.read({ reference: member.reference })), document = success(await b.read({ reference: cohort.reference }));
    const retainedTarget = success(await b.read({ reference: target.reference }));
    const cli = await repairCliFixture();
    const result = await repairCli(cli, ["rename", memberOwner.uid.toUpperCase(), "reused", "--json"], { storeFactory: () => productionStore(h.b) });
    expect(result.exitCode ?? 0, result.stdout + result.stderr).toBe(0);
    expect(result.result).toMatchObject({ status: "renamed", shape: "archived" });
    const after = success(await b.read({ reference: member.reference })), renamedDocument = success(await b.read({ reference: cohort.reference }));
    expect(after.reference.owner.name).toBe("reused"); expect(after.placement).toEqual(before.placement);
    expect(renamedDocument.content).toContain("### `reused`"); expect(renamedDocument.placement).toEqual(document.placement);
    const settled = success(await b.read({ reference: waiting.reference }));
    expect(settled.fields).toMatchObject({ dependsOn: [] });
    const ownEvent = success(await b.history({ reference: after.reference }))[0]?.provenance;
    const settledEvent = success(await b.history({ reference: settled.reference }))[0]?.provenance;
    expect(ownEvent).toMatchObject({ batchId: expect.any(String) });
    expect(settledEvent).toMatchObject({ batchId: ownEvent !== undefined && "batchId" in ownEvent ? ownEvent.batchId : undefined });
    expect(success(await b.read({ reference: target.reference }))).toEqual(retainedTarget);
    for (const history of histories) expect((await h.b.git(["for-each-ref", "--format=%(refname)", history])).stdout.trim()).toBe(history);
    expect((await h.b.git(["for-each-ref", "--format=%(refname)", unrelatedHistory])).stdout).toBe("");
    expect((await h.b.git(["for-each-ref", "--format=%(refname)", targetHistory])).stdout).toBe("");
    expect(success(await b.read({ reference: unrelated.reference })).reference.owner.name).toBe("unrelated");
  }, 60_000);
});
