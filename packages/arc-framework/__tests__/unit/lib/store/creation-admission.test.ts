import type { Store } from "../../../../src/lib/store/contract.js";
import { StoreRefusalSchema } from "../../../../src/lib/store/refusal.js";
import { StoreRecordSchema, type StoreRecord } from "../../../../src/lib/store/read.js";
/** Creation admission follows ranked lookup and retains its refusal evidence. */
import { ArchiveQuarterSchema, SlugSchema } from "../../../../src/lib/kernel/index.js";
import { OwnerIdentitySchema, recordReferences } from "../../../../src/lib/store/identity.js";
import { expect, it } from "vitest";
import { checkCreationAdmission, renderCreationAdmissionRefusal } from "../../../../src/lib/store/creation-admission.js";
import { recordPut, batchLifecycleWrites } from "../../../../src/lib/store/lifecycle-write.js";
import { createLifecycleHarness, lifecycleSuccess } from "../../../helpers/store/lifecycle-harness.js";

it("admits a slug that no record holds", async () => {
  const h = createLifecycleHarness();
  expect(await checkCreationAdmission(h.store, "unused")).toEqual({ kind: "free" });
});

const completed = { kind: "completed" as const, quarter: ArchiveQuarterSchema.parse("2026-q4") };
async function errand(h: ReturnType<typeof createLifecycleHarness>, name: string, ended = true) {
  return h.seed(recordReferences["work-item/record"](OwnerIdentitySchema.parse({ type: "work-item", name })),
    JSON.stringify({ version: 3, slug: name, claimId: "a".repeat(32), createdAt: "2026-10-24T00:00:00Z", updatedAt: "2026-10-24T00:00:00Z",
      owner: "test-user", kind: "errand", purpose: "errand", intent: "Useful work", branch: `chore/${name}`,
      origin: "description", originEntry: null, state: "open", savedHead: null, changeRequest: null }), ended ? completed : { kind: "active" });
}
it.each([1, 3])("admits a current name held by %s completed work-unit generations, including a completed Errand", async generations => {
  const h = createLifecycleHarness();
  for (let count = 0; count < generations; count++) await h.seedMeta("shared", { state: "Shipped", currentWorkflow: null }, completed);
  expect(await checkCreationAdmission(h.store, "shared")).toEqual({ kind: "free" });
  await errand(h, "shared");
  expect(await checkCreationAdmission(h.store, "shared")).toEqual({ kind: "free" });
});

it.each([false, true])("admits the writing owner's own current or former name, renamed=%s", async renamed => {
  const h = createLifecycleHarness(), initial = await h.seedMeta("own-name");
  if (renamed) lifecycleSuccess(await h.store.write({ ...recordPut(initial), action: "put",
    reference: { ...initial.reference, owner: { ...initial.reference.owner, name: SlugSchema.parse("current") } },
    content: initial.content.replaceAll("own-name", "current"), provenance: { verb: "rename", lifecycleAction: "rename" } }));
  expect(await checkCreationAdmission(h.store, "own-name", [initial.reference.owner])).toEqual({ kind: "free" });
});

async function cohort(h: ReturnType<typeof createLifecycleHarness>, name: string) {
  return h.seed(recordReferences["cohort/document"](OwnerIdentitySchema.parse({ type: "cohort", name })),
    `# Cohort: ${name}\n\n**Purpose:** Coordinate useful work.\n`);
}
async function rename(h: ReturnType<typeof createLifecycleHarness>, record: StoreRecord, name: string) {
  const written = lifecycleSuccess(await h.store.write({ ...recordPut(record), action: "put",
    reference: { ...record.reference, owner: { ...record.reference.owner, name: SlugSchema.parse(name) } },
    content: record.content.replaceAll(record.reference.owner.name, name), provenance: { verb: "rename", lifecycleAction: "rename" } }));
  return lifecycleSuccess(await h.store.read({ reference: written.reference }));
}
it.each(["work-unit", "errand", "cohort"] as const)("a live %s holds its current and former names", async kind => {
  const h = createLifecycleHarness();
  const current = kind === "work-unit" ? await h.seedMeta("shared") : kind === "errand" ? await errand(h, "shared", false) : await cohort(h, "shared");
  expect(await checkCreationAdmission(h.store, "shared")).toEqual({ kind: "held", ambiguous: false,
    holders: [{ reference: current.reference, name: "current" }] });
  const renamed = await rename(h, current, "current");
  expect(await checkCreationAdmission(h.store, "shared")).toEqual({ kind: "held", ambiguous: false,
    holders: [{ reference: renamed.reference, name: "former" }] });
});
it.each([false, true])("retains every holder and tier when lookup refuses a live tie, former=%s", async former => {
  const h = createLifecycleHarness();
  let unit = await h.seedMeta("shared"), group = await cohort(h, "shared");
  if (former) { unit = await rename(h, unit, "unit"); group = await rename(h, group, "group"); }
  const lookup = await h.store.lookup({ kind: "slug", slug: SlugSchema.parse("shared") });
  if (lookup.status !== "refused") throw new Error("Expected a native lookup tie");
  expect(await checkCreationAdmission(h.store, "shared")).toEqual({ kind: "held", ambiguous: true, refusal: lookup.refusal,
    holders: expect.arrayContaining([{ reference: unit.reference, name: former ? "former" : "current" },
      { reference: group.reference, name: former ? "former" : "current" }]) });
});

async function completedCohort(h: ReturnType<typeof createLifecycleHarness>, name: string) {
  const group = await cohort(h, name), member = await h.seedMeta(`${name}-member`, { cohort: name });
  lifecycleSuccess(await batchLifecycleWrites(h.store, [recordPut(group, { placement: completed }), recordPut(member, { placement: completed })],
    { verb: "archive", lifecycleAction: "archive" }));
  return lifecycleSuccess(await h.store.read({ reference: group.reference }));
}
it.each(["errand", "cohort"] as const)("refuses a completed %s's current name", async kind => {
  const h = createLifecycleHarness(), record = kind === "errand" ? await errand(h, "shared") : await completedCohort(h, "shared");
  expect(await checkCreationAdmission(h.store, "shared")).toEqual({ kind: "refused", cause: "completed-holder", ambiguous: false,
    holders: [{ reference: record.reference, name: "current" }] });
});
it("refuses a completed work unit's former name", async () => {
  const h = createLifecycleHarness(), initial = await h.seedMeta("shared", { state: "Shipped", currentWorkflow: null }, completed);
  const record = await rename(h, initial, "current");
  expect(await checkCreationAdmission(h.store, "shared")).toEqual({ kind: "refused", cause: "completed-former-name", ambiguous: false,
    holders: [{ reference: record.reference, name: "former" }] });
});
it("refuses completed Errand ties while retaining their exact lookup refusal", async () => {
  const h = createLifecycleHarness(), first = await errand(h, "shared"), second = await errand(h, "shared");
  const lookup = await h.store.lookup({ kind: "slug", slug: SlugSchema.parse("shared") });
  if (lookup.status !== "refused") throw new Error("Expected a completed tie");
  expect(await checkCreationAdmission(h.store, "shared")).toEqual({ kind: "refused", cause: "completed-tie", ambiguous: true,
    refusal: lookup.refusal, holders: expect.arrayContaining([{ reference: first.reference, name: "current" }, { reference: second.reference, name: "current" }]) });
});

it("retains an unavailable lookup's refusal rather than admitting the name", async () => {
  const h = createLifecycleHarness();
  const refusal = StoreRefusalSchema.parse({ code: "namespace-corrupt", class: "terminal", namespace: "work-item",
    condition: "Namespace cannot be read.", remedy: { text: "Restore the namespace, then retry." } });
  let repaired = false;
  const ports: Pick<Store, "lookup" | "read"> = { lookup: input => repaired ? h.store.lookup(input) : Promise.resolve({ status: "refused", refusal }), read: h.store.read.bind(h.store) };
  const result = await checkCreationAdmission(ports, "shared");
  expect(result).toEqual({ kind: "refused", cause: "lookup", holders: [], ambiguous: false, refusal });
  if (result.kind === "free") throw new Error("Expected unavailable lookup");
  expect(renderCreationAdmissionRefusal("shared", result)).toEqual({ condition: refusal.condition, remedy: refusal.remedy });
  repaired = true;
  expect(await checkCreationAdmission(ports, "shared")).toEqual({ kind: "free" });
});
it("refuses an ambiguity whose ranking tier is unavailable", async () => {
  const h = createLifecycleHarness(), unit = await h.seedMeta("shared"), group = await cohort(h, "shared");
  const refusal = StoreRefusalSchema.parse({ code: "ambiguous-match", class: "recoverable", candidates: [unit.reference, group.reference],
    condition: "Several holders are known, but their tier is unavailable.", remedy: { text: "Repair lookup evidence and retry." } });
  const ports: Pick<Store, "lookup" | "read"> = { lookup: async () => ({ status: "refused", refusal }), read: h.store.read.bind(h.store) };
  expect(await checkCreationAdmission(ports, "shared")).toEqual({ kind: "refused", cause: "lookup", ambiguous: true, refusal,
    holders: expect.arrayContaining([{ reference: unit.reference, name: "current" }, { reference: group.reference, name: "current" }]) });
});
it("retains a failed record read and its selected holder", async () => {
  const h = createLifecycleHarness(), unit = await h.seedMeta("shared");
  const refusal = StoreRefusalSchema.parse({ code: "record-malformed", class: "recoverable", reference: unit.reference, rule: "meta.parse",
    condition: "Holder record cannot be parsed.", remedy: { text: "Repair the holder record, then retry." } });
  let repaired = false;
  const ports: Pick<Store, "lookup" | "read"> = { lookup: h.store.lookup.bind(h.store), read: input => repaired ? h.store.read(input) : Promise.resolve({ status: "refused", refusal }) };
  const result = await checkCreationAdmission(ports, "shared");
  expect(result).toEqual({ kind: "refused", cause: "read", ambiguous: false, refusal,
    holders: [{ reference: unit.reference, name: "current" }] });
  if (result.kind === "free") throw new Error("Expected a failed read");
  expect(renderCreationAdmissionRefusal("shared", result)).toMatchObject({ condition: expect.stringContaining(refusal.condition), remedy: refusal.remedy });
  repaired = true;
  expect(await checkCreationAdmission(ports, "shared")).toMatchObject({ kind: "held" });
});
it.each(["writer", "completed", "live"] as const)("refuses unresolved holder conflicts before considering %s admission", async kind => {
  const h = createLifecycleHarness(), unit = await h.seedMeta("shared", kind === "completed" ? { state: "Shipped", currentWorkflow: null } : {},
    kind === "completed" ? completed : { kind: "active" });
  const conflict = recordReferences["work-item/conflict-record"](unit.reference.owner, "unresolved");
  const record = StoreRecordSchema.parse({ ...unit, conflicts: [conflict] });
  let repaired = false;
  const ports: Pick<Store, "lookup" | "read"> = { lookup: h.store.lookup.bind(h.store), read: async () => ({ status: "ok", result: repaired ? unit : record }) };
  const owners = kind === "writer" ? [unit.reference.owner] : [];
  const result = await checkCreationAdmission(ports, "shared", owners);
  expect(result).toMatchObject({ kind: "refused", cause: "conflicts", ambiguous: false,
    holders: [{ reference: unit.reference, name: "current" }] });
  if (result.kind === "free") throw new Error("Expected conflict refusal");
  const rendered = renderCreationAdmissionRefusal("shared", result);
  expect(rendered.condition).toContain(JSON.stringify(conflict));
  expect(rendered.remedy.text).toMatch(/resolve.*conflict.*retry/iu);
  repaired = true;
  expect(await checkCreationAdmission(ports, "shared", owners)).toMatchObject({ kind: kind === "live" ? "held" : "free" });
});

it.each(["work-unit", "errand", "cohort"] as const)("renders a live %s's identity and offers waiting only for its current name", async kind => {
  const h = createLifecycleHarness();
  let record = kind === "work-unit" ? await h.seedMeta("shared") : kind === "errand" ? await errand(h, "shared", false) : await cohort(h, "shared");
  for (const former of [false, true]) {
    if (former) record = await rename(h, record, "current");
    const result = await checkCreationAdmission(h.store, "shared");
    if (result.kind === "free") throw new Error("Expected a held name");
    const rendered = renderCreationAdmissionRefusal("shared", result);
    expect(rendered.condition).toContain(kind === "work-unit" ? "work unit" : kind === "errand" ? "Errand" : "cohort");
    expect(rendered.condition).toContain(record.reference.owner.name);
    const owner = record.reference.owner;
    if (owner.type === "person" || owner.uid === undefined) throw new Error("Expected holder UUID");
    expect(rendered.condition).toContain(owner.uid);
    expect(rendered.remedy.text).toMatch(/choose another name/iu);
    expect(/wait/iu.test(rendered.remedy.text)).toBe(!former);
    expect(JSON.stringify(rendered)).not.toMatch(/rename/iu);
  }
});
it("renders every live tied holder without offering a lifecycle clash repair", async () => {
  const h = createLifecycleHarness(), unit = await h.seedMeta("shared"), group = await cohort(h, "shared");
  const result = await checkCreationAdmission(h.store, "shared");
  if (result.kind === "free") throw new Error("Expected held holders");
  const rendered = renderCreationAdmissionRefusal("shared", result);
  for (const record of [unit, group]) {
    const owner = record.reference.owner;
    if (owner.type === "person" || owner.uid === undefined) throw new Error("Expected holder UUID");
    expect(rendered.condition).toContain(owner.uid);
  }
  expect(rendered.condition).toContain("work unit"); expect(rendered.condition).toContain("cohort");
  expect(rendered.remedy.text).toMatch(/choose another name.*wait/iu);
  expect(JSON.stringify(rendered)).not.toMatch(/rename|arc status|close/iu);
});
it.each(["former-work-unit", "errand", "cohort", "tie"] as const)("renders completed %s refusal without waiting advice", async kind => {
  const h = createLifecycleHarness();
  if (kind === "former-work-unit") await rename(h, await h.seedMeta("shared", { state: "Shipped", currentWorkflow: null }, completed), "current");
  if (kind === "errand" || kind === "tie") await errand(h, "shared");
  if (kind === "tie") await errand(h, "shared");
  if (kind === "cohort") await completedCohort(h, "shared");
  const result = await checkCreationAdmission(h.store, "shared");
  if (result.kind === "free") throw new Error("Expected a completed refusal");
  const rendered = renderCreationAdmissionRefusal("shared", result);
  for (const holder of result.holders) {
    const owner = holder.reference.owner;
    if (owner.type === "person" || owner.uid === undefined) throw new Error("Expected holder UUID");
    expect(rendered.condition).toContain(owner.name); expect(rendered.condition).toContain(owner.uid);
  }
  expect(rendered.remedy.text).toMatch(/choose another name/iu);
  expect(JSON.stringify(rendered)).not.toMatch(/wait|rename/iu);
});

it("exempts the writing Errand owner under its current and former names", async () => {
  const h = createLifecycleHarness(), initial = await errand(h, "own-errand", false);
  expect(await checkCreationAdmission(h.store, "own-errand", [initial.reference.owner])).toEqual({ kind: "free" });
  await rename(h, initial, "current");
  expect(await checkCreationAdmission(h.store, "own-errand", [initial.reference.owner])).toEqual({ kind: "free" });
});

it("refuses a completed work-unit and cohort tie rather than treating one reusable holder as free", async () => {
  const h = createLifecycleHarness();
  await h.seedMeta("shared", { state: "Shipped", currentWorkflow: null }, completed);
  await completedCohort(h, "shared");
  const result = await checkCreationAdmission(h.store, "shared");
  expect(result).toMatchObject({ kind: "refused", cause: "completed-tie", ambiguous: true, holders: [expect.anything(), expect.anything()] });
  if (result.kind === "free") throw new Error("Expected completed holders");
  expect(result.holders.map(holder => holder.reference.kind).sort()).toEqual(["cohort/document", "work-item/meta"]);
});
