/** Completed cohort membership distinguishes existing holdings from new joins. */
import { describe, expect, it } from "vitest";
import { createRefFixture } from "../helpers/store/ref-fixture.js";
import { createReferenceFixture } from "../helpers/store/reference-fixture.js";
import { ReferenceBackend } from "../helpers/store/reference-backend.js";
import { recordKey } from "../helpers/store/model.js";
import { capturedEntries } from "../helpers/store/ref-fixture-plant.js";
import { plantRef } from "../helpers/store/ref-plant.js";
import { seed, success, update, mutationOf, testProvenance } from "../helpers/store/suite-tools.js";
import { makeMetaFixture } from "../helpers/meta-fixture.js";
import { ArchiveQuarterSchema } from "../../src/lib/kernel/index.js";
import { RecordReferenceSchema, createKindRegistry, type StoreRecord } from "../../src/lib/store/index.js";
import { expandStoredPath } from "../../src/lib/store/stored-path.js";
import { parseMetaRecord } from "../../src/lib/active/meta-reader.js";
import { PRODUCTION_REGISTRATIONS } from "../../src/lib/store/kinds/registrations.js";

const production = createKindRegistry(PRODUCTION_REGISTRATIONS);
const overrides = { "work-item/meta": production["work-item/meta"], "cohort/document": production["cohort/document"] };
const completed = { kind: "completed" as const, quarter: ArchiveQuarterSchema.parse("2026-q4") };
const cohortContent = (name: string, parent: string | null = null) => `# Cohort: \`${name}\`\n\n${parent === null ? "" : `**Parent:** \`${parent}\`\n\n`}**Purpose:** Coordinate work.\n`;
const memberContent = (name: string, cohort: string | null = null, ended = false) => makeMetaFixture(name,
  { cohort, owner: "test-user", workClass: "Light", state: ended ? "Shipped" : "Active", currentWorkflow: ended ? null : "process-task-loop" });
async function fixture(backend: "reference" | "ref") {
  return backend === "ref" ? { backend: "ref" as const, f: await createRefFixture(overrides) }
    : { backend: "reference" as const, f: createReferenceFixture({}, overrides) };
}
async function plantHolding(h: Awaited<ReturnType<typeof fixture>>, member: StoreRecord, path: string) {
  const content = memberContent(member.reference.owner.name, path);
  if (h.backend === "ref") {
    const home = expandStoredPath(member.reference);
    const entries = (await capturedEntries(h.f, home.ref)).map(entry => entry.path === home.path ? { path: home.path, content } : entry);
    await plantRef(h.f.root, home.ref, entries, { gitDir: h.f.gitDir });
  } else {
    if (!(h.f.store instanceof ReferenceBackend)) throw new Error("Expected reference state");
    const stored = h.f.store.state.records.get(recordKey(member.reference));
    if (stored === undefined) throw new Error("Missing straggler record");
    stored.content = content;
    stored.fields = parseMetaRecord(content);
  }
  return success(await h.f.store.read({ reference: member.reference }));
}

describe.each(["reference", "ref"] as const)("completed cohort paths over %s", backend => {
  it("admits a completed meta's rewrite while refusing an open meta's new join", async () => {
    const { f } = await fixture(backend);
    const ref = f.reference("cohort/document", "group");
    const group = await seed(f, ref, cohortContent(ref.owner.name));
    success(await f.store.write({ ...update(f, group, group.content), placement: completed }));
    const activeRef = f.reference("work-item/meta", "active"), endedRef = f.reference("work-item/meta", "ended");
    const active = await seed(f, activeRef, memberContent(activeRef.owner.name));
    const ended = await seed(f, endedRef, memberContent(endedRef.owner.name, null, true), completed);
    expect(await f.store.write(update(f, active, memberContent(activeRef.owner.name, ref.owner.name))))
      .toMatchObject({ status: "refused", refusal: { rule: "meta.cohort" } });
    success(await f.store.write(update(f, ended, memberContent(endedRef.owner.name, ref.owner.name, true))));
  });

  it("admits an open straggler re-pointing a completed cohort's former name", async () => {
    const h = await fixture(backend), { f } = h;
    const ref = f.reference("cohort/document", "group");
    const group = await seed(f, ref, cohortContent(ref.owner.name));
    const renamed = RecordReferenceSchema.parse({ ...group.reference, owner: { ...group.reference.owner, name: "renamed" } });
    success(await f.store.write({ ...update(f, group, cohortContent("renamed")), reference: renamed }));
    const current = success(await f.store.read({ reference: renamed }));
    success(await f.store.write({ ...update(f, current, current.content), placement: completed }));
    const memberRef = f.reference("work-item/meta", "straggler");
    const member = await seed(f, memberRef, memberContent(memberRef.owner.name));
    const straggler = await plantHolding(h, member, ref.owner.name);
    success(await f.store.write(update(f, straggler, memberContent(memberRef.owner.name, "renamed"))));
  });

  it("rewrites a closed subcohort's Parent with its open straggler's path in one batch", async () => {
    const h = await fixture(backend), { f } = h;
    const parentRef = f.reference("cohort/document", "parent"), childRef = f.reference("cohort/document", "child");
    const parent = await seed(f, parentRef, cohortContent(parentRef.owner.name));
    const child = await seed(f, childRef, cohortContent(childRef.owner.name, parentRef.owner.name));
    success(await f.store.write({ ...update(f, child, child.content), placement: completed }));
    const memberRef = f.reference("work-item/meta", "straggler");
    const member = await seed(f, memberRef, memberContent(memberRef.owner.name));
    const straggler = await plantHolding(h, member, `${parentRef.owner.name}/${childRef.owner.name}`);
    const renamed = RecordReferenceSchema.parse({ ...parent.reference, owner: { ...parent.reference.owner, name: "renamed" } });
    success(await f.store.write({ ...update(f, parent, cohortContent("renamed")), reference: renamed }));
    const closed = success(await f.store.read({ reference: child.reference }));
    success(await f.store.batch({ writes: [
      mutationOf(update(f, closed, cohortContent(childRef.owner.name, "renamed"))),
      mutationOf(update(f, straggler, memberContent(memberRef.owner.name, `renamed/${childRef.owner.name}`))),
    ], provenance: testProvenance }));
    expect(success(await f.store.read({ reference: child.reference })).placement?.kind).toBe("completed");
  });
});
