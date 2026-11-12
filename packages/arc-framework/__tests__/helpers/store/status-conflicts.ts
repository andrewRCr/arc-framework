/** Typed conflict records persisted through the reference store's public write boundary. */
import { mergeLineText } from "../../../src/lib/store/concurrency/index.js";
import { ConflictRecordSchema } from "../../../src/lib/store/conflict.js";
import type { RecordReference } from "../../../src/lib/store/identity.js";
import type { createReferenceFixture } from "./reference-fixture.js";
import { success, testProvenance } from "./suite-tools.js";

/** Persist one supported conflict shape with the fixture's genuine subject and side labels. */
export async function seedStatusConflict(f: ReturnType<typeof createReferenceFixture>, reference: RecordReference, shape: "record" | "hunk" | "entry" = "record") {
  const whole = ConflictRecordSchema.parse(JSON.parse(f.content(reference)));
  const content = shape === "record" ? whole : shape === "hunk" ? mergeLineText({
    record: whole.record, baseVersion: typeof whole.base === "object" ? whole.base?.version ?? null : null,
    base: "before\nbase text\nbase tail\nafter\n", current: "before\ncurrent text\nafter\n",
    incoming: "before\nincoming text\nafter\n", currentLabel: whole.current.label, incomingLabel: whole.incoming.label,
  }).conflicts[0] : ConflictRecordSchema.parse({ record: whole.record, base: "base text",
    location: { kind: "entry", id: "11111111" }, baseSection: "Pending",
    current: { content: "current text", label: whole.current.label, section: "Ready" },
    incoming: { content: "incoming text", label: whole.incoming.label, section: "Later" } });
  if (content === undefined) throw new Error("The fixture edits did not produce a conflict");
  const result = success(await f.store.write({ action: "put", reference, expected: null, content: JSON.stringify(content), provenance: testProvenance }));
  return success(await f.store.read({ reference: result.reference }));
}
