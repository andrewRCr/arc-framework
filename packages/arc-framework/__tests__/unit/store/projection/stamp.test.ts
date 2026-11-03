/** A projected Markdown file's base stamp and notice lines. */
import { describe, expect, it } from "vitest";
import { parseStampedFile, renderStampedFile } from "../../../../src/lib/store/projection/stamp.js";

const stamp = "3".repeat(40);
const content = "# Metadata: Alpha\n\n- **Next Task:** Begin Task 1.1\n";

describe("the base stamp and notice lines", () => {
  it("parses a rendered file back to its stamp, its notice lines, and the stored content exactly", () => {
    const notices = ["conflict c1 is unresolved; run arc save --resolve", "this file is protected"];
    const rendered = renderStampedFile({ content, stamp, notices });
    expect(rendered).toBe(`<!-- arc-base: ${stamp} -->\n<!-- arc-notice: ${notices[0]} -->\n`
      + `<!-- arc-notice: ${notices[1]} -->\n${content}`);
    expect(parseStampedFile(rendered)).toEqual({ stamp, notices, content });
  });

  it.each([
    ["followed by a body", "---\npurpose: Example.\naudience: agent\n---\n\n# Workflow\n",
      `---\npurpose: Example.\naudience: agent\n---\n<!-- arc-base: ${stamp} -->\n\n# Workflow\n`],
    ["ending the file", "---\npurpose: Example.\n---", `---\npurpose: Example.\n---\n<!-- arc-base: ${stamp} -->`],
  ])("places the stamp after YAML frontmatter %s, and parses back with the frontmatter whole", (_case, stored, file) => {
    expect(renderStampedFile({ content: stored, stamp })).toBe(file);
    expect(parseStampedFile(file)).toEqual({ stamp, notices: [], content: stored });
  });

  it.each([
    ["holding no stamp", content],
    ["whose stamp is not its first line", `# Metadata: Alpha\n<!-- arc-base: ${stamp} -->\n`],
    ["whose stamp is not the line after its frontmatter", `---\na: 1\n---\n\n<!-- arc-base: ${stamp} -->\n`],
    ["whose stamp names no blob id", "<!-- arc-base: not-a-blob -->\nbody\n"],
  ])("reads a file %s as stampless, its content whole", (_case, text) => {
    expect(parseStampedFile(text)).toEqual({ stamp: null, notices: [], content: text });
  });

  it.each([
    ["a comment of their own", "<!-- my own note -->\n# Metadata: Alpha\n"],
    ["a notice-like comment spanning lines", "<!-- arc-notice: started here\nand ended here -->\nbody\n"],
  ])("keeps %s under the stamp as content", (_case, stored) => {
    const rendered = renderStampedFile({ content: stored, stamp, notices: ["this file is protected"] });
    expect(parseStampedFile(rendered)).toEqual({ stamp, notices: ["this file is protected"], content: stored });
  });

  it.each([
    ["a stamp that is no blob id", { stamp: "abc" }],
    ["a notice that closes the comment", { notices: ["ends --> early"] }],
    ["a notice spanning lines", { notices: ["two\nlines"] }],
  ])("refuses to render %s", (_case, change) => {
    expect(() => renderStampedFile({ content, stamp, ...change })).toThrow();
  });
});
