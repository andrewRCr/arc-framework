/** Registered cohort renames preserve identity and compose version-bound content changes. */
import { describe, expect, it } from "vitest";
import { createKindRegistry, RecordReferenceSchema } from "../../src/lib/store/index.js";
import { SlugSchema, ArchiveQuarterSchema } from "../../src/lib/kernel/index.js";
import { PRODUCTION_REGISTRATIONS } from "../../src/lib/store/kinds/registrations.js";
import type { Store } from "../../src/lib/store/contract.js";
import { createRefFixture } from "../helpers/store/ref-fixture.js";
import { createReferenceFixture } from "../helpers/store/reference-fixture.js";
import { repairCliFixture, repairCli } from "../helpers/repair-cli.js";
import { seed, success } from "../helpers/store/suite-tools.js";
import { recordPut } from "../../src/lib/store/lifecycle-write.js";
import { makeMetaFixture } from "../helpers/meta-fixture.js";
import { join } from "node:path";
import { REF_PEER_PATH } from "../helpers/store/ref-remote.js";
import { PREPARED_REMOTE_PATH } from "../helpers/prepared-repository.js";
import { plantRefPrimary } from "../helpers/store/ref-primary-plant.js";
import { z } from "zod";
import { writeMetaCohort, writeMetaNextAction } from "../../src/lib/store/kinds/meta/writers.js";
import { writeCohortParent } from "../../src/lib/store/kinds/cohort/index.js";

const production = createKindRegistry(PRODUCTION_REGISTRATIONS);
const document = (name: string, parent?: string) => `# Cohort: \`${name}\`\n\n**Purpose:** Coordinate.\n${parent === undefined ? "" : `\n**Parent:** \`${parent}\`\n`}`;
const reportRecord = z.object({ type: z.enum(["work-unit", "cohort"]), name: SlugSchema, uid: z.uuid() });
const holdingReport = z.object({ report: z.object({ references: z.array(z.object({
  record: reportRecord,
  edits: z.array(z.object({ kind: z.literal("field"), field: z.enum(["cohort", "parent"]), from: z.string().nullable(), to: z.string().nullable() })),
})) }) });
const filenameReport = z.object({ report: z.object({ references: z.array(z.object({ record: reportRecord,
  edits: z.array(z.object({ kind: z.literal("text"), document: RecordReferenceSchema, line: z.int().positive(), replacement: z.string() })),
})) }) });

async function fixture(backend: "reference" | "ref") {
  const cli = await repairCliFixture();
  const native = backend === "ref" ? await createRefFixture(production) : undefined;
  const f = native ?? createReferenceFixture({}, production);
  const open = async (checkoutRoot = native?.root): Promise<Store> => {
    if (native === undefined) return f.store;
    if (checkoutRoot === undefined) throw new Error("Expected native checkout");
    const { createRefStore } = await import("../../src/lib/store/create.js");
    const { createDefaultRefStorePorts } = await import("../../src/lib/store/default-ports.js");
    const fresh = createDefaultRefStorePorts({ checkoutRoot, backingRepository: async () => null });
    return createRefStore({ ...fresh, registry: native.ports.registry, identity: native.ports.identity,
      actor: native.ports.actor, clock: native.ports.clock, random: native.ports.random });
  };
  const invoke = (args: readonly string[], decorate?: (store: Store) => Store) => repairCli(cli, args, { storeFactory: async () => {
    const store = await open();
    return decorate?.(store) ?? store;
  } });
  return { ...f, native, cli, invoke, open };
}

describe.each(["reference", "ref"] as const)("cohort rename over %s", backend => {
  it("rewrites filename citations in open documents and complete stub groups while retaining started and closed prose", async () => {
    const f = await fixture(backend), parentRef = f.reference("cohort/document", "parent"), childRef = f.reference("cohort/document", "before");
    const citation = `See \`cohort-${childRef.owner.name}.md\`.\n`, nextCitation = "See `cohort-after.md`.\n";
    const parent = await seed(f, parentRef, `${document(parentRef.owner.name)}\n${citation}`);
    const child = await seed(f, childRef, `${document(childRef.owner.name, parentRef.owner.name)}\n${citation}`);
    const stubRef = f.reference("work-item/meta", "waiting");
    const stub = await seed(f, stubRef, `${makeMetaFixture(stubRef.owner.name, { state: "Planning", currentWorkflow: null })}\n${citation}Keep \`spec-${childRef.owner.name}.md\`.\n`,
      { kind: "backlog", commitment: "planned" });
    const companions = [];
    for (const [kind, key] of [["work-item/draft", undefined], ["work-item/companion", "research"], ["work-item/companion", "analysis"]] as const) {
      companions.push(await seed(f, RecordReferenceSchema.parse({ kind, owner: stub.reference.owner, ...(key === undefined ? {} : { key }) }), `# Detail\n\n${citation}`));
    }
    const startedRef = f.reference("work-item/meta", "started"), closedRef = f.reference("cohort/document", "closed");
    const started = await seed(f, startedRef, `${makeMetaFixture(startedRef.owner.name,
      { state: "Active", currentWorkflow: "process-task-loop", cohort: `${parentRef.owner.name}/${childRef.owner.name}` })}\n${citation}`, { kind: "active" });
    const closed = await seed(f, closedRef, `${document(closedRef.owner.name)}\n${citation}`);
    success(await f.store.write({ ...recordPut(closed, { placement: { kind: "completed", quarter: ArchiveQuarterSchema.parse("2026-q4") } }),
      provenance: { verb: "cohort-close", lifecycleAction: "close" } }));
    const closedDocument = success(await f.store.read({ reference: closed.reference }));
    const result = await f.invoke(["rename", childRef.owner.name, "after", "--json"]);
    expect(result.exitCode ?? 0, result.stdout + result.stderr).toBe(0);
    for (const record of [parent, child, stub, ...companions]) {
      const content = success(await f.store.read({ reference: record.reference })).content;
      expect(content).toContain(nextCitation); expect(content).not.toContain(citation);
    }
    expect(success(await f.store.read({ reference: stub.reference })).content).toContain(`Keep \`spec-${childRef.owner.name}.md\`.`);
    const afterStarted = success(await f.store.read({ reference: started.reference }));
    expect(afterStarted.content).toContain(citation);
    expect(afterStarted.fields).toMatchObject({ cohort: `${parentRef.owner.name}/after` });
    expect(success(await f.store.read({ reference: closed.reference }))).toEqual(closedDocument);
    const events = await Promise.all([parent, child, stub, ...companions].map(async record => success(await f.store.history({ reference: record.reference }))[0]?.provenance));
    const event = events[0];
    if (event === undefined || !("batchId" in event)) throw new Error("Expected composed rename batch");
    for (const other of events) expect(other).toMatchObject({ batchId: event.batchId });
  }, 60_000);

  it("rewrites a sole closed subcohort and its completed member in place", async () => {
    const f = await fixture(backend), parentRef = f.reference("cohort/document", "parent"), childRef = f.reference("cohort/document", "child");
    const parent = await seed(f, parentRef, document(parentRef.owner.name));
    const child = await seed(f, childRef, document(childRef.owner.name, parentRef.owner.name));
    const memberRef = f.reference("work-item/meta", "completed"), placement = { kind: "completed" as const, quarter: ArchiveQuarterSchema.parse("2026-q4") };
    const member = await seed(f, memberRef, makeMetaFixture(memberRef.owner.name,
      { state: "Shipped", currentWorkflow: null, cohort: `${parentRef.owner.name}/${childRef.owner.name}` }), placement);
    success(await f.store.write({ ...recordPut(child, { placement }), provenance: { verb: "cohort-close", lifecycleAction: "close" } }));
    const closed = success(await f.store.read({ reference: child.reference }));
    const result = await f.invoke(["rename", parentRef.owner.name, "after", "--json"]);
    expect(result.exitCode ?? 0, result.stdout + result.stderr).toBe(0);
    const afterChild = success(await f.store.read({ reference: child.reference })), afterMember = success(await f.store.read({ reference: member.reference }));
    expect(afterChild.fields).toMatchObject({ parent: "after" });
    expect(afterChild.placement).toEqual(closed.placement);
    expect(afterMember.fields).toMatchObject({ cohort: `after/${childRef.owner.name}` });
    expect(afterMember.placement).toEqual(member.placement);
    const events = await Promise.all([parent, child, member].map(async record => success(await f.store.history({ reference: record.reference }))[0]?.provenance));
    const event = events[0];
    if (event === undefined || !("batchId" in event)) throw new Error("Expected one rename batch");
    for (const other of events) expect(other).toMatchObject({ batchId: event.batchId });
  }, 60_000);

  it("binds unchanged nonholding evidence and retries after a concurrent edit", async () => {
    const f = await fixture(backend), cohortRef = f.reference("cohort/document", "before");
    const cohort = await seed(f, cohortRef, document(cohortRef.owner.name));
    const memberRef = f.reference("work-item/meta", "member"), untouchedRef = f.reference("work-item/meta", "untouched");
    const member = await seed(f, memberRef, makeMetaFixture(memberRef.owner.name,
      { state: "Planning", currentWorkflow: null, cohort: cohortRef.owner.name }), { kind: "backlog", commitment: "planned" });
    const untouched = await seed(f, untouchedRef, makeMetaFixture(untouchedRef.owner.name,
      { state: "Planning", currentWorkflow: null }), { kind: "backlog", commitment: "planned" });
    const content = writeMetaNextAction(untouched.content, "Preserve the concurrent note.");
    const result = await f.invoke(["rename", cohortRef.owner.name, "after", "--json"], store => {
      const batch = store.batch.bind(store); let once = true;
      store.batch = async input => {
        if (once) {
          once = false;
          success(await f.store.write({ ...recordPut(untouched, { content }), provenance: { verb: "write-back", lifecycleAction: "edit" } }));
        }
        return batch(input);
      };
      return store;
    });
    expect(result.exitCode).toBe(1);
    expect(result.result).toMatchObject({ refusal: { code: "version-conflict" } });
    for (const record of [cohort, member]) expect(success(await f.store.read({ reference: record.reference }))).toEqual(record);
    const concurrent = success(await f.store.read({ reference: untouched.reference }));
    expect(concurrent.content).toBe(content);
    const retry = await f.invoke(["rename", cohortRef.owner.name, "after", "--json"]);
    expect(retry.exitCode ?? 0, retry.stdout + retry.stderr).toBe(0);
    expect(success(await f.store.read({ reference: member.reference })).fields).toMatchObject({ cohort: "after" });
    expect(success(await f.store.read({ reference: untouched.reference }))).toEqual(concurrent);
  }, 60_000);

  it("uses cohort-family authority when a work item shares the cohort's slug", async () => {
    const f = await fixture(backend);
    let store = f.store, peer: Store | undefined;
    if (f.native === undefined) peer = f.remote(true);
    else {
      const peerRoot = join(f.native.root, REF_PEER_PATH), remote = join(f.native.root, PREPARED_REMOTE_PATH);
      for (const cwd of [f.native.root, peerRoot]) {
        await f.cli.exec("git", ["remote", "set-url", "origin", remote], { cwd });
        await f.cli.exec("git", ["config", "remote.origin.arc-state", "push"], { cwd });
      }
      store = await f.open(); peer = await f.open(peerRoot);
    }
    if (peer === undefined) throw new Error("Expected independent writer");
    const cohortRef = f.reference("cohort/document", "shared"), memberRef = f.reference("work-item/meta", "member");
    const cohort = await seed({ ...f, store }, cohortRef, document(cohortRef.owner.name));
    const member = await seed({ ...f, store }, memberRef, makeMetaFixture(memberRef.owner.name,
      { state: "Planning", currentWorkflow: null, cohort: cohortRef.owner.name }), { kind: "backlog", commitment: "planned" });
    const other = success(await peer.write({ action: "put", expected: null,
      reference: RecordReferenceSchema.parse({ kind: "work-item/meta", owner: { type: "work-item", name: cohortRef.owner.name } }),
      content: makeMetaFixture(cohortRef.owner.name, { state: "Planning", currentWorkflow: null }),
      placement: { kind: "backlog", commitment: "planned" }, provenance: { verb: "create", lifecycleAction: "create" } }));
    const waiting = success(await peer.write({ action: "put", expected: null,
      reference: RecordReferenceSchema.parse({ kind: "work-item/meta", owner: { type: "work-item", name: "waiting" } }),
      content: `${makeMetaFixture("waiting", { state: "Planning", currentWorkflow: null, dependsOn: [cohortRef.owner.name] })}\nSee \`cohort-${cohortRef.owner.name}.md\`.\n`,
      placement: { kind: "backlog", commitment: "planned" }, provenance: { verb: "create", lifecycleAction: "create" } }));
    if (f.native !== undefined) success(await peer.push());
    success(await store.pull());
    expect(await store.lookup({ kind: "slug", slug: SlugSchema.parse(cohortRef.owner.name) }))
      .toMatchObject({ status: "refused", refusal: { code: "ambiguous-match" } });
    const retained = success(await store.read({ reference: other.reference })), owner = cohort.reference.owner;
    if (owner.type !== "cohort" || owner.uid === undefined) throw new Error("Expected cohort UID");
    const result = await f.invoke(["rename", owner.uid, "after", "--json"]);
    expect(result.exitCode ?? 0, result.stdout + result.stderr).toBe(0);
    expect(success(await store.read({ reference: member.reference })).fields).toMatchObject({ cohort: "after" });
    expect(success(await store.read({ reference: other.reference }))).toEqual(retained);
    const afterWaiting = success(await store.read({ reference: waiting.reference }));
    expect(afterWaiting.fields).toMatchObject({ dependsOn: [cohortRef.owner.name] });
    expect(afterWaiting.content).toContain("See `cohort-after.md`.");
    expect(success(await store.lookup({ kind: "slug", slug: SlugSchema.parse(cohortRef.owner.name) })).reference).toEqual(retained.reference);
  }, 60_000);

  it.each([false, true])("rewrites sole parent and child holdings in every member state, former=%s", async former => {
    const f = await fixture(backend), parentRef = f.reference("cohort/document", "parent"), childRef = f.reference("cohort/document", "child");
    const parent = await seed(f, parentRef, document(parentRef.owner.name));
    const child = await seed(f, childRef, document(childRef.owner.name, parentRef.owner.name));
    const directRef = f.reference("work-item/meta", "direct"), startedRef = f.reference("work-item/meta", "started");
    const completedRef = f.reference("work-item/meta", "completed"), path = `${parentRef.owner.name}/${childRef.owner.name}`;
    const direct = await seed(f, directRef, makeMetaFixture(directRef.owner.name,
      { state: "Planning", currentWorkflow: null, cohort: parentRef.owner.name }), { kind: "backlog", commitment: "planned" });
    const prose = `\nSee \`cohort-${childRef.owner.name}.md\`.\n`;
    const started = await seed(f, startedRef, `${makeMetaFixture(startedRef.owner.name,
      { state: "Active", currentWorkflow: "process-task-loop", cohort: path })}${prose}`, { kind: "active" });
    const completed = await seed(f, completedRef, makeMetaFixture(completedRef.owner.name,
      { state: "Shipped", currentWorkflow: null, cohort: path }), { kind: "completed", quarter: ArchiveQuarterSchema.parse("2026-q4") });
    const untouchedRef = f.reference("work-item/meta", "untouched");
    const untouched = await seed(f, untouchedRef, makeMetaFixture(untouchedRef.owner.name,
      { state: "Planning", currentWorkflow: null }), { kind: "backlog", commitment: "planned" });
    const untouchedHistory = success(await f.store.history({ reference: untouched.reference }));
    if (former) {
      for (const [record, name, parentName] of [[parent, "present-parent", undefined], [child, "present-child", parentRef.owner.name]] as const) {
        success(await f.store.write({ ...recordPut(record, { content: document(name, parentName) }),
          reference: RecordReferenceSchema.parse({ ...record.reference, owner: { ...record.reference.owner, name } }),
          provenance: { verb: "rename", lifecycleAction: "rename" } }));
      }
    }
    const childOwner = child.reference.owner, parentOwner = parent.reference.owner;
    if (childOwner.type !== "cohort" || parentOwner.type !== "cohort" || childOwner.uid === undefined || parentOwner.uid === undefined) throw new Error("Expected cohort UIDs");
    const renamedChild = await f.invoke(["rename", childOwner.uid, "next-child", "--json"]);
    expect(renamedChild.exitCode ?? 0, renamedChild.stdout + renamedChild.stderr).toBe(0);
    for (const member of [started, completed]) expect(success(await f.store.read({ reference: member.reference })).fields)
      .toMatchObject({ cohort: `${former ? "present-parent" : parentRef.owner.name}/next-child` });
    const renamedParent = await f.invoke(["rename", parentOwner.uid, "next-parent", "--json"]);
    expect(renamedParent.exitCode ?? 0, renamedParent.stdout + renamedParent.stderr).toBe(0);
    const afterChild = success(await f.store.read({ reference: child.reference }));
    expect(afterChild.fields).toMatchObject({ parent: "next-parent" });
    expect(success(await f.store.read({ reference: direct.reference })).fields).toMatchObject({ cohort: "next-parent" });
    for (const member of [started, completed]) expect(success(await f.store.read({ reference: member.reference })).fields)
      .toMatchObject({ cohort: "next-parent/next-child" });
    expect(success(await f.store.read({ reference: started.reference })).content).toContain(prose);
    expect(success(await f.store.read({ reference: completed.reference })).placement).toEqual(completed.placement);
    expect(success(await f.store.read({ reference: untouched.reference }))).toEqual(untouched);
    expect(success(await f.store.history({ reference: untouched.reference }))).toEqual(untouchedHistory);
    const events = await Promise.all([parent, child, direct, started, completed].map(async record =>
      success(await f.store.history({ reference: record.reference }))[0]?.provenance));
    const event = events[0];
    if (event === undefined || !("batchId" in event)) throw new Error("Expected parent rename batch");
    for (const other of events) expect(other).toMatchObject({ batchId: event.batchId });
  }, 60_000);

  it.each([false, true])("canonicalizes its former Parent and binds that unchanged evidence, concurrent=%s", async concurrent => {
    const f = await fixture(backend), parentRef = f.reference("cohort/document", "parent"), childRef = f.reference("cohort/document", "child");
    const parent = await seed(f, parentRef, document(parentRef.owner.name));
    const child = await seed(f, childRef, document(childRef.owner.name, parentRef.owner.name));
    const currentRef = RecordReferenceSchema.parse({ ...parent.reference, owner: { ...parent.reference.owner, name: "current-parent" } });
    success(await f.store.write({ ...recordPut(parent, { content: document("current-parent") }), reference: currentRef,
      provenance: { verb: "rename", lifecycleAction: "rename" } }));
    const current = success(await f.store.read({ reference: parent.reference }));
    const history = success(await f.store.history({ reference: parent.reference }));
    let advanced = current;
    const result = await f.invoke(["rename", childRef.owner.name, "after", "--json"], concurrent ? store => {
      const batch = store.batch.bind(store); let once = true;
      store.batch = async input => {
        if (once) {
          once = false;
          success(await f.store.write({ ...recordPut(current, { content: current.content.replace("Coordinate", "Keep the concurrent purpose") }),
            provenance: { verb: "write-back", lifecycleAction: "edit" } }));
          advanced = success(await f.store.read({ reference: parent.reference }));
        }
        return batch(input);
      };
      return store;
    } : undefined);
    if (concurrent) {
      expect(result.exitCode).toBe(1);
      expect(result.result).toMatchObject({ refusal: { code: "version-conflict" } });
      expect(success(await f.store.read({ reference: child.reference }))).toEqual(child);
      expect(success(await f.store.read({ reference: parent.reference }))).toEqual(advanced);
      const retry = await f.invoke(["rename", childRef.owner.name, "after", "--json"]);
      expect(retry.exitCode ?? 0, retry.stdout + retry.stderr).toBe(0);
    } else {
      expect(result.exitCode ?? 0, result.stdout + result.stderr).toBe(0);
      expect(success(await f.store.read({ reference: parent.reference }))).toEqual(current);
      expect(success(await f.store.history({ reference: parent.reference }))).toEqual(history);
    }
    expect(success(await f.store.read({ reference: child.reference })).content).toBe(document("after", "current-parent"));
  }, 60_000);

  it("renames the selected cohort and reports a no-write rerun through its former name", async () => {
    const f = await fixture(backend), reference = f.reference("cohort/document", "before");
    const primary = await seed(f, reference, document(reference.owner.name));
    const owner = primary.reference.owner;
    if (owner.type !== "cohort" || owner.uid === undefined) throw new Error("Expected cohort UID");
    const result = await f.invoke(["rename", owner.uid.toUpperCase(), "after", "--json"]);
    expect(result.exitCode ?? 0, result.stdout + result.stderr).toBe(0);
    const renamed = success(await f.store.read({ reference: primary.reference }));
    expect(renamed.reference).toEqual(RecordReferenceSchema.parse({ ...primary.reference, owner: { ...owner, name: "after" } }));
    expect(renamed.content).toBe(document("after"));
    expect(success(await f.store.lookup({ kind: "slug", slug: SlugSchema.parse(owner.name) })).reference).toEqual(renamed.reference);
    expect(result.result).toMatchObject({ status: "renamed", shape: "cohort", reference: renamed.reference,
      sourceSlug: owner.name, targetSlug: "after", recordBatch: "applied",
      report: { references: [], memberHeadings: [], formerSlugTies: [], keptBranches: [] } });
    const history = success(await f.store.history({ reference: renamed.reference })), version = success(await f.store.version());
    const repeated = await f.invoke(["rename", owner.name, "after"]);
    expect(repeated.exitCode ?? 0, repeated.stdout + repeated.stderr).toBe(0);
    expect(repeated.stdout).toContain(`Cohort: ${owner.name} → after`);
    expect(repeated.stdout).toMatch(/already renamed/iu);
    expect(success(await f.store.version())).toBe(version);
    expect(success(await f.store.read({ reference: primary.reference }))).toEqual(renamed);
    expect(success(await f.store.history({ reference: primary.reference }))).toEqual(history);
  }, 60_000);
});

it.each([{ closed: false, former: false }, { closed: true, former: false }, { closed: true, former: true }])(
  "reports safe repairs under a two-cohort clash, closed=$closed former=$former", async ({ closed, former }) => {
  const f = await fixture("ref");
  if (f.native === undefined) throw new Error("Expected native store");
  const parentRef = f.reference("cohort/document", former ? "old-parent" : "shared"), childRef = f.reference("cohort/document", "child");
  const sharedName = f.reference("cohort/document", "shared").owner.name;
  const parent = await seed(f, parentRef, document(parentRef.owner.name));
  const child = await seed(f, childRef, document(childRef.owner.name, parentRef.owner.name));
  const directRef = f.reference("work-item/meta", "direct"), completedRef = f.reference("work-item/meta", "completed");
  const openRef = f.reference("work-item/meta", "open"), path = `${parentRef.owner.name}/${childRef.owner.name}`;
  const direct = await seed(f, directRef, makeMetaFixture(directRef.owner.name,
    { state: "Planning", currentWorkflow: null, cohort: parentRef.owner.name }), { kind: "backlog", commitment: "planned" });
  const completed = await seed(f, completedRef, makeMetaFixture(completedRef.owner.name,
    { state: "Shipped", currentWorkflow: null, cohort: path }), { kind: "completed", quarter: ArchiveQuarterSchema.parse("2026-q4") });
  const open = closed ? undefined : await seed(f, openRef, makeMetaFixture(openRef.owner.name,
    { state: "Active", currentWorkflow: "process-task-loop", cohort: path }), { kind: "active" });
  if (former) {
    success(await f.store.write({ ...recordPut(parent, { content: document(sharedName) }),
      reference: RecordReferenceSchema.parse({ ...parent.reference, owner: { ...parent.reference.owner, name: sharedName } }),
      provenance: { verb: "rename", lifecycleAction: "rename" } }));
    success(await f.store.write({ ...recordPut(child, { content: document(childRef.owner.name, sharedName) }),
      provenance: { verb: "write-back", lifecycleAction: "edit" } }));
    success(await f.store.write({ ...recordPut(direct, { content: writeMetaCohort(direct.content, sharedName) }),
      provenance: { verb: "write-back", lifecycleAction: "edit" } }));
  }
  const currentChild = success(await f.store.read({ reference: child.reference }));
  if (closed) success(await f.store.write({ ...recordPut(currentChild, { placement: { kind: "completed", quarter: ArchiveQuarterSchema.parse("2026-q4") } }),
    provenance: { verb: "cohort-close", lifecycleAction: "close" } }));
  const other = await plantRefPrimary(f.native, { kind: "cohort/document", name: sharedName,
    uid: "00000000-0000-4000-8000-000000000077", content: document(sharedName) });
  const otherMember = await plantRefPrimary(f.native, { kind: "work-item/meta", name: "other-member",
    uid: "00000000-0000-4000-8000-000000000088", content: makeMetaFixture("other-member", { cohort: sharedName }) });
  const records = await Promise.all([child.reference, direct.reference, completed.reference, other, otherMember,
    ...(open === undefined ? [] : [open.reference])].map(async reference => success(await f.store.read({ reference }))));
  const owner = parent.reference.owner;
  if (owner.type !== "cohort" || owner.uid === undefined) throw new Error("Expected parent UID");
  const result = await f.invoke(["rename", owner.uid, "after", "--json"]);
  expect(result.exitCode ?? 0, result.stdout + result.stderr).toBe(0);
  for (const record of records) expect(success(await f.store.read({ reference: record.reference }))).toEqual(record);
  expect(success(await f.store.lookup({ kind: "slug", slug: SlugSchema.parse(sharedName) })).reference).toEqual(other);
  const report = holdingReport.parse(result.result).report;
  const childOwner = child.reference.owner, completedOwner = completed.reference.owner;
  if (childOwner.type !== "cohort" || completedOwner.type !== "work-item") throw new Error("Expected holding owners");
  if (closed) {
    expect(report.references).toEqual(expect.arrayContaining([
      { record: { type: "cohort", name: childOwner.name, uid: childOwner.uid }, edits: [] },
      { record: { type: "work-unit", name: completedOwner.name, uid: completedOwner.uid }, edits: [] },
    ]));
    expect(result.result).toMatchObject({ advisories: expect.arrayContaining([
      expect.stringContaining(`Closed subcohort ${childOwner.name} (${childOwner.uid})`),
    ]) });
    expect(report.references.flatMap(row => row.edits).some(edit => edit.field === "parent")).toBe(false);
  } else {
    if (open === undefined || open.reference.owner.type !== "work-item") throw new Error("Expected open member");
    const openOwner = open.reference.owner;
    expect(report.references.slice(0, 4)).toEqual([
      { record: { type: "work-unit", name: openOwner.name, uid: openOwner.uid }, edits: [{ kind: "field", field: "cohort", from: path, to: null }] },
      { record: { type: "cohort", name: childOwner.name, uid: childOwner.uid }, edits: [{ kind: "field", field: "parent", from: sharedName, to: "after" }] },
      { record: { type: "work-unit", name: openOwner.name, uid: openOwner.uid }, edits: [{ kind: "field", field: "cohort", from: null, to: `after/${childRef.owner.name}` }] },
      { record: { type: "work-unit", name: completedOwner.name, uid: completedOwner.uid }, edits: [{ kind: "field", field: "cohort", from: path, to: `after/${childRef.owner.name}` }] },
    ]);
  }
  for (const row of report.references) for (const edit of row.edits) {
    const reference = RecordReferenceSchema.parse({ kind: edit.field === "cohort" ? "work-item/meta" : "cohort/document",
      owner: { type: row.record.type === "cohort" ? "cohort" : "work-item", name: row.record.name, uid: row.record.uid } });
    const current = success(await f.store.read({ reference }));
    const content = edit.field === "cohort" ? writeMetaCohort(current.content, edit.to)
      : edit.to === null ? null : writeCohortParent(current.content, edit.to);
    if (content === null) throw new Error("Expected writable Parent field");
    success(await f.store.write({ ...recordPut(current, { content }), provenance: { verb: "write-back", lifecycleAction: "edit" } }));
  }
  expect(success(await f.store.read({ reference: child.reference })).fields).toMatchObject({ parent: closed ? sharedName : "after" });
  expect(success(await f.store.read({ reference: completed.reference })).fields).toMatchObject({ cohort: closed ? path : `after/${childRef.owner.name}` });
  expect(success(await f.store.read({ reference: direct.reference })).fields).toMatchObject({ cohort: "after" });
  expect(success(await f.store.read({ reference: other })).reference).toEqual(other);
}, 60_000);

it.each([false, true])("reports every eligible ambiguous filename citation without rewriting it, json=%s", async json => {
  const f = await fixture("ref");
  if (f.native === undefined) throw new Error("Expected native store");
  const primaryRef = f.reference("cohort/document", "shared"), citation = `See \`cohort-${primaryRef.owner.name}.md\`.\n`;
  const primary = await seed(f, primaryRef, `${document(primaryRef.owner.name)}\n${citation}`);
  const citingRef = f.reference("cohort/document", "citing"), stubRef = f.reference("work-item/meta", "waiting");
  const citing = await seed(f, citingRef, `${document(citingRef.owner.name)}\n${citation}`);
  const stub = await seed(f, stubRef, `${makeMetaFixture(stubRef.owner.name, { state: "Planning", currentWorkflow: null })}\n${citation}`,
    { kind: "backlog", commitment: "planned" });
  const eligible = [primary, citing, stub];
  for (const [kind, key] of [["work-item/draft", undefined], ["work-item/companion", "research"], ["work-item/companion", "analysis"]] as const) {
    eligible.push(await seed(f, RecordReferenceSchema.parse({ kind, owner: stub.reference.owner, ...(key === undefined ? {} : { key }) }), `# Detail\n\n${citation}`));
  }
  const startedRef = f.reference("work-item/meta", "started"), closedRef = f.reference("cohort/document", "closed");
  const started = await seed(f, startedRef, `${makeMetaFixture(startedRef.owner.name,
    { state: "Active", currentWorkflow: "process-task-loop" })}\n${citation}`, { kind: "active" });
  const closed = await seed(f, closedRef, `${document(closedRef.owner.name)}\n${citation}`);
  success(await f.store.write({ ...recordPut(closed, { placement: { kind: "completed", quarter: ArchiveQuarterSchema.parse("2026-q4") } }),
    provenance: { verb: "cohort-close", lifecycleAction: "close" } }));
  const closedDocument = success(await f.store.read({ reference: closed.reference }));
  const other = await plantRefPrimary(f.native, { kind: "cohort/document", name: primaryRef.owner.name,
    uid: "00000000-0000-4000-8000-000000000099", content: document(primaryRef.owner.name) });
  const owner = primary.reference.owner;
  if (owner.type !== "cohort" || owner.uid === undefined) throw new Error("Expected cohort UID");
  const result = await f.invoke(["rename", owner.uid, "after", ...json ? ["--json"] : []]);
  expect(result.exitCode ?? 0, result.stdout + result.stderr).toBe(0);
  for (const record of [...eligible.slice(1), started, closedDocument]) expect(success(await f.store.read({ reference: record.reference }))).toEqual(record);
  expect(success(await f.store.read({ reference: primary.reference })).content).toBe(`${document("after")}\n${citation}`);
  expect(success(await f.store.read({ reference: other })).reference).toEqual(other);
  if (json) {
    const rows = filenameReport.parse(result.result).report.references;
    expect(rows).toHaveLength(eligible.length);
    for (const record of eligible) {
      const own = record === primary;
      const identity = RecordReferenceSchema.parse({ ...record.reference, owner: { ...record.reference.owner,
        name: own ? "after" : record.reference.owner.name } });
      expect(rows).toContainEqual({ record: { type: record.reference.kind === "cohort/document" ? "cohort" : "work-unit",
        name: identity.owner.name, uid: record.reference.owner.type === "person" ? undefined : record.reference.owner.uid }, edits: [
        { kind: "text", document: identity, line: record.content.split(/\r?\n/u).findIndex(line => line === citation.trimEnd()) + 1,
          replacement: "See `cohort-after.md`." },
      ] });
    }
  } else {
    for (const key of ["research", "analysis"]) expect(result.stdout).toContain(`Document: work-item/companion ["${key}"]`);
    expect(result.stdout).toContain("See `cohort-after.md`.");
    for (const excluded of [started, closedDocument]) expect(result.stdout).not.toContain(`Reference: ${excluded.reference.kind === "cohort/document" ? "cohort" : "work-unit"} ${excluded.reference.owner.name}`);
  }
}, 60_000);
