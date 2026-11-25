/** Conflict text exposes subject identity, shape fields and both preserved writer labels. */
import { expect, it } from "vitest";
import { ConflictRecordSchema } from "../../../src/lib/store/conflict.js";
import { formatConflictToken } from "../../../src/lib/status/conflict-token.js";
import { renderStoreConflicts } from "../../../src/lib/status/conflict-render.js";
import { createReferenceFixture } from "../../helpers/store/reference-fixture.js";
import { seedStatusConflict } from "../../helpers/store/status-conflicts.js";

it.each(["hunk", "entry", "record"] as const)("renders every %s field and both labels", async shape => {
  const f = createReferenceFixture();
  const kind = shape === "hunk" ? "project-machinery/conflict-record" : shape === "entry" ? "personal/conflict-record" : "work-item/conflict-record";
  const record = await seedStatusConflict(f, f.reference(kind), shape);
  const conflict = ConflictRecordSchema.parse(JSON.parse(record.content)), token = formatConflictToken(record.reference);
  const text = renderStoreConflicts([{ ...record, token }]);
  expect(text).toContain(token);
  expect(text).toContain(`Subject: ${JSON.stringify(conflict.record)}`);
  expect(text).toContain(`Current: current @ ${conflict.current.label.time}`);
  expect(text).toContain(`Incoming: incoming @ ${conflict.incoming.label.time}`);
  if (conflict.location.kind === "record" && "value" in conflict.current && "value" in conflict.incoming) {
    expect(text).toContain(JSON.stringify(conflict.current.value, null, 2));
    expect(text).toContain(JSON.stringify(conflict.incoming.value, null, 2));
  } else {
    expect(text).toContain("base text"); expect(text).toContain("current text"); expect(text).toContain("incoming text");
    if (shape === "hunk") expect(text).toContain("Lines (zero-based, end-exclusive): [1, 3)");
    else {
      expect(text).toContain("Entry: 11111111"); expect(text).toContain("Base section: Pending");
      expect(text).toContain("Current section: Ready"); expect(text).toContain("Incoming section: Later");
    }
  }
});

it.each(["current", "incoming"] as const)("names a whole-record removal on the %s side", async side => {
  const f = createReferenceFixture(), record = await seedStatusConflict(f, f.reference("work-item/conflict-record"));
  const conflict = ConflictRecordSchema.parse(JSON.parse(record.content));
  const removed = ConflictRecordSchema.parse({ ...conflict, [side]: { ...conflict[side], value: null } });
  const text = renderStoreConflicts([{ ...record, token: formatConflictToken(record.reference), content: JSON.stringify(removed) }]);
  expect(text).toContain(`${side === "current" ? "Current" : "Incoming"}: ${side} @ ${conflict[side].label.time}\nRemoved the record.`);
});
