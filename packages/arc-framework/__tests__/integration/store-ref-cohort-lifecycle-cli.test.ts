/** Registered cohort lifecycle commands preview and retire exact owners on both backends. */
import { describe, expect, it } from "vitest";
import { createKindRegistry, RecordReferenceSchema } from "../../src/lib/store/index.js";
import { ArchiveQuarterSchema } from "../../src/lib/kernel/index.js";
import { PRODUCTION_REGISTRATIONS } from "../../src/lib/store/kinds/registrations.js";
import { createReferenceFixture } from "../helpers/store/reference-fixture.js";
import { createRefFixture } from "../helpers/store/ref-fixture.js";
import { repairCliFixture, repairCli } from "../helpers/repair-cli.js";
import { seed, success, update } from "../helpers/store/suite-tools.js";
import { makeMetaFixture } from "../helpers/meta-fixture.js";
import { observeOpenHoldings, cohortHoldingEdits } from "../../src/lib/store/kinds/cohort/check-support.js";
import { writeMetaCohort } from "../../src/lib/store/kinds/meta/writers.js";
import { writeCohortParent } from "../../src/lib/store/kinds/cohort/index.js";
import { plantRefPrimary } from "../helpers/store/ref-primary-plant.js";
import { mergeLineText } from "../../src/lib/store/concurrency/index.js";

const production = createKindRegistry(PRODUCTION_REGISTRATIONS);
const overrides = { "work-item/meta": production["work-item/meta"], "cohort/document": production["cohort/document"] };
const content = (name: string, parent?: string) => `# Cohort: \`${name}\`\n\n**Purpose:** Coordinate the group.\n${parent === undefined ? "" : `\n**Parent:** \`${parent}\`\n`}`;

async function fixture(backend: "reference" | "ref") {
  const cli = await repairCliFixture();
  const ref = backend === "ref" ? await createRefFixture(overrides) : undefined;
  const f = ref ?? createReferenceFixture({}, overrides);
  const options = ref === undefined ? { store: f.store } : { storeFactory: async () => {
    const { createRefStore } = await import("../../src/lib/store/create.js");
    const { createDefaultRefStorePorts } = await import("../../src/lib/store/default-ports.js");
    const fresh = createDefaultRefStorePorts({ checkoutRoot: ref.root, backingRepository: async () => null });
    return createRefStore({ ...fresh, registry: ref.ports.registry, identity: ref.ports.identity,
      actor: ref.ports.actor, clock: ref.ports.clock, random: ref.ports.random });
  } };
  return { ...f, ref, invoke: (args: readonly string[]) => repairCli(cli, args, options) };
}

describe.each(["reference", "ref"] as const)("cohort close over %s", backend => {
  it("previews without writing and closes an empty cohort only with explicit confirmation", async () => {
    const f = await fixture(backend), ref = f.reference("cohort/document", "empty");
    const group = await seed(f, ref, content(ref.owner.name));
    const before = success(await f.store.version());
    const preview = await f.invoke(["cohort", "close", ref.owner.name, "--json"]);
    expect(preview).toMatchObject({ exitCode: 1, result: { status: "refused", plan: { operation: "close", reference: group.reference,
      placement: { kind: "completed", quarter: expect.stringMatching(/^\d{4}-q[1-4]$/u) } } } });
    expect(success(await f.store.version())).toBe(before);
    expect(success(await f.store.read({ reference: group.reference }))).toEqual(group);
    const textPlan = await f.invoke(["cohort", "close", ref.owner.name]);
    expect(textPlan).toMatchObject({ exitCode: 1, stdout: expect.stringContaining("Close plan:") });
    expect(success(await f.store.version())).toBe(before);
    const closed = await f.invoke(["cohort", "close", ref.owner.name, "--yes", "--json"]);
    expect(closed, JSON.stringify(closed)).toMatchObject({ result: { status: "closed", reference: group.reference,
      placement: { kind: "completed", sequence: "01", closeout: "a" } } });
    expect(closed.exitCode ?? 0).toBe(0);
    const stored = success(await f.store.read({ reference: group.reference }));
    expect(stored.placement?.kind).toBe("completed");
    expect(closed.result).toMatchObject({ placement: stored.placement });
    expect(success(await f.store.history({ reference: group.reference }))[0]?.provenance)
      .toMatchObject({ verb: "cohort-close", lifecycleAction: "close", batchId: expect.any(String) });
    if (f.ref !== undefined) expect((await f.ref.ports.exec("git", ["ls-remote", "origin", "refs/arc/*"], { cwd: f.ref.root })).stdout).toBe("");
  }, 60_000);

  it.each([false, true])("names a holder before confirmation and closes after it archives, former=%s", async former => {
    const f = await fixture(backend), ref = f.reference("cohort/document", "held");
    const group = await seed(f, ref, content(ref.owner.name)), memberRef = f.reference("work-item/meta", "held");
    const held = await seed(f, memberRef, makeMetaFixture(memberRef.owner.name, { state: "Planning", cohort: ref.owner.name }),
      { kind: "backlog", commitment: "planned" });
    let primary = group;
    if (former) {
      const renamed = RecordReferenceSchema.parse({ ...group.reference, owner: { ...group.reference.owner, name: "renamed" } });
      success(await f.store.write({ ...update(f, group, content("renamed")), reference: renamed }));
      primary = success(await f.store.read({ reference: renamed }));
    }
    const before = success(await f.store.version());
    const refused = await f.invoke(["cohort", "close", primary.reference.owner.name, "--json"]);
    expect(refused).toMatchObject({ exitCode: 1, result: { status: "refused", refusal: { rule: "cohort.open-members",
      condition: expect.stringContaining(memberRef.owner.name), remedy: { text: expect.stringMatching(/archive.*abandon.*Cohort/isu) } } } });
    if (former) expect(refused.result).toMatchObject({ refusal: { condition: expect.stringContaining(`Cohort "${ref.owner.name}" -> "renamed"`) } });
    expect(success(await f.store.version())).toBe(before);
    success(await f.store.write({ ...update(f, held, makeMetaFixture(memberRef.owner.name, { state: "Shipped", cohort: ref.owner.name })),
      placement: { kind: "completed", quarter: ArchiveQuarterSchema.parse("2026-q4") }, provenance: { verb: "archive", lifecycleAction: "archive" } }));
    const owner = primary.reference.owner;
    if (owner.type === "person" || owner.uid === undefined) throw new Error("Expected cohort UID");
    expect(await f.invoke(["cohort", "close", owner.uid, "--yes", "--json"])).toMatchObject({ result: { status: "closed", reference: primary.reference } });
  }, 60_000);

  it("reports the ordered Parent repair and admits each field edit before child and parent close", async () => {
    const f = await fixture(backend), parentRef = f.reference("cohort/document", "parent"), childRef = f.reference("cohort/document", "child");
    const parent = await seed(f, parentRef, content(parentRef.owner.name));
    await seed(f, childRef, content(childRef.owner.name, parentRef.owner.name));
    const memberRef = f.reference("work-item/meta", "nested"), oldPath = `${parentRef.owner.name}/${childRef.owner.name}`;
    await seed(f, memberRef, makeMetaFixture(memberRef.owner.name, { cohort: oldPath }));
    const renamed = RecordReferenceSchema.parse({ ...parent.reference, owner: { ...parent.reference.owner, name: "renamed" } });
    success(await f.store.write({ ...update(f, parent, content("renamed")), reference: renamed }));
    const nextPath = `renamed/${childRef.owner.name}`;
    const refused = await f.invoke(["cohort", "close", "renamed", "--yes", "--json"]);
    expect(refused).toMatchObject({ exitCode: 1, result: { status: "refused", refusal: {
      condition: expect.stringMatching(new RegExp(`Cohort "${oldPath}" -> null.*Parent "${parentRef.owner.name}" -> "renamed".*Cohort null -> "${nextPath}"`, "su")),
    } } });
    const holdings = await observeOpenHoldings(f.store, f.store, renamed);
    if (holdings.status !== "known") throw new Error("Expected Parent holdings");
    const edits = cohortHoldingEdits(holdings.value, "renamed");
    if (edits.status !== "known") throw new Error("Expected ordered repair");
    expect(edits.value).toHaveLength(3);
    for (const edit of edits.value) {
      const reference = RecordReferenceSchema.parse({ kind: edit.field === "parent" ? "cohort/document" : "work-item/meta",
        owner: { type: edit.field === "parent" ? "cohort" : "work-item", name: edit.record.name, uid: edit.record.uid } });
      const saved = success(await f.store.read({ reference }));
      const next = edit.field === "cohort" ? writeMetaCohort(saved.content, edit.to) : edit.to === null ? null : writeCohortParent(saved.content, edit.to);
      if (next === null) throw new Error("Expected Parent content");
      success(await f.store.write(update(f, saved, next)));
    }
    const member = success(await f.store.read({ reference: memberRef }));
    expect(member.content).toContain(nextPath);
    success(await f.store.write(update(f, member, writeMetaCohort(member.content, null))));
    const child = success(await f.store.read({ reference: childRef })), childOwner = child.reference.owner;
    if (childOwner.type === "person" || childOwner.uid === undefined) throw new Error("Expected child UID");
    expect(await f.invoke(["cohort", "close", childOwner.uid, "--yes", "--json"])).toMatchObject({ result: { status: "closed", reference: child.reference } });
    expect(await f.invoke(["cohort", "close", "renamed", "--yes", "--json"])).toMatchObject({ result: { status: "closed", reference: renamed } });
  }, 60_000);

  it("names a stored conflict and closes after resolution while refusing a second close", async () => {
    const f = await fixture(backend), ref = f.reference("cohort/document", "disputed");
    const group = await seed(f, ref, content(ref.owner.name)), current = group.content.replace("Coordinate", "Deliver locally");
    success(await f.store.write(update(f, group, current)));
    const label = { actor: "test-user", time: new Date(0).toISOString() };
    const merged = mergeLineText({ record: group.reference, baseVersion: group.version, base: group.content, current,
      incoming: group.content.replace("Coordinate", "Deliver remotely"), currentLabel: label, incomingLabel: label });
    const data = merged.conflicts[0], key = "00000000-0000-4000-8000-000000000099";
    if (data === undefined) throw new Error("Expected a producer-generated Purpose conflict");
    const conflict = RecordReferenceSchema.parse({ owner: group.reference.owner, kind: "cohort/conflict-record", key });
    success(await f.store.write({ action: "put", expected: null, reference: conflict, content: JSON.stringify(data),
      provenance: { verb: "sync", lifecycleAction: "reconcile" } }));
    const disputed = success(await f.store.read({ reference: group.reference }));
    expect(disputed.conflicts).toEqual([conflict]);
    expect(await f.invoke(["cohort", "close", ref.owner.name, "--json"]))
      .toMatchObject({ exitCode: 1, result: { status: "refused", refusal: { condition: expect.stringContaining(key),
        remedy: { text: expect.stringContaining("Resolve the named conflict records") } } } });
    expect(success(await f.store.read({ reference: group.reference }))).toEqual(disputed);
    success(await f.store.write({ ...update(f, disputed, disputed.content), resolves: disputed.conflicts }));
    expect(await f.invoke(["cohort", "close", ref.owner.name, "--yes", "--json"])).toMatchObject({ result: { status: "closed" } });
    const closed = success(await f.store.read({ reference: group.reference }));
    expect(await f.invoke(["cohort", "close", ref.owner.name, "--yes", "--json"]))
      .toMatchObject({ exitCode: 1, result: { status: "refused", refusal: { condition: expect.stringMatching(/already.*completed/iu) } } });
    expect(success(await f.store.read({ reference: group.reference }))).toEqual(closed);
  }, 60_000);
});

it("counts ambiguous own-name holdings before confirming a UID-selected close", async () => {
  const f = await fixture("ref");
  if (f.ref === undefined) throw new Error("Expected real refs");
  const uid = "00000000-0000-4000-8000-000000000001", otherUid = "00000000-0000-4000-8000-000000000002";
  const first = await plantRefPrimary(f.ref, { kind: "cohort/document", name: "shared", uid, content: content("shared") });
  const second = await plantRefPrimary(f.ref, { kind: "cohort/document", name: "shared", uid: otherUid, content: content("shared") });
  const member = await plantRefPrimary(f.ref, { kind: "work-item/meta", name: "held", uid: "00000000-0000-4000-8000-000000000003",
    content: makeMetaFixture("held", { cohort: "shared" }) });
  const before = success(await f.store.version());
  for (const operand of [uid, otherUid]) expect(await f.invoke(["cohort", "close", operand, "--json"]))
    .toMatchObject({ exitCode: 1, result: { status: "refused", refusal: { rule: "cohort.open-members", condition: expect.stringContaining("held") } } });
  expect(success(await f.store.version())).toBe(before);
  const held = success(await f.store.read({ reference: member }));
  success(await f.store.write(update(f, held, writeMetaCohort(held.content, null))));
  expect(await f.invoke(["cohort", "close", uid, "--yes", "--json"]))
    .toMatchObject({ result: { status: "closed", reference: first } });
  expect(success(await f.store.read({ reference: first })).placement?.kind).toBe("completed");
  expect(success(await f.store.read({ reference: second })).placement?.kind).not.toBe("completed");
}, 60_000);
