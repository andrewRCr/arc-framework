/** Unit coverage for validated template binding output paths. */

import { describe, expect, expectTypeOf, it } from "vitest";

import {
  LayoutError,
  TEMPLATE_BINDING_SUFFIX,
  resolveTemplateOutputBindings,
  resolveTemplateOutputPath,
  type TemplateOutputPath,
} from "../../../src/lib/layout/index.js";

describe("resolveTemplateOutputPath", () => {
  it.each([
    ["file.template.md", "file.md"],
    ["nested/file.template.json", "nested/file.json"],
    ["nested/file.template.md.extra", "nested/file.md.extra"],
    ["file.template", "file.template"],
    ["nested/plain.md", "nested/plain.md"],
  ])("preserves the binding transform for %s", (input, expected) => {
    const output = resolveTemplateOutputPath(input);
    expect(output).toBe(expected);
    expectTypeOf(output).toEqualTypeOf<TemplateOutputPath>();
  });

  it("exports the stable binding suffix", () => {
    expect(TEMPLATE_BINDING_SUFFIX).toBe(".template");
  });

  it.each(["", "/absolute", "C:/drive", "a\\b", "a//b", "a/../b", "a\0b", "e\u0301.md"])(
    "rejects unsafe source path %s with its validation cause",
    (input) => {
      let thrown: unknown;
      try {
        resolveTemplateOutputPath(input);
      } catch (error) {
        thrown = error;
      }
      expect(thrown).toBeInstanceOf(LayoutError);
      expect(thrown).toMatchObject({ code: "layout.invalid-template-path" });
      expect((thrown as Error).cause).toBeDefined();
    },
  );
});

describe("resolveTemplateOutputBindings", () => {
  it("returns validated source-to-output bindings", () => {
    expect(resolveTemplateOutputBindings(["nested/plain.md", "nested/rendered.template.md"]))
      .toEqual([
        { templatePath: "nested/plain.md", outputPath: "nested/plain.md" },
        { templatePath: "nested/rendered.template.md", outputPath: "nested/rendered.md" },
      ]);
  });

  it("rejects two template sources that transform to the same output path", () => {
    expect(() => resolveTemplateOutputBindings(["nested/file.md", "nested/file.template.md"]))
      .toThrow(expect.objectContaining({ code: "layout.invalid-template-path" }));
  });
});
