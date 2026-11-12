/**
 * Tests for the comparison form that lets a self-hosted method carry only an extending override.
 */

import { describe, expect, it } from "vitest";

import { shippedMethodForm } from "../../helpers/shipped-method-form.js";

function method(flags: string, overrideBody: string): string {
  return [
    "---", "name: example", "description: Example method", flags, "---", "", "# Method: example", "",
    "## example.override", "", overrideBody, "", "## example.default", "", "The shipped doctrine.", "",
  ].join("\n");
}

const SHIPPED = method("override-active: false", "[No override configured]");

describe("comparing a project method with its package source", () => {
  it("returns an extending override to the shipped form", () => {
    const extended = method("override-active: true\noverride-mode: extend", "A project rule.\n\nA second paragraph.");

    expect(shippedMethodForm(extended, "example")).toBe(SHIPPED);
  });

  it("leaves a replacing override unchanged, so the comparison still fails", () => {
    const replaced = method("override-active: true\noverride-mode: replace", "A project rule.");

    expect(shippedMethodForm(replaced, "example")).toBe(replaced);
  });

  it("leaves an edited default unchanged under an extending override", () => {
    const edited = method("override-active: true\noverride-mode: extend", "A project rule.")
      .replace("The shipped doctrine.", "An edited doctrine.");

    expect(shippedMethodForm(edited, "example")).not.toBe(SHIPPED);
  });
});
