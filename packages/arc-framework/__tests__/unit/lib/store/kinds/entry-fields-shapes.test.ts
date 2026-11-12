/** Shapes descriptors survive canonical fields and successive moves. */
import { expect, it } from "vitest";
import { readEntryField, writeEntryFields } from "../../../../../src/lib/store/kinds/entry-fields.js";
import { createInboxHarness, entry } from "../../../../helpers/inbox-harness.js";
import { listInbox } from "../../../../../src/lib/inbox/listing.js";
import { routeEntry } from "../../../../../src/lib/inbox/route.js";

const descriptors = [
  "`resolveArcPath` and its callers",
  "Use `current/` before `in-flight/`",
  "`first` then `second`",
  "prefix ``nested `code` span`` suffix",
  "`leading and trailing`",
  "``multiple``",
  "`",
  "````",
  " `code` with surrounding spaces ",
];
it.each(["\n", "\r\n"].flatMap(newline => descriptors.map(value => ({ newline, value }))))(
  "round-trips the complete Shapes descriptor $value with $newline endings", ({ newline, value }) => {
    const raw = ["### **Concern**", '- _Id:_ `12345678`', "", "Unowned prose"].join(newline);
    const canonical = writeEntryFields(raw, { Shapes: value });
    expect(readEntryField(canonical, "Shapes")).toBe(value);
    const repeated = writeEntryFields(canonical, { Created: "2026-02-01" });
    expect(readEntryField(repeated, "Shapes")).toBe(value);
    expect(readEntryField(repeated, "Id")).toBe("12345678");
    expect(repeated).toContain("Unowned prose");
    expect(writeEntryFields(repeated, {})).toBe(repeated);
  });
it.each(["`first` then `second`", "prefix `code` suffix", "``code with ` inside`` and suffix"])(
  "reads the entire bare Shapes prose %s before canonicalization", (value) => {
    const raw = `### **Concern**\n- _Shapes:_ ${value}\n- _Id:_ \`12345678\``;
    expect(readEntryField(raw, "Shapes")).toBe(value);
    expect(readEntryField(writeEntryFields(raw, {}), "Shapes")).toBe(value);
  });
it.each(["\n", "\r\n"])("refuses multiline Shapes input containing %j", (newline) => {
  expect(() => writeEntryFields("### **Concern**", { Shapes: `First${newline}Second` })).toThrow(/Invalid Shapes/u);
});
it.each(["\n", "\r\n"].flatMap(newline => descriptors.slice(0, 3).map(value => ({ newline, value }))))(
  "keeps $value through personal, inbound, description and onward routes with $newline endings", async ({ newline, value }) => {
    const h = createInboxHarness();
    await h.inbox("personal", `${entry()}\n- _Shapes:_ ${value}`.replaceAll("\n", newline));
    const target = await h.workUnit(), errand = await h.errand();
    let current = "personal";
    for (const destination of [target.reference.owner.name, errand.reference.owner.name, "personal"]) {
      const listed = await listInbox({ list: current }, h.context);
      if (listed.state === "refused" || listed.entries[0] === undefined) throw new Error("Missing routed entry");
      const row = listed.entries[0];
      expect(row.fields.Shapes).toBe(value);
      expect(await routeEntry({ entryId: row.id, from: current, expectedVersion: row.version,
        to: destination, ...(destination === "personal" ? { section: "Work Unit" } : {}) }, h.context)).toMatchObject({ state: "routed" });
      expect(await listInbox({ list: current }, h.context)).toMatchObject({ entries: [] });
      const landed = await listInbox({ list: destination }, h.context);
      expect(landed).toMatchObject({ entries: [{ id: "12345678", fields: { Shapes: value }, raw: expect.stringContaining("Prose") }] });
      current = destination;
    }
  });
