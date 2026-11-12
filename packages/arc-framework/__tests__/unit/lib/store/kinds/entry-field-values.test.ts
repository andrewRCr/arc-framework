/** Every managed field has one reader and one canonical writer. */
import { describe, expect, it } from "vitest";
import { managedFieldValue, readEntryField, validEntryFieldValue, writeEntryFields, drawEntryId } from "../../../../../src/lib/store/kinds/entry-fields.js";
import { hasExecuteBoundDisposition } from "../../../../../src/lib/user-sync/inbox-writer.js";

describe("entry field value contracts", () => {
  it.each([
    ["Id", "1234abcd", "wrong"], ["Created", "2026-01-01", "yesterday"],
    ["Remind", "true", "false"], ["Hold", "true", "yes"], ["WU_Target", "unit (planned)", "not a slug"],
    ["Shapes", "Section 2", ""], ["Cites", "87654321", "no"], ["Disposition", "execute-bound", ""],
    ["Inbox", "personal", "other"], ["Rank", "a0", ""],
  ])("validates and canonicalizes %s", (field, good, bad) => {
    expect(validEntryFieldValue(field, bad)).toBe(false);
    expect(validEntryFieldValue(field, good)).toBe(true);
    expect(() => writeEntryFields("### **Title**", { [field]: bad })).toThrow();
    const written = writeEntryFields("### **Title**\n\nProse", { [field]: good });
    expect(written).toContain(`- _${field}:_ \`${good}\``);
    expect(readEntryField(written, field)).toBe(good);
  });
  it("keeps existing managed fields grouped and always puts the identity last", () => {
    const raw = '### **Title**\n- _Hold:_ `true`\n\n- _Why:_ prose';
    expect(writeEntryFields(raw, { Id: "12345678", Created: "2026-01-01" }))
      .toBe('### **Title**\n- _Hold:_ `true`\n- _Created:_ `2026-01-01`\n- _Id:_ `12345678`\n\n- _Why:_ prose');
  });
  it("retains raw probe matching anywhere and escapes field labels literally", () => {
    expect(managedFieldValue("prose _Hold:_ `true`", "Hold")).toBe("true");
    expect(managedFieldValue("_a.b:_ `yes` _axb:_ `no`", "a.b")).toBe("yes");
  });
  it("writes disposition as the first body line and retains the execute mark", () => {
    const raw = writeEntryFields("### **Title**\n\nProse", { Created: "2026-01-01", Disposition: "execute-bound" });
    expect(raw).toMatch(/^### \*\*Title\*\*\n\n- _Disposition:_ `execute-bound`\n\n- _Created:_/u);
    expect(hasExecuteBoundDisposition(raw)).toBe(true);
  });
  it("redraws a list-local ID collision", () => {
    const draws = [0, 0.5];
    expect(drawEntryId(new Set(["00000000"]), () => draws.shift() ?? 0)).toBe("80000000");
  });
});
