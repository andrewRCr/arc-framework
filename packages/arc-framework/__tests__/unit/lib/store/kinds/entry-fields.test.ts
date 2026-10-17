import { describe, expect, it } from "vitest";
import { readEntryField, writeEntryFields, readRemovalTrigger, writeRemovalTrigger, entryVersion, writeRoutedFrom } from "../../../../../src/lib/store/kinds/entry-fields.js";
import { maskComments } from "../../../../../src/lib/store/concurrency/entries.js";
import { parseEntryList } from "../../../../../src/lib/store/kinds/entry-list.js";

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
  it.each(["\n", "\r\n"])("keeps commented field examples opaque with %j endings", (newline) => {
    const comment = ["<!--", '- _Id:_ `deadbeef`', '- _Shapes:_ `Example decision`', "-->"].join(newline);
    const raw = ['### **Title**', '- _Id:_ `12345678`', '- _Shapes:_ `Actual decision`', "", comment, "Actual prose"].join(newline);
    const rewritten = writeEntryFields(raw, { Created: "2026-02-01" });
    expect(readEntryField(maskComments(rewritten), "Id")).toBe("12345678");
    expect(readEntryField(maskComments(rewritten), "Shapes")).toBe("Actual decision");
    expect(rewritten).toContain(comment);
    expect(rewritten).toContain("Actual prose");
  });
  it.each(["\n", "\r\n"])("retains inline comment bytes while replacing visible fields with %j endings", (newline) => {
    const comment = "<!-- Keep this example: _Id:_ `deadbeef` -->";
    const raw = ['### **Title**', `- _Id:_ \`12345678\` ${comment}`, "", "Actual prose"].join(newline);
    const rewritten = writeEntryFields(raw, { Created: "2026-02-01" });
    expect(rewritten).toContain(comment);
    expect(readEntryField(maskComments(rewritten), "Id")).toBe("12345678");
  });
  it("retains opaque routing examples when replacing an origin", () => {
    const comment = '<!--\n- _Id:_ `deadbeef`\n- _Routed from:_ example\n-->';
    const raw = `### **Title**\n${comment}\n- _Id:_ \`12345678\`\n- _Routed from:_ previous\n\nProse`;
    const rewritten = writeRoutedFrom(raw, "project");
    expect(rewritten).toContain(comment);
    expect(maskComments(rewritten)).toContain('- _Id:_ `12345678`\n- _Routed from:_ project\n');
    expect(maskComments(rewritten)).not.toContain("previous");
  });
  it("retains an inline comment when removing the visible origin", () => {
    const comment = "<!-- Keep this routing explanation -->";
    const raw = `### **Title**\n- _Id:_ \`12345678\`\n- _Routed from:_ previous ${comment}\n\nProse`;
    const rewritten = writeRoutedFrom(raw);
    expect(rewritten).toContain(comment);
    expect(maskComments(rewritten)).not.toContain("Routed from");
  });
  it("retains the complete opaque tail of an unclosed comment", () => {
    const comment = "<!--\nAn unfinished example\n\n";
    const raw = `### **Title**\n- _Id:_ \`12345678\`\n${comment}`;
    expect(writeEntryFields(raw, { Created: "2026-02-01" })).toContain(comment);
  });
  it.each(["\n", "\r\n"])("keeps identity visible beside a heading-spanning comment with %j endings", (newline) => {
    const comment = ["<!--", "", '- _Id:_ `deadbeef`', "-->"].join(newline);
    const raw = [`### **Title** ${comment}`, '- _Id:_ `12345678`', "", "Actual prose"].join(newline);
    const rewritten = writeEntryFields(raw, { Created: "2026-02-01" });
    expect(readEntryField(maskComments(rewritten), "Id")).toBe("12345678");
    expect(readEntryField(maskComments(rewritten), "Created")).toBe("2026-02-01");
    expect(rewritten).toContain(comment);
    expect(rewritten).toContain("Actual prose");
  });
  it.each(["\n", "\r\n"].flatMap(newline => [
    ["<!--", "Keep the heading note.", "-->"],
    ["<!--", "First heading note.", "--> <!--", "Last heading note.", "-->"],
  ].map(lines => ({ newline, comment: lines.join(newline) }))))(
    "keeps a closed heading comment entry-owned without following prose: $comment", ({ newline, comment }) => {
      const rewritten = writeEntryFields([`### **Title** ${comment}`, '- _Id:_ `12345678`'].join(newline), { Created: "2026-02-01" });
      const parsed = parseEntryList(`## Errand${newline}${newline}${rewritten}${newline}`, "personal/inbox");
      expect(parsed).toMatchObject({ success: true, data: { entries: [{ id: "12345678", bytes: expect.stringContaining(comment),
        fields: { Created: "2026-02-01" } }] } });
    });
});
