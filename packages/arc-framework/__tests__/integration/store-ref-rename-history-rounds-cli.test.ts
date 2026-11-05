/** Registered renames pull only the successive histories their completed writes require. */
import { describe, expect, it } from "vitest";
import { refSyncFixture, type RefSyncFixture } from "../helpers/store/ref-sync.js";
import { success } from "../helpers/store/suite-tools.js";
import { makeMetaFixture } from "../helpers/meta-fixture.js";
import { repairCliFixture, repairCli } from "../helpers/repair-cli.js";
import { ArchiveQuarterSchema } from "../../src/lib/kernel/index.js";
import { RecordReferenceSchema, createKindRegistry } from "../../src/lib/store/index.js";
import { PRODUCTION_REGISTRATIONS } from "../../src/lib/store/kinds/registrations.js";
import { recordPut } from "../../src/lib/store/lifecycle-write.js";

async function productionStore(checkout: RefSyncFixture["a"]) {
  const { createRefStore } = await import("../../src/lib/store/create.js");
  const { createDefaultRefStorePorts } = await import("../../src/lib/store/default-ports.js");
  const fresh = createDefaultRefStorePorts({ checkoutRoot: checkout.root, backingRepository: async () => null });
  return createRefStore({ ...fresh, registry: createKindRegistry(PRODUCTION_REGISTRATIONS), identity: checkout.ports.identity,
    actor: checkout.ports.actor, clock: checkout.ports.clock, random: checkout.ports.random });
}

describe.each(["default", "separate"] as const)("rename history rounds in the %s layout", layout => {
  it("pulls successive work-unit and cohort histories without pulling unrelated retained work", async () => {
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
    for (const history of [...histories, unrelatedHistory]) expect((await h.b.git(["for-each-ref", "--format=%(refname)", history])).stdout).toBe("");
    const before = success(await b.read({ reference: member.reference })), document = success(await b.read({ reference: cohort.reference }));
    const cli = await repairCliFixture();
    const result = await repairCli(cli, ["rename", memberOwner.uid.toUpperCase(), "after", "--json"], { storeFactory: () => productionStore(h.b) });
    expect(result.exitCode ?? 0, result.stdout + result.stderr).toBe(0);
    expect(result.result).toMatchObject({ status: "renamed", shape: "archived" });
    const after = success(await b.read({ reference: member.reference })), renamedDocument = success(await b.read({ reference: cohort.reference }));
    expect(after.reference.owner.name).toBe("after"); expect(after.placement).toEqual(before.placement);
    expect(renamedDocument.content).toContain("### `after`"); expect(renamedDocument.placement).toEqual(document.placement);
    for (const history of histories) expect((await h.b.git(["for-each-ref", "--format=%(refname)", history])).stdout.trim()).toBe(history);
    expect((await h.b.git(["for-each-ref", "--format=%(refname)", unrelatedHistory])).stdout).toBe("");
    expect(success(await b.read({ reference: unrelated.reference })).reference.owner.name).toBe("unrelated");
  }, 60_000);
});
