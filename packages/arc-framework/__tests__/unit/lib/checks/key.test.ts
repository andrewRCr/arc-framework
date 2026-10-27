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

it("includes captured explicit input identity without replacing existing scoped content", () => {
  const original = { ...input(), environmentIdentity: `sha256:${"a".repeat(64)}` };
  const changed = { ...original, environmentIdentity: `sha256:${"b".repeat(64)}` };
  expect(checkContentKey(changed)).not.toBe(checkContentKey(original));
  expect(checkContentKey({ ...original })).toBe(checkContentKey(original));
});

it("distinguishes scoped materialized bytes even when their canonical Git content is equal", () => {
  const original = { ...input(), materializedInputs: [{ path: "src/a.ts", entry: { path: "src/a.ts", kind: "file" as const,
    mode: 0o644, bytes: 4, digest: `sha256:${"a".repeat(64)}` as const } }] };
  const changed = { ...original, materializedInputs: original.materializedInputs.map(value => ({ ...value,
    entry: { ...value.entry, digest: `sha256:${"b".repeat(64)}` as const } })) };
  expect(checkContentKey(changed)).not.toBe(checkContentKey(original));
});

it("digests materialized entries independently of object property and inventory order", () => {
  const entry = { path: "src/a.ts", kind: "file" as const, mode: 0o644, bytes: 4, digest: `sha256:${"a".repeat(64)}` as const };
  const other = { path: "src/b.ts", kind: "symlink" as const, target: "a.ts" };
  const first = { ...input(), materializedInputs: [{ path: entry.path, entry }, { path: other.path, entry: other }] };
  const second = { ...input(), materializedInputs: [{ path: other.path, entry: { target: other.target, kind: other.kind, path: other.path } },
    { path: entry.path, entry: { digest: entry.digest, bytes: entry.bytes, mode: entry.mode, kind: entry.kind, path: entry.path } }] };
  expect(checkContentKey(first)).toBe(checkContentKey(second));
});

it.each(["identity", "global probe", "check probe"])("includes each prepared invocation's %s", field => {
  const original = { ...input(), preparedRuntime: [
    { identity: `sha256:${"a".repeat(64)}`, globalRuntime: [" global\r\n"], runtime: [" check\n"] },
    { identity: `sha256:${"a".repeat(64)}`, globalRuntime: [" global\r\n"], runtime: [" check\n"] },
  ] };
  const changed = { ...original, preparedRuntime: original.preparedRuntime.map(value => ({ ...value })) };
  const second = changed.preparedRuntime[1]!;
  if (field === "identity") second.identity = `sha256:${"b".repeat(64)}`;
  if (field === "global probe") second.globalRuntime = ["global\r\n"];
  if (field === "check probe") second.runtime = [" check\r\n"];
  expect(checkContentKey(changed)).not.toBe(checkContentKey(original));
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
