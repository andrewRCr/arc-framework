/** Marker rendering keeps stored sides first and distinguishes every conflict origin. */
import { describe, expect, it } from "vitest";
import { createMarkerRenderer, RESOLVE_BY_HAND_LINE } from "../../../../src/lib/store/projection/marker-render.js";
import { RecordReferenceSchema } from "../../../../src/lib/store/identity.js";
import type { TextConflictRecord } from "../../../../src/lib/store/conflict.js";

const reference = RecordReferenceSchema.parse({ kind: "personal/document", owner: { type: "person", name: "andrew" }, key: "example.md" });
const origin = { shows: "stored" as const, conflict: RecordReferenceSchema.parse({ kind: "personal/conflict-record", owner: reference.owner, key: "clash-one" }) };

function clash(current = "stored side", incoming = "incoming side"): TextConflictRecord {
  return { record: reference, location: { kind: "hunk", start: 0, end: 1 }, baseVersion: null,
    currentLines: current.split("\n").length, incomingLines: incoming.split("\n").length, base: "base",
    current: { content: current, label: { actor: "stored-machine", time: "2026-10-09T12:00:00Z" } },
    incoming: { content: incoming, label: { actor: "edit-session", time: "2026-10-09T12:01:00Z" } } };
}

describe("conflict markers", () => {
  it("renders a plain clash at seven with the stored side first and its conflict address", () => {
    const conflict = clash();
    const renderer = createMarkerRenderer([conflict.current.content, conflict.incoming.content]);
    const rendered = renderer.render(conflict, origin);
    expect(renderer.length).toBe(7);
    expect(rendered).toBe('<<<<<<< stored-machine @ 2026-10-09T12:00:00Z [arc-conflict: "personal/person/andrew/clash-one"]\n'
      + 'stored side\n=======\nincoming side\n>>>>>>> edit-session @ 2026-10-09T12:01:00Z\n');
    expect(rendered).not.toContain("Resolve this conflict by hand");
  });

  it.each([
    { where: "inside a side", current: "stored\n=======\nside", outside: "outside\n", length: 11 },
    { where: "outside the sets", current: "stored side", outside: "Heading\n=======\n", length: 11 },
    { where: "inside an outside fenced block", current: "stored side", outside: "```\n<<<<<<< literal\n```\n", length: 11 },
    { where: "in a longer outside run", current: "stored side", outside: "=================\n", length: 21 },
    { where: "in an end-marker run", current: "stored side", outside: ">>>>>>>> literal\n", length: 12 },
    { where: "in a base-marker run", current: "stored side", outside: "||||||||| literal\n", length: 13 },
  ])("escalates every set past a marker-like line $where", ({ current, outside, length }) => {
    const first = clash(current), second = clash("second current", "second incoming");
    const renderer = createMarkerRenderer([outside, first.current.content, first.incoming.content, second.current.content, second.incoming.content]);
    const secondOrigin = { shows: "stored" as const, conflict: RecordReferenceSchema.parse({ ...origin.conflict, key: "clash-two" }) };
    const rendered = outside + renderer.render(first, origin) + "between\n" + renderer.render(second, secondOrigin);
    expect(renderer.length).toBe(length);
    const lines = rendered.split("\n");
    expect(lines.filter(line => line.startsWith("<".repeat(length) + " "))).toHaveLength(2);
    expect(lines.filter(line => line === "=".repeat(length))).toHaveLength(2);
    expect(lines.filter(line => line.startsWith(">".repeat(length) + " "))).toHaveLength(2);
    expect(lines.filter(line => line === RESOLVE_BY_HAND_LINE)).toHaveLength(2);
    expect(rendered).toContain(current);
    expect(rendered).toContain('"personal/person/andrew/clash-one"');
    expect(rendered).toContain('"personal/person/andrew/clash-two"');
  });

  it("identifies a checkout clash independently of stored conflict addresses", () => {
    const conflict = clash();
    const renderer = createMarkerRenderer([conflict.current.content, conflict.incoming.content]);
    const rendered = renderer.render(conflict, { shows: "checkout" });
    expect(rendered.split("\n")[0]).toBe("<<<<<<< stored-machine @ 2026-10-09T12:00:00Z [arc-conflict: checkout]");
    expect(rendered).toContain("stored side\n=======\nincoming side\n");
  });

  it("keeps side labels on their marker line", () => {
    const conflict = clash();
    conflict.current.label.actor = "stored\n=======\r\nmachine";
    const renderer = createMarkerRenderer([conflict.current.content, conflict.incoming.content]);
    const rendered = renderer.render(conflict, origin);
    expect(rendered.split("\n")[0]).toBe('<<<<<<< stored\\n=======\\r\\nmachine @ 2026-10-09T12:00:00Z [arc-conflict: "personal/person/andrew/clash-one"]');
    expect(rendered.split("\n").filter(line => line === "=======")).toHaveLength(1);
  });
});
