/** Which module openings count as a file-level doc comment. */

import { describe, expect, it } from "vitest";
import { hasModuleDocComment } from "../../eslint/module-doc-comment.js";

describe("module doc comment detection", () => {
  it.each([
    ["a leading doc block", "/** Reads the value. */\n\nexport const value = 1;\n"],
    ["a multi-line doc block", "/**\n * Reads the value.\n */\nimport \"node:fs\";\n"],
    ["a doc block after a shebang", "#!/usr/bin/env node\n/** Runs the command. */\nexport const value = 1;\n"],
    ["a doc block after a line comment", "// @ts-check\n/** Reads the value. */\nexport const value = 1;\n"],
    ["a file holding only a doc block", "/** Reserved for the value reader. */\n"],
  ])("accepts %s", (_name, text) => {
    expect(hasModuleDocComment(text)).toBe(true);
  });

  it.each([
    ["an empty file", ""],
    ["no comment", "export const value = 1;\n"],
    ["only a line comment", "// Reads the value.\nexport const value = 1;\n"],
    ["only a plain block comment", "/* Reads the value. */\nexport const value = 1;\n"],
    ["an empty block comment", "/**/\nexport const value = 1;\n"],
    ["a doc block after the first statement", "import \"node:fs\";\n/** Reads the value. */\nexport const value = 1;\n"],
  ])("rejects %s", (_name, text) => {
    expect(hasModuleDocComment(text)).toBe(false);
  });
});
