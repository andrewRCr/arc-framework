/** Canonical core-table values and byte preservation through typed writers. */

import { describe, expect, it } from "vitest";
import { makeMetaFixture } from "../../../../../helpers/meta-fixture.js";
import { parseMetaRecord } from "../../../../../../src/lib/active/meta-reader.js";
import { SlugSchema } from "../../../../../../src/lib/kernel/schema/slug.js";
import {
  writeMetaState, writeMetaOwner, writeMetaBranch, writeMetaClass, writeMetaPriority,
} from "../../../../../../src/lib/store/kinds/meta/core-writers.js";

const original = makeMetaFixture("sample", {
  state: "Active", owner: "owner", branch: "feat/sample", workClass: "Heavy", priority: "P2",
}).replace("\n---", "\n## Session Context\n\nKeep `authored` prose.\n\n---")
  + "\n## Completion Notes\n\n| Narrative | table |\n| --- | --- |\n| Keep | exact |\n";

function outsideCoreTable(content: string): string {
  return content.replace(/^\|[^\n]*\n\|[^\n]*\n\|[^\n]*(?:\n|$)/mu, "<core table>\n");
}

const cases = [
  { key: "state", expected: "Planning", run: (content: string) => writeMetaState(content, "Planning") },
  { key: "owner", expected: "next-owner", run: (content: string) => writeMetaOwner(content, SlugSchema.parse("next-owner")) },
  { key: "branch", expected: "plan/sample", run: (content: string) => writeMetaBranch(content, "plan/sample") },
  { key: "workClass", expected: "Novel", run: (content: string) => writeMetaClass(content, "Novel") },
  { key: "priority", expected: "P1", run: (content: string) => writeMetaPriority(content, "P1") },
] as const;

describe("meta core writers", () => {
  it.each(cases)("writes $key canonically without touching other regions", ({ key, expected, run }) => {
    const result = run(original);
    expect(parseMetaRecord(result)[key]).toBe(expected);
    expect(result).toContain(`\`${expected}\``);
    expect(outsideCoreTable(result)).toBe(outsideCoreTable(original));
  });

  it("renders cleared Branch and unresolved Class and Priority as their sentinels", () => {
    const result = writeMetaPriority(writeMetaClass(writeMetaBranch(original, null), "TBD"), "TBD");
    const record = parseMetaRecord(result);
    expect(record.branch).toBeNull();
    expect(record.workClass).toBe("TBD");
    expect(record.priority).toBe("TBD");
    const table = result.match(/^\|[^\n]*\n\|[^\n]*\n\|[^\n]*/mu)?.[0];
    expect(table).toContain("[none]");
    expect(table).toContain("[TBD]");
    expect(table).not.toContain("`[TBD]`");
    expect(outsideCoreTable(result)).toBe(outsideCoreTable(original));
  });

  it("preserves CRLF endings and surrounding bytes", () => {
    const content = original.replace(/\n/gu, "\r\n");
    const result = writeMetaState(content, "Shipped");
    expect(parseMetaRecord(result).state).toBe("Shipped");
    expect(result.replace(/\r\n/gu, "")).not.toContain("\n");
    expect(outsideCoreTable(result)).toBe(outsideCoreTable(content));
  });
});
