/** The advertised entry version agrees with observed-remove merge's byte comparison. */
import { expect, it } from "vitest";
import { splitEntryList } from "../../../../../src/lib/store/concurrency/entries.js";
import { mergeEntryText } from "../../../../../src/lib/store/concurrency/entry-merge.js";
import { entryVersion } from "../../../../../src/lib/store/kinds/entry-fields.js";
import { RecordReferenceSchema, RecordVersionSchema } from "../../../../../src/lib/store/identity.js";

it.each([
  { change: "separator", section: "Inbox", body: "base", separator: "\n\n\n", survives: false },
  { change: "bytes", section: "Inbox", body: "base ", separator: "\n\n", survives: true },
  { change: "section", section: "Other", body: "base", separator: "\n\n", survives: true },
])("version equality and observed removal agree on $change", ({ section, body, separator, survives }) => {
  const config = { shape: "heading" as const, sections: ["Inbox", "Other"] };
  const document = (name: string, text: string, trailing: string) => `## ${name}\n\n### **Title**\n- _Id:_ \`12345678\`\n\n${text}${trailing}`;
  const base = document("Inbox", "base", "\n\n");
  const current = document(section, body, separator);
  const first = (content: string) => splitEntryList(content, config).parts.find((part) => part.kind === "entry");
  const a = first(base), b = first(current);
  if (a === undefined || b === undefined) throw new Error("Fixture must contain an entry");
  expect(entryVersion(a) === entryVersion(b)).toBe(!survives);
  const merged = mergeEntryText({ record: RecordReferenceSchema.parse({ owner: { type: "project", name: "inbox" }, kind: "project-inbox/inbox" }),
    baseVersion: RecordVersionSchema.parse("record:fixture:base"), base, current, incoming: "", currentLabel: { actor: "current", time: "2026-01-01T00:00:00Z" }, incomingLabel: { actor: "incoming", time: "2026-01-01T00:00:00Z" } }, config);
  expect(first(merged.content) !== undefined).toBe(survives);
});
