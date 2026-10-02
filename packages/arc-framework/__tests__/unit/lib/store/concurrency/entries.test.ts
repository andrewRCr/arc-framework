/** Lossless splitting, parser correspondence, and managed identity stamping. */
import { describe, expect, it } from "vitest";
import { parseCrossWuEntries } from "../../../../../src/lib/user-sync/parser.js";
import { managedFieldValue } from "../../../../../src/lib/session-init/managed-field.js";
import { stampEntryIds } from "../../../../../src/lib/store/concurrency/stamp.js";
import { splitEntryList, rejoinEntryList, type EntryListConfig } from "../../../../../src/lib/store/concurrency/entries.js";

const heading: EntryListConfig = {shape:"heading",sections:["Errand","Work Unit"]};
const field: EntryListConfig = {shape:"field-header",sections:["Memories"]};
const headingText = '# Opening\r\n\r\n## Errand\r\n\r\n<!--\r\n### **hidden**\r\n-->\r\n\r\n### [ ] **First**\r\n\r\n- _Created:_ `2026-10-01`\r\n- _Id:_ `11111111`\r\n\r\nbody\r\n\r\n## Work Unit\r\n\r\n### **Second**\r\n\r\n- _Description:_ other\r\n\r\n---\r\nfooter';
const fieldText = '# Opening\n\n## Memories\n\n<!--\n**Hidden:**\n_Remove when:_ ignored\n-->\n\n**First:**\n_Remove when:_ condition\n\nbody\n\n**Second:**\n_Remove when:_ other\n\n---\nfooter\n';

describe("entry splitting", () => {
  it.each([[heading,headingText,"user-inbox"],[field,fieldText,"working-memory"]] as const)(
    "retains every byte and detects the same entries as the established parser for %j", (config,text,parserShape) => {
      const split = splitEntryList(text,config);
      expect(rejoinEntryList(split)).toBe(text);
      const entries = split.parts.filter((part) => part.kind === "entry");
      const parsed = parseCrossWuEntries(text,parserShape);
      expect(entries).toHaveLength(parsed.length);
      expect(entries.map((entry) => entry.section)).toEqual(parsed.flatMap((outcome) => outcome.ok ? [outcome.entry.section] : []));
      expect(entries.map((entry) => entry.bytes.replaceAll("\r\n","\n"))).toEqual(parsed.flatMap((outcome) => outcome.ok ? [outcome.entry.raw.replaceAll("\r\n","\n").trimEnd()] : []));
      expect(split.parts.some((part) => part.kind === "outside" && part.bytes.includes("hidden"))).toBe(config.shape === "heading");
    });
});


describe("managed ID stamping", () => {
  it.each([[heading,headingText],[field,fieldText]] as const)("adds only missing ID lines in managed-field positions for %j", (config,text) => {
    const stamped = stampEntryIds(text,config, (() => {let draw=0.5; return () => {const next=draw;draw+=0.25;return next;};})());
    const entries = splitEntryList(stamped,config).parts.filter((part) => part.kind === "entry");
    expect(entries.every((entry) => /^[0-9a-f]{8}$/.test(entry.id ?? ""))).toBe(true);
    expect(entries.every((entry) => managedFieldValue(entry.bytes,"Id") === entry.id)).toBe(true);
    const added = config.shape === "heading" ? '- _Id:_ `80000000`\r\n' : '_Id:_ `80000000`\n';
    expect(stamped.replaceAll(added, "").replaceAll("_Id:_ `c0000000`\n", "")).toBe(text);
    if (config.shape === "heading") {
      expect(stamped).toContain('- _Description:_ other\r\n- _Id:_ `80000000`');
      expect(entries[0]!.id).toBe("11111111");
    } else {
      expect(stamped).toContain('_Remove when:_ condition\n_Id:_ `80000000`');
    }
  });
});


it("redraws an ID collision against every existing identity in the file", () => {
  const text = '## Errand\n\n### **New**\n\nbody\n\n### **Existing**\n\n- _Id:_ `80000000`\n';
  const draws = [0.5,0.25];
  const stamped = stampEntryIds(text,heading,()=>draws.shift() ?? 0);
  const entries = splitEntryList(stamped,heading).parts.filter((part) => part.kind === "entry");
  expect(entries.map((entry) => entry.id)).toEqual(["40000000","80000000"]);
});


it("never rewrites an existing ID or consumes randomness for it", () => {
  const text = '## Errand\n\n### **Existing**\n\n- _Id:_ `1234abcd`\n';
  expect(stampEntryIds(text,heading,()=>{throw new Error("must not draw");})).toBe(text);
});

it("refuses a broken random source rather than hanging or emitting an invalid ID", () => {
  const text = '## Errand\n\n### **New**\n\n### **Existing**\n- _Id:_ `00000000`\n';
  expect(()=>stampEntryIds(text,heading,()=>0)).toThrow("distinct");
  expect(()=>stampEntryIds(text,heading,()=>Number.NaN)).toThrow("Random draw");
  expect(()=>stampEntryIds(text,heading,()=>1)).toThrow("Random draw");
});

it("adds an ID without normalizing mixed line endings or descriptor continuations", () => {
  const text = '## Errand\r\n\r\n### **Entry**\r\n\n- _Description:_ first\n  continued\r\n\nbody\n';
  const stamped = stampEntryIds(text,heading,()=>0.5);
  expect(stamped).toContain('  continued\r\n- _Id:_ `80000000`\r\n\nbody');
  expect(stamped.replace('- _Id:_ `80000000`\r\n', '')).toBe(text);
});
