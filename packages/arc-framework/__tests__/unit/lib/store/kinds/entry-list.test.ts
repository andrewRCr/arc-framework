import { describe, expect, it } from "vitest";
import { parseEntryList, writeEntryList } from "../../../../../src/lib/store/kinds/entry-list.js";
import { ENTRY_CONFIGS } from "../../../../../src/lib/store/kinds/entry-configs.js";
import { stampEntryIds } from "../../../../../src/lib/store/concurrency/stamp.js";
import { entryFrame } from "../../../../../src/lib/store/concurrency/entry-frame.js";
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
    "**Bold**body",
  ].flatMap(body => [
    "**Next:**", "**Next\nwrapped:**", "**Next with **bold** text\ncontinued:**",
    "**Next with\n**bold** text:**",
    "**Next with `**` text\ncontinued:**", "**Next with \\** text\ncontinued:**",
    "**Next with\n**bold\ntext**post and\n**more** text:**",
    "**Next with pre**bold\ntext**post and\n**more** text:**",
    "**Next with pre**bold\n**inner** text**post and\n**more** text:**",
    "**Next with pre**bold\n**inner** tail**post:**",
  ].map(header => ({ newline, body, header })))))(
    "keeps a blank-separated body paragraph in its entry before $header with $newline: $body", ({ newline, body, header }) => {
      const first = `**First:**\n_Remove when: first condition._\n_Id:_ \`12345678\`\n\nBody.\n${body}`;
      const second = `${header}\n_Remove when: second condition._\n_Id:_ \`87654321\`\n\nSecond body.`;
      const content = `## Memories\n${first}\n\n${second}\n`.replaceAll("\n", newline);
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
  it.each(["\n", "\r\n"])("includes an unseparated bold-opening line in the title paragraph with %j", newline => {
    const first = "**First:**\n_Remove when: first._\n_Id:_ `11111111`";
    const header = "**Unfinished body\n**Second:**";
    const second = `${header}\n_Remove when: second._`;
    const content = `## Memories\n${first}\n\n${second}\n`.replaceAll("\n", newline);
    const parsed = parseEntryList(content, "personal/working-memory");
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    expect(parsed.data.entries).toMatchObject([
      { title: "**First:**", bytes: first.replaceAll("\n", newline) },
      { title: header.replaceAll("\n", " "), bytes: second.replaceAll("\n", newline) },
    ]);
    const edited = parseEntryList(content.replace("Unfinished", "Edited"), "personal/working-memory");
    expect(edited.success).toBe(true);
    if (edited.success) expect(edited.data.entries[1]?.version).not.toBe(parsed.data.entries[1]?.version);
    const stamped = stampEntryIds(content, ENTRY_CONFIGS["personal/working-memory"], () => 0.5);
    const stampedParsed = parseEntryList(stamped, "personal/working-memory");
    expect(stampedParsed).toMatchObject({ success: true, data: { entries: [
      { id: "11111111" }, { id: "80000000", title: header.replaceAll("\n", " ") },
    ] } });
    expect(stamped.replace(`${newline}_Id:_ \`80000000\``, "")).toBe(content);
    expect(entryFrame(stamped, ENTRY_CONFIGS["personal/working-memory"]).skeleton).toBe(`## Memories${newline}`);
    expect(writeEntryList(parsed.data)).toBe(content);
  });
  it.each(["\n", "\r\n"].flatMap(newline => [
    "**A title with", "**A title with\nseveral lines and",
  ].map(prefix => ({ newline, prefix }))))(
    "includes a bold continuation's full prefix in entry versions with $newline: $prefix", ({ newline, prefix }) => {
      const header = `${prefix}\n**bold** text:**`;
      const raw = `${header}\n_Remove when: done._\n_Id:_ \`12345678\``;
      const content = `## Memories\n${raw}\n`.replaceAll("\n", newline);
      const parsed = parseEntryList(content, "personal/working-memory");
      const changed = parseEntryList(content.replace("A title", "Another title"), "personal/working-memory");
      expect(parsed.success).toBe(true);
      expect(changed.success).toBe(true);
      if (!parsed.success || !changed.success) return;
      expect(parsed.data.entries).toMatchObject([
        { title: header.replaceAll("\n", " "), id: "12345678", bytes: raw.replaceAll("\n", newline) },
      ]);
      expect(changed.data.entries[0]?.version).not.toBe(parsed.data.entries[0]?.version);
      expect(writeEntryList(parsed.data)).toBe(content);
    });
  it.each(["\n", "\r\n"].flatMap(newline => ["", " ", "\t"].flatMap(suffix => [
    "**A title with\n**bold\ntext** and\n**more** text:**",
    "**A title with\n「**bold\ntext**」 and\n**more** text:**",
    "**A title with\n🧭**bold\ntext**🧭 and\n**more** text:**",
    "** A title with\n**bold\ntext** and\n**more** text:**",
    "**A title with\n**bold\ntext** text:**",
    "**A title with **bold\ntext** and\n**more** text:**",
    "**A title with **bold\ntext** and more\ntext:**",
    "**A title with\n**bold `**`\ntext** and\n**more** text:**",
    "**A title with\n**bold \\**\ntext** and\n**more** text:**",
    "**A title with pre**bold\ntext** and\n**more** text:**",
    "**A title with\npre**bold\ntext**post and\n**more** text:**",
    "**A title with pre**bold\ntext**post and\n**more** text:**",
    "**A title with pre**bold\ntext**post and other**bold\nwords**tail\nends:**",
    "**A title with προ**bold\ntext**μετά and\n**more** text:**",
    "**A title with pre**bold `**`\ntext**post and\n**more** text:**",
    "**A title with pre**bold\n**inner\nwords**post:**\nends:**",
    "**A title with `\n**example:**\n` tail:**",
    ...["pre", "προ"].flatMap(before => ["post", "μετά"].flatMap(after => [
      `**A title with ${before}**bold\n**inner** text**${after} and\n**more** text:**`,
      `**A title with ${before}**bold\n**inner** tail**${after}:**`,
      `**A title with ${before}**bold \`\n**example\ncontinued:**\n\` text**${after} and\n**more** text:**`,
    ])),
    ...["post", "μετά"].flatMap(after => [
      `**A title with\n**bold\ntext**${after} and\n**more** text:**`,
      `**A title with\n**bold text**${after} and **more** text:**`,
    ]),
  ].map(header => ({ newline, suffix, header })))))(
    "treats the trigger-anchored title paragraph as opaque text with $newline $suffix: $header", ({ newline, suffix, header }) => {
      const raw = `${header}\n_Remove when: done._\n_Id:_ \`12345678\``.replaceAll("\n", newline);
      const opening = `## Memories${suffix}${newline}`;
      const content = `${opening}${raw}${newline}`;
      const parsed = parseEntryList(content, "personal/working-memory");
      const changed = parseEntryList(content.replace("A title", "Another title"), "personal/working-memory");
      expect(parsed.success).toBe(true);
      expect(changed.success).toBe(true);
      if (!parsed.success || !changed.success) return;
      expect(parsed.data.entries).toMatchObject([
        { title: header.replaceAll("\n", " "), id: "12345678", bytes: raw },
      ]);
      expect(changed.data.entries[0]?.version).not.toBe(parsed.data.entries[0]?.version);
      expect(entryFrame(content, ENTRY_CONFIGS["personal/working-memory"])).toMatchObject({
        skeleton: opening, entries: [{ bytes: raw, id: "12345678" }],
      });
      expect(writeEntryList(parsed.data)).toBe(content);
    });
  it.each(["\n", "\r\n"])("refuses ordinary text joined to a title and accepts a separating blank line with %j", newline => {
    const content = "## Memories\n**First:**\n_Remove when: first._\n_Id:_ `11111111`\n\nBody.\n**Next:**\n_Remove when: next._\n_Id:_ `22222222`\n".replaceAll("\n", newline);
    const parsed = parseEntryList(content, "personal/working-memory");
    expect(parsed).toMatchObject({ success: false, error: expect.stringMatching(/^Line 6:.*put a blank line before the title/u) });
    const repaired = parseEntryList(content.replace(`${newline}**Next:**`, `${newline}${newline}**Next:**`), "personal/working-memory");
    expect(repaired).toMatchObject({ success: true, data: { entries: [
      { title: "**First:**", bytes: expect.stringContaining("Body.") }, { title: "**Next:**", id: "22222222" },
    ] } });
  });
  it.each(["\n", "\r\n"])("retains a bold-colon body line without starting an entry with %j", newline => {
    const first = "**First:**\n_Remove when: first._\n_Id:_ `11111111`\n\n**Title-shaped body:**\nBody continues.";
    const second = "**Second:**\n_Remove when: second._\n_Id:_ `22222222`";
    const content = `## Memories\n${first}\n\n${second}\n`.replaceAll("\n", newline);
    const parsed = parseEntryList(content, "personal/working-memory");
    expect(parsed).toMatchObject({ success: true, data: { entries: [
      { title: "**First:**", bytes: first.replaceAll("\n", newline) }, { title: "**Second:**", bytes: second.replaceAll("\n", newline) },
    ] } });
    if (parsed.success) expect(writeEntryList(parsed.data)).toBe(content);
  });
  it.each(["\n", "\r\n"])("keeps removed memories outside field-header sections with %j", newline => {
    const content = "## Memories\n**Live:**\n_Remove when: done._\n_Id:_ `12345678`\n\n## Removed: old\n**Archived:**\n_Remove when: ignored._\n_Id:_ `87654321`\n\nNot a title\n_Remove when: also ignored._\n".replaceAll("\n", newline);
    const parsed = parseEntryList(content, "personal/working-memory");
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    expect(parsed.data.entries).toHaveLength(1);
    expect(parsed.data.entries[0]).toMatchObject({ title: "**Live:**", id: "12345678" });
    expect(writeEntryList(parsed.data)).toBe(content);
  });
  it("keeps an unanchored bold-colon paragraph outside entries", () => {
    const content = "## Memories\n**Title:**\nBody\n";
    const parsed = parseEntryList(content, "personal/working-memory");
    expect(parsed).toMatchObject({ success: true, data: { entries: [] } });
    if (parsed.success) expect(writeEntryList(parsed.data)).toBe(content);
  });
});
