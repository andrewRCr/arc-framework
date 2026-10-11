/** Legacy metadata editing contracts over the typed field writers. */

import { describe, expect, it } from "vitest";
import {
  normalizeMetaCoreTable, setMetaBranch, setMetaClass, setMetaState, setMetaTitle,
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
