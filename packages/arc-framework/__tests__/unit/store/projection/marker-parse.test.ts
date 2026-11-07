/** Marker parse-back preserves open conflicts and sends only the person's resolved content. */
import { afterEach, describe, expect, it } from "vitest";
import { createMarkerFixture } from "../../../helpers/store/projection/marker-fixture.js";
import { createWriteBackPort } from "../../../../src/lib/store/projection/write-back.js";
import { writeBackFile } from "../../../../src/lib/store/projection/read-back.js";
import { formatConflictToken } from "../../../../src/lib/status/conflict-token.js";
import type { RecordReference } from "../../../../src/lib/store/identity.js";
import { parseStampedFile } from "../../../../src/lib/store/projection/stamp.js";
import { gitBlobId } from "../../../../src/lib/store/projection/blob-id.js";
import { RESOLVE_BY_HAND_LINE } from "../../../../src/lib/store/projection/marker-render.js";
import { parseMarkerContent } from "../../../../src/lib/store/projection/marker-parse.js";
import { createStagedFile, nameAsideFile } from "../../../../src/lib/store/projection/aside.js";
import { settleAsideCopy } from "../../../../src/lib/store/projection/aside-copies.js";
import { rm } from "node:fs/promises";
import { join } from "node:path";

const entryCases = [
  { kind: "personal/inbox" as const, base: "# Inbox\n\n## Errand\n\n### [ ] **First**\n\n- _Id:_ `11111111`\n\nbase first\n\n"
    + "### [ ] **Second**\n\n- _Id:_ `22222222`\n\nbase second\n" },
  { kind: "personal/working-memory" as const, base: "# Working Memory\n\n## Memories\n\n**First:**\n_Remove when:_ done\n_Id:_ `11111111`\n\nbase first\n\n"
    + "**Second:**\n_Remove when:_ done\n_Id:_ `22222222`\n\nbase second\n" },
];

const fixtures: Awaited<ReturnType<typeof createMarkerFixture>>[] = [];
afterEach(async () => { await Promise.all(fixtures.splice(0).map(fixture => fixture.dispose())); });

describe("marker parse-back", () => {
  it.each([false, true])("preserves an unchanged EOF conflict with stamped=%s through an independent edit", async stamped => {
    const fixture = await createMarkerFixture({ base: "heading\nbase", current: "heading\nstored", incoming: "heading\nincoming" });
    fixtures.push(fixture);
    const rendered = await fixture.context.renderer({ record: fixture.record, content: fixture.record.content, stamped });
    if (rendered.status !== "ok" || rendered.result.state.markers === null) throw new Error("No rendered EOF conflict");
    const { content, state } = rendered.result;
    expect(content.endsWith("\n")).toBe(false);
    const parse = (text: string) => parseMarkerContent({ content: text, markers: state.markers!,
      conflicts: fixture.conflicts, open: fixture.record.conflicts });
    expect(parse(content)).toMatchObject({ kind: "ready", content: "heading\nstored", resolves: [] });
    expect(parse(content.replace("heading", "edited heading"))).toMatchObject({ kind: "ready", content: "edited heading\nstored", resolves: [] });
    expect(parse(`${content}\n`)).toMatchObject({ kind: "ready", content: "heading\nstored\n", resolves: [] });
    expect(parse(`${content}\nafter\n`)).toMatchObject({ kind: "ready", content: "heading\nstored\nafter\n", resolves: [] });
    await fixture.edit(content.replace("heading", "edited heading"));
    await createWriteBackPort(fixture.context)({ ...fixture.request, entry: { ...fixture.entry, ...state } });
    expect(await fixture.store.read({ reference: fixture.entry.reference })).toMatchObject({ status: "ok", result: {
      content: "edited heading\nstored", conflicts: fixture.record.conflicts,
    } });
  });

  it("withholds a new malformed entry absent from the base while another ID-less entry lands", async () => {
    const input = entryCases[0];
    if (input === undefined) throw new Error("Entry fixture missing");
    const fixture = await createMarkerFixture({ ...input, current: input.base.replace("base first", "stored first"),
      incoming: input.base.replace("base first", "incoming first") });
    fixtures.push(fixture);
    const newEntry = "### [ ] **Third**\n\nnew third\n";
    const fourth = "\n### [ ] **Fourth**\n\nnew fourth\n";
    const content = fixture.content.replace("base second", "edited second")
      + '\n<<<<<<< local [arc-conflict: "personal/person/stranger/unindexed"]\n' + newEntry
      + "=======\n" + newEntry.replace("new third", "other third") + ">>>>>>> incoming\n" + fourth;
    await fixture.edit(content);
    const result = await writeBackFile(fixture.context, fixture.index, fixture.request);
    expect(result.result.answer).toBe("refused");
    const read = await fixture.store.read({ reference: fixture.entry.reference });
    expect(read).toMatchObject({ status: "ok", result: { content: expect.stringContaining("edited second") } });
    if (read.status !== "ok") throw new Error("Read-back missing");
    expect(read.result.content).not.toContain("Third");
    expect(read.result.content).toContain("new fourth");
    expect(read.result.content).toContain("stored first");
    expect(await fixture.file()).toContain(content);
    await fixture.edit(fixture.record.content.replace("base second", "edited second") + "\n" + newEntry + fourth);
    const retry = await writeBackFile(fixture.context, result.index, { ...fixture.request, entry: result.result.entry });
    expect(retry.result.answer).toBe("taken-in");
    expect(await fixture.store.read({ reference: fixture.entry.reference })).toMatchObject({ status: "ok", result: { content: expect.stringContaining("new third") } });
  });

  it.each(entryCases.flatMap(input => ["missing-start", "missing-separator", "unindexed-label"].map(damage => ({ ...input, damage }))))("contains $damage within its entry in $kind", async input => {
    const fixture = await createMarkerFixture({ ...input, current: input.base.replace("base first", "stored first"),
      incoming: input.base.replace("base first", "incoming first") });
    fixtures.push(fixture);
    let content = fixture.content.replace("base second", "edited second");
    if (input.damage === "missing-start") content = content.replace(/^<<<<<<<[^\n]*\n/mu, "");
    else if (input.damage === "missing-separator") content = content.replace(/^=======\n/mu, "");
    else content = content.replace(/\[arc-conflict: .*\]/u, '[arc-conflict: "personal/person/stranger/unindexed"]');
    await fixture.edit(content);
    const result = await writeBackFile(fixture.context, fixture.index, fixture.request);
    expect(result.result.answer).toBe("refused");
    expect(await fixture.store.read({ reference: fixture.entry.reference })).toMatchObject({ status: "ok", result: {
      content: fixture.record.content.replace("base second", "edited second"), conflicts: fixture.record.conflicts,
    } });
    expect(await fixture.file()).toContain(content);
    await fixture.edit(fixture.record.content.replace("stored first", "resolved first").replace("base second", "edited second"));
    expect((await writeBackFile(fixture.context, result.index, { ...fixture.request, entry: result.result.entry })).result.answer).toBe("taken-in");
  });

  it("returns a malformed aside copy unchanged before its own path can partially land", async () => {
    const input = entryCases[0];
    if (input === undefined) throw new Error("Entry fixture missing");
    const fixture = await createMarkerFixture({ ...input, current: input.base.replace("base first", "stored first"),
      incoming: input.base.replace("base first", "incoming first") });
    fixtures.push(fixture);
    const content = fixture.content.replace(/^>>>>>>>[^\n]*\n?/mu, "").replace("base second", "edited second");
    await fixture.edit(content);
    const original = await fixture.file();
    const name = nameAsideFile({ path: fixture.path, base: fixture.entry.base.blob, writer: fixture.context.writer, role: "aside" });
    await createStagedFile(fixture.checkout, name, original);
    await rm(join(fixture.checkout, fixture.path));
    const copy = { name, moving: fixture.entry.written, linked: null, writeBackSent: false, landed: null, rendering: { markers: fixture.entry.markers, notices: fixture.entry.notices } };
    const entry = { ...fixture.entry, copies: [copy] };
    const settled = await settleAsideCopy({ ...fixture.context, checkout: fixture.checkout, path: fixture.path, entry, copy,
      takeIn: createWriteBackPort(fixture.context) });
    expect(settled).toMatchObject({ kind: "returned", held: "refused" });
    expect(await fixture.file()).toBe(original);
    expect(await fixture.store.read({ reference: entry.reference })).toMatchObject({ status: "ok", result: { version: fixture.record.version } });
    const index = { ...fixture.index, entries: { ...fixture.index.entries, [fixture.path]: settled.entry } };
    const result = await writeBackFile(fixture.context, index, { ...fixture.request, entry: settled.entry });
    expect(result.result.answer).toBe("refused");
    expect(await fixture.store.read({ reference: entry.reference })).toMatchObject({ status: "ok", result: { content: expect.stringContaining("edited second") } });
    await fixture.edit(fixture.record.content.replace("stored first", "resolved first").replace("base second", "edited second"));
    expect((await writeBackFile(fixture.context, result.index, { ...fixture.request, entry: result.result.entry })).result.answer).toBe("taken-in");
  });

  it.each(["current", "incoming"] as const)("refuses VS Code Accept %s after an escalated set is mis-split", async choice => {
    const current = "stored title\n=======\nstored tail\n";
    const fixture = await createMarkerFixture({ current, incoming: "incoming text\n" });
    fixtures.push(fixture);
    expect(fixture.renderer.length).toBe(11);
    const content = fixture.content.replace(/^<{7}[^\n]*\n([\s\S]*?)^={7}[^\n]*\n([\s\S]*?)^>{7}[^\n]*(?:\n|$)/mu,
      choice === "current" ? "$1" : "$2");
    await fixture.edit(content);
    const result = await writeBackFile(fixture.context, fixture.index, fixture.request);
    expect(result.result).toMatchObject({ answer: "refused", mark: { reason: expect.stringContaining("marker-malformed") } });
    expect(await fixture.store.read({ reference: fixture.entry.reference })).toMatchObject({ status: "ok", result: { version: fixture.record.version } });
    await fixture.edit("hand resolution\n");
    expect((await writeBackFile(fixture.context, result.index, { ...fixture.request, entry: result.result.entry })).result.answer).toBe("taken-in");
    expect(await fixture.store.read({ reference: fixture.entry.reference })).toMatchObject({ status: "ok", result: { content: "hand resolution\n", conflicts: [] } });
  });

  it("keeps a longer marker-like run added to the resolution as ordinary content", async () => {
    const fixture = await createMarkerFixture();
    fixtures.push(fixture);
    const content = "resolved heading\n===========\n";
    await fixture.edit(content);
    expect(await createWriteBackPort(fixture.context)(fixture.request)).toMatchObject({ answer: "taken-in" });
    expect(await fixture.store.read({ reference: fixture.entry.reference })).toMatchObject({ status: "ok", result: { content, conflicts: [] } });
  });

  it("sends nothing when only a malformed entry differs from the selected base", async () => {
    const input = entryCases[0];
    if (input === undefined) throw new Error("Entry fixture missing");
    const fixture = await createMarkerFixture({ ...input, current: input.base.replace("base first", "stored first"),
      incoming: input.base.replace("base first", "incoming first") });
    fixtures.push(fixture);
    const content = fixture.content.replace(/^>>>>>>>[^\n]*\n?/mu, "");
    await fixture.edit(content);
    const result = await createWriteBackPort(fixture.context)(fixture.request);
    expect(result).toMatchObject({ answer: "refused", entry: { pending: true, persisted: null } });
    expect(await fixture.store.read({ reference: fixture.entry.reference })).toMatchObject({ status: "ok", result: { version: fixture.record.version } });
    await fixture.edit(fixture.record.content.replace("stored first", "resolved first"));
    expect(await createWriteBackPort(fixture.context)({ ...fixture.request, entry: result.entry })).toMatchObject({ answer: "taken-in" });
  });

  it.each(["partial", "whole"] as const)("records and reports unshown conflicts while the file is held %s", async mode => {
    const input = entryCases[0];
    if (input === undefined) throw new Error("Entry fixture missing");
    const fixture = await createMarkerFixture({ ...input, current: input.base.replace("base first", "stored first"),
      incoming: input.base.replace("base first", "incoming first") });
    fixtures.push(fixture);
    expect(await fixture.store.write({ action: "put", reference: fixture.entry.reference, expected: fixture.record.version,
      content: fixture.record.content.replace("base second", "remote second"), provenance: { verb: "edit", lifecycleAction: "edit" } }))
      .toMatchObject({ status: "ok" });
    if (mode === "whole") expect(await fixture.store.write({ action: "put", reference: fixture.entry.reference, expected: fixture.record.version,
      content: fixture.record.content.replace("base second", "other second"), provenance: { verb: "edit", lifecycleAction: "edit" } }))
      .toMatchObject({ status: "ok" });
    const content = (mode === "partial" ? fixture.content.replace(/^>>>>>>>[^\n]*\n?/mu, "")
      : fixture.content.replace("stored first", "resolution in progress")).replace("base second", "local second");
    await fixture.edit(content);
    const result = await writeBackFile(fixture.context, fixture.index, fixture.request);
    expect(result.result.answer).toBe("refused");
    const read = await fixture.store.read({ reference: fixture.entry.reference });
    if (read.status !== "ok") throw new Error("Read-back missing");
    const unshown = read.result.conflicts.filter(reference => !fixture.record.conflicts.some(old => old.key === reference.key));
    expect(unshown).toHaveLength(1);
    expect(result.result.entry.unshown).toEqual(unshown);
    for (const reference of unshown) expect(fixture.reports).toContainEqual(expect.objectContaining({ mark: {
      reason: expect.stringContaining(formatConflictToken(reference)), remedy: result.result.entry.refused?.remedy,
    } }));
    expect(await fixture.file()).toContain(content);
    await fixture.edit(fixture.record.content.replace("stored first", "resolved first").replace("base second", "remote second"));
    const retry = await writeBackFile(fixture.context, result.index, { ...fixture.request, entry: result.result.entry });
    expect(retry.result.answer).toBe("taken-in");
  });

  it("keeps a newer stored version of the refused entry and retries from the last partial take-in", async () => {
    const input = entryCases[0];
    if (input === undefined) throw new Error("Entry fixture missing");
    const fixture = await createMarkerFixture({ ...input, current: input.base.replace("base first", "stored first"),
      incoming: input.base.replace("base first", "incoming first") });
    fixtures.push(fixture);
    const newer = fixture.record.content.replace("stored first", "newer stored first");
    expect(await fixture.store.write({ action: "put", reference: fixture.entry.reference, expected: fixture.record.version,
      content: newer, provenance: { verb: "edit", lifecycleAction: "edit" } })).toMatchObject({ status: "ok" });
    await fixture.edit(fixture.content.replace(/^>>>>>>>[^\n]*\n?/mu, "").replace("base second", "edited second"));
    const result = await writeBackFile(fixture.context, fixture.index, fixture.request);
    expect(result.result).toMatchObject({ answer: "refused", entry: { persisted: { takenIn: { kind: "copy" } } } });
    const landed = await fixture.store.read({ reference: fixture.entry.reference });
    expect(landed).toMatchObject({ status: "ok", result: { content: newer.replace("base second", "edited second"),
      conflicts: fixture.record.conflicts } });
    await fixture.edit(newer.replace("base second", "edited second"));
    const retry = await writeBackFile(fixture.context, result.index, { ...fixture.request, entry: result.result.entry });
    expect(retry.result.answer).toBe("taken-in");
    expect(await fixture.store.read({ reference: fixture.entry.reference })).toMatchObject({ status: "ok", result: {
      content: newer.replace("base second", "edited second"), conflicts: [],
    } });
  });

  it.each(entryCases)("lands independent entries beside a missing end marker in $kind and holds the original file", async input => {
    const current = input.base.replace("base first", "stored first");
    const fixture = await createMarkerFixture({ ...input, current, incoming: input.base.replace("base first", "incoming first") });
    fixtures.push(fixture);
    const third = input.kind === "personal/inbox" ? "\n### [ ] **Third**\n\nnew third\n"
      : "\n**Third:**\n_Remove when:_ done\n\nnew third\n";
    const content = fixture.content.replace(/^>>>>>>>[^\n]*\n?/mu, "").replace("base second", "edited second") + third;
    await fixture.edit(content);
    const originalFile = await fixture.file();
    const result = await writeBackFile(fixture.context, fixture.index, fixture.request);
    expect(result.result).toMatchObject({ answer: "refused", entry: {
      pending: true, base: fixture.entry.base, written: fixture.entry.written, persisted: expect.any(Object),
    } });
    expect(await fixture.file()).toBe(originalFile);
    const read = await fixture.store.read({ reference: fixture.entry.reference });
    expect(read).toMatchObject({ status: "ok", result: { content: expect.stringContaining("edited second") } });
    if (read.status !== "ok") throw new Error("Missing read-back");
    expect(read.result.content).toContain("stored first");
    expect(read.result.content).not.toMatch(/incoming first|<<<<<<<|=======|>>>>>>>/u);
    expect(read.result.content).toContain("new third");
    expect(read.result.content.match(/11111111/gu)).toHaveLength(1);
    const repaired = current.replace("stored first", "resolved first").replace("base second", "edited second") + third;
    await fixture.edit(repaired);
    const retry = await writeBackFile(fixture.context, result.index, { ...fixture.request, entry: result.result.entry });
    expect(retry.result.answer).toBe("taken-in");
    expect(await fixture.store.read({ reference: fixture.entry.reference })).toMatchObject({ status: "ok", result: {
      content: expect.stringContaining("resolved first"), conflicts: [],
    } });
    expect(await fixture.file()).not.toContain("<<<<<<<");
    expect(retry.result.entry.refused).toBeNull();
    expect(retry.result.entry.base.version).not.toBe(fixture.entry.base.version);
  });

  it.each(["missing-end", "instruction", "checkout"] as const)("holds prose with %s markers until repaired", async shape => {
    const fixture = await createMarkerFixture();
    fixtures.push(fixture);
    const content = shape === "missing-end" ? fixture.content.replace(/^>>>>>>>[^\n]*\n?/mu, "")
      : shape === "instruction" ? `${RESOLVE_BY_HAND_LINE}\nresolved text\n`
        : fixture.content.replace(/\[arc-conflict: .*\]/u, "[arc-conflict: checkout]");
    const entry = shape === "checkout" ? { ...fixture.entry, markers: { length: 7, sets: [{ shows: "checkout" as const }] } } : fixture.entry;
    await fixture.edit(content);
    const result = await writeBackFile(fixture.context, fixture.index, { ...fixture.request, entry });
    expect(result.result).toMatchObject({ answer: "refused", entry: { pending: true }, mark: { remedy: { text: expect.any(String) } } });
    expect(await fixture.file()).toContain(content);
    expect(await fixture.store.read({ reference: entry.reference })).toMatchObject({ status: "ok", result: { version: fixture.record.version } });
    await fixture.edit("resolved text\n");
    const retry = await writeBackFile(fixture.context, result.index, { ...fixture.request, entry: result.result.entry });
    expect(retry.result.answer).toBe("taken-in");
    expect(await fixture.store.read({ reference: entry.reference })).toMatchObject({ status: "ok", result: { content: "resolved text\n" } });
  });

  it("rejects an origin outside the file's index even when the caller supplies its conflict data", async () => {
    const fixture = await createMarkerFixture();
    fixtures.push(fixture);
    const result = parseMarkerContent({ content: fixture.content, markers: { length: 7, sets: [] },
      conflicts: fixture.conflicts, open: fixture.record.conflicts });
    expect(result).toMatchObject({ kind: "held", mark: { reason: expect.stringContaining("marker-origin") } });
  });

  it("keeps an untouched conflict open and sends its stored side in place of the set", async () => {
    const fixture = await createMarkerFixture();
    fixtures.push(fixture);
    await fixture.edit(fixture.content + "an independent note\n");
    expect(await createWriteBackPort(fixture.context)(fixture.request)).toMatchObject({ answer: "taken-in" });
    const read = await fixture.store.read({ reference: fixture.entry.reference });
    expect(read).toMatchObject({ status: "ok", result: { content: "stored side\nan independent note\n",
      conflicts: fixture.record.conflicts } });
    expect(await fixture.file()).toContain(fixture.content);
  });

  it.each(entryCases)("keeps one entry identity when an untouched set carries both versions in $kind", async ({ kind, base }) => {
    const current = base.replace("base first", "stored first");
    const fixture = await createMarkerFixture({ kind, base, current, incoming: base.replace("base first", "incoming first") });
    fixtures.push(fixture);
    const content = fixture.content.replace("base second", "independent second");
    await fixture.edit(content);
    expect(await createWriteBackPort(fixture.context)(fixture.request)).toMatchObject({ answer: "taken-in" });
    const read = await fixture.store.read({ reference: fixture.entry.reference });
    expect(read).toMatchObject({ status: "ok", result: {
      content: current.replace("base second", "independent second"), conflicts: fixture.record.conflicts,
    } });
    if (read.status === "ok") expect(read.result.content.match(/11111111/gu)).toHaveLength(1);
    expect(await fixture.file()).toContain(content);
  });

  it.each(["prose", "entry"] as const)("holds the whole %s file while a side is edited inside standing markers", async shape => {
    const input = entryCases[0];
    if (input === undefined) throw new Error("Entry case missing");
    const fixture = await createMarkerFixture(shape === "prose" ? {} : { ...input,
      current: input.base.replace("base first", "stored first"), incoming: input.base.replace("base first", "incoming first") });
    fixtures.push(fixture);
    const content = shape === "prose" ? fixture.content.replace("stored side", "resolution in progress") + "independent note\n"
      : fixture.content.replace("stored first", "resolution in progress").replace("base second", "independent second");
    await fixture.edit(content);
    const result = await writeBackFile(fixture.context, fixture.index, fixture.request);
    const conflict = fixture.record.conflicts[0];
    if (conflict === undefined) throw new Error("Conflict missing");
    expect(result.result).toMatchObject({ answer: "refused", entry: { pending: true }, mark: {
      reason: expect.stringContaining(formatConflictToken(conflict)), remedy: { text: expect.stringMatching(/finish|restore/iu) },
    } });
    expect(await fixture.file()).toContain(content);
    expect(await fixture.store.read({ reference: fixture.entry.reference })).toMatchObject({ status: "ok", result: {
      content: fixture.record.content, version: fixture.record.version,
    } });
    expect(result.index.entries[fixture.path]).toMatchObject({ pending: true, refused: expect.any(Object) });
    await fixture.edit(content.replace("resolution in progress", shape === "prose" ? "stored side" : "stored first"));
    const retry = await writeBackFile(fixture.context, result.index, { ...fixture.request, entry: result.result.entry });
    expect(retry.result).toMatchObject({ answer: "taken-in", entry: { refused: null } });
    const read = await fixture.store.read({ reference: fixture.entry.reference });
    expect(read).toMatchObject({ status: "ok", result: { content: shape === "prose" ? "stored side\nindependent note\n"
      : input.base.replace("base first", "stored first").replace("base second", "independent second") } });
    if (read.status === "ok") {
      expect(retry.result.entry.base.version).toBe(read.result.version);
      expect(parseStampedFile(await fixture.file()).stamp).toBe(gitBlobId(read.result.content, "sha1"));
    }
  });

  it("closes a conflict in the same write that sends its replacement text", async () => {
    const fixture = await createMarkerFixture();
    fixtures.push(fixture);
    const content = "the resolved text\n";
    await fixture.edit(content);
    const resolutions: RecordReference[] = [];
    const port = createWriteBackPort({ ...fixture.context,
      reportResolution: (resolution: { reference: RecordReference }) => { resolutions.push(resolution.reference); } });
    expect(await port(fixture.request)).toMatchObject({ answer: "taken-in" });
    expect(await fixture.store.read({ reference: fixture.entry.reference })).toMatchObject({ status: "ok", result: { content, conflicts: [] } });
    for (const reference of fixture.record.conflicts) {
      expect(await fixture.store.read({ reference })).toMatchObject({ status: "refused", refusal: { code: "not-found" } });
    }
    expect(resolutions).toEqual(fixture.record.conflicts);
    const history = await fixture.store.history({ reference: fixture.entry.reference });
    if (history.status !== "ok") throw new Error("History unavailable");
    expect(history.result).toHaveLength(4);
  });

  it("resolves the second of two sets with identical writer labels and keeps the first open", async () => {
    const base = "first base\nbridge one\nbridge two\nsecond base\n";
    const current = base.replace("first base", "first stored").replace("second base", "second stored");
    const fixture = await createMarkerFixture({ base, current,
      incoming: base.replace("first base", "first incoming").replace("second base", "second incoming") });
    fixtures.push(fixture);
    const conflicts = [...fixture.conflicts].sort((left, right) => (left.data.location.kind === "hunk" ? left.data.location.start : 0)
      - (right.data.location.kind === "hunk" ? right.data.location.start : 0));
    expect(conflicts).toHaveLength(2);
    const [first, second] = conflicts;
    if (first === undefined || second === undefined || fixture.entry.markers === null) throw new Error("Two marker sets required");
    expect(first.data.current.label).toEqual(second.data.current.label);
    expect(first.data.incoming.label).toEqual(second.data.incoming.label);
    const secondSet = fixture.renderer.render(second.data, { shows: "stored", conflict: second.reference });
    const content = fixture.content.replace(secondSet, "resolved second\n");
    expect(content).not.toBe(fixture.content);
    await fixture.edit(content);
    const entry = { ...fixture.entry, markers: { ...fixture.entry.markers, sets: [
      { shows: "stored" as const, conflict: second.reference }, { shows: "stored" as const, conflict: first.reference },
    ] } };
    const resolutions: RecordReference[] = [];
    expect(await createWriteBackPort({ ...fixture.context,
      reportResolution: resolution => { resolutions.push(resolution.reference); } })({ ...fixture.request, entry }))
      .toMatchObject({ answer: "taken-in" });
    expect(await fixture.store.read({ reference: fixture.entry.reference })).toMatchObject({ status: "ok", result: {
      content: current.replace("second stored", "resolved second"), conflicts: [first.reference],
    } });
    expect(await fixture.store.read({ reference: second.reference })).toMatchObject({ status: "refused", refusal: { code: "not-found" } });
    expect(resolutions).toEqual([second.reference]);
  });

  it("sends replacement text as an ordinary edit when another checkout already closed the conflict", async () => {
    const fixture = await createMarkerFixture();
    fixtures.push(fixture);
    expect(await fixture.store.write({ action: "put", reference: fixture.entry.reference,
      expected: fixture.record.version, content: fixture.record.content, resolves: fixture.record.conflicts,
      provenance: { verb: "save", lifecycleAction: "edit" } })).toMatchObject({ status: "ok" });
    const content = "resolved here after the other checkout\n";
    await fixture.edit(content);
    const resolutions: RecordReference[] = [];
    expect(await createWriteBackPort({ ...fixture.context,
      reportResolution: resolution => { resolutions.push(resolution.reference); } })(fixture.request))
      .toMatchObject({ answer: "taken-in" });
    expect(await fixture.store.read({ reference: fixture.entry.reference })).toMatchObject({ status: "ok", result: { content, conflicts: [] } });
    expect(resolutions).toEqual([]);
  });

  it("uses retained conflict sides for standing markers after another checkout closes the conflict", async () => {
    const fixture = await createMarkerFixture();
    fixtures.push(fixture);
    expect(await fixture.store.write({ action: "put", reference: fixture.entry.reference,
      expected: fixture.record.version, content: fixture.record.content, resolves: fixture.record.conflicts,
      provenance: { verb: "save", lifecycleAction: "edit" } })).toMatchObject({ status: "ok" });
    await fixture.edit(fixture.content + "independent note\n");
    const resolutions: RecordReference[] = [];
    expect(await createWriteBackPort({ ...fixture.context,
      reportResolution: resolution => { resolutions.push(resolution.reference); } })(fixture.request))
      .toMatchObject({ answer: "taken-in" });
    expect(await fixture.store.read({ reference: fixture.entry.reference })).toMatchObject({ status: "ok", result: {
      content: "stored side\nindependent note\n", conflicts: [],
    } });
    expect(resolutions).toEqual([]);
  });
});
