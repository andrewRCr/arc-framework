/** A parent cohort's rename over every combination of name tie, subcohort state, member path, and namesake, and over a
 * renamed cohort that is itself nested or whose own Parent the rename re-points: each refusal writes nothing, names exactly
 * the expected exits, and every exit it names lets the rename land once taken. States that ordinary writes cannot form are
 * planted as a pull would deliver them. */
import { describe, expect, it } from "vitest";
import type { StoreRecord } from "../../src/lib/store/read.js";
import { createKindRegistry, RecordReferenceSchema } from "../../src/lib/store/index.js";
import { ArchiveQuarterSchema } from "../../src/lib/kernel/index.js";
import { PRODUCTION_REGISTRATIONS } from "../../src/lib/store/kinds/registrations.js";
import { createRefFixture } from "../helpers/store/ref-fixture.js";
import { success, fixtureRenameProvenance } from "../helpers/store/suite-tools.js";
import { plantRefPrimary } from "../helpers/store/ref-primary-plant.js";
import { recordPut } from "../../src/lib/store/lifecycle-write.js";
import { observeRecords } from "../../src/lib/store/record-observations.js";
import { runCohortRename } from "../../src/lib/store/cohort-rename.js";
import { writeMetaCohort } from "../../src/lib/store/kinds/meta/writers.js";
import { makeMetaFixture } from "../helpers/meta-fixture.js";
import { ParsedMetaRecordSchema } from "../../src/lib/active/meta-schema.js";

const production = createKindRegistry(PRODUCTION_REGISTRATIONS);
const completed = { kind: "completed" as const, quarter: ArchiveQuarterSchema.parse("2026-q4") };
const edit = { verb: "write-back", lifecycleAction: "edit" } as const;
const document = (name: string, parent?: string | null) =>
  `# Cohort: \`${name}\`\n\n**Purpose:** Coordinate.\n${parent === undefined || parent === null ? "" : `\n**Parent:** \`${parent}\`\n`}`;
const uid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const UID = { parent: uid(101), other: uid(102), child: uid(103), elsewhere: uid(104), namesake: uid(105), x: uid(106),
  member: uid(107), xMember: uid(108), twin: uid(109), alpha: uid(110), alphaTwin: uid(111), g: uid(112), h: uid(113) };
const TARGET = "cohort-after";

type Fixture = Awaited<ReturnType<typeof createRefFixture>>;
type Tie = "none" | "first segment" | "leaf" | "leaf with subcohort" | "twin closed leaf";
type MemberPath = "agrees" | "disagrees" | "namesake's" | "none";
interface State {
  tie: Tie; child: "open" | "closed"; path: MemberPath;
  /** The subcohort's Parent, where it is not the renamed cohort: top-level, unresolved, or tied under another name. */
  leafParent?: "none" | "unresolved" | "tied";
}
type Exit = { kind: "rename"; name: string; uid: string } | { kind: "set"; path: string } | { kind: "clear"; closed?: string }
  | { kind: "un-nest" };
interface Named { name: string; uid: string; exits: Exit[] }

async function build(state: State): Promise<Fixture> {
  const f = await createRefFixture(production);
  const plant = (kind: "cohort/document" | "work-item/meta", name: string, id: string, content: string) =>
    plantRefPrimary(f, { kind, name, uid: id, content, ...(kind === "work-item/meta" ? { placement: { kind: "backlog", commitment: "planned" } as const } : {}) });
  const first = state.tie === "first segment";
  await plant("cohort/document", first ? "cohort-old-parent" : "cohort-p", UID.parent, document(first ? "cohort-old-parent" : "cohort-p"));
  const leafParent = state.leafParent === undefined ? (first ? "cohort-old-parent" : "cohort-p")
    : state.leafParent === "none" ? null : state.leafParent === "unresolved" ? "cohort-ghost" : "cohort-alpha";
  await plant("cohort/document", "cohort-child", UID.child, document("cohort-child", leafParent));
  if (state.leafParent === "tied") {
    await plant("cohort/document", "cohort-alpha", UID.alpha, document("cohort-alpha"));
    await plant("cohort/document", "cohort-alpha", UID.alphaTwin, document("cohort-alpha"));
  }
  if (state.child === "closed") await close(f, UID.child);
  if (first) {
    await renameByFixture(f, UID.parent, "cohort-shared");
    await plant("cohort/document", "cohort-shared", UID.other, document("cohort-shared"));
  }
  if (state.tie === "twin closed leaf") {
    await plant("cohort/document", "cohort-child", UID.twin, document("cohort-child"));
    await close(f, UID.twin);
  }
  if (state.tie === "leaf" || state.tie === "leaf with subcohort") await plant("cohort/document", "cohort-child", UID.namesake, document("cohort-child"));
  if (state.tie === "leaf with subcohort") {
    await plant("cohort/document", "cohort-x", UID.x, document("cohort-x", "cohort-child"));
    await plant("work-item/meta", "work-item-x-member", UID.xMember, meta("work-item-x-member", "cohort-child/cohort-x"));
  }
  if (state.path === "disagrees") await plant("cohort/document", "cohort-elsewhere", UID.elsewhere, document("cohort-elsewhere"));
  const path = { agrees: `${first ? "cohort-shared" : "cohort-p"}/cohort-child`, disagrees: "cohort-elsewhere/cohort-child",
    "namesake's": "cohort-child", none: undefined }[state.path];
  if (path !== undefined) await plant("work-item/meta", "work-item-member", UID.member, meta("work-item-member", path));
  return f;
}

function meta(name: string, cohort: string): string {
  return makeMetaFixture(name, { state: "Planning", currentWorkflow: null, cohort });
}

async function read(f: Fixture, id: string): Promise<StoreRecord> {
  for (const family of ["cohort", "work-item"] as const) {
    const listing = success(await f.store.list({ family }));
    const found = listing.status === "complete" ? listing.records.find(record =>
      record.reference.owner.type !== "person" && record.reference.owner.uid === id
      && (record.reference.kind === "cohort/document" || record.reference.kind === "work-item/meta")) : undefined;
    if (found !== undefined) return success(await f.store.read({ reference: found.reference }));
  }
  throw new Error(`No record holds UID ${id}`);
}

async function close(f: Fixture, id: string): Promise<void> {
  success(await f.store.write({ ...recordPut(await read(f, id), { placement: completed }), provenance: { verb: "cohort-close", lifecycleAction: "close" } }));
}

async function renameByFixture(f: Fixture, id: string, name: string, parent: string | null = null): Promise<void> {
  const records: StoreRecord[] = [];
  for (const family of ["cohort", "work-item"] as const) {
    const listing = success(await f.store.list({ family }));
    if (listing.status === "complete") records.push(...listing.records);
  }
  const record = await read(f, id);
  success(await f.store.batch({ writes: [{ ...recordPut(record, { content: document(name, parent) }),
    reference: RecordReferenceSchema.parse({ ...record.reference, owner: { ...record.reference.owner, name } }) }],
  observations: observeRecords(records), provenance: fixtureRenameProvenance }));
}

async function rename(f: Fixture, id: string, target: string) {
  return runCohortRename(f.store, await read(f, id), { operand: id, targetSlug: target });
}

function parseRemedy(text: string): Named[] {
  const body = text.replace(/ Then retry the rename\.$/u, "");
  const named = [...body.matchAll(/For (?:work unit|cohort) (\S+) \(UID ([^)]+)\): (.+?)\.(?= For |$)/gu)]
    .map(([, name = "", id = "", exits = ""]) => ({ name, uid: id, exits: exits.split(", or ").map(parseExit) }));
  expect(named.map(item => `For ${item.name}`).length, text).toBeGreaterThan(0);
  return named;
}

function parseExit(text: string): Exit {
  const renamed = /^rename cohort (\S+) with `arc rename (\S+) <new-slug>`$/u.exec(text);
  if (renamed !== null) return { kind: "rename", name: renamed[1] ?? "", uid: renamed[2] ?? "" };
  const set = /^have its owner set its Cohort to "(.+)"$/u.exec(text);
  if (set !== null) return { kind: "set", path: set[1] ?? "" };
  const clear = /^have its owner clear its Cohort(?:, after which it cannot rejoin closed subcohort (\S+))?$/u.exec(text);
  if (clear !== null) return clear[1] === undefined ? { kind: "clear" } : { kind: "clear", closed: clear[1] };
  if (text === "have its owner clear its open members' Cohort and then its Parent") return { kind: "un-nest" };
  throw new Error(`Unrecognized exit: ${text}`);
}

function exitLabel(exit: Exit): string {
  if (exit.kind === "clear") return exit.closed === undefined ? "clear" : `clear, closed ${exit.closed}`;
  return exit.kind === "rename" ? `rename ${exit.name}` : exit.kind === "set" ? `set ${exit.path}` : exit.kind;
}

async function take(f: Fixture, named: Named, exit: Exit): Promise<void> {
  if (exit.kind === "rename") {
    const moved = await rename(f, exit.uid, `${exit.name}-moved`);
    expect(moved.status, JSON.stringify(moved)).toBe("renamed");
    return;
  }
  if (exit.kind === "un-nest") {
    // Its open members are every open record whose Cohort path names it, as the Parent check reads them.
    const subcohort = await read(f, named.uid);
    for (const record of await openMetas(f)) {
      const cohort = ParsedMetaRecordSchema.parse(record.fields).cohort;
      if (cohort?.split("/").includes(subcohort.reference.owner.name) === true) await setCohort(f, record, null);
    }
    success(await f.store.write({ ...recordPut(subcohort, { content: document(subcohort.reference.owner.name) }), provenance: edit }));
    return;
  }
  await setCohort(f, await read(f, named.uid), exit.kind === "set" ? exit.path : null);
}

async function openMetas(f: Fixture): Promise<StoreRecord[]> {
  const listing = success(await f.store.list({ family: "work-item" }));
  return listing.status === "complete" ? listing.records.filter(record => record.reference.kind === "work-item/meta"
    && record.placement?.kind !== "completed") : [];
}

async function setCohort(f: Fixture, record: StoreRecord, cohort: string | null): Promise<void> {
  success(await f.store.write({ ...recordPut(record, { content: writeMetaCohort(record.content, cohort) }), provenance: edit }));
}

/** Refuse with nothing written; return each named record's exits. */
async function expectRefusal(f: Fixture): Promise<Named[]> {
  const version = success(await f.store.version());
  const refused = await rename(f, UID.parent, TARGET);
  expect(refused.status, JSON.stringify(refused)).toBe("rejected");
  if (refused.status !== "rejected" || refused.refusal === undefined) throw new Error("Expected a refusal");
  expect(refused.refusal).toMatchObject({ code: "record-malformed", rule: "lifecycle.rename" });
  expect(success(await f.store.version())).toBe(version);
  return parseRemedy(refused.refusal.remedy.text);
}

/** Take one exit, then confirm the record it names is settled and the rename lands once every other record's own
 * named exit is also taken. */
async function expectExitLands(make: () => Promise<Fixture>, recordUid: string, index: number): Promise<void> {
  const f = await make();
  const named = (await expectRefusal(f)).find(item => item.uid === recordUid);
  const exit = named?.exits[index];
  if (named === undefined || exit === undefined) throw new Error("Expected the exit");
  await take(f, named, exit);
  for (let round = 0; round < 6; round++) {
    const retried = await rename(f, UID.parent, TARGET);
    if (retried.status === "renamed") return;
    if (retried.status !== "rejected" || retried.refusal === undefined) throw new Error(JSON.stringify(retried));
    const remaining = parseRemedy(retried.refusal.remedy.text);
    if (round === 0) expect(remaining.map(item => item.uid), `${exitLabel(exit)} settles ${named.name}`).not.toContain(recordUid);
    const next = remaining[0], last = next?.exits.at(-1);
    if (next === undefined || last === undefined) throw new Error("Expected a remaining exit");
    await take(f, next, last);
  }
  throw new Error("The rename did not land");
}

interface RefusingCase { state: State; exits: Record<string, string[]> }
const refusing: Array<[string, RefusingCase]> = [
  ["no tie, closed subcohort, disagreeing member", { state: { tie: "none", child: "closed", path: "disagrees" },
    exits: { [UID.member]: ["set cohort-p/cohort-child", "clear, closed cohort-child"] } }],
  ["first segment tied, closed subcohort, agreeing member", { state: { tie: "first segment", child: "closed", path: "agrees" },
    exits: { [UID.member]: ["rename cohort-shared", "clear, closed cohort-child"] } }],
  ["first segment tied, closed subcohort, disagreeing member", { state: { tie: "first segment", child: "closed", path: "disagrees" },
    exits: { [UID.member]: ["clear, closed cohort-child"] } }],
  ["leaf tied, closed subcohort, agreeing member", { state: { tie: "leaf", child: "closed", path: "agrees" },
    exits: { [UID.member]: ["clear"] } }],
  ["leaf tied, closed subcohort, disagreeing member", { state: { tie: "leaf", child: "closed", path: "disagrees" },
    exits: { [UID.member]: ["clear"] } }],
  ["leaf tied, closed subcohort, the namesake's member", { state: { tie: "leaf", child: "closed", path: "namesake's" },
    exits: { [UID.member]: ["rename cohort-child", "clear"] } }],
  ["namesake with a subcohort, closed subcohort, no other member", { state: { tie: "leaf with subcohort", child: "closed", path: "none" },
    exits: { [UID.xMember]: ["rename cohort-child", "clear"], [UID.x]: ["rename cohort-child", "un-nest"] } }],
  ["namesake with a subcohort, closed subcohort, agreeing member", { state: { tie: "leaf with subcohort", child: "closed", path: "agrees" },
    exits: { [UID.member]: ["clear"], [UID.xMember]: ["rename cohort-child", "clear"], [UID.x]: ["rename cohort-child", "un-nest"] } }],
  ["namesake with a subcohort, closed subcohort, disagreeing member", { state: { tie: "leaf with subcohort", child: "closed", path: "disagrees" },
    exits: { [UID.member]: ["clear"], [UID.xMember]: ["rename cohort-child", "clear"], [UID.x]: ["rename cohort-child", "un-nest"] } }],
  ["namesake with a subcohort, closed subcohort, the namesake's member", { state: { tie: "leaf with subcohort", child: "closed", path: "namesake's" },
    exits: { [UID.member]: ["rename cohort-child", "clear"], [UID.xMember]: ["rename cohort-child", "clear"], [UID.x]: ["rename cohort-child", "un-nest"] } }],
  ["namesake with a subcohort, open subcohort, no other member", { state: { tie: "leaf with subcohort", child: "open", path: "none" },
    exits: { [UID.xMember]: ["rename cohort-child", "clear"], [UID.x]: ["rename cohort-child", "un-nest"] } }],
  ["two closed subcohorts share the name, agreeing member", { state: { tie: "twin closed leaf", child: "closed", path: "agrees" },
    exits: { [UID.member]: ["clear, closed cohort-child"] } }],
];

interface LandingCase { state: State; check?: (f: Fixture) => Promise<void> }
const landing: Array<[string, LandingCase]> = [
  ["no tie, closed subcohort, agreeing member", { state: { tie: "none", child: "closed", path: "agrees" }, check: async f => {
    expect((await read(f, UID.child)).fields).toMatchObject({ parent: TARGET });
    expect((await read(f, UID.member)).fields).toMatchObject({ cohort: `${TARGET}/cohort-child` });
  } }],
  ["no tie, open subcohort, agreeing member", { state: { tie: "none", child: "open", path: "agrees" }, check: async f => {
    expect((await read(f, UID.member)).fields).toMatchObject({ cohort: `${TARGET}/cohort-child` });
  } }],
  ["no tie, open subcohort, disagreeing member", { state: { tie: "none", child: "open", path: "disagrees" }, check: async f => {
    expect((await read(f, UID.child)).fields).toMatchObject({ parent: "cohort-p" });
  } }],
  ["first segment tied, open subcohort, agreeing member", { state: { tie: "first segment", child: "open", path: "agrees" } }],
  ["first segment tied, open subcohort, disagreeing member", { state: { tie: "first segment", child: "open", path: "disagrees" } }],
  ["leaf tied, open subcohort, agreeing member", { state: { tie: "leaf", child: "open", path: "agrees" } }],
  ["leaf tied, open subcohort, disagreeing member", { state: { tie: "leaf", child: "open", path: "disagrees" } }],
  ["leaf tied, open subcohort, the namesake's member", { state: { tie: "leaf", child: "open", path: "namesake's" } }],
  ["namesake with a subcohort, open subcohort, agreeing member", { state: { tie: "leaf with subcohort", child: "open", path: "agrees" } }],
  ["namesake with a subcohort, open subcohort, disagreeing member", { state: { tie: "leaf with subcohort", child: "open", path: "disagrees" } }],
  ["namesake with a subcohort, open subcohort, the namesake's member", { state: { tie: "leaf with subcohort", child: "open", path: "namesake's" } }],
];

describe("cohort rename over a moved Parent's conflicts", () => {
  it.each(refusing)("%s: refuses with nothing written, naming exactly its exits", async (_label, { state, exits }) => {
    const named = await expectRefusal(await build(state));
    expect(Object.fromEntries(named.map(item => [item.uid, item.exits.map(exitLabel)]))).toEqual(exits);
  }, 60_000);

  it.each(refusing.flatMap(([label, { state, exits }]) => Object.entries(exits).flatMap(([recordUid, labels]) =>
    labels.map((exit, index) => [`${label}: ${exit} for ${recordUid.slice(-3)}`, state, recordUid, index] as const))))(
    "%s lets the rename land", async (_label, state, recordUid, index) => {
      await expectExitLands(() => build(state), recordUid, index);
    }, 120_000);

  it.each(landing)("%s: lands", async (_label, { state, check }) => {
    const f = await build(state);
    const renamed = await rename(f, UID.parent, TARGET);
    expect(renamed.status, JSON.stringify(renamed)).toBe("renamed");
    await check?.(f);
  }, 60_000);
});

describe("renaming either holder of a tied first segment over a closed subcohort whose Parent is not that holder", () => {
  const cases = [["a top-level subcohort", "none"], ["an unresolved Parent", "unresolved"], ["a Parent tied under another name", "tied"]] as const;
  it.each(cases.flatMap(([label, leafParent]) => [UID.parent, UID.other].map(holder => [label, leafParent, holder] as const)))(
    "%s (%s): the rename of %s lands and reports the member", async (_label, leafParent, holder) => {
      const f = await build({ tie: "first segment", child: "closed", path: "agrees", leafParent });
      const member = await read(f, UID.member);
      const renamed = await rename(f, holder, "cohort-moved");
      expect(renamed.status, JSON.stringify(renamed)).toBe("renamed");
      if (renamed.status !== "renamed") return;
      expect(await read(f, UID.member)).toEqual(member);
      const row = renamed.report.references.find(item => item.record.uid === UID.member);
      expect(row?.edits ?? null).toEqual(leafParent === "none" ? [{ kind: "field", field: "cohort", from: "cohort-shared/cohort-child", to: "cohort-child" }] : []);
      if (leafParent !== "none") expect(renamed.advisories.join(" ")).toContain("cohort-shared/cohort-child");
    }, 60_000);
});

type NestedState = "closed subcohort" | "closed subcohort, disagreeing member" | "open subcohort" | "no subcohort"
  | "own Parent on a completed cohort" | "own Parent on a nested cohort";

/** A renamed cohort nested below cohort-g, or whose own Parent names a former slug of a completed or nested cohort. A
 * nested cohort over a closed subcohort is formed by a checked write, since the nesting rule counts open subcohorts; the
 * others are planted as a pull would deliver them. */
async function buildNested(state: NestedState): Promise<Fixture> {
  const f = await createRefFixture(production);
  const plant = (kind: "cohort/document" | "work-item/meta", name: string, id: string, content: string) =>
    plantRefPrimary(f, { kind, name, uid: id, content, ...(kind === "work-item/meta" ? { placement: { kind: "backlog", commitment: "planned" } as const } : {}) });
  if (state === "own Parent on a completed cohort" || state === "own Parent on a nested cohort") {
    const above = state === "own Parent on a nested cohort" ? "cohort-h" : null;
    if (above !== null) await plant("cohort/document", above, UID.h, document(above));
    await plant("cohort/document", "cohort-g", UID.g, document("cohort-g", above));
    await renameByFixture(f, UID.g, "cohort-g-new", above);
    if (above === null) await close(f, UID.g);
    await plant("cohort/document", "cohort-p", UID.parent, document("cohort-p", "cohort-g"));
    return f;
  }
  await plant("cohort/document", "cohort-g", UID.g, document("cohort-g"));
  await plant("cohort/document", "cohort-p", UID.parent, document("cohort-p", state === "open subcohort" ? "cohort-g" : null));
  if (state !== "no subcohort") await plant("cohort/document", "cohort-child", UID.child, document("cohort-child", "cohort-p"));
  if (state.startsWith("closed subcohort")) await close(f, UID.child);
  if (state === "closed subcohort, disagreeing member") {
    await plant("cohort/document", "cohort-elsewhere", UID.elsewhere, document("cohort-elsewhere"));
    await plant("work-item/meta", "work-item-member", UID.member, meta("work-item-member", "cohort-elsewhere/cohort-child"));
  }
  if (state !== "open subcohort") success(await f.store.write({ ...recordPut(await read(f, UID.parent), { content: document("cohort-p", "cohort-g") }), provenance: edit }));
  return f;
}

describe("renaming a nested cohort, or one whose own Parent the rename re-points", () => {
  const refusingNested: Array<[NestedState, Record<string, string[]>]> = [
    ["closed subcohort", { [UID.parent]: ["un-nest"] }],
    ["open subcohort", { [UID.parent]: ["un-nest"] }],
    ["own Parent on a completed cohort", { [UID.parent]: ["un-nest"] }],
    ["own Parent on a nested cohort", { [UID.parent]: ["un-nest"] }],
    ["closed subcohort, disagreeing member", { [UID.parent]: ["un-nest"], [UID.member]: ["set cohort-p/cohort-child", "clear, closed cohort-child"] }],
  ];

  it.each(refusingNested)("%s: refuses with nothing written, naming exactly its exits", async (state, exits) => {
    const named = await expectRefusal(await buildNested(state));
    expect(Object.fromEntries(named.map(item => [item.uid, item.exits.map(exitLabel)]))).toEqual(exits);
  }, 60_000);

  it.each(refusingNested.flatMap(([state, exits]) => Object.entries(exits).flatMap(([recordUid, labels]) =>
    labels.map((exit, index) => [`${state}: ${exit} for ${recordUid.slice(-3)}`, state, recordUid, index] as const))))(
    "%s lets the rename land", async (_label, state, recordUid, index) => {
      await expectExitLands(() => buildNested(state), recordUid, index);
    }, 120_000);

  it("no subcohort: lands with the cohort still nested", async () => {
    const f = await buildNested("no subcohort");
    const renamed = await rename(f, UID.parent, TARGET);
    expect(renamed.status, JSON.stringify(renamed)).toBe("renamed");
    expect((await read(f, UID.parent)).fields).toMatchObject({ parent: "cohort-g" });
  }, 60_000);
});
