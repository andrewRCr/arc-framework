import { describe, expect, it } from "vitest";
import { parseEntryList, writeEntryList } from "../../../../../src/lib/store/kinds/entry-list.js";
import { ENTRY_CONFIGS } from "../../../../../src/lib/store/kinds/entry-configs.js";
import { parsePersonalInboxEntries } from "../../../../../src/lib/store/kinds/personal-inbox.js";

describe("production entry grammars", () => {
  it("reads complete bold titles in ID-based entries while retaining title-keyed compatibility", () => {
    const content = '## Errand\n\n### **Plain **bold** concern**\n- _Id:_ `12345678`\n';
    const parsed = parseEntryList(content, "personal/inbox");
    expect(parsed).toMatchObject({ success: true, data: { entries: [{ title: "Plain **bold** concern" }] } });
    expect(parsePersonalInboxEntries(content)).toMatchObject([{ ok: true, entry: { key: "Plain" } }]);
  });
  it.each(Object.keys(ENTRY_CONFIGS) as (keyof typeof ENTRY_CONFIGS)[])("decodes only admitted fields for %s while retaining bytes", (kind) => {
    const config = ENTRY_CONFIGS[kind];
    const header = config.shape === "heading" ? "### **Example**" : "**Example:**\n_Remove when: done._";
    const raw = `${header}\n- _Id:_ \`12345678\`\n- _Created:_ \`2026-01-01\`\n- _Hold:_ \`true\`\n\n- _Why:_ body`;
    const content = `## ${config.sections[0]}\n\n${raw}\n\n## Outside\n### **Unowned**\n`;
    const parsed = parseEntryList(content, kind);
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    expect(parsed.data.entries).toHaveLength(1);
    expect(parsed.data.entries[0]?.bytes).toBe(raw);
    expect(parsed.data.entries[0]?.fields.Created).toBe((config.managedFields as readonly string[]).includes("Created") ? "2026-01-01" : undefined);
    expect(parsed.data.entries[0]?.fields.Hold).toBe((config.managedFields as readonly string[]).includes("Hold") ? "true" : undefined);
  });
  it.each(["**Wrapped\n\nheader:**", "**Colonless**"])("refuses a malformed memory header: %s", (header) => {
    const parsed = parseEntryList(`## Memories\n**Good:**\n_Remove when: good._\n\n${header}\n_Remove when: done._\n`, "personal/working-memory");
    expect(parsed.success).toBe(false);
    if (!parsed.success) expect(parsed.error).toContain("**Title:**");
  });
  it.each(["\n", "\r\n"].flatMap((newline) => [" ", "\t"].flatMap((suffix) =>
    ["**Wrapped\n\nheader:**", "**Colonless**"].map((header) => ({ newline, suffix, header })))))(
    "refuses malformed memory under a whitespace-suffixed section: $newline $suffix $header", ({ newline, suffix, header }) => {
      const content = `## Memories${suffix}\n**Good:**\n_Remove when: good._\n\n${header}\n_Remove when: done._\n`.replaceAll("\n", newline);
      const parsed = parseEntryList(content, "personal/working-memory");
      expect(parsed.success).toBe(false);
      if (!parsed.success) expect(parsed.error).toContain("**Title:**");
    });
  it.each(["\n", "\r\n"].flatMap(newline => ["", " ", "\t"].flatMap(suffix =>
    ["**Wrapped\nheader:**", "**A title with\nthree consecutive\nlines:**"].map(header => ({ newline, suffix, header })))))(
    "reads complete wrapped memory entries losslessly with $newline $suffix $header", ({ newline, suffix, header }) => {
      const first = `${header}\n_Remove when: first condition._\n_Id:_ \`12345678\`\n\nFirst body.`;
      const second = "**Next:**\n_Remove when: second condition._\n\nSecond body.";
      const content = `# Working Memory\n\n## Memories${suffix}\n\n${first}\n\n${second}\n\n---\nFooter.\n`.replaceAll("\n", newline);
      const parsed = parseEntryList(content, "personal/working-memory");
      expect(parsed.success).toBe(true);
      if (!parsed.success) return;
      expect(parsed.data.entries).toHaveLength(2);
      expect(parsed.data.entries[0]).toMatchObject({ title: header.replaceAll("\n", " "), id: "12345678",
        bytes: first.replaceAll("\n", newline), fields: { "Remove when": "first condition.", Id: "12345678" } });
      expect(parsed.data.entries[1]?.bytes).toBe(second.replaceAll("\n", newline));
      expect(writeEntryList(parsed.data)).toBe(content);
    });
  it.each(["\n", "\r\n"].flatMap(newline => [
    "**Bold body without a colon**", "**Bold body** followed by prose.", "**Bold\nbody without a colon**",
  ].flatMap(body => [
    "**Next:**", "**Next\nwrapped:**", "**Next with **bold** text\ncontinued:**",
    "**Next with `**` text\ncontinued:**", "**Next with \\** text\ncontinued:**",
  ].map(header => ({ newline, body, header })))))(
    "keeps closed bold body prose in its entry before $header with $newline: $body", ({ newline, body, header }) => {
      const first = `**First:**\n_Remove when: first condition._\n_Id:_ \`12345678\`\n\nBody.\n${body}`;
      const second = `${header}\n_Remove when: second condition._\n_Id:_ \`87654321\`\n\nSecond body.`;
      const content = `## Memories\n${first}\n${second}\n`.replaceAll("\n", newline);
      const parsed = parseEntryList(content, "personal/working-memory");
      expect(parsed.success).toBe(true);
      if (!parsed.success) return;
      expect(parsed.data.entries).toMatchObject([
        { title: "**First:**", id: "12345678", bytes: first.replaceAll("\n", newline), fields: { "Remove when": "first condition." } },
        { title: header.replaceAll("\n", " "), id: "87654321", bytes: second.replaceAll("\n", newline),
          fields: { "Remove when": "second condition." } },
      ]);
      expect(writeEntryList(parsed.data)).toBe(content);
    });
  it.each(["\n", "\r\n"])("retains a one-line memory boundary after unfinished bold body with %j", newline => {
    const first = "**First:**\n_Remove when: first._\n\n**Unfinished body";
    const second = "**Second:**\n_Remove when: second._";
    const content = `## Memories\n${first}\n${second}\n`.replaceAll("\n", newline);
    const parsed = parseEntryList(content, "personal/working-memory");
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    expect(parsed.data.entries).toMatchObject([
      { title: "**First:**", bytes: first.replaceAll("\n", newline) },
      { title: "**Second:**", bytes: second.replaceAll("\n", newline) },
    ]);
    expect(writeEntryList(parsed.data)).toBe(content);
  });
  it("refuses memory without a trigger", () => {
    expect(parseEntryList("## Memories\n**Title:**\nBody\n", "personal/working-memory").success).toBe(false);
  });
});
