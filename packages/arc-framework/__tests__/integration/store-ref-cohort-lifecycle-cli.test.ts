/** Registered cohort lifecycle commands preview and retire exact owners on both backends. */
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { createKindRegistry, RecordReferenceSchema, type StoreRecord, type Store } from "../../src/lib/store/index.js";
import { ArchiveQuarterSchema } from "../../src/lib/kernel/index.js";
import { PRODUCTION_REGISTRATIONS } from "../../src/lib/store/kinds/registrations.js";
import { createReferenceFixture } from "../helpers/store/reference-fixture.js";
import { createRefFixture } from "../helpers/store/ref-fixture.js";
import { repairCliFixture, repairCli } from "../helpers/repair-cli.js";
import { seed, success, update } from "../helpers/store/suite-tools.js";
import { makeMetaFixture } from "../helpers/meta-fixture.js";
import { observeOpenHoldings, cohortHoldingRepairs } from "../../src/lib/store/kinds/cohort/check-support.js";
import { writeMetaCohort } from "../../src/lib/store/kinds/meta/writers.js";
import { writeCohortParent } from "../../src/lib/store/kinds/cohort/index.js";
import { plantRefPrimary } from "../helpers/store/ref-primary-plant.js";
import { mergeLineText } from "../../src/lib/store/concurrency/index.js";
import { refSyncFixture } from "../helpers/store/ref-sync.js";

const production = createKindRegistry(PRODUCTION_REGISTRATIONS);
const overrides = { "work-item/meta": production["work-item/meta"], "cohort/document": production["cohort/document"] };
const content = (name: string, parent?: string) => `# Cohort: \`${name}\`\n\n**Purpose:** Coordinate the group.\n${parent === undefined ? "" : `\n**Parent:** \`${parent}\`\n`}`;

async function fixture(backend: "reference" | "ref") {
  const cli = await repairCliFixture();
  const ref = backend === "ref" ? await createRefFixture(overrides) : undefined;
  const f = ref ?? createReferenceFixture({}, overrides);
  const open = async (): Promise<Store> => {
    if (ref === undefined) return f.store;
    const { createRefStore } = await import("../../src/lib/store/create.js");
    const { createDefaultRefStorePorts } = await import("../../src/lib/store/default-ports.js");
    const fresh = createDefaultRefStorePorts({ checkoutRoot: ref.root, backingRepository: async () => null });
    return createRefStore({ ...fresh, registry: ref.ports.registry, identity: ref.ports.identity,
      actor: ref.ports.actor, clock: ref.ports.clock, random: ref.ports.random });
  };
  return { ...f, ref, invoke: (args: readonly string[], decorate?: (store: Store) => Store) => repairCli(cli, args, {
    storeFactory: async () => { const store = await open(); return decorate?.(store) ?? store; },
  }) };
}

describe.each(["reference", "ref"] as const)("cohort input refusal over %s", backend => {
  it.each(["close", "remove"] as const)("rejects malformed %s operands without writing and accepts a valid retry", async operation => {
    const f = await fixture(backend), ref = f.reference("cohort/document", "input");
    const group = await seed(f, ref, content(ref.owner.name)), before = success(await f.store.version());
    for (const operand of ["parent/child", "UPPER"]) {
      for (const json of [false, true]) {
        const result = await f.invoke(["cohort", operation, operand, "--yes", ...(json ? ["--json"] : [])]);
        expect(result.exitCode).toBe(1);
        if (json) expect(result.result).toMatchObject({ status: "refused", refusal: { code: "record-malformed", rule: `cohort.${operation}-input`,
          remedy: { argv: ["arc", "cohort", operation, "--help"] } } });
        else expect(result.stdout + result.stderr).toContain(`arc cohort ${operation} --help`);
        expect(success(await f.store.version())).toBe(before);
        expect(success(await f.store.read({ reference: group.reference }))).toEqual(group);
      }
    }
    const retry = await f.invoke(["cohort", operation, group.reference.owner.name, "--yes", "--json"]);
    expect(retry.exitCode ?? 0, retry.stdout + retry.stderr).toBe(0);
    expect(retry.result).toMatchObject({ status: operation === "close" ? "closed" : "removed", reference: group.reference });
  }, 60_000);
});

describe.each(["reference", "ref"] as const)("cohort conflict admission over %s", backend => {
  it.each(["close", "remove"] as const)("refuses %s after a conflict-only arrival and succeeds after resolution", async operation => {
    const f = await fixture(backend), reference = f.reference("cohort/document", "conflict-arrival");
    const base = await seed(f, reference, content(reference.owner.name));
    success(await f.store.write(update(f, base, base.content.replace("Coordinate", "Coordinate locally"))));
    const group = success(await f.store.read({ reference: base.reference }));
    const label = { actor: "test-user", time: new Date(0).toISOString() };
    const merged = mergeLineText({ record: group.reference, baseVersion: base.version, base: base.content, current: group.content,
      incoming: base.content.replace("Coordinate", "Coordinate remotely"), currentLabel: label, incomingLabel: label });
    const data = merged.conflicts[0];
    if (data === undefined) throw new Error("Expected a producer-generated conflict");
    const conflict = RecordReferenceSchema.parse({ owner: group.reference.owner, kind: "cohort/conflict-record",
      key: "00000000-0000-4000-8000-000000000099" });
    let injected = false;
    const refused = await f.invoke(["cohort", operation, group.reference.owner.name, "--yes", "--json"], store => new Proxy(store, {
      get(target, key) {
        if (key === "batch") return async (input: Parameters<Store["batch"]>[0]) => {
          if (!injected) {
            injected = true;
            success(await store.write({ action: "put", expected: null, reference: conflict, content: JSON.stringify(data),
              provenance: { verb: "sync", lifecycleAction: "reconcile" } }));
            expect(success(await store.read({ reference: group.reference })).version).toBe(group.version);
          }
          return store.batch(input);
        };
        const value: unknown = Reflect.get(target, key);
        return typeof value === "function" ? value.bind(target) : value;
      },
    }));
    expect(refused, JSON.stringify(refused)).toMatchObject({ exitCode: 1, result: { status: "refused", refusal: { code: "version-conflict" } } });
    const disputed = success(await f.store.read({ reference: group.reference }));
    expect(disputed).toMatchObject({ version: group.version, content: group.content, conflicts: [conflict] });
    expect(disputed.placement).toEqual(group.placement);
    success(await f.store.write({ ...update(f, disputed, disputed.content), resolves: disputed.conflicts }));
    const owner = group.reference.owner;
    if (owner.type !== "cohort" || owner.uid === undefined) throw new Error("Expected exact cohort identity");
    const retried = await f.invoke(["cohort", operation, owner.uid, "--yes", "--json"]);
    expect(retried.exitCode ?? 0, retried.stdout + retried.stderr).toBe(0);
    expect(retried.result).toMatchObject({ status: operation === "close" ? "closed" : "removed", reference: group.reference });
    if (operation === "close") expect(success(await f.store.read({ reference: group.reference })))
      .toMatchObject({ placement: { kind: "completed" }, conflicts: [] });
    else expect(await f.store.read({ reference: group.reference })).toMatchObject({ status: "refused", refusal: { code: "not-found" } });
  }, 60_000);
});

it("removes the renamed cohort while the remaining current-name owner keeps its member", async () => {
  const f = await fixture("ref");
  if (f.ref === undefined) throw new Error("Expected real refs");
  const uid = "00000000-0000-4000-8000-000000000001", otherUid = "00000000-0000-4000-8000-000000000002";
  const first = await plantRefPrimary(f.ref, { kind: "cohort/document", name: "shared", uid, content: content("shared") });
  const second = await plantRefPrimary(f.ref, { kind: "cohort/document", name: "shared", uid: otherUid, content: content("shared") });
  const member = await plantRefPrimary(f.ref, { kind: "work-item/meta", name: "held", uid: "00000000-0000-4000-8000-000000000003",
    content: makeMetaFixture("held", { cohort: "shared" }) });
  const held = success(await f.store.read({ reference: member })), moving = success(await f.store.read({ reference: second }));
  const renamed = RecordReferenceSchema.parse({ ...second, owner: { ...second.owner, name: "separate" } });
  success(await f.store.write({ ...update(f, moving, content("separate")), reference: renamed }));
  expect(await f.invoke(["cohort", "remove", otherUid, "--yes", "--json"]))
    .toMatchObject({ result: { status: "removed", reference: renamed } });
  expect(await f.store.read({ reference: renamed })).toMatchObject({ status: "refused", refusal: { code: "not-found" } });
  expect(await f.invoke(["cohort", "remove", uid, "--yes", "--json"]))
    .toMatchObject({ exitCode: 1, result: { status: "refused", refusal: { condition: expect.stringContaining("held") } } });
  expect(success(await f.store.read({ reference: first })).reference).toEqual(first);
  expect(success(await f.store.read({ reference: member }))).toEqual(held);
}, 60_000);

it("pulls missing completed-cohort history before its confirmed CLI removal", async () => {
  const h = await refSyncFixture(), cli = await repairCliFixture();
  const { createRefStore } = await import("../../src/lib/store/create.js");
  const { createDefaultRefStorePorts } = await import("../../src/lib/store/default-ports.js");
  const a = createRefStore({ ...createDefaultRefStorePorts({ checkoutRoot: h.a.root, backingRepository: async () => null }),
    actor: h.a.ports.actor, clock: h.a.ports.clock, random: h.a.ports.random });
  const b = createRefStore({ ...createDefaultRefStorePorts({ checkoutRoot: h.b.root, backingRepository: async () => null }),
    actor: h.b.ports.actor, clock: h.b.ports.clock, random: h.b.ports.random });
  const made = success(await a.write({ action: "put", expected: null, content: content("unused"),
    reference: RecordReferenceSchema.parse({ kind: "cohort/document", owner: { type: "cohort", name: "unused" } }),
    provenance: { verb: "create", lifecycleAction: "create" } }));
  const live = success(await a.read({ reference: made.reference }));
  success(await a.write({ action: "put", reference: live.reference, expected: live.version, content: live.content,
    placement: { kind: "completed", quarter: ArchiveQuarterSchema.parse("2026-q4") }, provenance: { verb: "cohort-close", lifecycleAction: "close" } }));
  success(await a.push()); success(await b.pull());
  const ended = success(await b.read({ reference: live.reference }));
  expect(await b.batch({ writes: [{ action: "remove", reference: ended.reference, expected: ended.version }],
    provenance: { verb: "cohort-remove", lifecycleAction: "remove" } }))
    .toMatchObject({ status: "refused", refusal: { code: "state-unresolvable", historyRefs: [expect.stringContaining("refs/arc/history/cohort/")] } });
  const result = await repairCli(cli, ["cohort", "remove", "unused", "--yes", "--json"], { storeFactory: async () => {
    const { createRefStore } = await import("../../src/lib/store/create.js");
    const { createDefaultRefStorePorts } = await import("../../src/lib/store/default-ports.js");
    const fresh = createDefaultRefStorePorts({ checkoutRoot: h.b.root, backingRepository: async () => null });
    return createRefStore({ ...fresh, actor: h.b.ports.actor, clock: h.b.ports.clock, random: h.b.ports.random });
  } });
  expect(result, JSON.stringify(result)).toMatchObject({ result: { status: "removed", reference: live.reference, placement: null } });
  expect(await b.read({ reference: live.reference })).toMatchObject({ status: "refused", refusal: { code: "not-found" } });
  expect(success(await a.read({ reference: live.reference })).placement?.kind).toBe("completed");
}, 60_000);

describe.each(["reference", "ref"] as const)("cohort close over %s", backend => {
  it("previews without writing and closes an empty cohort only with explicit confirmation", async () => {
    const f = await fixture(backend), ref = f.reference("cohort/document", "empty");
    const group = await seed(f, ref, content(ref.owner.name));
    const before = success(await f.store.version());
    const preview = await f.invoke(["cohort", "close", ref.owner.name, "--json"]);
    expect(preview).toMatchObject({ exitCode: 1, result: { status: "refused", plan: { operation: "close", reference: group.reference,
      placement: { kind: "completed", quarter: expect.stringMatching(/^\d{4}-q[1-4]$/u) } } } });
    expect(preview.result).toMatchObject({ refusal: { remedy: { argv: ["arc", "cohort", "close", uidOf(group), "--yes"] } } });
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

  it.each([false, true])("names a holder before confirmation and closes once its open holding settles, former=%s", async former => {
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
    if (former) success(await f.store.write(update(f, held, writeMetaCohort(held.content, null))));
    else success(await f.store.write({ ...update(f, held, makeMetaFixture(memberRef.owner.name, { state: "Shipped", cohort: ref.owner.name })),
      placement: { kind: "completed", quarter: ArchiveQuarterSchema.parse("2026-q4") }, provenance: { verb: "archive", lifecycleAction: "archive" } }));
    const owner = primary.reference.owner;
    if (owner.type === "person" || owner.uid === undefined) throw new Error("Expected cohort UID");
    expect(await f.invoke(["cohort", "close", owner.uid, "--yes", "--json"])).toMatchObject({ result: { status: "closed", reference: primary.reference } });
  }, 60_000);

  it.each(["parent", "child"] as const)("reports the ordered Parent repair when retiring the %s, then admits every edit", async target => {
    const f = await fixture(backend), parentRef = f.reference("cohort/document", "parent"), childRef = f.reference("cohort/document", "child");
    const parent = await seed(f, parentRef, content(parentRef.owner.name));
    await seed(f, childRef, content(childRef.owner.name, parentRef.owner.name));
    const memberRef = f.reference("work-item/meta", "nested"), oldPath = `${parentRef.owner.name}/${childRef.owner.name}`;
    await seed(f, memberRef, makeMetaFixture(memberRef.owner.name, { cohort: oldPath }));
    const renamed = RecordReferenceSchema.parse({ ...parent.reference, owner: { ...parent.reference.owner, name: "renamed" } });
    success(await f.store.write({ ...update(f, parent, content("renamed")), reference: renamed }));
    const nextPath = `renamed/${childRef.owner.name}`;
    const retiring = target === "parent" ? renamed : success(await f.store.read({ reference: childRef })).reference;
    const refused = await f.invoke(["cohort", "close", retiring.owner.name, "--yes", "--json"]);
    expect(refused).toMatchObject({ exitCode: 1, result: { status: "refused", refusal: {
      condition: expect.stringMatching(new RegExp(`Cohort "${oldPath}" -> null.*Parent "${parentRef.owner.name}" -> "renamed".*Cohort null -> "${nextPath}"`, "su")),
    } } });
    const holdings = await observeOpenHoldings(f.store, f.store, retiring);
    if (holdings.status !== "known") throw new Error("Expected Parent holdings");
    const edits = cohortHoldingRepairs(holdings.value, retiring.owner.name);
    if (edits.status !== "known") throw new Error("Expected ordered repair");
    expect(edits.value.edits).toHaveLength(3);
    for (const edit of edits.value.edits) {
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

it.each(["close", "remove"] as const)("names the own-slug clash and its UID rename when %s meets it, and lands after that rename", async operation => {
  const f = await fixture("ref");
  if (f.ref === undefined) throw new Error("Expected real refs");
  const uid = "00000000-0000-4000-8000-000000000001", otherUid = "00000000-0000-4000-8000-000000000002";
  const first = await plantRefPrimary(f.ref, { kind: "cohort/document", name: "shared", uid, content: content("shared") });
  await plantRefPrimary(f.ref, { kind: "cohort/document", name: "shared", uid: otherUid, content: content("shared") });
  const member = await plantRefPrimary(f.ref, { kind: "work-item/meta", name: "held", uid: "00000000-0000-4000-8000-000000000003",
    content: makeMetaFixture("held", { cohort: "shared" }) });
  const held = success(await f.store.read({ reference: member })), before = success(await f.store.version());
  const refused = await f.invoke(["cohort", operation, uid, "--json"]);
  expect(refused).toMatchObject({ exitCode: 1, result: { status: "refused", refusal: {
    condition: expect.stringContaining(`shares its slug with cohort shared (UID ${otherUid})`),
    remedy: { text: expect.stringContaining(`\`arc rename ${uid} <new-slug>\``) } } } });
  const remedy = (refused.result as { refusal: { remedy: { text: string; argv?: string[] } } }).refusal.remedy;
  expect(remedy.text).toContain(`\`arc rename ${otherUid} <new-slug>\``);
  expect(remedy.argv).toBeUndefined();
  expect(success(await f.store.version())).toBe(before);
  const renamed = await f.invoke(["rename", uid, "retired", "--json"]);
  expect(renamed.exitCode ?? 0, renamed.stdout + renamed.stderr).toBe(0);
  expect(await f.invoke(["cohort", operation, uid, "--yes", "--json"]))
    .toMatchObject({ result: { status: operation === "close" ? "closed" : "removed",
      reference: { ...first, owner: { ...first.owner, name: "retired" } } } });
  expect(success(await f.store.read({ reference: member }))).toEqual(held);
}, 60_000);

it("closes an unrelated cohort while a member names two other cohorts sharing a slug", async () => {
  const f = await fixture("ref");
  if (f.ref === undefined) throw new Error("Expected real refs");
  const shared = [];
  for (const uid of ["00000000-0000-4000-8000-000000000001", "00000000-0000-4000-8000-000000000002"]) {
    shared.push(await plantRefPrimary(f.ref, { kind: "cohort/document", name: "shared", uid, content: content("shared") }));
  }
  const member = await plantRefPrimary(f.ref, { kind: "work-item/meta", name: "held", uid: "00000000-0000-4000-8000-000000000003",
    content: makeMetaFixture("held", { cohort: "shared" }) });
  const held = success(await f.store.read({ reference: member })), ref = f.reference("cohort/document", "unrelated");
  const group = await seed(f, ref, content(ref.owner.name));
  expect(await f.invoke(["cohort", "close", ref.owner.name, "--yes", "--json"]))
    .toMatchObject({ result: { status: "closed", reference: group.reference } });
  expect(success(await f.store.read({ reference: group.reference })).placement?.kind).toBe("completed");
  expect(success(await f.store.read({ reference: member }))).toEqual(held);
  for (const reference of shared) expect(success(await f.store.read({ reference })).placement?.kind).not.toBe("completed");
}, 60_000);

/** The confirmation remedy reruns by the previewed cohort's UID, so a slug rebound before --yes cannot redirect it. */
function uidOf(record: StoreRecord): string {
  const owner = record.reference.owner;
  if (owner.type === "person" || owner.uid === undefined) throw new Error("Expected a cohort UID");
  return owner.uid;
}

describe.each(["reference", "ref"] as const)("cohort remove over %s", backend => {
  it("previews without mutation and removes an unheld cohort only with explicit confirmation", async () => {
    const f = await fixture(backend), ref = f.reference("cohort/document", "unused");
    const group = await seed(f, ref, content(ref.owner.name)), before = success(await f.store.version());
    const plan = await f.invoke(["cohort", "remove", ref.owner.name, "--json"]);
    expect(plan).toMatchObject({ exitCode: 1, result: { status: "refused", plan: { operation: "remove", reference: group.reference } } });
    expect(plan.result).toMatchObject({ refusal: { remedy: { argv: ["arc", "cohort", "remove", uidOf(group), "--yes"] } } });
    expect(success(await f.store.version())).toBe(before);
    expect(success(await f.store.read({ reference: group.reference }))).toEqual(group);
    const text = await f.invoke(["cohort", "remove", ref.owner.name]);
    expect(text).toMatchObject({ exitCode: 1, stdout: expect.stringContaining("Remove plan:") });
    expect(success(await f.store.version())).toBe(before);
    const owner = group.reference.owner;
    if (owner.type === "person" || owner.uid === undefined) throw new Error("Expected cohort UID");
    expect(await f.invoke(["cohort", "remove", owner.uid, "--yes", "--json"]))
      .toMatchObject({ result: { status: "removed", reference: group.reference, placement: null } });
    expect(await f.store.read({ reference: group.reference })).toMatchObject({ status: "refused", refusal: { code: "not-found" } });
    if (f.ref !== undefined) expect((await f.ref.ports.exec("git", ["ls-remote", "origin", "refs/arc/*"], { cwd: f.ref.root })).stdout).toBe("");
  }, 60_000);

  it.each(["member", "subcohort"] as const)("retains a cohort when a completed %s joins at batch admission", async role => {
    const f = await fixture(backend), ref = f.reference("cohort/document", "unheld");
    const group = await seed(f, ref, content(ref.owner.name)), quarter = ArchiveQuarterSchema.parse("2026-q4");
    let held: StoreRecord;
    if (role === "member") {
      const member = f.reference("work-item/meta", "late");
      held = await seed(f, member, makeMetaFixture(member.owner.name, { state: "Shipped", cohort: null }), { kind: "completed", quarter });
    } else {
      const childRef = f.reference("cohort/document", "late-child");
      const child = await seed(f, childRef, content(childRef.owner.name));
      success(await f.store.write({ ...update(f, child, child.content), placement: { kind: "completed", quarter } }));
      held = success(await f.store.read({ reference: child.reference }));
    }
    let joined: StoreRecord | undefined, afterJoin: string | undefined;
    const result = await f.invoke(["cohort", "remove", ref.owner.name, "--yes", "--json"], store => new Proxy(store, {
      get(target, key) {
        if (key === "batch") return async (input: Parameters<Store["batch"]>[0]) => {
          if (joined === undefined) {
            const next = role === "member" ? writeMetaCohort(held.content, ref.owner.name)
              : content(held.reference.owner.name, ref.owner.name);
            success(await store.write(update(f, held, next)));
            joined = success(await store.read({ reference: held.reference }));
            afterJoin = success(await store.version());
          }
          return store.batch(input);
        };
        const value: unknown = Reflect.get(target, key);
        return typeof value === "function" ? value.bind(target) : value;
      },
    }));
    expect(joined).toBeDefined();
    expect(joined?.fields).toMatchObject(role === "member" ? { cohort: ref.owner.name } : { parent: ref.owner.name });
    expect(result).toMatchObject({ exitCode: 1, result: { status: "refused", refusal: {
      code: "record-malformed", rule: "cohort.remove-holdings", condition: expect.stringContaining(held.reference.owner.name),
    } } });
    expect(success(await f.store.version())).toBe(afterJoin);
    expect(success(await f.store.read({ reference: group.reference }))).toEqual(group);
    expect(success(await f.store.read({ reference: held.reference }))).toEqual(joined);
    const current = success(await f.store.read({ reference: held.reference }));
    success(await f.store.write(update(f, current, held.content)));
    expect(await f.invoke(["cohort", "remove", ref.owner.name, "--yes", "--json"]))
      .toMatchObject({ result: { status: "removed", reference: group.reference } });
    expect(await f.store.read({ reference: group.reference })).toMatchObject({ status: "refused", refusal: { code: "not-found" } });
    expect(success(await f.store.read({ reference: held.reference })).placement).toEqual(held.placement);
  }, 60_000);

  it.each(["member", "subcohort"] as const)("retains a cohort held by a completed %s and names close", async role => {
    const f = await fixture(backend), ref = f.reference("cohort/document", "retained");
    const group = await seed(f, ref, content(ref.owner.name)), quarter = ArchiveQuarterSchema.parse("2026-q4");
    let held: StoreRecord;
    if (role === "member") {
      const member = f.reference("work-item/meta", "archived");
      held = await seed(f, member, makeMetaFixture(member.owner.name, { state: "Shipped", cohort: ref.owner.name }), { kind: "completed", quarter });
    } else {
      const childRef = f.reference("cohort/document", "closed-child");
      const child = await seed(f, childRef, content(childRef.owner.name, ref.owner.name));
      success(await f.store.write({ ...update(f, child, child.content), placement: { kind: "completed", quarter } }));
      held = success(await f.store.read({ reference: child.reference }));
    }
    const before = success(await f.store.version());
    expect(await f.invoke(["cohort", "remove", ref.owner.name, "--yes", "--json"]))
      .toMatchObject({ exitCode: 1, result: { status: "refused", refusal: { condition: expect.stringContaining(held.reference.owner.name),
        remedy: { text: expect.stringContaining("arc cohort close") } } } });
    expect(success(await f.store.version())).toBe(before);
    expect(success(await f.store.read({ reference: group.reference }))).toEqual(group);
    expect(await f.invoke(["cohort", "close", ref.owner.name, "--yes", "--json"])).toMatchObject({ result: { status: "closed" } });
    expect(await f.invoke(["cohort", "remove", ref.owner.name, "--yes", "--json"]))
      .toMatchObject({ exitCode: 1, result: { status: "refused", refusal: { condition: expect.stringContaining(held.reference.owner.name) } } });
    expect(success(await f.store.read({ reference: held.reference }))).toEqual(held);
  }, 60_000);
});

describe.each(["reference", "ref"] as const)("cohort retirement notices over %s", backend => {
  it.each([
    { operation: "close", json: true }, { operation: "remove", json: true },
    { operation: "close", json: false }, { operation: "remove", json: false },
  ] as const)("reports the parent after its last open child leaves by $operation, json=$json", async ({ operation, json }) => {
    const f = await fixture(backend), parentRef = f.reference("cohort/document", "parent"), childRef = f.reference("cohort/document", "child");
    const parent = await seed(f, parentRef, content(parentRef.owner.name));
    const child = await seed(f, childRef, content(childRef.owner.name, parentRef.owner.name));
    const parentOperation = operation;
    const result = await f.invoke(["cohort", operation, childRef.owner.name, "--yes", ...json ? ["--json"] : []]);
    expect(result.exitCode ?? 0, result.stdout + result.stderr).toBe(0);
    if (json) expect(result).toMatchObject({ result: { status: operation === "close" ? "closed" : "removed", reference: child.reference,
      parents: [{ reference: parent.reference, remedy: { argv: ["arc", "cohort", parentOperation, parentRef.owner.name] } }] } });
    else expect(result.stdout).toContain(`arc cohort ${parentOperation} ${parentRef.owner.name}`);
    expect(success(await f.store.read({ reference: parent.reference })).placement?.kind).not.toBe("completed");
    expect(await f.invoke(["cohort", parentOperation, parentRef.owner.name, "--yes", "--json"]))
      .toMatchObject({ result: { status: parentOperation === "close" ? "closed" : "removed", reference: parent.reference } });
  }, 60_000);

  it("reports removal after abandoning the only holder and the reported removal succeeds", async () => {
    const f = await fixture(backend), ref = f.reference("cohort/document", "unused-after-abandon");
    const group = await seed(f, ref, content(ref.owner.name)), memberRef = f.reference("work-item/meta", "last");
    await seed(f, memberRef, makeMetaFixture(memberRef.owner.name, { state: "Planning", cohort: ref.owner.name }),
      { kind: "backlog", commitment: "planned" });
    const result = await f.invoke(["abandon", memberRef.owner.name, "--yes"]);
    expect(result.exitCode ?? 0, result.stdout + result.stderr).toBe(0);
    expect(result.stdout).toContain(`arc cohort remove ${ref.owner.name}`);
    expect(result.stdout).not.toContain(`arc cohort close ${ref.owner.name}`);
    expect(await f.invoke(["cohort", "remove", ref.owner.name, "--yes", "--json"]))
      .toMatchObject({ result: { status: "removed", reference: group.reference } });
  }, 60_000);

  it("reports close after abandonment leaves only a completed holder and the reported close succeeds", async () => {
    const f = await fixture(backend), ref = f.reference("cohort/document", "remaining");
    const group = await seed(f, ref, content(ref.owner.name));
    const archivedRef = f.reference("work-item/meta", "archived");
    await seed(f, archivedRef, makeMetaFixture(archivedRef.owner.name, { state: "Shipped", cohort: ref.owner.name }),
      { kind: "completed", quarter: ArchiveQuarterSchema.parse("2026-q4") });
    const memberRef = f.reference("work-item/meta", "last");
    const member = await seed(f, memberRef, makeMetaFixture(memberRef.owner.name, { state: "Planning", cohort: ref.owner.name }),
      { kind: "backlog", commitment: "planned" });
    const result = await f.invoke(["abandon", memberRef.owner.name, "--yes"]);
    expect(result.exitCode ?? 0, result.stdout + result.stderr).toBe(0);
    expect(result.stdout).toContain(`arc cohort close ${ref.owner.name}`);
    expect(await f.store.read({ reference: member.reference })).toMatchObject({ status: "refused", refusal: { code: "not-found" } });
    expect(success(await f.store.read({ reference: group.reference })).placement?.kind).not.toBe("completed");
    expect(await f.invoke(["cohort", "close", ref.owner.name, "--yes", "--json"]))
      .toMatchObject({ result: { status: "closed", reference: group.reference } });
  }, 60_000);
});

it("names each tied cohort by UID after abandonment and each reported close succeeds", async () => {
  const f = await fixture("ref");
  if (f.ref === undefined) throw new Error("Expected real refs");
  const uid = "00000000-0000-4000-8000-000000000001", otherUid = "00000000-0000-4000-8000-000000000002";
  await plantRefPrimary(f.ref, { kind: "cohort/document", name: "shared", uid, content: content("shared") });
  const archivedRef = f.reference("work-item/meta", "archived");
  await seed(f, archivedRef, makeMetaFixture(archivedRef.owner.name, { state: "Shipped", cohort: "shared" }),
    { kind: "completed", quarter: ArchiveQuarterSchema.parse("2026-q4") });
  await plantRefPrimary(f.ref, { kind: "cohort/document", name: "shared", uid: otherUid, content: content("shared") });
  const subject = await plantRefPrimary(f.ref, { kind: "work-item/meta", name: "subject", uid: "00000000-0000-4000-8000-000000000003",
    content: makeMetaFixture("subject", { state: "Planning", cohort: "shared" }) });
  const result = await f.invoke(["abandon", "subject", "--yes"]);
  expect(result.exitCode ?? 0, result.stdout + result.stderr).toBe(0);
  for (const operand of [uid, otherUid]) expect(result.stdout).toContain(`arc cohort close ${operand}`);
  expect(await f.store.read({ reference: subject })).toMatchObject({ status: "refused", refusal: { code: "not-found" } });
  for (const operand of [uid, otherUid]) expect(await f.invoke(["cohort", "close", operand, "--yes", "--json"]))
    .toMatchObject({ result: { status: "closed" } });
}, 60_000);

it("reports the actual UID for a UUID-shaped parent slug and preserves the cohort carrying that slug as its UID", async () => {
  const f = await fixture("ref");
  if (f.ref === undefined) throw new Error("Expected real refs");
  const name = "00000000-0000-4000-8000-000000000001", uid = "00000000-0000-4000-8000-000000000002";
  const parent = await plantRefPrimary(f.ref, { kind: "cohort/document", name, uid, content: content(name) });
  const other = await plantRefPrimary(f.ref, { kind: "cohort/document", name: "other", uid: name, content: content("other") });
  const kept = success(await f.store.read({ reference: other })), childRef = f.reference("cohort/document", "child");
  await seed(f, childRef, content(childRef.owner.name, name));
  const result = await f.invoke(["cohort", "remove", childRef.owner.name, "--yes", "--json"]);
  const parsed = z.object({ parents: z.array(z.object({ remedy: z.object({ argv: z.array(z.string()) }) })) }).parse(result.result);
  const argv = parsed.parents[0]?.remedy.argv;
  if (argv === undefined) throw new Error("Expected a parent retirement command");
  expect(await f.invoke([...argv.slice(1), "--yes", "--json"]))
    .toMatchObject({ result: { status: "removed", reference: parent } });
  expect(await f.store.read({ reference: parent })).toMatchObject({ status: "refused", refusal: { code: "not-found" } });
  expect(success(await f.store.read({ reference: other }))).toEqual(kept);
}, 60_000);
