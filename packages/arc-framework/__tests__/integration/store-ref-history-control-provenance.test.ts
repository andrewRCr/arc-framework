/** Control authority follows genuine record/metadata selection without rewriting source evidence. */
import { describe, expect, it } from "vitest";
import { RecordReferenceSchema, WholeRecordConflictSchema } from "../../src/lib/store/index.js";
import { expandStoredPath } from "../../src/lib/store/stored-path.js";
import { capturedEntries } from "../helpers/store/ref-fixture-plant.js";
import { historyControlFixture, metadataAt, plantHistory, publishHistory, quarter, save, type Role } from "../helpers/store/history-control-fixture.js";
import { success } from "../helpers/store/suite-tools.js";

type Fixture = Awaited<ReturnType<typeof historyControlFixture>>;
const roles: Role[] = ["work-item/meta", "work-item/record", "cohort/document"];
const minimal = (h: Fixture) => ({ formatVersion: 1 as const, slug: h.record.reference.owner.name, formats: {} });

async function readableAbsence(h: Fixture) {
  expect(await h.a.store.read({ reference: h.record.reference })).toMatchObject({ status: "refused", refusal: { code: "not-found" } });
  const listing = success(await h.a.store.list({ family: h.record.reference.owner.type === "cohort" ? "cohort" : "work-item" }));
  expect(listing).toMatchObject({ status: "complete", diagnostics: [] });
  if (listing.status !== "complete") throw new Error("Retained conflicts must be publicly listed");
  return listing.records.filter(record => record.reference.kind.endsWith("/conflict-record"));
}

async function pairedMetadata(h: Fixture) {
  const metadata = await metadataAt(h.a, h.history, h.home.metadataPath);
  const folder = await metadataAt(h.a, h.folder.ref, h.folder.metadataPath);
  expect(metadata.primary).toEqual(h.metadata.primary);
  expect(metadata.placement).toEqual(h.metadata.placement);
  expect(folder).toEqual({ ...metadata, endBatch: h.folderMetadata.endBatch });
  expect(folder.batch).not.toBe(h.folderMetadata.batch);
  return metadata;
}

describe.each(["default", "separate"] as const)("history control provenance in %s", layout => {
  it.each(roles)("retains a generated null/null %s metadata clash without restoring its primary", async role => {
    const h = await historyControlFixture(layout, role), parent = (await h.a.git(["rev-parse", h.history])).stdout.trim();
    const incoming = role === "cohort/document" ? { ...minimal(h), formerSlugs: ["incoming-former"] } : minimal(h);
    const local = role === "cohort/document" ? { ...h.metadata, formerSlugs: ["local-former"] }
      : { ...h.metadata, primary: { ...h.metadata.primary!, ...(role === "work-item/meta"
        ? { role: "work-item/record" as const } : { links: { branches: [] } }) } };
    const remote = await plantHistory(h.b, h.history, [{ path: h.home.metadataPath, content: JSON.stringify(incoming) }], parent, "External preferred auxiliary-only history");
    const held = await plantHistory(h.a, h.history, [{ path: h.home.metadataPath, content: JSON.stringify(local) }], parent, "External independent auxiliary metadata change");
    await publishHistory(h, h.history);
    const pulled = success(await h.a.store.pull({ history: [h.history] }));
    expect(pulled.pulls.flatMap(pull => pull.notices).filter(notice => notice.kind === "namespace-corrupt")).toEqual([]);
    const conflicts = await readableAbsence(h);
    expect(conflicts).toHaveLength(1);
    const clash = WholeRecordConflictSchema.parse(JSON.parse(conflicts[0]!.content));
    expect(clash).toMatchObject({ record: h.record.reference, current: { value: null }, incoming: { value: null },
      base: { content: h.record.content, version: h.record.version } });
    expect(clash.current.label.actor).not.toBe(""); expect(clash.incoming.label.actor).not.toBe("");
    const metadata = await pairedMetadata(h);
    expect(metadata.formats).toEqual({ [JSON.stringify({ key: conflicts[0]!.reference.key, kind: conflicts[0]!.reference.kind })]: 1 });
    const conflictHome = expandStoredPath(conflicts[0]!.reference);
    expect((await capturedEntries(h.a, h.history)).map(entry => entry.path).sort()).toEqual([h.home.metadataPath, conflictHome.path].sort());
    expect((await capturedEntries(h.a, h.folder.ref)).map(entry => entry.path).sort())
      .toEqual([h.folder.metadataPath, h.folder.root + conflictHome.path].sort());
    expect((await h.a.git(["show", "-s", "--format=%P", h.history])).stdout.trim()).toBe(`${held.tip} ${remote.tip}`);
    expect(await metadataAt(h.a, remote.tip, h.home.metadataPath)).toEqual(incoming);
    expect(await metadataAt(h.a, held.tip, h.home.metadataPath)).toEqual(local);
    success(await h.a.store.pull({ history: [h.history] }));
    expect((await readableAbsence(h))[0]!.content).toBe(conflicts[0]!.content);
    success(await h.a.store.push()); success(await h.b.store.pull({ history: [h.history] }));
    expect(success(await h.b.store.read({ reference: conflicts[0]!.reference })).content).toBe(conflicts[0]!.content);
    const continuation = role === "cohort/document" ? h.record.reference
      : RecordReferenceSchema.parse({ kind: "work-item/companion", key: "continued", owner: h.record.reference.owner });
    const content = role === "cohort/document" ? h.record.content : "Ordinary companion after selected deletion.\n";
    const made = success(await h.a.store.write({ action: "put", reference: continuation, expected: null, content, provenance: save,
      ...(role === "cohort/document" ? { placement: { kind: "completed" as const, quarter }, resolves: [conflicts[0]!.reference] } : {}) }));
    expect(success(await h.a.store.read({ reference: made.reference }))).toMatchObject({ content, placement: h.record.placement });
  }, 90_000);

  it.each(["changed-primary", "surviving-companion"] as const)("keeps selected empty controls with an independent %s", async kind => {
    const h = await historyControlFixture(layout, "work-item/meta"), parent = (await h.b.git(["rev-parse", h.history])).stdout.trim();
    const reference = kind === "changed-primary" ? h.record.reference
      : RecordReferenceSchema.parse({ kind: "work-item/companion", key: "independent", owner: h.record.reference.owner });
    const content = kind === "changed-primary" ? h.record.content + "\nA genuine independent primary edit.\n" : "Independent companion survives.\n";
    const written = success(await h.a.store.write({ action: "put", reference, expected: kind === "changed-primary" ? h.record.version : null,
      content, provenance: save, ...(kind === "changed-primary" ? { placement: { kind: "completed" as const, quarter } } : {}) }));
    if (kind === "surviving-companion") {
      const local = (await h.a.git(["rev-parse", h.history])).stdout.trim();
      await plantHistory(h.a, h.history, (await capturedEntries(h.a, h.history)).filter(entry => entry.path !== h.home.path), local,
        "External primary deletion retains genuine independent companion and controls");
    }
    const source = await plantHistory(h.b, h.history, [{ path: h.home.metadataPath, content: JSON.stringify(minimal(h)) }], parent, "External preferred empty deletion");
    const held = (await h.a.git(["rev-parse", h.history])).stdout.trim();
    await publishHistory(h, h.history); success(await h.a.store.pull({ history: [h.history] }));
    expect(await h.a.store.read({ reference: h.record.reference })).toMatchObject({ status: "refused", refusal: { code: "not-found" } });
    await pairedMetadata(h);
    if (kind === "changed-primary") {
      const conflicts = await readableAbsence(h), clash = WholeRecordConflictSchema.parse(JSON.parse(conflicts[0]!.content));
      expect(clash.current.value).toBeNull();
      expect(clash.incoming.value).toMatchObject({ content, version: written.version, placement: h.record.placement });
    } else expect(success(await h.a.store.read({ reference }))).toMatchObject({ content, version: written.version, placement: h.record.placement });
    expect((await h.a.git(["show", "-s", "--format=%P", h.history])).stdout.trim()).toBe(`${held} ${source.tip}`);
    success(await h.a.store.push()); success(await h.b.store.pull({ history: [h.history] }));
    expect(await h.b.store.read({ reference: h.record.reference })).toMatchObject({ status: "refused", refusal: { code: "not-found" } });
  }, 90_000);

  it.each(["changed-primary", "surviving-companion"] as const)("keeps the local end against a late live %s with its original record metadata", async kind => {
    const h = await historyControlFixture(layout, "work-item/meta", "local");
    const end = (await h.a.git(["rev-parse", h.history])).stdout.trim();
    const reference = kind === "changed-primary" ? h.open.reference
      : RecordReferenceSchema.parse({ kind: "work-item/companion", key: "late", owner: h.open.reference.owner });
    const content = kind === "changed-primary" ? h.open.content + "\nA genuine late live edit.\n" : "Late independent companion.\n";
    const written = success(await h.b.store.write({ action: "put", reference, content, expected: kind === "changed-primary" ? h.open.version : null,
      provenance: save, ...(kind === "changed-primary" ? { placement: { kind: "active" as const } } : {}) }));
    success(await h.b.store.push());
    const live = expandStoredPath(h.open.reference), liveTip = (await h.b.git(["rev-parse", live.ref])).stdout.trim();
    const empty = await plantHistory(h.a, h.history, [{ path: h.home.metadataPath, content: JSON.stringify(minimal(h)) }], end,
      "External empty retained end meets a genuine late live write");
    const pulled = success(await h.a.store.pull());
    expect(pulled.pulls.flatMap(pull => pull.notices).filter(notice => notice.kind === "namespace-corrupt")).toEqual([]);
    expect(await h.a.store.read({ reference: h.record.reference })).toMatchObject({ status: "refused", refusal: { code: "not-found" } });
    await pairedMetadata(h);
    if (kind === "changed-primary") {
      const conflicts = await readableAbsence(h), clash = WholeRecordConflictSchema.parse(JSON.parse(conflicts[0]!.content));
      expect(clash.current.value).toBeNull();
      expect(clash.incoming.value).toMatchObject({ content, version: written.version, placement: { kind: "active" } });
    } else expect(success(await h.a.store.read({ reference }))).toMatchObject({ content, version: written.version, placement: h.record.placement });
    expect((await h.a.git(["show", "-s", "--format=%P", h.history])).stdout.trim()).toBe(`${empty.tip} ${liveTip}`);
    expect((await metadataAt(h.a, liveTip, live.metadataPath)).primary?.placement).toEqual({ kind: "active" });
    success(await h.a.store.pull()); success(await h.a.store.push()); success(await h.b.store.pull({ history: [h.history] }));
    expect(await h.b.store.read({ reference: h.record.reference })).toMatchObject({ status: "refused", refusal: { code: "not-found" } });
  }, 90_000);

  it.each(["empty", "record-bearing"] as const)("follows the %s preferred source when whole metadata objects are identical", async selected => {
    const h = await historyControlFixture(layout, "work-item/meta"), parent = (await h.a.git(["rev-parse", h.history])).stdout.trim();
    const source = selected === "empty" ? h.a : h.b, empty = selected === "empty" ? h.b : h.a;
    const reference = RecordReferenceSchema.parse({ kind: "work-item/companion", key: "whole-object", owner: h.record.reference.owner });
    const content = "An independently created companion with exact saved placement evidence.\n";
    const written = success(await source.store.write({ action: "put", reference, content, expected: null, provenance: save }));
    const entry = (await capturedEntries(source, h.history)).find(row => row.path === expandStoredPath(reference).path)!;
    const sourceParent = (await source.git(["rev-parse", h.history])).stdout.trim();
    const metadata = { path: h.home.metadataPath, content: JSON.stringify(minimal(h)) };
    await plantHistory(source, h.history, [entry, metadata], sourceParent, "External real companion with minimal whole-object metadata");
    await plantHistory(empty, h.history, [metadata], parent, "External empty side with identical whole-object metadata");
    await publishHistory(h, h.history);
    const before = (await h.a.git(["rev-parse", h.history, h.folder.ref])).stdout;
    const pulled = success(await h.a.store.pull({ history: [h.history] }));
    const notices = pulled.pulls.flatMap(pull => pull.notices);
    if (selected === "record-bearing") {
      expect(notices).toContainEqual(expect.objectContaining({ kind: "namespace-corrupt", ref: h.history }));
      expect((await h.a.git(["rev-parse", h.history, h.folder.ref])).stdout).toBe(before);
    } else {
      expect(notices.filter(notice => notice.kind === "namespace-corrupt")).toEqual([]);
      expect(await h.a.store.read({ reference: h.record.reference })).toMatchObject({ status: "refused", refusal: { code: "not-found" } });
      expect(success(await h.a.store.read({ reference }))).toMatchObject({ content, version: written.version, placement: h.record.placement });
      await pairedMetadata(h);
      success(await h.a.store.push()); success(await h.b.store.pull({ history: [h.history] }));
      expect(success(await h.b.store.read({ reference }))).toMatchObject({ content, version: written.version });
    }
  }, 90_000);

  it.each(roles)("holds real %s FF content without controls and accepts a forward metadata repair", async role => {
    const h = await historyControlFixture(layout, role), parent = (await h.b.git(["rev-parse", h.history])).stdout.trim();
    const payload = (await capturedEntries(h.b, h.history)).filter(entry => entry.path === h.home.path);
    const bad = await plantHistory(h.b, h.history, [...payload, { path: h.home.metadataPath, content: JSON.stringify(minimal(h)) }], parent,
      "External actual primary with parseable incomplete controls");
    await publishHistory(h, h.history);
    const before = (await h.a.git(["rev-parse", h.history, h.folder.ref])).stdout;
    const held = success(await h.a.store.pull({ history: [h.history] }));
    expect(held.pulls.flatMap(pull => pull.notices)).toContainEqual(expect.objectContaining({ kind: "namespace-corrupt", ref: h.history }));
    expect((await h.a.git(["rev-parse", h.history, h.folder.ref])).stdout).toBe(before);
    expect(success(await h.a.store.read({ reference: h.record.reference }))).toMatchObject({ content: h.record.content, version: h.record.version });
    await plantHistory(h.b, h.history, [...payload, { path: h.home.metadataPath, content: JSON.stringify(h.metadata) }], bad.tip,
      "External forward repair restores genuine own lifecycle controls");
    await publishHistory(h, h.history);
    expect(success(await h.a.store.pull({ history: [h.history] })).pulls.flatMap(pull => pull.notices)).toEqual([]);
    expect(success(await h.a.store.read({ reference: h.record.reference }))).toMatchObject({ content: h.record.content, version: h.record.version });
  }, 90_000);

  it("keeps the exact historical-placement refusal on real divergent incomplete work metadata", async () => {
    const h = await historyControlFixture(layout, "work-item/meta"), parent = (await h.a.git(["rev-parse", h.history])).stdout.trim();
    const entries = [...(await capturedEntries(h.a, h.history)).filter(entry => entry.path === h.home.path),
      { path: h.home.metadataPath, content: JSON.stringify(minimal(h)) }];
    await plantHistory(h.a, h.history, entries, parent, "External local real primary with missing placement");
    await plantHistory(h.b, h.history, entries, parent, "External incoming real primary with missing placement");
    await publishHistory(h, h.history);
    const before = (await h.a.git(["rev-parse", h.history, h.folder.ref])).stdout;
    const pulled = success(await h.a.store.pull({ history: [h.history] }));
    expect(pulled.pulls.flatMap(pull => pull.notices)).toContainEqual(expect.objectContaining({ kind: "namespace-corrupt", ref: h.history,
      condition: expect.stringContaining("supplies placement"), remedy: { text: expect.stringContaining("Do not infer placement") } }));
    expect((await h.a.git(["rev-parse", h.history, h.folder.ref])).stdout).toBe(before);
  }, 90_000);
});
