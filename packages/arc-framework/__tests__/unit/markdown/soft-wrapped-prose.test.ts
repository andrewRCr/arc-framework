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

  it("keeps Markdown and command punctuation literal", () => {
    expect("Apply `arc review`\n  after approval").toMatch(
      softWrappedProse("Apply `arc review` after approval"),
    );
    expect("Apply arc review\n  after approval").not.toMatch(
      softWrappedProse("Apply `arc review` after approval"),
    );
    expect(() => softWrappedProse(" \t ")).toThrow("prose assertion must not be empty");
  });
});
