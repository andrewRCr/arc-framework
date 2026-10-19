/** Typed conflict records persisted through the reference store's public write boundary. */
import { ConflictRecordSchema } from "../../../src/lib/store/conflict.js";
import type { RecordReference } from "../../../src/lib/store/identity.js";
import type { createReferenceFixture } from "./reference-fixture.js";
import { success, testProvenance } from "./suite-tools.js";

/** Persist one supported conflict shape with the fixture's genuine subject and side labels. */
export async function seedStatusConflict(f: ReturnType<typeof createReferenceFixture>, reference: RecordReference, shape: "record" | "hunk" | "entry" = "record") {
  const whole = ConflictRecordSchema.parse(JSON.parse(f.content(reference)));
  const content = shape === "record" ? whole : ConflictRecordSchema.parse({ record: whole.record, base: "base text",
    location: shape === "hunk" ? { kind: "hunk", start: 1, end: 3 } : { kind: "entry", id: "11111111" },
    ...(shape === "entry" ? { baseSection: "Pending" } : {}),
    current: { content: "current text", label: whole.current.label, ...(shape === "entry" ? { section: "Ready" } : {}) },
    incoming: { content: "incoming text", label: whole.incoming.label, ...(shape === "entry" ? { section: "Later" } : {}) } });
  const result = success(await f.store.write({ action: "put", reference, expected: null, content: JSON.stringify(content), provenance: testProvenance }));
  return success(await f.store.read({ reference: result.reference }));
}
