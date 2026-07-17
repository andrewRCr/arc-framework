import { describe, it, expect } from "vitest";

import { renderMetaFile, parseMetaRecord, parseIdentifierList } from "../../../src/lib/active/meta-reader.js";
import { repointDependsOn } from "../../../src/lib/work-unit/decompose-sweep.js";

/** The `Depends On` edges parsed back out of a meta projection. */
function edgesOf(content: string): string[] {
  return parseIdentifierList(parseMetaRecord(content)["Depends On"]);
}

describe("repointDependsOn", () => {
  it("re-points a dependent on the origin to the single delivering member", () => {
    const content = renderMetaFile("dependent", { "Depends On": "origin, sibling-dep" });

    const out = repointDependsOn(content, "origin", ["member-a"]);

    expect(edgesOf(out)).toEqual(["member-a", "sibling-dep"]);
  });

  it("re-points to multiple members when the needed work split across several", () => {
    const content = renderMetaFile("dependent", { "Depends On": "origin, sibling-dep" });

    const out = repointDependsOn(content, "origin", ["member-a", "member-b"]);

    expect(edgesOf(out)).toEqual(["member-a", "member-b", "sibling-dep"]);
  });

  it("drops only the origin slot when the replacement set is empty", () => {
    const content = renderMetaFile("dependent", { "Depends On": "before, origin, after" });

    const out = repointDependsOn(content, "origin", []);

    expect(edgesOf(out)).toEqual(["before", "after"]);
  });

  it("collapses duplicates in first-occurrence order after slot replacement", () => {
    const content = renderMetaFile("dependent", { "Depends On": "member-b, origin, member-a, member-b" });

    const out = repointDependsOn(content, "origin", ["member-a", "member-b"]);

    expect(edgesOf(out)).toEqual(["member-b", "member-a"]);
  });

  it("preserves sibling edges and leaves every other line byte-stable", () => {
    const content = renderMetaFile("dependent", { "Depends On": "origin, sibling-dep" });

    const out = repointDependsOn(content, "origin", ["member-a"]);

    const inLines = content.split("\n");
    const outLines = out.split("\n");
    const changed = outLines.filter((line, i) => line !== inLines[i]);
    expect(outLines.length).toBe(inLines.length);
    expect(changed).toEqual(["- **Depends On:** `member-a`, `sibling-dep`"]);
  });

  it("is a no-op when the dependent does not name the origin", () => {
    const content = renderMetaFile("dependent", { "Depends On": "other-dep" });

    const out = repointDependsOn(content, "origin", ["member-a"]);

    expect(out).toBe(content);
  });
});
