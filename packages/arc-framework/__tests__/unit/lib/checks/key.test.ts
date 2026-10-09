/** Stable check identities derived from resolved declaration and tree content. */
import { expect, it } from "vitest";
import { CheckDeclarationSchema } from "../../../../src/lib/checks/declaration.js";
import { checkContentKey, type CheckKeyInput } from "../../../../src/lib/checks/key.js";

function input(): CheckKeyInput {
  const declaration = CheckDeclarationSchema.parse({ checks: { lint: { command: ["node", "lint.cjs"], gate: "commit" } } }).checks.lint;
  if (declaration === undefined) throw new Error("Missing resolved declaration");
  return { id: "lint", declaration, inputs: [{
    path: "src/a.ts", status: "A", oldMode: "000000", newMode: "100644", oldBlob: "0".repeat(40), newBlob: "a".repeat(40),
  }] };
}

it("repeats the same key for the same resolved entry and input content", () => {
  const first = input();
  const second = input();
  expect(checkContentKey(first)).toBe(checkContentKey(second));
});

it.each(["id", "declaration", "input path", "input blob", "input mode", "received paths"])("changes with %s", field => {
  const original = input();
  const changed = input();
  if (field === "id") changed.id = "another-lint";
  if (field === "declaration") changed.declaration = { ...changed.declaration, command: ["node", "other.cjs"] };
  if (field === "input path") changed.inputs = changed.inputs.map(entry => ({ ...entry, path: "src/b.ts" }));
  if (field === "input blob") changed.inputs = changed.inputs.map(entry => ({ ...entry, newBlob: "b".repeat(40) }));
  if (field === "input mode") changed.inputs = changed.inputs.map(entry => ({ ...entry, newMode: "100755" }));
  if (field === "received paths") changed.paths = ["src/a.ts"];
  expect(checkContentKey(changed)).not.toBe(checkContentKey(original));
});

it("digests tree entries independently of presentation order", () => {
  const first = input();
  first.inputs = [...first.inputs, { ...first.inputs[0]!, path: "src/b.ts" }];
  const second = { ...first, inputs: [...first.inputs].reverse() };
  expect(checkContentKey(first)).toBe(checkContentKey(second));
});
