/** Legacy metadata editing contracts over the typed field writers. */

import { describe, expect, it } from "vitest";
import {
  normalizeMetaCoreTable, setMetaBranch, setMetaClass, setMetaState, setMetaTitle,
  setMetaBulletFields, setMetaCurrentWorkflow, setMetaDesign, parseMetaRecord,
} from "../../../src/lib/active/meta-reader.js";
import { makeMetaFixture } from "../../helpers/meta-fixture.js";

const setters = [
  ["State", (content: string) => setMetaState(content, "Planning")],
  ["Branch", (content: string) => setMetaBranch(content, "plan/example")],
  ["Class", (content: string) => setMetaClass(content, "Heavy")],
  ["Title", (content: string) => setMetaTitle(content, "renamed")],
  ["Normalization", normalizeMetaCoreTable],
] as const;

describe("metadata setter anchors", () => {
  it.each(setters)("%s refuses metadata without its closing rule", (_name, set) => {
    const content = makeMetaFixture("example").replace(/\n---\n$/u, "\n");
    expect(() => set(content)).toThrow(/closing.*---/iu);
  });

  it.each(setters.filter(([name]) => name !== "Title"))(
    "%s refuses metadata without its heading", (_name, set) => {
      const content = makeMetaFixture("example").replace(/^# Metadata: example\n/u, "");
      expect(() => set(content)).toThrow(/H1/iu);
    },
  );
});

describe("legacy bullet setter rendering", () => {
  const first = `foundation-${"a".repeat(60)}`;
  const second = `application-${"b".repeat(60)}`;

  it.each([
    ["Depends On", (content: string) => setMetaBulletFields(content, {
      "Depends On": `\`${first}\`, \`${second}\``,
    })],
    ["Design", (content: string) => setMetaBulletFields(content, {
      Design: `\`${first}.md\`, \`${second}.md\``,
    })],
    ["Design", (content: string) => setMetaDesign(content, `${first}.md, ${second}.md`)],
  ] as const)("wraps %s lists within the bullet width", (field, set) => {
    const written = set(makeMetaFixture("example"));
    const lines = written.split("\n");
    const index = lines.findIndex((line) => line.startsWith(`- **${field}:**`));
    expect(lines[index + 1]).toMatch(/^ {2}`/u);
    expect(lines[index]?.length).toBeLessThanOrEqual(120);
    expect(lines[index + 1]?.length).toBeLessThanOrEqual(120);
    expect(parseMetaRecord(written)[field === "Design" ? "design" : "dependsOn"])
      .toEqual(field === "Design" ? [`${first}.md`, `${second}.md`] : [first, second]);
  });

  it("renders a cleared directive as an em dash", () => {
    const written = setMetaBulletFields(makeMetaFixture("example"), { "Next Action": "[none]" });
    expect(written).toContain("- **Next Action:** —\n");
    expect(parseMetaRecord(written).nextAction).toBeNull();
  });

  it.each([
    ["generic", (content: string) => setMetaBulletFields(content, { "Next Action": "Continue." })],
    ["workflow", (content: string) => setMetaCurrentWorkflow(content, "create-spec")],
    ["design", (content: string) => setMetaDesign(content, "spec-example.md")],
  ] as const)("%s refuses an unanchored field block", (_name, set) => {
    expect(() => set(makeMetaFixture("example").replace(/\n---\n$/u, "\n"))).toThrow(/closing.*---/iu);
  });
});
