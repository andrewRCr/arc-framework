/** Marker spans never share lines, and zero-line conflicts reserve both boundary edges. */
import { afterEach, describe, expect, it } from "vitest";
import { createStoredConflictFixture } from "../../../helpers/store/projection/stored-conflict-fixture.js";
import { renderSpansOverlap } from "../../../../src/lib/store/projection/render-held.js";
import { renderRecordContent } from "../../../../src/lib/store/projection/record-render.js";
import { formatConflictToken } from "../../../../src/lib/status/conflict-token.js";
import { mergeLineText } from "../../../../src/lib/store/concurrency/line-merge.js";
import { RecordReferenceSchema } from "../../../../src/lib/store/identity.js";
import { success } from "../../../helpers/store/suite-tools.js";

const fixtures: { dispose(): Promise<void> }[] = [];
afterEach(async () => { await Promise.all(fixtures.splice(0).map(fixture => fixture.dispose())); });

describe("rendered conflict overlap", () => {
  it.each([
    { name: "shared line", a: [3, 4], b: [4, 5], overlaps: true },
    { name: "adjacent lines", a: [3, 6], b: [6, 9], overlaps: false },
    { name: "point at start", a: [3, 3], b: [3, 9], overlaps: true },
    { name: "point inside", a: [6, 6], b: [3, 9], overlaps: true },
    { name: "point at end", a: [9, 9], b: [3, 9], overlaps: true },
    { name: "same point", a: [6, 6], b: [6, 6], overlaps: true },
    { name: "point beyond", a: [12, 12], b: [3, 9], overlaps: false },
  ])("handles $name in either order", ({ a, b, overlaps }) => {
    const left = { start: a[0] ?? 0, end: a[1] ?? 0 }, right = { start: b[0] ?? 0, end: b[1] ?? 0 };
    expect(renderSpansOverlap("aa\nbb\ncc\ndd\nee\n", left, right)).toBe(overlaps);
    expect(renderSpansOverlap("aa\nbb\ncc\ndd\nee\n", right, left)).toBe(overlaps);
  });

  it.each([true, false])("draws only the first of repeated delete/modify conflicts (stamped %s)", async stamped => {
    const fixture = await createStoredConflictFixture({ base: "left\nbase\nright\n", current: "left\nright\n", incoming: "left\nincoming\nright\n" });
    fixtures.push(fixture);
    success(await fixture.store.write({ action: "put", reference: fixture.entry.reference, expected: fixture.entry.base.version,
      content: "left\nsecond incoming\nright\n", provenance: { verb: "edit", lifecycleAction: "edit" } }));
    const record = success(await fixture.store.read({ reference: fixture.entry.reference }));
    expect(record.conflicts).toHaveLength(2);
    const ordered = [...record.conflicts].sort((a, b) => formatConflictToken(a) < formatConflictToken(b) ? -1 : 1);
    const rendered = success(await renderRecordContent({ store: fixture.store, memo: fixture.context.memo },
      { record, content: record.content, stamped }));
    expect(rendered.state.markers?.sets).toEqual([{ shows: "stored", conflict: ordered[0] }]);
    expect(rendered.state.notices).toEqual(stamped ? [ordered[1]] : []);
    expect(rendered.state.unshown).toEqual(stamped ? [] : [ordered[1]]);
    expect(rendered.notices).toHaveLength(stamped ? 1 : 0);
    expect(rendered.content).toContain("right\n");
  });

  it("draws only the first of an entry conflict and a hunk inside that entry", async () => {
    const base = "# Inbox\n\n## Errand\n\n### [ ] **First**\n\n- _Id:_ `11111111`\n\nleft\nbase\nright\n";
    const current = base.replace("\nbase\n", "\nstored\n"), incoming = base.replace("\nbase\n", "\nincoming\n");
    const fixture = await createStoredConflictFixture({ kind: "personal/inbox", base, current, incoming });
    fixtures.push(fixture);
    const data = fixture.conflicts[0]?.data;
    if (data === undefined) throw new Error("Entry conflict missing");
    expect(data.location.kind).toBe("entry");
    const hunk = mergeLineText({ record: fixture.entry.reference, baseVersion: fixture.entry.base.version,
      base, current: fixture.record.content, incoming, currentLabel: data.current.label, incomingLabel: data.incoming.label }).conflicts[0];
    if (hunk === undefined) throw new Error("Hunk missing");
    const reference = RecordReferenceSchema.parse({ kind: "personal/conflict-record", owner: fixture.entry.reference.owner,
      key: "00000000-0000-4000-8000-000000000001" });
    success(await fixture.store.write({ action: "put", reference, expected: null, content: JSON.stringify(hunk),
      provenance: { verb: "merge", lifecycleAction: "edit" } }));
    const record = success(await fixture.store.read({ reference: fixture.entry.reference }));
    const ordered = [...record.conflicts].sort((a, b) => formatConflictToken(a) < formatConflictToken(b) ? -1 : 1);
    expect(ordered).toHaveLength(2);
    const rendered = success(await renderRecordContent({ store: fixture.store, memo: fixture.context.memo },
      { record, content: record.content, stamped: true }));
    expect(rendered.state.markers?.sets).toEqual([{ shows: "stored", conflict: ordered[0] }]);
    expect(rendered.state.notices).toEqual([ordered[1]]);
  });
});
