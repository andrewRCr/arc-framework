/** Checkout merges preserve edits whose selected base cannot be sent to the store. */
import { afterEach, describe, expect, it } from "vitest";
import { createWriteBackFixture } from "../../../helpers/store/projection/write-back-fixture.js";
import { createReferenceFixture } from "../../../helpers/store/reference-fixture.js";
import { makeMetaFixture } from "../../../helpers/meta-fixture.js";
import { META_REGISTRATION } from "../../../../src/lib/store/kinds/meta/registration.js";
import { writeBackFile } from "../../../../src/lib/store/projection/read-back.js";
import { parseStampedFile } from "../../../../src/lib/store/projection/stamp.js";
import { readTakenInCopy } from "../../../../src/lib/store/projection/taken-in.js";
import { gitBlobId } from "../../../../src/lib/store/projection/blob-id.js";
import { readStat } from "../../../../src/lib/store/projection/change-detection.js";
import { join } from "node:path";
import { writeFile } from "node:fs/promises";
import { createCheckoutFixture } from "../../../helpers/store/projection/checkout-fixture.js";
import { prepareWriteBack } from "../../../../src/lib/store/projection/write-back.js";
import { splitEntryList } from "../../../../src/lib/store/concurrency/entries.js";
import { ENTRY_CONFIGS } from "../../../../src/lib/store/kinds/entry-configs.js";
import { createMarkerFixture } from "../../../helpers/store/projection/marker-fixture.js";
import { formatConflictToken } from "../../../../src/lib/status/conflict-token.js";
import { TASK_LIST_REGISTRATION } from "../../../../src/lib/store/kinds/task-list/registration.js";
import { writeMetaPause } from "../../../../src/lib/store/kinds/meta/writers.js";
import { SlugSchema } from "../../../../src/lib/kernel/index.js";
import { TASK_RULE_CONTENT } from "../../../helpers/store/task-rule-input.js";

const fixtures: { dispose: () => Promise<void> }[] = [];
afterEach(async () => { await Promise.all(fixtures.splice(0).map(fixture => fixture.dispose())); });

describe("checkout merges", () => {
  it("merges a task-list hand edit over a newer verb write instead of sending its stale version", async () => {
    const base = TASK_RULE_CONTENT + "\nWorking note.\n";
    const fixture = await createWriteBackFixture({ kind: "work-item/task-list", content: base,
      fixture: createReferenceFixture({}, { "work-item/meta": { parser: META_REGISTRATION.parser }, "work-item/task-list": { parser: TASK_LIST_REGISTRATION.parser } }) });
    fixtures.push(fixture);
    const current = base.replace("Working note.", "Stored note.");
    const remote = await fixture.store.write({ action: "put", reference: fixture.entry.reference,
      expected: fixture.entry.base.version, content: current, provenance: { verb: "edit", lifecycleAction: "edit" } });
    if (remote.status !== "ok") throw new Error("Task-list seed refused");
    await fixture.edit(base.replace("Working note.", "Hand note."));
    const held = await writeBackFile(fixture.context, fixture.index, fixture.request);
    expect(held.result.answer).toBe("clashed");
    const drawn = parseStampedFile(await fixture.file());
    expect(drawn.content).toContain("Stored note.\n=======\nHand note.\n>>>>>>>");
    expect(await fixture.store.read({ reference: fixture.entry.reference })).toMatchObject({ status: "ok", result: {
      content: current, version: remote.result.version, conflicts: [],
    } });
    const resolved = current.replace("Stored note.", "Resolved note.");
    await fixture.edit(resolved, drawn.stamp ?? undefined);
    expect((await writeBackFile(fixture.context, held.index, { ...fixture.request, entry: held.result.entry })).result.answer).toBe("taken-in");
    expect(await fixture.store.read({ reference: fixture.entry.reference })).toMatchObject({ status: "ok", result: { content: resolved, conflicts: [] } });
  });

  it("keeps a malformed entry and a separate checkout clash undrawn, reporting unshown conflicts until repair", async () => {
    const base = "# Inbox\n\n## Errand\n\n### [ ] **First**\n\n- _Id:_ `11111111`\n\nbase first\n\n"
      + "### [ ] **Second**\n\n- _Id:_ `22222222`\n\nbase second\n";
    const fixture = await createMarkerFixture({ kind: "personal/inbox", base, current: base.replace("base first", "stored first"),
      incoming: base.replace("base first", "incoming first") });
    fixtures.push(fixture);
    const closed = await fixture.store.write({ action: "put", reference: fixture.entry.reference, expected: fixture.record.version,
      content: fixture.record.content, resolves: fixture.record.conflicts, provenance: { verb: "save", lifecycleAction: "edit" } });
    if (closed.status !== "ok" || closed.result.version === undefined) throw new Error("Initial resolution refused");
    expect(await fixture.store.write({ action: "put", reference: fixture.entry.reference, expected: closed.result.version,
      content: fixture.record.content.replace("stored first", "newer first"), provenance: { verb: "edit", lifecycleAction: "edit" } }))
      .toMatchObject({ status: "ok" });
    const broken = fixture.content.replace(/^>>>>>>>[^\n]*\n?/mu, "").replace("base second", "first local second");
    await fixture.edit(broken);
    const first = await writeBackFile(fixture.context, fixture.index, fixture.request);
    expect(first.result).toMatchObject({ answer: "refused", entry: { persisted: { takenIn: { kind: "copy" } } } });
    const landed = await fixture.store.read({ reference: fixture.entry.reference });
    if (landed.status !== "ok") throw new Error("Partial landing missing");
    for (const body of ["remote second", "other remote second"]) {
      expect(await fixture.store.write({ action: "put", reference: fixture.entry.reference, expected: landed.result.version,
        content: landed.result.content.replace("first local second", body), provenance: { verb: "edit", lifecycleAction: "edit" } }))
        .toMatchObject({ status: "ok" });
    }
    const before = await fixture.store.read({ reference: fixture.entry.reference });
    if (before.status !== "ok" || before.result.conflicts.length !== 1) throw new Error("Unshown conflict missing");
    await fixture.edit(broken.replace("first local second", "second local second"));
    const bytes = await fixture.file();
    const held = await writeBackFile(fixture.context, first.index, { ...fixture.request, entry: first.result.entry });
    expect(held.result.answer).toBe("refused");
    expect(await fixture.file()).toBe(bytes);
    expect(await fixture.store.read({ reference: fixture.entry.reference })).toEqual(before);
    expect(held.result.entry.unshown).toEqual(before.result.conflicts);
    expect(fixture.reports.some(report => report.mark.reason.includes("checkout-conflict"))).toBe(true);
    for (const reference of before.result.conflicts) expect(fixture.reports).toContainEqual(expect.objectContaining({ mark: {
      reason: expect.stringContaining(formatConflictToken(reference)), remedy: held.result.entry.refused?.remedy,
    } }));
    expect(await fixture.store.write({ action: "put", reference: fixture.entry.reference, expected: before.result.version,
      content: before.result.content, resolves: before.result.conflicts, provenance: { verb: "save", lifecycleAction: "edit" } }))
      .toMatchObject({ status: "ok" });
    await fixture.edit(before.result.content.replace("remote second", "second local second"));
    const drawing = await writeBackFile(fixture.context, held.index, { ...fixture.request, entry: held.result.entry });
    expect(drawing.result.answer).toBe("clashed");
    const drawn = parseStampedFile(await fixture.file());
    expect(drawn.content).toContain("remote second\n=======\nsecond local second\n>>>>>>>");
    expect(drawing.result.entry.refused).toBeNull();
    const resolved = before.result.content.replace("remote second", "resolved second");
    await fixture.edit(resolved, drawn.stamp ?? undefined);
    const sent = await writeBackFile(fixture.context, drawing.index, { ...fixture.request, entry: drawing.result.entry });
    expect(sent.result.answer).toBe("taken-in");
    expect(await fixture.store.read({ reference: fixture.entry.reference })).toMatchObject({ status: "ok", result: { content: resolved, conflicts: [] } });
  });

  it.each([false, true])("draws the actual clashing side's exact blank-line count (blank: %s)", async blank => {
    const fixture = await createCheckoutFixture();
    fixtures.push(fixture);
    const current = fixture.record.content.replace("first edit\n", blank ? "\n" : "");
    const remote = await fixture.store.write({ action: "put", reference: fixture.entry.reference, expected: fixture.record.version,
      content: current, provenance: { verb: "edit", lifecycleAction: "edit" } });
    if (remote.status !== "ok") throw new Error("Blank side seed refused");
    await fixture.edit(fixture.incoming.replace("first edit", "next edit"));
    const result = await writeBackFile(fixture.context, fixture.index, fixture.request);
    expect(result.result.answer).toBe("clashed");
    const drawn = parseStampedFile(await fixture.file());
    expect(/\[arc-conflict: checkout\]\n([\s\S]*?)^=======\n/mu.exec(drawn.content)?.[1]).toBe(blank ? "\n" : "");
    expect(drawn.content).toContain("=======\nnext edit\n>>>>>>>");
    expect(await fixture.store.read({ reference: fixture.entry.reference })).toMatchObject({ status: "ok", result: {
      content: current, version: remote.result.version, conflicts: [],
    } });
    await fixture.edit("opening\nresolved edit\nclosing\nremote note\n", drawn.stamp ?? undefined);
    expect((await writeBackFile(fixture.context, result.index, { ...fixture.request, entry: result.result.entry })).result.answer).toBe("taken-in");
  });

  it("stamps the same new entry identity on repeated preparation of the same checkout merge", async () => {
    const base = "# Inbox\n\n## Errand\n\n### [ ] **First**\n\n- _Id:_ `11111111`\n\nbody\n\n---\nfooter one\nfooter two\nfooter three\n";
    const fixture = await createCheckoutFixture({ kind: "personal/inbox", base,
      current: base.replace("footer one", "remote footer"), incoming: base.replace("footer three", "local footer") });
    fixtures.push(fixture);
    await fixture.edit(fixture.incoming.replace("---\n", "### [ ] **Second**\n\nnew body\n\n---\n"));
    const first = await prepareWriteBack(fixture.context, fixture.request);
    const second = await prepareWriteBack(fixture.context, fixture.request);
    expect(first.kind).toBe("ready");
    expect(second.kind).toBe("ready");
    if (first.kind !== "ready" || second.kind !== "ready") throw new Error("Merge not ready");
    expect(second.write.content).toBe(first.write.content);
    const entry = splitEntryList(first.write.content, ENTRY_CONFIGS["personal/inbox"]).parts
      .find(part => part.kind === "entry" && part.bytes.includes("**Second**"));
    expect(entry?.kind === "entry" ? entry.id : undefined).toMatch(/^[0-9a-f]{8}$/u);
    const result = await writeBackFile(fixture.context, fixture.index, fixture.request);
    expect(result.result.answer).toBe("taken-in");
    expect(await fixture.store.read({ reference: fixture.entry.reference })).toMatchObject({ status: "ok", result: { content: first.write.content } });
  });

  it.each(["entry", "surrounding prose"] as const)("draws the %s clash through the line merge without dropping either side", async shape => {
    const base = "# Inbox\n\n## Errand\nBefore\n### [ ] **First**\n\n- _Id:_ `11111111`\n\nbase body\n\n<!-- After -->\n"
      + "---\nfooter one\nfooter two\nfooter three\n";
    const fixture = await createCheckoutFixture({ kind: "personal/inbox", base,
      current: base.replace("footer one", "remote footer"), incoming: base.replace("footer three", "local footer") });
    fixtures.push(fixture);
    const current = shape === "entry" ? fixture.record.content.replace("base body", "stored body")
      : fixture.record.content.replace("Before", "Stored before").replace("<!-- After -->", "<!-- Stored after -->");
    const incoming = shape === "entry" ? fixture.incoming.replace("base body", "incoming body")
      : fixture.incoming.replace("Before", "Incoming before").replace("<!-- After -->", "<!-- Incoming after -->");
    const remote = await fixture.store.write({ action: "put", reference: fixture.entry.reference, expected: fixture.record.version,
      content: current, provenance: { verb: "edit", lifecycleAction: "edit" } });
    if (remote.status !== "ok") throw new Error("Entry seed refused");
    await fixture.edit(incoming);
    const result = await writeBackFile(fixture.context, fixture.index, fixture.request);
    expect(result.result.answer).toBe("clashed");
    const drawn = parseStampedFile(await fixture.file());
    expect(drawn.content).toContain("<<<<<<<");
    if (shape === "entry") expect(drawn.content).toContain("stored body\n=======\nincoming body\n>>>>>>>");
    else {
      for (const text of ["Stored before", "Incoming before", "<!-- Stored after -->", "<!-- Incoming after -->"]) expect(drawn.content).toContain(text);
      expect(drawn.content).toContain("base body");
    }
    expect(drawn.content.match(/11111111/gu)).toHaveLength(1);
    expect(await fixture.store.read({ reference: fixture.entry.reference })).toMatchObject({ status: "ok", result: {
      content: current, version: remote.result.version, conflicts: [],
    } });
    const resolved = current.replace("stored body", "resolved body").replace("Stored before", "Resolved before");
    await fixture.edit(resolved, drawn.stamp ?? undefined);
    expect((await writeBackFile(fixture.context, result.index, { ...fixture.request, entry: result.result.entry })).result.answer).toBe("taken-in");
    expect(await fixture.store.read({ reference: fixture.entry.reference })).toMatchObject({ status: "ok", result: { content: resolved, conflicts: [] } });
  });

  it("draws an overlapping hand edit to a meta over a verb's newer write and sends only the later resolution", async () => {
    const base = makeMetaFixture("work-item-one", { owner: "andrew", workClass: "Light", priority: "P1",
      currentWorkflow: "process-task-loop", design: ["spec-work-item-one.md"] }) + "\nBase note.\n";
    const fixture = await createWriteBackFixture({ kind: "work-item/meta", content: base, identity: "andrew",
      fixture: createReferenceFixture({}, { "work-item/meta": { parser: META_REGISTRATION.parser } }) });
    fixtures.push(fixture);
    const current = base.replace("Base note.", "Stored note.");
    const remote = await fixture.store.write({ action: "put", reference: fixture.entry.reference,
      expected: fixture.entry.base.version, content: current, placement: { kind: "active" }, provenance: { verb: "edit", lifecycleAction: "edit" } });
    if (remote.status !== "ok") throw new Error("Meta seed refused");
    await fixture.edit(base.replace("Base note.", "Hand note."));
    const result = await writeBackFile(fixture.context, fixture.index, fixture.request);
    expect(result.result.answer).toBe("clashed");
    const drawn = parseStampedFile(await fixture.file());
    expect(drawn.content).toContain("Stored note.\n=======\nHand note.\n>>>>>>>");
    expect(result.result.entry.pending).toBe(true);
    expect(await fixture.store.read({ reference: fixture.entry.reference })).toMatchObject({ status: "ok", result: {
      content: current, version: remote.result.version, conflicts: [],
    } });
    const resolved = current.replace("Stored note.", "Resolved note.");
    await fixture.edit(resolved, drawn.stamp ?? undefined);
    expect((await writeBackFile(fixture.context, result.index, { ...fixture.request, entry: result.result.entry })).result.answer).toBe("taken-in");
    expect(await fixture.store.read({ reference: fixture.entry.reference })).toMatchObject({ status: "ok", result: { content: resolved, conflicts: [] } });
  });

  it("draws every checkout set at one escalated length and keeps the full marker mapping", async () => {
    const base = "first base\nbridge one\nbridge two\nsecond base\nfooter one\nfooter two\nfooter three\n";
    const fixture = await createCheckoutFixture({ base, current: base.replace("footer one", "remote footer"),
      incoming: base.replace("footer three", "local footer") });
    fixtures.push(fixture);
    const current = fixture.record.content.replace("first base", "Stored heading\n=======\nstored first").replace("second base", "stored second");
    expect(await fixture.store.write({ action: "put", reference: fixture.entry.reference, expected: fixture.record.version,
      content: current, provenance: { verb: "edit", lifecycleAction: "edit" } })).toMatchObject({ status: "ok" });
    await fixture.edit(fixture.incoming.replace("first base", "incoming first").replace("second base", "incoming second"));
    const result = await writeBackFile(fixture.context, fixture.index, fixture.request);
    expect(result.result.answer).toBe("clashed");
    const drawn = parseStampedFile(await fixture.file());
    expect(drawn.content.match(/^<<<<<<<<<<< /gmu)).toHaveLength(2);
    expect(drawn.content.match(/^===========\n/gmu)).toHaveLength(2);
    expect(drawn.content).toContain("Stored heading\n=======\nstored first");
    expect(drawn.content).toContain("incoming first");
    expect(drawn.content).toContain("incoming second");
    expect(result.result.entry.markers).toEqual({ length: 11, sets: [{ shows: "checkout" }, { shows: "checkout" }] });
    const before = await fixture.file();
    const held = await writeBackFile(fixture.context, result.index, { ...fixture.request, entry: result.result.entry });
    expect(held.result.answer).toBe("refused");
    expect(await fixture.file()).toBe(before);
    const resolved = fixture.record.content.replace("first base", "resolved first").replace("second base", "resolved second");
    await fixture.edit(resolved, drawn.stamp ?? undefined);
    expect((await writeBackFile(fixture.context, held.index, { ...fixture.request, entry: held.result.entry })).result.answer).toBe("taken-in");
    expect(await fixture.store.read({ reference: fixture.entry.reference })).toMatchObject({ status: "ok", result: { content: resolved, conflicts: [] } });
  });

  it("sends a clean line merge when two edits to one entry clash under whole-entry merging", async () => {
    const base = "# Inbox\n\n## Errand\n\n### [ ] **First**\n\n- _Id:_ `11111111`\n\nbase left\nbridge\nbase right\n\n"
      + "---\nfooter one\nfooter two\nfooter three\n";
    const fixture = await createCheckoutFixture({ kind: "personal/inbox", base,
      current: base.replace("footer one", "remote footer"), incoming: base.replace("footer three", "local footer") });
    fixtures.push(fixture);
    const current = fixture.record.content.replace("base left", "remote left");
    expect(await fixture.store.write({ action: "put", reference: fixture.entry.reference, expected: fixture.record.version,
      content: current, provenance: { verb: "edit", lifecycleAction: "edit" } })).toMatchObject({ status: "ok" });
    await fixture.edit(fixture.incoming.replace("base right", "local right"));
    const result = await writeBackFile(fixture.context, fixture.index, fixture.request);
    expect(result.result.answer).toBe("taken-in");
    expect(await fixture.store.read({ reference: fixture.entry.reference })).toMatchObject({ status: "ok", result: {
      content: current.replace("base right", "local right"), conflicts: [],
    } });
    expect(parseStampedFile(await fixture.file()).content).toBe(current.replace("base right", "local right"));
  });

  it("merges content sharing no candidate line from an empty base and keeps its clash only in the file", async () => {
    const fixture = await createWriteBackFixture();
    fixtures.push(fixture);
    const original = await fixture.store.read({ reference: fixture.entry.reference });
    if (original.status !== "ok") throw new Error("Original missing");
    await writeFile(join(fixture.checkout, fixture.path), "Entirely new content.\n");
    const result = await writeBackFile(fixture.context, fixture.index, fixture.request);
    expect(result.result.answer).toBe("clashed");
    expect(parseStampedFile(await fixture.file()).content).toContain("Entirely new content.\n>>>>>>>");
    expect(parseStampedFile(await fixture.file()).content).toContain("opening\nbase\nclosing\n=======");
    expect(await fixture.store.read({ reference: fixture.entry.reference })).toEqual(original);
    await fixture.edit("A hand resolution.\n");
    const retry = await writeBackFile(fixture.context, result.index, { ...fixture.request, entry: result.result.entry });
    expect(retry.result.answer).toBe("taken-in");
    expect(await fixture.store.read({ reference: fixture.entry.reference })).toMatchObject({ status: "ok", result: {
      content: "A hand resolution.\n", conflicts: [],
    } });
  });

  it("draws a kept-copy clash under the current stamp without storing it, then sends a hand resolution", async () => {
    const fixture = await createWriteBackFixture();
    fixtures.push(fixture);
    expect(await fixture.store.write({ action: "put", reference: fixture.entry.reference, expected: fixture.entry.base.version,
      content: "opening\nbase\nclosing\nremote note\n", provenance: { verb: "edit", lifecycleAction: "edit" } })).toMatchObject({ status: "ok" });
    await fixture.edit("opening\nfirst edit\nclosing\n");
    const first = await writeBackFile(fixture.context, fixture.index, fixture.request);
    expect(first.result.answer).toBe("taken-in");
    const before = await fixture.store.read({ reference: fixture.entry.reference });
    if (before.status !== "ok") throw new Error("First landing unavailable");
    const current = before.result.content.replace("first edit", "remote edit");
    const remote = await fixture.store.write({ action: "put", reference: fixture.entry.reference, expected: before.result.version,
      content: current, provenance: { verb: "edit", lifecycleAction: "edit" } });
    if (remote.status !== "ok") throw new Error("Remote edit refused");
    await fixture.edit("opening\nsecond edit\nclosing\n");
    const stat = await readStat(join(fixture.checkout, fixture.path));
    if (stat === null) throw new Error("File missing");
    const context = { ...fixture.context, actor: "test-user@checkout-machine", now: () => new Date("2026-11-04T12:00:00Z") };
    const result = await writeBackFile(context, first.index, { ...fixture.request, entry: first.result.entry });
    expect(result.result.answer).toBe("clashed");
    const drawn = parseStampedFile(await fixture.file());
    expect(drawn.stamp).toBe(gitBlobId(current, "sha1"));
    expect(drawn.content).toContain(`<<<<<<< ${remote.result.version} @ 2026-11-04T12:00:00.000Z [arc-conflict: checkout]\nremote edit\n`);
    expect(drawn.content).toContain("=======\nsecond edit\n>>>>>>> test-user@checkout-machine @ "
      + new Date(Number(stat.mtimeNs / 1_000_000n)).toISOString());
    expect(drawn.content).toContain("closing\nremote note\n");
    expect(result.result.entry).toMatchObject({ pending: true, markers: { length: 7, sets: [{ shows: "checkout" }] } });
    expect(await fixture.store.read({ reference: fixture.entry.reference })).toMatchObject({ status: "ok", result: {
      content: current, version: remote.result.version, conflicts: [],
    } });
    await fixture.edit("opening\nresolved edit\nclosing\nremote note\n", drawn.stamp ?? undefined);
    const retry = await writeBackFile(context, result.index, { ...fixture.request, entry: result.result.entry });
    expect(retry.result.answer).toBe("taken-in");
    expect(await fixture.store.read({ reference: fixture.entry.reference })).toMatchObject({ status: "ok", result: {
      content: "opening\nresolved edit\nclosing\nremote note\n", conflicts: [],
    } });
  });

  it("keeps a verb's newer state while sending a hand edit, then merges the next stale-buffer save from its take-in", async () => {
    const base = makeMetaFixture("work-item-one", { owner: "andrew", workClass: "Light", priority: "P1",
      currentWorkflow: "process-task-loop", design: ["spec-work-item-one.md"] });
    const fixture = await createWriteBackFixture({ kind: "work-item/meta", content: base, identity: "andrew",
      fixture: createReferenceFixture({}, { "work-item/meta": { parser: META_REGISTRATION.parser } }) });
    fixtures.push(fixture);
    const current = writeMetaPause(base, { pausedBy: SlugSchema.parse("andrew"), since: "2026-11-01T12:00:00Z",
      reason: "Waiting for review", waitsOn: null, resumeNotes: null, open: false });
    expect(current).not.toBe(base);
    expect(await fixture.store.write({ action: "put", reference: fixture.entry.reference,
      expected: fixture.entry.base.version, content: current, placement: { kind: "active" }, provenance: { verb: "pause", lifecycleAction: "pause" } }))
      .toMatchObject({ status: "ok" });
    const first = base + "\nA hand-written note.\n";
    await fixture.edit(first);
    const result = await writeBackFile(fixture.context, fixture.index, fixture.request);
    expect(result.result.answer).toBe("taken-in");
    expect(await fixture.store.read({ reference: fixture.entry.reference })).toMatchObject({ status: "ok", result: {
      content: current + "\nA hand-written note.\n", conflicts: [],
    } });
    expect(parseStampedFile(await fixture.file()).content).toBe(current + "\nA hand-written note.\n");
    const kept = result.result.entry.persisted?.takenIn;
    expect(kept?.kind).toBe("copy");
    if (kept?.kind !== "copy") throw new Error("Merged input copy missing");
    expect(await readTakenInCopy(fixture.location, kept.name)).toBe(first);
    await fixture.edit(first + "A second note.\n");
    const retry = await writeBackFile(fixture.context, result.index, { ...fixture.request, entry: result.result.entry });
    expect(retry.result.answer).toBe("taken-in");
    expect(await fixture.store.read({ reference: fixture.entry.reference })).toMatchObject({ status: "ok", result: {
      content: current + "\nA hand-written note.\nA second note.\n", conflicts: [],
    } });
  });
});
