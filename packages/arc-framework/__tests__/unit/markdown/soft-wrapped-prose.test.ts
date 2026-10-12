import { describe, expect, it } from "vitest";

import { indexOfSoftWrappedProse, softWrappedProse } from "../../helpers/soft-wrapped-prose.js";

describe("soft-wrapped Markdown prose assertions", () => {
  it("accepts a soft wrap while keeping paragraph boundaries meaningful", () => {
    const phrase = "no indexed or working-tree diff";
    const reflowed = "Before: no indexed or\n  working-tree diff.";

    expect(reflowed).not.toContain(phrase);
    expect(reflowed).toMatch(softWrappedProse(phrase));
    expect(indexOfSoftWrappedProse(reflowed, phrase)).toBe(8);
    expect("> no indexed or\n> working-tree diff").toMatch(softWrappedProse(phrase));
    expect("no indexed or\n\nworking-tree diff").not.toMatch(softWrappedProse(phrase));
  });

  it("locates a later prose anchor without losing its original quote context", () => {
    const phrase = "approval authorizes merge";
    const document = "approval authorizes merge\n\n> approval\n> authorizes merge";
    const later = document.indexOf("> approval") + 2;

    expect(indexOfSoftWrappedProse(document, phrase, later)).toBe(later);
    expect(indexOfSoftWrappedProse(document, phrase, later + 1)).toBe(-1);
    expect(indexOfSoftWrappedProse(document, "absent wording", later)).toBe(-1);
  });

  it("retains heading and blockquote boundaries when searching after an offset", () => {
    const phrase = "approval authorizes merge";
    const heading = "## approval authorizes merge\n\n> approval\n> authorizes merge";
    expect(indexOfSoftWrappedProse(heading, phrase, 3)).toBe(heading.indexOf("> approval") + 2);
    expect(indexOfSoftWrappedProse(">> approval\n> authorizes merge", phrase, 3)).toBe(-1);
  });

  it("keeps Markdown and command punctuation literal", () => {
    expect("Apply `arc review`\n  after approval").toMatch(
      softWrappedProse("Apply `arc review` after approval"),
    );
    expect("Apply arc review\n  after approval").not.toMatch(
      softWrappedProse("Apply `arc review` after approval"),
    );
    expect(() => softWrappedProse(" \t ")).toThrow("prose assertion must not be empty");
  });

  it("does not match across a blockquote boundary", () => {
    const phrase = "approval authorizes merge";
    const matcher = softWrappedProse(phrase);

    expect("approval\nauthorizes merge").toMatch(matcher);
    expect("> approval\n> authorizes merge").toMatch(matcher);
    expect("approval\n> authorizes merge").not.toMatch(matcher);
    expect("> approval\nauthorizes merge").not.toMatch(matcher);
    expect(">> approval\n> authorizes merge").not.toMatch(matcher);
    expect("- item\n  > approval\n  > authorizes merge").toMatch(matcher);
    expect("- item\n  > approval\n> authorizes merge").not.toMatch(matcher);
  });

  it("does not match from an ATX heading into following prose", () => {
    const matcher = softWrappedProse("approval authorizes merge");

    expect("## approval\nauthorizes merge").not.toMatch(matcher);
    expect("> ## approval\n> authorizes merge").not.toMatch(matcher);
    expect("- item\n  > ## approval\n  > authorizes merge").not.toMatch(matcher);
  });
});
