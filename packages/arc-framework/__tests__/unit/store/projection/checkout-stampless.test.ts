/** Stampless holds draw differences once and retain their identity until a safe send. */
import { afterEach, describe, expect, it, vi } from "vitest";
import { createCheckoutFixture } from "../../../helpers/store/projection/checkout-fixture.js";
import { createWriteBackFixture } from "../../../helpers/store/projection/write-back-fixture.js";
import { writeBackFile } from "../../../../src/lib/store/projection/read-back.js";
import { parseConflictToken } from "../../../../src/lib/status/conflict-token.js";
import { runSecondCheck } from "../../../../src/lib/store/projection/second-check.js";
import { createWriteBackPort } from "../../../../src/lib/store/projection/write-back.js";
import { drawCheckoutDifferences } from "../../../../src/lib/store/projection/checkout-differences.js";

const fixtures: Awaited<ReturnType<typeof createWriteBackFixture>>[] = [];
afterEach(async () => { vi.restoreAllMocks(); await Promise.all(fixtures.splice(0).map(fixture => fixture.dispose())); });

describe("stampless checkout holds", () => {
  it("draws a whole-file hold when only the final newline differs, retaining the file's final-newline choice", async () => {
    const label = { actor: "checkout", time: "2026-11-04T12:00:00Z" };
    expect(drawCheckoutDifferences({ current: "same text\n", incoming: "same text", currentLabel: label, incomingLabel: label }).content)
      .toContain("[arc-conflict: checkout]");
    const fixture = await createWriteBackFixture({ path: ".arc/document.txt", content: "same text" });
    fixtures.push(fixture);
    await fixture.edit("same text\n");
    const first = await createWriteBackPort(fixture.context)(fixture.request);
    expect(first.answer).toBe("taken-in");
    const index = { ...fixture.index, entries: { [fixture.path]: first.entry } };
    await fixture.edit("same text");
    const held = await writeBackFile(fixture.context, index, { ...fixture.request, entry: first.entry });
    expect(held.result.answer).toBe("clashed");
    const content = await fixture.file();
    expect(content.match(/^<<<<<<< /gmu)).toHaveLength(1);
    expect(content).toContain("same text\n=======\nsame text\n>>>>>>>");
    expect(content.endsWith("\n")).toBe(false);
    expect(await fixture.store.read({ reference: fixture.entry.reference })).toMatchObject({ status: "ok", result: { content: "same text\n", conflicts: [] } });
    const finished = await runSecondCheck({ ...fixture.context, checkout: fixture.checkout, index: held.index,
      copies: held.result.entry.copies.map(copy => ({ path: fixture.path, copy: copy.name })), takeIn: createWriteBackPort(fixture.context) });
    const entry = finished.index.entries[fixture.path];
    if (entry?.kind !== "record") throw new Error("Held entry missing");
    await fixture.edit("same text\n");
    expect((await writeBackFile(fixture.context, finished.index, { ...fixture.request, entry })).result.answer).toBe("taken-in");
  });

  it.each(["held", "restaged"] as const)("keeps the proposed hold off a save the drawing guard leaves %s", async mode => {
    const fixture = await createCheckoutFixture({ path: ".arc/document.txt" });
    fixtures.push(fixture);
    await fixture.edit(fixture.incoming);
    const late = mode === "held" ? fixture.incoming.replace("opening", "opening late") : fixture.record.content;
    const read = fixture.store.read.bind(fixture.store);
    vi.spyOn(fixture.store, "read").mockImplementationOnce(async input => {
      const record = await read(input);
      await fixture.edit(late);
      return record;
    });
    const result = await writeBackFile(fixture.context, fixture.index, fixture.request);
    expect(await fixture.file()).toBe(late);
    expect(result.result.entry).toMatchObject({ refused: null, markers: null });
    expect(fixture.reports.map(report => report.mark.reason)).not.toContain("bases-disagree");
    if (mode === "held") {
      expect(result.result.entry.base).toEqual(fixture.entry.base);
      const next = await writeBackFile(fixture.context, result.index, { ...fixture.request, entry: result.result.entry });
      expect(next.result.entry.refused?.reason).toBe("bases-disagree");
      expect(await fixture.file()).toContain("[arc-conflict: checkout]");
      const finished = await runSecondCheck({ ...fixture.context, checkout: fixture.checkout, index: next.index,
        copies: next.result.entry.copies.map(copy => ({ path: fixture.path, copy: copy.name })), takeIn: createWriteBackPort(fixture.context) });
      const entry = finished.index.entries[fixture.path];
      if (entry?.kind !== "record") throw new Error("Held entry missing");
      await fixture.edit(fixture.record.content);
      expect((await writeBackFile(fixture.context, finished.index, { ...fixture.request, entry })).result.answer).toBe("taken-in");
    } else expect(result.result.entry.persisted?.takenIn.kind).toBe("landed");
  });

  it("holds a retained-copy clash even when a stored candidate would draw the identical clash", async () => {
    const fixture = await createCheckoutFixture({ path: ".arc/document.txt" });
    fixtures.push(fixture);
    const current = fixture.record.content.replace("first edit", "stored edit");
    const remote = await fixture.store.write({ action: "put", reference: fixture.entry.reference, expected: fixture.record.version,
      content: current, provenance: { verb: "edit", lifecycleAction: "edit" } });
    if (remote.status !== "ok") throw new Error("Current seed refused");
    await fixture.edit(fixture.record.content.replace("first edit", "incoming edit"));
    const held = await writeBackFile(fixture.context, fixture.index, fixture.request);
    expect(held.result.answer).toBe("clashed");
    expect(held.result.entry.refused?.reason).toBe("bases-disagree");
    expect(await fixture.store.read({ reference: fixture.entry.reference })).toMatchObject({ status: "ok", result: {
      content: current, version: remote.result.version, conflicts: [],
    } });
    const finished = await runSecondCheck({ ...fixture.context, checkout: fixture.checkout, index: held.index,
      copies: held.result.entry.copies.map(copy => ({ path: fixture.path, copy: copy.name })), takeIn: createWriteBackPort(fixture.context) });
    const entry = finished.index.entries[fixture.path];
    if (entry?.kind !== "record") throw new Error("Held entry missing");
    await fixture.edit(current);
    expect((await writeBackFile(fixture.context, finished.index, { ...fixture.request, entry })).result.answer).toBe("taken-in");
  });

  it("distinguishes identical merged text with different clashes and draws every actual difference", async () => {
    const base = "base first\nmiddle one\nmiddle two\nbase last\nbridge one\nbridge two\nfooter\n";
    const fixture = await createWriteBackFixture({ path: ".arc/document.txt", content: base });
    fixtures.push(fixture);
    const intermediate = "unrelated base\nbridge one\nbridge two\nfooter\n";
    await fixture.edit(intermediate);
    const first = await createWriteBackPort(fixture.context)(fixture.request);
    expect(first.answer).toBe("taken-in");
    const version = first.entry.persisted?.takenIn.version;
    if (version === undefined) throw new Error("Intermediate version missing");
    const current = base.replace("base first", "stored first").replace("base last", "stored last");
    const remote = await fixture.store.write({ action: "put", reference: fixture.entry.reference, expected: version,
      content: current, provenance: { verb: "edit", lifecycleAction: "edit" } });
    if (remote.status !== "ok") throw new Error("Current seed refused");
    const incoming = base.replace("base first", "incoming first").replace("base last", "incoming last").replace("footer", "edited footer");
    await fixture.edit(incoming);
    const request = { ...fixture.request, entry: first.entry };
    const held = await writeBackFile(fixture.context, { ...fixture.index, entries: { [fixture.path]: first.entry } }, request);
    expect(held.result.answer).toBe("clashed");
    const content = await fixture.file();
    expect(content.match(/^<<<<<<< /gmu)).toHaveLength(3);
    expect(content).toContain("footer\n=======\nedited footer\n>>>>>>>");
    expect(content).toContain("middle one\nmiddle two\n");
    expect(held.result.entry.refused?.reason).toBe("bases-disagree");
    expect(await fixture.store.read({ reference: fixture.entry.reference })).toMatchObject({ status: "ok", result: {
      content: current, version: remote.result.version, conflicts: [],
    } });
    const finished = await runSecondCheck({ ...fixture.context, checkout: fixture.checkout, index: held.index,
      copies: held.result.entry.copies.map(copy => ({ path: fixture.path, copy: copy.name })), takeIn: createWriteBackPort(fixture.context) });
    const entry = finished.index.entries[fixture.path];
    if (entry?.kind !== "record") throw new Error("Held entry missing");
    await fixture.edit(current);
    expect((await writeBackFile(fixture.context, finished.index, { ...request, entry })).result.answer).toBe("taken-in");
  });

  it("draws differing bases once, holds the person's side undrawn, and clears the hold when the stored side is sent", async () => {
    const fixture = await createCheckoutFixture({ path: ".arc/document.txt" });
    fixtures.push(fixture);
    await fixture.edit(fixture.incoming);
    const held = await writeBackFile(fixture.context, fixture.index, fixture.request);
    expect(held.result.answer).toBe("clashed");
    const content = await fixture.file();
    expect(content).toContain("[arc-conflict: checkout]");
    expect(content).toContain("remote note\n=======\n>>>>>>>");
    expect(held.result.entry).toMatchObject({ pending: true, refused: { reason: "bases-disagree" }, persisted: fixture.entry.persisted });
    const mark = held.result.entry.refused;
    const token = mark?.remedy.argv?.at(-1);
    expect(mark?.remedy.argv?.slice(0, 3)).toEqual(["arc", "save", "--resolve"]);
    if (token === undefined) throw new Error("Hold token missing");
    const parsed = parseConflictToken(token);
    expect(parsed).not.toBeNull();
    if (parsed === null) throw new Error("Hold token malformed");
    expect(await fixture.store.read({ reference: parsed })).toMatchObject({ status: "refused", refusal: { code: "not-found" } });
    expect(await fixture.store.read({ reference: fixture.entry.reference })).toMatchObject({ status: "ok", result: { version: fixture.record.version } });
    const finished = await runSecondCheck({ ...fixture.context, checkout: fixture.checkout, index: held.index,
      copies: held.result.entry.copies.map(copy => ({ path: fixture.path, copy: copy.name })), takeIn: createWriteBackPort(fixture.context) });
    const entry = finished.index.entries[fixture.path];
    if (entry?.kind !== "record") throw new Error("Held entry missing");
    const standing = await writeBackFile(fixture.context, finished.index, { ...fixture.request, entry });
    expect(standing.result).toMatchObject({ answer: "refused", entry: { pending: true, refused: mark } });
    expect(await fixture.file()).toBe(content);
    await fixture.edit(fixture.incoming);
    const still = await writeBackFile(fixture.context, finished.index, { ...fixture.request, entry });
    expect(still.result).toMatchObject({ answer: "refused", entry: { pending: true, refused: mark } });
    expect(await fixture.file()).toBe(fixture.incoming);
    expect(await fixture.store.read({ reference: fixture.entry.reference })).toMatchObject({ status: "ok", result: { version: fixture.record.version } });
    await fixture.edit(fixture.record.content);
    const sent = await writeBackFile(fixture.context, still.index, { ...fixture.request, entry: still.result.entry });
    expect(sent.result.answer).toBe("taken-in");
    expect(sent.result.entry).toMatchObject({ refused: null, markers: null });
    expect(await fixture.file()).toBe(fixture.record.content);
  });
});
