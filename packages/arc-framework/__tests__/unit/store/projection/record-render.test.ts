/** Projected conflict notices preserve addresses and remedies without guessing placement. */
import { afterEach, describe, expect, it } from "vitest";
import { createStoredConflictFixture } from "../../../helpers/store/projection/stored-conflict-fixture.js";
import { createRefusingStore } from "../../../helpers/store/projection/refusing-store.js";
import { StoreRefusalSchema } from "../../../../src/lib/store/refusal.js";
import { createReferenceFixture } from "../../../helpers/store/reference-fixture.js";
import { seed, success, update } from "../../../helpers/store/suite-tools.js";
import { createHistoryMemo } from "../../../../src/lib/store/projection/base-recovery.js";
import { ConflictRecordSchema } from "../../../../src/lib/store/conflict.js";
import { createMarkerRenderer } from "../../../../src/lib/store/projection/marker-render.js";
import { scanMarkerSets } from "../../../../src/lib/store/projection/marker-scan.js";
import { renderRecordContent } from "../../../../src/lib/store/projection/record-render.js";
import { formatConflictToken, parseConflictToken } from "../../../../src/lib/status/conflict-token.js";

const fixtures: { dispose(): Promise<void> }[] = [];
afterEach(async () => { await Promise.all(fixtures.splice(0).map(fixture => fixture.dispose())); });

describe("record conflict rendering", () => {
  it("reports failed placement by token with its incoming label and corrective commands", async () => {
    const fixture = await createStoredConflictFixture({ base: "left\nbase\nright\n", current: "left\nstored\nright\n", incoming: "left\nincoming\nright\n" });
    fixtures.push(fixture);
    const conflict = fixture.conflicts[0];
    if (conflict === undefined) throw new Error("Conflict missing");
    const content = fixture.record.content.replace("left", "later left");
    const rendered = await renderRecordContent({ store: fixture.store, memo: fixture.context.memo }, { record: fixture.record, content, stamped: true });
    expect(rendered.status).toBe("ok");
    if (rendered.status !== "ok") throw new Error("Render refused");
    const token = formatConflictToken(conflict.reference);
    expect(rendered.result.notices).toHaveLength(1);
    expect(rendered.result.notices[0]).toContain(token);
    expect(rendered.result.notices[0]).toContain(conflict.data.incoming.label.actor);
    expect(rendered.result.notices[0]).toContain(conflict.data.incoming.label.time);
    expect(rendered.result.notices[0]).toContain(`arc status --conflicts ${token}`);
    expect(rendered.result.notices[0]).toContain(`arc save --resolve ${token}`);
    expect(parseConflictToken(token)).toMatchObject({ kind: conflict.reference.kind, key: conflict.reference.key });
    expect(rendered.result).toMatchObject({ content, state: { markers: null, notices: [conflict.reference], unshown: [] } });
  });
  it("draws placeable conflicts in a stampless file and records the others without notices", async () => {
    const base = "left first\nbase first\nright first\n\nspare\n\nleft second\nbase second\nright second\n";
    const fixture = await createStoredConflictFixture({ base, current: base.replace("base first", "stored first").replace("base second", "stored second"),
      incoming: base.replace("base first", "incoming first").replace("base second", "incoming second") });
    fixtures.push(fixture);
    const content = fixture.record.content.replace("left first", "later left first");
    const rendered = await renderRecordContent({ store: fixture.store, memo: fixture.context.memo }, { record: fixture.record, content, stamped: false });
    expect(rendered.status).toBe("ok");
    if (rendered.status !== "ok") throw new Error("Render refused");
    expect(rendered.result.notices).toEqual([]);
    expect(rendered.result.state.notices).toEqual([]);
    const first = fixture.conflicts.find(conflict => conflict.data.current.content === "stored first");
    const second = fixture.conflicts.find(conflict => conflict.data.current.content === "stored second");
    if (first === undefined || second === undefined) throw new Error("Two hunk conflicts missing");
    expect(rendered.result.state.unshown).toEqual([first.reference]);
    expect(rendered.result.state.markers?.sets).toEqual([{ shows: "stored", conflict: second.reference }]);
    expect(scanMarkerSets(rendered.result.content, rendered.result.state.markers?.length ?? 0)).toHaveLength(1);
    expect(rendered.result.content).toContain("incoming second");
    expect(rendered.result.content).not.toContain("incoming first");
  });

  it("shows a whole-record sync conflict as a notice only while it remains open", async () => {
    const fixture = createReferenceFixture();
    const remote = fixture.remote(true);
    if (remote === undefined) throw new Error("Remote unavailable");
    const base = await seed(fixture, fixture.reference("work-item/meta"));
    success(await fixture.store.push());
    const remoteBase = success(await remote.read({ reference: base.reference }));
    success(await remote.write(update(fixture, remoteBase, fixture.content(base.reference, "changed"))));
    success(await fixture.store.write(update(fixture, base, fixture.content(base.reference, "changed-again"))));
    success(await fixture.store.push());
    const record = success(await fixture.store.read({ reference: base.reference }));
    const reference = record.conflicts[0];
    if (reference === undefined) throw new Error("Whole conflict missing");
    const data = ConflictRecordSchema.parse(JSON.parse(success(await fixture.store.read({ reference })).content));
    expect(data.location.kind).toBe("record");
    const context = { store: fixture.store, memo: createHistoryMemo(fixture.store) };
    const rendered = success(await renderRecordContent(context, { record, content: record.content, stamped: true }));
    expect(rendered.content).toBe(record.content);
    expect(rendered.state.markers).toBeNull();
    expect(rendered.state.notices).toEqual([reference]);
    expect(rendered.notices[0]).toContain(formatConflictToken(reference));
    // Omitting a prior notice from the content never resolves its stored conflict.
    expect(success(await renderRecordContent(context, { record, content: record.content, stamped: true })).notices).toEqual(rendered.notices);
    success(await fixture.store.write({ ...update(fixture, record, record.content), resolves: record.conflicts }));
    const repaired = success(await fixture.store.read({ reference: base.reference }));
    expect(success(await renderRecordContent(context, { record: repaired, content: repaired.content, stamped: true })).notices).toEqual([]);
  });

  it("shows an entry merge's prose hunk spanning an entry as a notice", async () => {
    const entry = "### [ ] **First**\n\n- _Id:_ `11111111`\n\nbody\n\n";
    const base = `# Inbox\n\n## Errand\nBefore\n${entry}<!-- After -->\n`;
    const fixture = await createStoredConflictFixture({ kind: "personal/inbox", base,
      current: base.replace("Before", "Current before"), incoming: base.replace("<!-- After -->", "<!-- Incoming after -->") });
    fixtures.push(fixture);
    expect(fixture.conflicts.map(conflict => conflict.data.location.kind)).toEqual(["hunk"]);
    const rendered = success(await renderRecordContent({ store: fixture.store, memo: fixture.context.memo },
      { record: fixture.record, content: fixture.record.content, stamped: true }));
    expect(rendered.state.markers).toBeNull();
    expect(rendered.state.notices).toEqual(fixture.record.conflicts);
    expect(rendered.notices[0]).toContain("arc save --resolve");
    expect(rendered.content).toBe(fixture.record.content);
  });

  it("retains held stored and checkout sets while drawing another open conflict", async () => {
    const base = "left first\nbase first\nright first\n\nspare\n\nleft second\nbase second\nright second\n";
    const fixture = await createStoredConflictFixture({ base, current: base.replace("base first", "stored first").replace("base second", "stored second"),
      incoming: base.replace("base first", "incoming first").replace("base second", "incoming second") });
    fixtures.push(fixture);
    const first = fixture.conflicts.find(conflict => conflict.data.current.content === "stored first");
    const second = fixture.conflicts.find(conflict => conflict.data.current.content === "stored second");
    if (first === undefined || second === undefined) throw new Error("Two conflicts missing");
    const renderer = createMarkerRenderer([fixture.record.content]);
    const content = fixture.record.content.replace("stored first\n", renderer.render(first.data, { shows: "stored", conflict: first.reference }))
      + renderer.render(first.data, { shows: "checkout" });
    const rendered = success(await renderRecordContent({ store: fixture.store, memo: fixture.context.memo },
      { record: fixture.record, content, markerLength: renderer.length, stamped: true }));
    expect(rendered.state.markers?.sets).toEqual([{ shows: "stored", conflict: first.reference },
      { shows: "stored", conflict: second.reference }, { shows: "checkout" }]);
    expect(scanMarkerSets(rendered.content, rendered.state.markers?.length ?? 0)).toHaveLength(3);
    expect(rendered.notices).toEqual([]);
    expect(rendered.content.split(formatConflictToken(first.reference))).toHaveLength(2);
  });

  it("escalates every held and newly drawn set once when a stored side contains marker-like prose", async () => {
    const base = "left first\nbase first\nright first\n\nspare\n\nleft second\nbase second\nright second\n";
    const fixture = await createStoredConflictFixture({ base, current: base.replace("base first", "stored first").replace("base second", "stored second"),
      incoming: base.replace("base first", "incoming first").replace("base second", "incoming second\n=======") });
    fixtures.push(fixture);
    const first = fixture.conflicts.find(conflict => conflict.data.current.content === "stored first");
    if (first === undefined) throw new Error("First conflict missing");
    const renderer = createMarkerRenderer([fixture.record.content]);
    const content = fixture.record.content.replace("stored first\n", renderer.render(first.data, { shows: "stored", conflict: first.reference }))
      + renderer.render(first.data, { shows: "checkout" });
    const context = { store: fixture.store, memo: fixture.context.memo };
    const rendered = success(await renderRecordContent(context, { record: fixture.record, content, markerLength: renderer.length, stamped: true }));
    expect(rendered.state.markers?.length).toBe(11);
    expect(scanMarkerSets(rendered.content, 11)).toHaveLength(3);
    expect(rendered.content.match(/^<!-- arc-resolve-by-hand:/gmu)).toHaveLength(3);
    const again = success(await renderRecordContent(context, { record: fixture.record, content: rendered.content, markerLength: 11, stamped: true }));
    expect(again).toEqual(rendered);
  });

  it.each(["state-unresolvable", "namespace-corrupt"] as const)("notices a hunk whose base history refuses %s and places it after repair", async code => {
    const fixture = await createStoredConflictFixture({ base: "left\nbase\nright\n", current: "left\nstored\nright\n", incoming: "left\nincoming\nright\n" });
    fixtures.push(fixture);
    const boundary = createRefusingStore(fixture.store);
    const common = { code, condition: "History unreadable.", remedy: { text: "Repair history and retry." } };
    boundary.refuse("history", StoreRefusalSchema.parse(code === "state-unresolvable"
      ? { ...common, class: "recoverable", reference: fixture.entry.reference, historyRefs: [] }
      : { ...common, class: "terminal", namespace: "memory" }));
    const render = () => renderRecordContent({ store: boundary.store, memo: createHistoryMemo(boundary.store) },
      { record: fixture.record, content: fixture.record.content, stamped: true });
    const held = success(await render());
    expect(held.state).toMatchObject({ markers: null, notices: fixture.record.conflicts });
    expect(held.notices).toHaveLength(1);
    expect(boundary.calls("pull")).toBe(0);
    boundary.refuse("history", null);
    const repaired = success(await render());
    expect(repaired.state.markers?.sets).toHaveLength(1);
    expect(repaired.notices).toEqual([]);
  });

  it("retains a closed held set's work-item generation while another edit keeps its markers", async () => {
    const fixture = await createStoredConflictFixture({ kind: "work-item/notes", base: "left\nbase\nright\n",
      current: "left\nstored\nright\n", incoming: "left\nincoming\nright\n" });
    fixtures.push(fixture);
    const context = { store: fixture.store, memo: fixture.context.memo };
    const drawn = success(await renderRecordContent(context, { record: fixture.record, content: fixture.record.content, stamped: true }));
    const conflict = fixture.record.conflicts[0];
    if (conflict?.owner.type !== "work-item" || conflict.owner.uid === undefined) throw new Error("Stored work-item generation missing");
    success(await fixture.store.write({ action: "put", reference: fixture.entry.reference, expected: fixture.record.version,
      content: "left\nresolved elsewhere\nright\n", resolves: fixture.record.conflicts, provenance: { verb: "edit", lifecycleAction: "edit" } }));
    const closed = success(await fixture.store.read({ reference: fixture.entry.reference }));
    const kept = success(await renderRecordContent(context, { record: closed, content: drawn.content + "hand note\n",
      markerLength: drawn.state.markers?.length, stamped: true }));
    expect(kept.state.markers?.sets).toEqual([{ shows: "stored", conflict }]);
    expect(kept.notices).toEqual([]);
  });

});
