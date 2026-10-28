/** Withdrawal selects generic registered records together with their own format coordinates. */
import { describe, expect, it } from "vitest";
import { ArchiveQuarterSchema } from "../../src/lib/kernel/index.js";
import { createRefStore } from "../../src/lib/store/create.js";
import { createKindRegistry, FormatVersionSchema, RecordReferenceSchema, type RecordReference } from "../../src/lib/store/index.js";
import { LineageRecordSchema } from "../../src/lib/store/kinds/lineage/index.js";
import { PRODUCTION_REGISTRATIONS } from "../../src/lib/store/kinds/registrations.js";
import { expandStoredPath } from "../../src/lib/store/stored-path.js";
import { makeMetaFixture } from "../helpers/meta-fixture.js";
import { capturedEntries } from "../helpers/store/ref-fixture-plant.js";
import { plantRef } from "../helpers/store/ref-plant.js";
import { refSyncFixture, type RefSyncFixture } from "../helpers/store/ref-sync.js";
import { success } from "../helpers/store/suite-tools.js";

const provenance = { verb: "archive", lifecycleAction: "archive" };
const capture = { verb: "save", lifecycleAction: "capture" };
const declared = createKindRegistry(PRODUCTION_REGISTRATIONS);
const registry = { ...declared, "work-item/companion": { ...declared["work-item/companion"], formatVersion: FormatVersionSchema.parse(3) } };
const upgraded = { ...registry, "work-item/companion": { ...registry["work-item/companion"], formatVersion: FormatVersionSchema.parse(4) } };
function storedFormatKey(formats: Record<string, number>, reference: RecordReference): string {
  if (!("key" in reference)) throw new Error("Expected a keyed companion");
  const key = Object.keys(formats).find(key => {
    const coordinate = JSON.parse(key) as { kind?: string; key?: unknown };
    return coordinate.kind === reference.kind && coordinate.key === reference.key;
  });
  if (!key) throw new Error("The public write did not produce its format coordinate");
  return key;
}

async function plantBefore(side: RefSyncFixture["a"], reference: RecordReference, content: string) {
  const home = expandStoredPath(reference, { registry }), entries = await capturedEntries(side, home.ref);
  const parent = (await side.git(["rev-parse", home.ref])).stdout.trim();
  const metadata = JSON.parse((await side.git(["show", `${parent}:${home.metadataPath}`])).stdout) as { formats: Record<string, number> };
  const key = storedFormatKey(metadata.formats, reference);
  metadata.formats[key] = 2;
  await plantRef(side.root, home.ref, entries.map(entry => entry.path === home.path ? { path: entry.path, content }
    : entry.path === home.metadataPath ? { path: entry.path, content: JSON.stringify(metadata) } : entry),
  { parents: [parent], message: `External capture\n\nArc-Actor: ${side.carry().actor}\n`, gitDir: side.gitDir });
  return key;
}

async function setup(layout: "default" | "separate") {
  const h = await refSyncFixture(layout);
  const a = createRefStore({ ...h.a.ports, registry }), b = createRefStore({ ...h.b.ports, registry });
  const start = async (name: string) => {
    const written = success(await a.write({ action: "put", expected: null,
      reference: RecordReferenceSchema.parse({ kind: "work-item/meta", owner: { type: "work-item", name } }),
      content: makeMetaFixture(name), placement: { kind: "active" }, provenance: { verb: "start", lifecycleAction: "activate" } }));
    return success(await a.read({ reference: written.reference }));
  };
  const primary = await start("generic-ended"), auxiliary = await start("generic-retained");
  const reference = RecordReferenceSchema.parse({ kind: "work-item/companion", owner: auxiliary.reference.owner, key: "extra" });
  const untouched = RecordReferenceSchema.parse({ ...reference, key: "untouched" });
  success(await a.write({ action: "put", reference: untouched, expected: null, content: "Untouched.\n", provenance: capture }));
  const home = expandStoredPath(reference, { registry });
  return { h, a, b, primary, reference, untouched, home };
}

async function publishedEnd(f: Awaited<ReturnType<typeof setup>>, content?: string) {
  const primary = success(await f.b.read({ reference: f.primary.reference }));
  const record = content === undefined ? undefined : success(await f.b.read({ reference: f.reference }));
  success(await f.b.batch({ writes: [
    { action: "put", reference: primary.reference, expected: primary.version, content: primary.content,
      placement: { kind: "completed", quarter: ArchiveQuarterSchema.parse("2026-q4") } },
    ...record && content !== undefined ? [{ action: "put" as const, reference: record.reference, expected: record.version, content }] : [],
  ], provenance }));
  success(await f.b.push());
}

async function withdrawal(f: Awaited<ReturnType<typeof setup>>) {
  const notices = success(await f.a.pull()).pulls.flatMap(pull => pull.notices);
  expect(notices).toContainEqual(expect.objectContaining({ kind: "end-withdrawn" }));
  const commit = (await f.h.a.git(["log", "-1", "--format=%H", "--grep=Arc-Withdrawn-End:", f.home.ref])).stdout.trim();
  expect(commit).toMatch(/^[0-9a-f]{40,64}$/u);
  const metadata = JSON.parse((await f.h.a.git(["show", `${commit}:${f.home.metadataPath}`])).stdout) as { formats: Record<string, number>; primary?: { placement?: unknown } };
  return { commit, metadata };
}

const cases = [
  { name: "changed bytes", before: "Before.\n", end: "End.\n", published: undefined, later: undefined, selected: "before" },
  { name: "format-only end", before: "Before.\n", end: "Before.\n", published: undefined, later: undefined, selected: "before" },
  { name: "end matching unchanged common bytes", before: "Before.\n", end: "Common.\n", published: undefined, later: undefined, selected: "before" },
  { name: "later independent bytes", before: "Before.\n", end: "End.\n", published: undefined, later: "Later.\n", selected: "later" },
  { name: "later independent format only", before: "Before.\n", end: "End.\n", published: undefined, later: "format-only", selected: "later" },
  { name: "independent published bytes", before: "Before.\n", end: "End.\n", published: "Published.\n", later: undefined, selected: "before" },
  { name: "published matching changed contribution", before: "Before.\n", end: "End.\n", published: "End.\n", later: undefined, selected: "end" },
] as const;

describe.each(["default", "separate"] as const)("generic withdrawal format selection in %s", layout => {
  it.each(cases)("keeps bytes and format coherent for $name", async state => {
    const f = await setup(layout), { h, a, b, primary, reference, untouched, home } = f;
    expect(registry["work-item/companion"].entry).toBeUndefined();
    success(await a.write({ action: "put", reference, expected: null, content: "Common.\n", provenance: capture }));
    success(await a.push()); success(await b.pull());
    const publishedBefore = success(await b.read({ reference }));
    const coordinate = await plantBefore(h.a, reference, state.before);
    const before = success(await a.read({ reference }));
    const beforeBlob = (await h.a.git(["rev-parse", `${home.ref}:${home.path}`])).stdout.trim();
    const unchanged = success(await a.read({ reference: untouched }));
    expect(before.formatVersion).toBe(2);
    success(await a.batch({ writes: [
      { action: "put", reference: primary.reference, expected: primary.version, content: primary.content,
        placement: { kind: "completed", quarter: ArchiveQuarterSchema.parse("2027-q1") } },
      { action: "put", reference, expected: before.version, content: state.end },
    ], provenance }));
    const end = success(await a.read({ reference }));
    const endBlob = (await h.a.git(["rev-parse", `${home.ref}:${home.path}`])).stdout.trim();
    expect(end.formatVersion).toBe(3);
    if (state.name === "format-only end") {
      expect(endBlob).toBe(beforeBlob);
      expect(end.content).toBe(before.content);
      expect(end.version).not.toBe(before.version);
    }
    let selected = state.selected === "before" ? before : end;
    let selectedBlob = state.selected === "before" ? beforeBlob : endBlob;
    if (state.later !== undefined) {
      const writer = state.later === "format-only" ? createRefStore({ ...h.a.ports, registry: upgraded }) : a;
      success(await writer.write({ action: "put", reference, expected: end.version,
        content: state.later === "format-only" ? end.content : state.later, provenance: capture }));
      selected = success(await writer.read({ reference }));
      selectedBlob = (await h.a.git(["rev-parse", `${home.ref}:${home.path}`])).stdout.trim();
      if (state.later === "format-only") {
        expect(selectedBlob).toBe(endBlob);
        expect(selected.version).not.toBe(end.version);
        expect(selected.formatVersion).toBe(4);
        // A build supporting the later stored format performs the pull too.
        f.a = writer;
      }
    }
    await publishedEnd(f, state.published);
    if (state.published === undefined) expect(success(await b.read({ reference }))).toMatchObject({ version: publishedBefore.version, content: "Common.\n", formatVersion: 3 });
    const withdrawn = await withdrawal(f);
    expect((await h.a.git(["rev-parse", `${withdrawn.commit}:${home.path}`])).stdout.trim()).toBe(selectedBlob);
    expect(withdrawn.metadata.formats[coordinate]).toBe(selected.formatVersion);
    expect(success(await f.a.read({ reference: untouched }))).toMatchObject({ version: unchanged.version, content: unchanged.content, formatVersion: unchanged.formatVersion });
    const finalExpected = state.published === undefined ? selected : success(await b.read({ reference }));
    const final = success(await f.a.read({ reference }));
    expect(final.content).toBe(finalExpected.content);
    if (state.name !== "independent published bytes") expect(final).toMatchObject({
      formatVersion: finalExpected.formatVersion, version: finalExpected.version });
    const history = success(await f.a.history({ reference }));
    expect(history).toContainEqual(expect.objectContaining({ content: selected.content, version: selected.version }));
    if (state.selected === "before") expect(history).toContainEqual(expect.objectContaining({ content: before.content, version: before.version,
      provenance: expect.objectContaining({ lifecycleAction: "withdraw-end" }) }));
  }, 90_000);

  it.each(["created", "removed", "removed-recreated", "later-removed"] as const)(
    "preserves generic presence and coordinate selection for %s", async transition => {
      const f = await setup(layout), { h, a, b, primary, reference, home } = f;
      if (transition !== "created") success(await a.write({ action: "put", reference, expected: null, content: "Common.\n", provenance: capture }));
      success(await a.push()); success(await b.pull());
      let coordinate = transition === "created" ? undefined : await plantBefore(h.a, reference, "Before.\n");
      const before = transition === "created" ? undefined : success(await a.read({ reference }));
      const beforeBlob = before ? (await h.a.git(["rev-parse", `${home.ref}:${home.path}`])).stdout.trim() : undefined;
      const removing = transition === "removed" || transition === "removed-recreated";
      if (removing && !before) throw new Error("A removal requires its before record");
      const write = removing && before ? { action: "remove" as const, reference, expected: before.version }
        : { action: "put" as const, reference, expected: before?.version ?? null, content: "End.\n" };
      success(await a.batch({ writes: [
        { action: "put", reference: primary.reference, expected: primary.version, content: primary.content,
          placement: { kind: "completed", quarter: ArchiveQuarterSchema.parse("2027-q1") } },
        write,
      ], provenance }));
      if (coordinate === undefined) {
        const metadata = JSON.parse((await h.a.git(["show", `${home.ref}:${home.metadataPath}`])).stdout) as { formats: Record<string, number> };
        coordinate = storedFormatKey(metadata.formats, reference);
      }
      let selected = transition === "removed" ? before : undefined;
      let selectedBlob = transition === "removed" ? beforeBlob : undefined;
      if (transition === "removed-recreated") {
        success(await a.write({ action: "put", reference, expected: null, content: "Recreated.\n", provenance: capture }));
        selected = success(await a.read({ reference }));
        selectedBlob = (await h.a.git(["rev-parse", `${home.ref}:${home.path}`])).stdout.trim();
      }
      if (transition === "later-removed") {
        const end = success(await a.read({ reference }));
        success(await a.write({ action: "remove", reference, expected: end.version, provenance: capture }));
      }
      await publishedEnd(f);
      const withdrawn = await withdrawal(f);
      if (selected) {
        expect((await h.a.git(["rev-parse", `${withdrawn.commit}:${home.path}`])).stdout.trim()).toBe(selectedBlob);
        expect(withdrawn.metadata.formats[coordinate]).toBe(selected.formatVersion);
        expect(success(await a.history({ reference }))).toContainEqual(expect.objectContaining({ content: selected.content, version: selected.version }));
      } else {
        expect((await h.a.git(["ls-tree", "--name-only", withdrawn.commit, "--", home.path])).stdout).toBe("");
        expect(withdrawn.metadata.formats[coordinate]).toBeUndefined();
      }
    }, 90_000,
  );
});

it.each(["default", "separate"] as const)("restores an unprotected lineage's format after specialized repair in %s", async layout => {
  const f = await setup(layout), { h, primary } = f;
  const owner = f.reference.owner;
  if (owner.type !== "work-item" || !owner.uid) throw new Error("Expected the genuine auxiliary generation");
  const olderRegistry = { ...registry, "lineage/transition": { ...registry["lineage/transition"], formatVersion: FormatVersionSchema.parse(2) } };
  const newerRegistry = { ...olderRegistry, "lineage/transition": { ...olderRegistry["lineage/transition"], formatVersion: FormatVersionSchema.parse(3) } };
  const older = createRefStore({ ...h.a.ports, registry: olderRegistry });
  const olderPeer = createRefStore({ ...h.b.ports, registry: olderRegistry });
  const reference = RecordReferenceSchema.parse({ kind: "lineage/transition", owner });
  const content = JSON.stringify(LineageRecordSchema.parse({ schemaVersion: 2, origin: { name: owner.name, uid: owner.uid },
    kind: "abandon", successors: [], incoming: [] }));
  success(await older.write({ action: "put", reference, expected: null, content, provenance: capture }));
  success(await older.push()); success(await olderPeer.pull());
  const before = success(await older.read({ reference }));
  expect(before.formatVersion).toBe(2);
  const home = expandStoredPath(reference, { registry: newerRegistry });
  const beforeBlob = (await h.a.git(["rev-parse", `${home.ref}:${home.path}`])).stdout.trim();
  const beforeMetadata = JSON.parse((await h.a.git(["show", `${home.ref}:${home.metadataPath}`])).stdout) as { formats: Record<string, number> };
  const coordinate = Object.keys(beforeMetadata.formats).find(key => {
    const value = JSON.parse(key) as { kind?: string; ownerUid?: string };
    return value.kind === reference.kind && value.ownerUid === owner.uid;
  });
  if (!coordinate) throw new Error("The public lineage write did not produce its format coordinate");
  const a = createRefStore({ ...h.a.ports, registry: newerRegistry }), b = createRefStore({ ...h.b.ports, registry: newerRegistry });
  f.a = a; f.b = b; f.reference = reference; f.home = home;
  success(await a.batch({ writes: [
    { action: "put", reference: primary.reference, expected: primary.version, content: primary.content,
      placement: { kind: "completed", quarter: ArchiveQuarterSchema.parse("2027-q1") } },
    { action: "remove", reference, expected: before.version },
  ], provenance }));
  const afterMetadata = JSON.parse((await h.a.git(["show", `${home.ref}:${home.metadataPath}`])).stdout) as { formats: Record<string, number> };
  expect(afterMetadata.formats[coordinate]).toBeUndefined();
  expect(await a.read({ reference })).toMatchObject({ status: "refused", refusal: { code: "not-found" } });
  await publishedEnd(f);
  expect(success(await b.read({ reference }))).toMatchObject({ content: before.content, formatVersion: 2, version: before.version });
  const withdrawn = await withdrawal(f);
  expect((await h.a.git(["rev-parse", `${withdrawn.commit}:${home.path}`])).stdout.trim()).toBe(beforeBlob);
  expect(withdrawn.metadata.formats[coordinate]).toBe(2);
  expect(success(await a.read({ reference }))).toMatchObject({ content: before.content, formatVersion: 2, version: before.version });
  expect(success(await a.history({ reference }))).toContainEqual(expect.objectContaining({ content: before.content, version: before.version,
    provenance: expect.objectContaining({ lifecycleAction: "withdraw-end" }) }));
}, 90_000);

describe.each(["default", "separate"] as const)("structural withdrawal metadata in %s", layout => {
  it.each(["whole metadata", "nested field"] as const)("restores Planning placement when %s matches unchanged published state", async match => {
    const f = await setup(layout), { h, a, b, primary } = f;
    const reference = RecordReferenceSchema.parse({ kind: "work-item/meta", owner: f.reference.owner });
    const common = success(await a.read({ reference }));
    const home = expandStoredPath(reference, { registry });
    f.reference = reference; f.home = home;
    success(await a.push()); success(await b.pull());
    const commonMetadata = (await h.a.git(["rev-parse", `${home.ref}:${home.metadataPath}`])).stdout.trim();
    const planning = makeMetaFixture(reference.owner.name, { state: "Planning" });
    success(await a.write({ action: "put", reference, expected: common.version, content: planning,
      placement: { kind: "backlog", commitment: "planned" }, provenance: { verb: "park", lifecycleAction: "park" } }));
    const before = success(await a.read({ reference }));
    const beforeBlob = (await h.a.git(["rev-parse", `${home.ref}:${home.path}`])).stdout.trim();
    const beforeMetadata = (await h.a.git(["rev-parse", `${home.ref}:${home.metadataPath}`])).stdout.trim();
    expect(before.placement).toEqual({ kind: "backlog", commitment: "planned" });
    const extra = RecordReferenceSchema.parse({ kind: "work-item/companion", owner: reference.owner, key: "metadata-end-extra" });
    success(await a.batch({ writes: [
      { action: "put", reference: primary.reference, expected: primary.version, content: primary.content,
        placement: { kind: "completed", quarter: ArchiveQuarterSchema.parse("2027-q1") } },
      { action: "put", reference, expected: before.version, content: common.content, placement: { kind: "active" } },
      ...match === "nested field" ? [{ action: "put" as const, reference: extra, expected: null, content: "End-only metadata coordinate.\n" }] : [],
    ], provenance }));
    const endMetadata = (await h.a.git(["rev-parse", `${home.ref}:${home.metadataPath}`])).stdout.trim();
    if (match === "whole metadata") expect(endMetadata).toBe(commonMetadata);
    else expect(endMetadata).not.toBe(commonMetadata);
    await publishedEnd(f);
    const publishedMetadata = (await h.b.git(["rev-parse", `${home.ref}:${home.metadataPath}`])).stdout.trim();
    expect(publishedMetadata).toBe(commonMetadata);
    expect(beforeMetadata).not.toBe(endMetadata);
    expect(success(await b.read({ reference }))).toMatchObject({ version: common.version, placement: common.placement });
    const withdrawn = await withdrawal(f);
    expect((await h.a.git(["rev-parse", `${withdrawn.commit}:${home.path}`])).stdout.trim()).toBe(beforeBlob);
    const capturedBasis = JSON.stringify({ layout, match, commonMetadata, beforeMetadata, endMetadata, publishedMetadata });
    expect(withdrawn.metadata.primary?.placement, capturedBasis).toEqual(before.placement);
    expect(success(await a.read({ reference }))).toMatchObject({ content: before.content, placement: before.placement, version: before.version });
    expect(success(await a.history({ reference }))).toContainEqual(expect.objectContaining({ content: before.content, version: before.version,
      provenance: expect.objectContaining({ lifecycleAction: "withdraw-end" }) }));
  }, 90_000);
});

it.each(["default", "separate"] as const)("restores the attached manifest with its selected anchored meta in %s", async layout => {
  const f = await setup(layout), { h, a, b, primary } = f;
  expect(registry["work-item/meta"].anchorFields).toContain("stateAtHandoff");
  expect(registry["work-item/meta"].parser).toBeDefined();
  const reference = RecordReferenceSchema.parse({ kind: "work-item/meta", owner: f.reference.owner });
  const home = expandStoredPath(reference, { registry }), manifestPath = home.manifestPath.slice(0, -1);
  f.reference = reference; f.home = home;
  const S = success(await a.version());
  const initial = success(await a.read({ reference }));
  success(await a.write({ action: "put", reference, expected: initial.version,
    content: makeMetaFixture(reference.owner.name, { stateAtHandoff: S }), placement: { kind: "active" }, provenance: capture }));
  const common = success(await a.read({ reference }));
  success(await a.push()); success(await b.pull());
  const T = success(await a.version());
  expect(T).not.toBe(S);
  success(await a.write({ action: "put", reference, expected: common.version,
    content: makeMetaFixture(reference.owner.name, { stateAtHandoff: T }), placement: { kind: "active" }, provenance: capture }));
  const before = success(await a.read({ reference }));
  const beforeBlob = (await h.a.git(["rev-parse", `${home.ref}:${home.path}`])).stdout.trim();
  const beforeManifest = (await h.a.git(["rev-parse", `${home.ref}:${manifestPath}`])).stdout.trim();
  expect(before.fields).toMatchObject({ stateAtHandoff: T });
  expect(beforeManifest).toBe(T);
  success(await a.batch({ writes: [
    { action: "put", reference: primary.reference, expected: primary.version, content: primary.content,
      placement: { kind: "completed", quarter: ArchiveQuarterSchema.parse("2027-q1") } },
    { action: "put", reference, expected: before.version, content: common.content, placement: { kind: "active" } },
  ], provenance }));
  const endManifest = (await h.a.git(["rev-parse", `${home.ref}:${manifestPath}`])).stdout.trim();
  expect(endManifest).toBe(S);
  await publishedEnd(f);
  const publishedManifest = (await h.b.git(["rev-parse", `${home.ref}:${manifestPath}`])).stdout.trim();
  expect(publishedManifest).toBe(S);
  expect(success(await b.read({ reference }))).toMatchObject({ content: common.content, version: common.version });
  const withdrawn = await withdrawal(f);
  expect((await h.a.git(["rev-parse", `${withdrawn.commit}:${home.path}`])).stdout.trim()).toBe(beforeBlob);
  expect(success(await a.read({ reference }))).toMatchObject({ content: before.content, placement: before.placement,
    version: before.version, fields: { stateAtHandoff: T } });
  expect(success(await a.history({ reference }))).toContainEqual(expect.objectContaining({ content: before.content, version: before.version,
    provenance: expect.objectContaining({ lifecycleAction: "withdraw-end" }) }));
  const withdrawnManifest = (await h.a.git(["rev-parse", `${withdrawn.commit}:${manifestPath}`])).stdout.trim();
  const finalManifest = (await h.a.git(["rev-parse", `${home.ref}:${manifestPath}`])).stdout.trim();
  const capturedBasis = JSON.stringify({ layout, S, T, beforeManifest, endManifest, publishedManifest,
    withdrawnCommit: withdrawn.commit, withdrawnManifest, finalManifest });
  expect(withdrawnManifest, capturedBasis).toBe(beforeManifest);
  expect(finalManifest).toBe(beforeManifest);
}, 90_000);
