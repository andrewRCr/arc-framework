/** Provider-slot substitution preserves unrelated order and deduplicates by first occurrence. */
import { expect, it } from "vitest";
import { replaceDependencySlot } from "../../../../src/lib/decompose/dependency-slot.js";

it.each([
  { current: ["before", "origin", "after"], replacements: ["after", "new"], expected: ["before", "after", "new"] },
  { current: ["before", "former-origin", "middle", "origin", "after"], replacements: [], expected: ["before", "middle", "after"] },
  { current: ["before", "after"], replacements: ["new"], expected: ["before", "after"] },
])("substitutes $current with $replacements without mutating its input", ({ current, replacements, expected }) => {
  const original = [...current];
  expect(replaceDependencySlot(current, new Set(["origin", "former-origin"]), replacements)).toEqual(expected);
  expect(current).toEqual(original);
});
