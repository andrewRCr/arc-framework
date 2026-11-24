/** How much of a design document the Purpose reader hands to the Markdown parser. */
import { beforeEach, describe, expect, it, vi } from "vitest";

const parsed: number[] = [];
vi.mock("mdast-util-from-markdown", async (importOriginal) => {
  const actual = await importOriginal<typeof import("mdast-util-from-markdown")>();
  return { ...actual, fromMarkdown: (content: string) => { parsed.push(content.length); return actual.fromMarkdown(content); } };
});

const { readDesignPurpose } = await import("../../../../../../src/lib/store/kinds/design/index.js");
const body = "A paragraph of design text with `code` and a [link](target).\n\n".repeat(2000);

describe("design Purpose reader cost", () => {
  beforeEach(() => { parsed.length = 0; });

  it("parses only the field's own block when the field opens a long document", () => {
    expect(readDesignPurpose(`# Design\n\n**Purpose:** A thesis.\n\n${body}`)).toBe("A thesis.");
    expect(Math.max(...parsed)).toBeLessThan(200);
  });

  it("parses nothing when a long document holds no field", () => {
    expect(readDesignPurpose(`# Design\n\n${body}`)).toBeNull();
    expect(parsed).toEqual([]);
  });

  it("parses nothing for field text that opens no line", () => {
    expect(readDesignPurpose(`# Design\n\nSee the **Purpose:** field.\n\n${body}`)).toBeNull();
    expect(parsed).toEqual([]);
  });
});
