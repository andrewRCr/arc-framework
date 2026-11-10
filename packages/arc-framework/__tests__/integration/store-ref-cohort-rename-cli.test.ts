/** Registered cohort renames preserve identity and compose version-bound content changes. */
import { describe, expect, it } from "vitest";
import type { StoreRecord } from "../../src/lib/store/read.js";
import { createKindRegistry, RecordReferenceSchema } from "../../src/lib/store/index.js";
import { SlugSchema, ArchiveQuarterSchema } from "../../src/lib/kernel/index.js";
import { PRODUCTION_REGISTRATIONS } from "../../src/lib/store/kinds/registrations.js";
import type { Store } from "../../src/lib/store/contract.js";
import { createRefFixture } from "../helpers/store/ref-fixture.js";
import { createReferenceFixture } from "../helpers/store/reference-fixture.js";
import { repairCliFixture, repairCli } from "../helpers/repair-cli.js";
import { seed, success, fixtureRenameProvenance } from "../helpers/store/suite-tools.js";
import { expandStoredPath } from "../../src/lib/store/stored-path.js";
import { recordPut } from "../../src/lib/store/lifecycle-write.js";
import { observeRecords } from "../../src/lib/store/record-observations.js";
import { makeMetaFixture } from "../helpers/meta-fixture.js";
import { join } from "node:path";
import { writeFile } from "node:fs/promises";
import { completeCutMapFixture } from "../fixtures/decompose-v4.js";
import { CutMapSchema, CutMapStarterSchema } from "../../src/lib/decompose/cut-map-schema.js";
import { REF_PEER_PATH } from "../helpers/store/ref-remote.js";
import { PREPARED_REMOTE_PATH } from "../helpers/prepared-repository.js";
import { plantRefPrimary } from "../helpers/store/ref-primary-plant.js";
import { z } from "zod";
import { writeMetaCohort, writeMetaNextAction } from "../../src/lib/store/kinds/meta/writers.js";
import { writeCohortParent } from "../../src/lib/store/kinds/cohort/index.js";

const production = createKindRegistry(PRODUCTION_REGISTRATIONS);
const arrivalCompleted = { kind: "completed" as const, quarter: ArchiveQuarterSchema.parse("2026-q4") };
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

async function seedFormerName(store: Store, record: StoreRecord, name: string, content: string): Promise<void> {
  const records: StoreRecord[] = [];
  for (const family of ["cohort", "work-item"] as const) {
    const listing = success(await store.list({ family }));
    if (listing.status === "absent") continue;
    if (listing.status !== "complete" || listing.missed || listing.diagnostics.length > 0) throw new Error("Expected complete fixture inventory");
    records.push(...listing.records);
  }
  success(await store.batch({ writes: [{ ...recordPut(record, { content }),
    reference: RecordReferenceSchema.parse({ ...record.reference, owner: { ...record.reference.owner, name } }) }],
  observations: observeRecords(records), provenance: fixtureRenameProvenance }));
}

async function applyReportedEdits(store: Store, report: z.infer<typeof holdingReport>["report"]): Promise<void> {
  for (const row of report.references) for (const edit of row.edits) {
    const reference = RecordReferenceSchema.parse({ kind: edit.field === "cohort" ? "work-item/meta" : "cohort/document",
      owner: { type: row.record.type === "cohort" ? "cohort" : "work-item", name: row.record.name, uid: row.record.uid } });
    const current = success(await store.read({ reference }));
    const content = edit.field === "cohort" ? writeMetaCohort(current.content, edit.to)
      : edit.to === null ? null : writeCohortParent(current.content, edit.to);
    if (content === null) throw new Error("Expected writable field");
    success(await store.write({ ...recordPut(current, { content }), provenance: { verb: "write-back", lifecycleAction: "edit" } }));
  }
}

describe.each(["reference", "ref"] as const)("cohort rename over %s", backend => {
  it("renames a mixed-state parent and every sole holding in one batch, then rejects the former path", async () => {
    const f = await fixture(backend), parentRef = f.reference("cohort/document", "parent");
    const openRef = f.reference("cohort/document", "open-child"), closedRef = f.reference("cohort/document", "closed-child");
    const citation = `See \`cohort-${parentRef.owner.name}.md\`.\n`;
    const parent = await seed(f, parentRef, `${document(parentRef.owner.name)}\n${citation}`);
    const open = await seed(f, openRef, `${document(openRef.owner.name, parentRef.owner.name)}\n${citation}`);
    const child = await seed(f, closedRef, `${document(closedRef.owner.name, parentRef.owner.name)}\n${citation}`);
    const completedPlacement = { kind: "completed" as const, quarter: ArchiveQuarterSchema.parse("2026-q4") };
    const members = [];
    for (const [name, state, cohort] of [["started", "Active", parentRef.owner.name], ["completed", "Shipped", parentRef.owner.name],
      ["closed-member", "Shipped", `${parentRef.owner.name}/${closedRef.owner.name}`],
      ["waiting", "Planning", `${parentRef.owner.name}/${openRef.owner.name}`]] as const) {
      const reference = f.reference("work-item/meta", name);
      members.push(await seed(f, reference, `${makeMetaFixture(reference.owner.name,
        { state, currentWorkflow: state === "Active" ? "process-task-loop" : null, cohort })}\n${citation}`,
      state === "Shipped" ? completedPlacement : state === "Active" ? { kind: "active" } : { kind: "backlog", commitment: "planned" }));
    }
    success(await f.store.write({ ...recordPut(child, { placement: completedPlacement }), provenance: { verb: "cohort-close", lifecycleAction: "close" } }));
    const closed = success(await f.store.read({ reference: child.reference }));
    const result = await f.invoke(["rename", parentRef.owner.name, "after", "--json"]);
    expect(result.exitCode ?? 0, result.stdout + result.stderr).toBe(0);
    const documents = await Promise.all([parent, open, closed].map(async record => success(await f.store.read({ reference: record.reference }))));
    expect(documents[0]?.content).toContain("# Cohort: `after`");
    for (const record of documents.slice(0, 2)) expect(record.content).toContain("See `cohort-after.md`.");
    expect(documents[1]?.fields).toMatchObject({ parent: "after" });
    expect(documents[2]?.fields).toMatchObject({ parent: "after" });
    expect(documents[2]?.content).toContain(citation);
    expect(documents[2]?.placement).toEqual(closed.placement);
    for (const [index, member] of members.entries()) {
      const current = success(await f.store.read({ reference: member.reference }));
      expect(current.fields).toMatchObject({ cohort: index < 2 ? "after" : `after/${index === 2 ? closedRef.owner.name : openRef.owner.name}` });
      expect(current.placement).toEqual(member.placement);
      expect(current.content).toContain(index === 3 ? "See `cohort-after.md`." : citation);
    }
    const events = await Promise.all([parent, open, closed, ...members].map(async record => success(await f.store.history({ reference: record.reference }))[0]?.provenance));
    const event = events[0];
    if (event === undefined || !("batchId" in event)) throw new Error("Expected one mixed-state batch");
    for (const other of events) expect(other).toMatchObject({ batchId: event.batchId });
    const waiting = members[3];
    if (waiting === undefined) throw new Error("Expected waiting stub");
    const current = success(await f.store.read({ reference: waiting.reference }));
    const refused = await f.store.write({ ...recordPut(current, { content: writeMetaCohort(current.content, `${parentRef.owner.name}/${openRef.owner.name}`) }),
      provenance: { verb: "write-back", lifecycleAction: "edit" } });
    expect(refused).toMatchObject({ status: "refused", refusal: { rule: "meta.cohort", condition: expect.stringContaining("after") } });
    expect(success(await f.store.read({ reference: current.reference }))).toEqual(current);
  }, 60_000);

  it("refuses to rename a closed cohort without changing its identity or history", async () => {
    const f = await fixture(backend), reference = f.reference("cohort/document", "closed");
    const primary = await seed(f, reference, document(reference.owner.name));
    success(await f.store.write({ ...recordPut(primary, { placement: { kind: "completed", quarter: ArchiveQuarterSchema.parse("2026-q4") } }),
      provenance: { verb: "cohort-close", lifecycleAction: "close" } }));
    const closed = success(await f.store.read({ reference: primary.reference }));
    const history = success(await f.store.history({ reference: primary.reference }));
    const result = await f.invoke(["rename", reference.owner.name, "after", "--json"]);
    expect(result.exitCode).toBe(1);
    expect(result.result).toMatchObject({ status: "rejected", refusal: { code: "unsupported", class: "terminal", case: "rename" } });
    expect(result.stdout).toContain("closed cohort cannot be renamed");
    expect(success(await f.store.read({ reference: primary.reference }))).toEqual(closed);
    expect(success(await f.store.history({ reference: primary.reference }))).toEqual(history);
    expect(await f.store.lookup({ kind: "slug", slug: SlugSchema.parse("after") })).toMatchObject({ status: "refused", refusal: { code: "not-found" } });
  }, 60_000);

  it.each(["completed", "former"] as const)("names the exact %s target holder and admits a free retry", async state => {
    const f = await fixture(backend), cohortRef = f.reference("cohort/document", "before"), targetRef = f.reference("work-item/meta", "taken");
    const cohort = await seed(f, cohortRef, document(cohortRef.owner.name));
    const completed = state === "completed";
    const holder = await seed(f, targetRef, makeMetaFixture(targetRef.owner.name,
      { state: completed ? "Shipped" : "Planning", currentWorkflow: null }), completed
      ? { kind: "completed", quarter: ArchiveQuarterSchema.parse("2026-q4") } : { kind: "backlog", commitment: "planned" });
    if (!completed) success(await f.store.write({ ...recordPut(holder, { content: makeMetaFixture("current-holder", { state: "Planning", currentWorkflow: null }) }),
      reference: RecordReferenceSchema.parse({ ...holder.reference, owner: { ...holder.reference.owner, name: "current-holder" } }),
      provenance: fixtureRenameProvenance }));
    const retained = success(await f.store.read({ reference: holder.reference }));
    const result = await f.invoke(["rename", cohortRef.owner.name, targetRef.owner.name, "--json"]);
    expect(result.exitCode).toBe(1);
    expect(result.result).toMatchObject({ status: "rejected", refusal: { remedy: { text: "Choose another slug." } } });
    if (retained.reference.owner.type !== "work-item") throw new Error("Expected work item holder");
    expect(result.stdout).toContain(`work unit '${retained.reference.owner.name}' (UID ${retained.reference.owner.uid}; ${completed ? "current" : "former"} name)`);
    expect(success(await f.store.read({ reference: cohort.reference }))).toEqual(cohort);
    expect(success(await f.store.read({ reference: holder.reference }))).toEqual(retained);
    const retry = await f.invoke(["rename", cohortRef.owner.name, "free", "--json"]);
    expect(retry.exitCode ?? 0, retry.stdout + retry.stderr).toBe(0);
    expect(success(await f.store.read({ reference: cohort.reference })).reference.owner.name).toBe("free");
  }, 60_000);

  it("takes an abandoned work item's name after its primary is removed", async () => {
    const f = await fixture(backend), cohortRef = f.reference("cohort/document", "before"), abandonedRef = f.reference("work-item/meta", "abandoned");
    const primary = await seed(f, cohortRef, document(cohortRef.owner.name));
    const abandoned = await seed(f, abandonedRef, makeMetaFixture(abandonedRef.owner.name,
      { state: "Planning", currentWorkflow: null }), { kind: "backlog", commitment: "planned" });
    const removed = await f.invoke(["abandon", abandonedRef.owner.name, "--yes"]);
    expect(removed.exitCode ?? 0, removed.stdout + removed.stderr).toBe(0);
    expect(await f.store.read({ reference: abandoned.reference })).toMatchObject({ status: "refused", refusal: { code: "not-found" } });
    const result = await f.invoke(["rename", cohortRef.owner.name, abandonedRef.owner.name, "--json"]);
    expect(result.exitCode ?? 0, result.stdout + result.stderr).toBe(0);
    expect(success(await f.store.read({ reference: primary.reference })).reference.owner)
      .toEqual({ ...primary.reference.owner, name: abandonedRef.owner.name });
  }, 60_000);

  it("keeps a stored cut map intact and finishes after its renamed cohort placement is revised", async () => {
    const f = await fixture(backend), originRef = f.reference("work-item/meta", "origin"), origin = originRef.owner.name;
    const primary = await seed(f, originRef, makeMetaFixture(origin,
      { state: "Planning", currentWorkflow: null, design: [`draft-${origin}.md`] }), { kind: "backlog", commitment: "planned" });
    await seed(f, RecordReferenceSchema.parse({ kind: "work-item/draft", owner: primary.reference.owner }), "# Draft\n\n## Scope\n\nOwned work.\n");
    const preflight = await f.invoke(["decompose", origin, "--preflight"]);
    expect(preflight.exitCode ?? 0, preflight.stdout + preflight.stderr).toBe(0);
    const map = completeCutMapFixture(CutMapStarterSchema.parse(preflight.result).machine);
    if (map.authoring.placement.kind !== "cohort") throw new Error("Expected cohort placement");
    map.authoring.placement.purpose = "See `cohort-group.md`.";
    const path = join(f.cli.cwd, "cut.json");
    await writeFile(path, JSON.stringify(map));
    const additive = await f.invoke(["decompose", origin, "--execute", path]);
    expect(additive.exitCode ?? 0, additive.stdout + additive.stderr).toBe(0);
    const storedRef = RecordReferenceSchema.parse({ kind: "work-item/cut-map", owner: primary.reference.owner });
    const stored = success(await f.store.read({ reference: storedRef }));
    const groupRef = RecordReferenceSchema.parse({ kind: "cohort/document", owner: { type: "cohort", name: "group" } });
    const group = success(await f.store.read({ reference: groupRef }));
    const rename = await f.invoke(["rename", "group", "after", "--json"]);
    expect(rename.exitCode ?? 0, rename.stdout + rename.stderr).toBe(0);
    expect(success(await f.store.read({ reference: stored.reference }))).toEqual(stored);
    expect(success(await f.store.read({ reference: group.reference })).content).toContain("See `cohort-after.md`.");
    const refused = await f.invoke(["decompose", origin, "--finish"]);
    expect(refused.exitCode).toBe(1);
    expect(refused.result).toMatchObject({ status: "refused", reason: "cohort-parent" });
    expect(refused.stdout).toContain("--revise");
    const carried = await f.invoke(["decompose", origin, "--revise"]);
    const revised = z.object({ status: z.literal("carried"), map: CutMapSchema }).parse(carried.result).map;
    if (revised.authoring.placement.kind !== "cohort") throw new Error("Expected cohort placement");
    revised.authoring.placement.cohort = "replacement";
    revised.authoring.placement.purpose = "Coordinate the replacement.";
    await writeFile(path, JSON.stringify(revised));
    const preview = await f.invoke(["decompose", origin, "--revise", path]);
    expect(preview.exitCode ?? 0, preview.stdout + preview.stderr).toBe(0);
    const authority = z.object({ kind: z.literal("preview"), applyAuthority: z.string() }).parse(preview.result).applyAuthority;
    const applied = await f.invoke(["decompose", origin, "--revise", path, "--apply", authority]);
    expect(applied.exitCode ?? 0, applied.stdout + applied.stderr).toBe(0);
    expect(applied.result).toMatchObject({ kind: "revised" });
    const finish = await f.invoke(["decompose", origin, "--finish"]);
    expect(finish.exitCode ?? 0, finish.stdout + finish.stderr).toBe(0);
    const finishAuthority = z.object({ kind: z.literal("preview"), applyAuthority: z.string() }).parse(finish.result).applyAuthority;
    const finished = await f.invoke(["decompose", origin, "--finish", "--apply", finishAuthority]);
    expect(finished.exitCode ?? 0, finished.stdout + finished.stderr).toBe(0);
    expect(finished.result).toMatchObject({ kind: "applied" });
    expect(await f.store.read({ reference: primary.reference })).toMatchObject({ status: "refused", refusal: { code: "not-found" } });
    expect(await f.store.read({ reference: stored.reference })).toMatchObject({ status: "refused", refusal: { code: "not-found" } });
    expect(await f.store.read({ reference: group.reference })).toMatchObject({ status: "refused", refusal: { code: "not-found" } });
    const replacement = success(await f.store.read({ reference: RecordReferenceSchema.parse({ kind: "cohort/document",
      owner: { type: "cohort", name: "replacement" } }) }));
    expect(replacement.reference.owner).not.toEqual(group.reference.owner);
    for (const name of ["member-a", "member-b"]) expect(success(await f.store.read({ reference: RecordReferenceSchema.parse({ kind: "work-item/meta",
      owner: { type: "work-item", name } }) })).fields).toMatchObject({ cohort: "replacement" });
  }, 60_000);

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

  it("admits a concurrent edit to a record its preparation read but does not rest on", async () => {
    const f = await fixture(backend), cohortRef = f.reference("cohort/document", "before");
    await seed(f, cohortRef, document(cohortRef.owner.name));
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
    expect(result.exitCode ?? 0, result.stdout + result.stderr).toBe(0);
    expect(success(await f.store.read({ reference: member.reference })).fields).toMatchObject({ cohort: "after" });
    expect(success(await f.store.read({ reference: untouched.reference })).content).toBe(content);
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
        await seedFormerName(f.store, record, name, document(name, parentName));
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
    await seedFormerName(f.store, parent, currentRef.owner.name, document("current-parent"));
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

it.each([false, true])("retains a sole former-path member behind an ambiguous Parent, completed=%s", async completed => {
  const f = await fixture("ref");
  if (f.native === undefined) throw new Error("Expected native store");
  const oldRef = f.reference("cohort/document", "old"), childRef = f.reference("cohort/document", "child");
  const shared = f.reference("cohort/document", "shared").owner.name;
  const parent = await seed(f, oldRef, document(oldRef.owner.name));
  const child = await seed(f, childRef, document(childRef.owner.name, oldRef.owner.name));
  const memberRef = f.reference("work-item/meta", "retained"), path = `${oldRef.owner.name}/${childRef.owner.name}`;
  const member = await seed(f, memberRef, makeMetaFixture(memberRef.owner.name, {
    state: completed ? "Shipped" : "Active", currentWorkflow: completed ? null : "process-task-loop", cohort: path,
  }), completed ? { kind: "completed", quarter: ArchiveQuarterSchema.parse("2026-q4") } : { kind: "active" });
  await seedFormerName(f.store, parent, shared, document(shared));
  if (child.reference.owner.type !== "cohort" || child.reference.owner.uid === undefined) throw new Error("Expected child UID");
  await plantRefPrimary(f.native, { kind: "cohort/document", name: childRef.owner.name, uid: child.reference.owner.uid,
    content: document(childRef.owner.name, shared) });
  const other = await plantRefPrimary(f.native, { kind: "cohort/document", name: shared,
    uid: "00000000-0000-4000-8000-000000000091", content: document(shared) });
  const keptChild = success(await f.store.read({ reference: child.reference })), keptOther = success(await f.store.read({ reference: other }));
  expect(success(await f.store.read({ reference: oldRef })).reference.owner).toEqual({ ...parent.reference.owner, name: shared });
  expect(await f.store.read({ reference: RecordReferenceSchema.parse({ kind: "cohort/document", owner: { type: "cohort", name: shared } }) }))
    .toMatchObject({ status: "refused", refusal: { code: "ambiguous-match" } });
  const owner = parent.reference.owner;
  if (owner.type !== "cohort" || owner.uid === undefined || member.reference.owner.type !== "work-item") throw new Error("Expected exact identities");
  const result = await f.invoke(["rename", owner.uid, "after", "--json"]);
  expect(result.exitCode ?? 0, result.stdout + result.stderr).toBe(0);
  expect(success(await f.store.read({ reference: parent.reference })).reference.owner).toEqual({ ...owner, name: "after" });
  expect(success(await f.store.read({ reference: child.reference }))).toEqual(keptChild);
  expect(success(await f.store.read({ reference: member.reference }))).toEqual(member);
  expect(success(await f.store.read({ reference: other }))).toEqual(keptOther);
  const memberOwner = { type: "work-unit", name: member.reference.owner.name, uid: member.reference.owner.uid };
  const childOwner = { type: "cohort", name: child.reference.owner.name, uid: child.reference.owner.uid };
  const parentEdit = { record: childOwner, edits: [{ kind: "field", field: "parent", from: shared, to: "after" }] };
  const report = holdingReport.parse(result.result).report;
  expect(report.references).toEqual(completed ? [parentEdit,
    { record: memberOwner, edits: [{ kind: "field", field: "cohort", from: path, to: `after/${childRef.owner.name}` }] },
  ] : [
    { record: memberOwner, edits: [{ kind: "field", field: "cohort", from: path, to: null }] }, parentEdit,
    { record: memberOwner, edits: [{ kind: "field", field: "cohort", from: null, to: `after/${childRef.owner.name}` }] },
  ]);
  for (const row of report.references) for (const edit of row.edits) {
    const reference = RecordReferenceSchema.parse({ kind: edit.field === "cohort" ? "work-item/meta" : "cohort/document",
      owner: { type: row.record.type === "cohort" ? "cohort" : "work-item", name: row.record.name, uid: row.record.uid } });
    const current = success(await f.store.read({ reference }));
    expect(current.fields).toMatchObject({ [edit.field]: edit.from });
    const content = edit.field === "cohort" ? writeMetaCohort(current.content, edit.to)
      : edit.to === null ? null : writeCohortParent(current.content, edit.to);
    if (content === null) throw new Error("Expected writable field");
    success(await f.store.write({ ...recordPut(current, { content }), provenance: { verb: "write-back", lifecycleAction: "edit" } }));
  }
  expect(success(await f.store.read({ reference: child.reference })).fields).toMatchObject({ parent: "after" });
  const repaired = success(await f.store.read({ reference: member.reference }));
  expect(repaired.fields).toMatchObject({ cohort: `after/${childRef.owner.name}` });
  expect(repaired.placement).toEqual(member.placement);
  expect(success(await f.store.read({ reference: other }))).toEqual(keptOther);
}, 60_000);

it.each(["filename", "membership"] as const)("refuses a stale cohort %s rewrite after a new holder arrives", async kind => {
  const f = await fixture("ref");
  if (f.native === undefined) throw new Error("Expected native store");
  const reference = f.reference("cohort/document", "parent"), parent = await seed(f, reference, document(reference.owner.name));
  const memberRef = f.reference("work-item/meta", "waiting");
  const member = await seed(f, memberRef, `${makeMetaFixture(memberRef.owner.name, { state: "Planning", currentWorkflow: null,
    cohort: kind === "membership" ? reference.owner.name : null })}\n${kind === "filename" ? `See \`cohort-${reference.owner.name}.md\`.` : "Unrelated prose."}\n`,
  { kind: "backlog", commitment: "planned" });
  const owner = parent.reference.owner;
  if (owner.type !== "cohort" || owner.uid === undefined) throw new Error("Expected parent UID");
  let other: typeof reference | undefined, racedVersion: string | undefined;
  const result = await f.invoke(["rename", owner.uid, "after", "--json"], store => {
    const wrapped = Object.create(store) as Store;
    wrapped.batch = async input => {
      if (other === undefined) {
        other = await plantRefPrimary(f.native!, { kind: "cohort/document", name: reference.owner.name,
          uid: "00000000-0000-4000-8000-000000000093", content: document(reference.owner.name) });
        racedVersion = success(await f.store.version());
      }
      return store.batch(input);
    };
    return wrapped;
  });
  expect(result).toMatchObject({ exitCode: 1, result: { status: "rejected", refusal: { code: "record-malformed", rule: "rename.preparation" } } });
  expect(racedVersion).toBeDefined();
  expect(success(await f.store.version())).toBe(racedVersion);
  expect(success(await f.store.read({ reference: parent.reference }))).toEqual(parent);
  expect(success(await f.store.read({ reference: member.reference }))).toEqual(member);
  if (other === undefined) throw new Error("Expected concurrent holder");
  const keptOther = success(await f.store.read({ reference: other }));
  const retry = await f.invoke(["rename", owner.uid, "after", "--json"]);
  expect(retry.exitCode ?? 0, retry.stdout + retry.stderr).toBe(0);
  expect(retry.result).toMatchObject({ status: "renamed", report: { references: expect.arrayContaining([
    expect.objectContaining({ record: expect.objectContaining({ name: member.reference.owner.name }) }),
  ]) } });
  expect(success(await f.store.read({ reference: parent.reference })).reference.owner.name).toBe("after");
  expect(success(await f.store.read({ reference: member.reference }))).toEqual(member);
  expect(success(await f.store.read({ reference: other }))).toEqual(keptOther);
}, 60_000);

it("retains a sole Parent with ambiguous open and completed member paths, then executes its repairs", async () => {
  const f = await fixture("ref");
  if (f.native === undefined) throw new Error("Expected native store");
  const oldRef = f.reference("cohort/document", "old"), childRef = f.reference("cohort/document", "child");
  const shared = f.reference("cohort/document", "shared").owner.name;
  const parent = await seed(f, oldRef, document(oldRef.owner.name));
  const child = await seed(f, childRef, document(childRef.owner.name, oldRef.owner.name));
  const members = [];
  for (const completed of [false, true]) {
    const reference = f.reference("work-item/meta", completed ? "ended" : "open");
    members.push(await seed(f, reference, makeMetaFixture(reference.owner.name, {
      state: completed ? "Shipped" : "Active", currentWorkflow: completed ? null : "process-task-loop",
      cohort: `${oldRef.owner.name}/${childRef.owner.name}`,
    }), completed ? { kind: "completed", quarter: ArchiveQuarterSchema.parse("2026-q4") } : { kind: "active" }));
  }
  await seedFormerName(f.store, parent, shared, document(shared));
  const path = `${shared}/${childRef.owner.name}`;
  success(await f.store.batch({ writes: [recordPut(child, { content: document(childRef.owner.name, shared) }),
    ...members.map(member => recordPut(member, { content: writeMetaCohort(member.content, path) }))],
  provenance: fixtureRenameProvenance }));
  if (child.reference.owner.type !== "cohort" || child.reference.owner.uid === undefined) throw new Error("Expected child UID");
  await plantRefPrimary(f.native, { kind: "cohort/document", name: childRef.owner.name, uid: child.reference.owner.uid,
    content: document(childRef.owner.name, oldRef.owner.name) });
  const keptChild = success(await f.store.read({ reference: child.reference }));
  const kept = await Promise.all(members.map(member => f.store.read({ reference: member.reference }).then(success)));
  const other = await plantRefPrimary(f.native, { kind: "cohort/document", name: shared,
    uid: "00000000-0000-4000-8000-000000000092", content: document(shared) });
  const keptOther = success(await f.store.read({ reference: other })), owner = parent.reference.owner;
  if (owner.type !== "cohort" || owner.uid === undefined) throw new Error("Expected parent UID");
  const result = await f.invoke(["rename", owner.uid, "after", "--json"]);
  expect(result.exitCode ?? 0, result.stdout + result.stderr).toBe(0);
  expect(success(await f.store.read({ reference: child.reference }))).toEqual(keptChild);
  for (const member of kept) expect(success(await f.store.read({ reference: member.reference }))).toEqual(member);
  const report = holdingReport.parse(result.result).report;
  expect(report.references.flatMap(row => row.edits.map(edit => ({ name: row.record.name, ...edit })))).toEqual([
    { name: kept[0]?.reference.owner.name, kind: "field", field: "cohort", from: path, to: null },
    { name: child.reference.owner.name, kind: "field", field: "parent", from: oldRef.owner.name, to: "after" },
    { name: kept[0]?.reference.owner.name, kind: "field", field: "cohort", from: null, to: `after/${childRef.owner.name}` },
    { name: kept[1]?.reference.owner.name, kind: "field", field: "cohort", from: path, to: `after/${childRef.owner.name}` },
  ]);
  for (const row of report.references) for (const edit of row.edits) {
    const reference = RecordReferenceSchema.parse({ kind: edit.field === "cohort" ? "work-item/meta" : "cohort/document",
      owner: { type: row.record.type === "cohort" ? "cohort" : "work-item", name: row.record.name, uid: row.record.uid } });
    const current = success(await f.store.read({ reference }));
    expect(current.fields).toMatchObject({ [edit.field]: edit.from });
    const content = edit.field === "cohort" ? writeMetaCohort(current.content, edit.to)
      : edit.to === null ? null : writeCohortParent(current.content, edit.to);
    if (content === null) throw new Error("Expected writable field");
    success(await f.store.write({ ...recordPut(current, { content }), provenance: { verb: "write-back", lifecycleAction: "edit" } }));
  }
  expect(success(await f.store.read({ reference: child.reference })).fields).toMatchObject({ parent: "after" });
  for (const member of kept) {
    const repaired = success(await f.store.read({ reference: member.reference }));
    expect(repaired.fields).toMatchObject({ cohort: `after/${childRef.owner.name}` });
    expect(repaired.placement).toEqual(member.placement);
  }
  expect(success(await f.store.read({ reference: other }))).toEqual(keptOther);
}, 60_000);

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
    await seedFormerName(f.store, parent, sharedName, document(sharedName));
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

it.each([false, true])("reports a tied leaf's edit at the renamed cohort's own path, renamed nested=%s, and every edit lands", async nested => {
  const f = await fixture("ref");
  if (f.native === undefined) throw new Error("Expected native store");
  const outer = await seed(f, f.reference("cohort/document", "outer"), document(f.reference("cohort/document", "outer").owner.name));
  const outerName = outer.reference.owner.name, name = f.reference("cohort/document", "tied").owner.name;
  const renamedUid = "00000000-0000-4000-8000-000000000071", otherUid = "00000000-0000-4000-8000-000000000072";
  await plantRefPrimary(f.native, { kind: "cohort/document", name, uid: renamedUid, content: document(name, nested ? outerName : undefined) });
  const other = await plantRefPrimary(f.native, { kind: "cohort/document", name, uid: otherUid, content: document(name, nested ? undefined : outerName) });
  for (const [member, uid, path] of [["nested-member", "81", `${outerName}/${name}`], ["top-member", "82", name]] as const) {
    await plantRefPrimary(f.native, { kind: "work-item/meta", name: member, uid: `00000000-0000-4000-8000-0000000000${uid}`,
      content: makeMetaFixture(member, { cohort: path }) });
  }
  const result = await f.invoke(["rename", renamedUid, "after", "--json"]);
  expect(result.exitCode ?? 0, result.stdout + result.stderr).toBe(0);
  const report = holdingReport.parse(result.result).report, edits = report.references.flatMap(row => row.edits);
  expect(edits).toHaveLength(2);
  for (const edit of edits) expect(edit).toMatchObject({ field: "cohort", to: nested ? `${outerName}/after` : "after" });
  await applyReportedEdits(f.store, report);
  expect(success(await f.store.read({ reference: other })).reference).toEqual(other);
}, 60_000);

it("leaves unreported a completed member whose tied first segment's leaf has another Parent", async () => {
  const f = await fixture("ref");
  if (f.native === undefined) throw new Error("Expected native store");
  const renamed = await seed(f, f.reference("cohort/document", "tied"), document(f.reference("cohort/document", "tied").owner.name));
  const name = renamed.reference.owner.name, moved = f.reference("cohort/document", "moved"), other = f.reference("cohort/document", "other");
  const child = await seed(f, f.reference("cohort/document", "leaf"), document(f.reference("cohort/document", "leaf").owner.name, name));
  const memberRef = f.reference("work-item/meta", "member"), path = `${name}/${child.reference.owner.name}`;
  const member = await seed(f, memberRef, makeMetaFixture(memberRef.owner.name, { state: "Shipped", currentWorkflow: null, cohort: path }),
    { kind: "completed", quarter: ArchiveQuarterSchema.parse("2026-q4") });
  await seed(f, moved, document(moved.owner.name));
  success(await f.store.write({ ...recordPut(child, { content: document(child.reference.owner.name, moved.owner.name) }),
    provenance: { verb: "write-back", lifecycleAction: "edit" } }));
  await seed(f, other, document(other.owner.name));
  await plantRefPrimary(f.native, { kind: "cohort/document", name, uid: "00000000-0000-4000-8000-000000000092", content: document(name) });
  const owner = renamed.reference.owner;
  if (owner.type !== "cohort" || owner.uid === undefined) throw new Error("Expected renamed UID");
  const result = await f.invoke(["rename", owner.uid, "after", "--json"]);
  expect(result.exitCode ?? 0, result.stdout + result.stderr).toBe(0);
  const report = holdingReport.parse(result.result).report, memberOwner = member.reference.owner;
  if (memberOwner.type !== "work-item") throw new Error("Expected member UID");
  expect(report.references.filter(row => row.record.uid === memberOwner.uid).flatMap(row => row.edits)).toEqual([]);
  await applyReportedEdits(f.store, report);
  expect(success(await f.store.read({ reference: member.reference })).fields).toMatchObject({ cohort: path });
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

it("names every tied target holder and retains the lookup's identity evidence", async () => {
  const f = await fixture("ref");
  if (f.native === undefined) throw new Error("Expected native store");
  const cohortRef = f.reference("cohort/document", "before");
  const primary = await seed(f, cohortRef, document(cohortRef.owner.name));
  const holders = [await plantRefPrimary(f.native, { kind: "cohort/document", name: "taken",
    uid: "00000000-0000-4000-8000-000000000011", content: document("taken") }),
  await plantRefPrimary(f.native, { kind: "work-item/meta", name: "taken",
    uid: "00000000-0000-4000-8000-000000000012", content: makeMetaFixture("taken") })];
  const lookup = await f.store.lookup({ kind: "slug", slug: SlugSchema.parse("taken") });
  if (lookup.status !== "refused" || lookup.refusal.code !== "ambiguous-match") throw new Error("Expected tied target");
  const result = await f.invoke(["rename", cohortRef.owner.name, "taken", "--json"]);
  expect(result.exitCode).toBe(1);
  expect(result.result).toMatchObject({ remedy: { text: "Choose another slug." }, refusal: { ...lookup.refusal,
    condition: expect.any(String), remedy: { text: "Choose another slug." } } });
  for (const holder of holders) {
    expect(result.stdout).toContain(holder.kind === "cohort/document" ? "cohort 'taken'" : "work unit 'taken'");
    if (holder.owner.type === "person") throw new Error("Expected named holder");
    expect(result.stdout).toContain(holder.owner.uid);
  }
  expect(success(await f.store.read({ reference: primary.reference }))).toEqual(primary);
}, 60_000);

it.each([false, true])("settles a closed child's late member through a unique former Parent, clash=%s", async clash => {
  const f = await fixture("ref");
  if (f.native === undefined) throw new Error("Expected native store");
  const peerRoot = join(f.native.root, REF_PEER_PATH), remote = join(f.native.root, PREPARED_REMOTE_PATH);
  for (const cwd of [f.native.root, peerRoot]) {
    await f.cli.exec("git", ["remote", "set-url", "origin", remote], { cwd });
    await f.cli.exec("git", ["config", "remote.origin.arc-state", "push"], { cwd });
  }
  const local = await f.open(), peer = await f.open(peerRoot);
  const parentRef = f.reference("cohort/document", "old-parent"), childRef = f.reference("cohort/document", "child");
  const shared = f.reference("cohort/document", "shared").owner.name;
  const parent = await seed({ ...f, store: local }, parentRef, document(parentRef.owner.name));
  const child = await seed({ ...f, store: local }, childRef, document(childRef.owner.name, parentRef.owner.name));
  const parentOwner = parent.reference.owner;
  if (parentOwner.type !== "cohort" || parentOwner.uid === undefined) throw new Error("Expected parent UID");
  success(await local.push()); success(await peer.pull());
  await seedFormerName(local, parent, shared, document(shared));
  const parentGitRef = `refs/arc/cohort/${parentOwner.uid}`;
  await f.cli.exec("git", ["push", "origin", `${parentGitRef}:${parentGitRef}`], { cwd: f.native.root });
  success(await peer.pull());
  const peerChild = success(await peer.read({ reference: child.reference }));
  success(await peer.write({ ...recordPut(peerChild, { content: document(childRef.owner.name, shared) }),
    provenance: { verb: "write-back", lifecycleAction: "edit" } }));
  const memberRef = f.reference("work-item/meta", "late-member"), path = `${shared}/${childRef.owner.name}`;
  const placement = { kind: "completed" as const, quarter: ArchiveQuarterSchema.parse("2026-q4") };
  const member = await seed({ ...f, store: peer }, memberRef, makeMetaFixture(memberRef.owner.name,
    { state: clash ? "Shipped" : "Planning", currentWorkflow: null, cohort: path }),
  clash ? placement : { kind: "backlog", commitment: "planned" });
  success(await local.write({ ...recordPut(child, { placement }), provenance: { verb: "cohort-close", lifecycleAction: "close" } }));
  const memberOwner = member.reference.owner;
  if (memberOwner.type !== "work-item" || memberOwner.uid === undefined) throw new Error("Expected member UID");
  const memberGitRef = expandStoredPath(member.reference, { placement: member.placement }).ref, memberHistory = `refs/arc/history/work/${memberOwner.uid}` as const;
  await f.cli.exec("git", ["push", "origin", `${memberGitRef}:${memberGitRef}`,
    ...clash ? [`${memberHistory}:${memberHistory}`] : []], { cwd: peerRoot });
  success(await local.pull());
  if (clash) success(await local.pull({ history: [memberHistory] }));
  const closed = success(await local.read({ reference: child.reference })), late = success(await local.read({ reference: member.reference }));
  expect(closed.placement).toMatchObject(placement);
  expect(closed.fields).toMatchObject({ parent: parentRef.owner.name });
  expect(late.fields).toMatchObject({ cohort: path });
  if (clash) await plantRefPrimary(f.native, { kind: "cohort/document", name: shared,
    uid: "00000000-0000-4000-8000-000000000066", content: document(shared) });
  const renamed = await f.invoke(["rename", parentOwner.uid, "after", "--json"]);
  expect(renamed.exitCode ?? 0, renamed.stdout + renamed.stderr).toBe(0);
  const changedChild = success(await local.read({ reference: child.reference }));
  expect(changedChild.fields).toMatchObject({ parent: "after" });
  expect(changedChild.placement).toEqual(closed.placement);
  const report = holdingReport.parse(renamed.result).report;
  if (clash) {
    expect(success(await local.read({ reference: member.reference }))).toEqual(late);
    expect(report.references).toEqual([{ record: { type: "work-unit", name: memberOwner.name, uid: memberOwner.uid },
      edits: [{ kind: "field", field: "cohort", from: path, to: `after/${childRef.owner.name}` }] }]);
    const edit = report.references[0]?.edits[0];
    if (edit === undefined) throw new Error("Expected exact member edit");
    success(await local.write({ ...recordPut(late, { content: writeMetaCohort(late.content, edit.to) }),
      provenance: { verb: "write-back", lifecycleAction: "edit" } }));
  } else expect(report.references).toEqual([]);
  const settled = success(await local.read({ reference: member.reference }));
  expect(settled.fields).toMatchObject({ cohort: `after/${childRef.owner.name}` });
  expect(settled.placement).toEqual(late.placement);
  const childEvent = success(await local.history({ reference: child.reference }))[0]?.provenance;
  const parentEvent = success(await local.history({ reference: parent.reference }))[0]?.provenance;
  expect(childEvent).toMatchObject({ batchId: expect.any(String) });
  expect(parentEvent).toMatchObject({ batchId: childEvent !== undefined && "batchId" in childEvent ? childEvent.batchId : undefined });
}, 60_000);

it("refuses a completed work unit arriving at a cohort destination and retries another name", async () => {
  const f = await fixture("ref"), reference = f.reference("cohort/document", "origin");
  const primary = await seed(f, reference, document(reference.owner.name));
  let holder: typeof primary | undefined, version: string | undefined;
  const result = await f.invoke(["rename", reference.owner.name, "target", "--json"], store => {
    const wrapped = Object.create(store) as Store;
    wrapped.batch = async input => {
      if (holder === undefined) {
        const allocated = f.reference("work-item/meta", "target");
        const target = RecordReferenceSchema.parse({ ...allocated, owner: { ...allocated.owner, name: "target" } });
        holder = await seed(f, target, makeMetaFixture(target.owner.name, { state: "Shipped", currentWorkflow: null }),
          { kind: "completed", quarter: ArchiveQuarterSchema.parse("2026-q4") });
        version = success(await f.store.version());
      }
      return store.batch(input);
    };
    return wrapped;
  });
  expect(result).toMatchObject({ exitCode: 1, result: { status: "rejected", refusal: { code: "record-malformed", rule: "rename.preparation" } } });
  expect(version).toBeDefined();
  expect(success(await f.store.version())).toBe(version);
  expect(success(await f.store.read({ reference: primary.reference }))).toEqual(primary);
  if (holder === undefined) throw new Error("Expected concurrent destination holder");
  expect(success(await f.store.read({ reference: holder.reference }))).toEqual(holder);
  const retry = await f.invoke(["rename", reference.owner.name, "available", "--json"]);
  expect(retry.exitCode ?? 0, retry.stdout + retry.stderr).toBe(0);
  expect(success(await f.store.read({ reference: primary.reference })).reference.owner.name).toBe("available");
  expect(success(await f.store.read({ reference: holder.reference }))).toEqual(holder);
}, 60_000);

async function plantCohortName(f: Awaited<ReturnType<typeof fixture>>, record: StoreRecord, name: string, parent?: string) {
  const reference = RecordReferenceSchema.parse({ ...record.reference, owner: { ...record.reference.owner, name } });
  if (reference.owner.type !== "cohort" || reference.owner.uid === undefined) throw new Error("Expected cohort UID");
  const content = document(name, parent);
  if (f.native === undefined) throw new Error("Expected native ref store");
  await plantRefPrimary(f.native, { kind: "cohort/document", uid: reference.owner.uid, name, content });
  return success(await f.store.read({ reference }));
}

it.each([false, true])("repairs simultaneous parent and child clashes without assigning members, completed=%s", async completed => {
  const f = await fixture("ref"), parentRef = f.reference("cohort/document", "parent"), childRef = f.reference("cohort/document", "child");
  const parent = await seed(f, parentRef, document(parentRef.owner.name));
  const child = await seed(f, childRef, document(childRef.owner.name, parentRef.owner.name));
  const otherParentRef = f.reference("cohort/document", "other-parent"), otherChildRef = f.reference("cohort/document", "other-child");
  const otherParent = await seed(f, otherParentRef, document(otherParentRef.owner.name));
  const otherChild = await seed(f, otherChildRef, document(otherChildRef.owner.name, otherParentRef.owner.name));
  const memberRef = f.reference("work-item/meta", "nested"), path = `${parentRef.owner.name}/${childRef.owner.name}`;
  const member = await seed(f, memberRef, makeMetaFixture(memberRef.owner.name, {
    cohort: path, state: completed ? "Shipped" : "Planning", currentWorkflow: null,
  }), completed ? { kind: "completed", quarter: ArchiveQuarterSchema.parse("2026-q4") } : { kind: "backlog", commitment: "planned" });
  const keptParent = await plantCohortName(f, otherParent, parentRef.owner.name);
  const keptChild = await plantCohortName(f, otherChild, childRef.owner.name, parentRef.owner.name);
  const owner = parent.reference.owner;
  if (owner.type !== "cohort" || owner.uid === undefined) throw new Error("Expected parent UID");
  const result = await f.invoke(["rename", owner.uid, "next-parent", "--json"]);
  expect(result.exitCode ?? 0, result.stdout + result.stderr).toBe(0);
  const report = holdingReport.parse(result.result).report;
  expect(report.references.map(row => row.record.uid)).toEqual(expect.arrayContaining([
    child.reference.owner.type === "cohort" ? child.reference.owner.uid : "", keptChild.reference.owner.type === "cohort" ? keptChild.reference.owner.uid : "",
    member.reference.owner.type === "work-item" ? member.reference.owner.uid : "",
  ]));
  expect(report.references.flatMap(row => row.edits)).toEqual([]);
  expect(result.stdout).toMatch(/ambiguous|multiple.*generations/iu);
  for (const record of [child, keptChild, keptParent, member]) expect(success(await f.store.read({ reference: record.reference }))).toEqual(record);
  const childOwner = keptChild.reference.owner;
  if (childOwner.type !== "cohort" || childOwner.uid === undefined) throw new Error("Expected child UID");
  const nextChild = await f.invoke(["rename", childOwner.uid, "next-child", "--json"]);
  expect(nextChild.exitCode ?? 0, nextChild.stdout + nextChild.stderr).toBe(0);
  expect(success(await f.store.read({ reference: member.reference }))).toEqual(member);
  const savedMember = success(await f.store.read({ reference: member.reference }));
  success(await f.store.write({ ...recordPut(savedMember, { content: writeMetaCohort(savedMember.content, null) }), provenance: { verb: "write-back", lifecycleAction: "edit" } }));
  const chosen = success(await f.store.read({ reference: keptChild.reference })), next = writeCohortParent(chosen.content, "next-parent");
  if (next === null) throw new Error("Expected Parent field");
  success(await f.store.write({ ...recordPut(chosen, { content: next }), provenance: { verb: "write-back", lifecycleAction: "edit" } }));
  const cleared = success(await f.store.read({ reference: member.reference }));
  success(await f.store.write({ ...recordPut(cleared, { content: writeMetaCohort(cleared.content, "next-parent/next-child") }), provenance: { verb: "write-back", lifecycleAction: "edit" } }));
  const repaired = success(await f.store.read({ reference: member.reference }));
  expect(repaired.fields).toMatchObject({ cohort: "next-parent/next-child" });
  expect(repaired.placement).toEqual(member.placement);
  for (const record of [child, keptParent]) expect(success(await f.store.read({ reference: record.reference }))).toEqual(record);
}, 60_000);

describe.each(["reference", "ref"] as const)("cohort rename participant arrival over %s", backend => {
  it.each(["direct", "completed", "descendant", "parent", "document-reference", "stub-reference"] as const)(
    "reprepares after a %s participant arrives before admission", async kind => {
      const f = await fixture(backend), parentRef = f.reference("cohort/document", "source");
      const parent = await seed(f, parentRef, document(parentRef.owner.name));
      const childRef = f.reference("cohort/document", "child");
      if (kind === "descendant") await seed(f, childRef, document(childRef.owner.name, parentRef.owner.name));
      const isDocument = kind === "parent" || kind === "document-reference";
      const arrivalRef = isDocument ? f.reference("cohort/document", "arriving") : f.reference("work-item/meta", "arriving");
      const citation = `See \`cohort-${parentRef.owner.name}.md\`.\n`;
      let arrival: StoreRecord | undefined, version: unknown;
      if (parent.reference.owner.type !== "cohort" || parent.reference.owner.uid === undefined) throw new Error("Expected cohort UID");
      const argv = ["rename", parent.reference.owner.uid, "renamed", "--json"];
      const refused = await f.invoke(argv, store => new Proxy(store, { get(target, key) {
        if (key === "batch") return async (input: Parameters<Store["batch"]>[0]) => {
          if (arrival === undefined) {
            const cohort = kind === "stub-reference" ? null : kind === "descendant"
              ? `${parentRef.owner.name}/${childRef.owner.name}` : parentRef.owner.name;
            const content = isDocument ? document(arrivalRef.owner.name, kind === "parent" ? parentRef.owner.name : undefined) + citation
              : makeMetaFixture(arrivalRef.owner.name, { state: kind === "completed" ? "Shipped" : "Planning", currentWorkflow: null, cohort }) + citation;
            arrival = await seed(f, arrivalRef, content, isDocument ? undefined : kind === "completed" ? arrivalCompleted
              : { kind: "backlog", commitment: "planned" });
            version = success(await f.store.version());
          }
          return store.batch(input);
        };
        const value: unknown = Reflect.get(target, key);
        return typeof value === "function" ? value.bind(target) : value;
      } }));
      expect(refused).toMatchObject({ exitCode: 1, result: { status: "rejected", refusal: {
        rule: kind === "descendant" ? "cohort.parent" : "rename.preparation",
      } } });
      expect(success(await f.store.version())).toBe(version);
      expect(success(await f.store.read({ reference: parent.reference }))).toEqual(parent);
      if (arrival === undefined) throw new Error("Expected concurrent arrival");
      expect(success(await f.store.read({ reference: arrival.reference }))).toEqual(arrival);
      const retried = await f.invoke(argv);
      expect(retried.exitCode ?? 0, retried.stdout + retried.stderr).toBe(0);
      const current = success(await f.store.read({ reference: arrival.reference }));
      if (kind === "parent") expect(current.fields).toMatchObject({ parent: "renamed" });
      else if (kind === "direct" || kind === "completed" || kind === "descendant")
        expect(current.fields).toMatchObject({ cohort: kind === "descendant" ? `renamed/${childRef.owner.name}` : "renamed" });
      if (kind !== "completed") expect(current.content).toContain("See `cohort-renamed.md`.");
      const own = success(await f.store.history({ reference: parent.reference }))[0]?.provenance;
      const changed = success(await f.store.history({ reference: arrival.reference }))[0]?.provenance;
      if (own === undefined || !("batchId" in own)) throw new Error("Expected rename batch");
      expect(changed).toMatchObject({ batchId: own.batchId });
    }, 60_000);

  it.each(["started-prose", "closed-prose", "plain-prose"] as const)("allows an unrelated %s arrival", async kind => {
    const f = await fixture(backend), reference = f.reference("cohort/document", "source");
    const primary = await seed(f, reference, document(reference.owner.name));
    const arriving = kind === "closed-prose" ? f.reference("cohort/document", "unrelated") : f.reference("work-item/meta", "unrelated");
    let arrival: StoreRecord | undefined;
    const result = await f.invoke(["rename", primary.reference.owner.name, "renamed", "--json"], store => new Proxy(store, { get(target, key) {
      if (key === "batch") return async (input: Parameters<Store["batch"]>[0]) => {
        if (arrival === undefined) {
          const citation = kind === "plain-prose" ? `Mention cohort-${reference.owner.name}.md plainly.\n` : `See \`cohort-${reference.owner.name}.md\`.\n`;
          arrival = await seed(f, arriving, (kind === "closed-prose" ? document(arriving.owner.name)
            : makeMetaFixture(arriving.owner.name, { state: kind === "started-prose" ? "Active" : "Planning",
              currentWorkflow: kind === "started-prose" ? "process-task-loop" : null })) + citation,
          kind === "closed-prose" ? arrivalCompleted : kind === "started-prose" ? { kind: "active" } : { kind: "backlog", commitment: "planned" });
          if (kind === "closed-prose") {
            success(await f.store.write({ ...recordPut(arrival, { placement: arrivalCompleted }),
              provenance: { verb: "cohort-close", lifecycleAction: "close" } }));
            arrival = success(await f.store.read({ reference: arrival.reference }));
          }
        }
        return store.batch(input);
      };
      const value: unknown = Reflect.get(target, key);
      return typeof value === "function" ? value.bind(target) : value;
    } }));
    expect(result.exitCode ?? 0, result.stdout + result.stderr).toBe(0);
    if (arrival === undefined) throw new Error("Expected arrival");
    expect(success(await f.store.read({ reference: arrival.reference }))).toEqual(arrival);
    expect(result.result).toMatchObject({ report: { references: [] } });
  }, 60_000);
});

it("refuses a citing stub companion arriving under a tied name, then reports its citation on retry", async () => {
  const f = await fixture("ref");
  if (f.native === undefined) throw new Error("Expected native store");
  const reference = f.reference("cohort/document", "source");
  const primary = await seed(f, reference, document(reference.owner.name));
  await plantRefPrimary(f.native, { kind: "cohort/document", name: reference.owner.name,
    uid: "00000000-0000-4000-8000-000000000099", content: document(reference.owner.name) });
  const stubRef = f.reference("work-item/meta", "stub");
  const stub = await seed(f, stubRef, makeMetaFixture(stubRef.owner.name, { state: "Planning", currentWorkflow: null }),
    { kind: "backlog", commitment: "planned" });
  const companionRef = RecordReferenceSchema.parse({ kind: "work-item/companion", owner: stub.reference.owner, key: "research" });
  const citation = `See \`cohort-${reference.owner.name}.md\`.`;
  const owner = primary.reference.owner;
  if (owner.type !== "cohort" || owner.uid === undefined) throw new Error("Expected cohort UID");
  const argv = ["rename", owner.uid, "renamed", "--json"];
  let arrival: StoreRecord | undefined, version: unknown;
  const refused = await f.invoke(argv, store => new Proxy(store, { get(target, key) {
    if (key === "batch") return async (input: Parameters<Store["batch"]>[0]) => {
      if (arrival === undefined) {
        arrival = await seed(f, companionRef, `# Detail\n\n${citation}\n`);
        version = success(await f.store.version());
      }
      return store.batch(input);
    };
    const value: unknown = Reflect.get(target, key);
    return typeof value === "function" ? value.bind(target) : value;
  } }));
  expect(refused).toMatchObject({ exitCode: 1, result: { status: "rejected", refusal: { rule: "rename.preparation" } } });
  expect(success(await f.store.version())).toBe(version);
  expect(success(await f.store.read({ reference: primary.reference }))).toEqual(primary);
  if (arrival === undefined) throw new Error("Expected concurrent arrival");
  const retried = await f.invoke(argv);
  expect(retried.exitCode ?? 0, retried.stdout + retried.stderr).toBe(0);
  expect(success(await f.store.read({ reference: arrival.reference }))).toEqual(arrival);
  expect(filenameReport.parse(retried.result).report.references).toContainEqual({
    record: { type: "work-unit", name: stub.reference.owner.name, uid: stub.reference.owner.type === "person" ? undefined : stub.reference.owner.uid },
    edits: [{ kind: "text", document: arrival.reference, line: 3, replacement: "See `cohort-renamed.md`." }] });
}, 60_000);

describe.each(["reference", "ref"] as const)("cohort rename of a disagreeing member path over %s", backend => {
  const uidOf = (record: StoreRecord): string => {
    const owner = record.reference.owner;
    if (owner.type === "person" || owner.uid === undefined) throw new Error("Expected a UID");
    return owner.uid;
  };
  it.each(["leaf", "first segment"] as const)("retains and reports a completed member whose path disagrees with its leaf's Parent, renaming the %s",
    async renamed => {
      const f = await fixture(backend);
      const pRef = f.reference("cohort/document", "p"), qRef = f.reference("cohort/document", "q"), lRef = f.reference("cohort/document", "l");
      const p = await seed(f, pRef, document(pRef.owner.name));
      await seed(f, qRef, document(qRef.owner.name));
      const l = await seed(f, lRef, document(lRef.owner.name, pRef.owner.name));
      const memberRef = f.reference("work-item/meta", "member"), path = `${pRef.owner.name}/${lRef.owner.name}`;
      const member = await seed(f, memberRef, makeMetaFixture(memberRef.owner.name, { state: "Shipped", currentWorkflow: null,
        completed: "2026-10-01", prUrl: "https://example.test/pull/1", cohort: path }),
      { kind: "completed", quarter: ArchiveQuarterSchema.parse("2026-q4") });
      success(await f.store.write({ ...recordPut(l, { content: document(lRef.owner.name, qRef.owner.name) }),
        provenance: { verb: "write-back", lifecycleAction: "edit" } }));
      const result = await f.invoke(["rename", uidOf(renamed === "leaf" ? l : p), "renamed", "--json"]);
      expect(result.exitCode ?? 0, result.stdout + result.stderr).toBe(0);
      expect(success(await f.store.read({ reference: member.reference }))).toEqual(member);
      const consistent = `${qRef.owner.name}/${renamed === "leaf" ? "renamed" : lRef.owner.name}`;
      expect(result.result).toMatchObject({ report: { references: expect.arrayContaining([{
        record: { type: "work-unit", name: memberRef.owner.name, uid: uidOf(member) },
        edits: [{ kind: "field", field: "cohort", from: path, to: consistent }] }]) } });
    }, 60_000);
});

describe("cohort rename over a closed subcohort's open member", () => {
  const uidOf = (reference: StoreRecord["reference"]): string => {
    if (reference.owner.type === "person" || reference.owner.uid === undefined) throw new Error("Expected a UID");
    return reference.owner.uid;
  };
  const edit = { verb: "write-back", lifecycleAction: "edit" } as const;
  async function stragglerFixture(variant: "first segment" | "leaf" | "disagreeing path" | "open child") {
    const f = await fixture("ref");
    if (f.native === undefined) throw new Error("Expected native store");
    const parentRef = f.reference("cohort/document", "old-parent"), childRef = f.reference("cohort/document", "child");
    const elsewhereRef = f.reference("cohort/document", "elsewhere"), shared = f.reference("cohort/document", "shared").owner.name;
    const parent = await seed(f, parentRef, document(parentRef.owner.name));
    const child = await seed(f, childRef, document(childRef.owner.name, parentRef.owner.name));
    if (variant !== "open child") success(await f.store.write({ ...recordPut(child, { placement: arrivalCompleted }),
      provenance: { verb: "cohort-close", lifecycleAction: "close" } }));
    await seedFormerName(f.store, parent, shared, document(shared));
    const disagrees = variant === "disagreeing path" || variant === "open child";
    if (disagrees) await seed(f, elsewhereRef, document(elsewhereRef.owner.name));
    const path = `${disagrees ? elsewhereRef.owner.name : shared}/${childRef.owner.name}`;
    const tie = variant === "first segment" || variant === "leaf" ? await plantRefPrimary(f.native, { kind: "cohort/document",
      name: variant === "leaf" ? childRef.owner.name : shared, uid: "00000000-0000-4000-8000-000000000066",
      content: document(variant === "leaf" ? childRef.owner.name : shared) }) : undefined;
    const memberRef = await plantRefPrimary(f.native, { kind: "work-item/meta", name: "work-item-late-member",
      uid: "00000000-0000-4000-8000-000000000071", placement: { kind: "backlog", commitment: "planned" },
      content: makeMetaFixture("work-item-late-member", { state: "Planning", currentWorkflow: null, cohort: path }) });
    return { f, parent: success(await f.store.read({ reference: parent.reference })), child: success(await f.store.read({ reference: child.reference })),
      member: success(await f.store.read({ reference: memberRef })), path, tie };
  }

  it.each(["first segment", "leaf", "disagreeing path"] as const)("refuses with nothing written when its %s leaves the member unsettled, then lands after an exit", async variant => {
    const { f, parent, child, member, path, tie } = await stragglerFixture(variant);
    expect(member.fields).toMatchObject({ cohort: path });
    const version = success(await f.store.version());
    const refused = await f.invoke(["rename", uidOf(parent.reference), "after", "--json"]);
    expect(refused.exitCode, refused.stdout + refused.stderr).toBe(1);
    expect(refused.result).toMatchObject({ status: "rejected", refusal: { code: "record-malformed", rule: "lifecycle.rename", reference: child.reference } });
    expect(success(await f.store.version())).toBe(version);
    const remedy = z.object({ refusal: z.object({ remedy: z.object({ text: z.string() }) }) }).parse(refused.result).refusal.remedy.text;
    expect(remedy).toContain(`work unit ${member.reference.owner.name} (UID ${uidOf(member.reference)})`);
    expect(remedy).toContain("clear its Cohort");
    if (variant === "first segment" && tie !== undefined) {
      expect(remedy).toContain(`\`arc rename ${uidOf(tie)} <new-slug>\``);
      const moved = await f.invoke(["rename", uidOf(tie), "moved-shared", "--json"]);
      expect(moved.exitCode ?? 0, moved.stdout + moved.stderr).toBe(0);
      expect(holdingReport.parse(moved.result).report.references.map(row => row.record.uid)).not.toContain(uidOf(member.reference));
      expect(success(await f.store.read({ reference: member.reference }))).toEqual(member);
    } else {
      expect(remedy).not.toContain("arc rename");
      success(await f.store.write({ ...recordPut(member, { content: writeMetaCohort(member.content, null) }), provenance: edit }));
    }
    const landed = await f.invoke(["rename", uidOf(parent.reference), "after", "--json"]);
    expect(landed.exitCode ?? 0, landed.stdout + landed.stderr).toBe(0);
    const renamedChild = success(await f.store.read({ reference: child.reference }));
    expect(renamedChild.fields).toMatchObject({ parent: "after" });
    expect(renamedChild.placement).toEqual(child.placement);
    expect(success(await f.store.read({ reference: member.reference })).fields)
      .toMatchObject({ cohort: variant === "first segment" ? `after/${child.reference.owner.name}` : null });
  }, 60_000);

  it("retains an open subcohort's Parent with a member whose path disagrees with it", async () => {
    const { f, parent, child, member } = await stragglerFixture("open child");
    const renamed = await f.invoke(["rename", uidOf(parent.reference), "after", "--json"]);
    expect(renamed.exitCode ?? 0, renamed.stdout + renamed.stderr).toBe(0);
    for (const record of [child, member]) expect(success(await f.store.read({ reference: record.reference }))).toEqual(record);
    expect(holdingReport.parse(renamed.result).report.references.map(row => row.record.uid))
      .toEqual(expect.arrayContaining([uidOf(child.reference), uidOf(member.reference)]));
  }, 60_000);
});
