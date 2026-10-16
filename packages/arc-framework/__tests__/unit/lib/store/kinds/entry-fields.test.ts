import { describe, expect, it } from "vitest";
import { readEntryField, writeEntryFields, readRemovalTrigger, writeRemovalTrigger, entryVersion, writeRoutedFrom } from "../../../../../src/lib/store/kinds/entry-fields.js";

describe("shared entry fields", () => {
  it("reads legacy spellings and writes a leading managed group", () => {
    const raw = '### **Title**\n\n- WU_Target: unit (planned)\n- _Shapes:_ Section 2\n- _Why:_ prose\n';
    expect(readEntryField(raw, "WU_Target")).toBe("unit (planned)");
    expect(readEntryField(raw, "Shapes")).toBe("Section 2");
    expect(writeEntryFields(raw, { Created: "2026-01-01", WU_Target: "unit", Shapes: "Section 2" }))
      .toBe('### **Title**\n- _WU_Target:_ `unit`\n- _Shapes:_ `Section 2`\n- _Created:_ `2026-01-01`\n\n- _Why:_ prose');
  });
  it("reads wrapped triggers in either delimiter and writes the canonical trigger", () => {
    for (const delimiter of ["_", "*"]) expect(readRemovalTrigger(`${delimiter}Remove when: the first\nand last line.${delimiter}\nbody`)).toBe("the first\nand last line.");
    expect(writeRemovalTrigger("done")).toBe("_Remove when: done._");
  });
  it("versions exactly the entry bytes and section", () => {
    const entry = { section: "Inbox", bytes: "### **A**" };
    expect(entryVersion(entry)).toMatch(/^v1:[0-9a-f]{16}$/u);
    expect(entryVersion(entry)).toBe(entryVersion({ ...entry }));
    expect(entryVersion(entry)).not.toBe(entryVersion({ ...entry, section: "Other" }));
    expect(entryVersion(entry)).not.toBe(entryVersion({ ...entry, bytes: entry.bytes + " " }));
  });
  it("places a replaceable origin immediately after the identity", () => {
    const raw = '### **A**\n- _Id:_ `12345678`\n\nProse';
    const stamped = writeRoutedFrom(raw, "personal (andrew), Work Unit");
    expect(stamped).toContain('- _Id:_ `12345678`\n- _Routed from:_ personal (andrew), Work Unit\n');
    expect(writeRoutedFrom(stamped)).toBe(raw);
  });
});
