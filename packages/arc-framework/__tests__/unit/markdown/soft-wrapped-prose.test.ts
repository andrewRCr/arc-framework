import { describe, expect, it } from "vitest";

import { indexOfSoftWrappedProse, softWrappedPattern, softWrappedProse } from "../../helpers/soft-wrapped-prose.js";

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

describe("soft-wrapped prose patterns", () => {
  it("keeps occurrence counts and case-insensitive matching across soft wraps", () => {
    const pattern = softWrappedPattern(/Every\s+selected\s+mode\s+emits/giu);
    const content = "EVERY selected\n  mode emits\n\nEvery selected\r\nmode emits";

    expect(content.match(pattern)).toHaveLength(2);
    expect("Every selected\n\nmode emits").not.toMatch(pattern);
    expect("Every selected\r\n  \r\nmode emits").not.toMatch(pattern);
  });

  it.each(["- ", "+ ", "* ", "1. ", "2) ", "## ", "> ", "``` ", "~~~ "])(
    "does not enter a Markdown block starting with %s",
    (marker) => {
      expect(`selected\n  ${marker}mode`).not.toMatch(
        softWrappedPattern(/selected\s+.*mode/u),
      );
    },
  );

  it.each(["## ", "> "])("does not leave a block starting with %s", (marker) => {
    expect(`Preamble\n  ${marker}selected\nmode`).not.toMatch(
      softWrappedPattern(/selected\s+mode/u),
    );
    expect(`Preamble\n  ${marker}first clause\n\nsecond instruction`).toMatch(
      softWrappedPattern(/first\s+clause[\s\S]*second\s+instruction/u),
    );
  });

  it("preserves explicit cross-section spans and alternative wording", () => {
    const pattern = softWrappedPattern(/first\s+clause[\s\S]*second\s+(?:clause|instruction)/iu);

    expect("first\nclause\n\n## Later\nsecond\r\n  instruction").toMatch(pattern);
    expect("first\n\nclause\n\nsecond clause").not.toMatch(pattern);
    expect("first clause\n\nsecond\n\ninstruction").not.toMatch(pattern);
  });

  it("retains literal command spaces and multiline anchors", () => {
    expect("arc review\n  after approval").toMatch(
      softWrappedPattern(/arc review\s+after\s+approval/u),
    );
    expect("arc\nreview after approval").not.toMatch(
      softWrappedPattern(/arc review\s+after\s+approval/u),
    );
    expect("Preamble\nmode\n  emits\nPostscript").toMatch(
      softWrappedPattern(/^mode\s+emits$/imu),
    );
  });
});
